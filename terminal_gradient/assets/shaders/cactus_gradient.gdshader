shader_type spatial;

// Cactus gradient shader — triplanar-weighted world-space projection with a
// vertical gradient (`color_bottom` at `grad_y_min` → `color_top` at
// `model_y_max * model_scale`). Shared by cactus flesh (greens) and cactus
// spikes (tans); only the two color uniforms differ between materials.
//
// All three triplanar projections currently sample the same world-Y gradient,
// so the visible result is a seamless vertical gradient on every face with no
// wraparound seams at the top/bottom caps. The weights are retained so
// per-axis texture sampling can be added later without restructuring the
// shader.
//
// Wind block mirrors toon_tree / toon_solid for uniformity; `wind_strength`
// defaults to 0.0 so cacti read rigid out of the box but can be dialed in.

uniform vec3 color_top : source_color = vec3(0.42, 0.62, 0.30);
uniform vec3 color_bottom : source_color = vec3(0.14, 0.28, 0.14);
uniform float toon_bands = 3.0;
uniform float grad_y_min = 0.0;
// `model_y_max` is the mesh's reference height at scale = 1. The effective
// gradient span is scaled per-instance by the MODEL_MATRIX so tall and short
// cacti with different source heights both cover the dark-bottom→bright-top
// curve when their respective materials set matching model_y_max values.
uniform float model_y_max = 1.5;

uniform float wind_strength = 0.0;
uniform float wind_speed = 1.4;
uniform float wind_mask_y_min = 0.3;
uniform float wind_mask_y_max = 1.5;
uniform vec2 wind_spatial_freq = vec2(0.22, 0.17);

varying float v_world_y;
varying float v_model_scale;
varying vec3 v_world_normal;

void vertex() {
	vec3 wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = TIME * wind_speed + wpos.x * wind_spatial_freq.x + wpos.z * wind_spatial_freq.y;
	float mask = smoothstep(wind_mask_y_min, wind_mask_y_max, wpos.y);
	float scl = max(length(MODEL_MATRIX[0].xyz), 0.0001);
	v_model_scale = scl;
	float amp = wind_strength / scl;
	VERTEX.x += sin(phase) * amp * mask;
	VERTEX.z += cos(phase * 0.73 + 1.3) * amp * mask * 0.7;
	VERTEX.y += sin(phase * 1.9) * amp * mask * 0.15;
	v_world_y = (MODEL_MATRIX * vec4(VERTEX, 1.0)).y;
	v_world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	float grad_y_max = model_y_max * v_model_scale;
	float span = max(grad_y_max - grad_y_min, 0.0001);
	float t = clamp((v_world_y - grad_y_min) / span, 0.0, 1.0);

	// Triplanar weights from the world-space normal (|n|, normalized so
	// x+y+z = 1). Today every projection feeds the same world-Y gradient so
	// the weighted sum collapses to a single color; kept explicit so per-axis
	// texture sampling can slot in here later.
	vec3 w = abs(v_world_normal);
	w /= max(w.x + w.y + w.z, 0.0001);
	vec3 grad = mix(color_bottom, color_top, t);
	vec3 col = grad * (w.x + w.y + w.z);

	ALBEDO = col;
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
