class_name TerrainDemoScreen
extends BaseScreen
## Flat meadow terrain with billboard-sprite vegetation arranged in
## concentric rings around per-chunk glade centers. Rendered into a
## SubViewport and displayed over the AsciiGrid via the raster/dither
## shader.

const CHUNK_SIZE: float = 64.0
const RENDER_DISTANCE: int = 3
const CAM_LERP: float = 0.1
const ORTHO_SIZE: float = 22.0
const CAM_PITCH_DEG: float = -30.0
const CAM_DIST: float = 80.0

const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")
const ToonSolidShader: Shader = preload("res://assets/shaders/toon_solid.gdshader")
const ToonOutlineShader: Shader = preload("res://assets/shaders/toon_outline.gdshader")
const BlobShadowShader: Shader = preload("res://assets/shaders/blob_shadow.gdshader")
const GROUND_TEX: Texture2D = preload("res://assets/biomes/test/new_meadow_grass_checkered_v5.png")
const PineTreeScene: PackedScene = preload("res://assets/models/pine_tree_0.glb")
const TREE_DIAMETER_MIN: float = 3.0
const TREE_SCALE_FACTOR: float = 0.25
# Blob shadows ride just above the ground to avoid z-fight with it. Scales
# relative to object footprint.
const BLOB_SHADOW_Y: float = 0.05
const TREE_SHADOW_SIZE_MULT: float = 12.0
const BALL_SHADOW_SIZE_MULT: float = 6.6

var _ring_layers: Array = []
var _ground_material: StandardMaterial3D
var _layer_materials: Array = []
var _outline_material: ShaderMaterial
var _blob_shadow_material: ShaderMaterial
var _blob_shadow_mesh: PlaneMesh

var _viewport: SubViewport
var _texture_rect: TextureRect
var _camera: Camera3D
var _player: CharacterBody3D
var _chunk_container: Node3D
var _active_chunks: Dictionary = {}
var _hud_label: Label
var _raster_mat: ShaderMaterial
var _block_w: int = 1
var _block_h: int = 1
var _full_w: int = 1
var _full_h: int = 1


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_ring_layers = [
		{"color": Color(0.10, 0.30, 0.10), "inner": 17.0, "outer": 22.0, "diameter": 5.0, "count": 2},
		{"color": Color(0.14, 0.38, 0.14), "inner": 13.0, "outer": 18.0, "diameter": 4.0, "count": 3},
		{"color": Color(0.18, 0.46, 0.18), "inner": 9.0,  "outer": 14.0, "diameter": 3.0, "count": 3},
		{"color": Color(0.25, 0.55, 0.22), "inner": 6.0,  "outer": 10.0, "diameter": 1.6, "count": 14},
		{"color": Color(0.35, 0.62, 0.25), "inner": 4.0,  "outer": 7.0,  "diameter": 1.0, "count": 16},
		{"color": Color(0.50, 0.70, 0.30), "inner": 2.0,  "outer": 5.0,  "diameter": 0.7, "count": 22},
		{"color": Color(0.90, 0.80, 0.30), "inner": 0.0,  "outer": 3.0,  "diameter": 0.5, "count": 18},
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
		var fps: int = int(Engine.get_frames_per_second())
		_hud_label.text = "FPS %d  Chunk (%d,%d)  %d chunks  [ESC] Back" % [
			fps, cx, cz, _active_chunks.size()]


# ── World setup ────────────────────────────────────

func _build_world() -> void:
	var full_w: int = grid.cols * grid.cell_width
	var full_h: int = grid.rows * grid.cell_height
	_full_w = full_w
	_full_h = full_h
	_viewport = SubViewport.new()
	_viewport.msaa_3d = Viewport.MSAA_4X
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
	light.shadow_enabled = false
	scene.add_child(light)

	_blob_shadow_material = ShaderMaterial.new()
	_blob_shadow_material.shader = BlobShadowShader
	_blob_shadow_material.set_shader_parameter("color", Color(0.0, 0.0, 0.0, 0.92))
	_blob_shadow_mesh = PlaneMesh.new()
	_blob_shadow_mesh.size = Vector2.ONE

	_ground_material = StandardMaterial3D.new()
	_ground_material.albedo_texture = GROUND_TEX
	_ground_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST_WITH_MIPMAPS_ANISOTROPIC
	_ground_material.uv1_scale = Vector3(8.0, 8.0, 1.0)
	_ground_material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX

	_outline_material = ShaderMaterial.new()
	_outline_material.shader = ToonOutlineShader
	_outline_material.set_shader_parameter("outline_color", Color(0.18, 0.18, 0.18, 1.0))
	# Final width is set after _block_w is known; shared across all toon passes.

	_layer_materials.clear()
	for layer in _ring_layers:
		var mat := ShaderMaterial.new()
		mat.shader = ToonSolidShader
		mat.set_shader_parameter("albedo", layer.color)
		mat.set_shader_parameter("toon_bands", 3.0)
		mat.next_pass = _outline_material
		_layer_materials.append(mat)

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
	_raster_mat = ShaderMaterial.new()
	_raster_mat.shader = PaneRasterShader
	_raster_mat.set_shader_parameter("rect_size_px", Vector2(full_w, full_h))
	_block_w = maxi(1, grid.g_cell_width / 2)
	_block_h = _block_w
	_raster_mat.set_shader_parameter("block_size", Vector2(float(_block_w), float(_block_h)))

	# Outline width in world units: a touch under one chunky block, using the
	# camera math from _update_camera (wppx * block_h * 0.5) as the unit.
	var vp_h: float = float(_viewport.size.y)
	var wppx: float = (2.0 * ORTHO_SIZE) / vp_h
	var block_world: float = wppx * maxf(1.0, float(_block_h) * 0.5)
	_outline_material.set_shader_parameter("outline_width", block_world * 0.7)
	_texture_rect.material = _raster_mat
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
	_raster_mat = null
	_layer_materials.clear()
	_outline_material = null
	_blob_shadow_material = null
	_blob_shadow_mesh = null


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
		for li in range(_ring_layers.size()):
			var layer: Dictionary = _ring_layers[li]
			var mat: ShaderMaterial = _layer_materials[li]
			var inner_r: float = layer.inner
			var outer_r: float = layer.outer
			var diameter: float = layer.diameter
			var count: int = layer.count
			for i in range(count):
				var theta: float = rng.randf() * TAU
				var r: float = lerp(inner_r, outer_r, rng.randf())
				var wx: float = gx + cos(theta) * r
				var wz: float = gz + sin(theta) * r
				if diameter >= TREE_DIAMETER_MIN:
					var tree: Node3D = PineTreeScene.instantiate()
					var sc: float = diameter * TREE_SCALE_FACTOR * lerp(0.3, 2.5, rng.randf())
					tree.scale = Vector3(sc, sc, sc)
					tree.position = Vector3(wx, 0.0, wz)
					tree.rotation.y = rng.randf() * TAU
					_apply_toon_to_tree(tree)
					parent.add_child(tree)
					_spawn_blob_shadow(parent, Vector3(wx, BLOB_SHADOW_Y, wz), sc * TREE_SHADOW_SIZE_MULT)
				else:
					var ball: MeshInstance3D = TerrainMesher.build_ball(diameter, mat)
					ball.position = Vector3(wx, diameter * 0.5, wz)
					parent.add_child(ball)
					_spawn_blob_shadow(parent, Vector3(wx, BLOB_SHADOW_Y, wz), diameter * BALL_SHADOW_SIZE_MULT)


func _spawn_blob_shadow(parent: Node3D, pos: Vector3, size: float) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = _blob_shadow_mesh
	mi.material_override = _blob_shadow_material
	mi.position = pos
	mi.scale = Vector3(size, 1.0, size)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)


