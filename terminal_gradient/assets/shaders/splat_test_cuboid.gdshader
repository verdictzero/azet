shader_type spatial;
render_mode unshaded;

// Cuboid body for the SPLATMAP SPAWN TEST.
// - Wind block copied verbatim from toon_tree.gdshader so cuboids sway
//   exactly like real vegetation.
// - Albedo: per-instance zone colour, *shaded* by the matcap's luminance
//   only. We do NOT multiply by `matcap.rgb` because matcap_1 (tree matcap)
//   is heavily green/brown-tinted, which would filter the zone hue and
//   defeat the entire point of the test (e.g. red zone × green matcap =
//   muddy olive, indistinguishable from green). Using mc_luma keeps the
//   toon-shaded look (highlights / shadow regions across the cuboid faces)
//   while preserving the zone colour exactly.

uniform sampler2D matcap : filter_linear, repeat_disable;
// 0 = unshaded flat zone colour. 1 = full matcap-luma shading.
uniform float matcap_shade_strength : hint_range(0.0, 1.0) = 1.0;

uniform float wind_strength = 0.0;
uniform float wind_speed = 1.4;
uniform float wind_mask_y_min = 0.1;
uniform float wind_mask_y_max = 2.0;
uniform vec2 wind_spatial_freq = vec2(0.22, 0.17);
uniform float wind_turbulence = 0.0;

varying vec3 v_color;

void vertex() {
	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float turb = sin(TIME * wind_speed * 3.3 + wpos.x * 0.91 + wpos.z * 0.73) * wind_turbulence;
	float phase = TIME * wind_speed + wpos.x * wind_spatial_freq.x + wpos.z * wind_spatial_freq.y + turb;
	float mask = smoothstep(wind_mask_y_min, wind_mask_y_max, wpos.y);
	float scl = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	float amp = wind_strength / scl;
	VERTEX.x += sin(phase) * amp * mask;
	VERTEX.z += cos(phase * 0.73 + 1.3) * amp * mask * 0.7;
	VERTEX.y += sin(phase * 1.9) * amp * mask * 0.15;
	v_color = INSTANCE_CUSTOM.rgb;
}

void fragment() {
	// Matcap lookup: project the world-space normal into view space and map
	// [-1,1] → [0,1] on XY. Same pattern as toon_tree_matcap.gdshader.
	vec3 n = normalize(NORMAL);
	vec3 view_normal = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	vec2 mc_uv = view_normal.xy * 0.5 + 0.5;
	vec3 mc = texture(matcap, mc_uv).rgb;
	// Use ONLY the matcap's luminance as a per-face brightness scalar; the
	// matcap's *chroma* is discarded so the zone colour comes through
	// unfiltered. Mix between flat (1.0) and matcap-shaded (mc_luma).
	float mc_luma = dot(mc, vec3(0.299, 0.587, 0.114));
	float shade = mix(1.0, mc_luma, matcap_shade_strength);
	ALBEDO = v_color * shade;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
