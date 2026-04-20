class_name TerrainDemo2Screen
extends BaseScreen
## Iteration 2 of the terrain demo. Stage 1 swaps the ground to an unlit
## world-space splat-mapped material that blends meadow / pine-forest-floor
## textures by an FBM noise field sampled in world XZ. Vegetation placement
## is unchanged from v1 — a later stage can correlate it with the same noise.
##
## All vegetation (tree trunks, tree foliage, bushes) and terrain tiles are
## rendered via MultiMeshInstance3D — one MultiMesh per unique mesh, populated
## per chunk (vegetation) or globally (terrain). Per-instance fade (trees) and
## contact push (bushes) is packed into INSTANCE_CUSTOM:
##   rgb = local-space push offset (bushes)
##   a   = dither-fade amount     (trees)

const CHUNK_SIZE: float = 64.0
# Chunks are loaded by intersecting the camera's ground-plane frustum
# footprint against chunk AABBs. This margin is added to all four sides so
# there's always a buffer chunk ready when the player moves.
const CHUNK_LOAD_MARGIN: float = 16.0
# Overscan multiplier on the ground-plane frustum footprint used for chunk
# selection. Tall billboards / trees in the next-outer chunk would otherwise
# pop in as their tops cross the screen edge before their ground XZ enters the
# footprint. 2.0 doubles the selection box in both axes.
const CHUNK_FOOTPRINT_OVERSCAN: float = 2.0
const CAM_LERP: float = 0.1
const ORTHO_SIZE: float = 11.0
const CAM_PITCH_DEG: float = -30.0
const CAM_DIST: float = 80.0

const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")
const ToonTreeShader: Shader = preload("res://assets/shaders/toon_tree.gdshader")
const ToonOutlineShader: Shader = preload("res://assets/shaders/toon_outline.gdshader")
const BlobShadowShader: Shader = preload("res://assets/shaders/blob_shadow.gdshader")
const TerrainSplatShader: Shader = preload("res://assets/shaders/terrain_splat.gdshader")
const TreeMatcapShader: Shader = preload("res://assets/shaders/toon_tree_matcap.gdshader")
const TREE_MATCAP_TEX: Texture2D = preload("res://assets/matcap/matcap_1.png")
const BUSH_MATCAP_TEX: Texture2D = preload("res://assets/matcap/matcap_2.png")
const GROUND_MEADOW_TEX: Texture2D = preload("res://assets/biomes/test/new_meadow_grass_checkered_v5.png")
const GROUND_FOREST_TEX: Texture2D = preload("res://assets/biomes/test/pine_forest_terrain.png")
const GROUND_WORLD_PER_TILE: float = 6.4
# Tighter / denser pattern: ~2.4× the previous frequency packs roughly
# 6× more patches into the same area. Softness collapsed (0.12 → 0.03) for
# crisp meadow/forest borders. Threshold unchanged so the meadow:forest area
# ratio stays roughly the same.
const GROUND_NOISE_FREQ: float = 0.06
const GROUND_NOISE_THRESHOLD: float = 0.45
const GROUND_NOISE_SOFTNESS: float = 0.03
const PineTreeScene: PackedScene = preload("res://assets/models/pine_tree_0.glb")
const PineBushScene: PackedScene = preload("res://assets/models/pine_bush_0.glb")
const FernScene: PackedScene = preload("res://assets/models/fern_0.glb")

const TREE_SCALE_FACTOR: float = 0.25
const BUSH_SCALE_FACTOR: float = 0.4
const BUSH_SHADOW_SIZE_MULT: float = 2.0
const BUSH_MODEL_Y_MAX_APPROX: float = 1.5

# Ferns cluster tightly around each tree trunk — low ground cover ringing
# the base of every pine. Lighter green than bushes, share the same shader
# pipeline, and respond to player contact with a weaker push impulse.
const FERN_SCALE_MIN: float = 0.264
const FERN_SCALE_MAX: float = 0.462
const FERN_MODEL_Y_MAX_APPROX: float = 0.6
const FERN_PER_TREE_MIN: int = 1
const FERN_PER_TREE_MAX: int = 4
const FERN_CLUSTER_INNER_MULT: float = 0.35  # of tree canopy radius
const FERN_CLUSTER_OUTER_MULT: float = 1.4
const FERN_TRUNK_AVOID_MULT: float = 0.22
const FERN_PUSH_STRENGTH: float = 0.15
const FERN_PUSH_RADIUS: float = 1.2
# Fern shadow is a small, soft disc. Multiplier is larger than the bush's
# because the fern's "scale" variable is already tiny (0.26–0.46), so a
# direct size would barely read as a shadow.
const FERN_SHADOW_SIZE_MULT: float = 4.0
# Ferns need their own (lower + tighter) wind-mask window because their
# world-Y extent is ~0.15–0.28 m — below the default mask floor of 0.4 —
# so the shared wind params would leave them completely static. Wind
# amplitude is also smaller to suit a much shorter plant.
const FERN_WIND_STRENGTH: float = 0.07
const FERN_WIND_MASK_Y_MIN: float = -0.1
const FERN_WIND_MASK_Y_MAX: float = 0.35

