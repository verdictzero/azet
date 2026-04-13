class_name TestWorld
extends RefCounted
## Infinite procedural overworld. Every tile is a pure function of (x, y)
## and the world seed, sampled from a handful of Perlin noise channels.
##
## Biome rules (first match wins):
##   1. River       — sinuous water carved from a domain-warped ridge noise
##   2. Floodland   — low elevation tiles whose ridge value is still close
##                    to the river threshold (i.e. just-outside-river)
##   3. Deep forest — high moisture + mid elevation
##   4. Forest      — moderate moisture
##   5. Dirt patch  — high dirt noise
##   6. Grassland   — default
##
## Per-tile cost: 5 Perlin samples on rivers, 8 everywhere else. No
## Dictionary allocation — callers get the biome enum and a detail float
## and pick glyph/colors themselves.

enum Biome {
	GRASSLAND,
	DIRT,
	FOREST,
	DEEP_FOREST,
	FLOODLAND,
	RIVER,
}

# ── Noise frequencies ─────────────────────────────
const ELEVATION_FREQ: float = 0.012
const MOISTURE_FREQ: float = 0.030
const DIRT_FREQ: float = 0.070
const RIVER_FREQ_A: float = 0.018
const RIVER_FREQ_B: float = 0.034
const RIVER_WARP_FREQ: float = 0.009
const RIVER_WARP_AMP: float = 18.0
const DETAIL_FREQ: float = 0.22

# ── Biome thresholds ──────────────────────────────
const RIVER_THRESH: float = 0.06        # abs(ridge) < this → river
const FLOOD_ELEV: float = -0.15          # elevation below this near rivers → floodland
# Floodland is defined as low-elev AND "just outside" the river centerline.
# Reusing the ridge value that's already been sampled means flood detection
# adds zero extra Perlin samples.
const FLOOD_RIDGE_MULT: float = 2.5     # river_ridge < RIVER_THRESH * this → near river
const DEEP_FOREST_MOIST: float = 0.35
const FOREST_MOIST: float = 0.08
const DIRT_THRESH: float = 0.32

var _world_seed: int
var _n_elev: PerlinNoise
var _n_moist: PerlinNoise
var _n_dirt: PerlinNoise
var _n_river_a: PerlinNoise
var _n_river_b: PerlinNoise
var _n_warp_x: PerlinNoise
var _n_warp_y: PerlinNoise
var _n_detail: PerlinNoise


func _init(world_seed: int = 0) -> void:
	if world_seed == 0:
		world_seed = randi()
	_world_seed = world_seed
	# Each channel gets its own salt so they stay uncorrelated.
	_n_elev    = PerlinNoise.new(SeededRNG.new(world_seed ^ 0x1A3F))
	_n_moist   = PerlinNoise.new(SeededRNG.new(world_seed ^ 0x5B91))
	_n_dirt    = PerlinNoise.new(SeededRNG.new(world_seed ^ 0x7C42))
	_n_river_a = PerlinNoise.new(SeededRNG.new(world_seed ^ 0x2DD7))
	_n_river_b = PerlinNoise.new(SeededRNG.new(world_seed ^ 0x9E03))
	_n_warp_x  = PerlinNoise.new(SeededRNG.new(world_seed ^ 0x4158))
	_n_warp_y  = PerlinNoise.new(SeededRNG.new(world_seed ^ 0x6AB4))
	_n_detail  = PerlinNoise.new(SeededRNG.new(world_seed ^ 0x8F27))


# ── Public API ────────────────────────────────────

func get_biome(x: int, y: int) -> int:
	var ridge: float = _river_ridge(x, y)
	if ridge < RIVER_THRESH:
		return Biome.RIVER

	var elev: float = _n_elev.noise_2d(float(x) * ELEVATION_FREQ, float(y) * ELEVATION_FREQ)
	if elev < FLOOD_ELEV and ridge < RIVER_THRESH * FLOOD_RIDGE_MULT:
		return Biome.FLOODLAND

	var moist: float = _n_moist.noise_2d(float(x) * MOISTURE_FREQ, float(y) * MOISTURE_FREQ)
	if moist > DEEP_FOREST_MOIST and elev > -0.05:
		return Biome.DEEP_FOREST
	if moist > FOREST_MOIST:
		return Biome.FOREST

	var dirt: float = _n_dirt.noise_2d(float(x) * DIRT_FREQ, float(y) * DIRT_FREQ)
	if dirt > DIRT_THRESH:
		return Biome.DIRT

	return Biome.GRASSLAND


func get_detail(x: int, y: int) -> float:
	## High-frequency variation channel. Callers use this to pick glyph
	## variants within a biome without needing a second RNG.
	return _n_detail.noise_2d(float(x) * DETAIL_FREQ, float(y) * DETAIL_FREQ)


func is_walkable(x: int, y: int) -> bool:
	return get_biome(x, y) != Biome.RIVER


func get_height(x: int, y: int) -> float:
	## Per-tile height used by the lighting / shadow pass in
	## assets/shaders/ascii_grid.gdshader. Pure function of (biome, detail),
	## so no persistent tile store is needed.
	##   ~0.0   = flat ground (grass, dirt)
	##   >0     = occluders that cast shadows (trees, buildings)
	##   <0     = indents that sit below ground level (rivers, pits)
	## FUTURE: buildings placed on top of the procedural biome pass should
	## override this with e.g. 3.0; excavated pits with e.g. -0.6.
	var b: int = get_biome(x, y)
	var d: float = get_detail(x, y)
	match b:
		Biome.RIVER:
			return -0.4
		Biome.FLOODLAND:
			return -0.15
		Biome.DEEP_FOREST:
			return 2.2 + d * 0.4
		Biome.FOREST:
			if d > 0.3:
				return 1.8
			elif d > -0.1:
				return 1.2
			else:
				return 0.05
		Biome.DIRT:
			return 0.0
		_:
			return 0.02 if d > 0.1 else 0.0


# ── Internal ──────────────────────────────────────

func _river_ridge(x: int, y: int) -> float:
	## Domain-warped ridge noise. Two low-frequency channels warped by a
	## third produce sinuous, branching curves when thresholded near zero.
	## Returns abs(combined), so smaller values = closer to a river centerline.
	var fx: float = float(x)
	var fy: float = float(y)
	var wx: float = _n_warp_x.noise_2d(fx * RIVER_WARP_FREQ, fy * RIVER_WARP_FREQ) * RIVER_WARP_AMP
	var wy: float = _n_warp_y.noise_2d(fx * RIVER_WARP_FREQ + 37.0, fy * RIVER_WARP_FREQ - 19.0) * RIVER_WARP_AMP
	var a: float = _n_river_a.noise_2d((fx + wx) * RIVER_FREQ_A, (fy + wy) * RIVER_FREQ_A)
	var b: float = _n_river_b.noise_2d((fx + wx) * RIVER_FREQ_B, (fy + wy) * RIVER_FREQ_B)
	return absf(a * 0.7 + b * 0.3)
