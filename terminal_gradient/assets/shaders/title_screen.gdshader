shader_type canvas_item;

// Viewport pixel dimensions
uniform vec2 grid_pixel_size;

// ── Raster image grid: fullblock 1:2 cells ──
uniform vec2 block_size;

// ── Fire grid: font glyph cells ──
uniform int grid_cols;
uniform int grid_rows;
uniform vec2 cell_size;

// Glyph atlas (for fire characters)
uniform sampler2D glyph_atlas : filter_nearest, repeat_disable;
uniform int atlas_cols;
uniform int atlas_rows;
uniform int fire_glyphs[8];

// Fire animation
uniform vec2 seeds[10];
uniform float time;

// Sefirot image
uniform sampler2D sefirot_texture : filter_linear, repeat_disable;
uniform vec4 sefirot_rect;  // UV-space: x, y, w, h

// Logo image
uniform sampler2D logo_texture : filter_linear, repeat_disable;
uniform vec4 logo_rect;

// ── Particle layer (procedural, drifts up from bottom) ──
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

// 8x8 Bayer dithering matrix (normalized 0..1)
const float BAYER[64] = {
	 0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
	48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
	12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
	60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
	 3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
	51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
	15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
	63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0
};

// Per-cell ordered dithering: 12 levels per RGB channel (raster images only)
vec3 dither12(vec3 color, vec2 cell) {
	int bx = int(mod(cell.x, 8.0));
	int by = int(mod(cell.y, 8.0));
	float t = BAYER[by * 8 + bx];
	float s = 1.0 / 11.0;
	vec3 lo = floor(color / s) * s;
	vec3 f = (color - lo) / s;
	return lo + s * step(vec3(t), f);
}

// Fire palette — dark grey-blue-purple
const vec3 FIRE_FG[7] = {
	vec3(0.07, 0.06, 0.11), vec3(0.10, 0.08, 0.15),
	vec3(0.12, 0.11, 0.19), vec3(0.15, 0.13, 0.22),
	vec3(0.17, 0.15, 0.25), vec3(0.20, 0.17, 0.28),
	vec3(0.24, 0.21, 0.31)
};

const vec3 FIRE_BG[6] = {
	vec3(0.01, 0.01, 0.03), vec3(0.02, 0.02, 0.05),
	vec3(0.03, 0.03, 0.07), vec3(0.05, 0.04, 0.09),
	vec3(0.06, 0.05, 0.10), vec3(0.07, 0.06, 0.12)
};

// ── Procedural hash helpers (no patterns visible at this scale) ──
float hash11(float p) {
	p = fract(p * 0.1031);
	p *= p + 33.33;
	p *= p + p;
	return fract(p);
}

vec2 hash21(float p) {
	vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}

// Evaluate one rock chunk at `pos` with directional shading and an
// irregular non-circular outline. Source-over accumulates into the layer.
void eval_chunk(
	vec2 frag_px, vec2 pos, float size, float seed, float alpha_mul,
	inout vec3 accum, inout float a_accum
) {
	if (a_accum >= 0.99) return;

	vec2 d2 = frag_px - pos;
	float r2 = dot(d2, d2);
	float max_r = size * 1.4;
	if (r2 > max_r * max_r) return;

	float r = sqrt(max(r2, 1e-6));
	vec2 nrm = d2 / r;

	// Irregular rocky outline via overlapping low-frequency wobbles.
	float wobble =
		  sin(nrm.x * 5.3 + seed * 1.3) * 0.18
		+ sin(nrm.y * 7.1 - seed * 0.7) * 0.12
		+ sin((nrm.x - nrm.y) * 6.5 + seed * 2.7) * 0.10;
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

		float spawn_x = r1.x * grid_pixel_size.x;
		float size    = mix(5.0, 11.0, r1.y);    // px radius

		// Vertical progress 0 (bottom) → 1 (top). Linear straight-up rise.
		float local_t = fract(t_abs / lifetime);
		float head_y  = grid_pixel_size.y * (1.0 - local_t);
		vec2  head    = vec2(spawn_x, head_y);

		// Lifetime envelope: fade in from bottom, fade out near top.
		float env = smoothstep(0.0, 0.06, local_t)
				  * (1.0 - smoothstep(0.88, 1.0, local_t));

		// Main rock chunk at the head.
		eval_chunk(frag_px, head, size, salt, env, accum, a_accum);

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
			float sub_life = mix(1.6, 3.4, sub_r1.x);

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

			eval_chunk(frag_px, cp, cs, salt + kf * 7.3, decay * env, accum, a_accum);
		}
	}

	return vec4(accum, a_accum);
}

