shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;

// Lifecycle-driven directional dust, gated to sand zones, wrapped on BOTH
// the along-wind and across-wind axes so the cloud follows the player no
// matter which direction they travel.
//
// Each instance has a static seed XZ that is its "emission point" — when its
// age wraps, it re-emits from the same seed. Per-instance hashes randomize:
//   - lifetime period + age phase
//   - uniform size jitter (single multiplier; X == Y so the billboard stays
//     square — shape variety lives in the fragment shader, not in the quad)
//   - silhouette inner radius and falloff softness (some tight, some diffuse)
//   - noise scale + UV warp strength for the per-particle puffy shape
//
// Lifecycle (age 0..1, looped):
//   - Born at Y=0 at the seed XZ.
//   - Drifts along wind_dir at wind_speed for the full lifetime.
//   - Y rises quadratically up to rise_height (slow then fast).
//   - Size lerps small → large with anisotropic per-particle jitter.
//   - Alpha bell-curves: fade in → plateau → fade out, knee positions
//     uniform-controlled so puffs disappear visibly before the next cycle.
//
// Sand gate: birth XZ is sampled against the same FBM + domain-warp the CPU
// bakes into the splat texture (mirrors core/biome_field.gd). Density above
// `biome_threshold` is sand and visible; below is desert-dirt-rocks and
// faded to zero alpha.
//
// CPU updates `cloud_origin` each frame to follow the player; both wind-
// axis AND cross-axis components of the seed-to-origin offset are wrapped
// within `tile_size`, so seeds always project onto a tile-sized box centred
// on the player regardless of how far they've travelled in any direction.

uniform vec3 wind_dir = vec3(-1.0, 0.0, 0.0);
uniform float wind_speed = 5.0;
uniform float tile_size = 90.0;
uniform vec3 cloud_origin = vec3(0.0);

// Lifetime period (seconds) — randomized per particle in [min, max].
uniform float lifetime_min = 4.0;
uniform float lifetime_max = 9.0;

// Size grows from start → end across lifetime, with a single uniform per-
// particle jitter (X == Y, billboard stays square — shape variety lives in
// the fragment shader's silhouette + UV-warp, not in quad distortion).
uniform float size_start = 0.6;
uniform float size_end = 4.5;
uniform float size_jitter_min = 0.3;
uniform float size_jitter_max = 3.0;

// Vertical rise over lifetime (peak at age=1). Quadratic ease — slow start,
// fast end — so particles billow up rather than rising linearly.
uniform float rise_height = 6.0;

// Lateral turbulence amplitude.
uniform float turb_strength = 0.9;

// Edge fade: ramps alpha to 0 in the last `fade_band` metres before the
// wrap boundary so wraps don't pop visually.
uniform float fade_band = 16.0;

// Alpha bell-curve knee positions (fractions of age in [0, 1]).
uniform float fade_in_end = 0.12;
uniform float fade_out_start = 0.35;
uniform float fade_out_end = 0.65;

uniform vec4 base_color : source_color = vec4(1.0, 0.88, 0.66, 0.55);

// Biome sampling (mirrors core/biome_field.gd). Defaults match
// biome_config_default.tres.
uniform float biome_noise_freq = 0.06;
uniform float biome_threshold = 0.55;
uniform float biome_softness = 0.015;
uniform float biome_warp_freq = 0.28;
uniform float biome_warp_amp = 7.5;

varying vec4 v_color;
varying vec2 v_noise_offset;
// (silhouette_inner, silhouette_softness, noise_scale, warp_strength)
varying vec4 v_shape;

float hash3(vec3 p) {
	p = fract(p * vec3(123.34, 456.21, 789.12));
	p += dot(p, p + 45.32);
	return fract((p.x + p.y) * p.z);
}

