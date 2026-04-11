shader_type canvas_item;

// Renders the procedural rock-chunk particle field at block resolution
// into a SubViewport. The main title shader samples this as a texture so
// the expensive 22-particle × 10-crumb evaluation runs once per *block*
// (~1/50× the work of evaluating it per pixel at full viewport res).
//
// `grid_pixel_size` is the FULL viewport size (not this subviewport's
// own size) so that particle world-space layout matches the main pass.

uniform vec2 grid_pixel_size;
uniform float time;

const int PARTICLE_COUNT = 22;
const int CRUMBS_PER_PARTICLE = 10;

// Light direction matching the sefirot graphic: lower-right.
// Normalized vector pointing TOWARD the light source.
const vec2 PARTICLE_LIGHT_DIR = vec2(0.7071, 0.7071);
const vec3 PARTICLE_PALETTE[5] = {
	vec3(0.169, 0.106, 0.361), // #2B1B5C deep indigo
	vec3(0.420, 0.310, 0.710), // #6B4FB5 mid violet
	vec3(0.545, 0.373, 0.749), // #8B5FBF bright violet
	vec3(0.769, 0.663, 0.898), // #C4A9E5 pale lavender
	vec3(1.000, 1.000, 1.000)  // white sparkle
};

vec2 hash21(float p) {
	vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}

// Evaluate one rock chunk at `pos` with directional shading and an
// irregular non-circular outline. Source-over accumulates into the layer.
// `ca`/`sa` are cos/sin of the silhouette rotation angle, computed by the
// caller so that AABB-culled particles can skip the trig entirely. The
// rotation only spins the wobble; lighting stays in world space.
void eval_chunk(
	vec2 frag_px, vec2 pos, float size, float seed, float alpha_mul, float ca, float sa,
	inout vec3 accum, inout float a_accum
) {
	if (a_accum >= 0.99) return;

	vec2 d2 = frag_px - pos;
	float r2 = dot(d2, d2);
	float max_r = size * 1.4;
	if (r2 > max_r * max_r) return;

	float r = sqrt(max(r2, 1e-6));
	vec2 nrm = d2 / r;

	// Rotated normal used only for the silhouette wobble — gives the chunk
	// a spinning appearance. Lighting below uses the unrotated `nrm`.
	vec2 rnrm = vec2(nrm.x * ca - nrm.y * sa, nrm.x * sa + nrm.y * ca);

	// Irregular rocky outline via overlapping low-frequency wobbles.
	float wobble =
		  sin(rnrm.x * 5.3 + seed * 1.3) * 0.18
		+ sin(rnrm.y * 7.1 - seed * 0.7) * 0.12
		+ sin((rnrm.x - rnrm.y) * 6.5 + seed * 2.7) * 0.10;
	float er = size * (0.82 + wobble);

	// Hard rock edge with sub-pixel anti-alias.
	float chunk = 1.0 - smoothstep(er - 0.5, er + 0.8, r);
	if (chunk <= 0.0) return;

	// Directional shading: lit from lower-right (matches sefirot lighting).
	float ndotl = dot(nrm, PARTICLE_LIGHT_DIR);
	float light = clamp(ndotl * 0.6 + 0.4, 0.0, 1.0);
	vec3 shadow_col = PARTICLE_PALETTE[0]; // deep indigo
	vec3 lit_col    = PARTICLE_PALETTE[2]; // bright violet
	vec3 base = mix(shadow_col, lit_col, light);

	// Pale lavender rim concentrated on the lit side (lower-right edge).
	float rim_band = smoothstep(er * 0.68, er * 1.0, r);
	vec3 col = mix(base, PARTICLE_PALETTE[3], rim_band * light * light * 0.85);

	float a = chunk * alpha_mul;
	float a_left = 1.0 - a_accum;
	accum   += col * a * a_left;
	a_accum += a * a_left;
}

