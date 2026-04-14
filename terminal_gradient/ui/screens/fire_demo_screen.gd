class_name FireDemoScreen
extends BaseScreen
## Full-screen Voronoi fire — 100% GPU. No CPU per-cell work.

const NUM_SEEDS: int = 10
const FIRE_CHARSET: Array[String] = [" ", ".", "\u00B7", ":", "\u2219", "\u2591", "\u2592", "\u2593"]

var _fire_shader: Shader
var _setup_gen: int = -1
var _frame_count: int = 0
var _fps_accum: float = 0.0
var _display_fps: int = 0
var _last_time: float = 0.0
var _full_cols: int = 0
var _full_rows: int = 0


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_fire_shader = load("res://assets/shaders/fire_grid.gdshader")


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	_setup_gen = -1


func on_exit() -> void:
	grid.clear_gfx_shader()
	_setup_gen = -1
	super.on_exit()


func _setup_shader() -> bool:
	var atlas: Texture2D = grid.get_gfx_atlas()
	if atlas == null:
		return false

	grid.set_gfx_shader(_fire_shader)
	grid.set_gfx_fullscreen(true)
	grid.set_gfx_shader_param("glyph_atlas", atlas)

	_full_cols = (grid.cols * grid.cell_width) / grid.g_cell_width
	_full_rows = (grid.rows * grid.cell_height) / grid.g_cell_height

	var glyph_indices: PackedInt32Array = PackedInt32Array()
	glyph_indices.resize(8)
	for i in range(FIRE_CHARSET.size()):
		glyph_indices[i] = grid._char_map.get(FIRE_CHARSET[i], 0)
	grid.set_gfx_shader_param("fire_glyphs", glyph_indices)
	grid.set_gfx_shader_param("fps_value", 0)

	_setup_gen = grid.atlas_generation
	return true


func draw(_d_cols: int, _d_rows: int) -> void:
	# Re-setup if atlas was rebuilt (resize)
	if _setup_gen != grid.atlas_generation:
		if not _setup_shader():
			return

	# FPS
	var now: float = grid.frame_time_sec
	if _last_time > 0.0:
		var dt: float = now - _last_time
		_fps_accum += dt
		_frame_count += 1
		if _fps_accum >= 0.5:
			_display_fps = roundi(float(_frame_count) / _fps_accum)
			_frame_count = 0
			_fps_accum = 0.0
	_last_time = now

	# Seeds
	var half_cols: float = float(_full_cols) / 2.0
	var half_rows: float = float(_full_rows) / 2.0
	var seed_arr: PackedVector2Array = PackedVector2Array()
	seed_arr.resize(NUM_SEEDS)
	for s in range(NUM_SEEDS):
		var sf: float = float(s)
		seed_arr[s] = Vector2(
			half_cols + sin(now * 0.45 + sf * 2.09) * (float(_full_cols) * 0.4) + sin(now * 0.26 + sf * 1.3) * (float(_full_cols) * 0.15),
			half_rows + cos(now * 0.375 + sf * 1.88) * (half_rows * 0.8) + cos(now * 0.195 + sf * 0.9) * (half_rows * 0.3)
		)

	grid.set_gfx_shader_param("seeds", seed_arr)
	grid.set_gfx_shader_param("time", now)
	grid.set_gfx_shader_param("fps_value", _display_fps)
