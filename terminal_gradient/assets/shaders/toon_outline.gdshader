shader_type spatial;
render_mode cull_front, unshaded;

// Inverted-hull cartoon outline. Attach as `next_pass` on a toon material:
// the mesh is extruded outward along its normals and only back-faces are
// drawn, so what shows is a black silhouette fringe around the main mesh.
//
// `outline_width` is in world units; it's divided by model scale so an
// instance's scale.xyz multiplier doesn't change the perceived thickness.
// Assumes uniform scale (non-uniform would need per-axis handling).

uniform vec4 outline_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float outline_width = 0.3;

void vertex() {
	float s = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	VERTEX += NORMAL * (outline_width / s);
}

void fragment() {
	ALBEDO = outline_color.rgb;
}
