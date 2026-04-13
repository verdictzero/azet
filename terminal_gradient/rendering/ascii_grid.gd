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
## Baked font-atlas name (key in tools/bake_glyph_atlases.gd FONT_PATHS, e.g.
## "primary", "runic", "cuneiform"). Runtime loads the PNG via
## FontAtlasCache. On cache miss we fall back to live-rasterizing `font`.
@export var text_font_name: String = "primary"
@export var gfx_font_name: String = "primary"

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

# When true, the gfx buffer covers the entire SubViewport instead of being
# inset inside the HUD frame. Overworld-style screens use this to render
# edge-to-edge. Toggle via set_gfx_fills_viewport(). Distinct from
# `_gfx_fullscreen` which is the custom-shader escape hatch used by the
# title screen; this flag keeps the data-texture pipeline but grows the
# gfx grid to viewport size.
var _gfx_fills_viewport: bool = false
var _base_g_cell_width: int = 0
var _base_g_cell_height: int = 0

const TILE_DENSITY := 6
# Active density — set to TILE_DENSITY/2 by set_gfx_fills_viewport for overworld perf.
var active_tile_density: int = TILE_DENSITY

# Height encoding for _g_height*. 128 = ground level. 1 byte step ≈ 1/32 of
# a world-space height unit, giving ±4 units range — plenty for trees,
# buildings, and pits at tile scale.
const HEIGHT_ZERO: int = 128
const HEIGHT_SCALE: float = 32.0

# --- GPU rendering ---
var _char_map: Dictionary = {}  # String -> int (glyph index)
var _gi_table: PackedInt32Array = PackedInt32Array()  # Unicode codepoint → glyph index (O(1) lookup)

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
# Per-cell height (R8). Feeds the lighting/shadow/god-ray pass in
# assets/shaders/ascii_grid.gdshader. 128 = ground level; < 128 are pits
# and rivers, > 128 are occluders (trees, buildings).
var _g_height_img: Image
var _g_height_tex: ImageTexture

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
var _g_gi_a: PackedInt32Array
var _g_height_a: PackedByteArray  # per-cell height, 128 = h=0, ±4 units @ ~0.03 res
var _g_chars_b: PackedStringArray
var _g_fg_b: PackedColorArray
var _g_bg_b: PackedColorArray
var _g_gi_b: PackedInt32Array
var _g_height_b: PackedByteArray

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
var _g_gi: PackedInt32Array
var _g_height: PackedByteArray
var _g_prev_chars: PackedStringArray
var _g_prev_fg: PackedColorArray
var _g_prev_bg: PackedColorArray
var _g_prev_gi: PackedInt32Array
var _g_prev_height: PackedByteArray

var _using_set_a: bool = true

# Dirty tracking
var _dirty: bool = true
var _force_full_redraw: bool = true
var _has_gfx: bool = false
var _has_text: bool = false
# When true, the gfx/text rects stay hidden regardless of buffer state.
# Sprite-based screens (new overworld) set this so their own nodes render
# uncovered by the ASCII layers.
var _hide_default_layers: bool = false

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
	get: return g_cols / active_tile_density
var world_rows: int:
	get: return g_rows / active_tile_density


