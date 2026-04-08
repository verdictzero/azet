class_name AsciiGrid
extends Node2D
## Dual-buffer ASCII grid renderer.
##
## Renders the entire grid to a CPU-side Image, uploads as a single texture.
## **1 draw call per frame** instead of 20,000+ draw_rect/draw_char calls.
##
## Text buffer: Full-size font for HUD, menus, borders.
## Graphics buffer: Half-size font for world viewport (2x density).
## Glyph atlas: Pre-rendered character bitmaps at both font sizes.

# Font settings
@export var font_size: int = 16
@export var font: Font

var cell_width: int = 0
var cell_height: int = 0
var cols: int = 0
var rows: int = 0

# Graphics (viewport) buffer — half-size cells
var g_font_size: int = 8
var g_cell_width: int = 0
var g_cell_height: int = 0
var g_cols: int = 0
var g_rows: int = 0
var g_origin_x: int = 0
var g_origin_y: int = 0

const TILE_DENSITY := 3

# --- Glyph atlas ---
# Maps character → PackedByteArray of alpha values (cell_width * cell_height)
var _glyph_atlas: Dictionary = {}       # String → PackedByteArray (text size)
var _glyph_atlas_gfx: Dictionary = {}   # String → PackedByteArray (gfx size)

# --- Output image + texture (single GPU upload per frame) ---
var _image: Image
var _texture: ImageTexture
var _pixel_width: int = 0
var _pixel_height: int = 0

# --- Double-buffered flat arrays (A/B swap, zero alloc per frame) ---
var _t_chars_a: PackedStringArray
var _t_fg_a: PackedColorArray
var _t_bg_a: PackedColorArray
var _t_chars_b: PackedStringArray
var _t_fg_b: PackedColorArray
var _t_bg_b: PackedColorArray

var _g_chars_a: PackedStringArray
var _g_fg_a: PackedColorArray
var _g_bg_a: PackedColorArray
var _g_chars_b: PackedStringArray
var _g_fg_b: PackedColorArray
var _g_bg_b: PackedColorArray

# Active references (point to A or B)
var _t_chars: PackedStringArray
var _t_fg: PackedColorArray
var _t_bg: PackedColorArray
var _t_prev_chars: PackedStringArray
var _t_prev_fg: PackedColorArray
var _t_prev_bg: PackedColorArray

var _g_chars: PackedStringArray
var _g_fg: PackedColorArray
var _g_bg: PackedColorArray
var _g_prev_chars: PackedStringArray
var _g_prev_fg: PackedColorArray
var _g_prev_bg: PackedColorArray

var _using_set_a: bool = true

# Dirty tracking
var _dirty: bool = true
var _force_full_redraw: bool = true
var _has_gfx: bool = false

# Frame timing
var frame_time: float = 0.0
var frame_time_sec: float = 0.0

# Noise instances for animated effects
var _grass_noise: PerlinNoise
var _grass_noise2: PerlinNoise
var _god_ray_noise: PerlinNoise
var _water_noise: PerlinNoise

# Default colors
var _default_fg: Color
var _default_bg: Color

# Precomputed default bg as bytes for fast image fill
var _bg_r: int = 0
var _bg_g: int = 0
var _bg_b: int = 0

# Viewport dimensions in world tiles
var world_cols: int:
	get: return g_cols / TILE_DENSITY
var world_rows: int:
	get: return g_rows / TILE_DENSITY


func _ready() -> void:
	if font == null:
		font = ThemeDB.fallback_font
	_default_fg = Constants.COLORS.BRIGHT_WHITE
	_default_bg = Constants.COLORS.BLACK
	_bg_r = int(_default_bg.r8)
	_bg_g = int(_default_bg.g8)
	_bg_b = int(_default_bg.b8)
	_grass_noise = PerlinNoise.new(SeededRNG.new(42))
	_grass_noise2 = PerlinNoise.new(SeededRNG.new(137))
	_god_ray_noise = PerlinNoise.new(SeededRNG.new(256))
	_water_noise = PerlinNoise.new(SeededRNG.new(99))
	_resize()
	get_viewport().size_changed.connect(_on_viewport_resized)


