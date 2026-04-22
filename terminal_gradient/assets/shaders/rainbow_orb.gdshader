shader_type spatial;
render_mode unshaded;

// Uniform rainbow orb: every fragment reads the same hue at time T, so the
// whole mesh cycles colour in lockstep instead of the per-view-normal
// variation you'd get from a matcap lookup.

uniform float hue_speed : hint_range(0.0, 2.0) = 0.4;
uniform float brightness : hint_range(0.0, 4.0) = 1.0;

vec3 hsv_to_rgb(vec3 c) {
	vec3 p = abs(fract(vec3(c.x) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - vec3(3.0));
	return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void fragment() {
	float hue = fract(TIME * hue_speed);
	ALBEDO = hsv_to_rgb(vec3(hue, 1.0, 1.0)) * brightness;
}
