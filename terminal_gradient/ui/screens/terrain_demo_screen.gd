class_name TerrainDemoScreen
extends BaseScreen
## Procedural chunk-based 3D terrain rendered inside a SubViewport.
## Displays as a fullscreen texture over the AsciiGrid.

const CHUNK_SIZE: float = 64.0
const RENDER_DISTANCE: int = 3
const CAM_LERP: float = 0.1
const ORTHO_SIZE: float = 80.0

enum Biome { GRASSLAND, DESERT, HIGHLANDS }

const BIOME_CONFIG := {
	Biome.GRASSLAND: {"color_a": Color("#3a6630"), "color_b": Color("#5a9848"), "color_peak": Color("#7ac060"), "height_scale": 8.0, "plants": ["grass_tuft", "oak_tree"], "density": 25},
	Biome.DESERT:    {"color_a": Color("#b89850"), "color_b": Color("#8a7040"), "color_peak": Color("#d8c890"), "height_scale": 5.0, "plants": ["cactus", "dry_shrub"], "density": 15},
	Biome.HIGHLANDS: {"color_a": Color("#585850"), "color_b": Color("#484038"), "color_peak": Color("#908878"), "height_scale": 22.0, "plants": ["pine_tree", "alpine_shrub"], "density": 18},
}

const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")

var _biome_textures: Dictionary = {}

var _viewport: SubViewport
var _texture_rect: TextureRect
var _camera: Camera3D
var _player: CharacterBody3D
var _chunk_container: Node3D
var _active_chunks: Dictionary = {}
var _height_noise: FastNoiseLite
var _biome_noise: FastNoiseLite
var _hud_label: Label


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_height_noise = FastNoiseLite.new()
	_height_noise.seed = 42
	_height_noise.fractal_type = FastNoiseLite.FRACTAL_FBM
	_height_noise.fractal_octaves = 4
	_height_noise.frequency = 0.004
	_height_noise.fractal_gain = 0.5
	_biome_noise = FastNoiseLite.new()
	_biome_noise.seed = 42
	_biome_noise.fractal_type = FastNoiseLite.FRACTAL_NONE
	_biome_noise.frequency = 0.0015
	# Bake per-biome noise textures synchronously (guaranteed ready)
	for biome in Biome.values():
		_biome_textures[biome] = _bake_biome_texture(BIOME_CONFIG[biome])


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
		_hud_label.text = "Chunk (%d,%d)  %s  %d chunks  [ESC] Back" % [
			cx, cz, Biome.keys()[_get_biome(px, pz)], _active_chunks.size()]


# ── World setup ────────────────────────────────────

func _build_world() -> void:
	var full_w: int = grid.cols * grid.cell_width
	var full_h: int = grid.rows * grid.cell_height
	# Render at half resolution for the chunky pixel look
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
	env.ambient_light_color = Color("#888888")
	env.ambient_light_energy = 0.7
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#1a1a2e")
	world_env.environment = env
	scene.add_child(world_env)

	# Low sun for long shadows
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

	_chunk_container = Node3D.new()
	_chunk_container.name = "Chunks"
	scene.add_child(_chunk_container)

	# Player
	_player = CharacterBody3D.new()
	_player.name = "Player"
	_player.set_script(preload("res://terrain/terrain_player.gd"))
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.4; cap.height = 1.8
	col.shape = cap
	_player.add_child(col)
	scene.add_child(_player)
	_player.height_noise = _height_noise
	_player.biome_noise = _biome_noise

	# Camera
	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = ORTHO_SIZE
	_camera.near = 1.0; _camera.far = 200.0
	_camera.current = true
	scene.add_child(_camera)

	# Viewport texture display with raster dither shader
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
	var block_h: int = block_w * 2
	raster_mat.set_shader_parameter("block_size", Vector2(float(block_w), float(block_h)))
	_texture_rect.material = raster_mat
	grid.add_child(_texture_rect)

	# HUD overlay
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
	var cx: float = (float(key.x) + 0.5) * CHUNK_SIZE
	var cz: float = (float(key.y) + 0.5) * CHUNK_SIZE
	var biome: Biome = _get_biome(cx, cz)
	var config: Dictionary = BIOME_CONFIG[biome]

	var chunk := Node3D.new()

	var mesh: ArrayMesh = TerrainMesher.build_chunk_mesh(key.x, key.y, _height_noise, config.height_scale)
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = config.color_a
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	if _biome_textures.has(biome) and _biome_textures[biome] != null:
		mat.albedo_texture = _biome_textures[biome]
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	chunk.add_child(mi)

	_spawn_vegetation(chunk, key.x, key.y, config)
	_chunk_container.add_child(chunk)
	_active_chunks[key] = chunk


