shader_type spatial;
render_mode cull_front, unshaded;

// Inverted-hull cartoon outline. Attach as `next_pass` on a toon material:
// the mesh is extruded outward along its normals and only back-faces are
// drawn, so what shows is a black silhouette fringe around the main mesh.
//
// `outline_width` is in world units; it's divided by model scale so an
// instance's scale.xyz multiplier doesn't change the perceived thickness.
// Assumes uniform scale (non-uniform would need per-axis handling).
//
// Wind block must mirror toon_tree / toon_solid exactly, applied *before*
// the normal extrusion, or the silhouette detaches from the swaying mesh.
// Defaults to zero strength so re-uses on static meshes are unaffected.

uniform vec4 outline_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float outline_width = 0.3;

uniform float wind_strength = 0.0;
uniform float wind_speed = 1.4;
uniform float wind_mask_y_min = 0.5;
uniform float wind_mask_y_max = 5.0;
uniform vec2 wind_spatial_freq = vec2(0.22, 0.17);

void vertex() {
	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = TIME * wind_speed + wpos.x * wind_spatial_freq.x + wpos.z * wind_spatial_freq.y;
	float mask = smoothstep(wind_mask_y_min, wind_mask_y_max, wpos.y);
	float scl = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	float amp = wind_strength / scl;
	VERTEX.x += sin(phase) * amp * mask;
	VERTEX.z += cos(phase * 0.73 + 1.3) * amp * mask * 0.7;
	VERTEX.y += sin(phase * 1.9) * amp * mask * 0.15;

	VERTEX += NORMAL * (outline_width / scl);
}

void fragment() {
	ALBEDO = outline_color.rgb;
}
