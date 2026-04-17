shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix;

// Flat radial-falloff shadow blob for a horizontal quad. UV is 0..1 across
// the plane; we map to a centered 0..1 radius and square the falloff for a
// soft edge without hard banding.

uniform vec4 color : source_color = vec4(0.0, 0.0, 0.0, 0.55);

void fragment() {
	vec2 p = UV - vec2(0.5);
	float d = clamp(length(p) * 2.0, 0.0, 1.0);
	float a = 1.0 - d;
	a = a * a;
	ALBEDO = color.rgb;
	ALPHA = color.a * a;
}
