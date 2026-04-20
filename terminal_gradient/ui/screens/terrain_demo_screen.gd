class_name TerrainDemoScreen
extends BaseScreen
## Flat meadow terrain with pine-tree/bush vegetation and a billboarded pixel
## player. Rendered into a SubViewport and displayed over the AsciiGrid via
## the raster/dither shader.
##
## All vegetation (tree trunks, tree foliage, bushes) and terrain tiles are
## rendered via MultiMeshInstance3D — one MultiMesh per unique mesh, populated
## per chunk (vegetation) or globally (terrain). Per-instance fade (trees) and
## contact push (bushes) is packed into INSTANCE_CUSTOM:
##   rgb = local-space push offset (bushes)
##   a   = dither-fade amount     (trees)

const CHUNK_SIZE: float = 64.0
const RENDER_DISTANCE: int = 3
const CAM_LERP: float = 0.1
const ORTHO_SIZE: float = 11.0
const CAM_PITCH_DEG: float = -30.0
const CAM_DIST: float = 80.0

const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")
const ToonTreeShader: Shader = preload("res://assets/shaders/toon_tree.gdshader")
const ToonOutlineShader: Shader = preload("res://assets/shaders/toon_outline.gdshader")
const BlobShadowShader: Shader = preload("res://assets/shaders/blob_shadow.gdshader")
const GROUND_TEX: Texture2D = preload("res://assets/biomes/test/new_meadow_grass_checkered_v5.png")
const PineTreeScene: PackedScene = preload("res://assets/models/pine_tree_0.glb")
const PineBushScene: PackedScene = preload("res://assets/models/pine_bush_0.glb")

const TREE_SCALE_FACTOR: float = 0.25
const BUSH_SCALE_FACTOR: float = 0.4
const BUSH_SHADOW_SIZE_MULT: float = 2.0
const BUSH_MODEL_Y_MAX_APPROX: float = 1.5
const BUSH_PUSH_RADIUS: float = 1.8
const BUSH_PUSH_STRENGTH: float = 0.7
const BLOB_SHADOW_Y: float = 0.05
const TREE_SHADOW_SIZE_MULT: float = 12.0

const TREE_FADE_RADIUS: float = 2.5
const TREE_FADE_Z_BACK: float = 1.5
const TREE_FADE_MAX: float = 0.85
const TREE_MIN_DIST_MULT: float = 1.1
const BUSH_MIN_DIST_MULT: float = 0.3

const MODEL_Y_MAX_APPROX: float = 5.5
const FOLIAGE_DARKEN_BOTTOM: float = 0.75
const TRUNK_DARKEN_TOP: float = 0.5
# Canonical pine foliage source albedo — fed through the fir remap to produce
# the green used by both tree foliage and bushes, so they match exactly.
const PINE_FOLIAGE_SRC_ALBEDO: Color = Color(0.22, 0.52, 0.20)
# Trunk color is sampled from the GLB (~Color(0.63, 0.48, 0.33)) and pinned
# here so trunks stay consistent even if the GLB is later re-authored.
const PINE_TRUNK_ALBEDO: Color = Color(0.63, 0.48, 0.33)

const WIND_STRENGTH: float = 0.2
const WIND_SPEED: float = 0.8
const WIND_MASK_Y_MIN: float = 0.4
const WIND_MASK_Y_MAX: float = 5.0
const WIND_SPATIAL_FREQ: Vector2 = Vector2(0.07, 0.05)

const TERRAIN_VERTS_PER_SIDE: int = 33
# Ground tile UV is local (0..1 per chunk). With uv1_scale=10, each chunk
# shows exactly 10 texture tiles → seams line up perfectly between chunks.
const GROUND_UV_TILES_PER_CHUNK: float = 10.0

var _ring_layers: Array = []