func _ready() -> void:
	if font == null:
		# Primary mono + card-suit/math fallback chain. See core/fonts.gd
		# for why this is load-through-FontLibrary instead of a scene ref.
		font = FontLibrary.primary()
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

	# Ceil, not floor, so the text rect fully covers the SubViewport.
	# Floor leaves a gap of up to (cell_width - 1) px on the right and
	# (cell_height - 1) px on the bottom — at 1280×720 with cell_height=22
	# that's 16 px of gray default-clear strip at the bottom. Ceiling
	# gives one extra cell that slightly overshoots the viewport, which
	# the SubViewport clips cleanly.
	cols = ceili(float(vp_size.x) / float(cell_width))
	rows = ceili(float(vp_size.y) / float(cell_height))
	cols = clampi(cols, 30, 160)
	var min_rows: int = Constants.hud_total() + 5
	if rows < min_rows:
		rows = min_rows

	g_font_size = maxi(5, roundi(font_size / 2))
	g_cell_width = int(_measure_char_width(g_font_size))
	g_cell_height = int(ceilf(float(g_font_size) * 1.35))
	if g_cell_width < 1:
		g_cell_width = int(float(g_font_size) * 0.6)
	_base_g_cell_width = g_cell_width
	_base_g_cell_height = g_cell_height
	active_tile_density = TILE_DENSITY

	var vp_pixel_w: int
	var vp_pixel_h: int
	if _gfx_fills_viewport:
		vp_pixel_w = cols * cell_width
		vp_pixel_h = rows * cell_height
		g_origin_x = 0
		g_origin_y = 0
	else:
		vp_pixel_w = (cols - 2) * cell_width
		vp_pixel_h = (rows - Constants.hud_total()) * cell_height
		g_origin_x = cell_width
		g_origin_y = Constants.viewport_top() * cell_height
	# Ceil for the same reason as cols/rows above — avoids a sub-cell
	# gap at the inset's right/bottom edge if g_cell_width doesn't
	# divide vp_pixel_w cleanly.
	g_cols = maxi(1, ceili(float(vp_pixel_w) / float(g_cell_width)))
	g_rows = maxi(1, ceili(float(vp_pixel_h) / float(g_cell_height)))

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
	# Prefer pre-baked atlases from FontAtlasCache (zero-cost load of a PNG).
	# Fall back to live SubViewport rasterization when the cache is missing,
	# stale, or the requested entry wasn't baked — keeps the dev loop
	# working when someone tweaks CHARSET without rebaking, and preserves
	# the original behavior if `assets/glyph_atlases/` hasn't been
	# generated yet.
	var text_tex: Texture2D = null
	var gfx_tex: Texture2D = null

	var text_baked: Dictionary = FontAtlasCache.get_atlas(text_font_name, font_size)
	if not text_baked.is_empty() and _atlas_cell_dims_match(text_baked, cell_width, cell_height):
		text_tex = text_baked.texture
	else:
		if not text_baked.is_empty():
			# Dims mismatch — log and fall through to live rasterization so
			# the grid still renders with the wrong-but-correct-size atlas.
			push_warning("[AsciiGrid] baked text atlas '%s_%d' has cell %dx%d but grid needs %dx%d; live-rasterizing" % [
				text_font_name, font_size, text_baked.cell_w, text_baked.cell_h, cell_width, cell_height
			])
		var text_result: Dictionary = await GlyphAtlasBuilder.build_atlas(
			font, font_size, cell_width, cell_height, self
		)
		text_tex = text_result.texture

	var gfx_baked: Dictionary = FontAtlasCache.get_atlas(gfx_font_name, g_font_size)
	if not gfx_baked.is_empty() and _atlas_cell_dims_match(gfx_baked, g_cell_width, g_cell_height):
		gfx_tex = gfx_baked.texture
	else:
		if not gfx_baked.is_empty():
			push_warning("[AsciiGrid] baked gfx atlas '%s_%d' has cell %dx%d but grid needs %dx%d; live-rasterizing" % [
				gfx_font_name, g_font_size, gfx_baked.cell_w, gfx_baked.cell_h, g_cell_width, g_cell_height
			])
		var gfx_result: Dictionary = await GlyphAtlasBuilder.build_atlas(
			font, g_font_size, g_cell_width, g_cell_height, self
		)
		gfx_tex = gfx_result.texture

	# char_map / gi_table are CHARSET-derived, identical across every
	# baked font. Build once from the shared source so set_font_atlas()
	# can swap the `glyph_atlas` uniform without touching these.
	_char_map = FontAtlasCache.get_char_map()
	_gi_table = FontAtlasCache.get_gi_table()

	_custom_gfx_shader = false
	_gfx_fullscreen = false
	_setup_render_rects(text_tex, gfx_tex)
	atlas_generation += 1
	_atlas_ready = true
	_force_full_redraw = true
	_dirty = true