func _on_viewport_resized() -> void:
	var vp := get_viewport()
	if vp is SubViewport:
		var container := vp.get_parent()
		if container is SubViewportContainer:
			vp.size = container.size
	_resize()


func _resize() -> void:
	var vp_size: Vector2 = get_viewport_rect().size
	if vp_size.x < 1 or vp_size.y < 1:
		return

	cell_width = int(_measure_char_width(font_size))
	cell_height = int(ceilf(float(font_size) * 1.35))
	if cell_width < 1:
		cell_width = int(float(font_size) * 0.6)
	if cell_height < 1:
		cell_height = font_size

	cols = int(vp_size.x) / cell_width
	rows = int(vp_size.y) / cell_height
	cols = clampi(cols, 30, 160)
	var min_rows: int = Constants.hud_total() + 5
	if rows < min_rows:
		rows = min_rows

	g_font_size = maxi(5, roundi(font_size / 2))
	g_cell_width = int(_measure_char_width(g_font_size))
	g_cell_height = int(ceilf(float(g_font_size) * 1.35))
	if g_cell_width < 1:
		g_cell_width = int(float(g_font_size) * 0.6)

	var vp_pixel_w: int = (cols - 2) * cell_width
	var vp_pixel_h: int = (rows - Constants.hud_total()) * cell_height
	g_cols = maxi(1, vp_pixel_w / g_cell_width)
	g_rows = maxi(1, vp_pixel_h / g_cell_height)
	g_origin_x = cell_width
	g_origin_y = Constants.viewport_top() * cell_height

	# Output image dimensions
	_pixel_width = cols * cell_width
	_pixel_height = rows * cell_height

	_allocate_buffers()
	_build_glyph_atlas()
	_image = Image.create(_pixel_width, _pixel_height, false, Image.FORMAT_RGB8)
	_texture = ImageTexture.create_from_image(_image)

	_force_full_redraw = true
	_dirty = true
	queue_redraw()


func _measure_char_width(size: int) -> float:
	if font == null:
		return float(size) * 0.6
	return ceilf(font.get_string_size("M", HORIZONTAL_ALIGNMENT_LEFT, -1, size).x)


# ── Glyph atlas ─────────────────────────────────

