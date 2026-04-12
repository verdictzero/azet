class_name OverworldTiles
extends RefCounted
## Overworld tile factory + 6x6 expansion patterns.
##
## Each world tile expands to a TILE_DENSITY × TILE_DENSITY grid of gfx
## cells. At TILE_DENSITY=6 that's 36 cells per tile, giving room for
## detailed ASCII art (clustered ♣ canopies, peaked mountains with shaded
## bases, flowing ~≈∿ rivers, vertical ║═─ plank bridges, etc.).
##
## The `""` sentinel inside a pattern means "use the tile's own center
## char" — kept from the legacy port for pattern compactness. `expand()`
## substitutes it at render time.
##
## Section walls are handled specially: `expand()` picks from
## `WALL_6x6_LEVELS` indexed by the `wall_level` field that
## `OverworldWorld._make_wall_tile` stashes on the tile dict.

# ── Tile type keys ──
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
const BUSH := "BUSH"
const RIVER_WATER := "RIVER_WATER"
const MEDIUM_WATER := "MEDIUM_WATER"
const SHALLOWS := "SHALLOWS"
const INNER_SHORE := "INNER_SHORE"
const OUTER_SHORE := "OUTER_SHORE"
const BRIDGE := "BRIDGE"
const MOUNTAIN := "MOUNTAIN"
const MOUNTAIN_BASE := "MOUNTAIN_BASE"
const HIGH_PEAK := "HIGH_PEAK"
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
	"BUSH": 1,
	"FIELD": 0,
	"MOUNTAIN": 4,
	"MOUNTAIN_BASE": 3,
	"HIGH_PEAK": 5,
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
	"SCRUBLAND": true, "BARREN_WASTE": true, "BUSH": true,
	"SPARSE_TREES": true, "FOREST": true, "DEEP_FOREST": true,
	"CANOPY": true, "PINE_STAND": true,
	"INNER_SHORE": true, "OUTER_SHORE": true, "BRIDGE": true,
	"RIVER_WATER": false, "MEDIUM_WATER": false, "SHALLOWS": false,
	"MOUNTAIN": false, "MOUNTAIN_BASE": false, "HIGH_PEAK": false,
	"HILL": true, "FOOTHILL": true, "ROLLING_HILLS": true, "RIDGE": true,
	"ROCKY_SLOPE": false, "BOULDER_FIELD": true,
	"SECTION_WALL": false, "VOID_SPACE": false,
}

# ── Vegetation set (shadow halving + forest interior darkening) ──
const VEGETATION := {
	"FOREST": true, "DEEP_FOREST": true, "CANOPY": true, "PINE_STAND": true,
	"SPARSE_TREES": true, "TALL_GRASS": true, "BUSH": true,
	"TREE_CANOPY": true, "TREE_TRUNK": true, "TREE": true,
}


# ── 6×6 expansion patterns ─────────────────────────
# "" = "use the tile's own center char".

# Grassland — sparse dots with occasional wind tuft or flower.
const GRASS_6x6: Array = [
	[[".", ",", ".", "`", ".", ","],
	 [",", ".", "·", ".", ",", "."],
	 [".", "`", ".", ",", ".", "·"],
	 ["·", ".", ",", ".", "`", ","],
	 [".", ",", ".", "·", ".", ","],
	 [",", ".", "`", ".", ",", "."]],
	[["·", ".", ",", ".", "·", "."],
	 [".", ",", ".", "`", ".", ","],
	 [",", ".", "✿", ".", ",", "."],
	 [".", "`", ".", ",", ".", "`"],
	 [",", ".", ",", ".", "·", "."],
	 [".", "·", ".", ",", ".", ","]],
	[[",", ".", "`", ".", ",", "·"],
	 [".", ",", ".", "·", ".", ","],
	 ["`", ".", ",", ".", "ı", "."],
	 [".", "·", ".", ",", ".", ","],
	 [",", ".", "`", ".", ",", "."],
	 [".", ",", ".", "·", ".", "`"]],
]

