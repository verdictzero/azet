class_name TerrainDemoScreen
extends BaseScreen
## Flat meadow terrain with billboard-sprite vegetation arranged in
## concentric rings around per-chunk glade centers. Rendered into a
## SubViewport and displayed over the AsciiGrid via the raster/dither
## shader.

const CHUNK_SIZE: float = 64.0
const RENDER_DISTANCE: int = 3
const CAM_LERP: float = 0.1
const ORTHO_SIZE: float = 40.0
const CAM_PITCH_DEG: float = -45.0
const CAM_DIST: float = 80.0

const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")

const GROUND_TEX: Texture2D = preload("res://assets/biomes/new_meadow/TERRAIN_new_meadow_grass_checkered_v5.png")

const TREE_1: Texture2D = preload("res://assets/biomes/new_meadow/TREE_new_meadow_tree_1.png")
const TREE_2: Texture2D = preload("res://assets/biomes/new_meadow/TREE_new_meadow_tree_2.png")
const TREE_3: Texture2D = preload("res://assets/biomes/new_meadow/TREE_new_meadow_tree_3.png")
const BUSH_1: Texture2D = preload("res://assets/biomes/new_meadow/BUSH_new_meadow_bush_1.png")
const BUSH_2: Texture2D = preload("res://assets/biomes/new_meadow/BUSH_new_meadow_bush_2.png")
const BUSH_3: Texture2D = preload("res://assets/biomes/new_meadow/BUSH_new_meadow_bush_3.png")
const BUSH_4: Texture2D = preload("res://assets/biomes/new_meadow/BUSH_new_meadow_bush_4.png")
const FERN_1: Texture2D = preload("res://assets/biomes/new_meadow/FERN_fern_1_inter.png")
const FERN_2: Texture2D = preload("res://assets/biomes/new_meadow/FERN_fern_2_inter.png")
const FERN_3: Texture2D = preload("res://assets/biomes/new_meadow/FERN_fern_3_inter.png")
const FERN_4: Texture2D = preload("res://assets/biomes/new_meadow/FERN_fern_4_inter.png")
const GRASS_1: Texture2D = preload("res://assets/biomes/new_meadow/GRASS_new_meadow_grass_1.png")
const GRASS_2: Texture2D = preload("res://assets/biomes/new_meadow/GRASS_new_meadow_grass_2.png")
const GRASS_TALL_1: Texture2D = preload("res://assets/biomes/new_meadow/GRASS_new_meadow_grass_tall_1.png")
const FLOWER_1: Texture2D = preload("res://assets/biomes/new_meadow/FLOWER_new_meadow_flower_1.png")
const FLOWER_2: Texture2D = preload("res://assets/biomes/new_meadow/FLOWER_new_meadow_flower_2.png")

var _ring_layers: Array = []
var _ground_material: StandardMaterial3D

var _viewport: SubViewport
var _texture_rect: TextureRect
var _camera: Camera3D
var _player: CharacterBody3D
var _chunk_container: Node3D
var _active_chunks: Dictionary = {}
var _hud_label: Label


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_ring_layers = [
		{"textures": [TREE_1],                      "inner": 17.0, "outer": 22.0, "world_h": 8.0, "count": 8},
		{"textures": [TREE_2],                      "inner": 13.0, "outer": 18.0, "world_h": 6.0, "count": 10},
		{"textures": [TREE_3],                      "inner": 9.0,  "outer": 14.0, "world_h": 4.0, "count": 10},
		{"textures": [BUSH_1, BUSH_2, BUSH_3, BUSH_4], "inner": 6.0,  "outer": 10.0, "world_h": 1.8, "count": 14},
		{"textures": [FERN_1, FERN_2, FERN_3, FERN_4], "inner": 4.0,  "outer": 7.0,  "world_h": 1.0, "count": 16},
		{"textures": [GRASS_1, GRASS_2, GRASS_TALL_1], "inner": 2.0,  "outer": 5.0,  "world_h": 0.8, "count": 22},
		{"textures": [FLOWER_1, FLOWER_2],          "inner": 0.0,  "outer": 3.0,  "world_h": 0.9, "count": 18},
	]


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	_build_world()


