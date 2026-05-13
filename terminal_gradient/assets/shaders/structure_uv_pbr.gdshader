shader_type spatial;
render_mode cull_back;

// UV-mapped PBR for GLB-authored meshes (preserves the Blender bake) plus
// the same Bayer4 dither_discard test_structure_0 uses, so a roof can fade
// out when the player walks inside.

uniform sampler2D albedo_tex : source_color, filter_linear, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear, repeat_enable;
// ORM packing matches the GLB exporter convention: G = roughness, B = metallic.
uniform sampler2D orm_tex : hint_default_white, filter_linear, repeat_enable;

uniform vec4 albedo_tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float normal_strength : hint_range(0.0, 2.0) = 1.0;
uniform float roughness_scale : hint_range(0.0, 2.0) = 1.0;
uniform float fade_amount : hint_range(0.0, 1.0) = 0.0;

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

void fragment() {
	dither_discard(FRAGCOORD.xy, fade_amount);

	ALBEDO = texture(albedo_tex, UV).rgb * albedo_tint.rgb;

	vec3 orm = texture(orm_tex, UV).rgb;
	ROUGHNESS = clamp(orm.g * roughness_scale, 0.0, 1.0);
	METALLIC = orm.b;

	vec3 n = texture(normal_tex, UV).xyz * 2.0 - 1.0;
	n.xy *= normal_strength;
	NORMAL_MAP = n * 0.5 + 0.5;
}
