shader_type spatial;

// Flat solid albedo with toon (stepped NdotL) lighting. Used by the
// ring-layer bushes in the terrain demo — the dither pass has hard banded
// shading to work with. Pine trees use toon_tree.gdshader (adds a vertical
// gradient) so this stays minimal.
//
// Shared wind block (mirrored in toon_tree + toon_outline): see toon_tree
// for the rationale. Bush meshes aren't scaled via MODEL_MATRIX (SphereMesh
// is built at final size) so `scl` usually ≈ 1 and `wind_strength` reads
// directly as world meters.

uniform vec3 albedo : source_color = vec3(0.2, 0.5, 0.2);
uniform float toon_bands = 3.0;

uniform float wind_strength = 0.0;
uniform float wind_speed = 1.4;
uniform float wind_mask_y_min = 0.5;
uniform float wind_mask_y_max = 5.0;
uniform vec2 wind_spatial_freq = vec2(0.22, 0.17);

void vertex() {
	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = TIME * wind_speed + wpos.x * wind_spatial_freq.x + wpos.z * wind_spatial_freq.y;
	float mask = smoothstep(wind_mask_y_min, wind_mask_y_max, wpos.y);
	float scl = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	float amp = wind_strength / scl;
	VERTEX.x += sin(phase) * amp * mask;
	VERTEX.z += cos(phase * 0.73 + 1.3) * amp * mask * 0.7;
	VERTEX.y += sin(phase * 1.9) * amp * mask * 0.15;
}

void fragment() {
	ALBEDO = albedo;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}

void light() {
	float ndotl = max(dot(NORMAL, LIGHT), 0.0);
	float bands = max(1.0, toon_bands);
	float toon = floor(ndotl * bands) / (bands - 1.0 < 0.5 ? 1.0 : bands - 1.0);
	toon = clamp(toon, 0.0, 1.0);
	DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * toon * ATTENUATION;
}
