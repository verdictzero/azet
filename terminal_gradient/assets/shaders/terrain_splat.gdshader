shader_type spatial;
render_mode unshaded;

// World-space splat-mapped terrain. Pine-forest floor is the default; meadow
// pockets are cut out where an FBM field crosses the threshold. Sampled in
// world XZ so the meadow/forest boundary is continuous across chunk seams.
//
// Both textures tile by world meters per tile, not by mesh UV, for the same
// reason: switching chunk size / mesh UV layout shouldn't shift the pattern.

uniform sampler2D meadow_tex : source_color, filter_nearest_mipmap_anisotropic;
uniform sampler2D forest_tex : source_color, filter_nearest_mipmap_anisotropic;
uniform float meadow_world_per_tile = 6.4;
uniform float forest_world_per_tile = 6.4;
// Defaults only bite if the owning material forgets to set the uniform —
// the real values live in `core/biome_config_default.tres` and are pushed
// into the material at build time by `TerrainDemo2Screen._build_world`.
uniform float noise_freq = 0.06;
uniform float noise_threshold : hint_range(0.0, 1.0) = 0.55;
uniform float noise_softness : hint_range(0.001, 0.5) = 0.03;
// Domain-warp sub-noise: perturbs the sample coordinate of the main FBM
// before evaluation, jagging the meadow/forest boundary without disturbing
// the ground texture UV. Set `warp_amp = 0` to disable.
uniform float warp_freq = 0.18;
uniform float warp_amp = 2.5;

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
	for (int i = 0; i < 6; i++) {
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
	// Perturb the fbm sample position (but not the texture UVs) using a
	// second, higher-frequency value-noise lookup. The x/z offsets use
	// different constant shifts so warp_x / warp_z are independent fields,
	// avoiding a diagonal swirl bias.
	vec2 warp = vec2(
		value_noise(wxz * warp_freq + vec2(7.3, 11.1)),
		value_noise(wxz * warp_freq + vec2(23.7, 37.3))
	) - vec2(0.5);
	vec2 sample_xz = wxz + warp * warp_amp;
	float n = fbm(sample_xz * noise_freq);
	float t = smoothstep(noise_threshold - noise_softness, noise_threshold + noise_softness, n);
	// Forest is the default; `t` rises where meadow pockets form.
	ALBEDO = mix(forest, meadow, t);
}
