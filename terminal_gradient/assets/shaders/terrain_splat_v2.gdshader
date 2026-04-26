shader_type spatial;
render_mode unshaded;

// World-space splat-mapped terrain — proxy-splatmap variant of
// `terrain_splat.gdshader`. Same forest/meadow texture blend and same
// corridor/path overlay; the only architectural delta is the meadow
// density field.
//
// Original shader recomputes 6-octave warped FBM per fragment. CPU
// spawn culler runs the SAME math separately, but at different sample
// densities and on different precision — vegetation drifts away from
// the visible splat boundary as a result.
//
// This v2 reads the density from a per-chunk L8 texture baked by
// `BiomeField.bake_chunk_density_image` on the CPU. The spawn loop
// bilinear-samples the same baked bytes via
// `BiomeField.sample_density_image_bilinear`. CPU and GPU read
// identical data → no possible drift. See `docs/proxy-splatmap-pattern.md`
// and `docs/splatmap-terrain-shader.md` for the wider pattern.

uniform sampler2D meadow_tex : source_color, filter_nearest_mipmap_anisotropic;
uniform sampler2D forest_tex : source_color, filter_nearest_mipmap_anisotropic;
uniform float meadow_world_per_tile = 6.4;
uniform float forest_world_per_tile = 6.4;
// Threshold + softness identical to the original shader so the visible
// boundary location matches BiomeConfig's CPU side. Domain warp lives
// inside the baked density now (CPU side did the perturbation), so this
// shader does NOT do its own warp — that's the load-bearing simplification.
uniform float noise_threshold : hint_range(0.0, 1.0) = 0.55;
uniform float noise_softness : hint_range(0.001, 0.5) = 0.03;

// Per-chunk splat: L8 texture storing the warped FBM density at each
// texel, baked by `BiomeField.bake_chunk_density_image`. filter_linear
// gives sub-texel-smooth boundaries; repeat_disable keeps the (N+2)
// overhang from bleeding into wrap-around.
uniform sampler2D splat_tex : filter_linear, repeat_disable;
// World-XZ position of the splat texture's MIN corner. Equals the chunk's
// origin shifted half a texel to the upper-left (the texture has 1-texel
// overhang on every side so adjacent chunks bake the same world XZ at
// shared positions and bilinear filter blends across seams).
uniform highp vec2 bake_origin;
// World extent the splat texture covers along each axis: `(N + 2) * step`.
uniform float texture_world_size;

// Path overlay (carried over verbatim from the original shader).
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

// Per-chunk metal-plating layer. Same proxy-splatmap convention as
// `splat_tex` — bilinear-sampled at the same `bake_origin` /
// `texture_world_size` UV so CPU bakers and the GPU shader read identical
// bytes. `hint_default_black` makes the layer a no-op when the texture is
// unbound (Godot 4's sampler2D defaults to WHITE without this hint, which
// would render every Demo 3 / Demo 4 chunk as solid metal — the visible
// regression that prompted this fix).
uniform sampler2D metal_weight_tex : hint_default_black, filter_linear, repeat_disable;
uniform sampler2D metal_albedo_tex : source_color, filter_nearest_mipmap_anisotropic;
uniform float metal_world_per_tile = 4.0;

varying vec3 v_world_pos;

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

// `fbm` is still needed for the path-pepper layer (independent FBM at
// a different freq, not gated on the splat). hash + value_noise are
// the same primitives the CPU mirror in `BiomeField` uses.
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

	// Bake-driven density. UV maps the texture's full world extent
	// (chunk + 1-texel overhang on every side) to [0, 1]. Bilinear
	// sample reaches into the overhang at chunk edges, blending
	// continuously with the neighbour chunk's same-world-XZ values.
	vec2 splat_uv = (wxz - bake_origin) / texture_world_size;
	float n = texture(splat_tex, splat_uv).r;

	float t = smoothstep(noise_threshold - noise_softness, noise_threshold + noise_softness, n);
	// Forest is the default; `t` rises where meadow pockets form.
	vec3 biome = mix(forest, meadow, t);

	// Path mask carried over from the original shader — corridor strip ×
	// along-axis fade × FBM pepper. Independent of the splat texture
	// (uses its own world-XZ fbm at a higher frequency).
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
	vec3 col = mix(biome, path_col, path_mask);

	// Metal plating overlay. Sampled with the same UV as splat_tex so the
	// CPU bake and GPU read are bit-identical (proxy-splatmap pattern).
	// `metal_w` is 0 by default → Demo 4 keeps Demo-3 visuals; Demo 5 bakes
	// a non-zero weight in a small disc + noisy band around the platform.
	float metal_w = texture(metal_weight_tex, splat_uv).r;
	vec3 metal_col = texture(metal_albedo_tex, wxz / metal_world_per_tile).rgb;
	ALBEDO = mix(col, metal_col, metal_w);
}
