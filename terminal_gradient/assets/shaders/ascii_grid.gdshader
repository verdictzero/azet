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

// Glyph atlas (white on transparent, 16x16 grid of glyphs)
uniform sampler2D glyph_atlas : filter_nearest, repeat_disable;
uniform int atlas_cols; // 16
uniform int atlas_rows; // 16

// FUTURE(per-cell-font): today the whole grid shares one font atlas
// (swappable at runtime via AsciiGrid.set_font_atlas). To mix fonts in
// one grid without reshaping cell_data:
//   1. Promote `glyph_atlas` above to `sampler2DArray` (layer = font slot).
//   2. Add a parallel data texture `uniform sampler2D cell_font` where
//      R8 stores the font-slot index (0..N-1). Do NOT steal bits from
//      cell_data — fg RGB needs all 24 bits.
//   3. Sample cell_font, use its R as the array layer in the glyph_atlas
//      lookup below.
// FontAtlasCache.pack_array(font_names, size) -> Texture2DArray would
// assemble the array from the existing per-font baked PNGs.

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

	// If cell is empty (glyph 0 = space, no glyph coverage) and bg is default black,
	// output transparent so layers below (e.g. fire) show through.
	bool is_default = (glyph_index == 0 && bg_color.r < 0.01 && bg_color.g < 0.01 && bg_color.b < 0.01);
	float cell_alpha = is_default ? 0.0 : 1.0;

	// Composite: bg behind, fg where glyph has coverage
	vec3 final_color = mix(bg_color, fg_color, glyph_alpha);
	COLOR = vec4(final_color, cell_alpha);
}