static func _atlas_cell_dims_match(baked: Dictionary, cw: int, ch: int) -> bool:
	return int(baked.get("cell_w", -1)) == cw and int(baked.get("cell_h", -1)) == ch


## Swap the baked atlas bound to one of the rendering buffers at runtime.
## `target` must be &"text" or &"gfx". `font_name` is a key from
## tools/bake_glyph_atlases.gd FONT_PATHS (e.g. "runic", "cuneiform").
## Cheap: only rebinds the `glyph_atlas` shader uniform — char_map and
## gi_table are CHARSET-derived and shared across every baked font.
## Rejects the swap if the baked atlas's cell dims don't match the
## grid's current cell dims (different cell size would require full
## re-layout, which is out of scope).
func set_font_atlas(target: StringName, font_name: String) -> bool:
	if not _atlas_ready:
		push_warning("[AsciiGrid] set_font_atlas called before atlas was ready")
		return false

	var mat: ShaderMaterial = null
	var cw: int = 0
	var ch: int = 0
	var size: int = 0
	if target == &"text":
		mat = _text_mat
		cw = cell_width
		ch = cell_height
		size = font_size
		text_font_name = font_name
	elif target == &"gfx":
		mat = _gfx_mat
		cw = g_cell_width
		ch = g_cell_height
		size = g_font_size
		gfx_font_name = font_name
	else:
		push_error("[AsciiGrid] set_font_atlas target must be &\"text\" or &\"gfx\" (got %s)" % target)
		return false

	var baked: Dictionary = FontAtlasCache.get_atlas(font_name, size)
	if baked.is_empty():
		push_error("[AsciiGrid] no baked atlas for '%s_%d' — run tools/bake_glyph_atlases.gd" % [font_name, size])
		return false
	if not _atlas_cell_dims_match(baked, cw, ch):
		push_error("[AsciiGrid] baked atlas '%s_%d' cell %dx%d doesn't match grid %dx%d; refusing swap" % [
			font_name, size, baked.cell_w, baked.cell_h, cw, ch
		])
		return false

	mat.set_shader_parameter("glyph_atlas", baked.texture)
	atlas_generation += 1
	_force_full_redraw = true
	_dirty = true
	return true


func _setup_render_rects(text_atlas: Texture2D, gfx_atlas: Texture2D) -> void:
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
	# Text layer bypasses lighting (sun_intensity/moon_intensity stay 0 by
	# default) but the uniform must still be bound to a valid sampler.
	_text_mat.set_shader_parameter("cell_height", _g_height_tex)
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
	_gfx_mat.set_shader_parameter("cell_height", _g_height_tex)
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
	# Per-cell height, single channel, 128 = ground level.
	_g_height_img = Image.create(g_cols, g_rows, false, Image.FORMAT_R8)
	_g_height_img.fill(Color8(HEIGHT_ZERO, HEIGHT_ZERO, HEIGHT_ZERO, 255))
	_g_height_tex = ImageTexture.create_from_image(_g_height_img)


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
	_g_gi_a = _make_int_array(g_size, 0)
	_g_height_a = _make_byte_array(g_size, HEIGHT_ZERO)
	_g_chars_b = _make_string_array(g_size, " ")
	_g_fg_b = _make_color_array(g_size, _default_fg)
	_g_bg_b = _make_color_array(g_size, _default_bg)
	_g_gi_b = _make_int_array(g_size, 0)
	_g_height_b = _make_byte_array(g_size, HEIGHT_ZERO)

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


static func _make_int_array(size: int, fill: int) -> PackedInt32Array:
	var arr := PackedInt32Array()
	arr.resize(size)
	arr.fill(fill)
	return arr


