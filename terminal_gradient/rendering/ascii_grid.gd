class_name AsciiGrid
extends Node2D
## GPU-driven dual-buffer ASCII grid renderer.
##
## Renders the entire grid via a fragment shader in 1-2 draw calls.
## Characters are pre-rendered into a glyph atlas texture at startup.
## Each frame, cell data (char index + fg/bg colors) is written to small
## data textures and uploaded to the GPU. The shader composites everything.
##
## Text buffer: Full-size font for HUD, menus, borders.
## Graphics buffer: Half-size font for world viewport (2x density).

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

# --- GPU rendering ---
var _char_map: Dictionary = {}  # String -> int (glyph index)

# Text buffer data textures
var _t_data_img: Image
var _t_bg_img: Image
var _t_data_tex: ImageTexture
var _t_bg_tex: ImageTexture

# Graphics buffer data textures
var _g_data_img: Image
var _g_bg_img: Image
var _g_data_tex: ImageTexture
var _g_bg_tex: ImageTexture

# Child TextureRects with shader materials
var _text_rect: ColorRect
var _gfx_rect: ColorRect
var _text_mat: ShaderMaterial
var _gfx_mat: ShaderMaterial

var _atlas_ready: bool = false

# Shader reference
var _shader: Shader

# --- Double-buffered flat arrays (A/B swap) ---
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

# Increments on each atlas rebuild so screens can detect resize
var atlas_generation: int = 0

# Noise instances for animated effects
var _grass_noise: PerlinNoise
var _grass_noise2: PerlinNoise
var _god_ray_noise: PerlinNoise
var _water_noise: PerlinNoise

# Default colors
var _default_fg: Color
var _default_bg: Color

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
	_grass_noise = PerlinNoise.new(SeededRNG.new(42))
	_grass_noise2 = PerlinNoise.new(SeededRNG.new(137))
	_god_ray_noise = PerlinNoise.new(SeededRNG.new(256))
	_water_noise = PerlinNoise.new(SeededRNG.new(99))

	_shader = load("res://assets/shaders/ascii_grid.gdshader")

	_resize()
	get_viewport().size_changed.connect(_on_viewport_resized)


func _on_viewport_resized() -> void:
	# Keep SubViewport locked at 1280x720; the container stretches to fill the window
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

	_allocate_buffers()
	_create_data_textures()

	# Build atlas and rendering rects
	_atlas_ready = false
	_build_atlas()

	_force_full_redraw = true
	_dirty = true


func _measure_char_width(size: int) -> float:
	if font == null:
		return float(size) * 0.6
	return ceilf(font.get_string_size("M", HORIZONTAL_ALIGNMENT_LEFT, -1, size).x)


# ── Atlas building (async) ─────────────────────────

func _build_atlas() -> void:
	var text_result: Dictionary = await GlyphAtlasBuilder.build_atlas(
		font, font_size, cell_width, cell_height, self
	)
	var gfx_result: Dictionary = await GlyphAtlasBuilder.build_atlas(
		font, g_font_size, g_cell_width, g_cell_height, self
	)

	_char_map = text_result.char_map

	_custom_gfx_shader = false
	_gfx_fullscreen = false
	_setup_render_rects(text_result.texture, gfx_result.texture)
	atlas_generation += 1
	_atlas_ready = true
	_force_full_redraw = true
	_dirty = true


