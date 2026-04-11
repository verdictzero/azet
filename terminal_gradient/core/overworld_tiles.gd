class_name OverworldTiles
extends RefCounted
## Overworld tile factory + 3x3 expansion patterns.
##
## Direct port of the lush-biome subset of js/tileExpansion.js (patterns)
## plus the tile() constructor calls in js/world.js _terrainFromNoise /
## _generateHabitatTile. Tile heights come from Game.TILE_HEIGHTS in
## js/main.js:6417.
##
## The `null`-sentinel convention from the JS code (a pattern cell of
## `null` means "use the tile's center char") is represented here by the
## empty string "" since GDScript const arrays cannot embed null. The
## expand() consumer checks `cell == ""` to substitute.

# ── Tile type keys (subset used by the lush biome + walls) ──
const GRASSLAND := "GRASSLAND"
const MEADOW := "MEADOW"
const TALL_GRASS := "TALL_GRASS"
const FIELD := "FIELD"
const SCRUBLAND := "SCRUBLAND"
const BARREN_WASTE := "BARREN_WASTE"
const SPARSE_TREES := "SPARSE_TREES"
const FOREST := "FOREST"
const DEEP_FOREST := "DEEP_FOREST"
const CANOPY := "CANOPY"
const PINE_STAND := "PINE_STAND"
const RIVER_WATER := "RIVER_WATER"
const MEDIUM_WATER := "MEDIUM_WATER"
const SHALLOWS := "SHALLOWS"
const INNER_SHORE := "INNER_SHORE"
const OUTER_SHORE := "OUTER_SHORE"
const BRIDGE := "BRIDGE"
const MOUNTAIN := "MOUNTAIN"
const MOUNTAIN_BASE := "MOUNTAIN_BASE"
const HILL := "HILL"
const FOOTHILL := "FOOTHILL"
const ROLLING_HILLS := "ROLLING_HILLS"
const RIDGE := "RIDGE"
const ROCKY_SLOPE := "ROCKY_SLOPE"
const BOULDER_FIELD := "BOULDER_FIELD"
const SECTION_WALL := "SECTION_WALL"
const VOID_SPACE := "VOID_SPACE"

# ── Shadow-caster heights (js/main.js TILE_HEIGHTS) ──
const HEIGHTS := {
	"FOREST": 2,
	"DEEP_FOREST": 2,
	"CANOPY": 3,
	"PINE_STAND": 2,
	"SPARSE_TREES": 1,
	"TALL_GRASS": 1,
	"FIELD": 0,
	"MOUNTAIN": 4,
	"MOUNTAIN_BASE": 3,
	"HILL": 2,
	"FOOTHILL": 1,
	"ROLLING_HILLS": 2,
	"RIDGE": 3,
	"ROCKY_SLOPE": 2,
	"BOULDER_FIELD": 2,
	"SECTION_WALL": 4,
}

const WALKABLE := {
	"GRASSLAND": true, "MEADOW": true, "TALL_GRASS": true, "FIELD": true,
	"SCRUBLAND": true, "BARREN_WASTE": true,
	"SPARSE_TREES": true, "FOREST": true, "DEEP_FOREST": true,
	"CANOPY": true, "PINE_STAND": true,
	"INNER_SHORE": true, "OUTER_SHORE": true, "BRIDGE": true,
	"RIVER_WATER": false, "MEDIUM_WATER": false, "SHALLOWS": false,
	"MOUNTAIN": false, "MOUNTAIN_BASE": false,
	"HILL": true, "FOOTHILL": true, "ROLLING_HILLS": true, "RIDGE": true,
	"ROCKY_SLOPE": false, "BOULDER_FIELD": false,
	"SECTION_WALL": false, "VOID_SPACE": false,
}

# ── Vegetation set (for shadow halving + forest interior darkening) ──
const VEGETATION := {
	"FOREST": true, "DEEP_FOREST": true, "CANOPY": true, "PINE_STAND": true,
	"SPARSE_TREES": true, "TALL_GRASS": true,
	"TREE_CANOPY": true, "TREE_TRUNK": true, "TREE": true,
}