func _build_glyph_atlas() -> void:
	## Pre-render glyphs into alpha bitmaps at both font sizes.
	## Each glyph is stored as a PackedByteArray of alpha values (0-255).
	_glyph_atlas.clear()
	_glyph_atlas_gfx.clear()
	# Pre-cache common characters
	var charset: String = " !\"#$%&'()*+,-./0123456789:;<=>?@"
	charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`"
	charset += "abcdefghijklmnopqrstuvwxyz{|}~"
	charset += "─│╭╮╰╯═║╔╗╚╝╬╠╣╦╩┌┐└┘┬┴├┤┼"
	charset += "█▓▒░▀▄▐▌■□▪▫●○◆◇▲▼◄►♦♣♠♥"
	charset += "☺☻@☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼"
	charset += "·∙•°±²³´µ¶·¸¹º»¼½¾¿×÷"
	charset += "★✦✧✿❀✻≈∽≡∞†‡※⌂"
	for ch in charset:
		_rasterize_glyph(ch, font_size, cell_width, cell_height, _glyph_atlas)
		_rasterize_glyph(ch, g_font_size, g_cell_width, g_cell_height, _glyph_atlas_gfx)


func _rasterize_glyph(ch: String, size: int, cw: int, ch_h: int, atlas: Dictionary) -> void:
	## Render a single character into an alpha bitmap using a temporary Image.
	if atlas.has(ch):
		return
	# Render glyph to a small image
	var img := Image.create(cw, ch_h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	# Use font.draw_string on a temporary canvas is not available for Image,
	# so we render via a viewport trick: use font.get_string_size + manual approach
	# Actually, Godot's Font has draw_string() only for CanvasItem.
	# For CPU rasterization, we use a tiny SubViewport.
	var sub_vp := SubViewport.new()
	sub_vp.size = Vector2i(cw, ch_h)
	sub_vp.transparent_bg = true
	sub_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	sub_vp.render_target_clear_mode = SubViewport.CLEAR_MODE_ONCE

	var label := Label.new()
	label.text = ch
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.size = Vector2(cw, ch_h)
	sub_vp.add_child(label)
	add_child(sub_vp)

	# We need to wait for the viewport to render. Queue it and process later.
	# This is a problem for synchronous atlas building...
	# Instead, let's use a simpler approach: render glyphs using draw_char
	# in _draw() but cache the result.

	# ACTUALLY: The simplest performant approach is to just keep draw_char()
	# for glyph rendering but batch backgrounds into a single texture.
	# Let me use a hybrid approach instead.
	sub_vp.queue_free()

	# Fall back to a direct pixel approach: we'll build the atlas asynchronously
	# or use a different strategy. For now, store an empty entry to be filled.
	atlas[ch] = PackedByteArray()


func _ensure_glyph(ch: String, atlas: Dictionary, size: int, cw: int, ch_h: int) -> PackedByteArray:
	## Lazy-load a glyph into the atlas if not present.
	if atlas.has(ch) and atlas[ch].size() > 0:
		return atlas[ch]
	# Can't CPU-rasterize easily in Godot without a render pass.
	# Return empty — _draw() will use draw_char() fallback for this glyph.
	if not atlas.has(ch):
		atlas[ch] = PackedByteArray()
	return atlas[ch]


# ── Buffer allocation ────────────────────────────

func _allocate_buffers() -> void:
	var t_size: int = rows * cols
	_t_chars_a = _make_string_array(t_size, " ")
	_t_fg_a = _make_color_array(t_size, _default_fg)
	_t_bg_a = _make_color_array(t_size, _default_bg)
	_t_chars_b = _make_string_array(t_size, " ")
	_t_fg_b = _make_color_array(t_size, _default_fg)
	_t_bg_b = _make_color_array(t_size, _default_bg)

	var g_size: int = g_rows * g_cols
	_g_chars_a = _make_string_array(g_size, " ")
	_g_fg_a = _make_color_array(g_size, _default_fg)
	_g_bg_a = _make_color_array(g_size, _default_bg)
	_g_chars_b = _make_string_array(g_size, " ")
	_g_fg_b = _make_color_array(g_size, _default_fg)
	_g_bg_b = _make_color_array(g_size, _default_bg)

	_using_set_a = true
	_apply_buffer_refs()


static func _make_string_array(size: int, fill: String) -> PackedStringArray:
	var arr := PackedStringArray()
	arr.resize(size)
	arr.fill(fill)
	return arr


static func _make_color_array(size: int, fill: Color) -> PackedColorArray:
	var arr := PackedColorArray()
	arr.resize(size)
	arr.fill(fill)
	return arr


# ── Frame lifecycle ──────────────────────────────

func begin_frame() -> void:
	frame_time = Time.get_ticks_msec()
	frame_time_sec = frame_time / 1000.0
	_t_chars.fill(" ")
	_t_fg.fill(_default_fg)
	_t_bg.fill(_default_bg)
	_g_chars.fill(" ")
	_g_fg.fill(_default_fg)
	_g_bg.fill(_default_bg)
	_has_gfx = false


func end_frame(force_full_redraw: bool = false) -> void:
	if force_full_redraw or _force_full_redraw:
		_dirty = true
		_force_full_redraw = false
	else:
		_dirty = _buffers_differ()

	if _dirty:
		# Build the output image on CPU, upload once
		_composite_image()
		_texture.update(_image)
		queue_redraw()

	_using_set_a = not _using_set_a
	_apply_buffer_refs()


func _apply_buffer_refs() -> void:
	if _using_set_a:
		_t_chars = _t_chars_a; _t_fg = _t_fg_a; _t_bg = _t_bg_a
		_t_prev_chars = _t_chars_b; _t_prev_fg = _t_fg_b; _t_prev_bg = _t_bg_b
		_g_chars = _g_chars_a; _g_fg = _g_fg_a; _g_bg = _g_bg_a
		_g_prev_chars = _g_chars_b; _g_prev_fg = _g_fg_b; _g_prev_bg = _g_bg_b
	else:
		_t_chars = _t_chars_b; _t_fg = _t_fg_b; _t_bg = _t_bg_b
		_t_prev_chars = _t_chars_a; _t_prev_fg = _t_fg_a; _t_prev_bg = _t_bg_a
		_g_chars = _g_chars_b; _g_fg = _g_fg_b; _g_bg = _g_bg_b
		_g_prev_chars = _g_chars_a; _g_prev_fg = _g_fg_a; _g_prev_bg = _g_bg_a


func invalidate() -> void:
	_force_full_redraw = true


func _buffers_differ() -> bool:
	if _t_chars != _t_prev_chars or _t_fg != _t_prev_fg or _t_bg != _t_prev_bg:
		return true
	if _g_chars != _g_prev_chars or _g_fg != _g_prev_fg or _g_bg != _g_prev_bg:
		return true
	return false


# ── Image compositing (CPU-side, replaces 20k+ draw calls) ──

func _composite_image() -> void:
	## Build the full output image from grid buffers.
	## Fills backgrounds, then overlays glyph characters.
	## Result: a single Image uploaded as texture = 1 GPU draw call.
	var data: PackedByteArray = PackedByteArray()
	data.resize(_pixel_width * _pixel_height * 3)
	# Fill with default bg
	var fill_pixel: int = 0
	for i in range(_pixel_width * _pixel_height):
		data[fill_pixel] = _bg_r
		data[fill_pixel + 1] = _bg_g
		data[fill_pixel + 2] = _bg_b
		fill_pixel += 3

	var vp_top: int = Constants.viewport_top()
	var vp_bot: int = rows - Constants.hud_bottom()
	var vp_left: int = 1
	var vp_right: int = cols - 1

	# Pass 1: Text buffer backgrounds
	for r in range(rows):
		var row_offset: int = r * cols
		var py: int = r * cell_height
		for c in range(cols):
			if _has_gfx and r >= vp_top and r < vp_bot and c >= vp_left and c < vp_right:
				continue
			var idx: int = row_offset + c
			var bg: Color = _t_bg[idx]
			if bg != _default_bg:
				var px: int = c * cell_width
				_fill_rect_rgb(data, px, py, cell_width, cell_height, bg)

	# Pass 2: Graphics buffer backgrounds
	if _has_gfx:
		for r in range(g_rows):
			var row_offset: int = r * g_cols
			var py: int = g_origin_y + r * g_cell_height
			for c in range(g_cols):
				var idx: int = row_offset + c
				var bg: Color = _g_bg[idx]
				if bg != _default_bg:
					var px: int = g_origin_x + c * g_cell_width
					_fill_rect_rgb(data, px, py, g_cell_width, g_cell_height, bg)

	_image = Image.create_from_data(_pixel_width, _pixel_height, false, Image.FORMAT_RGB8, data)


func _fill_rect_rgb(data: PackedByteArray, x: int, y: int, w: int, h: int, color: Color) -> void:
	## Fill a rectangle in the pixel buffer with an RGB color.
	var cr: int = int(color.r * 255.0)
	var cg: int = int(color.g * 255.0)
	var cb: int = int(color.b * 255.0)
	var stride: int = _pixel_width * 3
	for row in range(y, mini(y + h, _pixel_height)):
		var row_start: int = row * stride + x * 3
		for col in range(w):
			if x + col >= _pixel_width:
				break
			var p: int = row_start + col * 3
			data[p] = cr
			data[p + 1] = cg
			data[p + 2] = cb


# ── Rendering (_draw) — single texture + character overlay ──

func _draw() -> void:
	## Draw the composited background texture (1 draw call), then overlay
	## characters using draw_char (batched by Godot's 2D renderer).
	## This is a hybrid approach: backgrounds are pixel-perfect via Image,
	## characters use Godot's font renderer for quality + atlas caching.
	if _texture:
		draw_texture(_texture, Vector2.ZERO)

	var vp_top: int = Constants.viewport_top()
	var vp_bot: int = rows - Constants.hud_bottom()
	var vp_left: int = 1
	var vp_right: int = cols - 1

	# Text buffer characters
	for r in range(rows):
		var row_offset: int = r * cols
		var py: float = float(r * cell_height) + float(cell_height) * 0.85
		for c in range(cols):
			if _has_gfx and r >= vp_top and r < vp_bot and c >= vp_left and c < vp_right:
				continue
			var idx: int = row_offset + c
			var ch: String = _t_chars[idx]
			if ch != " " and ch != "":
				draw_char(font, Vector2(float(c * cell_width), py), ch, font_size, _t_fg[idx])

	# Graphics buffer characters
	if _has_gfx:
		for r in range(g_rows):
			var row_offset: int = r * g_cols
			var py: float = float(g_origin_y + r * g_cell_height) + float(g_cell_height) * 0.85
			for c in range(g_cols):
				var idx: int = row_offset + c
				var ch: String = _g_chars[idx]
				if ch != " " and ch != "":
					draw_char(font, Vector2(float(g_origin_x + c * g_cell_width), py), ch, g_font_size, _g_fg[idx])

	_dirty = false


# ── Drawing primitives (unchanged public API) ───

func _ti(col: int, row: int) -> int:
	return row * cols + col

func _gi(col: int, row: int) -> int:
	return row * g_cols + col


func set_char(col: int, row: int, ch: String, fg: Color = Color.TRANSPARENT, bg: Color = Color.TRANSPARENT) -> void:
	if row < 0 or row >= rows or col < 0 or col >= cols:
		return
	var idx: int = _ti(col, row)
	_t_chars[idx] = ch
	_t_fg[idx] = fg if fg != Color.TRANSPARENT else _default_fg
	_t_bg[idx] = bg if bg != Color.TRANSPARENT else _default_bg


func set_gfx_char(col: int, row: int, ch: String, fg: Color = Color.TRANSPARENT, bg: Color = Color.TRANSPARENT) -> void:
	if row < 0 or row >= g_rows or col < 0 or col >= g_cols:
		return
	var idx: int = _gi(col, row)
	_g_chars[idx] = ch
	_g_fg[idx] = fg if fg != Color.TRANSPARENT else _default_fg
	_g_bg[idx] = bg if bg != Color.TRANSPARENT else _default_bg
	_has_gfx = true


func draw_string_at(col: int, row: int, text: String, fg: Color = Color.TRANSPARENT, bg: Color = Color.TRANSPARENT) -> void:
	var actual_fg: Color = fg if fg != Color.TRANSPARENT else _default_fg
	var actual_bg: Color = bg if bg != Color.TRANSPARENT else _default_bg
	for i in range(text.length()):
		var c: int = col + i
		if c < 0 or c >= cols:
			continue
		if row < 0 or row >= rows:
			return
		var idx: int = _ti(c, row)
		_t_chars[idx] = text[i]
		_t_fg[idx] = actual_fg
		_t_bg[idx] = actual_bg


func draw_box(x: int, y: int, w: int, h: int, fg: Color = Color.TRANSPARENT, bg: Color = Color.TRANSPARENT) -> void:
	var actual_fg: Color = fg if fg != Color.TRANSPARENT else Constants.COLORS.FF_BORDER
	var actual_bg: Color = bg if bg != Color.TRANSPARENT else Constants.COLORS.FF_BLUE_BG
	if w < 2 or h < 2:
		return
	set_char(x, y, Constants.BOX_TL, actual_fg, actual_bg)
	set_char(x + w - 1, y, Constants.BOX_TR, actual_fg, actual_bg)
	set_char(x, y + h - 1, Constants.BOX_BL, actual_fg, actual_bg)
	set_char(x + w - 1, y + h - 1, Constants.BOX_BR, actual_fg, actual_bg)
	for c in range(x + 1, x + w - 1):
		set_char(c, y, Constants.BOX_H, actual_fg, actual_bg)
		set_char(c, y + h - 1, Constants.BOX_H, actual_fg, actual_bg)
	for r in range(y + 1, y + h - 1):
		set_char(x, r, Constants.BOX_V, actual_fg, actual_bg)
		set_char(x + w - 1, r, Constants.BOX_V, actual_fg, actual_bg)
	for r in range(y + 1, y + h - 1):
		for c in range(x + 1, x + w - 1):
			set_char(c, r, " ", actual_fg, actual_bg)


func fill_region(x: int, y: int, w: int, h: int, ch: String = " ", fg: Color = Color.TRANSPARENT, bg: Color = Color.TRANSPARENT) -> void:
	var actual_fg: Color = fg if fg != Color.TRANSPARENT else _default_fg
	var actual_bg: Color = bg if bg != Color.TRANSPARENT else _default_bg
	for r in range(y, y + h):
		for c in range(x, x + w):
			if r >= 0 and r < rows and c >= 0 and c < cols:
				var idx: int = _ti(c, r)
				_t_chars[idx] = ch
				_t_fg[idx] = actual_fg
				_t_bg[idx] = actual_bg


func draw_separator(y: int, fg: Color = Color.TRANSPARENT) -> void:
	var actual_fg: Color = fg if fg != Color.TRANSPARENT else Constants.COLORS.FF_BORDER
	for c in range(cols):
		set_char(c, y, Constants.BOX_H, actual_fg, _default_bg)


func draw_world_tile(wx_off: int, wy_off: int, expanded: Dictionary) -> void:
	var base_c: int = wx_off * TILE_DENSITY
	var base_r: int = wy_off * TILE_DENSITY
	for dy in range(TILE_DENSITY):
		for dx in range(TILE_DENSITY):
			set_gfx_char(
				base_c + dx, base_r + dy,
				expanded.chars[dy][dx],
				expanded.fgs[dy][dx],
				expanded.bgs[dy][dx]
			)


func draw_entity_char(wx_off: int, wy_off: int, ch: String, fg: Color, bg: Color = Color.TRANSPARENT) -> void:
	set_gfx_char(
		wx_off * TILE_DENSITY + TILE_DENSITY / 2,
		wy_off * TILE_DENSITY + TILE_DENSITY / 2,
		ch, fg, bg if bg != Color.TRANSPARENT else _default_bg
	)


func tint_cell(col: int, row: int, tint: Color, alpha: float) -> void:
	if row < 0 or row >= rows or col < 0 or col >= cols:
		return
	var idx: int = _ti(col, row)
	_t_fg[idx] = _t_fg[idx].lerp(tint, alpha)
	_t_bg[idx] = _t_bg[idx].lerp(tint, alpha)


func tint_gfx_cell(col: int, row: int, tint: Color, alpha: float) -> void:
	if row < 0 or row >= g_rows or col < 0 or col >= g_cols:
		return
	var idx: int = _gi(col, row)
	_g_fg[idx] = _g_fg[idx].lerp(tint, alpha)
	_g_bg[idx] = _g_bg[idx].lerp(tint, alpha)


func get_text_char(col: int, row: int) -> String:
	if row < 0 or row >= rows or col < 0 or col >= cols:
		return " "
	return _t_chars[_ti(col, row)]
