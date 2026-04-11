class_name OverworldWorld
extends RefCounted
## Chunk-streaming overworld with cylindrical Y wrap and fixed X walls.
##
## Ports the single-habitat-section slice of js/world.js ChunkManager +
## SectionManager. The full legacy pipeline has 9 sections (C2 + H1..H7 +
## ENG) with inner-hull corridors between them; for the demo we run ONE
## lush habitat section so the player sees faithful terrain without
## drowning in the facility/corridor code paths.
##
## Coordinate system (all int):
##   wx            world x (0..section_width_tiles-1)
##   wy            world y (wraps modulo section_height_tiles — infinite scroll)
##   cx, cy        chunk x/y (wx / CHUNK_SIZE, wy / CHUNK_SIZE)
##   lx, ly        local x/y within a chunk (0..CHUNK_SIZE-1)

const CHUNK_SIZE: int = 32
const TERRAIN_SCALE: float = 0.02

# Section dimensions — single lush habitat (js/world.js:490-491).
const HABITAT_WIDTH_CHUNKS: int = 128   # ~4096 tiles E-W
const HABITAT_WRAP_CHUNKS: int = 512    # ~16384 tiles N-S (cylindrical wrap)

# Wall thickness (js/world.js:497).
const WALL_THICKNESS: int = 7

# Rivers (js/world.js:735-739).
const RIVER_SPACING: int = 125
const RIVER_MEANDER_AMP: float = 35.0
const RIVER_MEANDER_FREQ: float = 0.015
const RIVER_HALF_WIDTH: int = 3
const RIVER_SHORE_WIDTH: int = 2

# Wall gradient — 7 tiles, outermost at index 0, habitat-side at index 6.
# Exact port of js/world.js:500-508 WALL_GRADIENT.
const WALL_GRADIENT: Array = [
	{"char": "█", "fg": "#556677", "bg": "#181830"},
	{"char": "█", "fg": "#556677", "bg": "#161626"},
	{"char": "█", "fg": "#4E5E6E", "bg": "#141422"},
	{"char": "█", "fg": "#4A5A6A", "bg": "#12121E"},
	{"char": "▓", "fg": "#445566", "bg": "#10101A"},
	{"char": "▒", "fg": "#3A4A5A", "bg": "#0D0D16"},
	{"char": "░", "fg": "#334455", "bg": "#0A0A12"},
]


# ── State ──
var seed_val: int
var section_width_tiles: int
var section_height_tiles: int

# Chunk cache keyed by "cx,cy"
var _chunks: Dictionary = {}

# Noise fields
var _height_noise: PerlinNoise
var _moisture_noise: PerlinNoise
var _detail_noise: PerlinNoise
var _river_noise: PerlinNoise
var _temperature_noise: PerlinNoise


func _init(world_seed: int = 20260411) -> void:
	seed_val = world_seed
	section_width_tiles = HABITAT_WIDTH_CHUNKS * CHUNK_SIZE
	section_height_tiles = HABITAT_WRAP_CHUNKS * CHUNK_SIZE

	# Match js/world.js:776-784 ChunkManager constructor exactly — one
	# SeededRNG feeds all noise streams in a specific order so a given
	# world seed produces the same permutation tables as the legacy. We
	# burn slots for anomaly and tear (used by other biomes) so our
	# downstream noise generators align with the legacy sequence.
	var rng := SeededRNG.new(world_seed)
	_height_noise = PerlinNoise.new(rng)
	_moisture_noise = PerlinNoise.new(rng)
	var _unused_anomaly := PerlinNoise.new(rng)
	_detail_noise = PerlinNoise.new(rng)
	_temperature_noise = PerlinNoise.new(rng)
	var _unused_tear := PerlinNoise.new(rng)
	_river_noise = PerlinNoise.new(rng)


# ── Public tile lookup ──

func get_tile(wx: int, wy: int) -> Dictionary:
	## Return the tile at (wx, wy). wx beyond the section returns VOID_SPACE
	## (which the renderer replaces with the circuitry background). wy wraps
	## cylindrically for infinite vertical scroll.
	var wrapped_y: int = _wrap_y(wy)
	if wx < 0 or wx >= section_width_tiles:
		return _make_void_tile()
	var cx: int = wx / CHUNK_SIZE
	var cy: int = wrapped_y / CHUNK_SIZE
	var chunk: Array = _get_or_build_chunk(cx, cy)
	var lx: int = wx - cx * CHUNK_SIZE
	var ly: int = wrapped_y - cy * CHUNK_SIZE
	return chunk[ly][lx]


static func _make_void_tile() -> Dictionary:
	return OverworldTiles.make(
		OverworldTiles.VOID_SPACE, " ", Color.BLACK, Color.BLACK, false
	)


func is_walkable(wx: int, wy: int) -> bool:
	if wx < 0 or wx >= section_width_tiles:
		return false
	return get_tile(wx, wy).walkable


func wrap_y(wy: int) -> int:
	return _wrap_y(wy)


# ── Chunk building ──