static func _make_byte_array(size: int, fill: int) -> PackedByteArray:
	var arr := PackedByteArray()
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
	_g_gi.fill(0)
	_g_height.fill(HEIGHT_ZERO)
	_has_gfx = false
	_has_text = false


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

	if _hide_default_layers:
		_gfx_rect.visible = false
		_text_rect.visible = false
	else:
		_gfx_rect.visible = _has_gfx or _custom_gfx_shader
		# Hide text layer when fullscreen custom shader covers everything
		_text_rect.visible = not (_custom_gfx_shader and _gfx_fullscreen)

	_using_set_a = not _using_set_a
	_apply_buffer_refs()


func _apply_buffer_refs() -> void:
	if _using_set_a:
		_t_chars = _t_chars_a; _t_fg = _t_fg_a; _t_bg = _t_bg_a
		_t_prev_chars = _t_chars_b; _t_prev_fg = _t_fg_b; _t_prev_bg = _t_bg_b
		_g_chars = _g_chars_a; _g_fg = _g_fg_a; _g_bg = _g_bg_a; _g_gi = _g_gi_a; _g_height = _g_height_a
		_g_prev_chars = _g_chars_b; _g_prev_fg = _g_fg_b; _g_prev_bg = _g_bg_b; _g_prev_gi = _g_gi_b; _g_prev_height = _g_height_b
	else:
		_t_chars = _t_chars_b; _t_fg = _t_fg_b; _t_bg = _t_bg_b
		_t_prev_chars = _t_chars_a; _t_prev_fg = _t_fg_a; _t_prev_bg = _t_bg_a
		_g_chars = _g_chars_b; _g_fg = _g_fg_b; _g_bg = _g_bg_b; _g_gi = _g_gi_b; _g_height = _g_height_b
		_g_prev_chars = _g_chars_a; _g_prev_fg = _g_fg_a; _g_prev_bg = _g_bg_a; _g_prev_gi = _g_gi_a; _g_prev_height = _g_height_a


func set_default_layers_hidden(hidden: bool) -> void:
	## Hide/show the ASCII text + gfx rects. Used by sprite-based screens
	## (e.g. new overworld) that render their own nodes over the SubViewport.
	_hide_default_layers = hidden
	if _text_rect:
		_text_rect.visible = not hidden
	if _gfx_rect and not hidden:
		_gfx_rect.visible = _has_gfx or _custom_gfx_shader
	elif _gfx_rect:
		_gfx_rect.visible = false


func invalidate() -> void:
	_force_full_redraw = true


func _buffers_differ() -> bool:
	if _t_chars != _t_prev_chars or _t_fg != _t_prev_fg or _t_bg != _t_prev_bg:
		return true
	if _g_chars != _g_prev_chars or _g_fg != _g_prev_fg or _g_bg != _g_prev_bg:
		return true
	if _g_height != _g_prev_height:
		return true
	return false


# ── Data texture upload (replaces _composite_image + _draw) ──

func _upload_data_textures() -> void:
	## Build data textures from cell arrays and upload to GPU.
	## Skip text buffer upload when fullscreen custom shader covers it.

	if _has_text and not (_custom_gfx_shader and _gfx_fullscreen):
		var t_size: int = cols * rows
		var t_data := PackedByteArray()
		t_data.resize(t_size * 4)
		var t_bg_data := PackedByteArray()
		t_bg_data.resize(t_size * 4)

		var gi_tbl: PackedInt32Array = _gi_table
		var offset: int = 0
		for idx in range(t_size):
			var ch: String = _t_chars[idx]
			var gi: int = gi_tbl[ch.unicode_at(0)] if ch.length() > 0 else 0
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

		var gi_buf: PackedInt32Array = _g_gi
		var offset: int = 0
		for idx in range(g_size):
			var gi: int = gi_buf[idx]
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

		# Height texture — piggybacks on the gfx upload so the lighting
		# pass stays in sync with the visuals. PackedByteArray layout is
		# already R8-compatible, no per-cell copy needed.
		if _g_height != _g_prev_height:
			_g_height_img = Image.create_from_data(g_cols, g_rows, false, Image.FORMAT_R8, _g_height)
			_g_height_tex.update(_g_height_img)

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
	_has_text = true


