class_name TitleScreen
extends BaseScreen
## Title screen with three composited layers:
## Z-3: Procedural Voronoi fire background (GPU shader)
## Z-2: 3D merkabah model rendered as ASCII block characters (4x fire density)
## Z-1: Terminal Gradient logo image (nearest-neighbor scaled)

const NUM_SEEDS: int = 10
const FIRE_CHARSET: Array[String] = [" ", ".", "\u00B7", ":", "\u2219", "\u2591", "\u2592", "\u2593"]

var _title_shader: Shader
var _matcap_shader: Shader
var _logo_tex: Texture2D
var _setup_gen: int = -1
var _full_cols: int = 0
var _full_rows: int = 0

# 3D SubViewport for merkabah rendering
var _sub_viewport: SubViewport
var _merkabah_root: Node3D


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_title_shader = load("res://assets/shaders/title_screen.gdshader")
	_matcap_shader = load("res://assets/shaders/matcap.gdshader")
	_logo_tex = load("res://assets/graphics/tg_main_title.png")


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	_setup_gen = -1
	_create_merkabah_viewport()


func on_exit() -> void:
	grid.clear_gfx_shader()
	_cleanup_viewport()
	_setup_gen = -1
	super.on_exit()


func _create_merkabah_viewport() -> void:
	_sub_viewport = SubViewport.new()
	_sub_viewport.size = Vector2i(512, 512)
	_sub_viewport.transparent_bg = true
	_sub_viewport.own_world_3d = true
	_sub_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS

	# Camera — perspective, pulled back with wider FOV to show full model
	var camera := Camera3D.new()
	camera.position = Vector3(0.0, 0.0, 6.0)
	camera.look_at(Vector3.ZERO)
	camera.fov = 50.0
	_sub_viewport.add_child(camera)

	# Directional light for specular reflections on metallic surface
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-45.0, 30.0, 0.0)
	light.light_energy = 1.2
	light.light_color = Color(1.0, 0.95, 0.9)
	_sub_viewport.add_child(light)

	# Environment — transparent bg, subtle ambient
	var env_res := Environment.new()
	env_res.background_mode = Environment.BG_COLOR
	env_res.background_color = Color(0, 0, 0, 0)
	env_res.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env_res.ambient_light_color = Color(0.3, 0.28, 0.25)
	env_res.ambient_light_energy = 0.3
	var world_env := WorldEnvironment.new()
	world_env.environment = env_res
	_sub_viewport.add_child(world_env)

	# Merkabah model — unlit matcap material
	var scene: PackedScene = load("res://assets/models/merkabahglb.glb")
	if scene:
		_merkabah_root = scene.instantiate()
		var matcap_mat := ShaderMaterial.new()
		matcap_mat.shader = _matcap_shader
		var matcap_tex: Texture2D = load("res://assets/matcap/matcap_4.png")
		matcap_mat.set_shader_parameter("matcap", matcap_tex)
		matcap_mat.set_shader_parameter("base_color", Color(1.0, 1.0, 1.0, 1.0))
		_apply_material_recursive(_merkabah_root, matcap_mat)
		_sub_viewport.add_child(_merkabah_root)

	grid.add_child(_sub_viewport)


func _cleanup_viewport() -> void:
	if _sub_viewport and is_instance_valid(_sub_viewport):
		_sub_viewport.queue_free()
	_sub_viewport = null
	_merkabah_root = null


func _setup_shader() -> bool:
	var atlas: ImageTexture = grid.get_gfx_atlas()
	if atlas == null:
		return false

	grid.set_gfx_shader(_title_shader)
	grid.set_gfx_fullscreen(true)
	grid.set_gfx_shader_param("glyph_atlas", atlas)

	_full_cols = (grid.cols * grid.cell_width) / grid.g_cell_width
	_full_rows = (grid.rows * grid.cell_height) / grid.g_cell_height

	# Fire glyph indices
	var glyph_indices := PackedInt32Array()
	glyph_indices.resize(8)
	for i in range(FIRE_CHARSET.size()):
		glyph_indices[i] = grid._char_map.get(FIRE_CHARSET[i], 0)
	grid.set_gfx_shader_param("fire_glyphs", glyph_indices)

	# Merkabah texture from SubViewport
	if _sub_viewport:
		grid.set_gfx_shader_param("merkabah_texture", _sub_viewport.get_texture())

	# Merkabah rect — square on screen, centered, fills most of viewport
	var vp_w: float = float(_full_cols * grid.g_cell_width)
	var vp_h: float = float(_full_rows * grid.g_cell_height)
	var merk_pixel_h: float = vp_h * 1.8
	var merk_pixel_w: float = merk_pixel_h  # square
	var merk_uv_w: float = merk_pixel_w / vp_w
	var merk_uv_h: float = merk_pixel_h / vp_h
	grid.set_gfx_shader_param("merkabah_rect", Vector4(
		0.5 - merk_uv_w / 2.0, 0.5 - merk_uv_h / 2.0,
		merk_uv_w, merk_uv_h
	))

	# Mini-cell size: half the fire cell size in each dimension = 4x area density
	grid.set_gfx_shader_param("mini_cell_size", Vector2(
		float(grid.g_cell_width) / 2.0,
		float(grid.g_cell_height) / 2.0
	))
	grid.set_gfx_shader_param("merkabah_threshold", 0.08)

	# Logo texture + rect — centered both horizontally and vertically
	grid.set_gfx_shader_param("logo_texture", _logo_tex)
	var logo_aspect: float = 1512.0 / 640.0
	var logo_uv_w: float = 0.6
	var logo_pixel_w: float = logo_uv_w * vp_w
	var logo_pixel_h: float = logo_pixel_w / logo_aspect
	var logo_uv_h: float = logo_pixel_h / vp_h
	grid.set_gfx_shader_param("logo_rect", Vector4(
		0.5 - logo_uv_w / 2.0, 0.5 - logo_uv_h / 2.0,
		logo_uv_w, logo_uv_h
	))

	_setup_gen = grid.atlas_generation
	return true


func draw(_d_cols: int, _d_rows: int) -> void:
	if _setup_gen != grid.atlas_generation:
		if not _setup_shader():
			return

	var now: float = grid.frame_time_sec

	# Update merkabah rotation — pseudo-random tumbling via irrational frequencies
	if _merkabah_root and is_instance_valid(_merkabah_root):
		_merkabah_root.rotation = Vector3(
			sin(now * 0.31) * PI + sin(now * 0.17) * 0.5,
			sin(now * 0.43) * PI + cos(now * 0.23) * 0.7,
			sin(now * 0.19) * PI * 0.5 + sin(now * 0.37) * 0.3
		)

	# Animate fire seeds (same pattern as FireDemoScreen)
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


func _apply_material_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		for i in range(mi.get_surface_override_material_count()):
			mi.set_surface_override_material(i, mat)
	for child in node.get_children():
		_apply_material_recursive(child, mat)


func handle_input(action: String) -> void:
	if action != "":
		request_action("goto_menu")
