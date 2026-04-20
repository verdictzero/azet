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

// Per-instance payload via INSTANCE_CUSTOM (shared across main + outline
// passes because a MultiMesh's custom data attaches to the instance, not the
// material). RGB = local-space push offset, A = dither-fade amount.

varying float v_fade;

const float BAYER4[16] = float[16](
	0.03125, 0.53125, 0.15625, 0.65625,
	0.78125, 0.28125, 0.90625, 0.40625,
	0.21875, 0.71875, 0.09375, 0.59375,
	0.96875, 0.46875, 0.84375, 0.34375
);

void vertex() {
	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = TIME * wind_speed + wpos.x * wind_spatial_freq.x + wpos.z * wind_spatial_freq.y;
	float mask = smoothstep(wind_mask_y_min, wind_mask_y_max, wpos.y);
	float scl = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	float amp = wind_strength / scl;
	VERTEX.x += sin(phase) * amp * mask;
	VERTEX.z += cos(phase * 0.73 + 1.3) * amp * mask * 0.7;
	VERTEX.y += sin(phase * 1.9) * amp * mask * 0.15;

	float push_mask = smoothstep(0.0, 1.5, VERTEX.y);
	VERTEX += INSTANCE_CUSTOM.rgb * push_mask;

	VERTEX += NORMAL * (outline_width / scl);
	v_fade = INSTANCE_CUSTOM.a;
}

void fragment() {
	if (v_fade > 0.0) {
		ivec2 p = ivec2(FRAGCOORD.xy) & ivec2(3);
		float threshold = BAYER4[p.x + p.y * 4];
		if (v_fade > threshold) discard;
	}
	ALBEDO = outline_color.rgb;
}
