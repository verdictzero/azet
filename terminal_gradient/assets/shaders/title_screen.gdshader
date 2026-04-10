shader_type canvas_item;

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

// 8x8 Bayer dithering matrix (normalized 0..1)
const float BAYER[64] = {
	 0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
	48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
	12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
	60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
	 3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
	51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
	15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
	63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0
};

// Per-cell ordered dithering: 12 levels per RGB channel (raster images only)
vec3 dither12(vec3 color, vec2 cell) {
	int bx = int(mod(cell.x, 8.0));
	int by = int(mod(cell.y, 8.0));
	float t = BAYER[by * 8 + bx];
	float s = 1.0 / 11.0;
	vec3 lo = floor(color / s) * s;
	vec3 f = (color - lo) / s;
	return lo + s * step(vec3(t), f);
}

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

	// ── Z-1: Logo (fullblock + dither12) ──
	if (logo_rect.z > 0.0) {
		vec2 luv = (blk_center_uv - logo_rect.xy) / logo_rect.zw;
		if (luv.x >= 0.0 && luv.x <= 1.0 && luv.y >= 0.0 && luv.y <= 1.0) {
			vec4 s = texture(logo_texture, luv);
			if (s.a > 0.5) {
				out_color = vec4(dither12(s.rgb, blk), 1.0);
				hit = true;
			}
		}
	}

	// ── Z-2: Sefirot (behind logo, fullblock + dither12) ──
	if (!hit && sefirot_rect.z > 0.0) {
		vec2 suv = (blk_center_uv - sefirot_rect.xy) / sefirot_rect.zw;
		if (suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0) {
			vec4 s = texture(sefirot_texture, suv);
			if (s.a > 0.5) {
				out_color = vec4(dither12(s.rgb, blk), 1.0);
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
	}

	COLOR = out_color;
}
