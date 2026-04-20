shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque, blend_mix;

// Y-axis billboarded sprite-sheet quad that cross-fades between two frames
// (`frame_a` → `frame_b` by `mix_t`). Samples in pixel space and clamps to the
// current frame's bounds so there is no bleed across frames or wrap across
// the texture edge.

uniform sampler2D tex : source_color, filter_nearest, repeat_disable;
uniform vec2 frame_size = vec2(0.333333, 0.25); // normalized size of one frame (1/hframes, 1/vframes)
uniform vec2 frame_a = vec2(0.0);                // normalized origin of current frame
uniform vec2 frame_b = vec2(0.0);                // normalized origin of next frame
uniform float mix_t : hint_range(0.0, 1.0) = 0.0;
uniform float alpha_cut : hint_range(0.0, 1.0) = 0.05;

void vertex() {
	vec3 scale = vec3(
		length(MODEL_MATRIX[0].xyz),
		length(MODEL_MATRIX[1].xyz),
		length(MODEL_MATRIX[2].xyz)
	);
	vec3 world_pos = MODEL_MATRIX[3].xyz;
	vec3 cam_world = INV_VIEW_MATRIX[3].xyz;
	vec3 to_cam = cam_world - world_pos;
	to_cam.y = 0.0;
	to_cam = length(to_cam) < 1e-4 ? vec3(0.0, 0.0, 1.0) : normalize(to_cam);
	vec3 up = vec3(0.0, 1.0, 0.0);
	vec3 right = normalize(cross(up, to_cam));
	mat4 m = mat4(
		vec4(right * scale.x, 0.0),
		vec4(up * scale.y, 0.0),
		vec4(to_cam * scale.z, 0.0),
		vec4(world_pos, 1.0)
	);
	MODELVIEW_MATRIX = VIEW_MATRIX * m;
}

void fragment() {
	vec2 tex_size = vec2(textureSize(tex, 0));
	vec2 frame_px = frame_size * tex_size;

	// Pick the texel within the current frame; clamp so UV at the edges
	// can never spill into an adjacent frame or wrap across the texture.
	vec2 sample_px = clamp(floor(UV * frame_px), vec2(0.0), frame_px - 1.0);
	vec2 pixel_center = sample_px + 0.5;

	vec2 uv_a = (frame_a * tex_size + pixel_center) / tex_size;
	vec2 uv_b = (frame_b * tex_size + pixel_center) / tex_size;

	vec4 a = texture(tex, uv_a);
	vec4 b = texture(tex, uv_b);
	vec4 c = mix(a, b, mix_t);
	if (c.a < alpha_cut) {
		discard;
	}
	ALBEDO = c.rgb;
	ALPHA = c.a;
}