# Non-MultiMesh materials kept around for shadows (variable scale per-instance
# so MultiMesh doesn't help), outline next_pass, and the ground.
var _ground_material: StandardMaterial3D
var _tree_outline_material: ShaderMaterial
var _blob_shadow_material: ShaderMaterial
var _bush_shadow_material: ShaderMaterial
var _blob_shadow_mesh: PlaneMesh

# MultiMesh mesh catalog — built once at init. Local transforms from the GLB
# templates are baked into the vertex data so per-instance transforms are
# just the spawn transform (no template-local multiplication).
#
# `_tree_mesh` is a single ArrayMesh with two surfaces:
#   surface 0 = trunk geometry (carries `_tree_trunk_material` per-surface)
#   surface 1 = foliage geometry (carries `_tree_foliage_material` per-surface)
# Both surfaces render per tree instance from one MultiMeshInstance3D, so we
# only spend one set_instance_transform + one set_instance_custom_data per
# tree per frame.
var _tree_mesh: ArrayMesh
var _bush_foliage_mesh: ArrayMesh
var _terrain_base_mesh: ArrayMesh

# Shared toon materials — reused across every instance of each mesh type.
var _tree_trunk_material: ShaderMaterial
var _tree_foliage_material: ShaderMaterial
var _bush_foliage_material: ShaderMaterial

# Global terrain MultiMeshInstance3D — one instance per active chunk.
var _terrain_mm_instance: MultiMeshInstance3D

var _viewport: SubViewport
var _texture_rect: TextureRect
var _camera: Camera3D
var _player: CharacterBody3D
var _chunk_container: Node3D

# Per-chunk state. Each entry holds the chunk's container node, two vegetation
# MultiMeshInstance3Ds (one for trees, one for bushes), and the per-instance
# lookup tables we need to update fade/push each frame.
#   {"node": Node3D, "terrain_idx": int,
#    "mm_tree": MultiMeshInstance3D, "mm_bush": MultiMeshInstance3D,
#    "trees": Array[{xz, idx}],
#    "bushes": Array[{xz, basis_inv, idx}]}
var _chunks_state: Dictionary = {}

