class_name SplatmapSpawnTestScreen
extends BaseScreen
## Splat↔spawn alignment test. Paints an infinite grid of 5-coloured zones on
## the ground and scatters cuboids whose type/colour is sampled at their world
## XZ. If ANY cuboid disagrees with the ground tile beneath it, the proxy
## splat-map → spawn → ground-shader pipeline has a positional bug.
##
## Architecture: per chunk we bake an L8 `Image` of zone IDs (one byte per
## texel, value `id * 51`), wrap it in an `ImageTexture`, and bind that to
## a per-chunk `ShaderMaterial.duplicate()` of the ground material. The
## spawn loop samples the SAME `Image` to decide each prefab's type, so CPU
## and GPU read identical bytes — no possible noise-math drift between the
## two paths. `SplatTestZone.zone_id_at` is the single source of truth and
## is consumed only at bake time.
##
## Stripped clone of TerrainDemo2Screen: chunk streaming + MMI pattern are
## preserved, but every biome / fog / zone-wall / rock system is cut. The
## raster-block + dither + palette-LUT post-pass IS ported (no fog) so the
## test renders in the same pixel-art look as the production demo. Under
## LUT mode the 5 zone hues snap to nearest palette neighbours; that's the
## intended chunky look — block-level alignment between cuboid and ground
## stays readable because the raster blocks are well below the 2 px / metre
## splat resolution.

const CHUNK_SIZE: float = 64.0
const CHUNK_LOAD_MARGIN: float = 16.0
const CHUNK_FOOTPRINT_OVERSCAN: float = 2.0

# Per-chunk splat-image resolution. 128² at CHUNK_SIZE = 64 → 2 px / metre,
# 16 KB per chunk in L8. Keep a power of two so any future mip chain or GPU
# upload alignment stays trivial. Boundaries between zones become visibly
# pixelated under filter_nearest at this resolution — that's intentional:
# crisp seams make spawn-vs-ground misalignment instantly visible.
const SPLAT_GRID_N: int = 128

# Cuboid candidates per chunk. Purely uniform scatter; no biome gate. 120
# per 64×64 m ≈ 1 every 6 m, enough density that every cell (~28 m) is
# populated while the candidates stay cheap.
const CANDIDATES_PER_CHUNK: int = 120

# Separate seed component so this screen's layout doesn't collide with the
# terrain demo's if we ever share chunk coords in a debug overlay.
const WORLD_SEED: int = 0xA2E7

# Each zone owns a distinct prefab mesh so the type is identifiable by SHAPE,
# not just colour. If matcap / post-fx / driver quirks ever skew the rendered
# colour, the geometric silhouette still tells you which type a prefab is —
# so any "blue capsule on red ground" mismatch reads as a real spawn-gating
# bug, not a rendering bug.
const PREFAB_WIDTH: float = 0.8
const PREFAB_HEIGHT: float = 1.6
# Per-mesh Y offset compensating for the primitive's pivot. Box / Capsule /
# Cylinder / Prism are centred on origin (offset = half-height); Sphere is
# also centred but its visible bottom is at -radius (offset = radius).
const PREFAB_Y_OFFSETS: Array[float] = [
	0.8,  # 0 cube     — centred BoxMesh, half of 1.6
	0.8,  # 1 capsule  — centred CapsuleMesh, half of 1.6
	0.7,  # 2 sphere   — centred SphereMesh, radius 0.7
	0.8,  # 3 cylinder — centred CylinderMesh, half of 1.6
	0.8,  # 4 prism    — centred PrismMesh, half of 1.6
]
const PREFAB_NAMES: Array[String] = ["cube", "capsule", "sphere", "cylinder", "prism"]
# Big, dark shadows — they double as a placement-matching aid: the dark disc
# under a prefab sits squarely on the (slightly desaturated) ground tile, so
# a misplaced prefab is framed by a shadow on a wrong-colour tile.
const PREFAB_SHADOW_SIZE_MULT: float = 5.0
const BLOB_SHADOW_Y: float = 0.05
const SHADOW_COLOR: Color = Color(0.0, 0.0, 0.0, 0.95)