# Meadow — denser commas with ❀ and ✿ blooms.
const MEADOW_6x6: Array = [
	[[",", "·", ",", "·", ",", "·"],
	 ["·", ",", "❀", ",", "·", ","],
	 [",", "·", ",", "·", "✿", "·"],
	 ["·", ",", "·", ",", "·", ","],
	 [",", "·", "❀", "·", ",", "·"],
	 ["·", ",", "·", ",", "·", ","]],
	[["·", ",", "✿", ",", "·", ","],
	 [",", "·", ",", "·", ",", "·"],
	 ["·", ",", "·", "❀", "·", ","],
	 ["✿", "·", ",", "·", ",", "·"],
	 ["·", ",", "·", ",", "❀", ","],
	 [",", "·", ",", "·", ",", "·"]],
]

# Tall grass — vertical ı stalks in columns.
const TALL_GRASS_6x6: Array = [
	[[".", "ı", ".", ",", "ı", "."],
	 ["ı", ".", "ı", ".", "ı", ","],
	 [".", "ı", ".", "ı", ".", "ı"],
	 ["ı", ",", "ı", ".", "ı", "."],
	 [".", "ı", ".", "ı", ".", "ı"],
	 ["ı", ".", "`", "ı", ",", "."]],
	[["ı", ".", "ı", ".", "ı", "."],
	 [".", "ı", ".", "ı", ".", "ı"],
	 ["ı", "`", "ı", ".", "ı", ","],
	 [".", "ı", ".", "ı", ".", "ı"],
	 ["ı", ".", "ı", ",", "ı", "."],
	 [".", "ı", ".", "ı", ".", "ı"]],
]

# Forest — individual small-tree clusters with grass-dominant edges.
# Each variant positions its tree(s) at a different spot inside the 6x6
# bounds so neighboring tiles don't line up into rectangular blocks.
# Target density is ~10-14 ♣ per tile (~30%); the rest is grass dots so
# the tile edges fade seamlessly into adjacent GRASSLAND tiles.
const TREE_6x6: Array = [
	# V0 — single tree clump, upper-left
	[[".", "♣", "♣", ".", ",", "."],
	 ["♣", "♣", "♣", "♣", ".", ","],
	 [".", "♣", "♣", ".", ".", "."],
	 [".", ".", ".", ".", ",", "."],
	 [",", ".", ".", ",", ".", "."],
	 [".", ".", ",", ".", ".", ","]],
	# V1 — single tree clump, upper-right
	[[",", ".", ".", "♣", "♣", "."],
	 [".", ",", "♣", "♣", "♣", "♣"],
	 [".", ".", ".", "♣", "♣", "."],
	 [".", ",", ".", ".", ".", ","],
	 [".", ".", ".", ".", ",", "."],
	 [",", ".", ".", ",", ".", "."]],
	# V2 — single tree clump, center
	[[".", ",", ".", ".", ",", "."],
	 [",", ".", "♣", "♣", ".", ","],
	 [".", "♣", "♣", "♣", "♣", "."],
	 [".", "♣", "♣", "♣", ".", ","],
	 [",", ".", "♣", ".", ".", "."],
	 [".", ",", ".", ".", ",", "."]],
	# V3 — two small trees, diagonal
	[[".", "♣", "♣", ".", ",", "."],
	 ["♣", "♣", ".", ".", ".", ","],
	 [".", ".", ".", ".", "♣", "."],
	 [",", ".", ".", "♣", "♣", "♣"],
	 [".", ".", ",", ".", "♣", "."],
	 [".", ",", ".", ".", ".", ","]],
	# V4 — single tree clump, lower-right
	[[",", ".", ".", ",", ".", "."],
	 [".", ",", ".", ".", ",", "."],
	 [".", ".", ".", ".", "♣", "."],
	 [".", ",", ".", "♣", "♣", "♣"],
	 [",", ".", "♣", "♣", "♣", "."],
	 [".", ".", ".", "♣", ".", ","]],
	# V5 — two small trees, lower-left + upper
	[[".", ".", "♣", ".", ",", "."],
	 [",", "♣", "♣", "♣", ".", ","],
	 [".", ".", "♣", ".", ".", "."],
	 [".", ",", ".", ".", ".", ","],
	 ["♣", "♣", ".", ",", ".", "."],
	 [".", "♣", ".", ".", ",", "."]],
]

