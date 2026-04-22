shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_opaque;

// Tiny spark for obelisk trails. Billboard + additive + radial falloff.
// Hue shifts with TIME so every spark matches the orb it came from.

uniform float hue_speed : hint_range(0.0, 2.0) = 0.4;
uniform float brightness : hint_range(0.0, 4.0) = 2.0;

vec3 hsv_to_rgb(vec3 c) {
	vec3 p = abs(fract(vec3(c.x) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - vec3(3.0));
	return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(
		INV_VIEW_MATRIX[0],
		INV_VIEW_MATRIX[1],
		INV_VIEW_MATRIX[2],
		MODEL_MATRIX[3]
	);
}

void fragment() {
	vec2 centered = UV * 2.0 - vec2(1.0);
	float d = length(centered);
	if (d > 1.0) discard;
	float hue = fract(TIME * hue_speed);
	ALBEDO = hsv_to_rgb(vec3(hue, 1.0, 1.0)) * brightness * smoothstep(1.0, 0.2, d);
}
