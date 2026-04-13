shader_type canvas_item;

// Grid dimensions
uniform int grid_cols;
uniform int grid_rows;
uniform vec2 cell_size; // pixel size of each cell
uniform vec2 grid_pixel_size; // total pixel size of the grid area

// Data textures (each pixel = one cell)
// R = glyph index (0-255), G = fg.r, B = fg.g, A = fg.b
uniform sampler2D cell_data : filter_nearest, repeat_disable;
// R = bg.r, G = bg.g, B = bg.b, A = unused
uniform sampler2D cell_bg : filter_nearest, repeat_disable;

// Per-cell height for the lighting/shadow pass. R8, 128 = ground level.
// Linear filtering softens shadow edges slightly across cell boundaries
// (the stepping is cell-sized, but the interpolation avoids hard aliasing).
uniform sampler2D cell_height : filter_linear, repeat_disable;

// Glyph atlas (white on transparent, 16x16 grid of glyphs)
uniform sampler2D glyph_atlas : filter_nearest, repeat_disable;
uniform int atlas_cols; // 16
uniform int atlas_rows; // 16

// ── Lighting uniforms ──────────────────────────────
// All driven per-frame by AsciiGrid.set_lighting_uniforms() from TimeMgr.
// Both dirs point TOWARD the light in screen space (y-down). 0° = top.
uniform vec2  sun_dir        = vec2(0.0, -1.0);
uniform vec3  sun_color      : source_color = vec3(1.00, 0.96, 0.82);
uniform float sun_intensity  = 0.0;
uniform vec2  moon_dir       = vec2(0.0,  1.0);
uniform vec3  moon_color     : source_color = vec3(0.55, 0.68, 0.95);
uniform float moon_intensity = 0.0;
uniform vec3  ambient_day    : source_color = vec3(0.55, 0.55, 0.60);
uniform vec3  ambient_night  : source_color = vec3(0.06, 0.08, 0.16);
uniform float day_factor     = 1.0; // 0=night, 1=noon

// Shadow / god-ray tuning (cheap constants, safe to tweak in the editor).
uniform float height_scale    = 1.0;   // world units → shadow-slope units
uniform int   shadow_steps    = 12;    // max cells the ray marches
uniform float shadow_slope    = 0.28;  // ray rise per cell step (sun elevation)
uniform float shadow_strength = 0.70;  // 0 = no shadow, 1 = pitch black
uniform float godray_strength = 0.35;
uniform int   godray_steps    = 8;

// FUTURE(per-cell-font): see comment block kept below for the font-array
// migration path. The current lighting work doesn't conflict with it.
// FontAtlasCache.pack_array(font_names, size) -> Texture2DArray would
// assemble the array from the existing per-font baked PNGs.

float sample_h(vec2 uv) {
	// R8 texture, 0.5 = ground (byte 128). Remap to signed ~[-1, 1].
	return texture(cell_height, uv).r * 2.0 - 1.0;
}

// Ray-march toward `dir` checking whether an occluder rises above the
// ray's expected height. Returns 1.0 if occluded, 0.0 otherwise. Stepping
// by cells (not pixels) keeps the tap count at `steps` regardless of
// cell/pixel ratio.
float trace_shadow(vec2 origin_uv, float h_self, vec2 dir, int steps) {
	vec2 step_uv = dir / vec2(float(grid_cols), float(grid_rows));
	for (int i = 1; i <= steps; i++) {
		vec2 suv = origin_uv + step_uv * float(i);
		if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) {
			break;
		}
		float hs = sample_h(suv) * height_scale;
		float ray_h = h_self + float(i) * shadow_slope;
		if (hs > ray_h) {
			return 1.0;
		}
	}
	return 0.0;
}

