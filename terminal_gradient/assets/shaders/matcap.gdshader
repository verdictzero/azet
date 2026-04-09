shader_type spatial;
render_mode unshaded;

uniform sampler2D matcap : filter_linear, repeat_disable;
uniform vec4 base_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);

void fragment() {
	vec3 n = normalize(NORMAL);
	vec3 view_normal = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	vec2 matcap_uv = view_normal.xy * 0.5 + 0.5;
	vec3 mc = texture(matcap, matcap_uv).rgb;
	ALBEDO = mc * base_color.rgb;
}
