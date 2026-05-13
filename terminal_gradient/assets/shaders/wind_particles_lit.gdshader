shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled;

// HDRI-lit variant of `wind_particles.gdshader`. Identical motion, lifecycle,
// shape, and uniform interface — the only differences are:
//   - `unshaded` is dropped from render_mode, so the Mobile pipeline runs the
//     dust through the standard lit path and the HDRI ambient + reflection
//     terms reach the surface.
//   - The vertex shader writes a world-up NORMAL on the billboard so each
//     puff samples the upper hemisphere of the desert panorama (warm sky
//     from above, cooler ground bounce from below).
//   - The fragment shader pins ROUGHNESS = 1.0 + METALLIC = 0.0 + SPECULAR = 0
//     so the IBL contribution is pure diffuse — no shiny highlights on dust.
//
// Uniform names + defaults must stay in lockstep with `wind_particles.gdshader`
// so DesertBiomeTest3Screen can hot-swap `material.shader` without rebinding
// any parameters.

uniform vec3 wind_dir = vec3(-1.0, 0.0, 0.0);
uniform float wind_speed = 5.0;
uniform float tile_size = 90.0;
uniform vec3 cloud_origin = vec3(0.0);

uniform float lifetime_min = 4.0;
uniform float lifetime_max = 9.0;

uniform float size_start = 0.6;
uniform float size_end = 4.5;
uniform float size_jitter_min = 0.3;
uniform float size_jitter_max = 3.0;

uniform float rise_height = 6.0;

uniform float turb_strength = 0.9;

uniform float fade_band = 16.0;

uniform float fade_in_end = 0.12;
uniform float fade_out_start = 0.35;
uniform float fade_out_end = 0.65;

uniform vec4 base_color : source_color = vec4(1.0, 0.88, 0.66, 0.55);

uniform float biome_noise_freq = 0.06;
uniform float biome_threshold = 0.55;
uniform float biome_softness = 0.015;
uniform float biome_warp_freq = 0.28;
uniform float biome_warp_amp = 7.5;

varying vec4 v_color;
varying vec2 v_noise_offset;
varying vec4 v_shape;

float hash3(vec3 p) {
	p = fract(p * vec3(123.34, 456.21, 789.12));
	p += dot(p, p + 45.32);
	return fract((p.x + p.y) * p.z);
}

float hash2(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float biome_hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float biome_vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = biome_hash(i);
	float b = biome_hash(i + vec2(1.0, 0.0));
	float c = biome_hash(i + vec2(0.0, 1.0));
	float d = biome_hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float biome_fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 6; i++) {
		v += a * biome_vnoise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return v;
}

