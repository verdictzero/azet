shader_type canvas_item;

#include "res://assets/shaders/dither.gdshaderinc"

// Viewport pixel dimensions
uniform vec2 grid_pixel_size;

// ── Raster image grid: fullblock 1:2 cells ──
uniform vec2 block_size;

// ── Fire grid: font glyph cells ──
uniform int grid_cols;
uniform int grid_rows;
uniform vec2 cell_size;

// Glyph atlas (for fire characters)
uniform sampler2D glyph_atlas : filter_nearest, repeat_disable;
uniform int atlas_cols;
uniform int atlas_rows;
uniform int fire_glyphs[8];

// Fire animation
uniform vec2 seeds[10];
uniform float time;

// Sefirot image
uniform sampler2D sefirot_texture : filter_linear, repeat_disable;
uniform vec4 sefirot_rect;  // UV-space: x, y, w, h

// Logo image
uniform sampler2D logo_texture : filter_linear, repeat_disable;
uniform vec4 logo_rect;

// Golden wash applied to everything except the logo
uniform vec3 tint_color = vec3(0.96, 0.79, 0.45);
uniform float tint_strength : hint_range(0.0, 1.0) = 0.55;

// Particle layer rendered into a SubViewport at block resolution
// (see title_particles.gdshader). Sampled with nearest filter so each
// block reads exactly one source texel — no blurring across block edges.
uniform sampler2D particle_buffer : filter_nearest, repeat_disable;

// Fire palette — dark grey-blue-purple
const vec3 FIRE_FG[7] = {
	vec3(0.07, 0.06, 0.11), vec3(0.10, 0.08, 0.15),
	vec3(0.12, 0.11, 0.19), vec3(0.15, 0.13, 0.22),
	vec3(0.17, 0.15, 0.25), vec3(0.20, 0.17, 0.28),
	vec3(0.24, 0.21, 0.31)
};

const vec3 FIRE_BG[6] = {
	vec3(0.01, 0.01, 0.03), vec3(0.02, 0.02, 0.05),
	vec3(0.03, 0.03, 0.07), vec3(0.05, 0.04, 0.09),
	vec3(0.06, 0.05, 0.10), vec3(0.07, 0.06, 0.12)
};

void fragment() {
	vec2 px = UV * grid_pixel_size;

	// ── Block grid for raster images (1:2 fullblock cells) ──
	vec2 blk = floor(px / block_size);
	vec2 blk_center_uv = (blk + 0.5) * block_size / grid_pixel_size;

	vec4 out_color = vec4(0.0);
	bool hit = false;
	bool logo_hit = false;

	// ── Z-1: Logo (fullblock + dither12) ──
	if (logo_rect.z > 0.0) {
		vec2 luv = (blk_center_uv - logo_rect.xy) / logo_rect.zw;
		if (luv.x >= 0.0 && luv.x <= 1.0 && luv.y >= 0.0 && luv.y <= 1.0) {
			vec4 s = texture(logo_texture, luv);
			if (s.a > 0.5) {
				out_color = vec4(dither12(s.rgb, blk), 1.0);
				hit = true;
				logo_hit = true;
			}
		}
	}

	// ── Z-2: Sefirot (behind logo, fullblock + dither12) ──
	if (!hit && sefirot_rect.z > 0.0) {
		vec2 suv = (blk_center_uv - sefirot_rect.xy) / sefirot_rect.zw;
		if (suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0) {
			vec4 s = texture(sefirot_texture, suv);
			if (s.a > 0.5) {
				// Desaturate to luminance so the global gold wash takes hold
				float slum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
				out_color = vec4(dither12(vec3(slum), blk), 1.0);
				hit = true;
			}
		}
	}

	// ── Z-3: Fire background (glyph-atlas ASCII rendering) ──
	if (!hit) {
		int cell_x = clamp(int(floor(px.x / cell_size.x)), 0, grid_cols - 1);
		int cell_y = clamp(int(floor(px.y / cell_size.y)), 0, grid_rows - 1);
		float cx = float(cell_x) + 0.5;
		float cy = float(cell_y) + 0.5;

		// Voronoi cell noise
		float min_d = 99999.0;
		float sec_d = 99999.0;
		for (int i = 0; i < 10; i++) {
			float dx = cx - seeds[i].x;
			float dy = (cy - seeds[i].y) * 2.0;
			float d = sqrt(dx * dx + dy * dy);
			if (d < min_d) { sec_d = min_d; min_d = d; }
			else if (d < sec_d) { sec_d = d; }
		}

		float edge = sec_d - min_d;
		float pv = sin(min_d * 0.15 - time * 1.8) * 0.5 + 0.5;
		float ep = sin(edge * 0.5 - time * 1.2) * 0.5 + 0.5;
		float val = pv * 0.6 + ep * 0.4;

		int ci = clamp(int(val * 8.0), 0, 7);
		int fi = clamp(int((val * 0.7 + edge * 0.02) * 7.0), 0, 6);
		int bi = clamp(int(val * 6.0), 0, 5);

		int glyph_index = fire_glyphs[ci];
		vec3 fg_color = FIRE_FG[fi];
		vec3 bg_color = FIRE_BG[bi];

		// Sample glyph from atlas
		vec2 in_cell = vec2(
			(px.x - float(cell_x) * cell_size.x) / cell_size.x,
			(px.y - float(cell_y) * cell_size.y) / cell_size.y
		);
		int ax = glyph_index % atlas_cols;
		int ay = glyph_index / atlas_cols;
		vec2 atlas_uv = (vec2(float(ax), float(ay)) + in_cell) / vec2(float(atlas_cols), float(atlas_rows));
		float ga = texture(glyph_atlas, atlas_uv).a;

		out_color = vec4(mix(bg_color, fg_color, ga), 1.0);

		// ── Z-2.5: Particles drifting up, in front of fire, behind sefirot/logo ──
		// Computed by title_particles.gdshader into a block-resolution
		// SubViewport. With nearest filtering at blk_center_uv, each block
		// reads the texel that corresponds to its own center sample.
		vec4 p = texture(particle_buffer, blk_center_uv);
		if (p.a > 0.0) {
			// Desaturate to luminance so the global gold wash can re-tint
			// these — the saturated violet palette would otherwise resist
			// the mix and read as purple through the wash.
			vec3 raw = p.rgb / max(p.a, 1e-4);
			float plum = dot(raw, vec3(0.299, 0.587, 0.114));
			vec3 dithered = dither12(vec3(plum), blk);
			out_color.rgb = mix(out_color.rgb, dithered, p.a);
		}
	}

	if (!logo_hit) {
		float lum = dot(out_color.rgb, vec3(0.299, 0.587, 0.114));
		vec3 tinted = lum * tint_color;
		out_color.rgb = mix(out_color.rgb, tinted, tint_strength);
	}

	COLOR = out_color;
}