var _hud_label: Label
var _raster_mat: ShaderMaterial
var _block_w: int = 1
var _block_h: int = 1
var _full_w: int = 1
var _full_h: int = 1


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_ring_layers = [
		{"inner": 24.0, "outer": 30.0, "diameter": 5.5, "count": 5},
		{"inner": 18.0, "outer": 24.0, "diameter": 4.5, "count": 7},
		{"inner": 12.0, "outer": 18.0, "diameter": 4.0, "count": 8},
		{"inner": 6.0,  "outer": 12.0, "diameter": 3.5, "count": 10},
		{"inner": 2.0,  "outer": 6.0,  "diameter": 3.0, "count": 8},
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
	_update_tree_fades()
	_update_bush_push()
	if _player and _hud_label:
		var px: float = _player.global_position.x
		var pz: float = _player.global_position.z
		var cx: int = int(floor(px / CHUNK_SIZE))
		var cz: int = int(floor(pz / CHUNK_SIZE))
		var fps: int = int(Engine.get_frames_per_second())
		_hud_label.text = "FPS %d  Chunk (%d,%d)  %d chunks  [ESC] Back" % [
			fps, cx, cz, _chunks_state.size()]


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
	light.rotation_degrees = Vector3(-45, 75, 0)
	light.light_energy = 1.3
	light.light_color = Color("#fff4e0")
	light.shadow_enabled = false
	scene.add_child(light)

	_blob_shadow_material = ShaderMaterial.new()
	_blob_shadow_material.shader = BlobShadowShader
	_blob_shadow_material.set_shader_parameter("color", Color(0.0, 0.0, 0.0, 0.92))
	_bush_shadow_material = ShaderMaterial.new()
	_bush_shadow_material.shader = BlobShadowShader
	_bush_shadow_material.set_shader_parameter("color", Color(0.0, 0.0, 0.0, 0.45))
	_blob_shadow_mesh = PlaneMesh.new()
	_blob_shadow_mesh.size = Vector2.ONE

	_ground_material = StandardMaterial3D.new()
	_ground_material.albedo_texture = GROUND_TEX
	_ground_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST_WITH_MIPMAPS_ANISOTROPIC
	_ground_material.uv1_scale = Vector3(GROUND_UV_TILES_PER_CHUNK, GROUND_UV_TILES_PER_CHUNK, 1.0)
	_ground_material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX

	_tree_outline_material = ShaderMaterial.new()
	_tree_outline_material.shader = ToonOutlineShader
	_tree_outline_material.set_shader_parameter("outline_color", Color(0.12, 0.12, 0.12, 1.0))
	_set_wind_params(_tree_outline_material)

	_build_mesh_catalog()
	_build_shared_materials()

	_chunk_container = Node3D.new()
	_chunk_container.name = "Chunks"
	scene.add_child(_chunk_container)

	_build_terrain_mmi(scene)

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

	var vp_h: float = float(_viewport.size.y)
	var wppx: float = (2.0 * ORTHO_SIZE) / vp_h
	var block_world: float = wppx * maxf(1.0, float(_block_h) * 0.5)
	_tree_outline_material.set_shader_parameter("outline_width", block_world * 0.7)
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
	for state: Dictionary in _chunks_state.values():
		if state.node != null:
			state.node.queue_free()
	_chunks_state.clear()
	if _hud_label: _hud_label.queue_free(); _hud_label = null
	if _texture_rect: _texture_rect.queue_free(); _texture_rect = null
	if _viewport: _viewport.queue_free(); _viewport = null
	_player = null; _camera = null; _chunk_container = null
	_ground_material = null
	_raster_mat = null
	_tree_outline_material = null
	_blob_shadow_material = null
	_bush_shadow_material = null
	_blob_shadow_mesh = null
	_tree_mesh = null
	_bush_foliage_mesh = null
	_terrain_base_mesh = null
	_tree_trunk_material = null
	_tree_foliage_material = null
	_bush_foliage_material = null
	_terrain_mm_instance = null


# ── Mesh catalog ───────────────────────────────────

func _build_mesh_catalog() -> void:
	_tree_mesh = _bake_tree_mesh()
	_bush_foliage_mesh = _bake_mesh_from_template(PineBushScene, [])
	_terrain_base_mesh = _build_terrain_local_mesh()


# Bake a single tree ArrayMesh with two surfaces: trunk + foliage. Each
# surface's geometry is pulled from the matching nodes in the pine tree GLB
# (local transforms baked into vertices). We keep them as separate surfaces
# because they need different materials — per-surface materials on the mesh
# get respected by MultiMesh when the MMI has no `material_override`.
func _bake_tree_mesh() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	var root: Node = PineTreeScene.instantiate()

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_append_mesh_instances(root, root, st, ["trunk"])
	st.commit(mesh)

	st.clear()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_append_mesh_instances(root, root, st, ["foliage"])
	st.commit(mesh)

	root.queue_free()
	return mesh


# Walk a template PackedScene, merge every matching MeshInstance3D into a
# single ArrayMesh with local transforms baked into the vertex positions.
# `name_filter` is an Array of String substrings; a MeshInstance3D is included
# if its name (lowercased) contains any filter string. Empty filter includes
# every mesh. Returns a non-null Mesh (possibly empty if nothing matched).
#
# NOTE: we manually walk the parent chain to get each mesh's transform-
# relative-to-root. Node3D.global_transform returns identity for nodes that
# are not inside the scene tree (Godot logs a warning and bails), so baking
# via global_transform silently skipped every local transform — trunks came
# out raw-source-cylinder sized and foliage lost its 4.1m height offset.
func _bake_mesh_from_template(scene: PackedScene, name_filter: Array) -> ArrayMesh:
	var root: Node = scene.instantiate()
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_append_mesh_instances(root, root, st, name_filter)
	root.queue_free()
	return st.commit()


func _append_mesh_instances(node: Node, root: Node, st: SurfaceTool, name_filter: Array) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		var matches: bool = name_filter.is_empty()
		if not matches:
			var lower: String = mi.name.to_lower()
			for f in name_filter:
				if String(f) in lower:
					matches = true
					break
		if matches and mi.mesh != null:
			var xform := _transform_to_root(mi, root)
			for surf in mi.mesh.get_surface_count():
				st.append_from(mi.mesh, surf, xform)
	for child in node.get_children():
		_append_mesh_instances(child, root, st, name_filter)


# Concatenate every Node3D.transform from `node` up to (but not including)
# `root`. Works outside the scene tree where global_transform refuses to run.
static func _transform_to_root(node: Node, root: Node) -> Transform3D:
	var xform := Transform3D.IDENTITY
	var n: Node = node
	while n != null and n != root:
		if n is Node3D:
			xform = (n as Node3D).transform * xform
		n = n.get_parent()
	return xform


# Shared terrain tile: flat quad (33×33 vertex grid) with local XZ in
# [0, CHUNK_SIZE] and UV 0..1 across the chunk. The ground material's
# uv1_scale maps that to GROUND_UV_TILES_PER_CHUNK texture tiles, so chunks
# butt up with no seams and can share a single mesh via MultiMesh.
func _build_terrain_local_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var verts: int = TERRAIN_VERTS_PER_SIDE
	var step: float = CHUNK_SIZE / float(verts - 1)
	var up := Vector3(0.0, 1.0, 0.0)
	for row in range(verts - 1):
		for col in range(verts - 1):
			var x0: float = float(col) * step
			var x1: float = x0 + step
			var z0: float = float(row) * step
			var z1: float = z0 + step
			var u0: float = x0 / CHUNK_SIZE; var u1: float = x1 / CHUNK_SIZE
			var v0: float = z0 / CHUNK_SIZE; var v1: float = z1 / CHUNK_SIZE

			var tl := Vector3(x0, 0.0, z0); var tr := Vector3(x1, 0.0, z0)
			var bl := Vector3(x0, 0.0, z1); var br := Vector3(x1, 0.0, z1)

			st.set_normal(up); st.set_uv(Vector2(u0, v0)); st.add_vertex(tl)
			st.set_normal(up); st.set_uv(Vector2(u1, v0)); st.add_vertex(tr)
			st.set_normal(up); st.set_uv(Vector2(u0, v1)); st.add_vertex(bl)

			st.set_normal(up); st.set_uv(Vector2(u1, v0)); st.add_vertex(tr)
			st.set_normal(up); st.set_uv(Vector2(u1, v1)); st.add_vertex(br)
			st.set_normal(up); st.set_uv(Vector2(u0, v1)); st.add_vertex(bl)
	return st.commit()


# ── Shared materials ───────────────────────────────

func _build_shared_materials() -> void:
	var fir_base := Color(0.06, 0.20, 0.09)

	# Tree trunk: sampled GLB color, `darken_top` so it fades toward the
	# foliage as it climbs the trunk.
	_tree_trunk_material = ShaderMaterial.new()
	_tree_trunk_material.shader = ToonTreeShader
	_tree_trunk_material.set_shader_parameter("albedo", PINE_TRUNK_ALBEDO)
	_tree_trunk_material.set_shader_parameter("toon_bands", 3.0)
	_tree_trunk_material.set_shader_parameter("model_y_max", MODEL_Y_MAX_APPROX)
	_tree_trunk_material.set_shader_parameter("darken_top", TRUNK_DARKEN_TOP)
	_tree_trunk_material.set_shader_parameter("darken_bottom", 0.0)
	_set_wind_params(_tree_trunk_material)
	_tree_trunk_material.next_pass = _tree_outline_material

	# Tree foliage: canonical green remapped into dark fir territory.
	var foliage_albedo := PINE_FOLIAGE_SRC_ALBEDO.lerp(fir_base, 0.6) * 0.80
	_tree_foliage_material = ShaderMaterial.new()
	_tree_foliage_material.shader = ToonTreeShader
	_tree_foliage_material.set_shader_parameter("albedo", foliage_albedo)
	_tree_foliage_material.set_shader_parameter("toon_bands", 3.0)
	_tree_foliage_material.set_shader_parameter("model_y_max", MODEL_Y_MAX_APPROX)
	_tree_foliage_material.set_shader_parameter("darken_top", 0.0)
	_tree_foliage_material.set_shader_parameter("darken_bottom", FOLIAGE_DARKEN_BOTTOM)
	_set_wind_params(_tree_foliage_material)
	_tree_foliage_material.next_pass = _tree_outline_material

	# Bushes use the same remapped green but a shorter gradient span so the
	# whole plant covers the dark-bottom → bright-top curve at its own height.
	_bush_foliage_material = ShaderMaterial.new()
	_bush_foliage_material.shader = ToonTreeShader
	_bush_foliage_material.set_shader_parameter("albedo", foliage_albedo)
	_bush_foliage_material.set_shader_parameter("toon_bands", 3.0)
	_bush_foliage_material.set_shader_parameter("model_y_max", BUSH_MODEL_Y_MAX_APPROX)
	_bush_foliage_material.set_shader_parameter("darken_top", 0.0)
	_bush_foliage_material.set_shader_parameter("darken_bottom", FOLIAGE_DARKEN_BOTTOM)
	_set_wind_params(_bush_foliage_material)
	_bush_foliage_material.next_pass = _tree_outline_material

	# Attach materials per-surface directly on the shared meshes. With no
	# `material_override` on the MultiMeshInstance3D, Godot picks these up
	# per-surface, so a single MMI renders trunk + foliage in one go using
	# the same per-instance transform and INSTANCE_CUSTOM payload.
	if _tree_mesh != null and _tree_mesh.get_surface_count() >= 2:
		_tree_mesh.surface_set_material(0, _tree_trunk_material)
		_tree_mesh.surface_set_material(1, _tree_foliage_material)
	if _bush_foliage_mesh != null and _bush_foliage_mesh.get_surface_count() >= 1:
		_bush_foliage_mesh.surface_set_material(0, _bush_foliage_material)


func _set_wind_params(mat: ShaderMaterial) -> void:
	mat.set_shader_parameter("wind_strength", WIND_STRENGTH)
	mat.set_shader_parameter("wind_speed", WIND_SPEED)
	mat.set_shader_parameter("wind_mask_y_min", WIND_MASK_Y_MIN)
	mat.set_shader_parameter("wind_mask_y_max", WIND_MASK_Y_MAX)
	mat.set_shader_parameter("wind_spatial_freq", WIND_SPATIAL_FREQ)


# ── Terrain MultiMesh ──────────────────────────────

func _build_terrain_mmi(parent: Node3D) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = false
	mm.mesh = _terrain_base_mesh
	mm.instance_count = 0
	_terrain_mm_instance = MultiMeshInstance3D.new()
	_terrain_mm_instance.name = "TerrainMM"
	_terrain_mm_instance.multimesh = mm
	_terrain_mm_instance.material_override = _ground_material
	_terrain_mm_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(_terrain_mm_instance)


func _rebuild_terrain_mm() -> void:
	if _terrain_mm_instance == null:
		return
	var mm: MultiMesh = _terrain_mm_instance.multimesh
	var keys := _chunks_state.keys()
	mm.instance_count = keys.size()
	for i in keys.size():
		var key: Vector2i = keys[i]
		_chunks_state[key].terrain_idx = i
		var xform := Transform3D(Basis.IDENTITY,
			Vector3(float(key.x) * CHUNK_SIZE, 0.0, float(key.y) * CHUNK_SIZE))
		mm.set_instance_transform(i, xform)


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

	var changed: bool = false
	for key: Vector2i in desired:
		if not _chunks_state.has(key):
			_load_chunk(key)
			changed = true

	var stale: Array[Vector2i] = []
	for key: Vector2i in _chunks_state:
		if not desired.has(key):
			stale.append(key)
	for key in stale:
		var state: Dictionary = _chunks_state[key]
		if state.node != null:
			state.node.queue_free()
		_chunks_state.erase(key)
		changed = true

	if changed:
		_rebuild_terrain_mm()


func _load_chunk(key: Vector2i) -> void:
	var chunk := Node3D.new()
	chunk.name = "chunk_%d_%d" % [key.x, key.y]
	_chunk_container.add_child(chunk)

	# Collect placements BEFORE spawning visuals so we know the exact
	# instance counts for each per-chunk MultiMesh.
	var rng := RandomNumberGenerator.new()
	rng.seed = key.x * 100003 + key.y
	var tree_positions: Array[Dictionary] = []
	var bush_positions: Array[Dictionary] = []
	_collect_glades(rng, key, tree_positions, bush_positions)

	var tree_count: int = tree_positions.size()
	var bush_count: int = bush_positions.size()

	var mm_tree := _make_vegetation_mmi(_tree_mesh, tree_count)
	var mm_bush := _make_vegetation_mmi(_bush_foliage_mesh, bush_count)
	chunk.add_child(mm_tree)
	chunk.add_child(mm_bush)

	var tree_entries: Array[Dictionary] = []
	for i in tree_count:
		var t: Dictionary = tree_positions[i]
		mm_tree.multimesh.set_instance_transform(i, t.xform)
		mm_tree.multimesh.set_instance_custom_data(i, Color(0, 0, 0, 0))
		_spawn_tree_trunk_collider(chunk, Vector3(t.xz.x, 0.0, t.xz.y), t.scale)
		_spawn_blob_shadow(chunk,
			Vector3(t.xz.x, BLOB_SHADOW_Y, t.xz.y),
			t.scale * TREE_SHADOW_SIZE_MULT)
		tree_entries.append({"xz": t.xz, "idx": i})

	var bush_entries: Array[Dictionary] = []
	for i in bush_count:
		var b: Dictionary = bush_positions[i]
		mm_bush.multimesh.set_instance_transform(i, b.xform)
		mm_bush.multimesh.set_instance_custom_data(i, Color(0, 0, 0, 0))
		_spawn_blob_shadow(chunk,
			Vector3(b.xz.x, BLOB_SHADOW_Y, b.xz.y),
			b.scale * BUSH_SHADOW_SIZE_MULT, _bush_shadow_material)
		bush_entries.append({"xz": b.xz, "basis_inv": b.basis_inv, "idx": i})

	_chunks_state[key] = {
		"node": chunk,
		"terrain_idx": -1,
		"mm_tree": mm_tree,
		"mm_bush": mm_bush,
		"trees": tree_entries,
		"bushes": bush_entries,
	}


# Build a MultiMeshInstance3D backed by an empty MultiMesh of `count`
# instances. The mesh's per-surface materials are used (we leave
# `material_override` unset).
func _make_vegetation_mmi(mesh: ArrayMesh, count: int) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = maxi(count, 0)
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi


# ── Position generation (no visuals, just xforms) ──

func _collect_glades(rng: RandomNumberGenerator, key: Vector2i,
		tree_out: Array[Dictionary], bush_out: Array[Dictionary]) -> void:
	var n_glades: int = rng.randi_range(1, 2)
	var margin: float = 8.0
	var ox: float = float(key.x) * CHUNK_SIZE
	var oz: float = float(key.y) * CHUNK_SIZE

	for g in range(n_glades):
		var gx: float = ox + margin + rng.randf() * (CHUNK_SIZE - margin * 2.0)
		var gz: float = oz + margin + rng.randf() * (CHUNK_SIZE - margin * 2.0)
		var placed: Array[Dictionary] = []
		for li in range(_ring_layers.size()):
			var layer: Dictionary = _ring_layers[li]
			var inner_r: float = layer.inner
			var outer_r: float = layer.outer
			var diameter: float = layer.diameter
			var count: int = layer.count
			var theta_start: float = rng.randf() * TAU
			var step: float = TAU / float(max(count, 1))
			for i in range(count):
				var theta: float = theta_start + float(i) * step + (rng.randf() - 0.5) * step * 0.35
				var r: float = lerp(inner_r, outer_r, rng.randf())
				var wx: float = gx + cos(theta) * r
				var wz: float = gz + sin(theta) * r
				var too_close: bool = false
				for p: Dictionary in placed:
					var min_dist: float = maxf(diameter, p.diameter) * TREE_MIN_DIST_MULT
					var ddx: float = p.x - wx
					var ddz: float = p.z - wz
					if ddx * ddx + ddz * ddz < min_dist * min_dist:
						too_close = true
						break
				if too_close:
					continue
				var sc: float = diameter * TREE_SCALE_FACTOR * lerp(0.8, 1.6, rng.randf())
				var ry: float = rng.randf() * TAU
				var xform := _make_world_xform(Vector2(wx, wz), sc, ry)
				tree_out.append({"xz": Vector2(wx, wz), "scale": sc, "xform": xform})
				placed.append({"x": wx, "z": wz, "diameter": diameter})
				_collect_bushes_around_tree(rng, Vector2(wx, wz), sc, placed, bush_out)


func _collect_bushes_around_tree(rng: RandomNumberGenerator, tree_xz: Vector2,
		tree_sc: float, placed: Array[Dictionary], bush_out: Array[Dictionary]) -> void:
	var canopy_r: float = tree_sc * 1.8
	# Only ~half of trees seed a bush cluster — avoids every trunk looking
	# like it has a hedge.
	if rng.randf() > 0.55:
		return
	var cluster_theta: float = rng.randf() * TAU
	var cluster_r: float = lerp(canopy_r * 1.3, canopy_r * 3.5, rng.randf())
	var cx: float = tree_xz.x + cos(cluster_theta) * cluster_r
	var cz: float = tree_xz.y + sin(cluster_theta) * cluster_r

	# Within-cluster overlap is allowed (tight packing), so stage in
	# `cluster_placed` and only merge into `placed` after the cluster closes.
	var cluster_placed: Array[Dictionary] = []
	var bush_count: int = rng.randi_range(2, 3)
	for i in range(bush_count):
		var offset_dist: float
		var size_t: float  # 0 = largest (center), 1 = smallest (fringe)
		if i == 0:
			offset_dist = 0.0
			size_t = 0.0
		else:
			offset_dist = rng.randf_range(0.2, 0.7)
			size_t = lerp(0.3, 1.0, rng.randf())
		var offset_angle: float = rng.randf() * TAU
		var bwx: float = cx + cos(offset_angle) * offset_dist
		var bwz: float = cz + sin(offset_angle) * offset_dist
		var diameter: float = lerp(2.8, 1.0, size_t)
		var too_close: bool = false
		for p: Dictionary in placed:
			var min_dist: float = maxf(diameter, p.diameter) * BUSH_MIN_DIST_MULT
			var ddx: float = p.x - bwx
			var ddz: float = p.z - bwz
			if ddx * ddx + ddz * ddz < min_dist * min_dist:
				too_close = true
				break
		if too_close:
			continue
		var bsc: float = diameter * BUSH_SCALE_FACTOR * lerp(0.85, 1.25, rng.randf())
		var bry: float = rng.randf() * TAU
		var xform := _make_world_xform(Vector2(bwx, bwz), bsc, bry)
		bush_out.append({
			"xz": Vector2(bwx, bwz),
			"scale": bsc,
			"xform": xform,
			"basis_inv": xform.basis.inverse(),
		})
		cluster_placed.append({"x": bwx, "z": bwz, "diameter": diameter})
	for cb in cluster_placed:
		placed.append(cb)


static func _make_world_xform(xz: Vector2, sc: float, ry: float) -> Transform3D:
	var basis := Basis.from_euler(Vector3(0.0, ry, 0.0)).scaled(Vector3(sc, sc, sc))
	return Transform3D(basis, Vector3(xz.x, 0.0, xz.y))


# ── Shadows + colliders ────────────────────────────

func _spawn_blob_shadow(parent: Node3D, pos: Vector3, size: float, mat: ShaderMaterial = null) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = _blob_shadow_mesh
	mi.material_override = mat if mat != null else _blob_shadow_material
	mi.position = pos
	mi.scale = Vector3(size, 1.0, size)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)


