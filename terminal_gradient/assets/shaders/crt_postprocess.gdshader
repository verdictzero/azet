shader_type canvas_item;
// CRT post-processing: scanlines, phosphor glow, chromatic aberration.
// Ported from js/engine.js CRT effects.

uniform bool enable_scanlines = true;
uniform bool enable_glow = true;
uniform bool enable_aberration = true;
uniform float scanline_intensity : hint_range(0.0, 1.0) = 0.15;
uniform float glow_amount : hint_range(0.0, 2.0) = 0.3;
uniform float aberration_offset : hint_range(0.0, 5.0) = 1.0;

void fragment() {
	vec2 uv = UV;
	vec4 color = texture(TEXTURE, uv);

	// Chromatic aberration
	if (enable_aberration) {
		vec2 tex_size = vec2(textureSize(TEXTURE, 0));
		vec2 offset = vec2(aberration_offset / tex_size.x, 0.0);
		color.r = texture(TEXTURE, uv - offset).r;
		color.b = texture(TEXTURE, uv + offset).b;
	}

	// Phosphor glow (simple 3x3 box blur)
	if (enable_glow) {
		vec2 tex_size = vec2(textureSize(TEXTURE, 0));
		vec2 px = 1.0 / tex_size;
		vec4 glow_color = vec4(0.0);
		for (int y = -1; y <= 1; y++) {
			for (int x = -1; x <= 1; x++) {
				if (x == 0 && y == 0) continue;
				glow_color += texture(TEXTURE, uv + vec2(float(x), float(y)) * px);
			}
		}
		glow_color /= 8.0;
		color.rgb += glow_color.rgb * glow_amount;
	}

	// Scanlines
	if (enable_scanlines) {
		vec2 tex_size = vec2(textureSize(TEXTURE, 0));
		float line = sin(uv.y * tex_size.y * 3.14159) * 0.5 + 0.5;
		color.rgb *= mix(1.0, line, scanline_intensity);
	}

	COLOR = color;
}