# Wind — kept modest. Match tree values rather than bush/fern since cuboids
# are tall and would read as jittery under full-strength wind.
const WIND_STRENGTH: float = 0.10
const WIND_SPEED: float = 0.8
const WIND_MASK_Y_MIN: float = 0.1
const WIND_MASK_Y_MAX: float = 1.8
const WIND_SPATIAL_FREQ: Vector2 = Vector2(0.07, 0.05)
const WIND_TURBULENCE: float = 0.3

const CAM_LERP: float = 0.1
const ORTHO_SIZE: float = 11.0
const CAM_PITCH_DEG: float = -30.0
const CAM_DIST: float = 80.0

const CuboidShader: Shader = preload("res://assets/shaders/splat_test_cuboid.gdshader")
const GroundShader: Shader = preload("res://assets/shaders/splat_test_ground.gdshader")
const BlobShadowShader: Shader = preload("res://assets/shaders/blob_shadow.gdshader")
const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")
const PaneRasterLutShader: Shader = preload("res://assets/shaders/pane_raster_lut.gdshader")
const CUBOID_MATCAP_TEX: Texture2D = preload("res://assets/matcap/matcap_1.png")

# Post-FX: raster block snapping + Bayer dither + film grain, optionally
# palette-LUT-snapped to a 256-colour palette. Mirrors the production demo
# (`terrain_demo_2_screen.gd`). Fog is intentionally NOT ported — it's
# zone-aware and meaningless in a no-zone debug screen.
const USE_LUT_DITHER: bool = true
const PALETTE_HEX_PATH: String = "res://assets/palettes/sega-cube.hex"

# Matches the desaturation factor in splat_test_ground.gdshader's
# `ground_saturation` uniform — used in CPU-side logging to predict the
# ground's rendered colour and confirm the cuboid colour rides above it.
const GROUND_SATURATION: float = 0.6
# Set true to dump every cuboid's colour vs predicted ground colour on
# chunk load. Verbose (~120 lines per chunk × ~25 visible chunks at boot).
const INTENSIVE_LOG: bool = false

var _full_w: int = 0
var _full_h: int = 0
# Raster-block size in viewport pixels — half the text grid's graphics-cell
# width so a viewport-pixel maps cleanly onto the screen pixel grid the
# `ascii_grid` renderer uses for its glyph atlas.
var _block_w: int = 1
var _block_h: int = 1
var _viewport: SubViewport
var _texture_rect: TextureRect
var _raster_mat: ShaderMaterial
# 16³ palette LUT (built once from the .hex file) used by `pane_raster_lut`
# to snap dithered colours to the nearest palette entry. `null` when
# `USE_LUT_DITHER = false`.
var _palette_lut: ImageTexture3D = null
var _hud_label: Label

var _scene_root: Node3D
var _chunk_container: Node3D
var _camera: Camera3D
var _player: CharacterBody3D

var _zone_meshes: Array[Mesh] = []  # one per zone id (0..4)
var _ground_mesh: PlaneMesh
var _shadow_mesh: PlaneMesh

var _cuboid_material: ShaderMaterial
# Template: every chunk's ground MMI gets `_ground_material.duplicate()` as
# its `material_override`, populated with that chunk's `splat_tex` and
# `chunk_origin`. Per-chunk material instances are required because a
# `sampler2D` can't ride MMI INSTANCE_CUSTOM (which is a single vec4).
var _ground_material: ShaderMaterial
var _shadow_material: ShaderMaterial

# key: Vector2i -> Dictionary { node, mm_per_type: Array[MultiMeshInstance3D],
#                               mm_ground, mm_shadow, id_counts, splat_img }
var _chunks_state: Dictionary = {}

# Running count of cuboids per zone id across loaded chunks — drives the HUD
# histogram sanity check (all five buckets should sit within ~20 %).
var _id_counts: PackedInt32Array = PackedInt32Array([0, 0, 0, 0, 0])


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
		_hud_label.text = (
			"FPS %d  Chunk (%d,%d)  %d chunks  [ESC] Back\n"
			+ "cubes %d  caps %d  spheres %d  cyls %d  prisms %d"
		) % [fps, cx, cz, _chunks_state.size(),
			_id_counts[0], _id_counts[1], _id_counts[2], _id_counts[3], _id_counts[4]]