func _spawn_tree_trunk_collider(parent: Node3D, tree_pos: Vector3, tree_sc: float) -> void:
	var body := StaticBody3D.new()
	var col := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = tree_sc * 0.25
	shape.height = tree_sc * 1.6
	col.shape = shape
	body.add_child(col)
	body.position = tree_pos + Vector3(0.0, tree_sc * 0.8, 0.0)
	parent.add_child(body)


# ── Per-frame fade / push updates ──────────────────

func _compute_tree_fade(tree_xz: Vector2, player_xz: Vector2) -> float:
	var dx: float = tree_xz.x - player_xz.x
	var dz: float = tree_xz.y - player_xz.y
	# Only fade trees that are in front of (or just slightly behind) the
	# player along the camera's forward axis — trees truly behind the
	# player never occlude.
	if dz < -TREE_FADE_Z_BACK:
		return 0.0
	var d: float = sqrt(dx * dx + dz * dz)
	if d > TREE_FADE_RADIUS:
		return 0.0
	return (1.0 - d / TREE_FADE_RADIUS) * TREE_FADE_MAX


func _update_tree_fades() -> void:
	if _player == null:
		return
	var ppos := Vector2(_player.global_position.x, _player.global_position.z)
	for state: Dictionary in _chunks_state.values():
		var mm: MultiMesh = state.mm_tree.multimesh
		for tree: Dictionary in state.trees:
			var fade: float = _compute_tree_fade(tree.xz, ppos)
			mm.set_instance_custom_data(tree.idx, Color(0.0, 0.0, 0.0, fade))