func _spawn_vegetation(parent: Node3D, cx: int, cz: int, config: Dictionary) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = cx * 100003 + cz
	var plants: Array = config.plants
	for i in range(config.density):
		var wx: float = float(cx) * CHUNK_SIZE + rng.randf() * CHUNK_SIZE
		var wz: float = float(cz) * CHUNK_SIZE + rng.randf() * CHUNK_SIZE
		var y: float = _height_at(wx, wz)
		var plant: Node3D = _build_plant(plants[rng.randi() % plants.size()], rng)
		plant.position = Vector3(wx, y, wz)
		parent.add_child(plant)


func _build_plant(t: String, rng: RandomNumberGenerator) -> Node3D:
	match t:
		"grass_tuft":   return TerrainMesher.build_grass_tuft(rng)
		"oak_tree":     return TerrainMesher.build_oak_tree(rng)
		"cactus":       return TerrainMesher.build_cactus(rng)
		"dry_shrub":    return TerrainMesher.build_dry_shrub(rng)
		"pine_tree":    return TerrainMesher.build_pine_tree(rng)
		"alpine_shrub": return TerrainMesher.build_alpine_shrub(rng)
	return Node3D.new()


# ── Helpers ────────────────────────────────────────

func _bake_biome_texture(config: Dictionary) -> ImageTexture:
	## Generate a colored noise texture synchronously for one biome.
	var coarse := FastNoiseLite.new()
	coarse.seed = 7
	coarse.frequency = 0.3
	coarse.fractal_type = FastNoiseLite.FRACTAL_FBM
	coarse.fractal_octaves = 3
	var fine := FastNoiseLite.new()
	fine.seed = 13
	fine.frequency = 1.5
	fine.fractal_type = FastNoiseLite.FRACTAL_FBM
	fine.fractal_octaves = 2
	var sz: int = 256
	var img := Image.create(sz, sz, false, Image.FORMAT_RGB8)
	var ca: Color = config.color_a
	var cb: Color = config.color_b
	for y in range(sz):
		for x in range(sz):
			var nc: float = (coarse.get_noise_2d(float(x), float(y)) + 1.0) * 0.5
			var nf: float = (fine.get_noise_2d(float(x), float(y)) + 1.0) * 0.5
			var c: Color = ca.lerp(cb, nc)
			var br: float = 0.85 + nf * 0.3
			img.set_pixel(x, y, Color(c.r * br, c.g * br, c.b * br))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _get_biome(wx: float, wz: float) -> Biome:
	var val: float = _biome_noise.get_noise_2d(wx, wz)
	if val < -0.33: return Biome.DESERT
	elif val < 0.33: return Biome.GRASSLAND
	else: return Biome.HIGHLANDS


func _height_at(wx: float, wz: float) -> float:
	var config: Dictionary = BIOME_CONFIG[_get_biome(wx, wz)]
	return _height_noise.get_noise_2d(wx, wz) * config.height_scale


func _update_camera() -> void:
	if _camera == null or _player == null:
		return
	var tp: Vector3 = _player.global_position + Vector3(0.0, 80.0, 0.0)
	_camera.global_position = _camera.global_position.lerp(tp, CAM_LERP)
	_camera.rotation_degrees = Vector3(-90, 0, 0)