float biome_density(vec2 wxz) {
	if (biome_warp_amp > 0.0) {
		float wx_warp = biome_vnoise(wxz * biome_warp_freq + vec2(7.3, 11.1)) - 0.5;
		float wz_warp = biome_vnoise(wxz * biome_warp_freq + vec2(23.7, 37.3)) - 0.5;
		wxz += vec2(wx_warp, wz_warp) * biome_warp_amp;
	}
	return biome_fbm(wxz * biome_noise_freq);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash2(i);
	float b = hash2(i + vec2(1.0, 0.0));
	float c = hash2(i + vec2(0.0, 1.0));
	float d = hash2(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void vertex() {
	vec3 seed = MODEL_MATRIX[3].xyz;

	float h0 = hash3(seed);
	float h1 = hash3(seed + vec3(7.0, 13.0, 19.0));
	float h2 = hash3(seed + vec3(31.0, 41.0, 51.0));
	float h3 = hash3(seed + vec3(53.0, 61.0, 71.0));
	float h4 = hash3(seed + vec3(83.0, 97.0, 103.0));
	float h5 = hash3(seed + vec3(113.0, 127.0, 137.0));

	float period = mix(lifetime_min, lifetime_max, h0);
	float age = fract(TIME / period + h1);

	vec2 wind_xz = vec2(wind_dir.x, wind_dir.z);
	vec2 perp_xz = vec2(-wind_xz.y, wind_xz.x);
	vec2 origin_xz = vec2(cloud_origin.x, cloud_origin.z);
	vec2 seed_xz = vec2(seed.x, seed.z);
	vec2 rel_xz = seed_xz - origin_xz;
	float half_tile = tile_size * 0.5;

	float across = dot(rel_xz, perp_xz);
	across = mod(across + half_tile, tile_size) - half_tile;

	float birth_along = dot(rel_xz, wind_xz);
	birth_along = mod(birth_along + half_tile, tile_size) - half_tile;
	vec2 birth_xz = origin_xz + wind_xz * birth_along + perp_xz * across;

	float drift_dist = age * period * wind_speed;
	float along = birth_along + drift_dist;
	along = mod(along + half_tile, tile_size) - half_tile;
	vec2 final_xz = origin_xz + wind_xz * along + perp_xz * across;

	vec3 world_pos = vec3(final_xz.x, 0.0, final_xz.y);

	float density = biome_density(birth_xz);
	float sand_mask = smoothstep(biome_threshold - biome_softness,
		biome_threshold + biome_softness, density);

	world_pos.y = rise_height * age * age;

	float turb_phase = TIME * 0.4 + h2 * 6.2831;
	world_pos.y += sin(turb_phase + world_pos.x * 0.18) * turb_strength * 0.4 * age;
	world_pos.z += cos(turb_phase * 0.8 + h3 * 6.2831) * turb_strength * age;

	float age_size = mix(size_start, size_end, age);
	float size_now = age_size * mix(size_jitter_min, size_jitter_max, h2);

	float silhouette_inner = mix(0.20, 0.60, h4);
	float silhouette_softness = mix(0.10, 0.55, h5);
	float noise_scale = mix(1.5, 5.0, h2);
	float warp_strength = mix(0.08, 0.40, h3);

	float fade_in = smoothstep(0.0, fade_in_end, age);
	float fade_out = 1.0 - smoothstep(fade_out_start, fade_out_end, age);
	float life_alpha = fade_in * fade_out;

	float dist_along = abs(along);
	float dist_across = abs(across);
	float along_fade = 1.0 - smoothstep(half_tile - fade_band, half_tile,
		dist_along);
	float across_fade = 1.0 - smoothstep(half_tile - fade_band, half_tile,
		dist_across);
	float edge_fade = along_fade * across_fade;

	float alpha_jitter = 0.5 + h0 * 0.6;

	vec3 cam_right = vec3(VIEW_MATRIX[0][0], VIEW_MATRIX[1][0], VIEW_MATRIX[2][0]);
	vec3 cam_up = vec3(VIEW_MATRIX[0][1], VIEW_MATRIX[1][1], VIEW_MATRIX[2][1]);
	vec3 quad_offset = (VERTEX.x * cam_right + VERTEX.y * cam_up) * size_now;
	vec3 final_pos = world_pos + quad_offset;

	v_color = vec4(base_color.rgb,
		base_color.a * life_alpha * edge_fade * alpha_jitter * sand_mask);
	v_noise_offset = vec2(h2, h3) * 50.0;
	v_shape = vec4(silhouette_inner, silhouette_softness, noise_scale, warp_strength);

	// World-up NORMAL: with the per-instance Basis fixed to identity (set
	// CPU-side in `_build_wind_particles`), model space == world space for
	// rotation, so (0,1,0) here transforms to a world-up normal under the
	// default NORMAL_MATRIX. The sky's upper hemisphere drives the dust's
	// diffuse IBL, which is what we want for sun-lit airborne sand.
	NORMAL = vec3(0.0, 1.0, 0.0);

	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(final_pos, 1.0);
}

void fragment() {
	vec2 centred = UV - vec2(0.5);
	float silhouette_inner = v_shape.x;
	float silhouette_softness = v_shape.y;
	float noise_scale = v_shape.z;
	float warp_strength = v_shape.w;

	vec2 warp = vec2(
		vnoise(centred * 3.5 + v_noise_offset) - 0.5,
		vnoise(centred * 3.5 + v_noise_offset + vec2(31.7, 17.3)) - 0.5
	);
	vec2 warped = centred + warp * warp_strength;

	float d = length(warped) * 2.0;
	float silhouette = 1.0 - smoothstep(silhouette_inner,
		silhouette_inner + silhouette_softness, d);

	vec2 noise_uv = centred * noise_scale + v_noise_offset;
	float n = vnoise(noise_uv) * 0.55
		+ vnoise(noise_uv * 2.17) * 0.30
		+ vnoise(noise_uv * 4.71) * 0.15;

	float a = silhouette * (0.35 + n * 1.0);
	a = clamp(a, 0.0, 1.0);

	ALBEDO = v_color.rgb;
	ALPHA = v_color.a * a;
	// Pure diffuse IBL — no specular highlights on dust.
	ROUGHNESS = 1.0;
	METALLIC = 0.0;
	SPECULAR = 0.0;
}
