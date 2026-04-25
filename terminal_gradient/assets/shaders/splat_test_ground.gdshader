shader_type spatial;
render_mode unshaded;

// Ground shader for the SPLATMAP SPAWN TEST. Each world-XZ pixel is
// classified by the shared sampler in splat_test_zone.gdshaderinc, then the
// zone colour is pulled toward grey by `ground_saturation` so the ground
// reads as a slightly dimmer / dustier version of the cuboid hue. That makes
// any drift between cuboid and ground extra obvious — they share a hue but
// the cuboid is more saturated, so a colour mismatch shows up as a
// completely different hue, not just a brightness shift.

// Force fp32 precision on the noise pipeline (see .gdshaderinc for why).
precision highp float;

#include "res://assets/shaders/splat_test_zone.gdshaderinc"

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
	int id = splat_test_zone_id_at(v_world_pos.xz);
	vec3 col = splat_test_zone_color(id);
	float lum = dot(col, vec3(0.299, 0.587, 0.114));
	ALBEDO = mix(vec3(lum), col, ground_saturation);
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