# Bush clusters sit in glade clearings — open spots between tree rings — so
# they read as clumps of undergrowth in the open rather than hedgerows
# underneath every trunk.
const BUSH_CLEARING_MIN_CLUSTERS: int = 2
const BUSH_CLEARING_MAX_CLUSTERS: int = 4
# Search radius extends past the outermost tree ring (~30m) so the edges of
# the glade — genuinely open ground — are also valid clearings.
const BUSH_CLEARING_MAX_SEARCH_R: float = 34.0
# Minimum clearance the cluster centre needs from any tree centre, in
# multiples of that tree's layer diameter. Loosened from 1.2 so clusters fit
# in the gaps *between* tree rings, not only in fully open clearings.
const BUSH_CLEARING_TREE_AVOID_MULT: float = 0.65
const BUSH_CLEARING_PLACEMENT_ATTEMPTS: int = 32
# Player-contact push modelled as an attack + decay impulse rather than
# steady-state proximity, so a bush deforms quickly as the player walks into
# it and snaps back to rest even while the player is still overlapping it.
#   push_amount accumulates whenever proximity rises (player approaching)
#   push_amount decays exponentially every frame
const BUSH_PUSH_RADIUS: float = 1.8
const BUSH_PUSH_STRENGTH: float = 0.28
const BUSH_PUSH_ATTACK: float = 1.4
const BUSH_PUSH_DECAY_RATE: float = 7.0  # per-second, higher = faster snap-back
const BLOB_SHADOW_Y: float = 0.05
const TREE_SHADOW_SIZE_MULT: float = 12.0

const TREE_FADE_RADIUS: float = 4.5
const TREE_FADE_Z_BACK: float = 3.0
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
var _ground_material: ShaderMaterial
var _tree_outline_material: ShaderMaterial
var _fern_outline_material: ShaderMaterial
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
var _fern_foliage_mesh: ArrayMesh
var _terrain_base_mesh: ArrayMesh

# Shared toon materials — reused across every instance of each mesh type.
var _tree_trunk_material: ShaderMaterial
var _tree_foliage_material: ShaderMaterial
var _bush_foliage_material: ShaderMaterial
var _fern_foliage_material: ShaderMaterial

# Global terrain MultiMeshInstance3D — one instance per active chunk.
var _terrain_mm_instance: MultiMeshInstance3D

var _viewport: SubViewport
var _texture_rect: TextureRect
var _camera: Camera3D
var _player: CharacterBody3D
var _chunk_container: Node3D

# Per-chunk state. Each entry holds the chunk's container node, three
# vegetation MultiMeshInstance3Ds (trees / bushes / ferns) and the
# per-instance lookup tables we need to update fade/push each frame.
#   {"node": Node3D, "terrain_idx": int,
#    "mm_tree": MultiMeshInstance3D, "mm_bush": MultiMeshInstance3D,
#    "mm_fern": MultiMeshInstance3D,
#    "trees":  Array[{xz, idx}],
#    "bushes": Array[{xz, basis_inv, idx, push_amount, prev_proximity}],
#    "ferns":  Array[{xz, basis_inv, idx, push_amount, prev_proximity}]}
var _chunks_state: Dictionary = {}

