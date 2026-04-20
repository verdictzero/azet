shader_type spatial;
render_mode unshaded;

// World-space splat-mapped terrain. Two albedo textures blended by an FBM
// value-noise field sampled in world XZ — so the boundary between meadow and
// forest floor is continuous across chunk seams (no per-chunk reset).
//
// Both textures tile by world meters per tile, not by mesh UV, for the same
// reason: switching chunk size / mesh UV layout shouldn't shift the pattern.

uniform sampler2D meadow_tex : source_color, filter_nearest_mipmap_anisotropic;
uniform sampler2D forest_tex : source_color, filter_nearest_mipmap_anisotropic;
uniform float meadow_world_per_tile = 6.4;
uniform float forest_world_per_tile = 6.4;
uniform float noise_freq = 0.025;
uniform float noise_threshold : hint_range(0.0, 1.0) = 0.45;
uniform float noise_softness : hint_range(0.001, 0.5) = 0.12;

varying vec3 v_world_pos;

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * value_noise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return v;
}

void fragment() {
	vec2 wxz = v_world_pos.xz;
	vec3 meadow = texture(meadow_tex, wxz / meadow_world_per_tile).rgb;
	vec3 forest = texture(forest_tex, wxz / forest_world_per_tile).rgb;
	float n = fbm(wxz * noise_freq);
	float t = smoothstep(noise_threshold - noise_softness, noise_threshold + noise_softness, n);
	ALBEDO = mix(meadow, forest, t);
}
