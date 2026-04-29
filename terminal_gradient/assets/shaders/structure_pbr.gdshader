shader_type spatial;
render_mode cull_back;

// Triplanar PBR for the test structure: diffuse / normal / roughness sampled
// on the three world-axis-aligned planes (zy, xz, xy) and blended by the
// absolute world normal. Same Bayer4 dither_discard used by structure_matcap
// so the roof can fade out when the player walks inside.

uniform sampler2D albedo_tex : source_color, filter_linear, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear, repeat_enable;
uniform sampler2D roughness_tex : hint_roughness_gray, filter_linear, repeat_enable;

uniform vec4 albedo_tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float world_per_tile = 4.0;
uniform float normal_strength : hint_range(0.0, 2.0) = 1.0;
uniform float roughness_scale : hint_range(0.0, 2.0) = 1.0;
// Higher = sharper transition between the three planes' samples; 1 = pure
// linear blend, 4 = mostly-dominant-axis with soft seams.
uniform float blend_sharpness : hint_range(1.0, 16.0) = 4.0;
uniform float fade_amount : hint_range(0.0, 1.0) = 0.0;

varying vec3 v_world_pos;
varying vec3 v_world_normal;

const float BAYER4[16] = float[16](
	0.03125, 0.53125, 0.15625, 0.65625,
	0.78125, 0.28125, 0.90625, 0.40625,
	0.21875, 0.71875, 0.09375, 0.59375,
	0.96875, 0.46875, 0.84375, 0.34375
);

void dither_discard(vec2 frag_xy, float amt) {
	if (amt <= 0.0) return;
	ivec2 p = ivec2(frag_xy) & ivec2(3);
	if (amt > BAYER4[p.x + p.y * 4]) discard;
}

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	dither_discard(FRAGCOORD.xy, fade_amount);

	vec3 wp = v_world_pos / world_per_tile;
	vec3 n_w = normalize(v_world_normal);
	vec3 blend = pow(abs(n_w), vec3(blend_sharpness));
	blend /= max(blend.x + blend.y + blend.z, 0.0001);

	// Albedo: triplanar sample
	vec3 col_x = texture(albedo_tex, wp.zy).rgb;
	vec3 col_y = texture(albedo_tex, wp.xz).rgb;
	vec3 col_z = texture(albedo_tex, wp.xy).rgb;
	vec3 col = col_x * blend.x + col_y * blend.y + col_z * blend.z;
	ALBEDO = col * albedo_tint.rgb;

	// Roughness (single channel; sampler is hint_roughness_gray so the gray
	// scalar lives in .r regardless of the source image's channel layout)
	float r_x = texture(roughness_tex, wp.zy).r;
	float r_y = texture(roughness_tex, wp.xz).r;
	float r_z = texture(roughness_tex, wp.xy).r;
	ROUGHNESS = clamp((r_x * blend.x + r_y * blend.y + r_z * blend.z) * roughness_scale, 0.0, 1.0);
	METALLIC = 0.0;

	// Normal: each plane samples a tangent-space normal map. Decode to
	// [-1, 1], scale the in-plane components by normal_strength, then
	// reconstruct the third axis (the surface up direction in world space)
	// from |n| = 1 and orient by sign of the dominant world-normal axis.
	// Blend in world space, then convert to view space for Godot's PBR
	// pipeline (which expects NORMAL in view space).
	vec3 nx = texture(normal_tex, wp.zy).xyz * 2.0 - 1.0;
	vec3 ny = texture(normal_tex, wp.xz).xyz * 2.0 - 1.0;
	vec3 nz = texture(normal_tex, wp.xy).xyz * 2.0 - 1.0;
	nx.xy *= normal_strength;
	ny.xy *= normal_strength;
	nz.xy *= normal_strength;

	vec3 axis_sign = sign(n_w);
	// X plane: sample.r = world Z, sample.g = world Y, sample.b = world X
	vec3 nworld_x = vec3(
		sqrt(max(1.0 - nx.x * nx.x - nx.y * nx.y, 0.0)) * axis_sign.x,
		nx.y,
		nx.x);
	// Y plane: sample.r = world X, sample.g = world Z, sample.b = world Y
	vec3 nworld_y = vec3(
		ny.x,
		sqrt(max(1.0 - ny.x * ny.x - ny.y * ny.y, 0.0)) * axis_sign.y,
		ny.y);
	// Z plane: sample.r = world X, sample.g = world Y, sample.b = world Z
	vec3 nworld_z = vec3(
		nz.x,
		nz.y,
		sqrt(max(1.0 - nz.x * nz.x - nz.y * nz.y, 0.0)) * axis_sign.z);

	vec3 perturbed = normalize(nworld_x * blend.x + nworld_y * blend.y + nworld_z * blend.z);
	NORMAL = normalize((VIEW_MATRIX * vec4(perturbed, 0.0)).xyz);
}
