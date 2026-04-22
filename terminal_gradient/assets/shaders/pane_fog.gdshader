shader_type canvas_item;
render_mode blend_mix, unshaded;

// Animated procedural fog overlay. Samples 3D value-noise FBM with
// (uv * scale - scroll*time, evolve*time) so the field drifts across screen
// while also morphing on the z axis. Domain is continuous, so the pattern
// never wraps — no seams regardless of how long it scrolls.

uniform vec3 fog_color : source_color = vec3(0.82, 0.86, 0.94);
uniform float fog_opacity : hint_range(0.0, 1.0) = 0.55;
uniform vec2 fog_scale = vec2(2.5, 1.8);
uniform vec2 scroll_dir_uv = vec2(0.025, 0.025);
uniform float evolve_rate : hint_range(0.0, 1.0) = 0.08;
uniform float fog_threshold : hint_range(0.0, 1.0) = 0.35;
uniform float fog_softness : hint_range(0.01, 1.0) = 0.45;
uniform int octaves : hint_range(1, 5) = 4;
// Low-res pixelation: UV is snapped to this cell grid before noise
// sampling so the fog reads as chunky blocks regardless of the actual
// viewport resolution. Keep these small for a pronounced effect.
uniform vec2 pixel_cells = vec2(96.0, 54.0);

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.yzx + 19.19);
	return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hash13(i);
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
		mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
		f.z
	);
}

float fbm3(vec3 p, int oct) {
	float v = 0.0;
	float amp = 0.5;
	float norm = 0.0;
	for (int i = 0; i < 5; i++) {
		if (i >= oct) break;
		v += amp * vnoise3(p);
		norm += amp;
		p *= 2.02;
		amp *= 0.5;
	}
	return v / max(norm, 0.0001);
}

void fragment() {
	vec2 snapped_uv = (floor(UV * pixel_cells) + 0.5) / pixel_cells;
	vec2 uv = snapped_uv * fog_scale - scroll_dir_uv * TIME * fog_scale;
	float z = TIME * evolve_rate;
	float n = fbm3(vec3(uv, z), octaves);
	float mask = smoothstep(fog_threshold, fog_threshold + fog_softness, n);
	float alpha = clamp(mask * fog_opacity, 0.0, 1.0);
	COLOR = vec4(fog_color, alpha);
}