# ── World setup ────────────────────────────────────

func _build_world() -> void:
	var full_w: int = grid.cols * grid.cell_width
	var full_h: int = grid.rows * grid.cell_height
	_full_w = full_w
	_full_h = full_h

	_viewport = SubViewport.new()
	# MSAA disabled: the ground shader draws hard zone boundaries and any MSAA
	# softening would blur the very edge we're asking the user to eyeball for
	# cuboid-vs-tile alignment.
	_viewport.msaa_3d = Viewport.MSAA_DISABLED
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_viewport.handle_input_locally = false
	_viewport.transparent_bg = false
	_viewport.size = Vector2i(full_w / 2, full_h / 2)
	grid.add_child(_viewport)

	_scene_root = Node3D.new()
	_scene_root.name = "SplatTestScene"
	_viewport.add_child(_scene_root)

	var world_env := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#1a1a2e")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	world_env.environment = env
	_scene_root.add_child(world_env)

	_build_meshes()
	_build_materials()

	_chunk_container = Node3D.new()
	_chunk_container.name = "Chunks"
	_scene_root.add_child(_chunk_container)

	_player = CharacterBody3D.new()
	_player.name = "Player"
	_player.set_script(preload("res://terrain/terrain_player.gd"))
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.4; cap.height = 1.8
	col.shape = cap
	_player.add_child(col)
	_scene_root.add_child(_player)
	_player.position = Vector3(0.0, 0.9, 0.0)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = ORTHO_SIZE
	_camera.near = 1.0; _camera.far = 200.0
	_camera.current = true
	_scene_root.add_child(_camera)

	_texture_rect = TextureRect.new()
	_texture_rect.texture = _viewport.get_texture()
	_texture_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_texture_rect.position = Vector2.ZERO
	_texture_rect.size = Vector2(full_w, full_h)
	_texture_rect.stretch_mode = TextureRect.STRETCH_SCALE
	_texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Post-FX: raster blocks + Bayer dither + film grain, palette-LUT-snapped
	# when USE_LUT_DITHER. Mirrors `terrain_demo_2_screen.gd` lines 571–599
	# minus the fog stage. The raster shader reads the viewport texture as
	# its TEXTURE input, so the material rides on the displaying TextureRect
	# rather than the SubViewport.
	_raster_mat = ShaderMaterial.new()
	if USE_LUT_DITHER:
		_raster_mat.shader = PaneRasterLutShader
		if _palette_lut == null:
			var pal: PackedColorArray = PaletteUtil.load_hex_palette(PALETTE_HEX_PATH)
			_palette_lut = PaletteUtil.build_palette_lut_3d(pal)
		if _palette_lut != null:
			_raster_mat.set_shader_parameter("palette_lut", _palette_lut)
		_raster_mat.set_shader_parameter("palette_dither_strength", 0.08)
	else:
		_raster_mat.shader = PaneRasterShader
	_raster_mat.set_shader_parameter("rect_size_px", Vector2(full_w, full_h))
	_block_w = maxi(1, grid.g_cell_width / 2)
	_block_h = _block_w
	_raster_mat.set_shader_parameter("block_size", Vector2(float(_block_w), float(_block_h)))
	# Film-grain: block-level hash noise injected before the dither pass.
	# Cheap (one hash per raster block, time-quantised), subtle but visible
	# enough to shimmer the dither.
	_raster_mat.set_shader_parameter("noise_strength", 0.02)
	_raster_mat.set_shader_parameter("noise_time_hz", 20.0)
	_raster_mat.set_shader_parameter("noise_cell_mult", 2.0)
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


