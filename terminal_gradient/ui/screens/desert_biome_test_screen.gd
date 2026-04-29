class_name DesertBiomeTestScreen
extends BaseScreen
## Desert biome test — infinite chunked terrain with two ground textures
## (sand + desert-dirt-rocks) blended via the proxy-splatmap pattern. Cactus
## prefabs spawn on the dirt-rocks side; desert rock prefabs spawn in clumps
## on the sand side with extremely random rotation/size/scattering.
##
## Same chunk-streaming + per-chunk async density bake as TerrainDemo5Screen,
## stripped of all zone-grid / platform / obelisk / compass / fog code. The
## proxy-splatmap shader (terrain_splat_v2.gdshader) is reused as-is with the
## metal layer left unbound (hint_default_black makes it a no-op) and the
## path overlay neutralised via path_strength = 0.
##
## Slot mapping in the splat shader:
##   meadow_tex slot ← sand_checkered.jpg (high-density "pocket" texture)
##   forest_tex slot ← desert_dirt_rocks_checkered.png (default/background)
## Spawn gates:
##   cactus → reject if _is_meadow_at(...) → cactus only on dirt-rocks
##   rock cluster anchor → keep if _is_meadow_at(...) → rocks only in sand

const CHUNK_SIZE: float = 64.0
const CHUNK_LOAD_MARGIN: float = 16.0
const CHUNK_FOOTPRINT_OVERSCAN: float = 2.0

const CAM_LERP: float = 0.1
const ORTHO_SIZE: float = 11.0
const CAM_PITCH_DEG: float = -30.0
const CAM_DIST: float = 80.0
const CAM_YAW_SPEED_DEG: float = 90.0

const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")
const PaneRasterLutShader: Shader = preload("res://assets/shaders/pane_raster_lut.gdshader")
const BlobShadowShader: Shader = preload("res://assets/shaders/blob_shadow.gdshader")
const TerrainSplatShader: Shader = preload("res://assets/shaders/terrain_splat_v2.gdshader")
const USE_LUT_DITHER: bool = true
const PALETTE_HEX_PATH: String = "res://assets/palettes/sega-cube.hex"

const GROUND_SAND_TEX: Texture2D = preload("res://assets/biomes/desert/sand_checkered.jpg")
const GROUND_DIRT_TEX: Texture2D = preload("res://assets/biomes/desert/desert_dirt_rocks_checkered.png")
const GROUND_WORLD_PER_TILE: float = 6.4

const BiomeConfigDefault: Resource = preload("res://core/biome_config_default.tres")

const BIOME_GRID_N: int = 128
const BAKE_GRID_N: int = BIOME_GRID_N + 2

# Desert prefab catalog. Tall cacti (A/B/C) drive the wide-grid scatter;
# cactus_short drives the small-cactus clusters. `desert_rock` is one shape,
# scaled aggressively to fake variety.
const CactusShortScene: PackedScene = preload("res://assets/prefabs/cactus_short.tscn")
const CactusTallAScene: PackedScene = preload("res://assets/prefabs/cactus_tall_a.tscn")
const CactusTallBScene: PackedScene = preload("res://assets/prefabs/cactus_tall_b.tscn")
const CactusTallCScene: PackedScene = preload("res://assets/prefabs/cactus_tall_c.tscn")
const DesertRockScene: PackedScene = preload("res://assets/prefabs/desert_rock.tscn")
const TumbleweedScene: PackedScene = preload("res://assets/models/tumbleweed_0.glb")
const WindParticlesShader: Shader = preload("res://assets/shaders/wind_particles.gdshader")
# Tall cacti are big-only — they never appear in clusters, so the wide-grid
# scatter always reads as "big silhouettes evenly distributed across dirt-rocks".
const TallCactusScenes: Array[PackedScene] = [
	CactusTallAScene, CactusTallBScene, CactusTallCScene,
]
# Short cacti are cluster-only — they never appear standalone in the wide grid.
const ShortCactusScenes: Array[PackedScene] = [
	CactusShortScene,
]

# Wind direction (world XZ). Matches the cactus shader's default `wind_dir`
# uniform so tumbleweeds drift along the same axis the cacti lean. East → west.
const WIND_DIR: Vector3 = Vector3(-1.0, 0.0, 0.0)

# Tumbleweed bounce + drift. Tumbleweeds are kinematic (no physics body) — they
# just add a velocity in the wind direction, integrate gravity, bounce on the
# ground plane, and despawn-then-respawn when they pass downwind of the player.
const TUMBLEWEED_COUNT: int = 18
# Spawn pool: range east of player where new tumbleweeds appear; Z range either
# side of the player they can spawn within. The first batch spawns spread
# across both X sides so the world isn't empty for the first few seconds.
const TUMBLEWEED_SPAWN_RANGE_X: float = 90.0
const TUMBLEWEED_SPAWN_RANGE_Z: float = 50.0
# Despawn distance west of the player (downwind). Smaller value = tighter ring.
const TUMBLEWEED_DESPAWN_X: float = 90.0
# Despawn radius in Z (player-relative) — covers turbulence drift overshoot.
const TUMBLEWEED_DESPAWN_Z: float = 80.0
const TUMBLEWEED_SCALE_MIN: float = 1.0
const TUMBLEWEED_SCALE_MAX: float = 2.2
const TUMBLEWEED_SPEED_MIN: float = 5.0
const TUMBLEWEED_SPEED_MAX: float = 11.0
# Maximum lateral drift speed (Z component of velocity) in m/s. Random sign.
const TUMBLEWEED_DRIFT_Z_MAX: float = 2.0
# Initial upward velocity at spawn so tumbleweeds enter mid-bounce.
const TUMBLEWEED_HOP_INITIAL: float = 6.0
# Vertical accel applied each frame. Lower than player's gravity so the
# bounces feel longer / more cinematic.
const TUMBLEWEED_GRAVITY: float = 22.0
# Fraction of vertical speed retained on each ground bounce.
const TUMBLEWEED_BOUNCE_DAMPING: float = 0.6
# Horizontal damping applied PER REAL BOUNCE — keeps tumbleweeds from
# accelerating, but only fires when the impact velocity exceeds the threshold
# below. Without that gate, gravity pulls Y under rest_y every frame after a
# tumbleweed has settled, the bounce branch fires every frame, and horizontal
# velocity decays to zero in ~1 second (the "moves once then stops" bug).
const TUMBLEWEED_HORIZ_DAMPING: float = 0.95
# Minimum incoming downward speed (m/s) for a bounce to count as a real
# impact. Anything below this is treated as a tumbleweed rolling along the
# ground — vertical speed is zeroed but horizontal motion is preserved.
const TUMBLEWEED_BOUNCE_VEL_THRESHOLD: float = 1.5
const TUMBLEWEED_GROUND_Y: float = 0.0
# Spin rate (rad/s) per unit horizontal speed, divided by scale so big
# tumbleweeds spin slower (their visual circumference covers more ground per
# revolution).
const TUMBLEWEED_SPIN_PER_SPEED: float = 0.9

# ── Tumbleweed dynamic forces (gusts, bumps, thermals, mass) ──
# Each tumbleweed has its own per-instance phase, frequency, and timing for
# these forces, so you see fast gust-driven sprints alongside slow heavy
# rollers, sudden hops mid-roll, and the occasional one catching a thermal.
#
# Gust: per-tumbleweed sinusoidal modulation of horizontal target velocity.
# v.x is lerped toward `base_speed_x + WIND_DIR.x * gust * strength` so
# tumbleweeds visibly accelerate during gusts and lull during dead spots.
const TUMBLEWEED_GUST_STRENGTH: float = 4.5
const TUMBLEWEED_GUST_FREQ_MIN: float = 0.25
const TUMBLEWEED_GUST_FREQ_MAX: float = 0.75
# How fast v.x converges toward the gust target (1 / characteristic time).
const TUMBLEWEED_GUST_LERP_RATE: float = 1.6
# Bumps: timed kicks (boost v.y + perturb v.z) — like hitting a hidden rock.
const TUMBLEWEED_BUMP_INTERVAL_MIN: float = 2.5
const TUMBLEWEED_BUMP_INTERVAL_MAX: float = 7.0
const TUMBLEWEED_BUMP_VY_MIN: float = 2.5
const TUMBLEWEED_BUMP_VY_MAX: float = 7.0
const TUMBLEWEED_BUMP_VZ_RANGE: float = 3.5
# Thermals: small probability per second of catching a strong updraft.
const TUMBLEWEED_THERMAL_CHANCE_PER_SEC: float = 0.04
const TUMBLEWEED_THERMAL_VY_MIN: float = 6.0
const TUMBLEWEED_THERMAL_VY_MAX: float = 12.0
# Mass: scales gravity per-tumbleweed. Heavier ones fall slower (visual
# variety — feels like different weights of dried plant matter).
const TUMBLEWEED_MASS_MIN: float = 0.7
const TUMBLEWEED_MASS_MAX: float = 1.5

# Wind dust particle cloud. A single MultiMesh of billboarded quads with
# all motion + lifecycle handled in `wind_particles.gdshader`. Each particle
# has its own randomized lifetime period + phase, born at its seed XZ on the
# ground, drifting along WIND_DIR, billowing up + growing in size, and
# fading in/out via a bell curve. `cloud_origin` is updated each frame to
# follow the player so the cloud always surrounds them.
const WIND_PARTICLE_COUNT: int = 1500
const WIND_PARTICLE_TILE_SIZE: float = 90.0
const WIND_PARTICLE_SPEED: float = 5.0
const WIND_PARTICLE_LIFETIME_MIN: float = 4.0
const WIND_PARTICLE_LIFETIME_MAX: float = 9.0
const WIND_PARTICLE_SIZE_START: float = 0.6
const WIND_PARTICLE_SIZE_END: float = 4.5
# Per-particle size multiplier — applied independently to X and Y so puffs
# squash, stretch, and vary in apparent volume aggressively. Range is wide:
# tiny wisps sit next to fat billowing balls.
const WIND_PARTICLE_SIZE_JITTER_MIN: float = 0.3
const WIND_PARTICLE_SIZE_JITTER_MAX: float = 3.0
const WIND_PARTICLE_RISE_HEIGHT: float = 6.0
const WIND_PARTICLE_TURB_STRENGTH: float = 0.9
const WIND_PARTICLE_FADE_BAND: float = 16.0
const WIND_PARTICLE_COLOR: Color = Color(1.0, 0.88, 0.66, 0.275)

