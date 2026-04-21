shader_type spatial;
render_mode unshaded;

// Rock shader. Unlit — a matcap sphere provides the whole shading term,
// multiplied by a flat gray tint. No gradient, no per-axis variation. Same
// matcap the bushes + ferns use so ground-level clutter all reads from one
// sphere.

uniform sampler2D matcap : filter_linear, repeat_disable;
uniform vec3 tint : source_color = vec3(0.55, 0.55, 0.55);
// 1 = matcap fully tinted by `tint` gray; 0 = raw matcap.
uniform float matcap_tint_strength : hint_range(0.0, 1.0) = 1.0;

void fragment() {
	vec3 n = normalize(NORMAL);
	vec3 view_normal = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	vec2 mc_uv = view_normal.xy * 0.5 + 0.5;
	vec3 mc = texture(matcap, mc_uv).rgb;
	ALBEDO = mix(mc, mc * tint, matcap_tint_strength);
}