func _build_meshes() -> void:
	# Five distinct primitives, one per zone id. All ≈1.6 m tall so they read
	# as comparable scale next to the player. Order MUST line up with
	# PREFAB_Y_OFFSETS / PREFAB_NAMES / SplatTestZone.ZONE_COLORS.
	var box := BoxMesh.new()
	box.size = Vector3(PREFAB_WIDTH, PREFAB_HEIGHT, PREFAB_WIDTH)

	var capsule := CapsuleMesh.new()
	capsule.radius = 0.4
	capsule.height = PREFAB_HEIGHT  # total height including caps

	var sphere := SphereMesh.new()
	sphere.radius = 0.7
	sphere.height = 1.4

	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.4
	cylinder.bottom_radius = 0.4
	cylinder.height = PREFAB_HEIGHT

	var prism := PrismMesh.new()
	prism.size = Vector3(PREFAB_WIDTH, PREFAB_HEIGHT, PREFAB_WIDTH)

	_zone_meshes = [box, capsule, sphere, cylinder, prism]

	# One flat quad per chunk. The ground shader reconstructs UV from world XZ
	# so a single unsubdivided quad is enough; seams between chunks are
	# invisible because the per-chunk splat textures bake the same world XZ
	# to the same id at their shared border.
	_ground_mesh = PlaneMesh.new()
	_ground_mesh.size = Vector2(CHUNK_SIZE, CHUNK_SIZE)
	_ground_mesh.subdivide_width = 0
	_ground_mesh.subdivide_depth = 0

	_shadow_mesh = PlaneMesh.new()
	_shadow_mesh.size = Vector2.ONE


func _build_materials() -> void:
	_ground_material = ShaderMaterial.new()
	_ground_material.shader = GroundShader
	_ground_material.set_shader_parameter("ground_saturation", GROUND_SATURATION)

	_cuboid_material = ShaderMaterial.new()
	_cuboid_material.shader = CuboidShader
	_cuboid_material.set_shader_parameter("matcap", CUBOID_MATCAP_TEX)
	# Matcap contributes brightness only — the zone hue rides INSTANCE_CUSTOM
	# unfiltered. See splat_test_cuboid.gdshader for the rationale.
	_cuboid_material.set_shader_parameter("matcap_shade_strength", 1.0)
	_cuboid_material.set_shader_parameter("wind_strength", WIND_STRENGTH)
	_cuboid_material.set_shader_parameter("wind_speed", WIND_SPEED)
	_cuboid_material.set_shader_parameter("wind_mask_y_min", WIND_MASK_Y_MIN)
	_cuboid_material.set_shader_parameter("wind_mask_y_max", WIND_MASK_Y_MAX)
	_cuboid_material.set_shader_parameter("wind_spatial_freq", WIND_SPATIAL_FREQ)
	_cuboid_material.set_shader_parameter("wind_turbulence", WIND_TURBULENCE)

	_shadow_material = ShaderMaterial.new()
	_shadow_material.shader = BlobShadowShader
	_shadow_material.set_shader_parameter("color", SHADOW_COLOR)

	# Attach the shared cuboid material to every per-zone mesh so each MMI
	# picks it up per-surface without needing material_override (matches the
	# terrain_demo_2 pattern). All zones share one material — per-instance
	# colour rides INSTANCE_CUSTOM, which the shader uses as ALBEDO.
	for mesh in _zone_meshes:
		if mesh.get_surface_count() >= 1:
			mesh.surface_set_material(0, _cuboid_material)


func _cleanup() -> void:
	for state: Dictionary in _chunks_state.values():
		if state.node != null:
			state.node.queue_free()
	_chunks_state.clear()
	for i in _id_counts.size():
		_id_counts[i] = 0

	if _hud_label: _hud_label.queue_free(); _hud_label = null
	if _texture_rect: _texture_rect.queue_free(); _texture_rect = null
	if _viewport: _viewport.queue_free(); _viewport = null
	_player = null; _camera = null
	_chunk_container = null; _scene_root = null
	_ground_material = null
	_cuboid_material = null
	_shadow_material = null
	_raster_mat = null
	# Keep `_palette_lut` cached across re-entries — building it costs ~2 s on
	# slow devices and the LUT is read-only.
	_zone_meshes.clear()
	_ground_mesh = null
	_shadow_mesh = null


# ── Chunk management ───────────────────────────────

func _update_chunks() -> void:
	if _player == null or _viewport == null:
		return
	var px: float = _player.global_position.x
	var pz: float = _player.global_position.z

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

	for key: Vector2i in desired:
		if not _chunks_state.has(key):
			_load_chunk(key)

	var stale: Array[Vector2i] = []
	for key: Vector2i in _chunks_state:
		if not desired.has(key):
			stale.append(key)
	for key in stale:
		_unload_chunk(key)