# Central platform: spawn anchor + metal-plating splat + cactus/rock occlusion.
# Same pattern as Demo 5, but the prefab variant swaps the GLB's authored
# diffuse for `platform_0_desert_test.png` — see `platform_desert.tscn` /
# `platform_desert.gd`.
const PlatformDesertScene: PackedScene = preload("res://assets/prefabs/platform_desert.tscn")
const PLATFORM_METAL_TEX: Texture2D = preload("res://assets/biomes/test/city_metal_plate_2.jpg")
const PLATFORM_METAL_WORLD_PER_TILE: float = 4.0
const PLATFORM_SCALE: float = 0.75
const PLATFORM_SINK_RATIO: float = 0.15
# Margin past the platform's visible edge before the metal splat starts
# breaking up — keeps the deck under the platform fully solid even with
# bilinear texel filtering.
const R_PLATFORM_MARGIN: float = 1.0
# Width of the noisy falloff band where metal dissolves into the ground.
const R_BREAKUP_BAND: float = 6.0
# Cactus/rock exclusion radius around the platform — nothing larger than a
# pebble is allowed inside this radius so the central plaza reads as
# deliberately cleared.
const R_OCCLUDE: float = 30.0

# Tall cacti: scattered widely via jittered grid across all dirt-rocks splats.
# Tall is the only family that uses this path — shorts are cluster-exclusive —
# so every tall cactus in the world is a "big" silhouette by construction.
const CACTUS_GRID_CELL: float = 11.0
const CACTUS_JITTER: float = 2.4
const CACTUS_MIN_DIST: float = 6.0
const CACTUS_BIG_SCALE_MIN: float = 2.0
const CACTUS_BIG_SCALE_MAX: float = 3.0

# Short-cactus clusters: independent anchors per chunk, each producing three
# concentric tiers — a few "relatively bigger" cacti at the centre, ringed by
# medium ones, ringed by many small ones. Anchors are unrelated to the tall
# cactus grid; clusters can sit between or under tall cacti.
#
# cactus_short's mesh AABB has a Y range of ~0.66 m. Inner tier now caps at
# scale 2.5 (~1.65 m, ~92% capsule height); middle at 1.7 (~1.12 m); outer
# at 1.1 (~0.73 m). Counts are roughly 50% higher than the previous tuning,
# ring radii are pulled in (~2.0 m total vs prior 2.5 m / earlier 5.5 m),
# and the rings deliberately overlap so a single cluster mixes tier sizes
# instead of separating into clean bands. SHORT_CACTUS_AVOID_RADIUS_MULT is
# halved and CACTUS_PLACEMENT_ATTEMPTS doubled to keep the dense rings
# from rejecting too many candidates as the bigger cacti pack closer.
const CACTUS_CLUSTERS_PER_CHUNK_MIN: int = 2
const CACTUS_CLUSTERS_PER_CHUNK_MAX: int = 4
const CACTUS_CLUSTER_ANCHOR_MARGIN: float = 7.0
const CACTUS_PLACEMENT_ATTEMPTS: int = 16
# Inner tier — a few "relatively bigger" cacti at the cluster centre.
const CACTUS_INNER_COUNT_MIN: int = 3
const CACTUS_INNER_COUNT_MAX: int = 6
const CACTUS_INNER_RING_R_INNER: float = 0.0
const CACTUS_INNER_RING_R_OUTER: float = 0.6
const CACTUS_INNER_SCALE_MIN: float = 1.5
const CACTUS_INNER_SCALE_MAX: float = 2.5
# Middle tier — medium cacti ringing the inner cluster (overlaps inner).
const CACTUS_MIDDLE_COUNT_MIN: int = 8
const CACTUS_MIDDLE_COUNT_MAX: int = 14
const CACTUS_MIDDLE_RING_R_INNER: float = 0.3
const CACTUS_MIDDLE_RING_R_OUTER: float = 1.2
const CACTUS_MIDDLE_SCALE_MIN: float = 0.8
const CACTUS_MIDDLE_SCALE_MAX: float = 1.7
# Outer tier — many small cacti spattered around the edge (overlaps middle).
const CACTUS_OUTER_COUNT_MIN: int = 16
const CACTUS_OUTER_COUNT_MAX: int = 28
const CACTUS_OUTER_RING_R_INNER: float = 0.9
const CACTUS_OUTER_RING_R_OUTER: float = 2.0
const CACTUS_OUTER_SCALE_MIN: float = 0.5
const CACTUS_OUTER_SCALE_MAX: float = 1.1
# Sub-threshold cacti (smallest outer ones) skip colliders — player walks
# through them as ground clutter.
const CACTUS_COLLIDER_MIN_SCALE: float = 1.1
const CACTUS_COLLIDER_RADIUS: float = 0.3
const CACTUS_COLLIDER_HEIGHT: float = 1.6
const CACTUS_SHADOW_SIZE_MULT: float = 1.4

# Spawn breathing room — every collision-bearing prop (and small cacti for
# visual clearance) is added to a per-chunk avoid list. Each candidate is
# rejected if its avoid radius (`scale * AVOID_RADIUS_MULT + BUFFER`)
# overlaps any existing entry's. Cacti and rocks share the same list so
# rocks won't sit inside cactus footprints and vice versa.
#
# Tall cacti get a wider radius mult than shorts because their mesh footprint
# is genuinely wider; the lower SHORT mult also lets cluster cacti pack
# tightly so the rings actually read as "tightly clumped".
const PROP_BREATHING_BUFFER: float = 0.4
const TALL_CACTUS_AVOID_RADIUS_MULT: float = 0.45
const SHORT_CACTUS_AVOID_RADIUS_MULT: float = 0.12
const ROCK_AVOID_RADIUS_MULT: float = 0.5

# Rock cluster widening (vs Demo 5): user explicitly asked for "extremely
# random rotation and size and scattering patterns".
const ROCK_CLUSTERS_PER_CHUNK_MIN: int = 2
const ROCK_CLUSTERS_PER_CHUNK_MAX: int = 6
const ROCK_CLUSTER_ANCHOR_MARGIN: float = 3.0
const ROCK_LARGE_COUNT_MIN: int = 1
const ROCK_LARGE_COUNT_MAX: int = 3
const ROCK_LARGE_RING_R_INNER: float = 0.0
const ROCK_LARGE_RING_R_OUTER: float = 1.6
const ROCK_LARGE_SCALE_MIN: float = 1.5
const ROCK_LARGE_SCALE_MAX: float = 3.5
const ROCK_MED_COUNT_MIN: int = 4
const ROCK_MED_COUNT_MAX: int = 8
const ROCK_MED_RING_R_INNER: float = 1.7
const ROCK_MED_RING_R_OUTER: float = 3.4
const ROCK_MED_SCALE_MIN: float = 0.7
const ROCK_MED_SCALE_MAX: float = 1.6
const ROCK_SMALL_COUNT_MIN: int = 8
const ROCK_SMALL_COUNT_MAX: int = 16
const ROCK_SMALL_RING_R_INNER: float = 3.4
const ROCK_SMALL_RING_R_OUTER: float = 5.8
const ROCK_SMALL_SCALE_MIN: float = 0.2
const ROCK_SMALL_SCALE_MAX: float = 0.8
# Random tilt off vertical, in radians — rocks wobble far more than Demo 5
# (0.25 → 0.5) to honour "extremely random" rotation.
const ROCK_TILT_MAX: float = 0.5
const ROCK_PLACEMENT_ATTEMPTS: int = 8
const ROCK_COLLIDER_MIN_SCALE: float = 0.9
const ROCK_COLLIDER_RADIUS_MULT: float = 0.35
const ROCK_COLLIDER_HEIGHT_MULT: float = 0.45
const ROCK_SHADOW_SIZE_MULT: float = 2.6

const BLOB_SHADOW_Y: float = 0.05
const TERRAIN_VERTS_PER_SIDE: int = 33
const GROUND_UV_TILES_PER_CHUNK: float = 10.0

const DEBUG_LOG_VEGETATION: bool = false


var _biome_config: BiomeConfig
var _ground_material: ShaderMaterial
var _blob_shadow_material: ShaderMaterial
var _blob_shadow_mesh: PlaneMesh
var _terrain_base_mesh: ArrayMesh

var _viewport: SubViewport
var _texture_rect: TextureRect
var _camera: Camera3D
var _camera_yaw_rad: float = 0.0
var _player: CharacterBody3D
var _chunk_container: Node3D

# key: Vector2i -> chunk state dict
var _chunks_state: Dictionary = {}
# key: Vector2i -> { task_id, job }
var _pending_bakes: Dictionary = {}

# Central platform state.
var _platform_root: Node3D = null
var _platform_center_xz: Vector2 = Vector2.ZERO
# Optional second metal-splat curtain anchor (e.g. a building). Vector2.INF
# disables it. Subclasses set these BEFORE super.on_enter() so the chunk-bake
# job lambda captures them on the first chunk request.
var _extra_curtain_xz: Vector2 = Vector2.INF
var _extra_curtain_footprint_r: float = 0.0
# Cactus / rock exclusion radius around the extra curtain anchor — keeps the
# concrete-curtain plaza around a structure clear of vegetation, mirroring
# R_OCCLUDE around the platform. 0.0 disables.
var _extra_clearing_radius: float = 0.0
# World-space horizontal radius of the (scaled) platform mesh. Drives both
# the metal splat's solid-core radius and the cactus/rock exclusion ring.
var _platform_footprint_r: float = 0.0