float hash2(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Biome FBM mirror — must match BiomeField exactly so the visible meadow/
// forest boundary lines up with the splat the CPU bakes.
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

// 2D value noise — used by the fragment shader for the puffy alpha shape.
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

	// Per-particle randomness derived from the static seed. Six independent
	// hashes drive lifetime, phase, anisotropic size, silhouette, and shape.
	float h0 = hash3(seed);
	float h1 = hash3(seed + vec3(7.0, 13.0, 19.0));
	float h2 = hash3(seed + vec3(31.0, 41.0, 51.0));
	float h3 = hash3(seed + vec3(53.0, 61.0, 71.0));
	float h4 = hash3(seed + vec3(83.0, 97.0, 103.0));
	float h5 = hash3(seed + vec3(113.0, 127.0, 137.0));

	// Lifetime + age. Each particle has its own period and phase so cycles
	// are out of sync.
	float period = mix(lifetime_min, lifetime_max, h0);
	float age = fract(TIME / period + h1);

	// 2D wrapped projection. wind_xz is the wind's XZ axis; perp_xz is the
	// 90° rotation in the XZ plane (across-wind ground axis). Both
	// components of the seed-to-origin offset are wrapped within tile_size,
	// so the cloud stays centred on the player no matter which direction
	// they walk (the old single-axis wrap left the across direction
	// unbounded — that was the "stuck near start zone" bug).
	vec2 wind_xz = vec2(wind_dir.x, wind_dir.z);
	vec2 perp_xz = vec2(-wind_xz.y, wind_xz.x);
	vec2 origin_xz = vec2(cloud_origin.x, cloud_origin.z);
	vec2 seed_xz = vec2(seed.x, seed.z);
	vec2 rel_xz = seed_xz - origin_xz;
	float half_tile = tile_size * 0.5;

	// Across-wind: project + wrap. Same value at age=0 and age=1; doesn't
	// move with drift.
	float across = dot(rel_xz, perp_xz);
	across = mod(across + half_tile, tile_size) - half_tile;

	// Birth (age=0): along-wind is just the wrapped seed offset, no drift.
	float birth_along = dot(rel_xz, wind_xz);
	birth_along = mod(birth_along + half_tile, tile_size) - half_tile;
	vec2 birth_xz = origin_xz + wind_xz * birth_along + perp_xz * across;

	// Current (age=age): add wind drift, wrap again.
	float drift_dist = age * period * wind_speed;
	float along = birth_along + drift_dist;
	along = mod(along + half_tile, tile_size) - half_tile;
	vec2 final_xz = origin_xz + wind_xz * along + perp_xz * across;

	// World position (Y comes from the rise curve below).
	vec3 world_pos = vec3(final_xz.x, 0.0, final_xz.y);

	// Sand gate: density at the BIRTH XZ. Particle visible iff that point
	// is currently in a sand pocket.
	float density = biome_density(birth_xz);
	float sand_mask = smoothstep(biome_threshold - biome_softness,
		biome_threshold + biome_softness, density);

	// Quadratic vertical rise — slow at first, faster as the particle ages.
	world_pos.y = rise_height * age * age;

	// Lateral turbulence: per-particle phase, scaled by age so just-spawned
	// particles barely jitter and aging particles wander more.
	float turb_phase = TIME * 0.4 + h2 * 6.2831;
	world_pos.y += sin(turb_phase + world_pos.x * 0.18) * turb_strength * 0.4 * age;
	world_pos.z += cos(turb_phase * 0.8 + h3 * 6.2831) * turb_strength * age;

	// Uniform per-particle size jitter — single multiplier applied to both
	// quad axes so the billboard stays square. Range is wide (default
	// 0.3 → 3.0) so tiny wisps sit next to fat billowing balls.
	float age_size = mix(size_start, size_end, age);
	float size_now = age_size * mix(size_jitter_min, size_jitter_max, h2);

	// Per-particle silhouette + shape. Some puffs are tight little balls
	// (silhouette_inner near 0.6, sharp falloff). Others are diffuse
	// clouds (silhouette_inner near 0.2, soft falloff). Noise scale varies
	// between fine grain and big chunky lobes. UV warp strength domain-
	// warps the silhouette so it isn't a clean circle — this is the main
	// per-particle shape variation, replacing the old anisotropic billboard.
	float silhouette_inner = mix(0.20, 0.60, h4);
	float silhouette_softness = mix(0.10, 0.55, h5);
	float noise_scale = mix(1.5, 5.0, h2);
	float warp_strength = mix(0.08, 0.40, h3);

	// Alpha bell curve.
	float fade_in = smoothstep(0.0, fade_in_end, age);
	float fade_out = 1.0 - smoothstep(fade_out_start, fade_out_end, age);
	float life_alpha = fade_in * fade_out;

	// Edge fade at the wind-axis wrap boundary so wraps don't pop. Cross-
	// axis wrap also pops in theory, but with the across_fade band below
	// it ramps to zero too.
	float dist_along = abs(along);
	float dist_across = abs(across);
	float along_fade = 1.0 - smoothstep(half_tile - fade_band, half_tile,
		dist_along);
	float across_fade = 1.0 - smoothstep(half_tile - fade_band, half_tile,
		dist_across);
	float edge_fade = along_fade * across_fade;

	// Per-particle alpha jitter so the cloud doesn't read as uniform.
	float alpha_jitter = 0.5 + h0 * 0.6;

	// Square billboard — size_now applied uniformly to both axes.
	vec3 cam_right = vec3(VIEW_MATRIX[0][0], VIEW_MATRIX[1][0], VIEW_MATRIX[2][0]);
	vec3 cam_up = vec3(VIEW_MATRIX[0][1], VIEW_MATRIX[1][1], VIEW_MATRIX[2][1]);
	vec3 quad_offset = (VERTEX.x * cam_right + VERTEX.y * cam_up) * size_now;
	vec3 final_pos = world_pos + quad_offset;

	v_color = vec4(base_color.rgb,
		base_color.a * life_alpha * edge_fade * alpha_jitter * sand_mask);
	v_noise_offset = vec2(h2, h3) * 50.0;
	v_shape = vec4(silhouette_inner, silhouette_softness, noise_scale, warp_strength);

	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(final_pos, 1.0);
}

void fragment() {
	// Per-particle silhouette + texture variation, all done in UV space so
	// the billboard stays square — only the alpha pattern changes between
	// puffs.
	//
	// 1. Domain-warp the UV: each particle's `warp_strength` controls how
	//    far the silhouette deviates from a clean circle. This is the
	//    main shape variation knob — wavy, lobed, asymmetric blobs at
	//    high values; near-circular at low values.
	// 2. Apply the silhouette band (`inner` to `inner + softness`) on the
	//    warped UV — gives organic, non-circular outlines.
	// 3. Modulate internal alpha with 3-octave value noise at a per-
	//    particle scale for wisps + dark patches.
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
}