func _setup_render_rects(text_atlas: ImageTexture, gfx_atlas: ImageTexture) -> void:
	# Clean up old rects if they exist
	if _text_rect:
		_text_rect.queue_free()
	if _gfx_rect:
		_gfx_rect.queue_free()

	var pixel_w: int = cols * cell_width
	var pixel_h: int = rows * cell_height

	# Text buffer rect (covers full screen)
	_text_mat = ShaderMaterial.new()
	_text_mat.shader = _shader
	_text_mat.set_shader_parameter("grid_cols", cols)
	_text_mat.set_shader_parameter("grid_rows", rows)
	_text_mat.set_shader_parameter("cell_size", Vector2(cell_width, cell_height))
	_text_mat.set_shader_parameter("grid_pixel_size", Vector2(pixel_w, pixel_h))
	_text_mat.set_shader_parameter("cell_data", _t_data_tex)
	_text_mat.set_shader_parameter("cell_bg", _t_bg_tex)
	_text_mat.set_shader_parameter("glyph_atlas", text_atlas)
	_text_mat.set_shader_parameter("atlas_cols", GlyphAtlasBuilder.ATLAS_COLS)
	_text_mat.set_shader_parameter("atlas_rows", GlyphAtlasBuilder.ATLAS_ROWS)

	# Graphics buffer rect (added first so it draws behind text)
	#  — text rect is added second so it renders on top (FPS counter, HUD, etc.)
	var gfx_pixel_w: int = g_cols * g_cell_width
	var gfx_pixel_h: int = g_rows * g_cell_height

	_gfx_mat = ShaderMaterial.new()
	_gfx_mat.shader = _shader
	_gfx_mat.set_shader_parameter("grid_cols", g_cols)
	_gfx_mat.set_shader_parameter("grid_rows", g_rows)
	_gfx_mat.set_shader_parameter("cell_size", Vector2(g_cell_width, g_cell_height))
	_gfx_mat.set_shader_parameter("grid_pixel_size", Vector2(gfx_pixel_w, gfx_pixel_h))
	_gfx_mat.set_shader_parameter("cell_data", _g_data_tex)
	_gfx_mat.set_shader_parameter("cell_bg", _g_bg_tex)
	_gfx_mat.set_shader_parameter("glyph_atlas", gfx_atlas)
	_gfx_mat.set_shader_parameter("atlas_cols", GlyphAtlasBuilder.ATLAS_COLS)
	_gfx_mat.set_shader_parameter("atlas_rows", GlyphAtlasBuilder.ATLAS_ROWS)

	_gfx_rect = ColorRect.new()
	_gfx_rect.material = _gfx_mat
	_gfx_rect.position = Vector2(g_origin_x, g_origin_y)
	_gfx_rect.size = Vector2(gfx_pixel_w, gfx_pixel_h)
	_gfx_rect.color = Color.WHITE
	_gfx_rect.visible = false
	add_child(_gfx_rect)

	# Text buffer rect (covers full screen, renders ON TOP of gfx for HUD/FPS)
	_text_rect = ColorRect.new()
	_text_rect.material = _text_mat
	_text_rect.position = Vector2.ZERO
	_text_rect.size = Vector2(pixel_w, pixel_h)
	_text_rect.color = Color.WHITE
	add_child(_text_rect)


# ── Data texture creation ───────────────────────────

func _create_data_textures() -> void:
	# Text buffer
	_t_data_img = Image.create(cols, rows, false, Image.FORMAT_RGBA8)
	_t_bg_img = Image.create(cols, rows, false, Image.FORMAT_RGBA8)
	_t_data_tex = ImageTexture.create_from_image(_t_data_img)
	_t_bg_tex = ImageTexture.create_from_image(_t_bg_img)

	# Graphics buffer
	_g_data_img = Image.create(g_cols, g_rows, false, Image.FORMAT_RGBA8)
	_g_bg_img = Image.create(g_cols, g_rows, false, Image.FORMAT_RGBA8)
	_g_data_tex = ImageTexture.create_from_image(_g_data_img)
	_g_bg_tex = ImageTexture.create_from_image(_g_bg_img)


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
	if not _atlas_ready:
		_using_set_a = not _using_set_a
		_apply_buffer_refs()
		return

	if force_full_redraw or _force_full_redraw:
		_dirty = true
		_force_full_redraw = false
	else:
		_dirty = _buffers_differ()

	if _dirty:
		_upload_data_textures()

	_gfx_rect.visible = _has_gfx or _custom_gfx_shader
	# Hide text layer when fullscreen custom shader covers everything
	_text_rect.visible = not (_custom_gfx_shader and _gfx_fullscreen)

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


# ── Data texture upload (replaces _composite_image + _draw) ──

func _upload_data_textures() -> void:
	## Build data textures from cell arrays and upload to GPU.
	## Skip text buffer upload when fullscreen custom shader covers it.

	if not (_custom_gfx_shader and _gfx_fullscreen):
		var t_size: int = cols * rows
		var t_data := PackedByteArray()
		t_data.resize(t_size * 4)
		var t_bg_data := PackedByteArray()
		t_bg_data.resize(t_size * 4)

		var offset: int = 0
		for idx in range(t_size):
			var ch: String = _t_chars[idx]
			var gi: int = _char_map.get(ch, 0)
			var fg: Color = _t_fg[idx]
			var bg: Color = _t_bg[idx]
			t_data[offset] = gi
			t_data[offset + 1] = int(fg.r * 255.0)
			t_data[offset + 2] = int(fg.g * 255.0)
			t_data[offset + 3] = int(fg.b * 255.0)
			t_bg_data[offset] = int(bg.r * 255.0)
			t_bg_data[offset + 1] = int(bg.g * 255.0)
			t_bg_data[offset + 2] = int(bg.b * 255.0)
			t_bg_data[offset + 3] = 255
			offset += 4

		_t_data_img = Image.create_from_data(cols, rows, false, Image.FORMAT_RGBA8, t_data)
		_t_bg_img = Image.create_from_data(cols, rows, false, Image.FORMAT_RGBA8, t_bg_data)
		_t_data_tex.update(_t_data_img)
		_t_bg_tex.update(_t_bg_img)

	if _has_gfx and not _custom_gfx_shader:
		var g_size: int = g_cols * g_rows
		var g_data := PackedByteArray()
		g_data.resize(g_size * 4)
		var g_bg_d := PackedByteArray()
		g_bg_d.resize(g_size * 4)

		var offset: int = 0
		for idx in range(g_size):
			var ch: String = _g_chars[idx]
			var gi: int = _char_map.get(ch, 0)
			var fg: Color = _g_fg[idx]
			var bg: Color = _g_bg[idx]
			g_data[offset] = gi
			g_data[offset + 1] = int(fg.r * 255.0)
			g_data[offset + 2] = int(fg.g * 255.0)
			g_data[offset + 3] = int(fg.b * 255.0)
			g_bg_d[offset] = int(bg.r * 255.0)
			g_bg_d[offset + 1] = int(bg.g * 255.0)
			g_bg_d[offset + 2] = int(bg.b * 255.0)
			g_bg_d[offset + 3] = 255
			offset += 4

		_g_data_img = Image.create_from_data(g_cols, g_rows, false, Image.FORMAT_RGBA8, g_data)
		_g_bg_img = Image.create_from_data(g_cols, g_rows, false, Image.FORMAT_RGBA8, g_bg_d)
		_g_data_tex.update(_g_data_img)
		_g_bg_tex.update(_g_bg_img)

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


