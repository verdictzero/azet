shader_type canvas_item;

// Standalone Voronoi-glyph fire layer extracted from title_screen.gdshader
// so any UI shell pane can use it as a procedural background. Each pane
// owns its own ColorRect + ShaderMaterial; the host updates `seeds` and
// `time` every frame.
//
// Sizing convention: `rect_size_px` is the pane's inner pixel rect, and
// `cell_size` is the AsciiGrid glyph cell size, so the cell grid scales
// with the pane bounds (no DPI mismatch with the surrounding text).

uniform vec2 rect_size_px = vec2(256.0, 256.0);
uniform int grid_cols;
uniform int grid_rows;
uniform vec2 cell_size;

uniform sampler2D glyph_atlas : filter_nearest, repeat_disable;
uniform int atlas_cols;
uniform int atlas_rows;
uniform int fire_glyphs[8];

uniform vec2 seeds[10];
uniform float time;

// Fire palette — dark grey-blue-purple, identical to title_screen.gdshader.
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
	vec2 px = UV * rect_size_px;

	int cell_x = clamp(int(floor(px.x / cell_size.x)), 0, grid_cols - 1);
	int cell_y = clamp(int(floor(px.y / cell_size.y)), 0, grid_rows - 1);
	float cx = float(cell_x) + 0.5;
	float cy = float(cell_y) + 0.5;

	// Voronoi cell noise: distance to closest + second-closest seed.
	float min_d = 99999.0;
	float sec_d = 99999.0;
	for (int i = 0; i < 10; i++) {
		float dx = cx - seeds[i].x;
		// y stretched x2 to compensate for the 1:2 cell aspect.
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

	// Sample glyph from atlas at the fragment's sub-cell position.
	vec2 in_cell = vec2(
		(px.x - float(cell_x) * cell_size.x) / cell_size.x,
		(px.y - float(cell_y) * cell_size.y) / cell_size.y
	);
	int ax = glyph_index % atlas_cols;
	int ay = glyph_index / atlas_cols;
	vec2 atlas_uv = (vec2(float(ax), float(ay)) + in_cell) / vec2(float(atlas_cols), float(atlas_rows));
	float ga = texture(glyph_atlas, atlas_uv).a;

	COLOR = vec4(mix(bg_color, fg_color, ga), 1.0);
}