func _wrap_y(wy: int) -> int:
	var h: int = section_height_tiles
	return ((wy % h) + h) % h


func _chunk_key(cx: int, cy: int) -> String:
	return "%d,%d" % [cx, cy]


func _get_or_build_chunk(cx: int, cy: int) -> Array:
	var key: String = _chunk_key(cx, cy)
	if _chunks.has(key):
		return _chunks[key]
	var chunk: Array = _generate_chunk(cx, cy)
	_chunks[key] = chunk
	return chunk


func _generate_chunk(cx: int, cy: int) -> Array:
	## Build a CHUNK_SIZE × CHUNK_SIZE tile grid at (cx, cy).
	## Mirrors js/world.js:1300-1356 (habitat branch only).
	var tiles: Array = []
	var ox: int = cx * CHUNK_SIZE
	var oy: int = cy * CHUNK_SIZE
	for ly in range(CHUNK_SIZE):
		var row: Array = []
		for lx in range(CHUNK_SIZE):
			row.append(_generate_tile(ox + lx, oy + ly))
		tiles.append(row)

	# Post-process: place bridges where rivers cross spans. The legacy does
	# this via `_placeBridgeLocations` which scans for 3..9-wide water runs
	# and drops a plank road across.
	_place_bridges(cx, cy, tiles)
	return tiles


# ── Tile generation ──

func _generate_tile(wx: int, wy: int) -> Dictionary:
	# Section walls on the left and right edges of the section (7-thick).
	var wall_dist: int = -1
	if wx < WALL_THICKNESS:
		wall_dist = wx
	elif wx >= section_width_tiles - WALL_THICKNESS:
		wall_dist = section_width_tiles - 1 - wx
	if wall_dist >= 0:
		return _make_wall_tile(wall_dist)

	# Rivers (with cylindrical Y wrap consideration — rivers use the
	# wrapped coord so they loop smoothly).
	var river_dist: float = _get_river_distance(wx, wy)
	if river_dist <= float(RIVER_HALF_WIDTH):
		return _water_tile(wx, wy, river_dist)
	if river_dist <= float(RIVER_HALF_WIDTH + 1):
		return _inner_shore_tile(wx, wy)
	if river_dist <= float(RIVER_HALF_WIDTH + RIVER_SHORE_WIDTH):
		return _outer_shore_tile(wx, wy)

	# Base habitat terrain.
	return _terrain_from_noise(wx, wy)


func _terrain_from_noise(wx: int, wy: int) -> Dictionary:
	## Exact port of js/world.js:266-285 _terrainFromNoise for the lush
	## habitat. h drives the biome band; d jitters the grassland prox
	## gradient. Moisture, temperature, and anomaly noises exist in the
	## legacy for non-lush biomes but are unused in this path.
	var h: float = (_height_noise.fbm(
		float(wx) * TERRAIN_SCALE, float(wy) * TERRAIN_SCALE, 6
	) + 1.0) * 0.5
	var d: float = (_detail_noise.fbm(
		float(wx) * TERRAIN_SCALE * 2.0, float(wy) * TERRAIN_SCALE * 2.0, 3
	) + 1.0) * 0.5

	# GRASSLAND (h < 0.55) — lush vivid green → muted yellow-green near forest.
	if h < 0.55:
		var prox: float = clampf(h / 0.55, 0.0, 1.0)
		prox = clampf(prox + (d - 0.5) * 0.15, 0.0, 1.0)
		var fg: Color = _lerp_color(Color("#33dd44"), Color("#99aa33"), prox)
		var bg: Color = _lerp_color(Color("#0a2210"), Color("#1a1a08"), prox)
		return OverworldTiles.make(OverworldTiles.GRASSLAND, ".", fg, bg)

	# FOREST (h 0.55 - 0.62).
	if h < 0.62:
		return OverworldTiles.make(
			OverworldTiles.FOREST, "♣",
			Color("#22AA22"), Color("#0a1a0a")
		)

	# DEEP_FOREST (h 0.62 - 0.70). Uses ♣ (clubs) so all tree tops render
	# with the same glyph — deep forest is just denser and darker-green.
	if h < 0.70:
		return OverworldTiles.make(
			OverworldTiles.DEEP_FOREST, "♣",
			Color("#116611"), Color("#060f06")
		)

	# MOUNTAIN_BASE (h 0.70 - 0.82) — dense shade-block terrain.
	if h < 0.82:
		return OverworldTiles.make(
			OverworldTiles.MOUNTAIN_BASE, "▓",
			Color("#AAAAAA"), Color("#333333")
		)

	# MOUNTAIN (h > 0.82) — peak with outlined triangles.
	return OverworldTiles.make(
		OverworldTiles.MOUNTAIN, "△",
		Color("#BBBBBB"), Color("#444444")
	)


# ── Rivers ──
# Horizontal meandering rivers spaced every RIVER_SPACING tiles vertically.
# Ported from js/world.js:850-868 _getRiverDistance / _getRiverCenterY.