# ── 3x3 expansion patterns ──
# Empty string "" inside a pattern means "use the tile's own center char"
# (legacy JS used null; GDScript const arrays hold "" instead).

const FLOOR_3x3: Array = [
	[["·", ".", "·"], [".", "·", "."], ["·", ".", "·"]],
	[[".", "·", "."], [".", "·", "."], [".", "·", "."]],
	[[".", ".", "."], [".", "·", "."], [".", ".", "·"]],
]

# Grass — js/tileExpansion.js GRASS_3x3 lines 41-45. The original uses
# ',.`;·' chars; all three variants hash-picked per world position.
const GRASS_3x3: Array = [
	[[".", ",", "."], ["`", ".", ","], [".", ";", "."]],
	[[",", ".", "·"], [".", ".", ","], ["`", ".", "."]],
	[[".", ".", ","], [".", "·", "."], [",", ".", "."]],
]

const TALL_GRASS_3x3: Array = [
	[[".", "ı", ","], ["`", "ı", "."], [".", ",", "ı"]],
	[["ı", ".", "."], [".", "ı", ","], [".", ".", "`"]],
]

const MEADOW_3x3: Array = [
	[[",", "·", ","], ["·", ",", "·"], [".", ",", "·"]],
	[["·", ",", "."], [",", "·", ","], [".", ",", "."]],
]

# Tree (sparse forest) — clean club canopy with no trunk glyphs.
# Legacy js/tileExpansion.js TREE_3x3 had a `|` trunk which visually
# merged with adjacent ♣ glyphs into a spade-shaped silhouette at small
# font sizes. We drop the trunk entirely and use pure ♣ + ground dots so
# the canopy always reads as clubs.
const TREE_3x3: Array = [
	[[".", "♣", "."], ["♣", "♣", "♣"], [".", "♣", "."]],
	[[".", "♣", "."], ["♣", "♣", "♣"], [".", ".", "."]],
	[["♣", ".", "♣"], [".", "♣", "."], ["♣", ".", "♣"]],
]

# Deep forest — dense canopy. Solid ♣ grid with a couple of variant
# breaks for spatial variety. Tile char in OverworldWorld is ♣ so ""
# sentinels resolve correctly.
const DEEP_FOREST_3x3: Array = [
	[["♣", "♣", "♣"], ["♣", "♣", "♣"], ["♣", "♣", "♣"]],
	[["♣", "♣", "♣"], ["♣", "♣", "♣"], ["♣", "·", "♣"]],
	[["♣", "·", "♣"], ["♣", "♣", "♣"], ["♣", "♣", "♣"]],
]

const SPARSE_TREE_3x3: Array = [
	[[".", "", "."], [".", "·", "."], [".", ".", "."]],
	[[".", ".", "."], [".", "", "."], [".", ".", "."]],
]

# Water — ripple + flow. js/tileExpansion.js WATER_3x3 lines 102-105.
const WATER_3x3: Array = [
	[["~", "≈", "~"], ["≈", "~", "≈"], ["~", "≈", "~"]],
	[["≈", "~", "≈"], ["~", "≈", "~"], ["≈", "~", "≈"]],
]

# Hill — js/tileExpansion.js HILL_3x3 lines 133-136.
const HILL_3x3: Array = [
	[[".", "∩", "."], [".", "⌒", "."], [".", "∩", "."]],
	[["∩", ".", "⌒"], [".", "∩", "."], ["⌒", ".", "∩"]],
]

# Mountain — js/tileExpansion.js MOUNTAIN_3x3 lines 113-116.
const MOUNTAIN_3x3: Array = [
	[["▓", "△", "▓"], ["△", "▲", "△"], ["▓", "△", "▓"]],
	[["△", "▓", "△"], ["▓", "▲", "▓"], ["△", "▓", "△"]],
]

# Rock / mountain base — js/tileExpansion.js ROCK_3x3 lines 143-146.
const ROCK_3x3: Array = [
	[["▓", "▒", "▓"], ["▒", "█", "▒"], ["▓", "▒", "▓"]],
	[["▒", "▓", "▒"], ["▓", "▒", "▓"], ["▒", "▓", "▒"]],
]