# Tumbleweed pool. Each entry is a dict with `node`, `velocity`, `scale`,
# `spin_axis`, `spin_rate`. Updated each frame in `_update_tumbleweeds`.
var _tumbleweed_root: Node3D = null
var _tumbleweeds: Array = []
var _tumbleweed_rng: RandomNumberGenerator = null
# Self-tracked delta for the tumbleweed integrator. Driven from
# `Time.get_ticks_usec()` rather than `_player.get_process_delta_time()`
# because the latter is keyed to the player's `_process` (which doesn't
# exist — terrain_player only implements `_physics_process`) and was
# returning 0, freezing all tumbleweed motion.
var _tumbleweed_last_usec: int = -1

# Wind dust cloud — single MultiMesh with vertex-shader-driven motion.
var _wind_particles_mmi: MultiMeshInstance3D = null
var _wind_particles_material: ShaderMaterial = null


# Holder for a per-chunk async bake. Worker thread writes `img` + `metal_img`;
# main thread reads them once `WorkerThreadPool.is_task_completed` returns true.
class BakeJob extends RefCounted:
	var img: Image = null
	var metal_img: Image = null
	var origin_x: float = 0.0
	var origin_z: float = 0.0


var _hud_label: Label
var _last_log_chunk: Vector2i = Vector2i(0, 0)
var _last_log_cacti: int = 0
var _last_log_rocks: int = 0

var _raster_mat: ShaderMaterial
var _palette_lut: ImageTexture3D = null
var _block_w: int = 1
var _block_h: int = 1
var _full_w: int = 1
var _full_h: int = 1


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	_camera_yaw_rad = 0.0
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
	if _player:
		# Self-tracked dt — see `_tumbleweed_last_usec` declaration for why
		# we don't use the player's process delta here.
		var now_usec: int = Time.get_ticks_usec()
		var dt: float = 1.0 / 60.0
		if _tumbleweed_last_usec >= 0:
			dt = clampf(float(now_usec - _tumbleweed_last_usec) / 1_000_000.0, 0.0, 0.1)
		_tumbleweed_last_usec = now_usec
		_update_tumbleweeds(dt)
		# Move the wind-dust cloud's centre to the player so the volume
		# always surrounds them. Shader handles wrap + scroll on its own.
		if _wind_particles_material != null:
			_wind_particles_material.set_shader_parameter("cloud_origin",
				_player.global_position)
	if _player and _hud_label:
		var px: float = _player.global_position.x
		var pz: float = _player.global_position.z
		var cx: int = int(floor(px / CHUNK_SIZE))
		var cz: int = int(floor(pz / CHUNK_SIZE))
		var fps: int = int(Engine.get_frames_per_second())
		_hud_label.text = "FPS %d  Chunk (%d,%d)  %d chunks  [ESC] Back\nLast chunk (%d,%d): cacti=%d rocks=%d" % [
			fps, cx, cz, _chunks_state.size(),
			_last_log_chunk.x, _last_log_chunk.y,
			_last_log_cacti, _last_log_rocks]


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
	scene.name = "DesertScene"
	_viewport.add_child(scene)

	var world_env := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#2a2018")
	# Cactus + desert_rock prefabs are PBR (StandardMaterial3D) — they need
	# both ambient and a directional light to read correctly.
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.7, 0.62, 0.5)
	env.ambient_light_energy = 1.0
	world_env.environment = env
	scene.add_child(world_env)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-50.0, -30.0, 0.0)
	sun.light_energy = 1.4
	scene.add_child(sun)

	_blob_shadow_material = ShaderMaterial.new()
	_blob_shadow_material.shader = BlobShadowShader
	_blob_shadow_material.set_shader_parameter("color", Color(0.0, 0.0, 0.0, 0.55))
	_blob_shadow_mesh = PlaneMesh.new()
	_blob_shadow_mesh.size = Vector2.ONE

	_biome_config = BiomeConfigDefault.duplicate() as BiomeConfig
	_ground_material = ShaderMaterial.new()
	_ground_material.shader = TerrainSplatShader
	_ground_material.set_shader_parameter("meadow_tex", GROUND_SAND_TEX)
	_ground_material.set_shader_parameter("forest_tex", GROUND_DIRT_TEX)
	_ground_material.set_shader_parameter("meadow_world_per_tile", GROUND_WORLD_PER_TILE)
	_ground_material.set_shader_parameter("forest_world_per_tile", GROUND_WORLD_PER_TILE)
	_ground_material.set_shader_parameter("noise_threshold", _biome_config.meadow_threshold)
	_ground_material.set_shader_parameter("noise_softness", _biome_config.meadow_softness)
	# Path overlay is unused. `path_strength = 0` makes the overlay a no-op;
	# `path_tex` still has to bind a sampler, so we reuse the dirt texture.
	_ground_material.set_shader_parameter("path_tex", GROUND_DIRT_TEX)
	_ground_material.set_shader_parameter("path_world_per_tile", GROUND_WORLD_PER_TILE)
	_ground_material.set_shader_parameter("zone_size_m", 1.0)
	_ground_material.set_shader_parameter("corridor_lateral_half", 0.0)
	_ground_material.set_shader_parameter("corridor_lateral_softness", 1.0)
	_ground_material.set_shader_parameter("path_edge_full_m", 1.0)
	_ground_material.set_shader_parameter("path_fade_end_m", 1.0)
	_ground_material.set_shader_parameter("path_pepper_freq", 1.0)
	_ground_material.set_shader_parameter("path_pepper_threshold", 0.5)
	_ground_material.set_shader_parameter("path_pepper_softness", 0.05)
	_ground_material.set_shader_parameter("path_strength", 0.0)
	# Metal layer: `metal_albedo_tex` is the city-plate texture that paints
	# the ground around the central platform; `metal_weight_tex` is baked
	# per-chunk in `_bake_chunk_metal_image` and bound in `_finish_chunk_load`.
	# Chunks far from the platform get a solid-black weight image (early-
	# rejected at bake time) so the layer reads as a no-op out there.
	_ground_material.set_shader_parameter("metal_albedo_tex", PLATFORM_METAL_TEX)
	_ground_material.set_shader_parameter("metal_world_per_tile", PLATFORM_METAL_WORLD_PER_TILE)

	_terrain_base_mesh = _build_terrain_local_mesh()

	_chunk_container = Node3D.new()
	_chunk_container.name = "Chunks"
	scene.add_child(_chunk_container)

	_player = CharacterBody3D.new()
	_player.name = "Player"
	_player.set_script(preload("res://terrain/terrain_player.gd"))
	# Layer setup for tumbleweed collision filtering:
	#   layer 1 = world statics (platform, cacti, rocks)
	#   layer 2 = player
	#   layer 3 = tumbleweeds
	# Player on layer 2 only, mask = layer 1 (sees statics). Tumbleweeds use
	# mask = layer 1 too, so they hit statics but not the player (layer 2)
	# and not each other (layer 3).
	_player.collision_layer = 2
	_player.collision_mask = 1
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.4; cap.height = 1.8
	col.shape = cap
	_player.add_child(col)
	scene.add_child(_player)
	# Spawn the desert platform at world origin first so we can drop the
	# player on top. The platform owns its own concave-mesh collider so the
	# player is held up by `is_on_floor()` after gravity does its job.
	_platform_center_xz = Vector2(0.0, 0.0)
	var platform_top_y: float = _spawn_platform(scene, _platform_center_xz)
	_player.position = Vector3(_platform_center_xz.x,
		platform_top_y + 1.0, _platform_center_xz.y)
	_player.enable_xray_outline()
	_player.tween_frames = false

	# Tumbleweed pool. Sibling of the chunk container so unloaded chunks don't
	# take tumbleweeds with them.
	_tumbleweed_root = Node3D.new()
	_tumbleweed_root.name = "Tumbleweeds"
	scene.add_child(_tumbleweed_root)
	_tumbleweed_rng = RandomNumberGenerator.new()
	_tumbleweed_rng.randomize()
	for i in TUMBLEWEED_COUNT:
		_spawn_tumbleweed(true)

	# Wind dust cloud — single MultiMesh, all motion shader-side.
	_build_wind_particles(scene)

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


func _cleanup() -> void:
	# Drain in-flight worker bakes before tearing down so they don't try
	# to write into BakeJobs whose owning screen is going away.
	for entry: Dictionary in _pending_bakes.values():
		WorkerThreadPool.wait_for_task_completion(entry.task_id)
	_pending_bakes.clear()
	for state: Dictionary in _chunks_state.values():
		if state.node != null:
			state.node.queue_free()
	_chunks_state.clear()
	if _hud_label: _hud_label.queue_free(); _hud_label = null
	if _tumbleweed_root: _tumbleweed_root.queue_free(); _tumbleweed_root = null
	_tumbleweeds.clear()
	_tumbleweed_rng = null
	_tumbleweed_last_usec = -1
	if _wind_particles_mmi: _wind_particles_mmi.queue_free(); _wind_particles_mmi = null
	_wind_particles_material = null
	if _platform_root: _platform_root.queue_free(); _platform_root = null
	_platform_footprint_r = 0.0
	if _texture_rect: _texture_rect.queue_free(); _texture_rect = null
	if _viewport: _viewport.queue_free(); _viewport = null
	_player = null; _camera = null; _chunk_container = null
	_biome_config = null
	_ground_material = null
	_raster_mat = null
	_blob_shadow_material = null
	_blob_shadow_mesh = null
	_terrain_base_mesh = null


# ── Mesh + MMI helpers ─────────────────────────────

# Shared terrain tile: flat quad (33×33 vertex grid) with local XZ in
# [0, CHUNK_SIZE] and UV 0..1 across the chunk. Used by every chunk's ground
# MMI; the per-chunk ground material handles the splat blend at fragment time.
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


func _make_ground_mmi(mat: ShaderMaterial, origin_x: float, origin_z: float) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = false
	mm.mesh = _terrain_base_mesh
	mm.instance_count = 1
	mm.set_instance_transform(0, Transform3D(Basis.IDENTITY, Vector3(origin_x, 0.0, origin_z)))
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "GroundMM"
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi


