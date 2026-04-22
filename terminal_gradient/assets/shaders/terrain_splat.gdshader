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

// Third layer: city-metal-plate path peppered into each zone's corridor
// approach axis. Fully GPU-side — sampled in world XZ via fposmod against
// zone_size_m so every zone gets four corridor-aligned paths for free.
uniform sampler2D path_tex : source_color, filter_nearest_mipmap_anisotropic;
uniform float path_world_per_tile = 4.0;
uniform float zone_size_m = 448.0;
uniform float corridor_lateral_half = 6.0;
uniform float corridor_lateral_softness = 3.0;
uniform float path_edge_full_m = 100.0;
uniform float path_fade_end_m = 150.0;
uniform float path_pepper_freq = 0.35;
uniform float path_pepper_threshold : hint_range(0.0, 1.0) = 0.45;
uniform float path_pepper_softness : hint_range(0.001, 0.5) = 0.06;
uniform float path_strength : hint_range(0.0, 1.0) = 1.0;

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
	vec3 biome = mix(forest, meadow, t);

	// Path mask: corridor-aligned strip × along-axis fade × FBM pepper. The
	// strip sits on each zone's four corridor centrelines; the fade is full
	// near the zone edge and dies off toward the interior so deep zone
	// interiors stay unmarked.
	vec2 lxz = mod(wxz, vec2(zone_size_m));
	float edge_mid = zone_size_m * 0.5;
	float dx_min = min(lxz.x, zone_size_m - lxz.x);
	float dz_min = min(lxz.y, zone_size_m - lxz.y);
	float edge_dist;
	float lateral_off;
	if (dx_min < dz_min) {
		edge_dist = dx_min;
		lateral_off = abs(lxz.y - edge_mid);
	} else {
		edge_dist = dz_min;
		lateral_off = abs(lxz.x - edge_mid);
	}
	float strip = 1.0 - smoothstep(
		corridor_lateral_half,
		corridor_lateral_half + corridor_lateral_softness,
		lateral_off);
	float along = 1.0 - smoothstep(path_edge_full_m, path_fade_end_m, edge_dist);
	float pepper_raw = fbm(wxz * path_pepper_freq + vec2(137.1, 241.7));
	float pepper = smoothstep(
		path_pepper_threshold - path_pepper_softness,
		path_pepper_threshold + path_pepper_softness,
		pepper_raw);
	float path_mask = strip * along * pepper * path_strength;

	vec3 path_col = texture(path_tex, wxz / path_world_per_tile).rgb;
	ALBEDO = mix(biome, path_col, path_mask);
}
