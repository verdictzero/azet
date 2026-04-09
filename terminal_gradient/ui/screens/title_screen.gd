class_name TitleScreen
extends BaseScreen
## Title screen with dual-grid compositing:
## - Raster layers (menu, logo, sefirot): fullblock 1:2 cells + dither12
## - Fire background: glyph-atlas ASCII rendering (░▒▓)

const NUM_SEEDS: int = 10
const FIRE_CHARSET: Array[String] = [" ", ".", "\u00B7", ":", "\u2219", "\u2591", "\u2592", "\u2593"]
const MENU_ITEMS: Array[String] = ["NEW GAME", "CONTINUE", "OPTIONS", "DEBUG"]

var _title_shader: Shader
var _logo_tex: Texture2D
var _sefirot_tex: Texture2D
var _menu_tex: ImageTexture
var _menu_selection: int = 0
var _setup_gen: int = -1
var _full_cols: int = 0
var _full_rows: int = 0
var _sef_base_rect: Vector4 = Vector4.ZERO
var _sef_bob_range: float = 0.0


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_title_shader = load("res://assets/shaders/title_screen.gdshader")
	_logo_tex = load("res://assets/graphics/tg_main_title.png")
	_sefirot_tex = load("res://assets/graphics/tg_sefirot_title_2.png")


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	_setup_gen = -1
	_menu_selection = 0


func on_exit() -> void:
	grid.clear_gfx_shader()
	_setup_gen = -1
	super.on_exit()


func _build_menu_texture() -> ImageTexture:
	## Render menu items as white-on-transparent using the glyph atlas.
	var cw: int = grid.g_cell_width
	var ch: int = grid.g_cell_height
	var atlas_img: Image = grid.get_gfx_atlas().get_image()

	var lines: PackedStringArray = []
	var max_len: int = 0
	for item in MENU_ITEMS:
		var line: String = "[ " + item + " ]"
		lines.append(line)
		max_len = maxi(max_len, line.length())

	var row_h: int = ch * 2  # double-spaced rows
	var img_w: int = max_len * cw
	var img_h: int = lines.size() * row_h
	var img: Image = Image.create(img_w, img_h, false, Image.FORMAT_RGBA8)

	for row in range(lines.size()):
		var line: String = lines[row]
		var x_off: int = (max_len - line.length()) * cw / 2
		for ci in range(line.length()):
			var gi: int = grid._char_map.get(line[ci], 0)
			var ax: int = gi % 16
			var ay: int = gi / 16
			img.blit_rect(atlas_img, Rect2i(ax * cw, ay * ch, cw, ch),
				Vector2i(x_off + ci * cw, row * row_h + (row_h - ch) / 2))

	return ImageTexture.create_from_image(img)