# Shadow MMI: per-instance scaled unit quads, one draw call regardless of
# count. Cactus and rock visuals are per-instance Node3D (their PBR materials
# don't fit cleanly into MultiMesh), but their shadows still batch here.
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

	# Phase 1: harvest completed bakes.
	var finalised: Array[Vector2i] = []
	for key: Vector2i in _pending_bakes:
		var entry: Dictionary = _pending_bakes[key]
		if WorkerThreadPool.is_task_completed(entry.task_id):
			WorkerThreadPool.wait_for_task_completion(entry.task_id)
			finalised.append(key)
			if desired.has(key) and entry.job.img != null:
				_finish_chunk_load(key, entry.job.img, entry.job.metal_img)
	for key in finalised:
		_pending_bakes.erase(key)

	# Phase 2: kick off bakes for newly-desired chunks.
	for key: Vector2i in desired:
		if not _chunks_state.has(key) and not _pending_bakes.has(key):
			_start_chunk_bake(key)

	# Phase 3: unload chunks the player walked away from.
	var stale: Array[Vector2i] = []
	for key: Vector2i in _chunks_state:
		if not desired.has(key):
			stale.append(key)
	for key in stale:
		var state: Dictionary = _chunks_state[key]
		if state.node != null:
			state.node.queue_free()
		_chunks_state.erase(key)


func _start_chunk_bake(key: Vector2i) -> void:
	var job := BakeJob.new()
	job.origin_x = float(key.x) * CHUNK_SIZE
	job.origin_z = float(key.y) * CHUNK_SIZE
	# Capture mutable state as locals so the lambda runs on the worker
	# thread without reading `self` (thread-safety).
	var biome_config: BiomeConfig = _biome_config
	var platform_xz: Vector2 = _platform_center_xz
	var footprint_r: float = _platform_footprint_r + R_PLATFORM_MARGIN
	var extra_xz: Vector2 = _extra_curtain_xz
	var extra_footprint_r: float = _extra_curtain_footprint_r
	var task_id: int = WorkerThreadPool.add_task(
		func() -> void:
			job.img = BiomeField.bake_chunk_density_image(
				job.origin_x, job.origin_z, CHUNK_SIZE, BIOME_GRID_N, biome_config)
			job.metal_img = _bake_chunk_metal_image(
				job.origin_x, job.origin_z, platform_xz,
				footprint_r, R_BREAKUP_BAND, BIOME_GRID_N,
				extra_xz, extra_footprint_r),
		false,
		"desert-biome-test chunk bake (%d, %d)" % [key.x, key.y]
	)
	_pending_bakes[key] = { "task_id": task_id, "job": job }


func _finish_chunk_load(key: Vector2i, density_img: Image, metal_img: Image) -> void:
	var chunk := Node3D.new()
	chunk.name = "chunk_%d_%d" % [key.x, key.y]
	_chunk_container.add_child(chunk)

	var origin_x: float = float(key.x) * CHUNK_SIZE
	var origin_z: float = float(key.y) * CHUNK_SIZE

	var step: float = CHUNK_SIZE / float(BIOME_GRID_N)
	var splat_tex := ImageTexture.create_from_image(density_img)
	var ground_mat: ShaderMaterial = _ground_material.duplicate()
	ground_mat.set_shader_parameter("splat_tex", splat_tex)
	ground_mat.set_shader_parameter("bake_origin", Vector2(origin_x - step, origin_z - step))
	ground_mat.set_shader_parameter("texture_world_size", float(BAKE_GRID_N) * step)
	if metal_img != null:
		var metal_tex := ImageTexture.create_from_image(metal_img)
		ground_mat.set_shader_parameter("metal_weight_tex", metal_tex)

	var mm_ground := _make_ground_mmi(ground_mat, origin_x, origin_z)
	chunk.add_child(mm_ground)

	var rng := RandomNumberGenerator.new()
	rng.seed = key.x * 100003 + key.y
	var cactus_positions: Array[Dictionary] = []
	var rock_positions: Array[Dictionary] = []
	_collect_desert_props(rng, key, density_img, cactus_positions, rock_positions)

	var cactus_count: int = cactus_positions.size()
	var rock_count: int = rock_positions.size()

	var mm_cactus_shadow := _make_shadow_mmi(_blob_shadow_material, cactus_count)
	var mm_rock_shadow := _make_shadow_mmi(_blob_shadow_material, rock_count)
	chunk.add_child(mm_cactus_shadow)
	chunk.add_child(mm_rock_shadow)

	for i in cactus_count:
		var c: Dictionary = cactus_positions[i]
		var inst: Node = (c.scene as PackedScene).instantiate()
		if inst is Node3D:
			(inst as Node3D).transform = c.xform
		chunk.add_child(inst)
		mm_cactus_shadow.multimesh.set_instance_transform(i, _shadow_xform(
			c.xz, c.scale * CACTUS_SHADOW_SIZE_MULT))
		if c.has_collider:
			_spawn_cactus_collider(chunk, Vector3(c.xz.x, 0.0, c.xz.y), c.scale)

	for i in rock_count:
		var r: Dictionary = rock_positions[i]
		var inst: Node = DesertRockScene.instantiate()
		if inst is Node3D:
			(inst as Node3D).transform = r.xform
		chunk.add_child(inst)
		mm_rock_shadow.multimesh.set_instance_transform(i, _shadow_xform(
			r.xz, r.scale * ROCK_SHADOW_SIZE_MULT))
		if r.has_collider:
			_spawn_rock_collider(chunk, Vector3(r.xz.x, 0.0, r.xz.y), r.scale)

	_chunks_state[key] = {
		"node": chunk,
		"mm_ground": mm_ground,
		"density_img": density_img,
	}

	_last_log_chunk = key
	_last_log_cacti = cactus_count
	_last_log_rocks = rock_count
	if DEBUG_LOG_VEGETATION:
		print("[desert] chunk=(%d,%d) cacti=%d rocks=%d"
			% [key.x, key.y, cactus_count, rock_count])


# ── Biome classifier ───────────────────────────────

# CPU side of the proxy splat: bilinear-sample the same baked density Image
# the GPU shader reads, then run the same threshold check. CPU and GPU read
# identical bytes → no drift between the visible boundary and prop placement.
func _is_meadow_at(img: Image, origin_x: float, origin_z: float,
		wx: float, wz: float) -> bool:
	var density: float = BiomeField.sample_density_image_bilinear(
		img, wx - origin_x, wz - origin_z, CHUNK_SIZE, BIOME_GRID_N)
	return BiomeField.is_meadow(density, _biome_config)


# ── Position generation ────────────────────────────

