shader_type canvas_item;
render_mode blend_mul;

// Screen-space radial dim, painted onto the SubViewport as a ColorRect
// overlay. Multiplies the underlying frame by `(1 - dim_amount)` outside a
// soft circular falloff centred on `bright_center_uv` (the player's
// projected screen position). Used by Desert Biome Test 2 to darken
// "everything outside the structure" without touching any of the unlit
// matcap shaders that paint the geometry — this acts on the composited
// frame, so it's pipeline-agnostic.

uniform float dim_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec2 bright_center_uv = vec2(0.5, 0.5);
uniform float dim_inner_radius_uv : hint_range(0.0, 1.0) = 0.18;
uniform float dim_outer_radius_uv : hint_range(0.0, 1.0) = 0.42;
// Viewport width / height, so the bright disc reads as round on widescreen
// instead of squished into an ellipse along the long axis.
uniform float aspect_correction = 1.778;

void fragment() {
	vec2 d = UV - bright_center_uv;
	d.x *= aspect_correction;
	float t = smoothstep(dim_inner_radius_uv, dim_outer_radius_uv, length(d));
	float brightness = 1.0 - dim_amount * t;
	COLOR = vec4(brightness, brightness, brightness, 1.0);
}
