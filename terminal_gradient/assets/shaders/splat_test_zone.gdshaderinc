// SPLATMAP SPAWN TEST sampler — GLSL mirror of `core/splat_test_zone.gd`.
//
// MUST MATCH that file byte-for-byte:
// - hash21 (same math as terrain_splat.gdshader and biome_field.gd)
// - value_noise (smoothstep-blend over a 1-cell quad)
// - fbm3: 3 octaves, lacunarity 2.03, gain 0.5
// - layer phase offsets (17.3, 11.1) etc.
// - NOISE_FREQ
// - argmax over 5 fbm weight fields
// - ZONE_COLORS
//
// Kept at 3 octaves so per-fragment cost stays modest (≈60 hash lookups).
//
// Precision: forced highp throughout. Default fragment-shader precision in
// Godot 4 spatial shaders can be mediump on some drivers, which is at most
// fp16 (~3 decimal digits). Inside hash21 we multiply by 123.34 / 456.21,
// which at world-coord magnitudes ~100+ overflows mediump's mantissa and
// produces garbage `fract` results — visible as spawn-vs-ground colour
// drift growing with distance from origin. fp32 highp keeps the noise
// pipeline numerically aligned with the CPU's fp64 computation.

precision highp float;

const float SPLAT_TEST_NOISE_FREQ = 0.018;

const vec3 SPLAT_TEST_ZONE_COLORS[5] = vec3[5](
	vec3(1.00, 0.15, 0.15),  // 0 red
	vec3(0.15, 0.35, 1.00),  // 1 blue
	vec3(0.15, 0.85, 0.25),  // 2 green
	vec3(1.00, 0.90, 0.15),  // 3 yellow
	vec3(1.00, 0.20, 0.85)   // 4 magenta
);

float splat_test_hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float splat_test_value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = splat_test_hash21(i);
	float b = splat_test_hash21(i + vec2(1.0, 0.0));
	float c = splat_test_hash21(i + vec2(0.0, 1.0));
	float d = splat_test_hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float splat_test_fbm3(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 3; i++) {
		v += a * splat_test_value_noise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return v;
}

int splat_test_zone_id_at(vec2 wxz) {
	vec2 q = wxz * SPLAT_TEST_NOISE_FREQ;
	float w0 = splat_test_fbm3(q);
	float w1 = splat_test_fbm3(q + vec2(17.3, 11.1));
	float w2 = splat_test_fbm3(q + vec2(31.5,  7.7));
	float w3 = splat_test_fbm3(q + vec2(52.1, 23.7));
	float w4 = splat_test_fbm3(q + vec2(73.4, 41.5));

	int best = 0;
	float best_w = w0;
	if (w1 > best_w) { best = 1; best_w = w1; }
	if (w2 > best_w) { best = 2; best_w = w2; }
	if (w3 > best_w) { best = 3; best_w = w3; }
	if (w4 > best_w) { best = 4; best_w = w4; }
	return best;
}

vec3 splat_test_zone_color(int id) {
	return SPLAT_TEST_ZONE_COLORS[clamp(id, 0, 4)];
}