# ── Custom gfx shader API ───────────────────────

var _custom_gfx_shader: bool = false

func set_gfx_shader(shader: Shader, atlas_tex: ImageTexture = null) -> void:
	## Replace the gfx rect's shader with a custom one.
	## The custom shader is responsible for its own rendering (no data texture uploads).
	if not _atlas_ready or _gfx_rect == null:
		return
	_custom_gfx_shader = true
	_gfx_mat.shader = shader
	# Re-set atlas and grid uniforms the custom shader will need
	_gfx_mat.set_shader_parameter("grid_cols", g_cols)
	_gfx_mat.set_shader_parameter("grid_rows", g_rows)
	_gfx_mat.set_shader_parameter("cell_size", Vector2(g_cell_width, g_cell_height))
	_gfx_mat.set_shader_parameter("grid_pixel_size", Vector2(g_cols * g_cell_width, g_rows * g_cell_height))
	_gfx_mat.set_shader_parameter("atlas_cols", GlyphAtlasBuilder.ATLAS_COLS)
	_gfx_mat.set_shader_parameter("atlas_rows", GlyphAtlasBuilder.ATLAS_ROWS)


func set_gfx_shader_param(param: String, value: Variant) -> void:
	if _gfx_mat:
		_gfx_mat.set_shader_parameter(param, value)


func get_gfx_atlas() -> ImageTexture:
	## Return the gfx glyph atlas texture for use by custom shaders.
	if _gfx_mat:
		return _gfx_mat.get_shader_parameter("glyph_atlas")
	return null


var _gfx_fullscreen: bool = false

func set_gfx_fullscreen(enabled: bool) -> void:
	## Make the gfx rect cover the entire viewport instead of just the game area.
	if _gfx_rect == null:
		return
	_gfx_fullscreen = enabled
	if enabled:
		_gfx_rect.position = Vector2.ZERO
		_gfx_rect.size = Vector2(cols * cell_width, rows * cell_height)
		# Recalculate grid dimensions for full screen at half-size cells
		var full_cols: int = (cols * cell_width) / g_cell_width
		var full_rows: int = (rows * cell_height) / g_cell_height
		_gfx_mat.set_shader_parameter("grid_cols", full_cols)
		_gfx_mat.set_shader_parameter("grid_rows", full_rows)
		_gfx_mat.set_shader_parameter("grid_pixel_size", Vector2(full_cols * g_cell_width, full_rows * g_cell_height))
	else:
		_gfx_rect.position = Vector2(g_origin_x, g_origin_y)
		_gfx_rect.size = Vector2(g_cols * g_cell_width, g_rows * g_cell_height)
		_gfx_mat.set_shader_parameter("grid_cols", g_cols)
		_gfx_mat.set_shader_parameter("grid_rows", g_rows)
		_gfx_mat.set_shader_parameter("grid_pixel_size", Vector2(g_cols * g_cell_width, g_rows * g_cell_height))


func clear_gfx_shader() -> void:
	## Restore the default data-texture shader on the gfx rect.
	if not _atlas_ready or _gfx_rect == null:
		return
	_custom_gfx_shader = false
	set_gfx_fullscreen(false)
	_gfx_mat.shader = _shader
	_gfx_mat.set_shader_parameter("grid_cols", g_cols)
	_gfx_mat.set_shader_parameter("grid_rows", g_rows)
	_gfx_mat.set_shader_parameter("cell_size", Vector2(g_cell_width, g_cell_height))
	_gfx_mat.set_shader_parameter("grid_pixel_size", Vector2(g_cols * g_cell_width, g_rows * g_cell_height))
	_gfx_mat.set_shader_parameter("cell_data", _g_data_tex)
	_gfx_mat.set_shader_parameter("cell_bg", _g_bg_tex)
	_gfx_mat.set_shader_parameter("atlas_cols", GlyphAtlasBuilder.ATLAS_COLS)
	_gfx_mat.set_shader_parameter("atlas_rows", GlyphAtlasBuilder.ATLAS_ROWS)
