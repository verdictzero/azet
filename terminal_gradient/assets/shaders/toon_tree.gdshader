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
uniform float grad_y_max = 6.0;
uniform float darken_top : hint_range(0.0, 1.0) = 0.0;
uniform float darken_bottom : hint_range(0.0, 1.0) = 0.0;

uniform float wind_strength = 0.0;
uniform float wind_speed = 1.4;
uniform float wind_mask_y_min = 0.5;
uniform float wind_mask_y_max = 5.0;
uniform vec2 wind_spatial_freq = vec2(0.22, 0.17);

varying float v_world_y;

void vertex() {
	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = TIME * wind_speed + wpos.x * wind_spatial_freq.x + wpos.z * wind_spatial_freq.y;
	float mask = smoothstep(wind_mask_y_min, wind_mask_y_max, wpos.y);
	float scl = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	float amp = wind_strength / scl;
	VERTEX.x += sin(phase) * amp * mask;
	VERTEX.z += cos(phase * 0.73 + 1.3) * amp * mask * 0.7;
	VERTEX.y += sin(phase * 1.9) * amp * mask * 0.15;
	v_world_y = (MODEL_MATRIX * vec4(VERTEX, 1.0)).y;
}

void fragment() {
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