func _load_chunk(key: Vector2i) -> void:
	var chunk := Node3D.new()
	chunk.name = "chunk_%d_%d" % [key.x, key.y]
	_chunk_container.add_child(chunk)

	var origin_x: float = float(key.x) * CHUNK_SIZE
	var origin_z: float = float(key.y) * CHUNK_SIZE

	# Bake the proxy splat: one byte per texel, value `id * 51`. The same
	# `Image` is then consumed below by `_sample_baked_id` for spawn gating
	# AND uploaded as `splat_tex` for the ground shader, so CPU + GPU read
	# identical bytes — drift between prefab type and ground colour is
	# physically impossible.
	var splat_img: Image = _bake_chunk_splat(origin_x, origin_z)
	var splat_tex := ImageTexture.create_from_image(splat_img)

	# Per-chunk material: duplicate the template, attach this chunk's splat.
	# A `sampler2D` can't ride MMI INSTANCE_CUSTOM, so material-per-chunk is
	# the only option. Cost is one ShaderMaterial per active chunk (~25).
	var ground_mat: ShaderMaterial = _ground_material.duplicate()
	ground_mat.set_shader_parameter("splat_tex", splat_tex)
	ground_mat.set_shader_parameter("chunk_origin", Vector2(origin_x, origin_z))

	# Ground: single instance of the flat quad, positioned at chunk origin.
	# PlaneMesh sits on the XZ plane centred on origin, so shift by half a
	# chunk so chunk-local (0,0) lands on the chunk-origin corner. The
	# ground shader does NOT use the mesh's UVs — it reconstructs UV from
	# `(world.xz - chunk_origin) / 64.0`, so this transform is purely about
	# where the quad geometry covers in world XZ.
	var mm_ground := _make_ground_mmi(1, ground_mat)
	mm_ground.multimesh.set_instance_transform(0, Transform3D(
		Basis.IDENTITY,
		Vector3(origin_x + CHUNK_SIZE * 0.5, 0.0, origin_z + CHUNK_SIZE * 0.5)))
	chunk.add_child(mm_ground)

	# Deterministic chunk seed: layout reproduces identically across unload /
	# reload cycles. key.x multiplier is a prime that spreads neighbouring
	# chunks' RNG streams apart. WORLD_SEED keeps this test's layout disjoint
	# from any future demo that reuses the same (cx, cz) keys.
	var rng := RandomNumberGenerator.new()
	rng.seed = key.x * 100003 + key.y * 37 + WORLD_SEED

	if INTENSIVE_LOG:
		print("[splat-test] === LOAD chunk (%d, %d) origin=(%.2f, %.2f) ===" % [
			key.x, key.y, origin_x, origin_z])

	# Phase 1: generate candidates and bucket by zone id, sampled from the
	# baked splat image. RNG is consumed in a single linear pass (one randf
	# pair per candidate) so chunk seeds reproduce identical point sets.
	var buckets: Array = [[], [], [], [], []]  # 5 arrays of Vector2 (wx, wz)
	var chunk_id_counts: PackedInt32Array = PackedInt32Array([0, 0, 0, 0, 0])
	for i in CANDIDATES_PER_CHUNK:
		var lx: float = rng.randf() * CHUNK_SIZE
		var lz: float = rng.randf() * CHUNK_SIZE
		var wx: float = origin_x + lx
		var wz: float = origin_z + lz
		# Zone classification gates which prefab type spawns here. The image
		# we sample is the SAME bytes the ground shader will read at the
		# same (wx, wz), so by construction the prefab type matches the tile
		# colour beneath it.
		var id: int = _sample_baked_id(splat_img, lx, lz)
		buckets[id].append(Vector2(wx, wz))
		_id_counts[id] += 1
		chunk_id_counts[id] += 1

		if INTENSIVE_LOG:
			# Re-sample on a separate call so any future change that breaks
			# `_sample_baked_id`'s self-consistency would surface here. By
			# construction it must agree with `id`.
			var ground_id: int = _sample_baked_id(splat_img, lx, lz)
			var col: Color = SplatTestZone.zone_color(id)
			var ground_col: Color = _predict_ground_color(ground_id)
			var match_str: String = "MATCH" if ground_id == id else "!! MISMATCH !!"
			var step: float = CHUNK_SIZE / float(SPLAT_GRID_N)
			var tex_ix: int = int(floor(lx / step))
			var tex_iz: int = int(floor(lz / step))
			print("[splat-test] chunk=(%d,%d) i=%03d wx=%.3f wz=%.3f tex=(%d,%d) prefab=%s id=%d rgb=(%.2f,%.2f,%.2f) ground_id=%d ground_rgb=(%.2f,%.2f,%.2f) %s" % [
				key.x, key.y, i, wx, wz, tex_ix, tex_iz,
				PREFAB_NAMES[id], id, col.r, col.g, col.b,
				ground_id, ground_col.r, ground_col.g, ground_col.b,
				match_str,
			])

	# Phase 2: build one MMI per zone type, sized to its bucket. Empty
	# buckets get a 0-instance MM (Godot handles cleanly).
	var mm_per_type: Array[MultiMeshInstance3D] = []
	for type_id in 5:
		var bucket: Array = buckets[type_id]
		var mmi := _make_prefab_mmi(_zone_meshes[type_id], bucket.size())
		mm_per_type.append(mmi)
		chunk.add_child(mmi)
		var col: Color = SplatTestZone.zone_color(type_id)
		var y_offset: float = PREFAB_Y_OFFSETS[type_id]
		var mm: MultiMesh = mmi.multimesh
		for j in bucket.size():
			var pos: Vector2 = bucket[j]
			mm.set_instance_transform(j, Transform3D(
				Basis.IDENTITY, Vector3(pos.x, y_offset, pos.y)))
			mm.set_instance_custom_data(j, Color(col.r, col.g, col.b, 0.0))

	# Shadows are type-agnostic — one MM per chunk holding all candidates.
	var mm_shadow := _make_shadow_mmi(CANDIDATES_PER_CHUNK)
	chunk.add_child(mm_shadow)
	var shadow_idx: int = 0
	for type_id in 5:
		var bucket: Array = buckets[type_id]
		for pos: Vector2 in bucket:
			mm_shadow.multimesh.set_instance_transform(shadow_idx, _shadow_xform(
				pos, PREFAB_WIDTH * PREFAB_SHADOW_SIZE_MULT))
			shadow_idx += 1

	if INTENSIVE_LOG:
		print("[splat-test] chunk (%d, %d) loaded %d prefabs; cubes=%d caps=%d spheres=%d cyls=%d prisms=%d" % [
			key.x, key.y, CANDIDATES_PER_CHUNK,
			chunk_id_counts[0], chunk_id_counts[1], chunk_id_counts[2],
			chunk_id_counts[3], chunk_id_counts[4]])

	_chunks_state[key] = {
		"node": chunk,
		"mm_per_type": mm_per_type,
		"mm_ground": mm_ground,
		"mm_shadow": mm_shadow,
		"id_counts": chunk_id_counts,
		# Stashed for offline diagnostics — the on-disk PNG of `splat_img`
		# is the easiest way to eyeball whether the bake matches the
		# rendered ground.
		"splat_img": splat_img,
	}


