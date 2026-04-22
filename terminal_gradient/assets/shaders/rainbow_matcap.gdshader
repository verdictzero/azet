shader_type spatial;
render_mode unshaded;

// Rainbow matcap: samples a grayscale-ish matcap for lighting shape, then
// replaces the hue with a rainbow that shifts over time AND by view-space
// normal angle. The result reads as "lit crystal" with a psychedelic sheen.

uniform sampler2D matcap : filter_linear, repeat_disable;
uniform float hue_speed : hint_range(0.0, 2.0) = 0.35;
uniform float hue_angle_span : hint_range(0.0, 2.0) = 1.0;
uniform float matcap_lum_floor : hint_range(0.0, 1.0) = 0.35;
uniform float saturation : hint_range(0.0, 1.0) = 1.0;

vec3 hsv_to_rgb(vec3 c) {
	vec3 p = abs(fract(vec3(c.x) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - vec3(3.0));
	return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void fragment() {
	vec3 n = normalize(NORMAL);
	vec3 view_n = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	vec2 mc_uv = view_n.xy * 0.5 + 0.5;
	vec3 mc = texture(matcap, mc_uv).rgb;
	float lum = dot(mc, vec3(0.2126, 0.7152, 0.0722));
	float angle = atan(view_n.y, view_n.x) / (2.0 * 3.1415926);
	float hue = fract(TIME * hue_speed + angle * hue_angle_span);
	vec3 rainbow = hsv_to_rgb(vec3(hue, saturation, 1.0));
	ALBEDO = rainbow * mix(matcap_lum_floor, 1.0, lum);
}
