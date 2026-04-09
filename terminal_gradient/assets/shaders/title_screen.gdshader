shader_type canvas_item;

// Standard grid uniforms (set by AsciiGrid.set_gfx_shader)
uniform int grid_cols;
uniform int grid_rows;
uniform vec2 cell_size;
uniform vec2 grid_pixel_size;

// Glyph atlas (for fire characters)
uniform sampler2D glyph_atlas : filter_nearest, repeat_disable;
uniform int atlas_cols;
uniform int atlas_rows;

// Fire uniforms
uniform int fire_glyphs[8];
uniform vec2 seeds[10];
uniform float time;

// Merkabah 3D SubViewport texture
uniform sampler2D merkabah_texture : filter_nearest, repeat_disable;
uniform vec4 merkabah_rect;      // x, y, width, height in UV space (0..1)
uniform vec2 mini_cell_size;     // pixel size of each merkabah mini-cell
uniform float merkabah_threshold; // alpha threshold for lit pixels

// Logo texture
uniform sampler2D logo_texture : filter_nearest, repeat_disable;
uniform vec4 logo_rect;          // x, y, width, height in UV space (0..1)

// 8x8 Bayer dithering matrix (normalized 0..1)
const float BAYER_8x8[64] = {
	 0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
	48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
	12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
	60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
	 3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
	51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
	15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
	63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0
};

// Quantize a color channel to N levels with Bayer dithering
float dither_channel(float val, float levels, float threshold) {
	float step = 1.0 / (levels - 1.0);
	float lo = floor(val / step) * step;
	float hi = lo + step;
	float frac = (val - lo) / step;
	return (frac > threshold) ? hi : lo;
}

// Apply 8x8x8 Bayer dithering (8 levels per RGB channel)
vec3 bayer_dither_8(vec3 color, vec2 pixel_pos) {
	int bx = int(mod(pixel_pos.x, 8.0));
	int by = int(mod(pixel_pos.y, 8.0));
	float threshold = BAYER_8x8[by * 8 + bx];
	return vec3(
		dither_channel(color.r, 8.0, threshold),
		dither_channel(color.g, 8.0, threshold),
		dither_channel(color.b, 8.0, threshold)
	);
}

// Dark grey-blue-purple color tables
const vec3 FIRE_FG[7] = {
	vec3(0.15, 0.13, 0.22),
	vec3(0.20, 0.17, 0.30),
	vec3(0.25, 0.22, 0.38),
	vec3(0.30, 0.27, 0.45),
	vec3(0.35, 0.30, 0.50),
	vec3(0.40, 0.35, 0.55),
	vec3(0.48, 0.42, 0.62)
};

const vec3 FIRE_BG[6] = {
	vec3(0.03, 0.02, 0.06),
	vec3(0.05, 0.04, 0.10),
	vec3(0.07, 0.06, 0.14),
	vec3(0.09, 0.07, 0.17),
	vec3(0.11, 0.09, 0.20),
	vec3(0.13, 0.11, 0.24)
};

void fragment() {
	vec2 pixel_pos = UV * grid_pixel_size;
	vec4 final_color = vec4(0.0);
	bool resolved = false;

	// ── Layer Z-1: Logo (topmost) ──
	if (!resolved && logo_rect.z > 0.0) {
		vec2 logo_uv = (UV - logo_rect.xy) / logo_rect.zw;
		if (logo_uv.x >= 0.0 && logo_uv.x <= 1.0 && logo_uv.y >= 0.0 && logo_uv.y <= 1.0) {
			vec4 logo_sample = texture(logo_texture, logo_uv);
			if (logo_sample.a > 0.5) {
				vec3 dithered_logo = bayer_dither_8(logo_sample.rgb, pixel_pos);
				final_color = vec4(dithered_logo, 1.0);
				resolved = true;
			}
		}
	}

	// ── Layer Z-2: Merkabah (middle) ──
	if (!resolved && merkabah_rect.z > 0.0 && mini_cell_size.x > 0.0) {
		// Quantize pixel position to mini-cell grid
		vec2 mini_cell_idx = floor(pixel_pos / mini_cell_size);
		vec2 mini_cell_center = (mini_cell_idx + 0.5) * mini_cell_size;

		// Map mini-cell center to merkabah UV space
		vec2 merk_uv = (mini_cell_center / grid_pixel_size - merkabah_rect.xy) / merkabah_rect.zw;

		if (merk_uv.x >= 0.0 && merk_uv.x <= 1.0 && merk_uv.y >= 0.0 && merk_uv.y <= 1.0) {
			vec4 merk_sample = texture(merkabah_texture, merk_uv);
			if (merk_sample.a > merkabah_threshold) {
				// Apply 8x8x8 Bayer dithering at mini-cell resolution
				vec3 dithered = bayer_dither_8(merk_sample.rgb, mini_cell_idx);
				final_color = vec4(dithered, 1.0);
				resolved = true;
			}
		}
	}

	// ── Layer Z-3: Fire (background) ──
	if (!resolved) {
		int cell_x = clamp(int(floor(pixel_pos.x / cell_size.x)), 0, grid_cols - 1);
		int cell_y = clamp(int(floor(pixel_pos.y / cell_size.y)), 0, grid_rows - 1);
		float cx = float(cell_x) + 0.5;
		float cy = float(cell_y) + 0.5;

		// Voronoi cell noise
		float min_dist = 99999.0;
		float second_dist = 99999.0;
		for (int s = 0; s < 10; s++) {
			float dx = cx - seeds[s].x;
			float dy = (cy - seeds[s].y) * 2.0;
			float d = sqrt(dx * dx + dy * dy);
			if (d < min_dist) {
				second_dist = min_dist;
				min_dist = d;
			} else if (d < second_dist) {
				second_dist = d;
			}
		}

		float edge = second_dist - min_dist;
		float pulse_v = sin(min_dist * 0.15 - time * 1.8) * 0.5 + 0.5;
		float edge_pulse = sin(edge * 0.5 - time * 1.2) * 0.5 + 0.5;
		float val = pulse_v * 0.6 + edge_pulse * 0.4;

		int ci = clamp(int(val * 8.0), 0, 7);
		int fi = clamp(int((val * 0.7 + edge * 0.02) * 7.0), 0, 6);
		int bi = clamp(int(val * 6.0), 0, 5);

		int glyph_index = fire_glyphs[ci];
		vec3 fg_color = FIRE_FG[fi];
		vec3 bg_color = FIRE_BG[bi];

		// Sample glyph from atlas
		vec2 in_cell = vec2(
			(pixel_pos.x - float(cell_x) * cell_size.x) / cell_size.x,
			(pixel_pos.y - float(cell_y) * cell_size.y) / cell_size.y
		);
		int ax = glyph_index % atlas_cols;
		int ay = glyph_index / atlas_cols;
		vec2 atlas_uv = (vec2(float(ax), float(ay)) + in_cell) / vec2(float(atlas_cols), float(atlas_rows));
		float ga = texture(glyph_atlas, atlas_uv).a;

		final_color = vec4(mix(bg_color, fg_color, ga), 1.0);
	}

	COLOR = final_color;
}