func on_exit() -> void:
	_cleanup()
	super.on_exit()


func handle_input(action: String) -> void:
	if action == "cancel":
		request_action("goto_debug_menu")


func draw(cols: int, rows: int) -> void:
	grid.fill_region(0, 0, cols, rows, " ", Color.BLACK, Color.BLACK)
	_update_chunks()
	_update_camera()
	if _player and _hud_label:
		var px: float = _player.global_position.x
		var pz: float = _player.global_position.z
		var cx: int = int(floor(px / CHUNK_SIZE))
		var cz: int = int(floor(pz / CHUNK_SIZE))
		_hud_label.text = "Chunk (%d,%d)  %d chunks  [ESC] Back" % [
			cx, cz, _active_chunks.size()]


# ── World setup ────────────────────────────────────

func _build_world() -> void:
	var full_w: int = grid.cols * grid.cell_width
	var full_h: int = grid.rows * grid.cell_height
	_viewport = SubViewport.new()
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_viewport.handle_input_locally = false
	_viewport.transparent_bg = false
	_viewport.size = Vector2i(full_w / 2, full_h / 2)
	grid.add_child(_viewport)

	var scene := Node3D.new()
	scene.name = "TerrainScene"
	_viewport.add_child(scene)

	var world_env := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#1a1a2e")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#b8c4d8")
	env.ambient_light_energy = 1.4
	env.ambient_light_sky_contribution = 0.0
	world_env.environment = env
	scene.add_child(world_env)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-20, 45, 0)
	light.light_energy = 1.3
	light.light_color = Color("#fff4e0")
	light.shadow_enabled = true
	light.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	light.directional_shadow_max_distance = 120.0
	light.shadow_bias = 0.15
	light.shadow_normal_bias = 2.0
	scene.add_child(light)

	_ground_material = StandardMaterial3D.new()
	_ground_material.albedo_texture = GROUND_TEX
	_ground_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	_ground_material.uv1_scale = Vector3(8.0, 8.0, 1.0)
	_ground_material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX

	_chunk_container = Node3D.new()
	_chunk_container.name = "Chunks"
	scene.add_child(_chunk_container)

	_player = CharacterBody3D.new()
	_player.name = "Player"
	_player.set_script(preload("res://terrain/terrain_player.gd"))
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.4; cap.height = 1.8
	col.shape = cap
	_player.add_child(col)
	scene.add_child(_player)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = ORTHO_SIZE
	_camera.near = 1.0; _camera.far = 200.0
	_camera.current = true
	scene.add_child(_camera)

	_texture_rect = TextureRect.new()
	_texture_rect.texture = _viewport.get_texture()
	_texture_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_texture_rect.position = Vector2.ZERO
	_texture_rect.size = Vector2(full_w, full_h)
	_texture_rect.stretch_mode = TextureRect.STRETCH_SCALE
	_texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var raster_mat := ShaderMaterial.new()
	raster_mat.shader = PaneRasterShader
	raster_mat.set_shader_parameter("rect_size_px", Vector2(full_w, full_h))
	var block_w: int = maxi(1, grid.g_cell_width / 2)
	var block_h: int = block_w
	raster_mat.set_shader_parameter("block_size", Vector2(float(block_w), float(block_h)))
	_texture_rect.material = raster_mat
	grid.add_child(_texture_rect)

	_hud_label = Label.new()
	_hud_label.position = Vector2(10, 10)
	_hud_label.add_theme_font_size_override("font_size", 14)
	_hud_label.add_theme_color_override("font_color", Color.WHITE)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.6)
	bg.content_margin_left = 6.0; bg.content_margin_right = 6.0
	bg.content_margin_top = 2.0; bg.content_margin_bottom = 2.0
	_hud_label.add_theme_stylebox_override("normal", bg)
	grid.add_child(_hud_label)