# Bake the per-chunk proxy splat. One byte per texel, value `id * 51` so the
# 5 IDs map to evenly-spaced 8-bit values (0/51/102/153/204) that round-trip
# cleanly through the shader's `int(round(v * 5.0))` decode under any
# 8-bit driver quantisation. Sample at TEXEL CENTRES (`(ix + 0.5) * step`)
# to match the GPU's NEAREST sampler convention; `_sample_baked_id` then
# uses `floor(local / step)` and the two resolve to the same texel index
# for any (lx, lz) inside the chunk.
static func _bake_chunk_splat(origin_x: float, origin_z: float) -> Image:
	var img := Image.create(SPLAT_GRID_N, SPLAT_GRID_N, false, Image.FORMAT_L8)
	var step: float = CHUNK_SIZE / float(SPLAT_GRID_N)
	for iz in SPLAT_GRID_N:
		var wz: float = origin_z + (float(iz) + 0.5) * step
		for ix in SPLAT_GRID_N:
			var wx: float = origin_x + (float(ix) + 0.5) * step
			var id: int = SplatTestZone.zone_id_at(wx, wz)
			img.set_pixel(ix, iz, Color8(id * 51, 0, 0, 255))
	return img


# CPU equivalent of the ground shader's `texture(splat_tex, uv).r` lookup
# under `filter_nearest`. For a chunk-local (lx, lz), pick the texel whose
# centre the world point falls into, then decode the byte to an id 0..4.
# Bit-identical to the shader's NEAREST sampling.
static func _sample_baked_id(img: Image, local_x: float, local_z: float) -> int:
	var step: float = CHUNK_SIZE / float(SPLAT_GRID_N)
	var ix: int = clampi(int(floor(local_x / step)), 0, SPLAT_GRID_N - 1)
	var iz: int = clampi(int(floor(local_z / step)), 0, SPLAT_GRID_N - 1)
	var byte_v: int = int(round(img.get_pixel(ix, iz).r * 255.0))
	return clampi(int(round(float(byte_v) / 51.0)), 0, 4)