# Single pass that fills cactus + rock position arrays. Cacti go on the
# dirt-rocks side (NOT meadow, since the meadow_tex slot holds sand pockets).
# Rocks anchor in sand pockets (IS meadow).
func _collect_desert_props(rng: RandomNumberGenerator, key: Vector2i,
		density_img: Image, cactus_out: Array[Dictionary],
		rock_out: Array[Dictionary]) -> void:
	var chunk_ox: float = float(key.x) * CHUNK_SIZE
	var chunk_oz: float = float(key.y) * CHUNK_SIZE
	var margin: float = 2.0
	var scatter_ox: float = chunk_ox + margin
	var scatter_oz: float = chunk_oz + margin
	var span: float = CHUNK_SIZE - margin * 2.0

	# Shared per-chunk avoid list. Every prop with a footprint (cacti at all
	# tiers + rocks at all tiers) appends to it on accept and tests against
	# it on candidate. Tiny cacti participate even though they don't get a
	# physics collider — visual breathing room matters too. Format:
	# `{x: float, z: float, r: float}`.
	var avoid: Array[Dictionary] = []

	# ── Tall cacti (jittered grid, dirt-rocks only) ──
	# Wide scatter across the chunk so every dirt-rocks splat carries some big
	# silhouettes. Tall is the only family used here — short cacti are
	# cluster-only — and the scale floor of CACTUS_BIG_SCALE_MIN guarantees
	# nothing small sneaks in.
	var cells: int = int(ceil(span / CACTUS_GRID_CELL))
	for gi in range(cells):
		for gj in range(cells):
			var base_x: float = scatter_ox + (float(gi) + 0.5) * CACTUS_GRID_CELL
			var base_z: float = scatter_oz + (float(gj) + 0.5) * CACTUS_GRID_CELL
			var wx: float = base_x + (rng.randf() - 0.5) * CACTUS_JITTER * 2.0
			var wz: float = base_z + (rng.randf() - 0.5) * CACTUS_JITTER * 2.0
			# Cactus rule: dirt-rocks only.
			if _is_meadow_at(density_img, chunk_ox, chunk_oz, wx, wz):
				continue
			if _near_platform_exclusion(wx, wz):
				continue
			# Per-cell min-distance check against other tall cacti (preserves
			# the old grid spacing) — handled by the avoid list since every
			# cactus pushed onto it has a TALL_CACTUS_AVOID radius.
			var sc: float = lerp(CACTUS_BIG_SCALE_MIN, CACTUS_BIG_SCALE_MAX,
				rng.randf())
			var self_r: float = sc * TALL_CACTUS_AVOID_RADIUS_MULT + PROP_BREATHING_BUFFER
			# Also enforce the legacy CACTUS_MIN_DIST as a hard floor so the
			# wide-canopy spacing reads as before.
			if not _prop_pos_clear(wx, wz, maxf(self_r, CACTUS_MIN_DIST * 0.5),
					avoid):
				continue
			var ry: float = rng.randf() * TAU
			var scene: PackedScene = TallCactusScenes[
				rng.randi_range(0, TallCactusScenes.size() - 1)]
			var xform := _make_world_xform(Vector2(wx, wz), sc, ry)
			cactus_out.append({
				"xz": Vector2(wx, wz),
				"scale": sc,
				"xform": xform,
				"scene": scene,
				"has_collider": sc >= CACTUS_COLLIDER_MIN_SCALE,
			})
			avoid.append({"x": wx, "z": wz, "r": self_r})

	# ── Short-cactus clusters (independent anchors, dirt-rocks only) ──
	# Each anchor produces three concentric rings: a few "relatively bigger"
	# inner cacti, ringed by medium ones, ringed by many small ones. Anchors
	# are unrelated to the tall cactus grid; clusters can sit between or
	# under tall cacti.
	var cactus_anchor_margin: float = CACTUS_CLUSTER_ANCHOR_MARGIN
	var cactus_anchor_span: float = CHUNK_SIZE - cactus_anchor_margin * 2.0
	var cactus_cluster_count: int = rng.randi_range(
		CACTUS_CLUSTERS_PER_CHUNK_MIN, CACTUS_CLUSTERS_PER_CHUNK_MAX)
	for _c in cactus_cluster_count:
		var ax: float = 0.0
		var az: float = 0.0
		var anchor_ok: bool = false
		for _try in CACTUS_PLACEMENT_ATTEMPTS:
			ax = chunk_ox + cactus_anchor_margin + rng.randf() * cactus_anchor_span
			az = chunk_oz + cactus_anchor_margin + rng.randf() * cactus_anchor_span
			if _is_meadow_at(density_img, chunk_ox, chunk_oz, ax, az):
				continue
			if _near_platform_exclusion(ax, az):
				continue
			anchor_ok = true
			break
		if not anchor_ok:
			continue

		_append_cactus_ring(rng, ax, az,
			CACTUS_INNER_COUNT_MIN, CACTUS_INNER_COUNT_MAX,
			CACTUS_INNER_RING_R_INNER, CACTUS_INNER_RING_R_OUTER,
			CACTUS_INNER_SCALE_MIN, CACTUS_INNER_SCALE_MAX,
			density_img, chunk_ox, chunk_oz, cactus_out, avoid)
		_append_cactus_ring(rng, ax, az,
			CACTUS_MIDDLE_COUNT_MIN, CACTUS_MIDDLE_COUNT_MAX,
			CACTUS_MIDDLE_RING_R_INNER, CACTUS_MIDDLE_RING_R_OUTER,
			CACTUS_MIDDLE_SCALE_MIN, CACTUS_MIDDLE_SCALE_MAX,
			density_img, chunk_ox, chunk_oz, cactus_out, avoid)
		_append_cactus_ring(rng, ax, az,
			CACTUS_OUTER_COUNT_MIN, CACTUS_OUTER_COUNT_MAX,
			CACTUS_OUTER_RING_R_INNER, CACTUS_OUTER_RING_R_OUTER,
			CACTUS_OUTER_SCALE_MIN, CACTUS_OUTER_SCALE_MAX,
			density_img, chunk_ox, chunk_oz, cactus_out, avoid)

	# ── Rock cluster anchors (sand pockets only) ──
	# Three concentric tiers per anchor. Avoid list is shared with cacti so
	# rocks don't bury themselves in cactus footprints (and vice versa) at
	# the sand/dirt boundary.
	var anchor_margin: float = ROCK_CLUSTER_ANCHOR_MARGIN
	var anchor_span: float = CHUNK_SIZE - anchor_margin * 2.0
	var cluster_count: int = rng.randi_range(
		ROCK_CLUSTERS_PER_CHUNK_MIN, ROCK_CLUSTERS_PER_CHUNK_MAX)
	for _c in cluster_count:
		var cx: float = 0.0
		var cz: float = 0.0
		var anchor_ok: bool = false
		for _try in ROCK_PLACEMENT_ATTEMPTS:
			cx = chunk_ox + anchor_margin + rng.randf() * anchor_span
			cz = chunk_oz + anchor_margin + rng.randf() * anchor_span
			# Rock rule: sand only.
			if not _is_meadow_at(density_img, chunk_ox, chunk_oz, cx, cz):
				continue
			if _near_platform_exclusion(cx, cz):
				continue
			anchor_ok = true
			break
		if not anchor_ok:
			continue

		_append_rock_ring(rng, cx, cz,
			ROCK_LARGE_COUNT_MIN, ROCK_LARGE_COUNT_MAX,
			ROCK_LARGE_RING_R_INNER, ROCK_LARGE_RING_R_OUTER,
			ROCK_LARGE_SCALE_MIN, ROCK_LARGE_SCALE_MAX,
			density_img, chunk_ox, chunk_oz, rock_out, avoid)
		_append_rock_ring(rng, cx, cz,
			ROCK_MED_COUNT_MIN, ROCK_MED_COUNT_MAX,
			ROCK_MED_RING_R_INNER, ROCK_MED_RING_R_OUTER,
			ROCK_MED_SCALE_MIN, ROCK_MED_SCALE_MAX,
			density_img, chunk_ox, chunk_oz, rock_out, avoid)
		_append_rock_ring(rng, cx, cz,
			ROCK_SMALL_COUNT_MIN, ROCK_SMALL_COUNT_MAX,
			ROCK_SMALL_RING_R_INNER, ROCK_SMALL_RING_R_OUTER,
			ROCK_SMALL_SCALE_MIN, ROCK_SMALL_SCALE_MAX,
			density_img, chunk_ox, chunk_oz, rock_out, avoid)


# Reject sampler: returns true if (wx, wz) is at least `self_r + e.r` from
# every entry. Mirrors Demo 5's `_rock_pos_clear`. Linear scan — chunks have
# at most a few hundred props so this is cheap.
static func _prop_pos_clear(wx: float, wz: float, self_r: float,
		avoid: Array[Dictionary]) -> bool:
	for e: Dictionary in avoid:
		var dx: float = float(e.x) - wx
		var dz: float = float(e.z) - wz
		var min_d: float = self_r + float(e.r)
		if dx * dx + dz * dz < min_d * min_d:
			return false
	return true


# Each rock instance still respects the sand gate so the outer-tier scatter
# doesn't bleed into the dirt-rocks zones if the cluster sits near a sand/dirt
# boundary.
func _append_rock_ring(rng: RandomNumberGenerator, cx: float, cz: float,
		count_min: int, count_max: int,
		r_inner: float, r_outer: float,
		scale_min: float, scale_max: float,
		density_img: Image, chunk_ox: float, chunk_oz: float,
		rock_out: Array[Dictionary],
		avoid: Array[Dictionary]) -> void:
	var count: int = rng.randi_range(count_min, count_max)
	for _i in count:
		for _try in ROCK_PLACEMENT_ATTEMPTS:
			var theta: float = rng.randf() * TAU
			var r: float = lerp(r_inner, r_outer, sqrt(rng.randf()))
			var wx: float = cx + cos(theta) * r
			var wz: float = cz + sin(theta) * r
			if not _is_meadow_at(density_img, chunk_ox, chunk_oz, wx, wz):
				continue
			if _near_platform_exclusion(wx, wz):
				continue
			var sc: float = lerp(scale_min, scale_max, rng.randf())
			# Rocks are append-only on the avoid list — they freely clump
			# with each other (per user preference: "rocks can clump up").
			# Cacti and tumbleweeds still avoid rocks via the appended entry.
			var self_r: float = sc * ROCK_AVOID_RADIUS_MULT + PROP_BREATHING_BUFFER
			var ry: float = rng.randf() * TAU
			var tilt_x: float = (rng.randf() - 0.5) * 2.0 * ROCK_TILT_MAX
			var tilt_z: float = (rng.randf() - 0.5) * 2.0 * ROCK_TILT_MAX
			var basis := Basis.from_euler(Vector3(tilt_x, ry, tilt_z)) \
				.scaled(Vector3(sc, sc, sc))
			var xform := Transform3D(basis, Vector3(wx, 0.0, wz))
			rock_out.append({
				"xz": Vector2(wx, wz),
				"scale": sc,
				"xform": xform,
				"has_collider": sc >= ROCK_COLLIDER_MIN_SCALE,
			})
			avoid.append({"x": wx, "z": wz, "r": self_r})
			break


static func _make_world_xform(xz: Vector2, sc: float, ry: float) -> Transform3D:
	var basis := Basis.from_euler(Vector3(0.0, ry, 0.0)).scaled(Vector3(sc, sc, sc))
	return Transform3D(basis, Vector3(xz.x, 0.0, xz.y))


# Short-cactus ring placement. Picks N cactus_short instances within a ring
# around (cx, cz), each placement gated to dirt-rocks (NOT meadow) and outside
# the platform exclusion. Random Y rotation, random scale within the tier's
# range. `has_collider` is set per-cactus so the loader skips colliders for
# the smallest ones, letting the player walk through them as ground clutter.
#
# Uses SHORT_CACTUS_AVOID_RADIUS_MULT (smaller than tall) so the rings can
# pack tightly enough to read as "tightly clumped".
func _append_cactus_ring(rng: RandomNumberGenerator, cx: float, cz: float,
		count_min: int, count_max: int,
		r_inner: float, r_outer: float,
		scale_min: float, scale_max: float,
		density_img: Image, chunk_ox: float, chunk_oz: float,
		cactus_out: Array[Dictionary],
		avoid: Array[Dictionary]) -> void:
	var count: int = rng.randi_range(count_min, count_max)
	for _i in count:
		for _try in CACTUS_PLACEMENT_ATTEMPTS:
			var theta: float = rng.randf() * TAU
			# sqrt() gives uniform area distribution over the ring.
			var r: float = lerp(r_inner, r_outer, sqrt(rng.randf()))
			var wx: float = cx + cos(theta) * r
			var wz: float = cz + sin(theta) * r
			if _is_meadow_at(density_img, chunk_ox, chunk_oz, wx, wz):
				continue
			if _near_platform_exclusion(wx, wz):
				continue
			var sc: float = lerp(scale_min, scale_max, rng.randf())
			# Cacti reject overlapping anything in the avoid list — they
			# need physical breathing room from each other AND from rocks
			# at the sand/dirt boundary.
			var self_r: float = sc * SHORT_CACTUS_AVOID_RADIUS_MULT + PROP_BREATHING_BUFFER
			if not _prop_pos_clear(wx, wz, self_r, avoid):
				continue
			var ry: float = rng.randf() * TAU
			var scene: PackedScene = ShortCactusScenes[
				rng.randi_range(0, ShortCactusScenes.size() - 1)]
			var xform := _make_world_xform(Vector2(wx, wz), sc, ry)
			cactus_out.append({
				"xz": Vector2(wx, wz),
				"scale": sc,
				"xform": xform,
				"scene": scene,
				"has_collider": sc >= CACTUS_COLLIDER_MIN_SCALE,
			})
			avoid.append({"x": wx, "z": wz, "r": self_r})
			break