func _cleanup() -> void:
	for chunk in _active_chunks.values():
		chunk.queue_free()
	_active_chunks.clear()
	if _hud_label: _hud_label.queue_free(); _hud_label = null
	if _texture_rect: _texture_rect.queue_free(); _texture_rect = null
	if _viewport: _viewport.queue_free(); _viewport = null
	_player = null; _camera = null; _chunk_container = null
	_ground_material = null


# ── Chunk management ───────────────────────────────

func _update_chunks() -> void:
	if _player == null:
		return
	var px: float = _player.global_position.x
	var pz: float = _player.global_position.z
	var ccx: int = int(floor(px / CHUNK_SIZE))
	var ccz: int = int(floor(pz / CHUNK_SIZE))

	var desired: Dictionary = {}
	for dx in range(-RENDER_DISTANCE, RENDER_DISTANCE + 1):
		for dz in range(-RENDER_DISTANCE, RENDER_DISTANCE + 1):
			desired[Vector2i(ccx + dx, ccz + dz)] = true

	for key: Vector2i in desired:
		if not _active_chunks.has(key):
			_load_chunk(key)

	var stale: Array[Vector2i] = []
	for key: Vector2i in _active_chunks:
		if not desired.has(key):
			stale.append(key)
	for key in stale:
		_active_chunks[key].queue_free()
		_active_chunks.erase(key)


func _load_chunk(key: Vector2i) -> void:
	var chunk := Node3D.new()

	var mesh: ArrayMesh = TerrainMesher.build_flat_chunk_mesh(key.x, key.y)
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = _ground_material
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	chunk.add_child(mi)

	_spawn_glades(chunk, key)
	_chunk_container.add_child(chunk)
	_active_chunks[key] = chunk


func _spawn_glades(parent: Node3D, key: Vector2i) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = key.x * 100003 + key.y
	var n_glades: int = rng.randi_range(1, 3)
	var margin: float = 8.0  # glades may extend past the edge; neighbours fill in
	var ox: float = float(key.x) * CHUNK_SIZE
	var oz: float = float(key.y) * CHUNK_SIZE

	for g in range(n_glades):
		var gx: float = ox + margin + rng.randf() * (CHUNK_SIZE - margin * 2.0)
		var gz: float = oz + margin + rng.randf() * (CHUNK_SIZE - margin * 2.0)
		for layer in _ring_layers:
			var textures: Array = layer.textures
			var inner_r: float = layer.inner
			var outer_r: float = layer.outer
			var world_h: float = layer.world_h
			var count: int = layer.count
			for i in range(count):
				var theta: float = rng.randf() * TAU
				var r: float = lerp(inner_r, outer_r, rng.randf())
				var wx: float = gx + cos(theta) * r
				var wz: float = gz + sin(theta) * r
				var tex: Texture2D = textures[rng.randi() % textures.size()]
				var sprite: MeshInstance3D = TerrainMesher.build_billboard(tex, world_h)
				sprite.position = Vector3(wx, world_h * 0.5, wz)
				parent.add_child(sprite)


# ── Camera ─────────────────────────────────────────

func _update_camera() -> void:
	if _camera == null or _player == null:
		return
	var pitch: float = deg_to_rad(CAM_PITCH_DEG)
	# Place camera behind player along -forward, so the player stays at the
	# view center regardless of pitch. Forward = (0, sin(pitch), -cos(pitch)).
	var offset := Vector3(0.0, -sin(pitch), cos(pitch)) * CAM_DIST
	var tp: Vector3 = _player.global_position + offset
	_camera.global_position = _camera.global_position.lerp(tp, CAM_LERP)
	_camera.rotation_degrees = Vector3(CAM_PITCH_DEG, 0, 0)