void fragment() {
	vec2 px = UV * grid_pixel_size;

	// ── Block grid for raster images (1:2 fullblock cells) ──
	vec2 blk = floor(px / block_size);
	vec2 blk_center_uv = (blk + 0.5) * block_size / grid_pixel_size;

	vec4 out_color = vec4(0.0);
	bool hit = false;

	// ── Z-1: Logo (fullblock + dither12) ──
	if (logo_rect.z > 0.0) {
		vec2 luv = (blk_center_uv - logo_rect.xy) / logo_rect.zw;
		if (luv.x >= 0.0 && luv.x <= 1.0 && luv.y >= 0.0 && luv.y <= 1.0) {
			vec4 s = texture(logo_texture, luv);
			if (s.a > 0.5) {
				out_color = vec4(dither12(s.rgb, blk), 1.0);
				hit = true;
			}
		}
	}

	// ── Z-2: Sefirot (behind logo, fullblock + dither12) ──
	if (!hit && sefirot_rect.z > 0.0) {
		vec2 suv = (blk_center_uv - sefirot_rect.xy) / sefirot_rect.zw;
		if (suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0) {
			vec4 s = texture(sefirot_texture, suv);
			if (s.a > 0.5) {
				out_color = vec4(dither12(s.rgb, blk), 1.0);
				hit = true;
			}
		}
	}

	// ── Z-3: Fire background (glyph-atlas ASCII rendering) ──
	if (!hit) {
		int cell_x = clamp(int(floor(px.x / cell_size.x)), 0, grid_cols - 1);
		int cell_y = clamp(int(floor(px.y / cell_size.y)), 0, grid_rows - 1);
		float cx = float(cell_x) + 0.5;
		float cy = float(cell_y) + 0.5;

		// Voronoi cell noise
		float min_d = 99999.0;
		float sec_d = 99999.0;
		for (int i = 0; i < 10; i++) {
			float dx = cx - seeds[i].x;
			float dy = (cy - seeds[i].y) * 2.0;
			float d = sqrt(dx * dx + dy * dy);
			if (d < min_d) { sec_d = min_d; min_d = d; }
			else if (d < sec_d) { sec_d = d; }
		}

		float edge = sec_d - min_d;
		float pv = sin(min_d * 0.15 - time * 1.8) * 0.5 + 0.5;
		float ep = sin(edge * 0.5 - time * 1.2) * 0.5 + 0.5;
		float val = pv * 0.6 + ep * 0.4;

		int ci = clamp(int(val * 8.0), 0, 7);
		int fi = clamp(int((val * 0.7 + edge * 0.02) * 7.0), 0, 6);
		int bi = clamp(int(val * 6.0), 0, 5);

		int glyph_index = fire_glyphs[ci];
		vec3 fg_color = FIRE_FG[fi];
		vec3 bg_color = FIRE_BG[bi];

		// Sample glyph from atlas
		vec2 in_cell = vec2(
			(px.x - float(cell_x) * cell_size.x) / cell_size.x,
			(px.y - float(cell_y) * cell_size.y) / cell_size.y
		);
		int ax = glyph_index % atlas_cols;
		int ay = glyph_index / atlas_cols;
		vec2 atlas_uv = (vec2(float(ax), float(ay)) + in_cell) / vec2(float(atlas_cols), float(atlas_rows));
		float ga = texture(glyph_atlas, atlas_uv).a;

		out_color = vec4(mix(bg_color, fg_color, ga), 1.0);

		// ── Z-2.5: Particles drifting up, in front of fire, behind sefirot/logo ──
		vec4 p = particle_layer(blk_center_uv * grid_pixel_size);
		if (p.a > 0.0) {
			vec3 dithered = dither12(p.rgb / max(p.a, 1e-4), blk);
			out_color.rgb = mix(out_color.rgb, dithered, p.a);
		}
	}

	COLOR = out_color;
}
