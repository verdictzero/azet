shader_type canvas_item;

#include "res://assets/shaders/dither.gdshaderinc"

// Per-TextureRect dither shader. Snaps the texture sample to fullblock 1:2
// cells (matching the title screen's chunky raster look) and applies the
// shared dither12 quantization. Each TextureRect that uses this shader
// must update `rect_size_px` whenever its bounds change.

uniform vec2 rect_size_px = vec2(256.0, 256.0);
uniform vec2 block_size = vec2(8.0, 8.0);
uniform vec2 uv_shift = vec2(0.0);
uniform vec2 dither_offset = vec2(0.0);
// Low-res block-grain noise injected between the sampled world colour and
// the dither quantisation step. One hash per block (not per pixel), time-
// quantised to noise_time_hz updates/sec so it shimmers without per-frame
// flicker. Zero strength disables it at zero extra cost.
uniform float noise_strength : hint_range(0.0, 0.25) = 0.0;
uniform float noise_time_hz : hint_range(0.0, 30.0) = 10.0;
uniform float noise_cell_mult : hint_range(1.0, 8.0) = 2.0;

float hash21_fx(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void fragment() {
	// Local pixel position inside the rect.
	vec2 px = UV * rect_size_px;

	// Snap to fullblock cells: one texel sample per (block_w x block_h).
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

	COLOR = vec4(dither8_2x2(col, blk + dither_offset), 1.0);
}
