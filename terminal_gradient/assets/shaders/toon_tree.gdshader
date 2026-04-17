shader_type spatial;

// Pine-tree variant of toon_solid: adds a world-space vertical gradient so the
// foliage can darken toward its base and the trunk can darken toward the
// foliage. Albedo is multiplied by (1 - mix(darken_bottom, darken_top, t))
// where t goes 0..1 from `grad_y_min` to `grad_y_max`.

uniform vec3 albedo : source_color = vec3(0.1, 0.3, 0.15);
uniform float toon_bands = 3.0;
uniform float grad_y_min = 0.0;
uniform float grad_y_max = 6.0;
uniform float darken_top : hint_range(0.0, 1.0) = 0.0;
uniform float darken_bottom : hint_range(0.0, 1.0) = 0.0;

varying float v_world_y;

void vertex() {
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