# CPU mirror of the ground shader's `ALBEDO = mix(luma, color, ground_saturation)`
# desaturation. Used only for logging — the shader does the real desat per-pixel.
static func _predict_ground_color(id: int) -> Color:
	var z: Color = SplatTestZone.zone_color(id)
	var lum: float = z.r * 0.299 + z.g * 0.587 + z.b * 0.114
	return Color(
		lerp(lum, z.r, GROUND_SATURATION),
		lerp(lum, z.g, GROUND_SATURATION),
		lerp(lum, z.b, GROUND_SATURATION),
	)


func _unload_chunk(key: Vector2i) -> void:
	var state: Dictionary = _chunks_state[key]
	# Subtract this chunk's per-id contribution so the HUD histogram stays in
	# lockstep with what's actually on screen.
	var chunk_counts: PackedInt32Array = state.id_counts
	for i in chunk_counts.size():
		_id_counts[i] -= chunk_counts[i]
	if state.node != null:
		state.node.queue_free()
	_chunks_state.erase(key)


# ── MMI factories ──────────────────────────────────

func _make_prefab_mmi(mesh: Mesh, count: int) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true  # INSTANCE_CUSTOM carries the zone colour
	mm.mesh = mesh
	mm.instance_count = maxi(count, 0)
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi


func _make_ground_mmi(count: int, mat: ShaderMaterial) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = false
	mm.mesh = _ground_mesh
	mm.instance_count = maxi(count, 0)
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi


func _make_shadow_mmi(count: int) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = false
	mm.mesh = _shadow_mesh
	mm.instance_count = maxi(count, 0)
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = _shadow_material
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi


static func _shadow_xform(xz: Vector2, size: float) -> Transform3D:
	var basis := Basis.IDENTITY.scaled(Vector3(size, 1.0, size))
	return Transform3D(basis, Vector3(xz.x, BLOB_SHADOW_Y, xz.y))


# ── Camera ─────────────────────────────────────────

func _update_camera() -> void:
	if _camera == null or _player == null:
		return
	var pitch: float = deg_to_rad(CAM_PITCH_DEG)
	# Place camera behind player along -forward, so the player stays at the
	# view centre regardless of pitch. Forward = (0, sin(pitch), -cos(pitch)).
	var offset := Vector3(0.0, -sin(pitch), cos(pitch)) * CAM_DIST
	var tp: Vector3 = _player.global_position + offset
	var lerped: Vector3 = _camera.global_position.lerp(tp, CAM_LERP)

	# Snap the camera onto a world-space grid aligned to one chunky pixel
	# block, and pass the discarded sub-block residual to the raster shader
	# as a UV shift. Without this, the dither pattern shimmers as the camera
	# moves because the raster blocks are not phase-locked to the world.
	# Mirrors `terrain_demo_2_screen.gd` lines 2222–2255 — keep them in sync.
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
