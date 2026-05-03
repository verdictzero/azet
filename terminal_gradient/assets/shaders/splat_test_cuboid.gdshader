shader_type spatial;

// Cuboid body for the FOREST BIOME TEST (was Splatmap Spawn Test 3).
// - Wind block copied verbatim from toon_tree.gdshader so cuboids sway
//   exactly like real vegetation.
// - Lit by HDRI environment lighting only — no matcap luma, no fake
//   shading. Albedo = per-instance zone colour; the engine + HDRI ambient
//   handles all per-face brightness variation.

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
	// Per-instance zone colour as albedo; the engine's HDRI environment
	// lighting paints the per-face shading.
	ALBEDO = v_color;
	ROUGHNESS = 0.9;
	SPECULAR = 0.0;
}