var _hud_label: Label
var _raster_mat: ShaderMaterial
var _block_w: int = 1
var _block_h: int = 1
var _full_w: int = 1
var _full_h: int = 1


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	# Per-glade tree counts: 20 → 25 (+25%). Splat-noise gating still trims
	# further: only positions whose splat-noise value exceeds the gate
	# (threshold + 1.5×softness) actually spawn.
	_ring_layers = [
		{"inner": 24.0, "outer": 30.0, "diameter": 5.5, "count": 4},
		{"inner": 18.0, "outer": 24.0, "diameter": 4.5, "count": 5},
		{"inner": 12.0, "outer": 18.0, "diameter": 4.0, "count": 5},
		{"inner": 6.0,  "outer": 12.0, "diameter": 3.5, "count": 6},
		{"inner": 2.0,  "outer": 6.0,  "diameter": 3.0, "count": 5},
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
	# Tree fade-on-occlude is replaced in v2 by the player xray-outline pass
	# (see terrain_player.enable_xray_outline). _update_tree_fades is kept on
	# the source so a future stage can re-enable it without re-implementing.
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
	# MSAA 4× quadruples fragment shading cost on an already-busy forest.
	# With the raster/dither pass snapping the output to chunky blocks, the
	# visible benefit of 4× is small; 2× keeps edges clean for roughly half
	# the GPU cost.
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
	# All v2 surfaces are unlit (terrain_splat / toon_tree_matcap) so neither
	# scene lights nor ambient contribute anything. Ambient explicitly off so
	# any future StandardMaterial3D added to the scene doesn't pick up a stray
	# tint.
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	world_env.environment = env
	scene.add_child(world_env)

	_blob_shadow_material = ShaderMaterial.new()
	_blob_shadow_material.shader = BlobShadowShader
	_blob_shadow_material.set_shader_parameter("color", Color(0.0, 0.0, 0.0, 0.92))
	_bush_shadow_material = ShaderMaterial.new()
	_bush_shadow_material.shader = BlobShadowShader
	_bush_shadow_material.set_shader_parameter("color", Color(0.0, 0.0, 0.0, 0.45))
	_blob_shadow_mesh = PlaneMesh.new()
	_blob_shadow_mesh.size = Vector2.ONE

	_ground_material = ShaderMaterial.new()
	_ground_material.shader = TerrainSplatShader
	_ground_material.set_shader_parameter("meadow_tex", GROUND_MEADOW_TEX)
	_ground_material.set_shader_parameter("forest_tex", GROUND_FOREST_TEX)
	_ground_material.set_shader_parameter("meadow_world_per_tile", GROUND_WORLD_PER_TILE)
	_ground_material.set_shader_parameter("forest_world_per_tile", GROUND_WORLD_PER_TILE)
	_ground_material.set_shader_parameter("noise_freq", GROUND_NOISE_FREQ)
	_ground_material.set_shader_parameter("noise_threshold", GROUND_NOISE_THRESHOLD)
	_ground_material.set_shader_parameter("noise_softness", GROUND_NOISE_SOFTNESS)

	_tree_outline_material = ShaderMaterial.new()
	_tree_outline_material.shader = ToonOutlineShader
	_tree_outline_material.set_shader_parameter("outline_color", Color(0.12, 0.12, 0.12, 1.0))
	_set_wind_params(_tree_outline_material)

	# Ferns need a separate outline with their own (lower) wind mask so the
	# inverted-hull silhouette stays glued to the fern body. Outline shaders
	# must mirror their body's wind block exactly or the shell detaches.
	_fern_outline_material = ShaderMaterial.new()
	_fern_outline_material.shader = ToonOutlineShader
	_fern_outline_material.set_shader_parameter("outline_color", Color(0.12, 0.12, 0.12, 1.0))
	_apply_fern_wind_params(_fern_outline_material)

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
	# v2 replaces the per-tree dither-on-occlude with an x-ray silhouette of
	# the player visible only where the main sprite gets depth-occluded.
	_player.enable_xray_outline()
	# v2 prefers stepped pixel-art animation; no cross-fade between frames.
	_player.tween_frames = false

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
	_fern_outline_material.set_shader_parameter("outline_width", block_world * 0.5)
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
	_fern_outline_material = null
	_blob_shadow_material = null
	_bush_shadow_material = null
	_blob_shadow_mesh = null
	_tree_mesh = null
	_bush_foliage_mesh = null
	_fern_foliage_mesh = null
	_terrain_base_mesh = null
	_tree_trunk_material = null
	_tree_foliage_material = null
	_bush_foliage_material = null
	_fern_foliage_material = null
	_terrain_mm_instance = null


# ── Mesh catalog ───────────────────────────────────

func _build_mesh_catalog() -> void:
	_tree_mesh = _bake_tree_mesh()
	_bush_foliage_mesh = _bake_mesh_from_template(PineBushScene, [])
	_fern_foliage_mesh = _bake_mesh_from_template(FernScene, [])
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
	# foliage as it climbs the trunk. Uses the matcap variant (unlit — matcap
	# texture provides the whole shading term).
	_tree_trunk_material = ShaderMaterial.new()
	_tree_trunk_material.shader = TreeMatcapShader
	_tree_trunk_material.set_shader_parameter("matcap", TREE_MATCAP_TEX)
	_tree_trunk_material.set_shader_parameter("albedo", PINE_TRUNK_ALBEDO)
	_tree_trunk_material.set_shader_parameter("model_y_max", MODEL_Y_MAX_APPROX)
	_tree_trunk_material.set_shader_parameter("darken_top", TRUNK_DARKEN_TOP)
	_tree_trunk_material.set_shader_parameter("darken_bottom", 0.0)
	_set_wind_params(_tree_trunk_material)
	_tree_trunk_material.next_pass = _tree_outline_material

	# Tree foliage: canonical green remapped into dark fir territory.
	var foliage_albedo := PINE_FOLIAGE_SRC_ALBEDO.lerp(fir_base, 0.6) * 0.80
	_tree_foliage_material = ShaderMaterial.new()
	_tree_foliage_material.shader = TreeMatcapShader
	_tree_foliage_material.set_shader_parameter("matcap", TREE_MATCAP_TEX)
	_tree_foliage_material.set_shader_parameter("albedo", foliage_albedo)
	_tree_foliage_material.set_shader_parameter("model_y_max", MODEL_Y_MAX_APPROX)
	_tree_foliage_material.set_shader_parameter("darken_top", 0.0)
	_tree_foliage_material.set_shader_parameter("darken_bottom", FOLIAGE_DARKEN_BOTTOM)
	_set_wind_params(_tree_foliage_material)
	_tree_foliage_material.next_pass = _tree_outline_material

	# Bushes + ferns are rendered unlit via the matcap shader, so the matcap
	# texture provides all the brightness. The `albedo` uniform multiplies the
	# matcap RGB → it acts as a tint, not a base color. The bush albedo is
	# the *top* of its gradient (lighter green); `BUSH_DARKEN_BOTTOM` then
	# pulls the base of the bush down sharply for a high-contrast gradient.
	var bush_albedo := Color(0.28, 0.58, 0.22)
	# Ferns are darker overall (no gradient on them — they're tiny enough that
	# the gradient just reads as flat) and a touch more olive than bushes.
	var fern_albedo := Color(0.22, 0.42, 0.18)
	const BUSH_DARKEN_BOTTOM_OVERRIDE: float = 0.92
	_bush_foliage_material = ShaderMaterial.new()
	_bush_foliage_material.shader = TreeMatcapShader
	_bush_foliage_material.set_shader_parameter("matcap", BUSH_MATCAP_TEX)
	_bush_foliage_material.set_shader_parameter("albedo", bush_albedo)
	_bush_foliage_material.set_shader_parameter("matcap_tint_strength", 1.0)
	_bush_foliage_material.set_shader_parameter("model_y_max", BUSH_MODEL_Y_MAX_APPROX)
	_bush_foliage_material.set_shader_parameter("darken_top", 0.0)
	_bush_foliage_material.set_shader_parameter("darken_bottom", BUSH_DARKEN_BOTTOM_OVERRIDE)
	_set_wind_params(_bush_foliage_material)
	_bush_foliage_material.next_pass = _tree_outline_material

	_fern_foliage_material = ShaderMaterial.new()
	_fern_foliage_material.shader = TreeMatcapShader
	_fern_foliage_material.set_shader_parameter("matcap", BUSH_MATCAP_TEX)
	_fern_foliage_material.set_shader_parameter("albedo", fern_albedo)
	_fern_foliage_material.set_shader_parameter("matcap_tint_strength", 1.0)
	_fern_foliage_material.set_shader_parameter("model_y_max", FERN_MODEL_Y_MAX_APPROX)
	_fern_foliage_material.set_shader_parameter("darken_top", 0.0)
	_fern_foliage_material.set_shader_parameter("darken_bottom", FOLIAGE_DARKEN_BOTTOM)
	_apply_fern_wind_params(_fern_foliage_material)
	_fern_foliage_material.next_pass = _fern_outline_material

	# Attach materials per-surface directly on the shared meshes. With no
	# `material_override` on the MultiMeshInstance3D, Godot picks these up
	# per-surface, so a single MMI renders trunk + foliage in one go using
	# the same per-instance transform and INSTANCE_CUSTOM payload.
	if _tree_mesh != null and _tree_mesh.get_surface_count() >= 2:
		_tree_mesh.surface_set_material(0, _tree_trunk_material)
		_tree_mesh.surface_set_material(1, _tree_foliage_material)
	if _bush_foliage_mesh != null and _bush_foliage_mesh.get_surface_count() >= 1:
		_bush_foliage_mesh.surface_set_material(0, _bush_foliage_material)
	if _fern_foliage_mesh != null and _fern_foliage_mesh.get_surface_count() >= 1:
		_fern_foliage_mesh.surface_set_material(0, _fern_foliage_material)


func _set_wind_params(mat: ShaderMaterial) -> void:
	mat.set_shader_parameter("wind_strength", WIND_STRENGTH)
	mat.set_shader_parameter("wind_speed", WIND_SPEED)
	mat.set_shader_parameter("wind_mask_y_min", WIND_MASK_Y_MIN)
	mat.set_shader_parameter("wind_mask_y_max", WIND_MASK_Y_MAX)
	mat.set_shader_parameter("wind_spatial_freq", WIND_SPATIAL_FREQ)


# Apply fern-specific wind: lower mask window so the whole plant sways, and a
# smaller amplitude so tiny ferns don't displace a full plant-length.
func _apply_fern_wind_params(mat: ShaderMaterial) -> void:
	mat.set_shader_parameter("wind_strength", FERN_WIND_STRENGTH)
	mat.set_shader_parameter("wind_speed", WIND_SPEED)
	mat.set_shader_parameter("wind_mask_y_min", FERN_WIND_MASK_Y_MIN)
	mat.set_shader_parameter("wind_mask_y_max", FERN_WIND_MASK_Y_MAX)
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
	if _player == null or _viewport == null:
		return
	var px: float = _player.global_position.x
	var pz: float = _player.global_position.z

	# Ortho camera ground-plane footprint, centred on the player. Camera has
	# no yaw, so X maps 1:1; Y (screen) maps to Z (ground) through the pitch,
	# giving `ORTHO_SIZE / cos(pitch)` of Z coverage. Much smaller than a 7×7
	# RENDER_DISTANCE box — typically 1–4 chunks vs 49.
	var vp_w: float = float(_viewport.size.x)
	var vp_h: float = float(_viewport.size.y)
	var aspect: float = vp_w / maxf(vp_h, 1.0)
	var pitch: float = deg_to_rad(CAM_PITCH_DEG)
	var half_x: float = ORTHO_SIZE * 0.5 * aspect * CHUNK_FOOTPRINT_OVERSCAN
	var half_z: float = (ORTHO_SIZE * 0.5 / maxf(cos(pitch), 0.1)) * CHUNK_FOOTPRINT_OVERSCAN

	var cx_min: int = int(floor((px - half_x - CHUNK_LOAD_MARGIN) / CHUNK_SIZE))
	var cx_max: int = int(floor((px + half_x + CHUNK_LOAD_MARGIN) / CHUNK_SIZE))
	var cz_min: int = int(floor((pz - half_z - CHUNK_LOAD_MARGIN) / CHUNK_SIZE))
	var cz_max: int = int(floor((pz + half_z + CHUNK_LOAD_MARGIN) / CHUNK_SIZE))

	var desired: Dictionary = {}
	for cx in range(cx_min, cx_max + 1):
		for cz in range(cz_min, cz_max + 1):
			desired[Vector2i(cx, cz)] = true

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
	var fern_positions: Array[Dictionary] = []
	_collect_glades(rng, key, tree_positions, bush_positions, fern_positions)

	var tree_count: int = tree_positions.size()
	var bush_count: int = bush_positions.size()
	var fern_count: int = fern_positions.size()

	var mm_tree := _make_vegetation_mmi(_tree_mesh, tree_count)
	var mm_bush := _make_vegetation_mmi(_bush_foliage_mesh, bush_count)
	var mm_fern := _make_vegetation_mmi(_fern_foliage_mesh, fern_count)
	# Shadow MultiMeshes: one per veg type, sharing the unit-quad shadow mesh
	# with per-instance transforms encoding world position + scale. Trees use
	# the dark material, bushes/ferns the light material.
	var mm_tree_shadow := _make_shadow_mmi(_blob_shadow_material, tree_count)
	var mm_bush_shadow := _make_shadow_mmi(_bush_shadow_material, bush_count)
	var mm_fern_shadow := _make_shadow_mmi(_bush_shadow_material, fern_count)
	chunk.add_child(mm_tree)
	chunk.add_child(mm_bush)
	chunk.add_child(mm_fern)
	chunk.add_child(mm_tree_shadow)
	chunk.add_child(mm_bush_shadow)
	chunk.add_child(mm_fern_shadow)

	var tree_entries: Array[Dictionary] = []
	for i in tree_count:
		var t: Dictionary = tree_positions[i]
		mm_tree.multimesh.set_instance_transform(i, t.xform)
		mm_tree.multimesh.set_instance_custom_data(i, Color(0, 0, 0, 0))
		mm_tree_shadow.multimesh.set_instance_transform(i, _shadow_xform(
			t.xz, t.scale * TREE_SHADOW_SIZE_MULT))
		_spawn_tree_trunk_collider(chunk, Vector3(t.xz.x, 0.0, t.xz.y), t.scale)
		tree_entries.append({"xz": t.xz, "idx": i, "last_fade": 0.0})

	var bush_entries: Array[Dictionary] = []
	for i in bush_count:
		var b: Dictionary = bush_positions[i]
		mm_bush.multimesh.set_instance_transform(i, b.xform)
		mm_bush.multimesh.set_instance_custom_data(i, Color(0, 0, 0, 0))
		mm_bush_shadow.multimesh.set_instance_transform(i, _shadow_xform(
			b.xz, b.scale * BUSH_SHADOW_SIZE_MULT))
		bush_entries.append({
			"xz": b.xz,
			"basis_inv": b.basis_inv,
			"idx": i,
			"push_amount": 0.0,
			"prev_proximity": 0.0,
		})

	var fern_entries: Array[Dictionary] = []
	for i in fern_count:
		var f: Dictionary = fern_positions[i]
		mm_fern.multimesh.set_instance_transform(i, f.xform)
		mm_fern.multimesh.set_instance_custom_data(i, Color(0, 0, 0, 0))
		mm_fern_shadow.multimesh.set_instance_transform(i, _shadow_xform(
			f.xz, f.scale * FERN_SHADOW_SIZE_MULT))
		fern_entries.append({
			"xz": f.xz,
			"basis_inv": f.basis_inv,
			"idx": i,
			"push_amount": 0.0,
			"prev_proximity": 0.0,
		})

	_chunks_state[key] = {
		"node": chunk,
		"terrain_idx": -1,
		"mm_tree": mm_tree,
		"mm_bush": mm_bush,
		"mm_fern": mm_fern,
		"mm_tree_shadow": mm_tree_shadow,
		"mm_bush_shadow": mm_bush_shadow,
		"mm_fern_shadow": mm_fern_shadow,
		"trees": tree_entries,
		"bushes": bush_entries,
		"ferns": fern_entries,
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


# Shadow MultiMesh: shares `_blob_shadow_mesh` (1×1 quad, faces up) and the
# given material across every instance. Per-instance scale + position is set
# via _shadow_xform — there's no per-instance custom data.
func _make_shadow_mmi(material: ShaderMaterial, count: int) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = false
	mm.mesh = _blob_shadow_mesh
	mm.instance_count = maxi(count, 0)
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = material
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi


static func _shadow_xform(xz: Vector2, size: float) -> Transform3D:
	var basis := Basis.IDENTITY.scaled(Vector3(size, 1.0, size))
	return Transform3D(basis, Vector3(xz.x, BLOB_SHADOW_Y, xz.y))


# ── Splat-noise port ───────────────────────────────
# Mirrors `terrain_splat.gdshader`'s hash → value_noise → 4-octave fbm so we
# can ask "is this world XZ in pine-forest territory?" off the GPU. Used to
# gate vegetation spawns so trees / bushes / ferns only land where the splat
# shader is showing the forest-floor texture.

static func _splat_hash21(px: float, pz: float) -> float:
	var fx: float = fposmod(px * 123.34, 1.0)
	var fz: float = fposmod(pz * 456.21, 1.0)
	var d: float = fx * (fx + 45.32) + fz * (fz + 45.32)
	return fposmod((fx + d) * (fz + d), 1.0)


static func _splat_value_noise(px: float, pz: float) -> float:
	var ix: float = floor(px)
	var iz: float = floor(pz)
	var fx: float = px - ix
	var fz: float = pz - iz
	var ux: float = fx * fx * (3.0 - 2.0 * fx)
	var uz: float = fz * fz * (3.0 - 2.0 * fz)
	var a: float = _splat_hash21(ix, iz)
	var b: float = _splat_hash21(ix + 1.0, iz)
	var c: float = _splat_hash21(ix, iz + 1.0)
	var d: float = _splat_hash21(ix + 1.0, iz + 1.0)
	return lerp(lerp(a, b, ux), lerp(c, d, ux), uz)


static func _splat_fbm(px: float, pz: float) -> float:
	var v: float = 0.0
	var a: float = 0.5
	var x: float = px
	var z: float = pz
	for _i in 4:
		v += a * _splat_value_noise(x, z)
		x *= 2.03
		z *= 2.03
		a *= 0.5
	return v


static func _is_forest(wx: float, wz: float) -> bool:
	var n: float = _splat_fbm(wx * GROUND_NOISE_FREQ, wz * GROUND_NOISE_FREQ)
	# Push past the splat's blend band (threshold ± softness) so spawns land
	# only where the ground texture is fully pine-forest, never in the soft
	# meadow→forest transition. The extra `* 1.5` factor adds a small inset
	# so vegetation visibly clears the boundary instead of brushing it.
	return n > GROUND_NOISE_THRESHOLD + GROUND_NOISE_SOFTNESS * 1.5


# ── Position generation (no visuals, just xforms) ──

func _collect_glades(rng: RandomNumberGenerator, key: Vector2i,
		tree_out: Array[Dictionary], bush_out: Array[Dictionary],
		fern_out: Array[Dictionary]) -> void:
	var n_glades: int = rng.randi_range(1, 2)
	var margin: float = 8.0
	var ox: float = float(key.x) * CHUNK_SIZE
	var oz: float = float(key.y) * CHUNK_SIZE

	for g in range(n_glades):
		var gx: float = ox + margin + rng.randf() * (CHUNK_SIZE - margin * 2.0)
		var gz: float = oz + margin + rng.randf() * (CHUNK_SIZE - margin * 2.0)
		# Glade-center gate: if the picked centre falls in meadow territory
		# (splat noise below threshold), skip this glade entirely. Some chunks
		# will end up empty — that's intentional; the meadow strips between
		# forest patches should be free of vegetation.
		if not _is_forest(gx, gz):
			continue
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
				# Per-tree splat gate: even a forest-centred glade can spill
				# into meadow at its outer rings, so reject any individual
				# tree whose XZ isn't in forest. Naturally produces ragged
				# forest-edge silhouettes that match the splat boundary.
				if not _is_forest(wx, wz):
					continue
				var sc: float = diameter * TREE_SCALE_FACTOR * lerp(0.8, 1.6, rng.randf())
				var ry: float = rng.randf() * TAU
				var xform := _make_world_xform(Vector2(wx, wz), sc, ry)
				tree_out.append({"xz": Vector2(wx, wz), "scale": sc, "xform": xform})
				placed.append({"x": wx, "z": wz, "diameter": diameter})
				_collect_ferns_around_tree(rng, Vector2(wx, wz), sc, placed, fern_out)
		# After all trees (and their fern rings) are placed for this glade,
		# look for open gaps between tree rings and drop bush clusters there.
		_collect_bushes_in_clearing(rng, gx, gz, placed, bush_out)


# Tight fern ring hugging a single tree's canopy footprint. Ferns are small
# enough that we allow them to overlap each other freely; we only reject
# placements that'd land inside a tree trunk.
func _collect_ferns_around_tree(rng: RandomNumberGenerator, tree_xz: Vector2,
		tree_sc: float, placed: Array[Dictionary], fern_out: Array[Dictionary]) -> void:
	var canopy_r: float = tree_sc * 1.8
	var inner_r: float = canopy_r * FERN_CLUSTER_INNER_MULT
	var outer_r: float = canopy_r * FERN_CLUSTER_OUTER_MULT
	var count: int = rng.randi_range(FERN_PER_TREE_MIN, FERN_PER_TREE_MAX)
	for i in range(count):
		var theta: float = rng.randf() * TAU
		var r: float = lerp(inner_r, outer_r, rng.randf())
		var fwx: float = tree_xz.x + cos(theta) * r
		var fwz: float = tree_xz.y + sin(theta) * r
		var too_close: bool = false
		for p: Dictionary in placed:
			if p.diameter < 3.0:
				continue  # only dodge trunks, not sibling ferns
			var min_dist: float = p.diameter * FERN_TRUNK_AVOID_MULT
			var ddx: float = p.x - fwx
			var ddz: float = p.z - fwz
			if ddx * ddx + ddz * ddz < min_dist * min_dist:
				too_close = true
				break
		if too_close:
			continue
		if not _is_forest(fwx, fwz):
			continue
		var fsc: float = lerp(FERN_SCALE_MIN, FERN_SCALE_MAX, rng.randf())
		var fry: float = rng.randf() * TAU
		var xform := _make_world_xform(Vector2(fwx, fwz), fsc, fry)
		fern_out.append({
			"xz": Vector2(fwx, fwz),
			"scale": fsc,
			"xform": xform,
			"basis_inv": xform.basis.inverse(),
		})


# Find open clearings between the tree rings and drop bush clusters there.
# The ring layout always leaves 0–2m in the middle and gaps between the
# inner and outer rings; the reject-sample loop picks a point far enough
# from any trunk to feel like "open ground".
func _collect_bushes_in_clearing(rng: RandomNumberGenerator, gx: float, gz: float,
		placed: Array[Dictionary], bush_out: Array[Dictionary]) -> void:
	var cluster_count: int = rng.randi_range(
		BUSH_CLEARING_MIN_CLUSTERS, BUSH_CLEARING_MAX_CLUSTERS)
	for _c in range(cluster_count):
		var cx: float = 0.0
		var cz: float = 0.0
		var found: bool = false
		for _try in range(BUSH_CLEARING_PLACEMENT_ATTEMPTS):
			var theta: float = rng.randf() * TAU
			var r: float = sqrt(rng.randf()) * BUSH_CLEARING_MAX_SEARCH_R
			cx = gx + cos(theta) * r
			cz = gz + sin(theta) * r
			# Reject candidates that fall into meadow up-front so we don't
			# burn 3-5 per-bush gate failures on a clearly-doomed cluster.
			if not _is_forest(cx, cz):
				continue
			var ok: bool = true
			for p: Dictionary in placed:
				if p.diameter < 3.0:
					continue
				var min_dist: float = p.diameter * BUSH_CLEARING_TREE_AVOID_MULT
				var ddx: float = p.x - cx
				var ddz: float = p.z - cz
				if ddx * ddx + ddz * ddz < min_dist * min_dist:
					ok = false
					break
			if ok:
				found = true
				break
		if not found:
			continue  # crowded glade; skip this cluster rather than crowd a trunk

		var cluster_placed: Array[Dictionary] = []
		var bush_count: int = rng.randi_range(4, 6)
		for i in range(bush_count):
			var offset_dist: float
			var size_t: float  # 0 = largest (centre), 1 = smallest (fringe)
			if i == 0:
				offset_dist = 0.0
				size_t = 0.0
			else:
				offset_dist = rng.randf_range(0.5, 1.8)
				size_t = lerp(0.3, 1.0, rng.randf())
			var offset_angle: float = rng.randf() * TAU
			var bwx: float = cx + cos(offset_angle) * offset_dist
			var bwz: float = cz + sin(offset_angle) * offset_dist
			var diameter: float = lerp(2.1, 1.0, size_t)
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
			if not _is_forest(bwx, bwz):
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


# ── Colliders ──────────────────────────────────────

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
	# Chunk-level cutoff: a tree at the chunk's farthest corner is still
	# capped at `chunk_half_diag + TREE_FADE_RADIUS` from the player, so any
	# chunk beyond that can be skipped wholesale.
	var chunk_half_diag: float = CHUNK_SIZE * 0.7071
	var cutoff: float = chunk_half_diag + TREE_FADE_RADIUS
	var cutoff_sq: float = cutoff * cutoff
	var fade_r_sq: float = TREE_FADE_RADIUS * TREE_FADE_RADIUS
	for key: Vector2i in _chunks_state:
		var center := Vector2(
			(float(key.x) + 0.5) * CHUNK_SIZE,
			(float(key.y) + 0.5) * CHUNK_SIZE)
		if (center - ppos).length_squared() > cutoff_sq:
			continue
		var state: Dictionary = _chunks_state[key]
		var mm: MultiMesh = state.mm_tree.multimesh
		for tree: Dictionary in state.trees:
			# Per-tree early-out: beyond the radius the fade is 0. Only write
			# the cleared value once (when transitioning from faded to zero)
			# and then skip future frames while still out of range.
			var tdx: float = tree.xz.x - ppos.x
			var tdz: float = tree.xz.y - ppos.y
			var td_sq: float = tdx * tdx + tdz * tdz
			if td_sq >= fade_r_sq:
				if tree.last_fade != 0.0:
					mm.set_instance_custom_data(tree.idx, Color(0.0, 0.0, 0.0, 0.0))
					tree.last_fade = 0.0
				continue
			var td: float = sqrt(td_sq)
			var fade: float = 0.0
			if tdz >= -TREE_FADE_Z_BACK:
				fade = (1.0 - td / TREE_FADE_RADIUS) * TREE_FADE_MAX
			if absf(fade - float(tree.last_fade)) < 0.002:
				continue
			mm.set_instance_custom_data(tree.idx, Color(0.0, 0.0, 0.0, fade))
			tree.last_fade = fade


func _update_bush_push() -> void:
	if _player == null:
		return
	var px: float = _player.global_position.x
	var pz: float = _player.global_position.z
	var delta: float = _player.get_process_delta_time()
	var decay: float = exp(-delta * BUSH_PUSH_DECAY_RATE)
	# Chunk-level cutoff using whichever radius is larger (bush's), plus the
	# chunk's half-diagonal. Anything farther has no live push contribution
	# and all entries in it have decayed to rest.
	var chunk_half_diag: float = CHUNK_SIZE * 0.7071
	var max_r: float = maxf(BUSH_PUSH_RADIUS, FERN_PUSH_RADIUS)
	var cutoff: float = chunk_half_diag + max_r
	var cutoff_sq: float = cutoff * cutoff
	var ppos := Vector2(px, pz)
	for key: Vector2i in _chunks_state:
		var center := Vector2(
			(float(key.x) + 0.5) * CHUNK_SIZE,
			(float(key.y) + 0.5) * CHUNK_SIZE)
		if (center - ppos).length_squared() > cutoff_sq:
			continue
		var state: Dictionary = _chunks_state[key]
		_update_push_entries(state.mm_bush.multimesh, state.bushes,
			px, pz, decay, BUSH_PUSH_RADIUS, BUSH_PUSH_STRENGTH)
		_update_push_entries(state.mm_fern.multimesh, state.ferns,
			px, pz, decay, FERN_PUSH_RADIUS, FERN_PUSH_STRENGTH)


# Generic attack-decay push update for a MultiMesh of plants keyed by XZ.
# Each entry is a Dictionary with `xz` / `basis_inv` / `idx` / `push_amount`
# / `prev_proximity` fields (mutated in place).
func _update_push_entries(mm: MultiMesh, entries: Array[Dictionary],
		px: float, pz: float, decay: float, radius: float, strength: float) -> void:
	var r_sq: float = radius * radius
	const REST_EPS: float = 0.004
	for entry: Dictionary in entries:
		var dx: float = entry.xz.x - px
		var dz: float = entry.xz.y - pz
		var d_sq: float = dx * dx + dz * dz

		# At-rest + far: entry already has zero push applied, and player is
		# outside the radius so there's no contribution to accumulate. Skip
		# the entire compute + RenderingServer write.
		if d_sq > r_sq and entry.push_amount < REST_EPS and entry.prev_proximity == 0.0:
			continue

		var proximity: float = 0.0
		if d_sq < r_sq:
			proximity = 1.0 - sqrt(d_sq) / radius

		var delta_p: float = proximity - entry.prev_proximity
		if delta_p > 0.0:
			entry.push_amount = minf(1.0, entry.push_amount + delta_p * BUSH_PUSH_ATTACK)
		entry.prev_proximity = proximity
		entry.push_amount *= decay

		var pl: Vector3 = Vector3.ZERO
		var above_rest: bool = entry.push_amount > REST_EPS
		if above_rest and d_sq > 1e-6:
			var inv_d: float = 1.0 / sqrt(d_sq)
			var amp: float = float(entry.push_amount) * strength
			var push_world: Vector3 = Vector3(dx * inv_d, 0.0, dz * inv_d) * amp
			pl = entry.basis_inv * push_world
		else:
			# Below the rest threshold: snap to zero so next frame we can
			# enter the fast skip path.
			entry.push_amount = 0.0
		mm.set_instance_custom_data(entry.idx, Color(pl.x, pl.y, pl.z, 0.0))


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