# Deep forest — denser canopy but still with irregular breaks and a
# grass-dotted "halo" at the edges so tiles blend at borders instead of
# forming a hard rectangular wall. Targets ~55% density.
const DEEP_FOREST_6x6: Array = [
	# V0 — dense center with feathered edges
	[[".", "♣", "♣", "♣", "♣", "."],
	 ["♣", "♣", "♣", "♣", "♣", "♣"],
	 ["♣", "♣", "♣", "♣", "♣", "♣"],
	 ["♣", "♣", ".", "♣", "♣", "♣"],
	 [".", "♣", "♣", "♣", "♣", "."],
	 [".", ".", "♣", "♣", ".", "."]],
	# V1 — diagonal-weighted mass
	[["♣", "♣", ".", "♣", "♣", "."],
	 ["♣", "♣", "♣", "♣", ".", "♣"],
	 [".", "♣", "♣", ".", "♣", "♣"],
	 ["♣", "♣", ".", "♣", "♣", "♣"],
	 ["♣", ".", "♣", "♣", "♣", "."],
	 [".", "♣", "♣", ".", "♣", "♣"]],
	# V2 — upper-heavy canopy
	[["♣", "♣", "♣", ".", "♣", "♣"],
	 ["♣", "♣", "♣", "♣", "♣", "♣"],
	 ["♣", ".", "♣", "♣", "♣", "."],
	 [".", "♣", "♣", ".", "♣", "♣"],
	 ["♣", "♣", ".", "♣", ".", "♣"],
	 [".", "♣", ".", ".", "♣", "."]],
	# V3 — lower-heavy canopy
	[[".", "♣", ".", "♣", ".", "."],
	 ["♣", "♣", ".", "♣", "♣", "."],
	 [".", "♣", "♣", ".", "♣", "♣"],
	 ["♣", ".", "♣", "♣", "♣", "♣"],
	 ["♣", "♣", "♣", "♣", "♣", "♣"],
	 ["♣", "♣", ".", "♣", "♣", "♣"]],
]

# Sparse trees — isolated ♣ specs on a grass field.
const SPARSE_TREE_6x6: Array = [
	[[".", ",", ".", ",", ".", "·"],
	 [",", ".", "♣", ".", ",", "."],
	 [".", "♣", "♣", "♣", ".", ","],
	 [",", ".", "♣", ".", "·", "."],
	 [".", ",", ".", ",", ".", ","],
	 [",", ".", "·", ".", ",", "."]],
	[[".", ",", ".", "·", ",", "."],
	 [",", ".", ",", ".", "♣", ","],
	 [".", "·", ".", "♣", "♣", "♣"],
	 [",", ".", ",", ".", "♣", "."],
	 [".", ",", ".", "·", ",", "."],
	 [",", ".", "·", ".", ",", "·"]],
]

# Bush — small ☘ shamrock cluster, visually distinct from ♣ trees.
const BUSH_6x6: Array = [
	[[".", ",", ".", ",", ".", "·"],
	 [",", ".", "☘", "☘", ".", ","],
	 [".", "☘", "☘", "☘", "☘", "."],
	 [",", "☘", "☘", "☘", ".", ","],
	 [".", ",", "☘", ",", ".", "·"],
	 [",", ".", ",", ".", ",", "."]],
	[[".", ",", ".", "☘", ",", "."],
	 [",", ".", "☘", "☘", "☘", ","],
	 [".", "☘", "☘", "☘", "☘", "·"],
	 [",", ".", "☘", "☘", ",", "."],
	 [".", ",", ".", ",", ".", ","],
	 [",", ".", ",", ".", "·", "."]],
]

# Water — flowing ~≈∿ ripples. Keep ~ dominant so the _animated_char
# water match arm still fires and drives per-cell wave swap.
const WATER_6x6: Array = [
	[["~", "≈", "~", "≈", "~", "≈"],
	 ["≈", "∿", "~", "≈", "~", "~"],
	 ["~", "~", "≈", "~", "∿", "≈"],
	 ["≈", "~", "~", "≈", "~", "~"],
	 ["~", "≈", "∿", "~", "≈", "~"],
	 ["≈", "~", "~", "≈", "~", "≈"]],
	[["≈", "~", "≈", "~", "≈", "~"],
	 ["~", "≈", "~", "∿", "~", "≈"],
	 ["≈", "~", "∿", "~", "≈", "~"],
	 ["~", "≈", "~", "≈", "∿", "≈"],
	 ["≈", "~", "~", "≈", "~", "~"],
	 ["~", "≈", "~", "≈", "~", "≈"]],
]

