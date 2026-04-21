class_name BiomeField
extends RefCounted
## Static helpers for the terrain-splat noise field. The CPU mirror of
## `assets/shaders/terrain_splat.gdshader`'s hash → value_noise → 4-octave fbm,
## plus a chunk-local density-grid cache so placement code can ask
## "is this meadow?" with a bilinear grid tap instead of a fresh FBM.
##
## Hash/FBM math is duplicated by necessity (CPU vs GLSL) and must match the
## shader byte-for-byte. Tunables (frequency / threshold / softness) live in
## BiomeConfig and are shared across both sides — see `biome_config.gd`.

# ── Core noise (must mirror terrain_splat.gdshader) ──

static func hash21(px: float, pz: float) -> float:
	var fx: float = fposmod(px * 123.34, 1.0)
	var fz: float = fposmod(pz * 456.21, 1.0)
	var d: float = fx * (fx + 45.32) + fz * (fz + 45.32)
	return fposmod((fx + d) * (fz + d), 1.0)


static func value_noise(px: float, pz: float) -> float:
	var ix: float = floor(px)
	var iz: float = floor(pz)
	var fx: float = px - ix
	var fz: float = pz - iz
	var ux: float = fx * fx * (3.0 - 2.0 * fx)
	var uz: float = fz * fz * (3.0 - 2.0 * fz)
	var a: float = hash21(ix, iz)
	var b: float = hash21(ix + 1.0, iz)
	var c: float = hash21(ix, iz + 1.0)
	var d: float = hash21(ix + 1.0, iz + 1.0)
	return lerp(lerp(a, b, ux), lerp(c, d, ux), uz)


static func fbm(px: float, pz: float) -> float:
	var v: float = 0.0
	var a: float = 0.5
	var x: float = px
	var z: float = pz
	# 6 octaves — must stay matched to terrain_splat.gdshader's fbm.
	for _i in 6:
		v += a * value_noise(x, z)
		x *= 2.03
		z *= 2.03
		a *= 0.5
	return v


# Apply the same domain-warp the shader does: perturb the sample coordinate
# with two independent value-noise lookups before evaluating the main FBM.
# Must stay byte-identical to the shader branch in terrain_splat.gdshader so
# vegetation placement aligns with the visible splat.
static func _warp_then_fbm(wx: float, wz: float, config: BiomeConfig) -> float:
	var amp: float = config.warp_amp
	if amp > 0.0:
		var wf: float = config.warp_freq
		var warp_x: float = value_noise(wx * wf + 7.3, wz * wf + 11.1) - 0.5
		var warp_z: float = value_noise(wx * wf + 23.7, wz * wf + 37.3) - 0.5
		wx += warp_x * amp
		wz += warp_z * amp
	return fbm(wx * config.noise_freq, wz * config.noise_freq)


static func sample_world(wx: float, wz: float, config: BiomeConfig) -> float:
	return _warp_then_fbm(wx, wz, config)


# ── Per-chunk density grid ────────────────────────────────

# Bake an N×N grid of fbm samples covering [origin, origin + chunk_size)^2.
# Grid is row-major with `grid_n` samples per side; samples are taken at the
# exact cell corners (0..N-1 inclusive → spans chunk_size evenly). The
# returned PackedFloat32Array has `grid_n * grid_n` entries.
static func bake_chunk_density_grid(origin_x: float, origin_z: float,
		chunk_size: float, grid_n: int, config: BiomeConfig) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(grid_n * grid_n)
	var step: float = chunk_size / float(grid_n - 1)
	for iz in grid_n:
		var wz: float = origin_z + float(iz) * step
		for ix in grid_n:
			var wx: float = origin_x + float(ix) * step
			out[iz * grid_n + ix] = _warp_then_fbm(wx, wz, config)
	return out


# Bilinear lookup into a density grid baked by `bake_chunk_density_grid`.
# `local_x` / `local_z` are chunk-relative in [0, chunk_size]; values outside
# that range are clamped to the grid edge — see the plan's edge-leak note.
static func sample_density_grid(grid: PackedFloat32Array, grid_n: int,
		local_x: float, local_z: float, chunk_size: float) -> float:
	var fx: float = clampf(local_x / chunk_size, 0.0, 1.0) * float(grid_n - 1)
	var fz: float = clampf(local_z / chunk_size, 0.0, 1.0) * float(grid_n - 1)
	var ix0: int = int(floor(fx))
	var iz0: int = int(floor(fz))
	var ix1: int = mini(ix0 + 1, grid_n - 1)
	var iz1: int = mini(iz0 + 1, grid_n - 1)
	var tx: float = fx - float(ix0)
	var tz: float = fz - float(iz0)
	var a: float = grid[iz0 * grid_n + ix0]
	var b: float = grid[iz0 * grid_n + ix1]
	var c: float = grid[iz1 * grid_n + ix0]
	var d: float = grid[iz1 * grid_n + ix1]
	return lerp(lerp(a, b, tx), lerp(c, d, tx), tz)


static func is_meadow(density: float, config: BiomeConfig) -> bool:
	return density > config.meadow_cull_gate()
