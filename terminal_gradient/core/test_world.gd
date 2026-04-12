class_name TestWorld
extends RefCounted
## Infinite procedural overworld. Every tile is a pure function of (x, y)
## and the world seed, sampled from a handful of Perlin noise channels.
##
## Biome rules (first match wins):
##   1. River       — sinuous water carved from a domain-warped ridge noise
##   2. Floodland   — low elevation tiles adjacent to rivers
##   3. Deep forest — high moisture + mid elevation
##   4. Forest      — moderate moisture
##   5. Dirt patch  — high dirt noise
##   6. Grassland   — default
##
## No chunk cache. A screen draws ~200-400 cells/frame which a Perlin
## sample handles trivially. If a future feature needs persistent
## per-tile state, add the cache then.

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
const FLOOD_RIVER_RADIUS: int = 3       # cells within this range count as "near river"
const DEEP_FOREST_MOIST: float = 0.35
const FOREST_MOIST: float = 0.08
const DIRT_THRESH: float = 0.32

# ── Palette (pulled from Constants.COLORS) ────────
var _c_grass_fg: Color
var _c_grass_fg2: Color
var _c_grass_bg: Color
var _c_dirt_fg: Color
var _c_dirt_bg: Color
var _c_forest_fg: Color
var _c_forest_bg: Color
var _c_deep_forest_fg: Color
var _c_deep_forest_bg: Color
var _c_flood_fg: Color
var _c_flood_bg: Color
var _c_river_fg: Color
var _c_river_fg2: Color
var _c_river_bg: Color

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

	# Natural earthy palette. Backgrounds are intentionally dark so the
	# glyph reads as the focal point of each cell.
	_c_grass_fg       = Constants.COLORS.BRIGHT_GREEN
	_c_grass_fg2      = Constants.COLORS.GREEN
	_c_grass_bg       = Color(0.04, 0.08, 0.04)
	_c_dirt_fg        = Constants.COLORS.YELLOW
	_c_dirt_bg        = Color(0.10, 0.07, 0.03)
	_c_forest_fg      = Constants.COLORS.GREEN
	_c_forest_bg      = Color(0.03, 0.06, 0.03)
	_c_deep_forest_fg = Color(0.10, 0.45, 0.18)
	_c_deep_forest_bg = Color(0.02, 0.04, 0.02)
	_c_flood_fg       = Constants.COLORS.BRIGHT_CYAN
	_c_flood_bg       = Color(0.03, 0.08, 0.09)
	_c_river_fg       = Constants.COLORS.BRIGHT_CYAN
	_c_river_fg2      = Constants.COLORS.CYAN
	_c_river_bg       = Color(0.02, 0.05, 0.12)


# ── Public API ────────────────────────────────────

func get_biome(x: int, y: int) -> int:
	var river_v: float = _river_ridge(x, y)
	if river_v < RIVER_THRESH:
		return Biome.RIVER

	var elev: float = _n_elev.noise_2d(float(x) * ELEVATION_FREQ, float(y) * ELEVATION_FREQ)
	if elev < FLOOD_ELEV and _near_river(x, y):
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


func get_tile(x: int, y: int) -> Dictionary:
	var biome: int = get_biome(x, y)
	var d: float = _n_detail.noise_2d(float(x) * DETAIL_FREQ, float(y) * DETAIL_FREQ)
	match biome:
		Biome.RIVER:
			var glyph: String = "≈" if d > 0.25 else ("~" if d > -0.25 else " ")
			var fg: Color = _c_river_fg if d > 0.0 else _c_river_fg2
			return {
				"glyph": glyph, "fg": fg, "bg": _c_river_bg,
				"walkable": false, "biome": biome,
			}
		Biome.FLOODLAND:
			var glyph_f: String = "," if d > 0.0 else "."
			return {
				"glyph": glyph_f, "fg": _c_flood_fg, "bg": _c_flood_bg,
				"walkable": true, "biome": biome,
			}
		Biome.DEEP_FOREST:
			var glyph_df: String = "♣" if d > -0.1 else "♠"
			return {
				"glyph": glyph_df, "fg": _c_deep_forest_fg, "bg": _c_deep_forest_bg,
				"walkable": true, "biome": biome,
			}
		Biome.FOREST:
			var glyph_fo: String
			if d > 0.3:
				glyph_fo = "♣"
			elif d > -0.1:
				glyph_fo = "♠"
			else:
				glyph_fo = "\""
			return {
				"glyph": glyph_fo, "fg": _c_forest_fg, "bg": _c_forest_bg,
				"walkable": true, "biome": biome,
			}
		Biome.DIRT:
			var glyph_d: String = "·" if d > 0.0 else ","
			return {
				"glyph": glyph_d, "fg": _c_dirt_fg, "bg": _c_dirt_bg,
				"walkable": true, "biome": biome,
			}
		_:
			# Grassland
			var glyph_g: String
			if d > 0.3:
				glyph_g = "\""
			elif d > -0.1:
				glyph_g = ","
			else:
				glyph_g = "."
			var fg_g: Color = _c_grass_fg if d > 0.1 else _c_grass_fg2
			return {
				"glyph": glyph_g, "fg": fg_g, "bg": _c_grass_bg,
				"walkable": true, "biome": biome,
			}


func is_walkable(x: int, y: int) -> bool:
	return get_biome(x, y) != Biome.RIVER


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


func _near_river(x: int, y: int) -> bool:
	## Cheap neighborhood check — sample the ridge at a few offsets rather
	## than every cell within the radius. Misses some edge cases but runs
	## ~10× faster than a full disc scan.
	var r: int = FLOOD_RIVER_RADIUS
	for dy in [-r, 0, r]:
		for dx in [-r, 0, r]:
			if dx == 0 and dy == 0:
				continue
			if _river_ridge(x + dx, y + dy) < RIVER_THRESH:
				return true
	return false