# Hill — rolling ∩⌒ curves with dots in the dips.
const HILL_6x6: Array = [
	[[".", "∩", "⌒", ".", "∩", "."],
	 ["∩", ".", ".", "⌒", ".", "∩"],
	 [".", "⌒", "∩", ".", "∩", "."],
	 ["⌒", ".", ".", "∩", ".", "⌒"],
	 [".", "∩", "⌒", ".", "⌒", "."],
	 ["∩", ".", ".", "⌒", ".", "∩"]],
	[["⌒", ".", "∩", ".", "⌒", "."],
	 [".", "∩", ".", "∩", ".", "⌒"],
	 ["∩", ".", "⌒", ".", "∩", "."],
	 [".", "⌒", ".", "∩", ".", "⌒"],
	 ["⌒", ".", "∩", ".", "⌒", "."],
	 [".", "∩", ".", "⌒", ".", "∩"]],
]

# Rock (mountain base, rocky slope) — jagged ▓▒█ mass with ▪ pebbles.
const ROCK_6x6: Array = [
	[["▓", "█", "▓", "▒", "▓", "█"],
	 ["█", "▓", "▒", "█", "▓", "▒"],
	 ["▓", "▒", "█", "▓", "▪", "▓"],
	 ["▒", "█", "▓", "▒", "▓", "█"],
	 ["█", "▓", "▒", "█", "▒", "▓"],
	 ["▓", "▒", "█", "▓", "█", "▒"]],
	[["▒", "▓", "█", "▓", "▒", "▓"],
	 ["▓", "█", "▓", "▒", "█", "▒"],
	 ["█", "▒", "▓", "█", "▓", "▪"],
	 ["▓", "█", "▒", "▓", "▒", "█"],
	 ["▒", "▓", "█", "▒", "▓", "▒"],
	 ["▓", "▒", "▓", "█", "▒", "▓"]],
]

# Mountain — peaked ▲ summits with △ skirts and ▓█ bases. Mid-elevation;
# see HIGH_PEAK_6x6 for snow-capped summits above this.
const MOUNTAIN_6x6: Array = [
	[[".", ".", "▲", "▲", ".", "."],
	 [".", "△", "▲", "▲", "△", "."],
	 ["△", "▓", "▲", "▲", "▓", "△"],
	 ["▓", "█", "▓", "▓", "█", "▓"],
	 ["█", "▓", "█", "█", "▓", "█"],
	 ["▓", "█", "▓", "█", "▓", "█"]],
	[[".", "▲", ".", ".", "▲", "."],
	 ["△", "▲", "△", "△", "▲", "△"],
	 ["▓", "▲", "▓", "▓", "▲", "▓"],
	 ["█", "▓", "█", "▓", "█", "▓"],
	 ["▓", "█", "▓", "█", "▓", "█"],
	 ["█", "▓", "█", "▓", "█", "▓"]],
]

# High peak — snow-capped summits. Top rows are ❆ snowflakes + ▲ exposed
# rock; lower rows are the █ peak mass fading into ▓ shaded slopes. Use
# the brightest palette so it reads visually distinct from MOUNTAIN.
const HIGH_PEAK_6x6: Array = [
	[[".", "❆", "❆", "❆", "❆", "."],
	 ["❆", "❆", "▲", "▲", "❆", "❆"],
	 ["❆", "▲", "█", "█", "▲", "❆"],
	 ["▲", "█", "█", "█", "█", "▲"],
	 ["█", "█", "▓", "▓", "█", "█"],
	 ["▓", "█", "▓", "▓", "█", "▓"]],
	[[".", "❆", "❆", "❆", "❆", "."],
	 ["❆", "▲", "❆", "❆", "▲", "❆"],
	 ["▲", "█", "▲", "▲", "█", "▲"],
	 ["█", "█", "█", "█", "█", "█"],
	 ["█", "▓", "█", "█", "▓", "█"],
	 ["▓", "█", "▓", "▓", "█", "▓"]],
]

# Boulder field — scattered rocks on dirt; the transition ring between
# deep forest and mountain base. ▪ pebbles + ▓▒ boulders on a dotted
# dirt background. Walkable but visually rocky.
const BOULDER_6x6: Array = [
	[[",", "▪", ".", ",", "▒", ","],
	 ["▪", ".", "▓", ".", "▪", "."],
	 [".", "▒", ".", "▪", ".", "▓"],
	 ["▓", ".", "▪", ".", "▒", "."],
	 [".", "▓", ".", "▒", "▪", "."],
	 ["▒", ".", "▪", ".", "▓", "▪"]],
	[["▪", ".", "▒", ".", "▓", ","],
	 [".", "▓", ".", "▪", ".", "▒"],
	 ["▒", ".", "▪", ".", "▓", "."],
	 [".", "▪", ".", "▓", ".", "▪"],
	 ["▓", ".", "▒", ".", "▪", "."],
	 [".", "▒", ".", "▪", ".", "▓"]],
]