func _get_river_center_y(wx: int, river_index: int) -> int:
	var base_y: float = float(river_index) * float(RIVER_SPACING)
	var offset: float = float(river_index) * 1000.0
	var noise_val: float = _river_noise.fbm(
		float(wx) * RIVER_MEANDER_FREQ + offset, 0.5, 3
	)
	return int(round(base_y + noise_val * RIVER_MEANDER_AMP))


func _get_river_distance(wx: int, wy: int) -> float:
	var base_index: int = int(round(float(wy) / float(RIVER_SPACING)))
	var min_dist: float = 999999.0
	for di in range(-1, 2):
		var ri: int = base_index + di
		var center_y: int = _get_river_center_y(wx, ri)
		var dist: float = abs(float(wy - center_y))
		if dist < min_dist:
			min_dist = dist
	return min_dist


func _water_tile(wx: int, wy: int, river_dist: float) -> Dictionary:
	# Depth gradient: deep center → shallow edges (js/world.js:963-977).
	var depth_frac: float = 1.0 - river_dist / float(RIVER_HALF_WIDTH)
	if depth_frac > 0.7:
		return OverworldTiles.make(
			OverworldTiles.MEDIUM_WATER, "~",
			Color("#2266CC"), Color("#000022")
		)
	if depth_frac > 0.35:
		return OverworldTiles.make(
			OverworldTiles.RIVER_WATER, "~",
			Color("#4488ff"), Color("#001144")
		)
	# Shallow edges — brightest.
	var d: float = (_detail_noise.fbm(
		float(wx) * 0.22 + 17.0, float(wy) * 0.22 + 17.0, 2
	) + 1.0) * 0.5
	var sfg: Color = _lerp_color(Color("#4488ff"), Color("#5599ff"), d)
	return OverworldTiles.make(
		OverworldTiles.SHALLOWS, "~",
		sfg, Color("#002266")
	)


func _inner_shore_tile(wx: int, wy: int) -> Dictionary:
	var d: float = (_detail_noise.fbm(
		float(wx) * 0.22, float(wy) * 0.22, 2
	) + 1.0) * 0.5
	var prox: float = 0.3 + d * 0.4
	var fg: Color = _lerp_color(Color("#8B7D5B"), Color("#C2B280"), prox)
	var bg: Color = _lerp_color(Color("#2A2210"), Color("#3D3418"), prox)
	return OverworldTiles.make(OverworldTiles.INNER_SHORE, "·", fg, bg)


func _outer_shore_tile(wx: int, wy: int) -> Dictionary:
	var d: float = (_detail_noise.fbm(
		float(wx) * 0.22 + 99.0, float(wy) * 0.22 + 99.0, 2
	) + 1.0) * 0.5
	var prox: float = 0.5 + d * 0.3
	var fg: Color = _lerp_color(Color("#C2B280"), Color("#88AA55"), prox)
	var bg: Color = _lerp_color(Color("#3D3418"), Color("#1A2210"), prox)
	return OverworldTiles.make(OverworldTiles.OUTER_SHORE, ".", fg, bg)


# ── Bridges ──
# Scan each chunk row for water spans up to 9 wide and drop a plank bridge
# once every ~14 tiles of Y distance. Simpler than the legacy
# `_placeBridgeLocations` but visually equivalent in this demo.

func _place_bridges(cx: int, cy: int, tiles: Array) -> void:
	var ox: int = cx * CHUNK_SIZE
	var oy: int = cy * CHUNK_SIZE
	for ly in range(CHUNK_SIZE):
		var wy: int = oy + ly
		# Only place bridges on every ~14th row (deterministic by wy).
		if (wy * 31 + 7) % 14 != 0:
			continue
		# Find the first contiguous water span in this row (inside chunk bounds).
		var lx: int = 0
		while lx < CHUNK_SIZE:
			if _is_water_type(tiles[ly][lx].type):
				var start: int = lx
				while lx < CHUNK_SIZE and _is_water_type(tiles[ly][lx].type):
					lx += 1
				var end: int = lx - 1
				# Replace the water run with bridge planks.
				for bx in range(start, end + 1):
					tiles[ly][bx] = OverworldTiles.make(
						OverworldTiles.BRIDGE, "=",
						Color("#aa6622"), Color("#221100")
					)
				break
			lx += 1


func _is_water_type(type: String) -> bool:
	return (
		type == OverworldTiles.RIVER_WATER
		or type == OverworldTiles.SHALLOWS
		or type == OverworldTiles.MEDIUM_WATER
	)


# ── Walls ──

func _make_wall_tile(wall_dist: int) -> Dictionary:
	var d: int = clampi(wall_dist, 0, WALL_GRADIENT.size() - 1)
	var grad: Dictionary = WALL_GRADIENT[d]
	return OverworldTiles.make(
		OverworldTiles.SECTION_WALL,
		grad.char,
		Color(grad.fg),
		Color(grad.bg),
		false
	)


# ── Helpers ──

static func _lerp_color(a: Color, b: Color, t: float) -> Color:
	return a.lerp(b, clampf(t, 0.0, 1.0))
