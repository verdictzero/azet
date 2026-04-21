shader_type canvas_item;

// LUT-palette variant of pane_raster.gdshader. The block-sample and film-
// grain noise stages are identical to the non-LUT original; the dither step
// is replaced by a palette-snap — the input colour gets a Bayer 2×2 nudge
// and is then looked up in a sampler3D whose voxels hold the nearest
// palette entry. The sampler is filter_nearest so we get hard palette
// boundaries; dithering comes entirely from the pre-lookup nudge.

uniform vec2 rect_size_px = vec2(256.0, 256.0);
uniform vec2 block_size = vec2(8.0, 8.0);
uniform vec2 uv_shift = vec2(0.0);
uniform vec2 dither_offset = vec2(0.0);
// Low-res block-grain noise, mirrored from pane_raster.gdshader.
uniform float noise_strength : hint_range(0.0, 0.25) = 0.0;
uniform float noise_time_hz : hint_range(0.0, 30.0) = 10.0;
uniform float noise_cell_mult : hint_range(1.0, 8.0) = 2.0;
// Palette LUT: 3D texture whose voxels hold the nearest palette entry for
// each RGB-cube coordinate. Bound from GDScript by PaletteUtil.
uniform sampler3D palette_lut : filter_nearest;
// Range (in the 0..1 RGB cube) the Bayer nudge spans. 0.08 ≈ one LUT cell
// at lut_res=16, enough to bias adjacent blocks to different palette entries
// along colour ramps.
uniform float palette_dither_strength : hint_range(0.0, 0.5) = 0.08;

const float BAYER2X2[4] = float[4](0.0, 0.5, 0.75, 0.25);

float hash21_fx(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void fragment() {
	vec2 px = UV * rect_size_px;
	vec2 blk = floor(px / block_size);
	vec2 blk_center_uv = (blk + 0.5) * block_size / rect_size_px + uv_shift;
	blk_center_uv = clamp(blk_center_uv, vec2(0.0), vec2(1.0));

	vec4 s = texture(TEXTURE, blk_center_uv);
	if (s.a < 0.5) {
		discard;
	}

	vec3 col = s.rgb;
	if (noise_strength > 0.0) {
		vec2 nblk = floor(blk / noise_cell_mult);
		float t_slice = floor(TIME * noise_time_hz);
		float n = hash21_fx(nblk + vec2(t_slice * 0.73, t_slice * 0.91));
		col += vec3(n - 0.5) * noise_strength;
	}

	// Bayer 2×2 threshold sampled on the raster block grid.
	ivec2 bcell = ivec2(blk + dither_offset);
	int bx = ((bcell.x % 2) + 2) % 2;
	int by = ((bcell.y % 2) + 2) % 2;
	float b = BAYER2X2[bx + by * 2];
	vec3 nudge = vec3(b - 0.375) * palette_dither_strength;

	vec3 lut_uv = clamp(col + nudge, vec3(0.0), vec3(1.0));
	vec3 snapped = texture(palette_lut, lut_uv).rgb;
	COLOR = vec4(snapped, 1.0);
}