# ── Colliders ──────────────────────────────────────

func _spawn_cactus_collider(parent: Node3D, base_pos: Vector3, sc: float) -> void:
	var body := StaticBody3D.new()
	var col := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = CACTUS_COLLIDER_RADIUS * sc
	shape.height = CACTUS_COLLIDER_HEIGHT * sc
	col.shape = shape
	body.add_child(col)
	body.position = base_pos + Vector3(0.0, shape.height * 0.5, 0.0)
	parent.add_child(body)


func _spawn_rock_collider(parent: Node3D, rock_pos: Vector3, rock_sc: float) -> void:
	var body := StaticBody3D.new()
	var col := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = rock_sc * ROCK_COLLIDER_RADIUS_MULT
	shape.height = rock_sc * ROCK_COLLIDER_HEIGHT_MULT
	col.shape = shape
	body.add_child(col)
	body.position = rock_pos + Vector3(0.0, rock_sc * ROCK_COLLIDER_HEIGHT_MULT * 0.5, 0.0)
	parent.add_child(body)


# ── Camera ─────────────────────────────────────────

func _update_camera() -> void:
	if _camera == null or _player == null:
		return

	# Q / E orbit input via direct key polling for continuous-while-held.
	var dt: float = _player.get_process_delta_time()
	var yaw_step: float = deg_to_rad(CAM_YAW_SPEED_DEG) * dt
	if Input.is_key_pressed(KEY_Q):
		_camera_yaw_rad -= yaw_step
	if Input.is_key_pressed(KEY_E):
		_camera_yaw_rad += yaw_step
	_player.camera_yaw_rad = _camera_yaw_rad

	var pitch: float = deg_to_rad(CAM_PITCH_DEG)
	var yaw_basis := Basis(Vector3.UP, _camera_yaw_rad)
	var offset_local := Vector3(0.0, -sin(pitch), cos(pitch))
	var offset: Vector3 = yaw_basis * offset_local * CAM_DIST
	var tp: Vector3 = _player.global_position + offset

	# Snap basis aligned to the (yawed) camera frame so the dither/raster grid
	# follows the camera's view orientation.
	var right: Vector3 = yaw_basis * Vector3(1.0, 0.0, 0.0)
	var up: Vector3 = yaw_basis * Vector3(0.0, cos(pitch), sin(pitch))
	var forward: Vector3 = yaw_basis * Vector3(0.0, -sin(pitch), cos(pitch))

	var vp_h: float = float(_viewport.size.y)
	var wppx: float = (2.0 * ORTHO_SIZE) / vp_h
	var vblock_x: float = maxf(1.0, float(_block_w) * 0.5)
	var vblock_y: float = maxf(1.0, float(_block_h) * 0.5)
	var wppb_x: float = wppx * vblock_x
	var wppb_y: float = wppx * vblock_y

	# Project camera-target relative to player so the snap origin tracks the
	# player rather than world-XZ — keeps the player visually centred under
	# orbit. (Trade-off: dither shimmers slightly under fast movement.)
	var rel: Vector3 = tp - _player.global_position
	var u_r: float = rel.dot(right)
	var u_u: float = rel.dot(up)
	var u_f: float = rel.dot(forward)
	var sn_r: float = floor(u_r / wppb_x) * wppb_x
	var sn_u: float = floor(u_u / wppb_y) * wppb_y
	var frac_r: float = u_r - sn_r
	var frac_u: float = u_u - sn_u

	_camera.global_position = _player.global_position + right * sn_r + up * sn_u + forward * u_f
	_camera.basis = yaw_basis * Basis(Vector3.RIGHT, pitch)

	if _raster_mat:
		var uv_shift := Vector2(
			(frac_r / wppb_x) * (float(_block_w) / float(_full_w)),
			-(frac_u / wppb_y) * (float(_block_h) / float(_full_h))
		)
		_raster_mat.set_shader_parameter("uv_shift", uv_shift)
		_raster_mat.set_shader_parameter(
			"dither_offset", Vector2(sn_r / wppb_x, sn_u / wppb_y)
		)


# ── Platform ───────────────────────────────────────

# Spawn the desert platform with its visible centre at world (xz.x, xz.y).
# Same structural pattern as Demo 5's `_spawn_platform`:
#   _platform_root  (no scale, owns position incl. recentre offset + sink)
#   ├── visual      (scale = PLATFORM_SCALE, holds the prefab instance)
#   └── body        (no scale, ConcavePolygonShape3D from pre-scaled tris)
# The platform_desert prefab swaps the GLB's authored diffuse for the
# desert variant at _ready(); other PBR slots (metalness, normalmap) carry
# through unchanged.
# Returns the world-space top of the platform so the caller can drop the
# player on top with gravity.
func _spawn_platform(scene: Node3D, xz: Vector2) -> float:
	_platform_root = Node3D.new()
	_platform_root.name = "Platform"
	scene.add_child(_platform_root)

	var visual := Node3D.new()
	visual.name = "Visual"
	visual.scale = Vector3.ONE * PLATFORM_SCALE
	_platform_root.add_child(visual)
	visual.add_child(PlatformDesertScene.instantiate())

	# AABB in `_platform_root`'s local frame — `_gather_local_aabb` walks
	# every MeshInstance3D under `visual` and composes its transform up to
	# `_platform_root` (so `visual.scale` is included).
	var aabb: AABB = _gather_local_aabb(visual, _platform_root)
	var height: float = aabb.size.y
	var sink_y: float = height * PLATFORM_SINK_RATIO
	# Recentre offset: GLB mesh isn't centred on its origin. Shift the root
	# by the negative of the AABB centre (XZ only) so the visible centre
	# lands at `xz`.
	var aabb_centre_x: float = aabb.position.x + aabb.size.x * 0.5
	var aabb_centre_z: float = aabb.position.z + aabb.size.z * 0.5
	# Y placement: lift root so the AABB BOTTOM lands at -sink_y (platform's
	# bottom is buried `sink_y` below the terrain plane Y=0).
	var root_y: float = -aabb.position.y - sink_y
	_platform_root.position = Vector3(xz.x - aabb_centre_x, root_y, xz.y - aabb_centre_z)
	var top_y: float = _platform_root.position.y + aabb.position.y + aabb.size.y
	_platform_footprint_r = maxf(aabb.size.x, aabb.size.z) * 0.5

	# Concave mesh collider — pre-scaled triangles so the body itself stays
	# unit-scale. ConcavePolygonShape3D works for arbitrary static geometry.
	var triangles := PackedVector3Array()
	_collect_mesh_triangles(visual, _platform_root, triangles)
	if not triangles.is_empty():
		var body := StaticBody3D.new()
		body.name = "PlatformCollider"
		var col := CollisionShape3D.new()
		var shape := ConcavePolygonShape3D.new()
		shape.set_faces(triangles)
		col.shape = shape
		body.add_child(col)
		_platform_root.add_child(body)
	return top_y


# Cactus/rock dead-zone around the platform AND the optional extra clearing
# anchor (e.g. a building). Returns true if (wx, wz) falls inside either
# clearing — keeps both plazas clear of vegetation.
func _near_platform_exclusion(wx: float, wz: float) -> bool:
	var dx: float = wx - _platform_center_xz.x
	var dz: float = wz - _platform_center_xz.y
	if dx * dx + dz * dz < R_OCCLUDE * R_OCCLUDE:
		return true
	if _extra_clearing_radius > 0.0 and _extra_curtain_xz != Vector2.INF:
		var ex: float = wx - _extra_curtain_xz.x
		var ez: float = wz - _extra_curtain_xz.y
		if ex * ex + ez * ez < _extra_clearing_radius * _extra_clearing_radius:
			return true
	return false


# ── Metal splat bake ───────────────────────────────

# Per-chunk metal-plating weight image. Mirrors `BiomeField.bake_chunk_density_image`'s
# storage convention: an L8 (n+2)² image with 1-texel overhang on every side,
# sampled by both the GPU shader (`metal_weight_tex` in `terrain_splat_v2.gdshader`)
# and the CPU side at the same `bake_origin` / `texture_world_size` UV. Static
# so worker threads can run it without touching engine APIs.
#
# Weight formula — "solid core, noisy edge":
#   t = 1 - smoothstep(edge_in, edge_out, d)  (1 inside core, 0 past band)
#   w = saturate(t + (fbm(wx*0.35, wz*0.35) - 0.5) * 0.6 * window(t))
# `window(t) = 1 - |2t-1|` peaks at 0.5 in the falloff band and is zero in
# the solid core / clear-ground field, so the FBM only modulates the rim.
static func _bake_chunk_metal_image(origin_x: float, origin_z: float,
		platform_xz: Vector2, footprint_r: float, breakup_band: float,
		n: int,
		extra_xz: Vector2 = Vector2.INF,
		extra_footprint_r: float = 0.0) -> Image:
	var bake_n: int = n + 2
	var data := PackedByteArray()
	data.resize(bake_n * bake_n)
	var step: float = CHUNK_SIZE / float(n)
	var max_radius: float = footprint_r + breakup_band
	var has_extra: bool = extra_xz != Vector2.INF and extra_footprint_r > 0.0
	var extra_max_radius: float = extra_footprint_r + breakup_band
	# Chunk-level reject: skip the inner loops only if BOTH anchors are
	# guaranteed to contribute zero to every texel in this chunk.
	var clamped_x: float = clampf(platform_xz.x, origin_x, origin_x + CHUNK_SIZE)
	var clamped_z: float = clampf(platform_xz.y, origin_z, origin_z + CHUNK_SIZE)
	var ddx0: float = clamped_x - platform_xz.x
	var ddz0: float = clamped_z - platform_xz.y
	var platform_far: bool = ddx0 * ddx0 + ddz0 * ddz0 > (max_radius + step) * (max_radius + step)
	var extra_far: bool = true
	if has_extra:
		var ex: float = clampf(extra_xz.x, origin_x, origin_x + CHUNK_SIZE)
		var ez: float = clampf(extra_xz.y, origin_z, origin_z + CHUNK_SIZE)
		var ddx1: float = ex - extra_xz.x
		var ddz1: float = ez - extra_xz.y
		extra_far = ddx1 * ddx1 + ddz1 * ddz1 > (extra_max_radius + step) * (extra_max_radius + step)
	if platform_far and extra_far:
		return Image.create_from_data(bake_n, bake_n, false, Image.FORMAT_L8, data)
	var edge_in: float = footprint_r
	var edge_out: float = footprint_r + breakup_band
	var extra_edge_in: float = extra_footprint_r
	var extra_edge_out: float = extra_footprint_r + breakup_band
	for iz in bake_n:
		var wz: float = origin_z + (float(iz) - 0.5) * step
		var row: int = iz * bake_n
		for ix in bake_n:
			var wx: float = origin_x + (float(ix) - 0.5) * step
			# fbm sampled once per texel, shared between both anchors so the
			# noisy edge pattern stays continuous across the curtain field.
			var n_val: float = BiomeField.fbm(wx * 0.35, wz * 0.35)
			# Platform anchor weight.
			var ddx: float = wx - platform_xz.x
			var ddz: float = wz - platform_xz.y
			var d: float = sqrt(ddx * ddx + ddz * ddz)
			var t: float = 1.0 - smoothstep(edge_in, edge_out, d)
			var win: float = 1.0 - absf(2.0 * t - 1.0)
			var w: float = clampf(t + (n_val - 0.5) * 0.6 * win, 0.0, 1.0)
			# Extra anchor weight (max-blended with platform).
			if has_extra:
				var edx: float = wx - extra_xz.x
				var edz: float = wz - extra_xz.y
				var ed: float = sqrt(edx * edx + edz * edz)
				var et: float = 1.0 - smoothstep(extra_edge_in, extra_edge_out, ed)
				var ewin: float = 1.0 - absf(2.0 * et - 1.0)
				var ew: float = clampf(et + (n_val - 0.5) * 0.6 * ewin, 0.0, 1.0)
				w = maxf(w, ew)
			data[row + ix] = clampi(int(w * 255.0 + 0.5), 0, 255)
	return Image.create_from_data(bake_n, bake_n, false, Image.FORMAT_L8, data)