func _apply_toon_to_tree(node: Node) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			var src: Material = child.get_active_material(0)
			var albedo := Color.WHITE
			if src is StandardMaterial3D:
				albedo = src.albedo_color
			var toon := ShaderMaterial.new()
			toon.shader = ToonSolidShader
			toon.set_shader_parameter("albedo", albedo)
			toon.set_shader_parameter("toon_bands", 3.0)
			toon.next_pass = _outline_material
			child.material_override = toon
		_apply_toon_to_tree(child)


# ── Camera ─────────────────────────────────────────

func _update_camera() -> void:
	if _camera == null or _player == null:
		return
	var pitch: float = deg_to_rad(CAM_PITCH_DEG)
	# Place camera behind player along -forward, so the player stays at the
	# view center regardless of pitch. Forward = (0, sin(pitch), -cos(pitch)).
	var offset := Vector3(0.0, -sin(pitch), cos(pitch)) * CAM_DIST
	var tp: Vector3 = _player.global_position + offset
	var lerped: Vector3 = _camera.global_position.lerp(tp, CAM_LERP)

	# Snap the camera onto a world-space grid aligned to one chunky pixel
	# block, and pass the discarded sub-block residual to the raster shader
	# as a UV shift. The 3D scene is rendered onto a pixel-stable grid while
	# the presentation still scrolls smoothly at sub-block precision.
	var right := Vector3(1.0, 0.0, 0.0)
	var up := Vector3(0.0, cos(pitch), sin(pitch))
	var forward := Vector3(0.0, -sin(pitch), cos(pitch))

	var vp_h: float = float(_viewport.size.y)
	var wppx: float = (2.0 * ORTHO_SIZE) / vp_h
	# Half-res viewport: one chunky block on screen covers block_w/2 viewport px.
	var vblock_x: float = maxf(1.0, float(_block_w) * 0.5)
	var vblock_y: float = maxf(1.0, float(_block_h) * 0.5)
	var wppb_x: float = wppx * vblock_x
	var wppb_y: float = wppx * vblock_y

	var u_r: float = lerped.dot(right)
	var u_u: float = lerped.dot(up)
	var u_f: float = lerped.dot(forward)
	var sn_r: float = floor(u_r / wppb_x) * wppb_x
	var sn_u: float = floor(u_u / wppb_y) * wppb_y
	var frac_r: float = u_r - sn_r
	var frac_u: float = u_u - sn_u

	_camera.global_position = right * sn_r + up * sn_u + forward * u_f
	_camera.rotation_degrees = Vector3(CAM_PITCH_DEG, 0.0, 0.0)

	if _raster_mat:
		var uv_shift := Vector2(
			(frac_r / wppb_x) * (float(_block_w) / float(_full_w)),
			-(frac_u / wppb_y) * (float(_block_h) / float(_full_h))
		)
		_raster_mat.set_shader_parameter("uv_shift", uv_shift)
		_raster_mat.set_shader_parameter(
			"dither_offset", Vector2(sn_r / wppb_x, sn_u / wppb_y)
		)