# Bridge — js/tileExpansion.js BRIDGE_3x3 lines 470-473.
const BRIDGE_3x3: Array = [
	[["|", "=", "|"], ["=", "=", "="], ["|", "=", "|"]],
	[["═", "=", "═"], ["=", "═", "="], ["|", "=", "|"]],
]

# Wall — js/tileExpansion.js WALL_3x3 lines 17-21.
const WALL_3x3: Array = [
	[["█", "▓", "█"], ["▓", "#", "▓"], ["█", "▓", "█"]],
	[["▓", "█", "▓"], ["█", "#", "█"], ["▓", "█", "▓"]],
	[["█", "█", "█"], ["█", "▒", "█"], ["█", "█", "█"]],
]


# ── Factory ──

static func make(type: String, ch: String, fg: Color, bg: Color,
		walkable_override: Variant = null) -> Dictionary:
	var w: bool = walkable_override if walkable_override != null else WALKABLE.get(type, true)
	return {
		"type": type,
		"char": ch,
		"fg": fg,
		"bg": bg,
		"walkable": w,
	}


static func height(type: String) -> int:
	return HEIGHTS.get(type, 0)


static func is_vegetation(type: String) -> bool:
	return VEGETATION.has(type)


static func is_water(type: String) -> bool:
	return type == RIVER_WATER or type == SHALLOWS or type == MEDIUM_WATER


# ── Type → pattern mapping (mirrors js/tileExpansion.js TYPE_PATTERNS) ──
static func _patterns_for(type: String) -> Array:
	match type:
		GRASSLAND, FIELD, SCRUBLAND, BARREN_WASTE, \
		OUTER_SHORE, INNER_SHORE:
			return GRASS_3x3
		MEADOW:
			return MEADOW_3x3
		TALL_GRASS:
			return TALL_GRASS_3x3
		SPARSE_TREES:
			return SPARSE_TREE_3x3
		FOREST, PINE_STAND:
			return TREE_3x3
		DEEP_FOREST, CANOPY:
			return DEEP_FOREST_3x3
		RIVER_WATER, SHALLOWS, MEDIUM_WATER:
			return WATER_3x3
		BRIDGE:
			return BRIDGE_3x3
		MOUNTAIN:
			return MOUNTAIN_3x3
		MOUNTAIN_BASE, ROCKY_SLOPE, BOULDER_FIELD:
			return ROCK_3x3
		HILL, FOOTHILL, ROLLING_HILLS, RIDGE:
			return HILL_3x3
		SECTION_WALL:
			return WALL_3x3
	return []


# ── Spatial hash → variant picker ──
# Matches tileHash() in js/tileExpansion.js:797
static func _tile_hash(wx: int, wy: int) -> int:
	var h: int = ((wx * 73856093) ^ (wy * 19349663)) & 0x7FFFFFFF
	return h


# ── Expand a tile to 3x3 chars / fgs / bgs ──
static func expand(tile: Dictionary, wx: int, wy: int) -> Dictionary:
	var type: String = tile.type
	var base_char: String = tile.char
	var fg: Color = tile.fg
	var bg: Color = tile.bg
	var variants: Array = _patterns_for(type)

	var chars: Array = []
	var fgs: Array = []
	var bgs: Array = []

	if variants.is_empty():
		# Fallback: uniform fill.
		for dy in range(3):
			chars.append([base_char, base_char, base_char])
			fgs.append([fg, fg, fg])
			bgs.append([bg, bg, bg])
		return {"chars": chars, "fgs": fgs, "bgs": bgs}

	var variant: Array = variants[_tile_hash(wx, wy) % variants.size()]
	for dy in range(3):
		var row_c: Array = []
		var row_f: Array = []
		var row_b: Array = []
		for dx in range(3):
			var cell: String = variant[dy][dx]
			row_c.append(base_char if cell == "" else cell)
			row_f.append(fg)
			row_b.append(bg)
		chars.append(row_c)
		fgs.append(row_f)
		bgs.append(row_b)
	return {"chars": chars, "fgs": fgs, "bgs": bgs}
