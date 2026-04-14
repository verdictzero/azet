class_name FontLibrary
extends RefCounted
## Central font loader + catalog.
##
## The project ships with a large pile of Noto fonts covering nearly every
## Unicode block the game could ever need. This class organizes them:
##
##   • `primary()` returns the monospace font used for the ASCII grid with
##     a fallback chain that covers every glyph used by the game (card
##     suits, dingbats, math symbols, arrows). Call this from anywhere the
##     terminal grid is rendered or when the glyph atlas is built.
##
##   • `menu()` returns a proportional font for title/UI labels that need
##     crisp kerning (title screen menu, UIShell MENU panes).
##
##   • `SPECIALTY` lists every script-specific font available (Cuneiform,
##     Egyptian Hieroglyphs, Linear B, Mayan Numerals, Runic, Ogham, …)
##     keyed by short name so lore text can swap to an appropriate font
##     without knowing the on-disk path.
##
## BACKGROUND ON THE ♣ BUG:
## NotoSansMono does NOT contain the card suit glyphs (♠ ♣ ♥ ♦). Loading
## it alone causes those characters to render as Godot's "missing glyph"
## placeholder. NotoSansSymbols2 provides the suits + dingbats, and
## NotoSansMath provides the remaining math/misc symbols. With the two
## fallbacks chained on the primary FontFile, `draw_char` automatically
## walks the chain and finds every glyph.

# ── Core fonts used by the game loop ──
const PRIMARY_MONO_PATH := "res://assets/fonts/Noto_Sans_Mono/static/NotoSansMono-Medium.ttf"
const PRIMARY_MONO_BOLD_PATH := "res://assets/fonts/Noto_Sans_Mono/static/NotoSansMono-SemiBold.ttf"
const MENU_SANS_PATH := "res://assets/fonts/Noto_Sans/static/NotoSans-Medium.ttf"

# ── Fallback chain (ordered) ──
# 1. Symbols 2 — card suits (♠♣♥♦), astrological, weather, chess, dice,
#    dingbats (✿❀✻❆★), misc technical panels (▤▥▦▧▨▩ etc.)
# 2. Math — arrows, math operators, misc technical (⌒⌂∟), curves.
const FALLBACK_SYMBOLS2_PATH := "res://assets/fonts/Noto_Sans_Symbols_2/NotoSansSymbols2-Regular.ttf"
const FALLBACK_MATH_PATH := "res://assets/fonts/Noto_Sans_Math/NotoSansMath-Regular.ttf"

# ── Specialty / lore fonts ──
# Each entry: `short_name → resource path`. These are not loaded until
# requested. Useful for scripted lore/inscriptions in a dungeon later.
const SPECIALTY := {
	"cuneiform": "res://assets/fonts/Noto_Sans_Cuneiform/NotoSansCuneiform-Regular.ttf",
	"egyptian":  "res://assets/fonts/Noto_Sans_Egyptian_Hieroglyphs/NotoSansEgyptianHieroglyphs-Regular.ttf",
	"hatran":    "res://assets/fonts/Noto_Sans_Hatran/NotoSansHatran-Regular.ttf",
	"linear_b":  "res://assets/fonts/Noto_Sans_Linear_B/NotoSansLinearB-Regular.ttf",
	"lycian":    "res://assets/fonts/Noto_Sans_Lycian/NotoSansLycian-Regular.ttf",
	"masaram":   "res://assets/fonts/Noto_Sans_Masaram_Gondi/NotoSansMasaramGondi-Regular.ttf",
	"mayan":     "res://assets/fonts/Noto_Sans_Mayan_Numerals/NotoSansMayanNumerals-Regular.ttf",
	"ogham":     "res://assets/fonts/Noto_Sans_Ogham/NotoSansOgham-Regular.ttf",
	"arabian":   "res://assets/fonts/Noto_Sans_Old_South_Arabian/NotoSansOldSouthArabian-Regular.ttf",
	"runic":     "res://assets/fonts/Noto_Sans_Runic/NotoSansRunic-Regular.ttf",
	"signwriting": "res://assets/fonts/Noto_Sans_SignWriting/NotoSansSignWriting-Regular.ttf",
	"canadian_aboriginal": "res://assets/fonts/Noto_Sans_Canadian_Aboriginal/static/NotoSansCanadianAboriginal-Regular.ttf",
	"japanese":  "res://assets/fonts/Noto_Sans_JP/static/NotoSansJP-Regular.ttf",
}


# ── Cached composed font ──
static var _primary_cache: Font = null
static var _menu_cache: Font = null


# ── Public API ──

static func primary() -> Font:
	## Return the monospace font with the full fallback chain attached.
	## Cached after first call.
	if _primary_cache != null:
		return _primary_cache
	var font: FontFile = load(PRIMARY_MONO_PATH) as FontFile
	if font == null:
		push_error("FontLibrary: failed to load primary mono font at %s" % PRIMARY_MONO_PATH)
		return ThemeDB.fallback_font
	var fallbacks: Array[Font] = []
	var sym2: FontFile = load(FALLBACK_SYMBOLS2_PATH) as FontFile
	if sym2:
		fallbacks.append(sym2)
	var math: FontFile = load(FALLBACK_MATH_PATH) as FontFile
	if math:
		fallbacks.append(math)
	font.fallbacks = fallbacks
	_primary_cache = font
	return font


static func menu() -> Font:
	## Proportional font for title/UI labels. Same fallback chain so
	## labels can embed card suits and dingbats without switching fonts.
	if _menu_cache != null:
		return _menu_cache
	var font: FontFile = load(MENU_SANS_PATH) as FontFile
	if font == null:
		push_warning("FontLibrary: failed to load menu font, using primary")
		return primary()
	var fallbacks: Array[Font] = []
	var sym2: FontFile = load(FALLBACK_SYMBOLS2_PATH) as FontFile
	if sym2:
		fallbacks.append(sym2)
	var math: FontFile = load(FALLBACK_MATH_PATH) as FontFile
	if math:
		fallbacks.append(math)
	font.fallbacks = fallbacks
	_menu_cache = font
	return font


static func specialty(name: String) -> Font:
	## Load a specialty script font by short name. Returns null on miss.
	var path: Variant = SPECIALTY.get(name)
	if path == null:
		push_warning("FontLibrary: unknown specialty font '%s'" % name)
		return null
	return load(path) as Font


static func clear_cache() -> void:
	## Drop the cached primary/menu composed fonts. Call after editing
	## the fallback list at runtime.
	_primary_cache = null
	_menu_cache = null