func _setup_shader() -> bool:
	var atlas: ImageTexture = grid.get_gfx_atlas()
	if atlas == null:
		return false

	grid.set_gfx_shader(_title_shader)
	grid.set_gfx_fullscreen(true)
	grid.set_gfx_shader_param("glyph_atlas", atlas)

	# Fire grid: font glyph cells (set by set_gfx_shader / set_gfx_fullscreen)
	_full_cols = (grid.cols * grid.cell_width) / grid.g_cell_width
	_full_rows = (grid.rows * grid.cell_height) / grid.g_cell_height

	# Fire glyph indices
	var glyph_indices := PackedInt32Array()
	glyph_indices.resize(8)
	for i in range(FIRE_CHARSET.size()):
		glyph_indices[i] = grid._char_map.get(FIRE_CHARSET[i], 0)
	grid.set_gfx_shader_param("fire_glyphs", glyph_indices)

	# Raster image grid: fullblock 1:2 cells (2x density)
	var block_w: int = maxi(1, grid.g_cell_width / 2)
	var block_h: int = block_w * 2
	grid.set_gfx_shader_param("block_size", Vector2(block_w, block_h))

	var vp_w: float = float(_full_cols * grid.g_cell_width)
	var vp_h: float = float(_full_rows * grid.g_cell_height)

	var block_cols: int = int(vp_w) / block_w
	var block_rows: int = int(vp_h) / block_h

	# ── Sefirot: 85% height, centered, block-snapped ──
	var sef_aspect: float = 420.0 / 760.0
	var sef_bh: int = int(round(float(block_rows) * 0.85))
	var sef_bw: int = int(round(float(sef_bh) * sef_aspect * float(block_h) / float(block_w)))
	var sef_x: int = (block_cols - sef_bw) / 2
	var sef_y: int = (block_rows - sef_bh) / 2
	_sef_base_rect = Vector4(
		float(sef_x * block_w) / vp_w, float(sef_y * block_h) / vp_h,
		float(sef_bw * block_w) / vp_w, float(sef_bh * block_h) / vp_h
	)
	_sef_bob_range = float(block_h * 3) / vp_h
	grid.set_gfx_shader_param("sefirot_texture", _sefirot_tex)
	grid.set_gfx_shader_param("sefirot_rect", _sef_base_rect)

	# ── Logo: centered, ~60% viewport width, block-snapped ──
	var logo_aspect: float = 1512.0 / 640.0
	var logo_bw: int = int(round(float(block_cols) * 0.6))
	var logo_bh: int = int(round(float(logo_bw) * float(block_w) / (logo_aspect * float(block_h))))
	var logo_x: int = (block_cols - logo_bw) / 2
	var logo_y: int = (block_rows - logo_bh) / 2
	grid.set_gfx_shader_param("logo_texture", _logo_tex)
	grid.set_gfx_shader_param("logo_rect", Vector4(
		float(logo_x * block_w) / vp_w, float(logo_y * block_h) / vp_h,
		float(logo_bw * block_w) / vp_w, float(logo_bh * block_h) / vp_h
	))

	# ── Menu: centered horizontally, lower portion, block-snapped ──
	_menu_tex = _build_menu_texture()
	var menu_cw: int = grid.g_cell_width
	var menu_ch: int = grid.g_cell_height
	var menu_max_len: int = 0
	for item in MENU_ITEMS:
		menu_max_len = maxi(menu_max_len, ("[ " + item + " ]").length())
	var menu_img_aspect: float = float(menu_max_len * menu_cw) / float(MENU_ITEMS.size() * menu_ch * 2)
	var menu_bw: int = int(round(float(block_cols) * 0.35))
	var menu_bh: int = int(round(float(menu_bw) * float(block_w) / (menu_img_aspect * float(block_h))))
	var menu_x: int = (block_cols - menu_bw) / 2
	var menu_y: int = int(round(float(block_rows) * 0.68))
	grid.set_gfx_shader_param("menu_texture", _menu_tex)
	grid.set_gfx_shader_param("menu_rect", Vector4(
		float(menu_x * block_w) / vp_w, float(menu_y * block_h) / vp_h,
		float(menu_bw * block_w) / vp_w, float(menu_bh * block_h) / vp_h
	))
	grid.set_gfx_shader_param("menu_items", MENU_ITEMS.size())
	grid.set_gfx_shader_param("menu_selection", _menu_selection)

	_setup_gen = grid.atlas_generation
	return true


func draw(_d_cols: int, _d_rows: int) -> void:
	if _setup_gen != grid.atlas_generation:
		if not _setup_shader():
			return

	var now: float = grid.frame_time_sec

	# Animate fire seeds in glyph-cell space
	var half_cols: float = float(_full_cols) / 2.0
	var half_rows: float = float(_full_rows) / 2.0
	var seed_arr := PackedVector2Array()
	seed_arr.resize(NUM_SEEDS)
	for s in range(NUM_SEEDS):
		var sf: float = float(s)
		seed_arr[s] = Vector2(
			half_cols + sin(now * 0.45 + sf * 2.09) * (float(_full_cols) * 0.4) + sin(now * 0.26 + sf * 1.3) * (float(_full_cols) * 0.15),
			half_rows + cos(now * 0.375 + sf * 1.88) * (half_rows * 0.8) + cos(now * 0.195 + sf * 0.9) * (half_rows * 0.3)
		)

	grid.set_gfx_shader_param("seeds", seed_arr)
	grid.set_gfx_shader_param("time", now)

	# Sefirot: subtle float up/down
	var bob: float = sin(now * 0.5) * _sef_bob_range
	grid.set_gfx_shader_param("sefirot_rect", Vector4(
		_sef_base_rect.x, _sef_base_rect.y + bob,
		_sef_base_rect.z, _sef_base_rect.w
	))


func handle_input(action: String) -> void:
	match action:
		"move_up":
			_menu_selection = (_menu_selection - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
			grid.set_gfx_shader_param("menu_selection", _menu_selection)
		"move_down":
			_menu_selection = (_menu_selection + 1) % MENU_ITEMS.size()
			grid.set_gfx_shader_param("menu_selection", _menu_selection)
		"interact":
			_select_menu_item()


func _select_menu_item() -> void:
	match _menu_selection:
		0: request_action("new_game")
		1: request_action("continue_game")
		2: request_action("open_settings")
		3: request_action("debug_start")