void fragment() {
	// Convert UV to pixel position within this rect
	vec2 pixel_pos = UV * grid_pixel_size;

	// Which grid cell?
	int cell_x = clamp(int(floor(pixel_pos.x / cell_size.x)), 0, grid_cols - 1);
	int cell_y = clamp(int(floor(pixel_pos.y / cell_size.y)), 0, grid_rows - 1);

	// Sample data textures (center of texel to avoid filtering artifacts)
	vec2 data_uv = (vec2(float(cell_x), float(cell_y)) + 0.5) / vec2(float(grid_cols), float(grid_rows));
	vec4 data = texture(cell_data, data_uv);
	vec4 bg_data = texture(cell_bg, data_uv);

	// Decode glyph index from red channel
	int glyph_index = int(data.r * 255.0 + 0.5);
	vec3 fg_color = data.gba;
	vec3 bg_color = bg_data.rgb;

	// Position within the cell (0..1)
	vec2 in_cell = vec2(
		(pixel_pos.x - float(cell_x) * cell_size.x) / cell_size.x,
		(pixel_pos.y - float(cell_y) * cell_size.y) / cell_size.y
	);

	// Look up glyph in atlas
	int atlas_x = glyph_index % atlas_cols;
	int atlas_y = glyph_index / atlas_cols;
	vec2 atlas_uv = (vec2(float(atlas_x), float(atlas_y)) + in_cell) / vec2(float(atlas_cols), float(atlas_rows));

	float glyph_alpha = texture(glyph_atlas, atlas_uv).a;

	// Composite: bg behind, fg where glyph has coverage
	vec3 base_color = mix(bg_color, fg_color, glyph_alpha);

	// ── Lighting pass ─────────────────────────────
	// Short-circuits cleanly when sun_intensity and moon_intensity are
	// both 0 (the default for the text layer and for any screen that
	// doesn't feed heights), degenerating to `base_color * 1.0`.
	vec3 lit_color = base_color;
	bool lit_enabled = (sun_intensity > 0.001 || moon_intensity > 0.001 || day_factor < 0.999);
	if (lit_enabled) {
		float h_self = sample_h(data_uv) * height_scale;

		float sun_occ = 0.0;
		if (sun_intensity > 0.01) {
			sun_occ = trace_shadow(data_uv, h_self, sun_dir, shadow_steps);
		}
		float moon_occ = 0.0;
		if (moon_intensity > 0.02) {
			moon_occ = trace_shadow(data_uv, h_self, moon_dir, shadow_steps / 2);
		}

		// God rays: march TOWARD the sun counting cells of clear path,
		// modulated by a screen-space hash so adjacent fragments form
		// visible dithered beams instead of a flat glow.
		float godray = 0.0;
		if (sun_intensity > 0.05 && godray_strength > 0.0) {
			vec2 step_uv = sun_dir / vec2(float(grid_cols), float(grid_rows));
			float clear = 0.0;
			for (int i = 1; i <= godray_steps; i++) {
				vec2 suv = data_uv + step_uv * float(i);
				if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) {
					break;
				}
				float hs = sample_h(suv) * height_scale;
				if (hs > h_self + 0.5) {
					break;
				}
				clear += 1.0;
			}
			float hash = fract(sin(dot(floor(pixel_pos / 2.0),
					vec2(12.9898, 78.233))) * 43758.5453);
			godray = (clear / float(godray_steps))
					* godray_strength
					* step(0.55, hash)
					* sun_intensity;
		}

		vec3 ambient = mix(ambient_night, ambient_day, day_factor);
		vec3 sun_term  = sun_color  * sun_intensity  * (1.0 - sun_occ  * shadow_strength);
		vec3 moon_term = moon_color * moon_intensity * (1.0 - moon_occ * shadow_strength);
		vec3 light = ambient + sun_term + moon_term;

		lit_color = base_color * light + sun_color * godray;
		lit_color = min(lit_color, vec3(1.25));
	}

	// If cell is empty (glyph 0 = space, no glyph coverage) and bg is default black,
	// output transparent so layers below (e.g. fire) show through.
	bool is_default = (glyph_index == 0 && bg_color.r < 0.01 && bg_color.g < 0.01 && bg_color.b < 0.01);
	float cell_alpha = is_default ? 0.0 : 1.0;

	COLOR = vec4(lit_color, cell_alpha);
}