func _update_bush_push() -> void:
	if _player == null:
		return
	var px: float = _player.global_position.x
	var pz: float = _player.global_position.z
	for state: Dictionary in _chunks_state.values():
		var mm: MultiMesh = state.mm_bush.multimesh
		for bush: Dictionary in state.bushes:
			var dx: float = bush.xz.x - px
			var dz: float = bush.xz.y - pz
			var d_sq: float = dx * dx + dz * dz
			var pl: Vector3 = Vector3.ZERO
			if d_sq < BUSH_PUSH_RADIUS * BUSH_PUSH_RADIUS and d_sq > 1e-6:
				var d: float = sqrt(d_sq)
				var strength: float = (1.0 - d / BUSH_PUSH_RADIUS) * BUSH_PUSH_STRENGTH
				var push_world := Vector3(dx / d, 0.0, dz / d) * strength
				pl = bush.basis_inv * push_world
			mm.set_instance_custom_data(bush.idx, Color(pl.x, pl.y, pl.z, 0.0))


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
	# as a UV shift.
	var right := Vector3(1.0, 0.0, 0.0)
	var up := Vector3(0.0, cos(pitch), sin(pitch))
	var forward := Vector3(0.0, -sin(pitch), cos(pitch))

	var vp_h: float = float(_viewport.size.y)
	var wppx: float = (2.0 * ORTHO_SIZE) / vp_h
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