# ── AABB / triangle collection helpers ────────────

# Walk the subtree under `node` and merge every MeshInstance3D's mesh AABB
# into the space of `root`. Uses `_transform_to_root` (manual parent walk)
# instead of `global_transform` so it works before the subtree is added to
# the live scene tree.
static func _gather_local_aabb(node: Node, root: Node) -> AABB:
	var holder: Array = [AABB(), false]  # [merged_aabb, has_any]
	_walk_aabb(node, root, holder)
	return holder[0] as AABB


static func _walk_aabb(node: Node, root: Node, holder: Array) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if mi.mesh != null:
			var xform: Transform3D = _transform_to_root(mi, root)
			var transformed: AABB = xform * mi.mesh.get_aabb()
			if holder[1]:
				holder[0] = (holder[0] as AABB).merge(transformed)
			else:
				holder[0] = transformed
				holder[1] = true
	for c in node.get_children():
		_walk_aabb(c, root, holder)


# Walk the subtree under `node` and append every MeshInstance3D's triangles
# to `out`, transformed into `root`'s local space. Used to build a tight
# concave-mesh collider for the platform.
static func _collect_mesh_triangles(node: Node, root: Node,
		out: PackedVector3Array) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if mi.mesh != null:
			var xform: Transform3D = _transform_to_root(mi, root)
			var faces: PackedVector3Array = mi.mesh.get_faces()
			for v in faces:
				out.append(xform * v)
	for c in node.get_children():
		_collect_mesh_triangles(c, root, out)


# Concatenate every Node3D.transform from `node` up to (but not including)
# `root`. Works outside the scene tree where `global_transform` refuses to run.
static func _transform_to_root(node: Node, root: Node) -> Transform3D:
	var xform := Transform3D.IDENTITY
	var n: Node = node
	while n != null and n != root:
		if n is Node3D:
			xform = (n as Node3D).transform * xform
		n = n.get_parent()
	return xform


# ── Tumbleweeds ────────────────────────────────────

# Spawn one tumbleweed instance. `initial` distributes across both X sides of
# the player on first call so the world isn't empty for a few seconds; later
# spawns appear strictly upwind (east of player) so they roll into view.
func _spawn_tumbleweed(initial: bool) -> void:
	if _tumbleweed_root == null:
		return
	var sc: float = lerp(TUMBLEWEED_SCALE_MIN, TUMBLEWEED_SCALE_MAX,
		_tumbleweed_rng.randf())

	# CharacterBody3D wrapper so each tumbleweed has its own collider and
	# can use move_and_collide to bounce off world statics. Layer 3 / mask
	# layer 1 = collides with platform/cacti/rocks but ignores the player
	# (layer 2) and other tumbleweeds (layer 3).
	var body := CharacterBody3D.new()
	body.collision_layer = 4  # bit 2 = layer 3
	body.collision_mask = 1   # bit 0 = layer 1 (world statics)

	# Sphere collider at explicit scaled radius — body itself stays unit-
	# scale so move_and_collide isn't confused by non-unit transforms.
	var col := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = sc * 0.5
	col.shape = sphere
	body.add_child(col)

	# Visual GLB lives under a scaled wrapper so the body's transform stays
	# clean; rotating the body still spins the visuals (sphere collider is
	# rotationally symmetric so this is fine).
	var visual_root := Node3D.new()
	visual_root.scale = Vector3(sc, sc, sc)
	body.add_child(visual_root)
	var inst: Node = TumbleweedScene.instantiate()
	if not (inst is Node3D):
		body.queue_free()
		return
	visual_root.add_child(inst as Node3D)

	var px: float = 0.0
	var pz: float = 0.0
	if _player != null:
		px = _player.global_position.x
		pz = _player.global_position.z

	# Roll a candidate XZ + verify it's clear of any world static collider via
	# a physics shape query. If something's there (cactus, rock, platform),
	# re-roll up to 5 times. If still no clear spot, give up — the pool
	# refill in `_update_tumbleweeds` will retry next frame.
	var space_state := _tumbleweed_root.get_world_3d().direct_space_state
	var probe := SphereShape3D.new()
	probe.radius = sc * 0.5
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = probe
	query.collision_mask = 1  # world statics only

	var spawn_x: float = 0.0
	var spawn_z: float = 0.0
	var spawn_y: float = TUMBLEWEED_GROUND_Y + sc
	var clear: bool = false
	for _attempt in 5:
		if initial:
			spawn_x = px + (_tumbleweed_rng.randf() - 0.5) * 2.0 * TUMBLEWEED_SPAWN_RANGE_X
		else:
			spawn_x = px + TUMBLEWEED_SPAWN_RANGE_X * (0.7 + _tumbleweed_rng.randf() * 0.3)
		spawn_z = pz + (_tumbleweed_rng.randf() - 0.5) * 2.0 * TUMBLEWEED_SPAWN_RANGE_Z
		query.transform = Transform3D(Basis.IDENTITY,
			Vector3(spawn_x, spawn_y, spawn_z))
		if space_state.intersect_shape(query, 1).is_empty():
			clear = true
			break
	if not clear:
		body.queue_free()
		return
	body.position = Vector3(spawn_x, spawn_y, spawn_z)

	var speed: float = lerp(TUMBLEWEED_SPEED_MIN, TUMBLEWEED_SPEED_MAX,
		_tumbleweed_rng.randf())
	var drift_z: float = (_tumbleweed_rng.randf() - 0.5) * 2.0 * TUMBLEWEED_DRIFT_Z_MAX
	var vy: float = TUMBLEWEED_HOP_INITIAL * (0.4 + _tumbleweed_rng.randf() * 0.6)
	var velocity := Vector3(WIND_DIR.x * speed, vy, drift_z)

	var spin_axis := Vector3(
		(_tumbleweed_rng.randf() - 0.5) * 0.4,
		(_tumbleweed_rng.randf() - 0.5) * 0.4,
		1.0
	).normalized()
	var spin_rate: float = (speed / sc) * TUMBLEWEED_SPIN_PER_SPEED

	body.rotation = Vector3(
		_tumbleweed_rng.randf() * TAU,
		_tumbleweed_rng.randf() * TAU,
		_tumbleweed_rng.randf() * TAU,
	)
	# Per-tumbleweed dynamic-force parameters. Sampled once at spawn so each
	# tumbleweed has its own gust phase + bump cadence + mass profile.
	var time_now: float = Time.get_ticks_usec() / 1_000_000.0
	var gust_phase: float = _tumbleweed_rng.randf() * TAU
	var gust_freq: float = _tumbleweed_rng.randf_range(
		TUMBLEWEED_GUST_FREQ_MIN, TUMBLEWEED_GUST_FREQ_MAX)
	var next_bump_time: float = time_now + _tumbleweed_rng.randf_range(
		TUMBLEWEED_BUMP_INTERVAL_MIN, TUMBLEWEED_BUMP_INTERVAL_MAX)
	var mass: float = _tumbleweed_rng.randf_range(
		TUMBLEWEED_MASS_MIN, TUMBLEWEED_MASS_MAX)

	_tumbleweed_root.add_child(body)
	_tumbleweeds.append({
		"node": body,
		"scale": sc,
		"velocity": velocity,
		"spin_axis": spin_axis,
		"spin_rate": spin_rate,
		# Dynamic forces.
		"base_speed_x": WIND_DIR.x * speed,
		"gust_phase": gust_phase,
		"gust_freq": gust_freq,
		"next_bump_time": next_bump_time,
		"mass": mass,
	})


