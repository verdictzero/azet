shader_type spatial;

// Lit variant of the toon-tree shader. Same wind / per-instance fade /
// bottom-top darken-gradient machinery as toon_tree; albedo = base colour
// times the vertical darken gradient. The HDRI environment provides all
// per-face lighting; the matcap sampler is retained as a no-op uniform for
// backwards-compatible material resources but is not sampled.
//
// INSTANCE_CUSTOM mirrors toon_tree:
//   rgb = local-space push offset (bushes — unused here unless reused)
//   a   = dither-fade amount     (trees)

uniform sampler2D matcap : filter_linear, repeat_disable;
uniform vec3 albedo : source_color = vec3(0.1, 0.3, 0.15);
uniform float matcap_tint_strength : hint_range(0.0, 1.0) = 1.0;
uniform float grad_y_min = 0.0;
uniform float model_y_max = 5.5;
uniform float darken_top : hint_range(0.0, 1.0) = 0.0;
uniform float darken_bottom : hint_range(0.0, 1.0) = 0.0;

uniform float wind_strength = 0.0;
uniform float wind_speed = 1.4;
uniform float wind_mask_y_min = 0.5;
uniform float wind_mask_y_max = 5.0;
uniform vec2 wind_spatial_freq = vec2(0.22, 0.17);
uniform float wind_turbulence = 0.0;

varying float v_world_y;
varying float v_model_scale;
varying float v_fade;

const float BAYER4[16] = float[16](
	0.03125, 0.53125, 0.15625, 0.65625,
	0.78125, 0.28125, 0.90625, 0.40625,
	0.21875, 0.71875, 0.09375, 0.59375,
	0.96875, 0.46875, 0.84375, 0.34375
);

void dither_discard(vec2 frag_xy, float amt) {
	if (amt <= 0.0) return;
	ivec2 p = ivec2(frag_xy) & ivec2(3);
	float threshold = BAYER4[p.x + p.y * 4];
	if (amt > threshold) discard;
}

void vertex() {
	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float turb = sin(TIME * wind_speed * 3.3 + wpos.x * 0.91 + wpos.z * 0.73) * wind_turbulence;
	float phase = TIME * wind_speed + wpos.x * wind_spatial_freq.x + wpos.z * wind_spatial_freq.y + turb;
	float mask = smoothstep(wind_mask_y_min, wind_mask_y_max, wpos.y);
	float scl = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	v_model_scale = scl;
	float amp = wind_strength / scl;
	VERTEX.x += sin(phase) * amp * mask;
	VERTEX.z += cos(phase * 0.73 + 1.3) * amp * mask * 0.7;
	VERTEX.y += sin(phase * 1.9) * amp * mask * 0.15;
	float push_mask = smoothstep(0.0, 1.5, VERTEX.y);
	VERTEX += INSTANCE_CUSTOM.rgb * push_mask;
	v_fade = INSTANCE_CUSTOM.a;
	v_world_y = (MODEL_MATRIX * vec4(VERTEX, 1.0)).y;
}

void fragment() {
	dither_discard(FRAGCOORD.xy, v_fade);

	// Bottom-to-top darken gradient, per-instance scaled (matches toon_tree).
	float grad_y_max = model_y_max * v_model_scale;
	float span = max(grad_y_max - grad_y_min, 0.0001);
	float t = clamp((v_world_y - grad_y_min) / span, 0.0, 1.0);
	float darken = mix(darken_bottom, darken_top, t);
	ALBEDO = albedo * (1.0 - darken);
	ROUGHNESS = 0.9;
}
