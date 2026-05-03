shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque, blend_mix;

// Y-axis billboarded sprite-sheet quad that cross-fades between two frames
// (`frame_a` → `frame_b` by `mix_t`). Samples bilinearly within the current
// frame; the UV is clamped half a texel inside the frame's bounds so the
// bilinear taps can never reach an adjacent frame on the sprite sheet.

uniform sampler2D tex : source_color, filter_linear, repeat_disable;
uniform vec2 frame_size = vec2(0.333333, 0.25); // normalized size of one frame (1/hframes, 1/vframes)
uniform vec2 frame_a = vec2(0.0);                // normalized origin of current frame
uniform vec2 frame_b = vec2(0.0);                // normalized origin of next frame
uniform float mix_t : hint_range(0.0, 1.0) = 0.0;
uniform float alpha_cut : hint_range(0.0, 1.0) = 0.05;
// When true, every kept fragment writes ALPHA=1.0 instead of the texture's
// alpha value. Used in v2 alongside the x-ray outline pass: the outline is
// drawn behind the player with depth-test off, and a fully-opaque main sprite
// then covers it cleanly wherever the player isn't occluded. Default false
// preserves the v1 sprite blend exactly.
uniform bool force_opaque_alpha = false;

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

	// Continuous frame-local position in texels, clamped half a texel inside
	// the frame so bilinear taps stay within the current frame. Without this
	// clamp the four-tap blend at a frame edge would pull in pixels from the
	// neighbouring frame on the sheet.
	vec2 frame_pos = clamp(UV * frame_px, vec2(0.5), frame_px - vec2(0.5));

	vec2 uv_a = (frame_a * tex_size + frame_pos) / tex_size;
	vec2 uv_b = (frame_b * tex_size + frame_pos) / tex_size;

	vec4 a = texture(tex, uv_a);
	vec4 b = texture(tex, uv_b);
	vec4 c = mix(a, b, mix_t);
	if (c.a < alpha_cut) {
		discard;
	}
	ALBEDO = c.rgb;
	ALPHA = force_opaque_alpha ? 1.0 : c.a;
}
