shader_type spatial;

// Pine-tree variant of toon_solid: adds a world-space vertical gradient so the
// foliage can darken toward its base and the trunk can darken toward the
// foliage. Albedo is multiplied by (1 - mix(darken_bottom, darken_top, t))
// where t goes 0..1 from `grad_y_min` to `grad_y_max`.
//
// Shared wind block (mirrored in toon_solid + toon_outline): world-Y mask
// anchors low vertices (trunks, bush bottoms), world-XZ phase desyncs
// neighbors, and `wind_strength` is expressed in world meters — divided by
// model scale inside so the same value reads consistently across tree sizes.

uniform vec3 albedo : source_color = vec3(0.1, 0.3, 0.15);
uniform float toon_bands = 3.0;
uniform float grad_y_min = 0.0;
// `model_y_max` is the mesh's reference height at scale=1. The effective
// gradient span is scaled per-instance by the MODEL_MATRIX so a big tree and
// a small bush both cover the same dark-bottom → bright-top curve.
uniform float model_y_max = 5.5;
uniform float darken_top : hint_range(0.0, 1.0) = 0.0;
uniform float darken_bottom : hint_range(0.0, 1.0) = 0.0;

uniform float wind_strength = 0.0;
uniform float wind_speed = 1.4;
uniform float wind_mask_y_min = 0.5;
uniform float wind_mask_y_max = 5.0;
uniform vec2 wind_spatial_freq = vec2(0.22, 0.17);

// Per-instance payload packed into INSTANCE_CUSTOM (a vec4 per MultiMesh
// instance set from GDScript via MultiMesh.set_instance_custom_data). Bushes
// fill RGB with a local-space push offset; trees fill A with their dither-
// fade amount. Trees leave RGB at 0 and bushes leave A at 0 so both can share
// this shader cleanly.

varying float v_world_y;
varying float v_model_scale;
varying float v_fade;

const float BAYER4[16] = float[16](
	0.03125, 0.53125, 0.15625, 0.65625,
	0.78125, 0.28125, 0.90625, 0.40625,
	0.21875, 0.71875, 0.09375, 0.59375,
	0.96875, 0.46875, 0.84375, 0.34375
);

void dither_discard(vec2 frag_xy, float amt) {
	if (amt <= 0.0) return;
	ivec2 p = ivec2(frag_xy) & ivec2(3);
	float threshold = BAYER4[p.x + p.y * 4];
	if (amt > threshold) discard;
}

void vertex() {
	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = TIME * wind_speed + wpos.x * wind_spatial_freq.x + wpos.z * wind_spatial_freq.y;
	float mask = smoothstep(wind_mask_y_min, wind_mask_y_max, wpos.y);
	float scl = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	v_model_scale = scl;
	float amp = wind_strength / scl;
	VERTEX.x += sin(phase) * amp * mask;
	VERTEX.z += cos(phase * 0.73 + 1.3) * amp * mask * 0.7;
	VERTEX.y += sin(phase * 1.9) * amp * mask * 0.15;
	// Contact push: anchor the base, move the top. Mask uses local VERTEX.y
	// so the curve is authored against the mesh's own height rather than
	// world Y, which would skew on re-scaled instances. Bushes pack the push
	// offset into INSTANCE_CUSTOM.rgb; trees leave it at zero.
	float push_mask = smoothstep(0.0, 1.5, VERTEX.y);
	VERTEX += INSTANCE_CUSTOM.rgb * push_mask;
	v_fade = INSTANCE_CUSTOM.a;
	v_world_y = (MODEL_MATRIX * vec4(VERTEX, 1.0)).y;
}

void fragment() {
	// Trees pack fade into INSTANCE_CUSTOM.a (passed via varying); bushes
	// leave it 0 so the discard is a no-op there.
	dither_discard(FRAGCOORD.xy, v_fade);
	float grad_y_max = model_y_max * v_model_scale;
	float span = max(grad_y_max - grad_y_min, 0.0001);
	float t = clamp((v_world_y - grad_y_min) / span, 0.0, 1.0);
	float darken = mix(darken_bottom, darken_top, t);
	ALBEDO = albedo * (1.0 - darken);
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}

void light() {
	float ndotl = max(dot(NORMAL, LIGHT), 0.0);
	float bands = max(1.0, toon_bands);
	float toon = floor(ndotl * bands) / (bands - 1.0 < 0.5 ? 1.0 : bands - 1.0);
	toon = clamp(toon, 0.0, 1.0);
	DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * toon * ATTENUATION;
}
