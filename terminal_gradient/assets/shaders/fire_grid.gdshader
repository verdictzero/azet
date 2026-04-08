shader_type canvas_item;

uniform int grid_cols;
uniform int grid_rows;
uniform vec2 cell_size;
uniform vec2 grid_pixel_size;

uniform sampler2D glyph_atlas : filter_nearest, repeat_disable;
uniform int atlas_cols;
uniform int atlas_rows;

uniform int fire_glyphs[8];
uniform vec2 seeds[10];
uniform float time;
uniform int fps_value;

// Fixed fire color tables (matching web version)
const vec3 FIRE_FG[7] = {
	vec3(1.0, 0.133, 0.0),
	vec3(1.0, 0.267, 0.0),
	vec3(1.0, 0.4, 0.0),
	vec3(1.0, 0.533, 0.0),
	vec3(1.0, 0.667, 0.0),
	vec3(1.0, 0.8, 0.0),
	vec3(1.0, 0.867, 0.267)
};

const vec3 FIRE_BG[6] = {
	vec3(0.102, 0.031, 0.0),
	vec3(0.165, 0.055, 0.0),
	vec3(0.227, 0.082, 0.0),
	vec3(0.290, 0.102, 0.0),
	vec3(0.353, 0.133, 0.0),
	vec3(0.416, 0.157, 0.0)
};

void fragment() {
	vec2 pixel_pos = UV * grid_pixel_size;

	int cell_x = clamp(int(floor(pixel_pos.x / cell_size.x)), 0, grid_cols - 1);
	int cell_y = clamp(int(floor(pixel_pos.y / cell_size.y)), 0, grid_rows - 1);

	float cx = float(cell_x) + 0.5;
	float cy = float(cell_y) + 0.5;

	// --- FPS counter in top-left ---
	bool is_fps_cell = (cell_y == 0 && cell_x >= 1 && cell_x <= 8);
	int fps_glyph = 0;
	bool has_fps = false;

	if (is_fps_cell) {
		int pos = cell_x - 1;
		int d2 = fps_value / 100;
		int d1 = (fps_value / 10) % 10;
		int d0 = fps_value % 10;

		int ch = 0;
		if (pos == 0) ch = 38;       // F
		else if (pos == 1) ch = 48;  // P
		else if (pos == 2) ch = 51;  // S
		else if (pos == 3) ch = 26;  // :
		else if (pos == 4) ch = 0;   // space
		else if (pos == 5 && d2 > 0) ch = 16 + d2;
		else if (pos == 5 && d2 == 0 && fps_value >= 10) ch = 16 + d1;
		else if (pos == 5 && fps_value < 10) ch = 16 + d0;
		else if (pos == 6 && d2 > 0) ch = 16 + d1;
		else if (pos == 6 && d2 == 0 && fps_value >= 10) ch = 16 + d0;
		else if (pos == 7 && d2 > 0) ch = 16 + d0;

		if (ch > 0 || pos <= 4) {
			fps_glyph = ch;
			has_fps = true;
		}
	}

	if (has_fps) {
		vec2 in_cell = vec2(
			(pixel_pos.x - float(cell_x) * cell_size.x) / cell_size.x,
			(pixel_pos.y - float(cell_y) * cell_size.y) / cell_size.y
		);
		int ax = fps_glyph % atlas_cols;
		int ay = fps_glyph / atlas_cols;
		vec2 atlas_uv = (vec2(float(ax), float(ay)) + in_cell) / vec2(float(atlas_cols), float(atlas_rows));
		float ga = texture(glyph_atlas, atlas_uv).a;
		COLOR = vec4(mix(vec3(0.0), vec3(1.0, 0.93, 0.4), ga), 1.0);
	} else {
		// --- Voronoi cell noise fire ---
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

		vec2 in_cell = vec2(
			(pixel_pos.x - float(cell_x) * cell_size.x) / cell_size.x,
			(pixel_pos.y - float(cell_y) * cell_size.y) / cell_size.y
		);
		int ax = glyph_index % atlas_cols;
		int ay = glyph_index / atlas_cols;
		vec2 atlas_uv = (vec2(float(ax), float(ay)) + in_cell) / vec2(float(atlas_cols), float(atlas_rows));
		float ga = texture(glyph_atlas, atlas_uv).a;

		COLOR = vec4(mix(bg_color, fg_color, ga), 1.0);
	}
}
