shader_type spatial;
render_mode unshaded;

// Ground shader for SPLATMAP SPAWN TEST 3 — classic splatmap-terrain
// pattern. Reads two per-chunk weight textures baked on the CPU by
// `splatmap_spawn_test_3_screen.gd`, bilinear-samples them, then BLENDS
// the 5 zone colours softmax-weighted by the splat values. Output is a
// continuous colour gradient with no hard zone-to-zone steps — the
// boundary "fades" naturally across the transition zone.
//
// CPU-side spawn keeps using argmax (a cuboid needs a discrete id), so
// spawn precision is unchanged: a red cuboid still lands on a tile where
// red dominates the blend. The displayed ground colour at that exact XZ
// is mostly red with a small contribution from the second-place zone —
// reads as "red on red" but the boundary edge is a smooth gradient
// instead of a stairstepped argmax line.

// MUST match `SplatTestZone.ZONE_COLORS` in `core/splat_test_zone.gd`
// AND the same constant in `splat_test_ground.gdshader` (Test 1/2).
// Five hex tuples mirrored across three files; trivial to keep aligned.
const vec3 ZONE_COLORS[5] = vec3[5](
	vec3(1.00, 0.15, 0.15),  // 0 red
	vec3(0.15, 0.35, 1.00),  // 1 blue
	vec3(0.15, 0.85, 0.25),  // 2 green
	vec3(1.00, 0.90, 0.15),  // 3 yellow
	vec3(1.00, 0.20, 0.85)   // 4 magenta
);

// Per-chunk weight textures.
// `weights_a` (RGBA8) packs the first four `_fbm3` weights in RGBA.
// `weights_b` (L8/R8) carries the fifth weight in R.
// Both filter_linear so the per-channel scalars interpolate smoothly
// across texels — that's what produces the sub-pixel-sharp argmax curve.
// repeat_disable stops chunk edges from bleeding into neighbours under
// any UV rounding.
uniform sampler2D weights_a : filter_linear, repeat_disable;
uniform sampler2D weights_b : filter_linear, repeat_disable;
// World-XZ position of the texture's MIN corner. The bake reaches half a
// texel past each chunk edge (1-texel overhang on every side), so this
// equals `chunk_origin - vec2(step)` where `step = CHUNK_SIZE / N`.
// Adjacent chunks bake the same world XZ at their shared overhang
// positions → the bilinear filter blends continuously across seams.
uniform highp vec2 bake_origin;
// World extent the texture covers along each axis: `(N + 2) * step`.
// Same value for every chunk (set on the template), but kept as a uniform
// instead of hard-coded so SPLAT_GRID_N can change without touching the
// shader.
uniform float texture_world_size;
// 1.0 = full saturation (matches cuboid), 0.0 = pure grey.
uniform float ground_saturation : hint_range(0.0, 1.0) = 0.6;
// Softmax temperature controlling how sharp the colour blend at zone
// boundaries is. Higher = narrower transition (closer to argmax-style
// hard cuts). Lower = wider, dreamier blend. 32 keeps zone interiors
// nearly pure-coloured while giving boundaries a visible fade band of
// roughly half a metre at the test's typical view distance.
uniform float blend_sharpness : hint_range(1.0, 128.0) = 32.0;

// Explicit highp so interpolated world position keeps fp32 across the
// 64×64 m chunk quad — mediump can lose 10+ cm at large coords.
varying highp vec3 v_world_pos;

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	// UV maps the texture's full world extent (chunk + 1-texel overhang
	// on every side) into [0, 1]. Bilinear sampling near the chunk edges
	// reaches into the overhang texels — which contain the same values
	// the neighbour chunk baked at those world positions — so the blend
	// is continuous across chunk seams.
	vec2 uv = (v_world_pos.xz - bake_origin) / texture_world_size;
	vec4 wa = texture(weights_a, uv);
	float wb = texture(weights_b, uv).r;

	// Softmax over the 5 bilinear-sampled weights, then blend zone colours
	// weighted by the resulting probabilities. Order MUST match
	// `SplatTestZone.zone_weights_at`: w0..w3 in R/G/B/A of weights_a,
	// w4 in R of weights_b.
	//
	// Subtract the max before exp() for numerical stability — keeps the
	// largest exponent at exp(0) = 1 so we never blow up the
	// floating-point range. With `blend_sharpness = 32` and FBM weight
	// gaps in the 0.05–0.15 range, sub-dominant zones contribute roughly
	// 5–20 % at boundaries and effectively 0 % at zone centres → solid
	// colour everywhere except a soft fade band along each border.
	float w_max = max(max(max(wa.r, wa.g), max(wa.b, wa.a)), wb);
	float e0 = exp((wa.r - w_max) * blend_sharpness);
	float e1 = exp((wa.g - w_max) * blend_sharpness);
	float e2 = exp((wa.b - w_max) * blend_sharpness);
	float e3 = exp((wa.a - w_max) * blend_sharpness);
	float e4 = exp((wb    - w_max) * blend_sharpness);
	float sum = e0 + e1 + e2 + e3 + e4;
	vec3 col = (
		ZONE_COLORS[0] * e0 +
		ZONE_COLORS[1] * e1 +
		ZONE_COLORS[2] * e2 +
		ZONE_COLORS[3] * e3 +
		ZONE_COLORS[4] * e4
	) / sum;

	float lum = dot(col, vec3(0.299, 0.587, 0.114));
	ALBEDO = mix(vec3(lum), col, ground_saturation);
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
