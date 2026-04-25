shader_type spatial;
render_mode unshaded;

// Ground shader for the SPLATMAP SPAWN TEST. Reads zone IDs from a per-chunk
// L8 splat texture baked on the CPU by `splatmap_spawn_test_screen.gd` —
// the same image the spawn loop samples to gate prefab type. CPU and GPU
// literally read the same bytes, so prefab placement vs ground colour can
// no longer drift. The zone colour is pulled toward grey by
// `ground_saturation` so the ground reads as a dustier version of the
// cuboid hue, making cuboid-vs-tile colour mismatches stand out instantly.

// MUST match `SplatTestZone.ZONE_COLORS` in `core/splat_test_zone.gd` —
// five hex tuples are now the only thing CPU + GPU mirror.
const vec3 ZONE_COLORS[5] = vec3[5](
	vec3(1.00, 0.15, 0.15),  // 0 red
	vec3(0.15, 0.35, 1.00),  // 1 blue
	vec3(0.15, 0.85, 0.25),  // 2 green
	vec3(1.00, 0.90, 0.15),  // 3 yellow
	vec3(1.00, 0.20, 0.85)   // 4 magenta
);

// Per-chunk splat: L8 storing `id * 51` so 0..4 round-trips cleanly through
// 8-bit normalisation (1.0 / 5 steps). filter_nearest keeps zone boundaries
// crisp; repeat_disable stops a chunk's edge texels from bleeding into
// neighbours under any UV rounding.
uniform sampler2D splat_tex : filter_nearest, repeat_disable;
// Min-corner of the chunk in world XZ; lets us reconstruct chunk-local UV
// without depending on the PlaneMesh's own UV layout.
uniform highp vec2 chunk_origin;
// 1.0 = full saturation (matches cuboid), 0.0 = pure grey. ~0.55–0.7 reads
// as "the same colour, just calmer."
uniform float ground_saturation : hint_range(0.0, 1.0) = 0.6;

// Explicit highp so the interpolated world position keeps fp32 across the
// 64×64 m chunk quad — mediump varying interpolation can lose 10+ cm at
// large coords, enough to misclassify zones near boundaries.
varying highp vec3 v_world_pos;

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	// CHUNK_SIZE = 64.0 in `splatmap_spawn_test_screen.gd`; hard-coded here
	// to skip a per-chunk uniform write on a debug screen.
	vec2 uv = (v_world_pos.xz - chunk_origin) / 64.0;
	float v = texture(splat_tex, uv).r;
	int id = int(round(v * 5.0));
	vec3 col = ZONE_COLORS[clamp(id, 0, 4)];
	float lum = dot(col, vec3(0.299, 0.587, 0.114));
	ALBEDO = mix(vec3(lum), col, ground_saturation);
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
