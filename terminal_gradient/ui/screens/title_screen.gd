class_name TitleScreen
extends BaseScreen
## Title screen with dual-grid compositing:
## - Raster layers (logo, sefirot): fullblock 1:2 cells + dither12
## - Menu: native Label nodes (crisp TTF rendering)
## - Fire background: glyph-atlas ASCII rendering (░▒▓)

const NUM_SEEDS: int = 10
const FIRE_CHARSET: Array[String] = [" ", ".", "\u00B7", ":", "\u2219", "\u2591", "\u2592", "\u2593"]
const MENU_ITEMS: Array[String] = ["NEW GAME", "CONTINUE", "OPTIONS", "DEBUG", "UI SHELL"]

var _title_shader: Shader
var _particle_shader: Shader
var _logo_tex: Texture2D
var _sefirot_tex: Texture2D
var _menu_font: Font
var _menu_labels: Array[Label] = []
var _menu_selection: int = 0
var _setup_gen: int = -1
var _full_cols: int = 0
var _full_rows: int = 0
var _sef_base_rect: Vector4 = Vector4.ZERO
var _sef_bob_range: float = 0.0
var _particle_subviewport: SubViewport
var _particle_rect: ColorRect
var _particle_mat: ShaderMaterial


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_title_shader = load("res://assets/shaders/title_screen.gdshader")
	_particle_shader = load("res://assets/shaders/title_particles.gdshader")
	_logo_tex = load("res://assets/graphics/tg_main_title.png")
	_sefirot_tex = load("res://assets/graphics/tg_sefirot_title_6.png")
	_menu_font = load("res://assets/fonts/NotoSansMono-Medium.ttf")


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	_setup_gen = -1
	_menu_selection = 0


func on_exit() -> void:
	for label in _menu_labels:
		label.queue_free()
	_menu_labels.clear()
	if _particle_subviewport:
		_particle_subviewport.queue_free()
		_particle_subviewport = null
		_particle_rect = null
		_particle_mat = null
	grid.clear_gfx_shader()
	_setup_gen = -1
	super.on_exit()


func _setup_menu_labels() -> void:
	## Create or reposition native Label nodes for crisp menu text.
	var vp_w: float = float(grid.cols * grid.cell_width)
	var vp_h: float = float(grid.rows * grid.cell_height)
	var font_size: int = clampi(int(vp_h * 0.025), 14, 28)
	var pad_h: float = float(font_size) * 0.5
	var pad_v: float = float(font_size) * 0.25

	var texts: PackedStringArray = []
	var max_w: float = 0
	for item in MENU_ITEMS:
		var text: String = item
		texts.append(text)
		max_w = maxf(max_w, _menu_font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x)

	var padded_w: float = max_w + pad_h * 2.0
	var line_h: float = _menu_font.get_height(font_size)
	var padded_h: float = line_h + pad_v * 2.0
	var gap: float = float(font_size)
	var slot_w: float = padded_w + gap
	var total_w: float = slot_w * float(texts.size()) - gap
	var start_x: float = (vp_w - total_w) / 2.0
	var y_pos: float = vp_h * 0.82

	if _menu_labels.is_empty():
		for i in range(texts.size()):
			var label := Label.new()
			label.text = texts[i]
			label.add_theme_font_override("font", _menu_font)
			label.add_theme_font_size_override("font_size", font_size)
			label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			label.position = Vector2(start_x + float(i) * slot_w, y_pos)
			label.size = Vector2(padded_w, padded_h)
			label.pivot_offset = Vector2(padded_w / 2.0, padded_h / 2.0)
			_menu_labels.append(label)
			grid.add_child(label)
	else:
		for i in range(_menu_labels.size()):
			var label: Label = _menu_labels[i]
			label.add_theme_font_size_override("font_size", font_size)
			label.position = Vector2(start_x + float(i) * slot_w, y_pos)
			label.size = Vector2(padded_w, padded_h)
			label.pivot_offset = Vector2(padded_w / 2.0, padded_h / 2.0)

	_update_menu_colors()


func _update_menu_colors() -> void:
	for i in range(_menu_labels.size()):
		MenuButtonStyle.apply(_menu_labels[i], i == _menu_selection)


func _setup_particle_subviewport(vp_w: int, vp_h: int, block_cols: int, block_rows: int) -> void:
	## Lazily creates the SubViewport + ColorRect that runs the particle
	## shader at block resolution, and (re)sizes it to match the current
	## block grid. The SubViewport texture is sampled by the main shader.
	if _particle_subviewport == null:
		_particle_subviewport = SubViewport.new()
		_particle_subviewport.transparent_bg = true
		_particle_subviewport.disable_3d = true
		_particle_subviewport.gui_disable_input = true
		_particle_subviewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		_particle_mat = ShaderMaterial.new()
		_particle_mat.shader = _particle_shader
		_particle_rect = ColorRect.new()
		_particle_rect.material = _particle_mat
		_particle_rect.color = Color.WHITE
		_particle_rect.position = Vector2.ZERO
		_particle_subviewport.add_child(_particle_rect)
		grid.add_child(_particle_subviewport)

	_particle_subviewport.size = Vector2i(block_cols, block_rows)
	_particle_rect.size = Vector2(block_cols, block_rows)
	_particle_mat.set_shader_parameter("grid_pixel_size", Vector2(vp_w, vp_h))
	_particle_mat.set_shader_parameter("time", grid.frame_time_sec)


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

	# ── Particle SubViewport: render the rock-chunk field at block
	# resolution (~1/50× full viewport) and feed it to the main shader as
	# a texture. Without this, the 22-particle × 10-crumb evaluation runs
	# per pixel and tanks the framerate on low-end GPUs. ──
	_setup_particle_subviewport(int(vp_w), int(vp_h), block_cols, block_rows)
	grid.set_gfx_shader_param("particle_buffer", _particle_subviewport.get_texture())

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

	# ── Menu: native Label nodes (crisp TTF, no shader processing) ──
	_setup_menu_labels()

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

	# Drive the particle subviewport's animation clock.
	if _particle_mat:
		_particle_mat.set_shader_parameter("time", now)

	# Sefirot: subtle float up/down
	var bob: float = sin(now * 0.5) * _sef_bob_range
	grid.set_gfx_shader_param("sefirot_rect", Vector4(
		_sef_base_rect.x, _sef_base_rect.y + bob,
		_sef_base_rect.z, _sef_base_rect.w
	))


func handle_input(action: String) -> void:
	match action:
		"move_left", "move_up":
			_menu_selection = (_menu_selection - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
			_update_menu_colors()
		"move_right", "move_down":
			_menu_selection = (_menu_selection + 1) % MENU_ITEMS.size()
			_update_menu_colors()
		"interact":
			_select_menu_item()


func _select_menu_item() -> void:
	match _menu_selection:
		0: request_action("new_game")
		1: request_action("continue_game")
		2: request_action("open_settings")
		3: request_action("debug_start")
		4: request_action("ui_shell_demo")
