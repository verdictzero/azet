class_name Constants
extends RefCounted
## Global constants: CGA color palette, layout metrics, enums.
## Ported from js/engine.js COLORS and LAYOUT.

# CGA-style color palette (hex strings matching JS exactly)
const COLORS := {
	"BLACK":          Color("#000000"),
	"BLUE":           Color("#10106e"),
	"GREEN":          Color("#18a040"),
	"CYAN":           Color("#40a0b8"),
	"RED":            Color("#a82020"),
	"MAGENTA":        Color("#8848a0"),
	"YELLOW":         Color("#c09820"),
	"WHITE":          Color("#b0a8c0"),
	"BRIGHT_BLACK":   Color("#586078"),
	"BRIGHT_BLUE":    Color("#4848d8"),
	"BRIGHT_GREEN":   Color("#40d870"),
	"BRIGHT_CYAN":    Color("#60d0e8"),
	"BRIGHT_RED":     Color("#e04848"),
	"BRIGHT_MAGENTA": Color("#c060d0"),
	"BRIGHT_YELLOW":  Color("#f8e060"),
	"BRIGHT_WHITE":   Color("#f8f0ff"),
	# FF-style UI colors
	"FF_BLUE_BG":     Color("#1a1a2a"),
	"FF_BLUE_DARK":   Color("#0e0e14"),
	"FF_BORDER":      Color("#b0b0b8"),
	"FF_CURSOR":      Color("#f8f0ff"),
}

# Layout constants (rows reserved for HUD elements)
const LAYOUT := {
	"TOP_BORDER": 1,
	"TOP_BAR": 1,
	"SEPARATOR": 1,
	"STATS_BAR": 1,
	"MSG_SEPARATOR": 1,
	"MSG_LOG": 5,
	"BOTTOM_BORDER": 1,
}

# Computed layout values
static func viewport_top() -> int:
	return LAYOUT.TOP_BORDER + LAYOUT.TOP_BAR + LAYOUT.SEPARATOR  # 3

static func hud_bottom() -> int:
	return LAYOUT.SEPARATOR + LAYOUT.STATS_BAR + LAYOUT.MSG_SEPARATOR + LAYOUT.MSG_LOG + LAYOUT.BOTTOM_BORDER  # 9

static func hud_total() -> int:
	return viewport_top() + hud_bottom()  # 12

# Box-drawing characters for FF-style panels
const BOX_TL := "╭"
const BOX_TR := "╮"
const BOX_BL := "╰"
const BOX_BR := "╯"
const BOX_H := "─"
const BOX_V := "│"

# Tile density (each world tile = NxN graphics cells)
const TILE_DENSITY := 3