func set_gfx_char(col: int, row: int, ch: String, fg: Color = Color.TRANSPARENT, bg: Color = Color.TRANSPARENT) -> void:
	if row < 0 or row >= g_rows or col < 0 or col >= g_cols:
		return
	var idx: int = _gi(col, row)
	_g_chars[idx] = ch
	var cp: int = ch.unicode_at(0) if ch.length() > 0 else 0
	_g_gi[idx] = _gi_table[cp] if cp < _gi_table.size() else 0
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
	_has_text = true


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
	## PERF hot path. The overworld calls this ~420 times per frame. Two
	## fast paths:
	##   1. Whole tile in bounds → inline writes to the _g_* arrays,
	##      skipping the per-cell bounds check and set_gfx_char dispatch.
	##   2. Partially clipped tile → fall back to set_gfx_char.
	var base_c: int = wx_off * active_tile_density
	var base_r: int = wy_off * active_tile_density
	var rows_n: int = expanded.chars.size()
	if rows_n == 0:
		return
	var first_row: Array = expanded.chars[0]
	var cols_n: int = first_row.size()

	# Fast path: whole tile fits inside [0, g_cols) × [0, g_rows).
	if (base_c >= 0 and base_r >= 0
			and base_c + cols_n <= g_cols
			and base_r + rows_n <= g_rows):
		var chars_arr: Array = expanded.chars
		var fgs_arr: Array = expanded.fgs
		var bgs_arr: Array = expanded.bgs
		var gi_tbl: PackedInt32Array = _gi_table
		for dy in range(rows_n):
			var row_c: Array = chars_arr[dy]
			var row_f: Array = fgs_arr[dy]
			var row_b: Array = bgs_arr[dy]
			var base_idx: int = (base_r + dy) * g_cols + base_c
			for dx in range(cols_n):
				var idx: int = base_idx + dx
				var ch_s: String = row_c[dx]
				_g_chars[idx] = ch_s
				_g_gi[idx] = gi_tbl[ch_s.unicode_at(0)]
				_g_fg[idx] = row_f[dx]
				_g_bg[idx] = row_b[dx]
		_has_gfx = true
		return

	# Slow path — partially clipped.
	for dy in range(rows_n):
		var row: Array = expanded.chars[dy]
		var fg_row: Array = expanded.fgs[dy]
		var bg_row: Array = expanded.bgs[dy]
		var cn: int = row.size()
		for dx in range(cn):
			set_gfx_char(base_c + dx, base_r + dy, row[dx], fg_row[dx], bg_row[dx])


func draw_world_tile_darkened(wx_off: int, wy_off: int, expanded: Dictionary,
		fg_darken: float, bg_darken: float) -> void:
	## Like draw_world_tile but multiplies fg/bg by (1-darken) inline.
	## Folds shadow + forest-interior darkening into the tile blit so the
	## overworld avoids a separate tint pass (saves ~15k Color.lerp/frame).
	var base_c: int = wx_off * active_tile_density
	var base_r: int = wy_off * active_tile_density
	var rows_n: int = expanded.chars.size()
	if rows_n == 0:
		return
	var cols_n: int = (expanded.chars[0] as Array).size()
	if (base_c < 0 or base_r < 0
			or base_c + cols_n > g_cols
			or base_r + rows_n > g_rows):
		draw_world_tile(wx_off, wy_off, expanded)
		return
	var fg_m: float = 1.0 - fg_darken
	var bg_m: float = 1.0 - bg_darken
	var chars_arr: Array = expanded.chars
	var fgs_arr: Array = expanded.fgs
	var bgs_arr: Array = expanded.bgs
	var gi_tbl: PackedInt32Array = _gi_table
	for dy in range(rows_n):
		var row_c: Array = chars_arr[dy]
		var row_f: Array = fgs_arr[dy]
		var row_b: Array = bgs_arr[dy]
		var base_idx: int = (base_r + dy) * g_cols + base_c
		for dx in range(cols_n):
			var idx: int = base_idx + dx
			var ch_s: String = row_c[dx]
			_g_chars[idx] = ch_s
			_g_gi[idx] = gi_tbl[ch_s.unicode_at(0)]
			var f: Color = row_f[dx]
			_g_fg[idx] = Color(f.r * fg_m, f.g * fg_m, f.b * fg_m)
			var b: Color = row_b[dx]
			_g_bg[idx] = Color(b.r * bg_m, b.g * bg_m, b.b * bg_m)
	_has_gfx = true


