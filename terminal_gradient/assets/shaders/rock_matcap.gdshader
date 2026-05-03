shader_type spatial;

// Rock shader. Lit by HDRI environment only — replaces the previous
// matcap-based fake-lighting setup. Just writes a flat gray tint as
// albedo and lets the engine's environment IBL paint the highlights
// and shadow term off the rock's normals.

uniform sampler2D matcap : filter_linear, repeat_disable;
uniform vec3 tint : source_color = vec3(0.55, 0.55, 0.55);
// Retained for material-resource compatibility; visually inert in the
// HDRI-lit pipeline since the matcap sampler is no longer used.
uniform float matcap_tint_strength : hint_range(0.0, 1.0) = 1.0;

void fragment() {
	ALBEDO = tint;
	ROUGHNESS = 0.85;
}