# Per-frame tumbleweed step: integrate gravity, bounce on the ground plane,
# advance horizontally along the wind, spin around the spin axis, despawn
# anything that has rolled out of range, and refill the pool from upwind.
func _update_tumbleweeds(dt: float) -> void:
	if _tumbleweed_root == null or _tumbleweed_rng == null or _player == null:
		return
	var px: float = _player.global_position.x
	var pz: float = _player.global_position.z
	var time_now: float = Time.get_ticks_usec() / 1_000_000.0
	# Lerp factor for the gust convergence — clamped because small dt would
	# leave it ineffective and large dt could overshoot.
	var gust_alpha: float = clampf(dt * TUMBLEWEED_GUST_LERP_RATE, 0.0, 1.0)

	# Indices to recycle this frame.
	var to_recycle: Array[int] = []
	for i in _tumbleweeds.size():
		var tw: Dictionary = _tumbleweeds[i]
		var node: Node3D = tw.node
		var v: Vector3 = tw.velocity

		# ── Dynamic forces (overlap to give very different motion profiles) ──
		# Gust: per-tumbleweed sinusoidal target velocity. Both signs of `gust`
		# are used so wind both pushes (gust > 0) and lulls (gust < 0).
		var gust: float = sin(time_now * tw.gust_freq + tw.gust_phase)
		var target_vx: float = tw.base_speed_x + WIND_DIR.x * gust * TUMBLEWEED_GUST_STRENGTH
		v.x = lerp(v.x, target_vx, gust_alpha)

		# Bumps: hit a hidden rock — random Y kick + Z perturbation. Reset the
		# next bump time afterwards so each tumbleweed has its own cadence.
		if time_now >= tw.next_bump_time:
			v.y += _tumbleweed_rng.randf_range(
				TUMBLEWEED_BUMP_VY_MIN, TUMBLEWEED_BUMP_VY_MAX)
			v.z += _tumbleweed_rng.randf_range(
				-TUMBLEWEED_BUMP_VZ_RANGE, TUMBLEWEED_BUMP_VZ_RANGE)
			tw.next_bump_time = time_now + _tumbleweed_rng.randf_range(
				TUMBLEWEED_BUMP_INTERVAL_MIN, TUMBLEWEED_BUMP_INTERVAL_MAX)

		# Thermals: rare strong updraft — Poisson-style per-frame chance.
		# Multiplying by `dt` keeps the per-second rate stable across framerates.
		if _tumbleweed_rng.randf() < TUMBLEWEED_THERMAL_CHANCE_PER_SEC * dt:
			v.y += _tumbleweed_rng.randf_range(
				TUMBLEWEED_THERMAL_VY_MIN, TUMBLEWEED_THERMAL_VY_MAX)

		# Gravity, mass-scaled. Heavier tumbleweeds fall slower (visual variety
		# rather than a strict physical model).
		v.y -= TUMBLEWEED_GRAVITY * dt / tw.mass

		# Move via the physics body so the tumbleweed bounces off cacti,
		# rocks, and the platform. Player is on a different collision layer
		# so we ignore them entirely.
		var collision: KinematicCollision3D = node.move_and_collide(v * dt)
		if collision != null:
			# Reflect velocity off the surface and damp. Extra horizontal
			# damp on impact keeps tumbleweeds from ricocheting forever
			# between two cacti.
			var normal: Vector3 = collision.get_normal()
			v = v.bounce(normal) * 0.55
			v.x *= 0.92
			v.z *= 0.92

		# Ground bounce. Resting Y = scale (bottom of a unit-radius sphere
		# scaled by `tw.scale`). Two regimes:
		#   - Real impact (v.y << 0): reflect + damp horizontal.
		#   - Settled / rolling (|v.y| small): snap Y, zero v.y, preserve
		#     horizontal velocity so the tumbleweed keeps rolling forever.
		# Without the threshold, gravity pulls Y under rest_y every frame
		# while settled, the bounce branch fires every frame, and horizontal
		# velocity decays to zero in ~1 second.
		var rest_y: float = TUMBLEWEED_GROUND_Y + tw.scale
		if node.position.y < rest_y:
			node.position.y = rest_y
			if v.y < -TUMBLEWEED_BOUNCE_VEL_THRESHOLD:
				v.y = -v.y * TUMBLEWEED_BOUNCE_DAMPING
				v.x *= TUMBLEWEED_HORIZ_DAMPING
				v.z *= TUMBLEWEED_HORIZ_DAMPING
			else:
				v.y = 0.0

		tw.velocity = v

		# Spin around the precomputed axis at a rate proportional to the
		# horizontal speed (so a fast-moving tumbleweed rolls visibly faster).
		# `global_rotate` spins around a WORLD-space axis so the +Z-biased spin
		# axis reads as a forward roll regardless of the tumbleweed's current
		# orientation (otherwise it would spin around whatever direction its
		# own randomized local Z happens to point).
		var horiz_speed: float = Vector2(v.x, v.z).length()
		var spin: float = (horiz_speed / max(tw.scale, 0.01)) * TUMBLEWEED_SPIN_PER_SPEED * dt
		node.global_rotate(tw.spin_axis, spin)

		# Despawn checks.
		var dx: float = node.position.x - px
		var dz: float = node.position.z - pz
		if dx < -TUMBLEWEED_DESPAWN_X or absf(dz) > TUMBLEWEED_DESPAWN_Z:
			to_recycle.append(i)

	# Free recycled tumbleweeds, then respawn fresh ones from upwind. We free
	# in reverse so removed indices don't shift.
	for idx in range(to_recycle.size() - 1, -1, -1):
		var i: int = to_recycle[idx]
		var tw: Dictionary = _tumbleweeds[i]
		if tw.node:
			tw.node.queue_free()
		_tumbleweeds.remove_at(i)
	while _tumbleweeds.size() < TUMBLEWEED_COUNT:
		_spawn_tumbleweed(false)


# ── Wind dust particles ────────────────────────────

# Build a single MultiMesh of billboarded quads. Each instance has a static
# world position scattered uniformly across a tile-sized box; the shader
# scrolls + wraps + adds turbulence so motion is fully GPU-side. Cloud
# centre is updated each frame in `draw()` to follow the player.
func _build_wind_particles(parent: Node3D) -> void:
	var quad := QuadMesh.new()
	# QuadMesh defaults to a 2×2 unit quad in XY (vertices at ±1). The
	# shader multiplies VERTEX.xy by `particle_size` so size is uniform-driven.
	quad.size = Vector2(1.0, 1.0)

	_wind_particles_material = ShaderMaterial.new()
	_wind_particles_material.shader = WindParticlesShader
	_wind_particles_material.set_shader_parameter("wind_dir", WIND_DIR)
	_wind_particles_material.set_shader_parameter("wind_speed", WIND_PARTICLE_SPEED)
	_wind_particles_material.set_shader_parameter("tile_size", WIND_PARTICLE_TILE_SIZE)
	_wind_particles_material.set_shader_parameter("cloud_origin", Vector3.ZERO)
	_wind_particles_material.set_shader_parameter("lifetime_min", WIND_PARTICLE_LIFETIME_MIN)
	_wind_particles_material.set_shader_parameter("lifetime_max", WIND_PARTICLE_LIFETIME_MAX)
	_wind_particles_material.set_shader_parameter("size_start", WIND_PARTICLE_SIZE_START)
	_wind_particles_material.set_shader_parameter("size_end", WIND_PARTICLE_SIZE_END)
	_wind_particles_material.set_shader_parameter("size_jitter_min", WIND_PARTICLE_SIZE_JITTER_MIN)
	_wind_particles_material.set_shader_parameter("size_jitter_max", WIND_PARTICLE_SIZE_JITTER_MAX)
	_wind_particles_material.set_shader_parameter("rise_height", WIND_PARTICLE_RISE_HEIGHT)
	_wind_particles_material.set_shader_parameter("turb_strength", WIND_PARTICLE_TURB_STRENGTH)
	_wind_particles_material.set_shader_parameter("base_color", WIND_PARTICLE_COLOR)
	_wind_particles_material.set_shader_parameter("fade_band", WIND_PARTICLE_FADE_BAND)
	# Bell-curve knees — pulled in from the cycle end so puffs disappear
	# visibly before the next emission ("puff and gone" rhythm).
	_wind_particles_material.set_shader_parameter("fade_in_end", 0.12)
	_wind_particles_material.set_shader_parameter("fade_out_start", 0.35)
	_wind_particles_material.set_shader_parameter("fade_out_end", 0.65)
	# Biome sample params — sourced from `_biome_config` (same instance the
	# splat bake uses) so the shader's sand mask lines up with the visible
	# meadow/forest boundary, no drift.
	_wind_particles_material.set_shader_parameter("biome_noise_freq",
		_biome_config.noise_freq)
	_wind_particles_material.set_shader_parameter("biome_threshold",
		_biome_config.meadow_threshold)
	_wind_particles_material.set_shader_parameter("biome_softness",
		_biome_config.meadow_softness)
	_wind_particles_material.set_shader_parameter("biome_warp_freq",
		_biome_config.warp_freq)
	_wind_particles_material.set_shader_parameter("biome_warp_amp",
		_biome_config.warp_amp)

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = false
	mm.mesh = quad
	mm.instance_count = WIND_PARTICLE_COUNT

	# Distribute random emission points (XZ) uniformly across the tile. Y in
	# the seed transform is unused — the shader recomputes Y per frame from
	# the particle's age. Each random seed is the particle's emission
	# anchor, so 1000 seeds = 1000 random emission points across the cloud.
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var half_tile: float = WIND_PARTICLE_TILE_SIZE * 0.5
	for i in WIND_PARTICLE_COUNT:
		var sx: float = rng.randf_range(-half_tile, half_tile)
		var sz: float = rng.randf_range(-half_tile, half_tile)
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, Vector3(sx, 0.0, sz)))

	_wind_particles_mmi = MultiMeshInstance3D.new()
	_wind_particles_mmi.name = "WindParticles"
	_wind_particles_mmi.multimesh = mm
	_wind_particles_mmi.material_override = _wind_particles_material
	_wind_particles_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Disable frustum culling on this MMI. The MultiMesh's AABB is computed
	# from the static instance positions (centred on world origin), but the
	# shader transforms them to follow the player — so a tight AABB would
	# cull the cloud as soon as the player walked more than `tile_size`
	# from origin. Max-out the cull margin so the renderer never rejects it.
	_wind_particles_mmi.extra_cull_margin = 16384.0
	parent.add_child(_wind_particles_mmi)
