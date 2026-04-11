class_name GlyphAtlasBuilder
extends RefCounted
## Builds a glyph atlas texture from a font using a SubViewport render pass.
##
## The atlas is a 16x16 grid of character cells rendered white-on-transparent.
## Each character maps to an index (0-255) used in data textures.

const ATLAS_COLS: int = 16
const ATLAS_ROWS: int = 16
const MAX_GLYPHS: int = ATLAS_COLS * ATLAS_ROWS  # 256

# Full charset: ASCII printable + box drawing + block elements + symbols
static var CHARSET: PackedStringArray = _build_charset()

static func _build_charset() -> PackedStringArray:
	## CHARSET NOTES:
	## 1. Index 0 must be space — treated as "empty" / transparent.
	## 2. Card suits ♠♣♥♦ live in NotoSansSymbols2, not NotoSansMono;
	##    FontLibrary.primary() chains them as fallbacks so draw_char
	##    still resolves them even though the primary font lacks them.
	## 3. Atlas layout is 16x16 = 256 slots. Adding glyphs here is fine
	##    up to that limit.
	var chars: PackedStringArray = []
	var s: String = " !\"#$%&'()*+,-./0123456789:;<=>?@"
	s += "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`"
	s += "abcdefghijklmnopqrstuvwxyz{|}~"
	# Box drawing
	s += "─│╭╮╰╯═║╔╗╚╝╬╠╣╦╩┌┐└┘┬┴├┤┼"
	# Block elements
	s += "█▓▒░▀▄▐▌"
	# Geometric shapes + symbols
	s += "■□▪▫●○◆◇▲▼◄►△▽"
	# Card suits / faces / misc  (SUITS ARE CRITICAL for overworld trees)
	s += "♦♣♠♥☺☻☼◘◙"
	# Arrows
	s += "↕↨↑↓→←↔"
	# Mathematical / punctuation
	s += "·∙•°±²³µ¶¸¹º»¼½¾¿×÷"
	s += "★✦✧✿❀✻≈∽≡∞†‡※⌂∩⌒ı❆"
	s += "‼§∟▬"
	# ── NEW: glyphs unlocked by the Symbols2 / Math fallback chain ──
	# Weather (future overworld TOD/weather system)
	s += "☀☁☂☃☄"
	# Celestial (day/night, planet map markers)
	s += "☉☽☾"
	# Mechanical / tech (facility tiles, power/anomaly markers)
	s += "⚙⚡⌬⌘⌖"
	# Patterned squares (colony hull panels, damaged floor, grates)
	s += "▣▤▥▦▧▨▩"
	# Chess pieces (boss / named NPC icons)
	s += "♔♕♖♗♘♙"
	# Dice faces (random-event markers, chance nodes)
	s += "⚀⚁⚂⚃⚄⚅"
	# Shamrock (bushes / small plants, visually distinct from ♣ tree tops)
	s += "☘"
	# Sine wave (alt water char for slow streams vs rapids ~)
	s += "∿"

	for ch in s:
		chars.append(ch)
	return chars


## Build the atlas asynchronously. Must be called with await.
## Returns { "texture": ImageTexture, "char_map": Dictionary[String, int] }
static func build_atlas(font: Font, font_size: int, cell_w: int, cell_h: int, parent: Node) -> Dictionary:
	var char_map: Dictionary = {}
	for i in range(CHARSET.size()):
		char_map[CHARSET[i]] = i

	var atlas_w: int = ATLAS_COLS * cell_w
	var atlas_h: int = ATLAS_ROWS * cell_h

	var sub_vp := SubViewport.new()
	sub_vp.size = Vector2i(atlas_w, atlas_h)
	sub_vp.transparent_bg = true
	sub_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	sub_vp.render_target_clear_mode = SubViewport.CLEAR_MODE_ONCE

	var drawer := AtlasDrawer.new()
	drawer.font = font
	drawer.font_size = font_size
	drawer.cell_w = cell_w
	drawer.cell_h = cell_h
	drawer.charset = CHARSET
	drawer.atlas_cols = ATLAS_COLS

	sub_vp.add_child(drawer)
	parent.add_child(sub_vp)

	# Wait for viewport to render
	await parent.get_tree().process_frame
	await parent.get_tree().process_frame

	var img: Image = sub_vp.get_texture().get_image()
	var tex: ImageTexture = ImageTexture.create_from_image(img)

	sub_vp.queue_free()

	return { "texture": tex, "char_map": char_map }