func draw_entity_char(wx_off: int, wy_off: int, ch: String, fg: Color, bg: Color = Color.TRANSPARENT) -> void:
	set_gfx_char(
		wx_off * active_tile_density + active_tile_density / 2,
		wy_off * active_tile_density + active_tile_density / 2,
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


func set_gfx_cell_height(col: int, row: int, h: float) -> void:
	## Write per-cell height for the lighting/shadow pass. `h` is in
	## world-space units: ~0 = ground, positive = occluders that cast
	## shadows (trees, buildings), negative = pits/rivers. Values are
	## packed into a single byte via HEIGHT_SCALE (see header).
	if row < 0 or row >= g_rows or col < 0 or col >= g_cols:
		return
	var b: int = clampi(int(round(h * HEIGHT_SCALE)) + HEIGHT_ZERO, 0, 255)
	_g_height[_gi(col, row)] = b


func set_lighting_uniforms(sun_dir: Vector2, moon_dir: Vector2,
		sun_intensity: float, moon_intensity: float, day_factor: float) -> void:
	## Push per-frame lighting state to the gfx shader. Cheap: 5 uniform
	## writes, no texture upload, no array traversal. Safe to call every
	## frame even when the static-camera skip bails on redraws — the
	## shader reads these uniforms on its next render pass regardless.
	if _gfx_mat == null:
		return
	_gfx_mat.set_shader_parameter("sun_dir", sun_dir)
	_gfx_mat.set_shader_parameter("moon_dir", moon_dir)
	_gfx_mat.set_shader_parameter("sun_intensity", sun_intensity)
	_gfx_mat.set_shader_parameter("moon_intensity", moon_intensity)
	_gfx_mat.set_shader_parameter("day_factor", day_factor)


func tint_gfx_cell_weighted(col: int, row: int, tint: Color,
		fg_alpha: float, bg_alpha: float) -> void:
	## Tint fg and bg of a gfx cell with independent alphas. Used by the
	## overworld god-ray pass so bright sunbeams can brighten character
	## pixels strongly without washing out dark tile backgrounds.
	if row < 0 or row >= g_rows or col < 0 or col >= g_cols:
		return
	var idx: int = _gi(col, row)
	if fg_alpha > 0.0:
		_g_fg[idx] = _g_fg[idx].lerp(tint, fg_alpha)
	if bg_alpha > 0.0:
		_g_bg[idx] = _g_bg[idx].lerp(tint, bg_alpha)


func get_text_char(col: int, row: int) -> String:
	if row < 0 or row >= rows or col < 0 or col >= cols:
		return " "
	return _t_chars[_ti(col, row)]


# ── Custom gfx shader API ───────────────────────

var _custom_gfx_shader: bool = false

func set_gfx_shader(shader: Shader, atlas_tex: Texture2D = null) -> void:
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


func get_gfx_atlas() -> Texture2D:
	## Return the gfx glyph atlas texture for use by custom shaders.
	## Returns a Texture2D (ImageTexture for live-rasterized atlases,
	## CompressedTexture2D for baked-PNG atlases loaded via
	## FontAtlasCache).
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
		# Recalculate grid dimensions for full screen at half-size cells.
		# Use ceil to guarantee the shader covers the entire ColorRect — integer
		# truncation here was leaving a strip of unrendered pixels at the bottom.
		var full_cols: int = ceili(float(cols * cell_width) / float(g_cell_width))
		var full_rows: int = ceili(float(rows * cell_height) / float(g_cell_height))
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


func set_gfx_fills_viewport(enabled: bool) -> void:
	## Toggle fullscreen data-texture gfx mode. When enabled, the gfx rect
	## covers the entire viewport (instead of the interior of the HUD
	## frame) and the gfx data buffers are reallocated to match. When
	## disabled, the gfx rect returns to the default HUD-inset position
	## and size. Unlike set_gfx_fullscreen (custom-shader path), this
	## keeps the default data-texture pipeline — draw_world_tile etc.
	## still work. Does NOT rebuild the atlas, so the toggle is fast.
	if _gfx_fills_viewport == enabled:
		return
	_gfx_fills_viewport = enabled

	var vp_pixel_w: int
	var vp_pixel_h: int
	if enabled:
		vp_pixel_w = cols * cell_width
		vp_pixel_h = rows * cell_height
		g_origin_x = 0
		g_origin_y = 0
	else:
		vp_pixel_w = (cols - 2) * cell_width
		vp_pixel_h = (rows - Constants.hud_total()) * cell_height
		g_origin_x = cell_width
		g_origin_y = Constants.viewport_top() * cell_height
	g_cols = maxi(1, ceili(float(vp_pixel_w) / float(g_cell_width)))
	g_rows = maxi(1, ceili(float(vp_pixel_h) / float(g_cell_height)))

	# Reallocate gfx buffers (text buffer is untouched).
	var g_size: int = g_rows * g_cols
	_g_chars_a = _make_string_array(g_size, " ")
	_g_fg_a = _make_color_array(g_size, _default_fg)
	_g_bg_a = _make_color_array(g_size, _default_bg)
	_g_gi_a = _make_int_array(g_size, 0)
	_g_height_a = _make_byte_array(g_size, HEIGHT_ZERO)
	_g_chars_b = _make_string_array(g_size, " ")
	_g_fg_b = _make_color_array(g_size, _default_fg)
	_g_bg_b = _make_color_array(g_size, _default_bg)
	_g_gi_b = _make_int_array(g_size, 0)
	_g_height_b = _make_byte_array(g_size, HEIGHT_ZERO)
	_apply_buffer_refs()

	# Recreate gfx data textures at the new dimensions.
	_g_data_img = Image.create(g_cols, g_rows, false, Image.FORMAT_RGBA8)
	_g_bg_img = Image.create(g_cols, g_rows, false, Image.FORMAT_RGBA8)
	_g_data_tex = ImageTexture.create_from_image(_g_data_img)
	_g_bg_tex = ImageTexture.create_from_image(_g_bg_img)
	_g_height_img = Image.create(g_cols, g_rows, false, Image.FORMAT_R8)
	_g_height_img.fill(Color8(HEIGHT_ZERO, HEIGHT_ZERO, HEIGHT_ZERO, 255))
	_g_height_tex = ImageTexture.create_from_image(_g_height_img)

	# Reposition/resize the gfx rect and push new shader uniforms.
	if _gfx_rect and _gfx_mat:
		_gfx_rect.position = Vector2(g_origin_x, g_origin_y)
		_gfx_rect.size = Vector2(g_cols * g_cell_width, g_rows * g_cell_height)
		_gfx_mat.set_shader_parameter("grid_cols", g_cols)
		_gfx_mat.set_shader_parameter("grid_rows", g_rows)
		_gfx_mat.set_shader_parameter("cell_size", Vector2(g_cell_width, g_cell_height))
		_gfx_mat.set_shader_parameter(
			"grid_pixel_size",
			Vector2(g_cols * g_cell_width, g_rows * g_cell_height)
		)
		_gfx_mat.set_shader_parameter("cell_data", _g_data_tex)
		_gfx_mat.set_shader_parameter("cell_bg", _g_bg_tex)
		_gfx_mat.set_shader_parameter("cell_height", _g_height_tex)
	if _text_mat:
		_text_mat.set_shader_parameter("cell_height", _g_height_tex)

	_force_full_redraw = true
	_dirty = true