# Bridge — vertical wooden planks. ║ rails on columns 0 and 5, ═/─
# alternating cross-planks between. Tile char is ║.
const BRIDGE_6x6: Array = [
	[["║", "═", "═", "═", "═", "║"],
	 ["║", "─", "─", "─", "─", "║"],
	 ["║", "═", "═", "═", "═", "║"],
	 ["║", "─", "─", "─", "─", "║"],
	 ["║", "═", "═", "═", "═", "║"],
	 ["║", "─", "─", "─", "─", "║"]],
	[["║", "═", "─", "═", "─", "║"],
	 ["║", "─", "═", "─", "═", "║"],
	 ["║", "═", "─", "═", "─", "║"],
	 ["║", "─", "═", "─", "═", "║"],
	 ["║", "═", "─", "═", "─", "║"],
	 ["║", "─", "═", "─", "═", "║"]],
]

# Section wall — 7 indexed levels (NOT hash-picked variants). Outer
# levels (0-2) have ▣ panel highlights; middle (3-4) fade through ▓;
# inner (5-6) use clean ▒/░ shading. Selected via `tile.wall_level` in
# expand(), NOT _patterns_for.
const WALL_6x6_LEVELS: Array = [
	# Level 0 — outermost hull exterior, heavy ▣ highlights
	[["█", "▣", "█", "█", "▣", "█"],
	 ["▣", "█", "█", "█", "█", "▣"],
	 ["█", "█", "▣", "▣", "█", "█"],
	 ["█", "▣", "█", "█", "▣", "█"],
	 ["▣", "█", "█", "█", "█", "▣"],
	 ["█", "█", "▣", "▣", "█", "█"]],
	# Level 1 — solid with scattered ▣
	[["█", "█", "▣", "█", "█", "█"],
	 ["█", "▣", "█", "█", "▣", "█"],
	 ["█", "█", "█", "▣", "█", "█"],
	 ["▣", "█", "█", "█", "█", "▣"],
	 ["█", "█", "▣", "█", "█", "█"],
	 ["█", "▣", "█", "█", "▣", "█"]],
	# Level 2 — sparse ▣
	[["█", "█", "█", "█", "█", "█"],
	 ["█", "▣", "█", "█", "▣", "█"],
	 ["█", "█", "█", "█", "█", "█"],
	 ["█", "█", "▣", "█", "█", "█"],
	 ["█", "▣", "█", "▣", "█", "█"],
	 ["█", "█", "█", "█", "█", "█"]],
	# Level 3 — solid █ with ▓ transition specks
	[["█", "▓", "█", "█", "▓", "█"],
	 ["▓", "█", "█", "█", "█", "▓"],
	 ["█", "█", "▓", "█", "█", "█"],
	 ["█", "▓", "█", "▓", "█", "█"],
	 ["▓", "█", "█", "█", "▓", "█"],
	 ["█", "█", "▓", "█", "█", "▓"]],
	# Level 4 — ▓ dominant
	[["▓", "█", "▓", "▓", "█", "▓"],
	 ["█", "▓", "▓", "▓", "▓", "█"],
	 ["▓", "▓", "█", "▓", "▓", "▓"],
	 ["▓", "█", "▓", "▓", "█", "▓"],
	 ["█", "▓", "▓", "▓", "▓", "█"],
	 ["▓", "▓", "█", "▓", "▓", "▓"]],
	# Level 5 — ▒ dominant
	[["▒", "▓", "▒", "▒", "▓", "▒"],
	 ["▓", "▒", "▒", "▒", "▒", "▓"],
	 ["▒", "▒", "▓", "▒", "▒", "▒"],
	 ["▒", "▓", "▒", "▓", "▒", "▒"],
	 ["▓", "▒", "▒", "▒", "▓", "▒"],
	 ["▒", "▒", "▓", "▒", "▒", "▓"]],
	# Level 6 — innermost habitat transition, ░ dominant
	[["░", "▒", "░", "░", "▒", "░"],
	 ["▒", "░", "░", "░", "░", "▒"],
	 ["░", "░", "▒", "░", "░", "░"],
	 ["░", "▒", "░", "▒", "░", "░"],
	 ["▒", "░", "░", "░", "▒", "░"],
	 ["░", "░", "▒", "░", "░", "▒"]],
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


# ── Type → pattern mapping ──
static func _patterns_for(type: String) -> Array:
	match type:
		GRASSLAND, FIELD, SCRUBLAND, BARREN_WASTE, \
		OUTER_SHORE, INNER_SHORE:
			return GRASS_6x6
		MEADOW:
			return MEADOW_6x6
		TALL_GRASS:
			return TALL_GRASS_6x6
		SPARSE_TREES:
			return SPARSE_TREE_6x6
		FOREST, PINE_STAND:
			return TREE_6x6
		DEEP_FOREST, CANOPY:
			return DEEP_FOREST_6x6
		BUSH:
			return BUSH_6x6
		RIVER_WATER, SHALLOWS, MEDIUM_WATER:
			return WATER_6x6
		BRIDGE:
			return BRIDGE_6x6
		MOUNTAIN:
			return MOUNTAIN_6x6
		HIGH_PEAK:
			return HIGH_PEAK_6x6
		MOUNTAIN_BASE, ROCKY_SLOPE:
			return ROCK_6x6
		BOULDER_FIELD:
			return BOULDER_6x6
		HILL, FOOTHILL, ROLLING_HILLS, RIDGE:
			return HILL_6x6
	# SECTION_WALL is NOT returned here — expand() has a fast path for it
	# that indexes WALL_6x6_LEVELS by tile.wall_level.
	return []


# ── Spatial hash → variant picker (js/tileExpansion.js tileHash) ──
static func _tile_hash(wx: int, wy: int) -> int:
	var h: int = ((wx * 73856093) ^ (wy * 19349663)) & 0x7FFFFFFF
	return h


# ── Expand a tile to chars / fgs / bgs ──
static func expand(tile: Dictionary, wx: int, wy: int) -> Dictionary:
	var type: String = tile.type
	var base_char: String = tile.char
	var fg: Color = tile.fg
	var bg: Color = tile.bg

	# SECTION_WALL fast path: pick the variant for this specific wall
	# gradient level rather than hashing across a variant list.
	if type == SECTION_WALL:
		var level: int = clampi(
			int(tile.get("wall_level", 0)), 0, WALL_6x6_LEVELS.size() - 1
		)
		var wall_variant: Array = WALL_6x6_LEVELS[level]
		return _build_expansion(wall_variant, base_char, fg, bg)

	var variants: Array = _patterns_for(type)
	if variants.is_empty():
		# Fallback: uniform fill at the configured density.
		var n: int = Constants.TILE_DENSITY
		var chars: Array = []
		var fgs: Array = []
		var bgs: Array = []
		for dy in range(n):
			var row_c: Array = []
			var row_f: Array = []
			var row_b: Array = []
			for dx in range(n):
				row_c.append(base_char)
				row_f.append(fg)
				row_b.append(bg)
			chars.append(row_c)
			fgs.append(row_f)
			bgs.append(row_b)
		return {"chars": chars, "fgs": fgs, "bgs": bgs}

	var variant: Array = variants[_tile_hash(wx, wy) % variants.size()]
	return _build_expansion(variant, base_char, fg, bg)


# ── Internal: build {chars, fgs, bgs} from a variant pattern ──
static func _build_expansion(variant: Array, base_char: String,
		fg: Color, bg: Color) -> Dictionary:
	var chars: Array = []
	var fgs: Array = []
	var bgs: Array = []
	var rows_n: int = variant.size()
	for dy in range(rows_n):
		var pat_row: Array = variant[dy]
		var cols_n: int = pat_row.size()
		var row_c: Array = []
		var row_f: Array = []
		var row_b: Array = []
		for dx in range(cols_n):
			var cell: String = pat_row[dx]
			row_c.append(base_char if cell == "" else cell)
			row_f.append(fg)
			row_b.append(bg)
		chars.append(row_c)
		fgs.append(row_f)
		bgs.append(row_b)
	return {"chars": chars, "fgs": fgs, "bgs": bgs}
