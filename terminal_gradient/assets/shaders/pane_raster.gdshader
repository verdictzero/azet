shader_type canvas_item;

#include "res://assets/shaders/dither.gdshaderinc"

// Per-TextureRect dither shader. Snaps the texture sample to fullblock 1:2
// cells (matching the title screen's chunky raster look) and applies the
// shared dither12 quantization. Each TextureRect that uses this shader
// must update `rect_size_px` whenever its bounds change.

uniform vec2 rect_size_px = vec2(256.0, 256.0);
uniform vec2 block_size = vec2(8.0, 16.0);

void fragment() {
	// Local pixel position inside the rect.
	vec2 px = UV * rect_size_px;

	// Snap to fullblock cells: one texel sample per (block_w x block_h).
	vec2 blk = floor(px / block_size);
	vec2 blk_center_uv = (blk + 0.5) * block_size / rect_size_px;
	blk_center_uv = clamp(blk_center_uv, vec2(0.0), vec2(1.0));

	vec4 s = texture(TEXTURE, blk_center_uv);
	if (s.a < 0.5) {
		discard;
	}

	COLOR = vec4(dither12(s.rgb, blk), 1.0);
}
