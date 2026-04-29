shader_type spatial;
render_mode unshaded;

// Matcap variant for test_structure_0: same unlit view-space matcap pattern as
// matcap.gdshader, plus a triplanar-sampled normal-noise perturbation that
// preserves the procedural surface variation the original StandardMaterial3D
// got from a NoiseTexture2D normal map. fade_amount drives a Bayer4 dither
// discard so the roof can fade out when the player walks inside the structure.

uniform sampler2D matcap : filter_linear, repeat_disable;
uniform vec4 base_color : source_color = vec4(0.451, 0.389, 0.326, 1.0);
uniform sampler2D normal_noise : filter_linear, repeat_enable;
uniform float noise_world_per_tile = 2.0;
uniform float noise_strength : hint_range(0.0, 2.0) = 0.6;
uniform float fade_amount : hint_range(0.0, 1.0) = 0.0;

varying vec3 v_world_pos;

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
}

void fragment() {
	dither_discard(FRAGCOORD.xy, fade_amount);

	vec3 wp = v_world_pos / noise_world_per_tile;
	vec3 nx = texture(normal_noise, wp.zy).rgb * 2.0 - 1.0;
	vec3 ny = texture(normal_noise, wp.xz).rgb * 2.0 - 1.0;
	vec3 nz = texture(normal_noise, wp.xy).rgb * 2.0 - 1.0;
	vec3 w = abs(NORMAL);
	w = w / max(w.x + w.y + w.z, 0.0001);
	vec3 n_blend = nx * w.x + ny * w.y + nz * w.z;

	vec3 n = normalize(mix(NORMAL, normalize(NORMAL + n_blend), noise_strength));
	vec3 view_normal = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	vec2 mc_uv = view_normal.xy * 0.5 + 0.5;
	ALBEDO = texture(matcap, mc_uv).rgb * base_color.rgb;
}