// Procedural rising rock-chunk field. Each particle is a main chunk with
// a wake of falling, decaying sub-particles spawned along its trajectory.
vec4 particle_layer(vec2 frag_px) {
	vec3 accum = vec3(0.0);
	float a_accum = 0.0;
	float t = time;

	for (int i = 0; i < PARTICLE_COUNT; i++) {
		float fi = float(i);

		// Stable per-particle base randomness (lifetime / phase offset).
		vec2 r0 = hash21(fi + 1.7);
		float lifetime = mix(7.0, 14.0, r0.x);
		float life_off = r0.y * lifetime;
		float t_abs    = t + life_off;
		float cycle    = floor(t_abs / lifetime);

		// Reshuffle every respawn so each cycle looks fresh.
		float salt = fi * 13.37 + cycle * 71.0;
		vec2  r1   = hash21(salt);
		vec2  r2   = hash21(salt + 5.0);
		vec2  r3   = hash21(salt + 9.0);

		float spawn_x = r1.x * grid_pixel_size.x;
		float size    = mix(5.0, 11.0, r1.y);    // px radius

		// Per-cycle random rotation: signed angular velocity + initial phase.
		float main_ang_vel = (r3.x - 0.5) * 1.6;   // ±0.8 rad/s, slow tumble
		float main_angle0  = r3.y * 6.2832;

		// Vertical progress 0 (bottom) → 1 (top). Linear straight-up rise.
		float local_t = fract(t_abs / lifetime);
		float head_y  = grid_pixel_size.y * (1.0 - local_t);
		vec2  head    = vec2(spawn_x, head_y);

		// ── Cheap AABB cull ──
		// Each particle's footprint is a ~±85 px column around `spawn_x`
		// (max crumb scatter ≈ 21 px/s × 3.4 s + size margin) extending
		// downward from `head_y` (crumbs only fall, never rise meaningfully).
		// Fragments outside that region can skip the main chunk AND the
		// 10-iteration crumb loop entirely — by far the dominant cost.
		if (abs(frag_px.x - spawn_x) > 85.0) continue;
		if (frag_px.y < head_y - 18.0) continue;

		// Lifetime envelope: fade in from bottom, fade out near top.
		float env = smoothstep(0.0, 0.06, local_t)
				  * (1.0 - smoothstep(0.88, 1.0, local_t));

		// Main rock chunk at the head.
		float main_angle = main_angle0 + main_ang_vel * local_t * lifetime;
		eval_chunk(frag_px, head, size, salt, env, cos(main_angle), sin(main_angle), accum, a_accum);

		// ── Falling, decaying sub-particles ──
		// Each sub spawns at a deterministic moment in the main's cycle,
		// gets a small lateral kick + slight upward residual carried from
		// the rising chunk, then falls under gravity and fades out.
		for (int k = 0; k < CRUMBS_PER_PARTICLE; k++) {
			float kf = float(k);

			// Stagger spawn moments through the main's cycle.
			float spawn_local_t = (kf + 0.5) / float(CRUMBS_PER_PARTICLE);
			if (local_t < spawn_local_t) continue;

			// Per-sub random properties (re-shuffled every main respawn).
			vec2 sub_r1 = hash21(salt + 41.0 + kf * 13.0);
			vec2 sub_r2 = hash21(salt + 73.0 + kf * 17.0);
			vec2 sub_r3 = hash21(salt + 109.0 + kf * 19.0);
			float sub_life = mix(1.6, 3.4, sub_r1.x);

			// Per-crumb tumble: faster than the main chunks.
			float sub_ang_vel = (sub_r3.x - 0.5) * 4.0; // ±2 rad/s
			float sub_angle0  = sub_r3.y * 6.2832;

			// How long this sub has existed (in seconds).
			float sub_age = (local_t - spawn_local_t) * lifetime;
			if (sub_age >= sub_life) continue;

			// Where the head was at the moment this sub spawned.
			// Linear path: head x is constant (= spawn_x).
			float spawn_head_x = spawn_x;
			float spawn_head_y = grid_pixel_size.y * (1.0 - spawn_local_t);

			// Initial velocity: lateral scatter + small upward residual
			// (carried from the rising chunk before gravity takes over).
			vec2 v0 = vec2(
				(sub_r1.y - 0.5) * 42.0,
				mix(-14.0, -2.0, sub_r2.x)
			);
			float gravity = 65.0;

			vec2 cp = vec2(spawn_head_x, spawn_head_y)
					+ v0 * sub_age
					+ vec2(0.0, 0.5 * gravity * sub_age * sub_age);

			// Quadratic decay (slow → fast fade-out as the crumb dies).
			float t01 = sub_age / sub_life;
			float decay = (1.0 - t01) * (1.0 - t01);

			float cs = size * mix(0.30, 0.55, sub_r2.y);

			float sub_angle = sub_angle0 + sub_ang_vel * sub_age;
			eval_chunk(frag_px, cp, cs, salt + kf * 7.3, decay * env, cos(sub_angle), sin(sub_angle), accum, a_accum);
		}
	}

	return vec4(accum, a_accum);
}

void fragment() {
	// UV in [0,1] across the SubViewport, scaled to full viewport pixel
	// space — so each fragment samples the particle field at the center
	// of one block in the main viewport.
	vec2 px = UV * grid_pixel_size;
	COLOR = particle_layer(px);
}
