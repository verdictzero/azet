shader_type spatial;

// Flat solid albedo with toon (stepped NdotL) lighting. Used by the
// ring-layer bushes in the terrain demo — the dither pass has hard banded
// shading to work with. Pine trees use toon_tree.gdshader (adds a vertical
// gradient) so this stays minimal.

uniform vec3 albedo : source_color = vec3(0.2, 0.5, 0.2);
uniform float toon_bands = 3.0;

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
