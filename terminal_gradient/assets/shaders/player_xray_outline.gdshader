shader_type spatial;
render_mode unshaded, cull_disabled, depth_test_disabled, depth_draw_never, blend_mix;

// Player "x-ray" silhouette: same Y-billboard sprite quad as player_sprite,
// but rendered with depth_test_disabled so it always paints. Designed to be
// drawn FIRST (lower render_priority); the main opaque-style sprite then
// over-paints it where the player is actually visible. Where the main sprite
// fails depth (player behind a tree), this silhouette remains, giving a
// "see-through" outline color.
//
// Frame uniforms mirror player_sprite.gdshader so the silhouette tracks the
// walk animation exactly — terrain_player pushes the same frame_a/frame_b/
// mix_t to both materials each frame.

uniform sampler2D tex : source_color, filter_nearest, repeat_disable;
uniform vec2 frame_size = vec2(0.333333, 0.25);
uniform vec2 frame_a = vec2(0.0);
uniform vec2 frame_b = vec2(0.0);
uniform float mix_t : hint_range(0.0, 1.0) = 0.0;
uniform float alpha_cut : hint_range(0.0, 1.0) = 0.05;
uniform vec4 outline_color : source_color = vec4(0.45, 0.85, 1.0, 0.65);

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
	vec2 sample_px = clamp(floor(UV * frame_px), vec2(0.0), frame_px - 1.0);
	vec2 pixel_center = sample_px + 0.5;
	vec2 uv_a = (frame_a * tex_size + pixel_center) / tex_size;
	vec2 uv_b = (frame_b * tex_size + pixel_center) / tex_size;
	float a_a = texture(tex, uv_a).a;
	float a_b = texture(tex, uv_b).a;
	float a = mix(a_a, a_b, mix_t);
	if (a < alpha_cut) {
		discard;
	}
	ALBEDO = outline_color.rgb;
	ALPHA = outline_color.a;
}
