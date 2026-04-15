shader_type spatial;

// Procedural offset checker (brick-style: odd rows shifted by half a cell)
// with toon lighting. Uses world-space XZ so the pattern is stable across
// chunk boundaries.

uniform vec3 color_dark : source_color = vec3(0.05, 0.22, 0.08);
uniform vec3 color_light : source_color = vec3(0.18, 0.48, 0.20);
uniform float cell_size = 4.0;
uniform float toon_bands = 3.0;

varying vec3 v_world_pos;

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float row = floor(v_world_pos.z / cell_size);
	float col_off = mod(row, 2.0) * 0.5;
	float col = floor(v_world_pos.x / cell_size + col_off);
	float parity = mod(row + col, 2.0);
	ALBEDO = mix(color_dark, color_light, parity);
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
