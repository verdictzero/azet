class_name TerrainDemo4Screen
extends BaseScreen
## Iteration 4 of the terrain demo — Demo 3 plus a Q/E orbit camera. Same
## proxy-splatmap pipeline, same vegetation rules; the only behavioural
## delta is that the camera yaw is now player-input-driven and the camera
## orbits the player at constant radius.
##
## Q / E hold to rotate counter- / clockwise (viewed from above). Camera
## distance and pitch unchanged. Player movement is camera-relative — W
## always moves "into the screen" regardless of orbit angle. The yaw is
## written each frame to `terrain_player.camera_yaw_rad`, which rotates
## the player's input axes before computing velocity. Sprite facing still
## tracks raw input (W → sprite faces UP on screen) so a billboard sprite
## visually points the way the player is going.
##
## (Following text is the unchanged Demo 3 docstring.)
## Iteration 3 of the terrain demo — Demo 2 with the proxy-splatmap pattern
## wired through. Same 7×7-zone world, same vegetation/path/obelisk/zone-wall
## systems, but the meadow density is baked into a per-chunk L8 texture that
## both the GPU shader (`terrain_splat_v2.gdshader`) and the CPU spawn culler
## sample with the SAME bilinear filter on the SAME bytes. Vegetation no
## longer drifts off the splat boundary because there's no second
## implementation to drift from.
##
## Pattern docs: `docs/proxy-splatmap-pattern.md`,
## `docs/splatmap-terrain-shader.md`. Reference impl:
## `splatmap_spawn_test_3_screen.gd` (5-zone variant; this screen is the
## simpler 1-density-channel variant).
##
## Vegetation rule swap vs Demo 2:
## - Trees, ferns: forest only (unchanged — reject if meadow).
## - Bushes: **meadow only** (inverted from Demo 2 — they used to spawn in
##   forest gaps; now they spawn in meadow).
## - Rocks: no biome gate (unchanged).
##
## Bake runs on `WorkerThreadPool` worker threads (Test 3 pattern). Main
## thread never blocks on chunk generation; chunks appear once their
## worker thread completes (~few hundred ms after entering view range).
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

# ── Zone layout ────────────────────────────────────
# World = grid of zones, each zone = N×N chunks with a half-chunk-wide
# border of dense forest + invisible wall around its perimeter, and a
# single open corridor through the middle chunk of each edge connecting
# it to the neighbouring zone.
const ZONE_CHUNKS_PER_SIDE: int = 7
const ZONE_EDGE_MID_INDEX: int = 3      # (ZONE_CHUNKS_PER_SIDE - 1) / 2
const ZONE_BORDER_STRIP_M: float = 32.0 # half a chunk
const ZONE_CORRIDOR_WIDTH_M: float = 8.0
const ZONE_WALL_HEIGHT_M: float = 4.0
# Temporary debug visual — paints each border wall as a tinted translucent
# box so zone geometry is visible in-game. Set to false to ship invisible.
const DEBUG_SHOW_BORDER_WALLS: bool = false
const DEBUG_SHOW_CORRIDOR_TRIGGERS: bool = false
# Border-tree scatter: tighter grid + relaxed min-distance so the canopy
# reads as an unbroken wall. Meadow cull is skipped so meadow noise can't
# punch a hole in the perimeter.
const ZONE_BORDER_TREE_CELL: float = 5.4
const ZONE_BORDER_TREE_JITTER: float = 0.85
const ZONE_BORDER_TREE_MIN_DIST: float = 3.5
# Edge bitmask — returned by `_chunk_edges` / `_is_exit_chunk`.
const ZONE_EDGE_W: int = 1
const ZONE_EDGE_E: int = 2
const ZONE_EDGE_N: int = 4
const ZONE_EDGE_S: int = 8

const CAM_LERP: float = 0.1
const ORTHO_SIZE: float = 11.0
const CAM_PITCH_DEG: float = -30.0
const CAM_DIST: float = 80.0
# Q / E orbit speed in degrees per second (raw key polling, not action-
# based — we want continuous-while-held behaviour, not edge-triggered).
const CAM_YAW_SPEED_DEG: float = 90.0

const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")
const PaneRasterLutShader: Shader = preload("res://assets/shaders/pane_raster_lut.gdshader")
const PaneFogShader: Shader = preload("res://assets/shaders/pane_fog.gdshader")
# Fog opacity ramps up as the player approaches any zone edge, hits
# FOG_BORDER_OPACITY right at the border strip, and relaxes to the base
# value again in the zone interior.
const FOG_BASE_OPACITY: float = 0.55
const FOG_BORDER_OPACITY: float = 1.8
# Ramp distance kept short so the fog only closes in once the player is
# already deep in the border strip, right next to the edge wall collider —
# the interior reads as relatively clear up until the last few metres.
const FOG_BORDER_RAMP_M: float = 16.0
# Corridor suppression: when the player is laterally aligned with the exit
# corridor on the nearest edge, the border boost is ramped back down to base
# so the path out feels open and clear.
const FOG_CORRIDOR_CLEAR_M: float = 8.0
const FOG_CORRIDOR_SOFTEN_M: float = 18.0
# Exit-path clearing around each corridor. Width = corridor + 2*side margin;
# depth reaches past the border strip into the zone interior so the approach
# to the corridor reads as a deliberate clearing, not a doorway in a wall.
const EXIT_CLEAR_SIDE_MARGIN_M: float = 5.0
const EXIT_CLEAR_INTERIOR_REACH_M: float = 12.0
# City-plate path trail peppered into each zone's corridor approach. Full
# strength from the wall out to PATH_EDGE_FULL_M, fades to nothing by
# PATH_FADE_END_M so deep zone interiors read as unmarked forest/meadow.
const PATH_CORRIDOR_LATERAL_HALF: float = 3.5
const PATH_CORRIDOR_LATERAL_SOFTNESS: float = 2.0
const PATH_EDGE_FULL_M: float = 100.0
const PATH_FADE_END_M: float = 150.0
const PATH_PEPPER_FREQ: float = 0.7
const PATH_PEPPER_THRESHOLD: float = 0.55
const PATH_PEPPER_SOFTNESS: float = 0.05
const PATH_STRENGTH: float = 1.0
# Marker obelisks flanking each corridor entrance. Placed at the inner
# corner of the exit clearance so they sit in BORDER chunks (loaded as
# soon as the player nears an edge) and frame the visible throat of the
# corridor. lateral = corridor_half + clearance_margin = 9m off centreline;
# depth = border_strip + interior_reach = 44m from the wall.
# Sit the obelisks right at the outer edge of the corridor (1m outside the
# 4m-half-width path) so they hug the plate trail rather than the clearing
# margin. Depth unchanged — still at the inner corner of the clearing.
const OBELISK_SIDE_OFFSET_M: float = ZONE_CORRIDOR_WIDTH_M * 0.5 + 1.0
const OBELISK_DEPTH_M: float = ZONE_BORDER_STRIP_M + EXIT_CLEAR_INTERIOR_REACH_M
const OBELISK_SCALE: float = 4.0
const OBELISK_NO_TREE_HEIGHT_MULT: float = 2.0
# LUT-palette post-fx: build a sega-cube palette LUT once and use the LUT
# variant of the raster shader. Flip to false to revert to the plain
# grayscale-dither shader bit-identically.
const USE_LUT_DITHER: bool = true
const PALETTE_HEX_PATH: String = "res://assets/palettes/sega-cube.hex"
const ToonTreeShader: Shader = preload("res://assets/shaders/toon_tree.gdshader")
const ToonOutlineShader: Shader = preload("res://assets/shaders/toon_outline.gdshader")
const BlobShadowShader: Shader = preload("res://assets/shaders/blob_shadow.gdshader")
const TerrainSplatShader: Shader = preload("res://assets/shaders/terrain_splat_v2.gdshader")
const TreeMatcapShader: Shader = preload("res://assets/shaders/toon_tree_matcap.gdshader")
const TREE_MATCAP_TEX: Texture2D = preload("res://assets/matcap/matcap_1.png")
const BUSH_MATCAP_TEX: Texture2D = preload("res://assets/matcap/matcap_2.png")
const GROUND_MEADOW_TEX: Texture2D = preload("res://assets/biomes/test/new_meadow_grass_checkered_v5.png")
const GROUND_FOREST_TEX: Texture2D = preload("res://assets/biomes/test/pine_forest_terrain.png")
const GROUND_PATH_TEX: Texture2D = preload("res://assets/biomes/test/city_metal_plate_2.jpg")
const GROUND_WORLD_PER_TILE: float = 6.4
const GROUND_PATH_WORLD_PER_TILE: float = 4.0
# Pine forest is the default ground texture; meadows are pockets cut out
# where the FBM field rises past the threshold. All noise parameters live in
# the BiomeConfig Resource below so the splat shader (as material uniforms)
# and CPU-side placement (via BiomeField) can't drift on a tweak.
const BiomeConfigDefault: Resource = preload("res://core/biome_config_default.tres")
# Per-chunk density texture resolution. 128² → 4 px/m on CHUNK_SIZE = 64
# (matches splatmap_spawn_test_3 for parity). The image is sampled by both
# the GPU shader (filter_linear) and the CPU spawn culler (bilinear
# mirror) — same bytes both sides → no drift. The bake produces
# `(BIOME_GRID_N + 2)²` texels (1-texel overhang on every side) so the
# GPU's bilinear filter can blend across chunk seams continuously.
const BIOME_GRID_N: int = 128
const BAKE_GRID_N: int = BIOME_GRID_N + 2
const PineTreeScene: PackedScene = preload("res://assets/models/pine_tree_0.glb")
const PineBushScene: PackedScene = preload("res://assets/models/pine_bush_0.glb")
const FernScene: PackedScene = preload("res://assets/models/fern_0.glb")
const RockScene: PackedScene = preload("res://assets/models/rock_0.glb")
const ObeliskScene: PackedScene = preload("res://assets/models/marker_obelisk_0.glb")
const RockMatcapShader: Shader = preload("res://assets/shaders/rock_matcap.gdshader")
# Rocks share the same matcap as the bushes + ferns — all ground-level
# clutter pulls from a single sphere so the scene's lighting reads uniform.
const ROCK_MATCAP_TEX: Texture2D = preload("res://assets/matcap/matcap_2.png")

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
const FERN_PER_TREE_MIN: int = 12
const FERN_PER_TREE_MAX: int = 24
const FERN_CLUSTER_INNER_MULT: float = 0.3   # of tree canopy radius
const FERN_CLUSTER_OUTER_MULT: float = 0.85
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
const FERN_WIND_STRENGTH: float = 0.12
const FERN_WIND_MASK_Y_MIN: float = -0.1
const FERN_WIND_MASK_Y_MAX: float = 0.35
# Isolated fern patches — small standalone clumps in the forest interior
# with no parent tree. Same anchor-placement style as bush clusters:
# reject meadow, too-close-to-tree, or too-close-to-existing-fern.
const FERN_ISO_CLUSTERS_PER_CHUNK_MIN: int = 3
const FERN_ISO_CLUSTERS_PER_CHUNK_MAX: int = 6
const FERN_ISO_ANCHOR_PLACEMENT_ATTEMPTS: int = 20
const FERN_ISO_ANCHOR_TREE_MIN_DIST: float = 3.5
const FERN_ISO_ANCHOR_FERN_MIN_DIST: float = 3.0
const FERN_ISO_CLUSTER_RADIUS: float = 1.4
const FERN_ISO_PER_CLUSTER_MIN: int = 4
const FERN_ISO_PER_CLUSTER_MAX: int = 9
# Ferns ringing each obelisk inside the same no-tree/bush/rock exclusion
# radius. Fill the dead ring the exclusion opened up so the obelisks read
# as deliberately-tended markers rather than bald patches.
const FERN_AROUND_OBELISK_COUNT_MIN: int = 28
const FERN_AROUND_OBELISK_COUNT_MAX: int = 44
const FERN_AROUND_OBELISK_INNER_MULT: float = 0.15
const FERN_AROUND_OBELISK_OUTER_MULT: float = 0.55

# Vegetation is placed in three passes that layer differently:
#   1. Trees — jittered-grid scatter across the chunk.
#   2. Ferns — tight ring skirting each tree.
#   3. Bush clumps — standalone anchors in the gaps, rejected if close to
#      any tree or fern.
# The splat noise is ignored during placement and re-applied as a final
# meadow-zone cull.
# Trees: jittered-grid scatter over the whole chunk. Sparser cells + a
# larger min-dist open the canopy up so ferns and bushes read as the
# dominant cover; trees become the scattered crown layer above them.
const TREE_GRID_CELL: float = 12.4
const TREE_JITTER: float = 2.8
const TREE_DIAMETER_MIN: float = 3.0
const TREE_DIAMETER_MAX: float = 5.5
const TREE_MIN_DIST: float = 6.5
# Bush clusters: standalone clumps placed at random anchors in the chunk,
# rejected if too close to any tree, fern, or meadow pocket. The clump forms
# a tight ball around each anchor — no tree trunk at the centre.
const BUSH_CLUSTERS_PER_CHUNK_MIN: int = 3
const BUSH_CLUSTERS_PER_CHUNK_MAX: int = 7
const BUSH_ANCHOR_PLACEMENT_ATTEMPTS: int = 24
# Anchor clearance from existing plants. Tree clearance is generous (clump
# wants open canopy breaks); fern clearance is just enough that the outer
# ring of the cluster still lands clear of the fern skirt.
const BUSH_ANCHOR_TREE_MIN_DIST: float = 4.5
const BUSH_ANCHOR_FERN_MIN_DIST: float = 3.5
const BUSH_CLUSTER_RADIUS: float = 2.2
const BUSH_PER_CLUSTER_MIN: int = 4
const BUSH_PER_CLUSTER_MAX: int = 8
# Rock clusters: 2–4 per chunk at random anchors (no biome gate; rocks live
# in meadow and forest alike). Each cluster is three concentric rings of
# progressively smaller stones.
const ROCK_CLUSTERS_PER_CHUNK_MIN: int = 2
const ROCK_CLUSTERS_PER_CHUNK_MAX: int = 4
const ROCK_CLUSTER_ANCHOR_MARGIN: float = 3.0
# Centre tier: 1–3 large rocks clustered tight around the anchor.
const ROCK_LARGE_COUNT_MIN: int = 1
const ROCK_LARGE_COUNT_MAX: int = 3
const ROCK_LARGE_RING_R_INNER: float = 0.0
const ROCK_LARGE_RING_R_OUTER: float = 1.4
const ROCK_LARGE_SCALE_MIN: float = 1.5
const ROCK_LARGE_SCALE_MAX: float = 2.5
# Middle tier: 4–8 medium rocks ringing the centre.
const ROCK_MED_COUNT_MIN: int = 4
const ROCK_MED_COUNT_MAX: int = 8
const ROCK_MED_RING_R_INNER: float = 1.5
const ROCK_MED_RING_R_OUTER: float = 3.0
const ROCK_MED_SCALE_MIN: float = 0.8
const ROCK_MED_SCALE_MAX: float = 1.5
# Outer tier: 8–16 small rocks spattered around the edge.
const ROCK_SMALL_COUNT_MIN: int = 8
const ROCK_SMALL_COUNT_MAX: int = 16
const ROCK_SMALL_RING_R_INNER: float = 3.0
const ROCK_SMALL_RING_R_OUTER: float = 5.5
const ROCK_SMALL_SCALE_MIN: float = 0.35
const ROCK_SMALL_SCALE_MAX: float = 0.75
# Random tilt off vertical, in radians — a small wobble so rocks don't all
# sit axis-aligned. Full Y rotation is always random.
const ROCK_TILT_MAX: float = 0.25
# Avoidance clearances when placing rocks near existing vegetation. Values
# are multiples of the plant's own scale/diameter. A rock placement is
# rejected if (rock_avoid_radius + plant_radius) exceeds the XZ distance.
const ROCK_AVOID_TREE_MULT: float = 0.9
const ROCK_AVOID_BUSH_MULT: float = 0.7
const ROCK_AVOID_FERN_MULT: float = 0.5
const ROCK_PLACEMENT_ATTEMPTS: int = 8
# Anchor (cluster centre) clearance — uses the large-rock outer radius so
# the whole cluster lands in open-ish ground, not butted against a tree.
const ROCK_ANCHOR_CLEARANCE: float = 2.0
# Rocks below this scale skip colliders so the player walks through them
# (pebbles underfoot, not obstacles). Medium + large rocks block laterally
# via a squat cylinder sized smaller than the visible rock.
const ROCK_COLLIDER_MIN_SCALE: float = 0.8
const ROCK_COLLIDER_RADIUS_MULT: float = 0.35
const ROCK_COLLIDER_HEIGHT_MULT: float = 0.45
# Blob shadow under each rock. Uses the darker tree-weight shadow material
# rather than the bush one, and sized larger so rocks anchor visually to
# the ground even at small instance scales.
const ROCK_SHADOW_SIZE_MULT: float = 2.6
# Toggle to emit per-chunk veg placement diagnostics via print(). Flip to
# false before committing to avoid console spam at runtime.
const DEBUG_LOG_VEGETATION: bool = true
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
# Phase-jitter amount fed to the wind shader (radians). Non-zero values break
# up the pure-sine sway into gust-like chaos.
const WIND_TURBULENCE: float = 0.4
# Trees sway a bit more sedately than the bush/meadow layer — lower amplitude
# and less turbulence so the canopy reads as weight-bearing rather than jittery.
const TREE_WIND_STRENGTH: float = 0.12
const TREE_WIND_TURBULENCE: float = 0.2

const TERRAIN_VERTS_PER_SIDE: int = 33
# Ground tile UV is local (0..1 per chunk). With uv1_scale=10, each chunk
# shows exactly 10 texture tiles → seams line up perfectly between chunks.
const GROUND_UV_TILES_PER_CHUNK: float = 10.0

var _ring_layers: Array = []

# Active biome parameters (frequency / threshold / softness). Duplicated-by-
# reference to both the splat shader (as material uniforms) and every
# per-chunk density grid — the Resource is the single source of truth.
var _biome_config: BiomeConfig

# Non-MultiMesh materials kept around for shadows (variable scale per-instance
# so MultiMesh doesn't help), outline next_pass, and the ground.
var _ground_material: ShaderMaterial
var _tree_outline_material: ShaderMaterial
var _bush_outline_material: ShaderMaterial
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
var _rock_mesh: ArrayMesh
var _rock_material: ShaderMaterial
var _obelisk_mesh: ArrayMesh
var _obelisk_material: ShaderMaterial
var _obelisk_aabb_height: float = 0.0
var _bush_foliage_mesh: ArrayMesh
var _fern_foliage_mesh: ArrayMesh
var _terrain_base_mesh: ArrayMesh

# Shared toon materials — reused across every instance of each mesh type.
var _tree_trunk_material: ShaderMaterial
var _tree_foliage_material: ShaderMaterial
var _bush_foliage_material: ShaderMaterial
var _fern_foliage_material: ShaderMaterial

var _viewport: SubViewport
var _texture_rect: TextureRect
var _camera: Camera3D
# Camera yaw in radians. 0 = looking down -Z (Demo 3 default). Q / E
# advance this each frame while held.
var _camera_yaw_rad: float = 0.0
var _player: CharacterBody3D
var _chunk_container: Node3D

# Per-chunk state. Each entry holds the chunk's container node, the
# per-chunk ground MMI, three vegetation MultiMeshInstance3Ds (trees /
# bushes / ferns), the baked density Image (CPU spawn lookup source),
# and per-instance lookup tables we need to update fade/push each frame.
#   {"node": Node3D, "mm_ground": MultiMeshInstance3D,
#    "mm_tree": MultiMeshInstance3D, "mm_bush": MultiMeshInstance3D,
#    "mm_fern": MultiMeshInstance3D,
#    "density_img": Image,
#    "trees":  Array[{xz, idx}],
#    "bushes": Array[{xz, basis_inv, idx, push_amount, prev_proximity}],
#    "ferns":  Array[{xz, basis_inv, idx, push_amount, prev_proximity}]}
var _chunks_state: Dictionary = {}

# In-flight chunk bakes running on `WorkerThreadPool` worker threads.
# Worker thread runs `BiomeField.bake_chunk_density_image` (pure CPU;
# touches no engine APIs) and stores the result in the BakeJob holder.
# The main thread polls each tick and finalises completed bakes via
# `_finish_chunk_load`. Pattern matches splatmap_spawn_test_3_screen.gd.
# key: Vector2i -> { task_id: int, job: BakeJob }
var _pending_bakes: Dictionary = {}


# Holder for a per-chunk async bake. Worker thread writes `img`; main
# thread reads it once `WorkerThreadPool.is_task_completed` returns true.
# RefCounted so the lambda's captured reference keeps it alive until both
# the worker AND the main thread have released it.
class BakeJob extends RefCounted:
	var img: Image = null
	var origin_x: float = 0.0
	var origin_z: float = 0.0

var _hud_label: Label
# Last chunk's vegetation totals, written by _collect_glades. Shown on the
# HUD so spawn density is visible live while moving without console-diving.
var _last_log_chunk: Vector2i = Vector2i(0, 0)
var _last_log_trees: int = 0
var _last_log_bushes: int = 0
var _last_log_ferns: int = 0
var _raster_mat: ShaderMaterial
var _fog_rect: ColorRect
var _fog_mat: ShaderMaterial
# Cached LUT texture — built once on first demo entry. Re-entering the demo
# reuses the cached texture.
var _palette_lut: ImageTexture3D = null
var _block_w: int = 1
var _block_h: int = 1
var _full_w: int = 1
var _full_h: int = 1


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	# v2 no longer uses glade rings — vegetation is scattered across the
	# whole chunk and banded by splat noise value. `_ring_layers` left
	# empty so any lingering accessor gets a safe no-op rather than null.
	_ring_layers = []


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	# Reset orbit yaw on every entry so the demo starts at a known
	# camera orientation. (Future "entering a new area" handling can hook
	# the same line — write to `_camera_yaw_rad` from wherever the area-
	# transition fires.)
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
	# Tree fade-on-occlude is replaced in v2 by the player xray-outline pass
	# (see terrain_player.enable_xray_outline). _update_tree_fades is kept on
	# the source so a future stage can re-enable it without re-implementing.
	_update_bush_push()
	_update_fog_opacity()
	if _player and _hud_label:
		var px: float = _player.global_position.x
		var pz: float = _player.global_position.z
		var cx: int = int(floor(px / CHUNK_SIZE))
		var cz: int = int(floor(pz / CHUNK_SIZE))
		var fps: int = int(Engine.get_frames_per_second())
		_hud_label.text = "FPS %d  Chunk (%d,%d)  %d chunks  [ESC] Back\nLast chunk (%d,%d): trees=%d bushes=%d ferns=%d" % [
			fps, cx, cz, _chunks_state.size(),
			_last_log_chunk.x, _last_log_chunk.y,
			_last_log_trees, _last_log_bushes, _last_log_ferns]


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

	# Pull biome parameters from the shared Resource. The CPU bake calls
	# `BiomeField` directly and reads the config to compute per-texel
	# warped FBM, so noise_freq / warp_freq / warp_amp don't need to be
	# pushed to the shader anymore — they're baked into the splat
	# texture each chunk gets. Only the threshold + softness still
	# matter on the shader side (used by smoothstep when blending
	# meadow_tex / forest_tex from the baked density).
	_biome_config = BiomeConfigDefault.duplicate() as BiomeConfig
	_ground_material = ShaderMaterial.new()
	_ground_material.shader = TerrainSplatShader
	_ground_material.set_shader_parameter("meadow_tex", GROUND_MEADOW_TEX)
	_ground_material.set_shader_parameter("forest_tex", GROUND_FOREST_TEX)
	_ground_material.set_shader_parameter("meadow_world_per_tile", GROUND_WORLD_PER_TILE)
	_ground_material.set_shader_parameter("forest_world_per_tile", GROUND_WORLD_PER_TILE)
	_ground_material.set_shader_parameter("noise_threshold", _biome_config.meadow_threshold)
	_ground_material.set_shader_parameter("noise_softness", _biome_config.meadow_softness)
	_ground_material.set_shader_parameter("path_tex", GROUND_PATH_TEX)
	_ground_material.set_shader_parameter("path_world_per_tile", GROUND_PATH_WORLD_PER_TILE)
	_ground_material.set_shader_parameter("zone_size_m", float(ZONE_CHUNKS_PER_SIDE) * CHUNK_SIZE)
	_ground_material.set_shader_parameter("corridor_lateral_half", PATH_CORRIDOR_LATERAL_HALF)
	_ground_material.set_shader_parameter("corridor_lateral_softness", PATH_CORRIDOR_LATERAL_SOFTNESS)
	_ground_material.set_shader_parameter("path_edge_full_m", PATH_EDGE_FULL_M)
	_ground_material.set_shader_parameter("path_fade_end_m", PATH_FADE_END_M)
	_ground_material.set_shader_parameter("path_pepper_freq", PATH_PEPPER_FREQ)
	_ground_material.set_shader_parameter("path_pepper_threshold", PATH_PEPPER_THRESHOLD)
	_ground_material.set_shader_parameter("path_pepper_softness", PATH_PEPPER_SOFTNESS)
	_ground_material.set_shader_parameter("path_strength", PATH_STRENGTH)

	# Outline shaders must mirror their body's wind block exactly or the
	# inverted-hull silhouette detaches from the swaying mesh. Trees, bushes,
	# and ferns each run different wind amplitudes, so each gets its own
	# outline material (even though the shader itself is shared).
	_tree_outline_material = ShaderMaterial.new()
	_tree_outline_material.shader = ToonOutlineShader
	_tree_outline_material.set_shader_parameter("outline_color", Color(0.12, 0.12, 0.12, 1.0))
	_apply_tree_wind_params(_tree_outline_material)

	_bush_outline_material = ShaderMaterial.new()
	_bush_outline_material.shader = ToonOutlineShader
	_bush_outline_material.set_shader_parameter("outline_color", Color(0.12, 0.12, 0.12, 1.0))
	_set_wind_params(_bush_outline_material)

	_fern_outline_material = ShaderMaterial.new()
	_fern_outline_material.shader = ToonOutlineShader
	_fern_outline_material.set_shader_parameter("outline_color", Color(0.12, 0.12, 0.12, 1.0))
	_apply_fern_wind_params(_fern_outline_material)

	_build_mesh_catalog()
	_build_shared_materials()

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
	# Spawn at zone (0, 0) centre so the player starts inside a playable
	# interior rather than trapped inside the NW-corner chunk's border walls.
	var zone_centre: float = float(ZONE_CHUNKS_PER_SIDE) * CHUNK_SIZE * 0.5
	_player.position = Vector3(zone_centre, 0.9, zone_centre)
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
	# Post-fx film-grain: block-level noise injected before the dither pass.
	# Cheap (one hash per raster block, time-quantised), subtle but visible
	# enough to shimmer the dither.
	_raster_mat.set_shader_parameter("noise_strength", 0.02)
	_raster_mat.set_shader_parameter("noise_time_hz", 20.0)
	_raster_mat.set_shader_parameter("noise_cell_mult", 2.0)

	var vp_h: float = float(_viewport.size.y)
	var wppx: float = (2.0 * ORTHO_SIZE) / vp_h
	var block_world: float = wppx * maxf(1.0, float(_block_h) * 0.5)
	_tree_outline_material.set_shader_parameter("outline_width", block_world * 0.7)
	_bush_outline_material.set_shader_parameter("outline_width", block_world * 0.7)
	_fern_outline_material.set_shader_parameter("outline_width", block_world * 0.5)
	_texture_rect.material = _raster_mat
	grid.add_child(_texture_rect)

	# Fog lives INSIDE the SubViewport so pane_raster's grain + dither + palette
	# LUT process the fog along with the 3D render. Size it to the viewport's
	# own (half-)resolution; pixel_cells in the shader snaps the noise sample
	# coord to a further-reduced grid for the deliberately-chunky fog look.
	_fog_rect = ColorRect.new()
	_fog_rect.position = Vector2.ZERO
	_fog_rect.size = Vector2(_viewport.size)
	_fog_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fog_rect.color = Color(1, 1, 1, 1)
	_fog_mat = ShaderMaterial.new()
	_fog_mat.shader = PaneFogShader
	_fog_rect.material = _fog_mat
	_viewport.add_child(_fog_rect)

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
	if _fog_rect: _fog_rect.queue_free(); _fog_rect = null
	_fog_mat = null
	if _texture_rect: _texture_rect.queue_free(); _texture_rect = null
	if _viewport: _viewport.queue_free(); _viewport = null
	_player = null; _camera = null; _chunk_container = null
	_biome_config = null
	_ground_material = null
	_raster_mat = null
	_tree_outline_material = null
	_bush_outline_material = null
	_fern_outline_material = null
	_blob_shadow_material = null
	_bush_shadow_material = null
	_blob_shadow_mesh = null
	_tree_mesh = null
	_bush_foliage_mesh = null
	_fern_foliage_mesh = null
	_rock_mesh = null
	_obelisk_mesh = null
	_terrain_base_mesh = null
	_tree_trunk_material = null
	_tree_foliage_material = null
	_bush_foliage_material = null
	_fern_foliage_material = null
	_rock_material = null
	_obelisk_material = null


# ── Mesh catalog ───────────────────────────────────

func _build_mesh_catalog() -> void:
	_tree_mesh = _bake_tree_mesh()
	_bush_foliage_mesh = _bake_mesh_from_template(PineBushScene, [])
	_fern_foliage_mesh = _bake_mesh_from_template(FernScene, [])
	_rock_mesh = _bake_mesh_from_template(RockScene, [])
	_obelisk_mesh = _bake_mesh_from_template(ObeliskScene, [])
	_terrain_base_mesh = _build_terrain_local_mesh()
	if _obelisk_mesh != null:
		_obelisk_aabb_height = _obelisk_mesh.get_aabb().size.y


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
	_apply_tree_wind_params(_tree_trunk_material)
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
	_apply_tree_wind_params(_tree_foliage_material)
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
	_bush_foliage_material.next_pass = _bush_outline_material

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

	# Rock material: unlit matcap + world-oriented gradient. One surface,
	# one material — every rock instance in a chunk shares this via the rock
	# MultiMeshInstance3D leaving material_override unset.
	_rock_material = ShaderMaterial.new()
	_rock_material.shader = RockMatcapShader
	_rock_material.set_shader_parameter("matcap", ROCK_MATCAP_TEX)
	_rock_material.set_shader_parameter("tint", Color(0.55, 0.55, 0.55))
	_rock_material.set_shader_parameter("matcap_tint_strength", 1.0)
	if _rock_mesh != null and _rock_mesh.get_surface_count() >= 1:
		_rock_mesh.surface_set_material(0, _rock_material)

	# Obelisks share the rock matcap shader but tuned for a polished metallic
	# read: low tint strength lets the matcap highlights dominate (smoother,
	# shinier), cool silver-blue tint shifts them away from the warm-gray rock
	# palette so they stand out as worked metal.
	_obelisk_material = ShaderMaterial.new()
	_obelisk_material.shader = RockMatcapShader
	_obelisk_material.set_shader_parameter("matcap", ROCK_MATCAP_TEX)
	_obelisk_material.set_shader_parameter("tint", Color(0.78, 0.82, 0.9))
	_obelisk_material.set_shader_parameter("matcap_tint_strength", 0.3)
	if _obelisk_mesh != null and _obelisk_mesh.get_surface_count() >= 1:
		_obelisk_mesh.surface_set_material(0, _obelisk_material)


func _set_wind_params(mat: ShaderMaterial) -> void:
	mat.set_shader_parameter("wind_strength", WIND_STRENGTH)
	mat.set_shader_parameter("wind_speed", WIND_SPEED)
	mat.set_shader_parameter("wind_mask_y_min", WIND_MASK_Y_MIN)
	mat.set_shader_parameter("wind_mask_y_max", WIND_MASK_Y_MAX)
	mat.set_shader_parameter("wind_spatial_freq", WIND_SPATIAL_FREQ)
	mat.set_shader_parameter("wind_turbulence", WIND_TURBULENCE)


# Trees share the canopy-height mask and spatial frequency with the generic
# wind block, but run at a lower amplitude + less turbulence so big trunks
# don't visibly wobble.
func _apply_tree_wind_params(mat: ShaderMaterial) -> void:
	mat.set_shader_parameter("wind_strength", TREE_WIND_STRENGTH)
	mat.set_shader_parameter("wind_speed", WIND_SPEED)
	mat.set_shader_parameter("wind_mask_y_min", WIND_MASK_Y_MIN)
	mat.set_shader_parameter("wind_mask_y_max", WIND_MASK_Y_MAX)
	mat.set_shader_parameter("wind_spatial_freq", WIND_SPATIAL_FREQ)
	mat.set_shader_parameter("wind_turbulence", TREE_WIND_TURBULENCE)


# Apply fern-specific wind: lower mask window so the whole plant sways, and a
# smaller amplitude so tiny ferns don't displace a full plant-length.
func _apply_fern_wind_params(mat: ShaderMaterial) -> void:
	mat.set_shader_parameter("wind_strength", FERN_WIND_STRENGTH)
	mat.set_shader_parameter("wind_speed", WIND_SPEED)
	mat.set_shader_parameter("wind_mask_y_min", FERN_WIND_MASK_Y_MIN)
	mat.set_shader_parameter("wind_mask_y_max", FERN_WIND_MASK_Y_MAX)
	mat.set_shader_parameter("wind_spatial_freq", WIND_SPATIAL_FREQ)
	mat.set_shader_parameter("wind_turbulence", WIND_TURBULENCE)


# ── Per-chunk ground MMI ───────────────────────────
# Demo 2 used a single global terrain MMI with N instances; Demo 3
# needs one MMI per chunk because each chunk's ground material now
# carries its own splat texture (sampler2D can't ride INSTANCE_CUSTOM).
# Cost is one ShaderMaterial duplicate per active chunk — trivial.

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

	# Phase 1: harvest any density-image bakes that finished on worker
	# threads since last tick. Drop the result on the floor if the chunk
	# is no longer desired (player walked away while it was baking).
	var finalised: Array[Vector2i] = []
	for key: Vector2i in _pending_bakes:
		var entry: Dictionary = _pending_bakes[key]
		if WorkerThreadPool.is_task_completed(entry.task_id):
			WorkerThreadPool.wait_for_task_completion(entry.task_id)
			finalised.append(key)
			if desired.has(key) and entry.job.img != null:
				_finish_chunk_load(key, entry.job.img)
	for key in finalised:
		_pending_bakes.erase(key)

	# Phase 2: kick off async bakes for any desired chunks not yet
	# loaded and not currently baking. Worker threads pick the tasks up
	# — main thread never blocks here.
	for key: Vector2i in desired:
		if not _chunks_state.has(key) and not _pending_bakes.has(key):
			_start_chunk_bake(key)

	# Phase 3: unload chunks no longer desired. Pending bakes for those
	# keys land in Phase 1 next tick and are discarded by the
	# still-desired check.
	var stale: Array[Vector2i] = []
	for key: Vector2i in _chunks_state:
		if not desired.has(key):
			stale.append(key)
	for key in stale:
		var state: Dictionary = _chunks_state[key]
		if state.node != null:
			state.node.queue_free()
		_chunks_state.erase(key)


# Kicks off an async density bake on a worker thread. Main thread returns
# immediately — chunk geometry isn't created until `_finish_chunk_load`
# runs (next frame after the worker completes). Bake is ~few hundred ms;
# main thread keeps drawing the world at full rate during it.
func _start_chunk_bake(key: Vector2i) -> void:
	var job := BakeJob.new()
	job.origin_x = float(key.x) * CHUNK_SIZE
	job.origin_z = float(key.y) * CHUNK_SIZE
	# Worker thread runs only the pure-CPU bake. ImageTexture upload,
	# ShaderMaterial.duplicate, MultiMesh population — anything touching
	# Godot's rendering APIs — must stay on the main thread.
	var task_id: int = WorkerThreadPool.add_task(
		func() -> void:
			job.img = BiomeField.bake_chunk_density_image(
				job.origin_x, job.origin_z, CHUNK_SIZE, BIOME_GRID_N, _biome_config),
		false,
		"terrain-demo-3 chunk bake (%d, %d)" % [key.x, key.y]
	)
	_pending_bakes[key] = { "task_id": task_id, "job": job }


# Runs on the main thread once a worker bake has produced its density
# Image. Builds the per-chunk ground material with the splat texture
# attached, runs the spawn loop using the same Image (CPU bilinear-
# samples the SAME bytes the GPU shader samples → no drift), and wires
# up the chunk's vegetation MMIs.
func _finish_chunk_load(key: Vector2i, density_img: Image) -> void:
	var chunk := Node3D.new()
	chunk.name = "chunk_%d_%d" % [key.x, key.y]
	_chunk_container.add_child(chunk)

	var origin_x: float = float(key.x) * CHUNK_SIZE
	var origin_z: float = float(key.y) * CHUNK_SIZE

	# Per-chunk ground material: duplicate the template, attach this
	# chunk's splat texture and overhang-aware origin/extent. `bake_origin`
	# is shifted half a texel past the chunk's MIN corner because the
	# baked image has 1-texel overhang on every side (see
	# `BiomeField.bake_chunk_density_image`). `texture_world_size` is the
	# extent the texture covers, including overhang on both sides.
	var step: float = CHUNK_SIZE / float(BIOME_GRID_N)
	var splat_tex := ImageTexture.create_from_image(density_img)
	var ground_mat: ShaderMaterial = _ground_material.duplicate()
	ground_mat.set_shader_parameter("splat_tex", splat_tex)
	ground_mat.set_shader_parameter("bake_origin", Vector2(origin_x - step, origin_z - step))
	ground_mat.set_shader_parameter("texture_world_size", float(BAKE_GRID_N) * step)

	var mm_ground := _make_ground_mmi(ground_mat, origin_x, origin_z)
	chunk.add_child(mm_ground)

	# Collect placements BEFORE spawning visuals so we know the exact
	# instance counts for each per-chunk MultiMesh.
	var rng := RandomNumberGenerator.new()
	rng.seed = key.x * 100003 + key.y
	var tree_positions: Array[Dictionary] = []
	var bush_positions: Array[Dictionary] = []
	var fern_positions: Array[Dictionary] = []
	var rock_positions: Array[Dictionary] = []
	_collect_glades(rng, key, density_img, tree_positions, bush_positions, fern_positions)
	# Outer-ring chunks of each zone get an extra dense-canopy pass over
	# their half-chunk-wide border strip (minus any corridor gap). Runs
	# before rock collection so rocks dodge the thickened tree wall, and
	# appended directly to `tree_positions` so trunk colliders, shadows,
	# and the tree MultiMesh all pick them up with no extra bookkeeping.
	var chunk_edges: int = _chunk_edges(_chunk_local(key))
	if chunk_edges != 0:
		var border_rng := RandomNumberGenerator.new()
		border_rng.seed = key.x * 100003 + key.y + 0xB0DE
		_collect_border_trees(border_rng, key, chunk_edges, tree_positions)
	_collect_rocks(rng, key, tree_positions, bush_positions, fern_positions, rock_positions)

	var tree_count: int = tree_positions.size()
	var bush_count: int = bush_positions.size()
	var fern_count: int = fern_positions.size()
	var rock_count: int = rock_positions.size()

	var mm_tree := _make_vegetation_mmi(_tree_mesh, tree_count)
	var mm_bush := _make_vegetation_mmi(_bush_foliage_mesh, bush_count)
	var mm_fern := _make_vegetation_mmi(_fern_foliage_mesh, fern_count)
	# Rocks: same MMI shape as vegetation but no per-instance custom data —
	# no wind, no push, no dither-fade. Leaves material_override unset so the
	# per-surface rock material on _rock_mesh is used for all instances.
	var mm_rock := _make_rock_mmi(_rock_mesh, rock_count)
	var mm_rock_shadow := _make_shadow_mmi(_blob_shadow_material, rock_count)
	# Shadow MultiMeshes: one per veg type, sharing the unit-quad shadow mesh
	# with per-instance transforms encoding world position + scale. Trees use
	# the dark material, bushes/ferns the light material.
	var mm_tree_shadow := _make_shadow_mmi(_blob_shadow_material, tree_count)
	var mm_bush_shadow := _make_shadow_mmi(_bush_shadow_material, bush_count)
	var mm_fern_shadow := _make_shadow_mmi(_bush_shadow_material, fern_count)
	chunk.add_child(mm_tree)
	chunk.add_child(mm_bush)
	chunk.add_child(mm_fern)
	chunk.add_child(mm_rock)
	chunk.add_child(mm_tree_shadow)
	chunk.add_child(mm_bush_shadow)
	chunk.add_child(mm_fern_shadow)
	chunk.add_child(mm_rock_shadow)

	for i in rock_count:
		var r: Dictionary = rock_positions[i]
		mm_rock.multimesh.set_instance_transform(i, r.xform)
		mm_rock_shadow.multimesh.set_instance_transform(i, _shadow_xform(
			r.xz, r.scale * ROCK_SHADOW_SIZE_MULT))
		if r.has_collider:
			_spawn_rock_collider(chunk, Vector3(r.xz.x, 0.0, r.xz.y), r.scale)

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

	if chunk_edges != 0:
		_spawn_zone_border_walls(chunk, key, chunk_edges)
	_spawn_zone_obelisks(chunk, key)

	_chunks_state[key] = {
		"node": chunk,
		"mm_ground": mm_ground,
		"density_img": density_img,
		"mm_tree": mm_tree,
		"mm_bush": mm_bush,
		"mm_fern": mm_fern,
		"mm_rock": mm_rock,
		"mm_tree_shadow": mm_tree_shadow,
		"mm_bush_shadow": mm_bush_shadow,
		"mm_fern_shadow": mm_fern_shadow,
		"mm_rock_shadow": mm_rock_shadow,
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


# Rock MMI: same shape as vegetation but no per-instance custom data (rocks
# don't participate in wind / push / fade). Kept separate so the toggle is
# explicit at the callsite rather than via a bool flag.
func _make_rock_mmi(mesh: ArrayMesh, count: int) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = false
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


# ── Meadow-zone classifier ─────────────────────────
# Hash/FBM math lives in `core/biome_field.gd` (mirrored to
# `assets/shaders/terrain_splat_v2.gdshader`). Placement code never calls
# FBM directly — it bilinear-samples the per-chunk density Image baked
# in `_start_chunk_bake`. The same Image is bound to the ground material's
# `splat_tex`, so CPU and GPU read identical bytes → no possible drift.

func _is_meadow_at(img: Image, origin_x: float, origin_z: float,
		wx: float, wz: float) -> bool:
	var density: float = BiomeField.sample_density_image_bilinear(
		img, wx - origin_x, wz - origin_z, CHUNK_SIZE, BIOME_GRID_N)
	return BiomeField.is_meadow(density, _biome_config)


# ── Position generation (no visuals, just xforms) ──

func _collect_glades(rng: RandomNumberGenerator, key: Vector2i,
		density_img: Image,
		tree_out: Array[Dictionary], bush_out: Array[Dictionary],
		fern_out: Array[Dictionary]) -> void:
	# Place vegetation in tree-anchored clusters, layered ferns → bushes →
	# trees. Placement ignores the splat field entirely; the final step re-
	# samples it and culls anything that landed in a meadow pocket, so the
	# meadow visibly carves out its zones from a pine-forest default.
	var chunk_ox: float = float(key.x) * CHUNK_SIZE
	var chunk_oz: float = float(key.y) * CHUNK_SIZE
	var margin: float = 2.0
	var scatter_ox: float = chunk_ox + margin
	var scatter_oz: float = chunk_oz + margin
	var span: float = CHUNK_SIZE - margin * 2.0

	# ── Tree scatter (everywhere, meadow-rejected) ──
	var placed_trees: Array[Dictionary] = []
	var tree_candidates: int = 0
	var tree_rej_meadow: int = 0
	var tree_rej_near: int = 0
	var tree_cells: int = int(ceil(span / TREE_GRID_CELL))
	for gi in range(tree_cells):
		for gj in range(tree_cells):
			tree_candidates += 1
			var base_x: float = scatter_ox + (float(gi) + 0.5) * TREE_GRID_CELL
			var base_z: float = scatter_oz + (float(gj) + 0.5) * TREE_GRID_CELL
			var wx: float = base_x + (rng.randf() - 0.5) * TREE_JITTER * 2.0
			var wz: float = base_z + (rng.randf() - 0.5) * TREE_JITTER * 2.0
			if _is_meadow_at(density_img, chunk_ox, chunk_oz, wx, wz):
				tree_rej_meadow += 1
				continue
			if _exit_clearance_contains(wx, wz):
				continue
			if _near_obelisk_exclusion(wx, wz):
				continue
			var too_close: bool = false
			for p: Dictionary in placed_trees:
				var ddx: float = p.x - wx
				var ddz: float = p.z - wz
				if ddx * ddx + ddz * ddz < TREE_MIN_DIST * TREE_MIN_DIST:
					too_close = true
					break
			if too_close:
				tree_rej_near += 1
				continue
			var diameter: float = lerp(TREE_DIAMETER_MIN, TREE_DIAMETER_MAX, rng.randf())
			var sc: float = diameter * TREE_SCALE_FACTOR * lerp(0.8, 1.6, rng.randf())
			var ry: float = rng.randf() * TAU
			var xform := _make_world_xform(Vector2(wx, wz), sc, ry)
			tree_out.append({"xz": Vector2(wx, wz), "scale": sc, "xform": xform})
			placed_trees.append({"x": wx, "z": wz, "diameter": diameter, "scale": sc})

	# ── Per-tree fern ring ────────────────────────
	# Every tree skirts itself with a tight fern ring — short-radius, no
	# overlap with other layers (bushes are placed separately in the gaps).
	for t: Dictionary in placed_trees:
		_collect_ferns_around_tree(rng, Vector2(t.x, t.z), t.scale,
			placed_trees, density_img, chunk_ox, chunk_oz, fern_out)

	# ── Isolated fern patches (no tree nucleus) ───
	# Standalone clumps dropped in the forest interior. Runs after the
	# per-tree rings so the proximity check can steer clear of them; the
	# bush-cluster pass below already avoids all ferns.
	var iso_fern_tree_avoid_sq: float = FERN_ISO_ANCHOR_TREE_MIN_DIST * FERN_ISO_ANCHOR_TREE_MIN_DIST
	var iso_fern_fern_avoid_sq: float = FERN_ISO_ANCHOR_FERN_MIN_DIST * FERN_ISO_ANCHOR_FERN_MIN_DIST
	var iso_fern_target: int = rng.randi_range(
		FERN_ISO_CLUSTERS_PER_CHUNK_MIN, FERN_ISO_CLUSTERS_PER_CHUNK_MAX)
	for _c in range(iso_fern_target):
		for _attempt in range(FERN_ISO_ANCHOR_PLACEMENT_ATTEMPTS):
			var ax: float = scatter_ox + rng.randf() * span
			var az: float = scatter_oz + rng.randf() * span
			if _is_meadow_at(density_img, chunk_ox, chunk_oz, ax, az):
				continue
			if _exit_clearance_contains(ax, az):
				continue
			var near_tree: bool = false
			for p: Dictionary in placed_trees:
				var ddx: float = p.x - ax
				var ddz: float = p.z - az
				if ddx * ddx + ddz * ddz < iso_fern_tree_avoid_sq:
					near_tree = true
					break
			if near_tree:
				continue
			var near_fern: bool = false
			for f: Dictionary in fern_out:
				var ddx2: float = f.xz.x - ax
				var ddz2: float = f.xz.y - az
				if ddx2 * ddx2 + ddz2 * ddz2 < iso_fern_fern_avoid_sq:
					near_fern = true
					break
			if near_fern:
				continue
			var count: int = rng.randi_range(FERN_ISO_PER_CLUSTER_MIN, FERN_ISO_PER_CLUSTER_MAX)
			for i in range(count):
				var theta: float = rng.randf() * TAU
				var r: float = sqrt(rng.randf()) * FERN_ISO_CLUSTER_RADIUS
				var fwx: float = ax + cos(theta) * r
				var fwz: float = az + sin(theta) * r
				if _is_meadow_at(density_img, chunk_ox, chunk_oz, fwx, fwz):
					continue
				if _exit_clearance_contains(fwx, fwz):
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
			break

	# ── Fern rings around obelisks ────────────────
	# The bush/rock/tree exclusion opened a dead ring around each obelisk in
	# this chunk. Fill it with ferns so the markers read as tended. Same dict
	# shape as every other fern pass so shadows/wind/push pick them up.
	if _obelisk_aabb_height > 0.0:
		var excl_r: float = _obelisk_aabb_height * OBELISK_SCALE * OBELISK_NO_TREE_HEIGHT_MULT
		var chunk_rect := Rect2(Vector2(chunk_ox, chunk_oz), Vector2(CHUNK_SIZE, CHUNK_SIZE))
		for info: Dictionary in _obelisk_world_positions(_chunk_zone(key)):
			var op: Vector3 = info.pos
			if not chunk_rect.has_point(Vector2(op.x, op.z)):
				continue
			var count: int = rng.randi_range(FERN_AROUND_OBELISK_COUNT_MIN,
				FERN_AROUND_OBELISK_COUNT_MAX)
			var inner: float = excl_r * FERN_AROUND_OBELISK_INNER_MULT
			var outer: float = excl_r * FERN_AROUND_OBELISK_OUTER_MULT
			for i in range(count):
				var theta: float = rng.randf() * TAU
				var r: float = lerp(inner, outer, sqrt(rng.randf()))
				var fwx: float = op.x + cos(theta) * r
				var fwz: float = op.z + sin(theta) * r
				if _is_meadow_at(density_img, chunk_ox, chunk_oz, fwx, fwz):
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

	# ── Bush clumps in open gaps ──────────────────
	# Bushes form standalone clumps in the breaks between trees. Anchor
	# candidates are drawn uniformly across the chunk, then rejected if they
	# sit inside a meadow, too close to a tree, or inside a fern skirt. Each
	# survivor drops a tightly-packed clump.
	var bush_clusters_placed: int = 0
	var bush_cluster_target: int = rng.randi_range(
		BUSH_CLUSTERS_PER_CHUNK_MIN, BUSH_CLUSTERS_PER_CHUNK_MAX)
	var tree_avoid_sq: float = BUSH_ANCHOR_TREE_MIN_DIST * BUSH_ANCHOR_TREE_MIN_DIST
	var fern_avoid_sq: float = BUSH_ANCHOR_FERN_MIN_DIST * BUSH_ANCHOR_FERN_MIN_DIST
	for _c in range(bush_cluster_target):
		var placed_anchor: bool = false
		for _attempt in range(BUSH_ANCHOR_PLACEMENT_ATTEMPTS):
			var cx: float = scatter_ox + rng.randf() * span
			var cz: float = scatter_oz + rng.randf() * span
			# Demo 3 rule swap: bushes spawn in meadow ONLY (Demo 2 had
			# the opposite gate — bushes in forest gaps).
			if not _is_meadow_at(density_img, chunk_ox, chunk_oz, cx, cz):
				continue
			if _exit_clearance_contains(cx, cz):
				continue
			if _near_obelisk_exclusion(cx, cz):
				continue
			var near_tree: bool = false
			for p: Dictionary in placed_trees:
				var ddx: float = p.x - cx
				var ddz: float = p.z - cz
				if ddx * ddx + ddz * ddz < tree_avoid_sq:
					near_tree = true
					break
			if near_tree:
				continue
			var near_fern: bool = false
			for f: Dictionary in fern_out:
				var ddx: float = f.xz.x - cx
				var ddz: float = f.xz.y - cz
				if ddx * ddx + ddz * ddz < fern_avoid_sq:
					near_fern = true
					break
			if near_fern:
				continue
			_spawn_bush_cluster(rng, cx, cz, placed_trees,
				density_img, chunk_ox, chunk_oz, bush_out)
			bush_clusters_placed += 1
			placed_anchor = true
			break
		if not placed_anchor:
			continue

	if DEBUG_LOG_VEGETATION:
		print("[veg] chunk=(%d,%d) trees=%d/%d (rej_meadow=%d rej_near=%d) ferns=%d bush_clusters=%d/%d bushes=%d"
			% [key.x, key.y, placed_trees.size(), tree_candidates,
				tree_rej_meadow, tree_rej_near,
				fern_out.size(),
				bush_clusters_placed, bush_cluster_target, bush_out.size()])

	_last_log_chunk = key
	_last_log_trees = tree_out.size()
	_last_log_bushes = bush_out.size()
	_last_log_ferns = fern_out.size()


# Tight fern ring hugging a single tree's canopy footprint. Ferns are small
# enough that we allow them to overlap each other freely; we only reject
# placements that'd land inside a tree trunk.
func _collect_ferns_around_tree(rng: RandomNumberGenerator, tree_xz: Vector2,
		tree_sc: float, placed: Array[Dictionary],
		density_img: Image, chunk_ox: float, chunk_oz: float,
		fern_out: Array[Dictionary]) -> void:
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
		if _is_meadow_at(density_img, chunk_ox, chunk_oz, fwx, fwz):
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


# Rock clusters: three concentric tiers of rocks around random anchor points
# in the chunk. Anchors aren't biome-gated (rocks belong in meadow + forest
# alike), but each rock placement is rejected if it would overlap an
# already-placed tree / bush / fern. Rotations fully randomised (Y spin +
# small tilt on X/Z); scales spread per tier for natural-looking piles.
#
# Each output dict carries `has_collider` so `_load_chunk` knows whether to
# spawn a StaticBody3D. Small rocks skip colliders so the player walks
# through them as visual ground clutter.
func _collect_rocks(rng: RandomNumberGenerator, key: Vector2i,
		tree_positions: Array[Dictionary],
		bush_positions: Array[Dictionary],
		fern_positions: Array[Dictionary],
		rock_out: Array[Dictionary]) -> void:
	var ox: float = float(key.x) * CHUNK_SIZE
	var oz: float = float(key.y) * CHUNK_SIZE
	var margin: float = ROCK_CLUSTER_ANCHOR_MARGIN
	var span: float = CHUNK_SIZE - margin * 2.0

	# Flatten vegetation into a single avoid list with per-entry radii.
	var avoid: Array[Dictionary] = []
	for t: Dictionary in tree_positions:
		avoid.append({"x": t.xz.x, "z": t.xz.y, "r": float(t.scale) * ROCK_AVOID_TREE_MULT})
	for b: Dictionary in bush_positions:
		avoid.append({"x": b.xz.x, "z": b.xz.y, "r": float(b.scale) * ROCK_AVOID_BUSH_MULT})
	for f: Dictionary in fern_positions:
		avoid.append({"x": f.xz.x, "z": f.xz.y, "r": float(f.scale) * ROCK_AVOID_FERN_MULT})

	var cluster_count: int = rng.randi_range(
		ROCK_CLUSTERS_PER_CHUNK_MIN, ROCK_CLUSTERS_PER_CHUNK_MAX)
	for _c in cluster_count:
		# Anchor: try a few positions; accept the first one far from any
		# vegetation. Fail open — if we can't find a clear spot, we skip
		# this cluster rather than plant it on top of a tree.
		var cx: float = 0.0
		var cz: float = 0.0
		var anchor_ok: bool = false
		for _try in ROCK_PLACEMENT_ATTEMPTS:
			cx = ox + margin + rng.randf() * span
			cz = oz + margin + rng.randf() * span
			if _exit_clearance_contains(cx, cz):
				continue
			if _near_obelisk_exclusion(cx, cz):
				continue
			if _rock_pos_clear(cx, cz, ROCK_ANCHOR_CLEARANCE, avoid):
				anchor_ok = true
				break
		if not anchor_ok:
			continue

		_append_rock_ring(rng, cx, cz,
			ROCK_LARGE_COUNT_MIN, ROCK_LARGE_COUNT_MAX,
			ROCK_LARGE_RING_R_INNER, ROCK_LARGE_RING_R_OUTER,
			ROCK_LARGE_SCALE_MIN, ROCK_LARGE_SCALE_MAX,
			avoid, rock_out)
		_append_rock_ring(rng, cx, cz,
			ROCK_MED_COUNT_MIN, ROCK_MED_COUNT_MAX,
			ROCK_MED_RING_R_INNER, ROCK_MED_RING_R_OUTER,
			ROCK_MED_SCALE_MIN, ROCK_MED_SCALE_MAX,
			avoid, rock_out)
		_append_rock_ring(rng, cx, cz,
			ROCK_SMALL_COUNT_MIN, ROCK_SMALL_COUNT_MAX,
			ROCK_SMALL_RING_R_INNER, ROCK_SMALL_RING_R_OUTER,
			ROCK_SMALL_SCALE_MIN, ROCK_SMALL_SCALE_MAX,
			avoid, rock_out)


# Rejection sampler: returns true if (wx, wz) is at least `self_r` from every
# entry's (x, z) plus that entry's own `r`. Linear scan — vegetation counts
# per chunk are ≤ a few hundred so this is cheap.
static func _rock_pos_clear(wx: float, wz: float, self_r: float,
		avoid: Array[Dictionary]) -> bool:
	for e: Dictionary in avoid:
		var dx: float = float(e.x) - wx
		var dz: float = float(e.z) - wz
		var min_d: float = self_r + float(e.r)
		if dx * dx + dz * dz < min_d * min_d:
			return false
	return true


func _append_rock_ring(rng: RandomNumberGenerator, cx: float, cz: float,
		count_min: int, count_max: int,
		r_inner: float, r_outer: float,
		scale_min: float, scale_max: float,
		avoid: Array[Dictionary],
		rock_out: Array[Dictionary]) -> void:
	var count: int = rng.randi_range(count_min, count_max)
	for _i in count:
		var placed: bool = false
		for _try in ROCK_PLACEMENT_ATTEMPTS:
			var theta: float = rng.randf() * TAU
			var r: float = lerp(r_inner, r_outer, sqrt(rng.randf()))
			var wx: float = cx + cos(theta) * r
			var wz: float = cz + sin(theta) * r
			if _exit_clearance_contains(wx, wz):
				continue
			if _near_obelisk_exclusion(wx, wz):
				continue
			var sc: float = lerp(scale_min, scale_max, rng.randf())
			# Own clearance scales with rock size so a big rock pushes
			# further from vegetation than a small pebble does.
			if not _rock_pos_clear(wx, wz, sc * 0.6, avoid):
				continue
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
			placed = true
			break
		if not placed:
			continue


# Drop a tight clump of bushes around an open-ground anchor at (cx, cz).
# Callers verify the anchor is clear of trees, ferns, and meadow; here we
# just pack BUSH_PER_CLUSTER bushes around it. First bush sits dead-centre
# at full size to anchor the clump silhouette; the rest scatter inside
# BUSH_CLUSTER_RADIUS with smaller sizes for a lumpy edge.
func _spawn_bush_cluster(rng: RandomNumberGenerator, cx: float, cz: float,
		placed_trees: Array[Dictionary],
		density_img: Image, chunk_ox: float, chunk_oz: float,
		bush_out: Array[Dictionary]) -> void:
	var bush_count: int = rng.randi_range(BUSH_PER_CLUSTER_MIN, BUSH_PER_CLUSTER_MAX)
	var cluster_placed: Array[Dictionary] = []
	for i in range(bush_count):
		var offset_dist: float
		var size_t: float  # 0 = largest (centre), 1 = smallest (fringe)
		if i == 0:
			offset_dist = 0.0
			size_t = 0.0
		else:
			offset_dist = rng.randf_range(0.4, BUSH_CLUSTER_RADIUS)
			size_t = lerp(0.3, 1.0, rng.randf())
		var offset_angle: float = rng.randf() * TAU
		var bwx: float = cx + cos(offset_angle) * offset_dist
		var bwz: float = cz + sin(offset_angle) * offset_dist
		var diameter: float = lerp(2.1, 1.0, size_t)
		# Don't land on a tree trunk.
		var on_trunk: bool = false
		for p: Dictionary in placed_trees:
			var min_dist: float = maxf(diameter, p.diameter) * BUSH_MIN_DIST_MULT
			var ddx: float = p.x - bwx
			var ddz: float = p.z - bwz
			if ddx * ddx + ddz * ddz < min_dist * min_dist:
				on_trunk = true
				break
		if on_trunk:
			continue
		# Overlap check against sibling bushes.
		var sibling_collides: bool = false
		for cb: Dictionary in cluster_placed:
			var min_d: float = maxf(diameter, cb.diameter) * BUSH_MIN_DIST_MULT
			var ddx: float = cb.x - bwx
			var ddz: float = cb.z - bwz
			if ddx * ddx + ddz * ddz < min_d * min_d:
				sibling_collides = true
				break
		if sibling_collides:
			continue
		# Demo 3 rule swap: bushes spawn in meadow ONLY.
		if not _is_meadow_at(density_img, chunk_ox, chunk_oz, bwx, bwz):
			continue
		if _exit_clearance_contains(bwx, bwz):
			continue
		if _near_obelisk_exclusion(bwx, bwz):
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


# Rock collider: squat cylinder at the base of the rock. Deliberately shorter
# and narrower than the visible mesh so the player (a capsule pinned to
# GROUND_Y) slides around the rock's footprint but the rock's visible upper
# silhouette can still overlap the camera-facing side of the player — reads
# as walking past/over the stone rather than into a hard wall. Only spawned
# for rocks with `has_collider == true` (scale ≥ ROCK_COLLIDER_MIN_SCALE);
# small rocks are collider-free so the player walks through them entirely.
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


# ── Zone layout ────────────────────────────────────

static func _chunk_zone(key: Vector2i) -> Vector2i:
	return Vector2i(
		floori(float(key.x) / float(ZONE_CHUNKS_PER_SIDE)),
		floori(float(key.y) / float(ZONE_CHUNKS_PER_SIDE)))


static func _chunk_local(key: Vector2i) -> Vector2i:
	var zone := _chunk_zone(key)
	return Vector2i(
		key.x - zone.x * ZONE_CHUNKS_PER_SIDE,
		key.y - zone.y * ZONE_CHUNKS_PER_SIDE)


static func _chunk_edges(local: Vector2i) -> int:
	var m: int = 0
	if local.x == 0:
		m |= ZONE_EDGE_W
	if local.x == ZONE_CHUNKS_PER_SIDE - 1:
		m |= ZONE_EDGE_E
	if local.y == 0:
		m |= ZONE_EDGE_N
	if local.y == ZONE_CHUNKS_PER_SIDE - 1:
		m |= ZONE_EDGE_S
	return m


# Middle-of-edge chunks carry a corridor. Only one edge ever qualifies for
# a given chunk — exit coords are (mid, 0), (0, mid), (mid, last), (last, mid)
# and are never corners — so the return value is a single edge bit, or 0.
static func _is_exit_edge(local: Vector2i) -> int:
	if local.x == ZONE_EDGE_MID_INDEX and local.y == 0:
		return ZONE_EDGE_N
	if local.x == ZONE_EDGE_MID_INDEX and local.y == ZONE_CHUNKS_PER_SIDE - 1:
		return ZONE_EDGE_S
	if local.y == ZONE_EDGE_MID_INDEX and local.x == 0:
		return ZONE_EDGE_W
	if local.y == ZONE_EDGE_MID_INDEX and local.x == ZONE_CHUNKS_PER_SIDE - 1:
		return ZONE_EDGE_E
	return 0


# Axis-aligned rectangle (world XZ) of the half-chunk-wide strip along each
# outer edge of this chunk. Corner chunks return two rects whose 32×32 overlap
# is deduped by the scatter's min-distance test.
static func _border_rects_for_edges(key: Vector2i, edges: int) -> Array[Rect2]:
	var ox: float = float(key.x) * CHUNK_SIZE
	var oz: float = float(key.y) * CHUNK_SIZE
	var rects: Array[Rect2] = []
	if edges & ZONE_EDGE_W:
		rects.append(Rect2(Vector2(ox, oz), Vector2(ZONE_BORDER_STRIP_M, CHUNK_SIZE)))
	if edges & ZONE_EDGE_E:
		rects.append(Rect2(Vector2(ox + CHUNK_SIZE - ZONE_BORDER_STRIP_M, oz),
			Vector2(ZONE_BORDER_STRIP_M, CHUNK_SIZE)))
	if edges & ZONE_EDGE_N:
		rects.append(Rect2(Vector2(ox, oz), Vector2(CHUNK_SIZE, ZONE_BORDER_STRIP_M)))
	if edges & ZONE_EDGE_S:
		rects.append(Rect2(Vector2(ox, oz + CHUNK_SIZE - ZONE_BORDER_STRIP_M),
			Vector2(CHUNK_SIZE, ZONE_BORDER_STRIP_M)))
	return rects


# True if the world point (wx, wz) falls inside the clearing skirted around
# any of the four exit corridors of its zone. The skirt extends past the
# border strip into the zone interior so the approach to a corridor is
# visibly cleared of vegetation, not just the corridor throat itself.
# No-tree zone around each obelisk (2× scaled obelisk height by default).
# Returns true for any point within the exclusion radius of any of its zone's
# eight obelisks. Requires `_obelisk_aabb_height` to have been probed first.
func _near_obelisk_exclusion(wx: float, wz: float) -> bool:
	if _obelisk_aabb_height <= 0.0:
		return false
	var radius: float = _obelisk_aabb_height * OBELISK_SCALE * OBELISK_NO_TREE_HEIGHT_MULT
	var r2: float = radius * radius
	var zone_size: float = float(ZONE_CHUNKS_PER_SIDE) * CHUNK_SIZE
	var zone := Vector2i(floori(wx / zone_size), floori(wz / zone_size))
	for info: Dictionary in _obelisk_world_positions(zone):
		var p: Vector3 = info.pos
		var ddx: float = p.x - wx
		var ddz: float = p.z - wz
		if ddx * ddx + ddz * ddz < r2:
			return true
	return false


static func _exit_clearance_contains(wx: float, wz: float) -> bool:
	var zone_size: float = float(ZONE_CHUNKS_PER_SIDE) * CHUNK_SIZE
	var lx: float = fposmod(wx, zone_size)
	var lz: float = fposmod(wz, zone_size)
	var edge_mid: float = zone_size * 0.5
	var half_w: float = ZONE_CORRIDOR_WIDTH_M * 0.5 + EXIT_CLEAR_SIDE_MARGIN_M
	var depth: float = ZONE_BORDER_STRIP_M + EXIT_CLEAR_INTERIOR_REACH_M
	if lz <= depth and absf(lx - edge_mid) <= half_w:
		return true
	if lz >= zone_size - depth and absf(lx - edge_mid) <= half_w:
		return true
	if lx <= depth and absf(lz - edge_mid) <= half_w:
		return true
	if lx >= zone_size - depth and absf(lz - edge_mid) <= half_w:
		return true
	return false


# Rect covering the corridor opening (world XZ) for exit chunks, or an empty
# Rect2 for interior / corner / non-exit border chunks.
static func _corridor_rect_for_chunk(key: Vector2i) -> Rect2:
	var exit_edge: int = _is_exit_edge(_chunk_local(key))
	if exit_edge == 0:
		return Rect2()
	var ox: float = float(key.x) * CHUNK_SIZE
	var oz: float = float(key.y) * CHUNK_SIZE
	var half: float = ZONE_CORRIDOR_WIDTH_M * 0.5
	var cx: float = ox + CHUNK_SIZE * 0.5
	var cz: float = oz + CHUNK_SIZE * 0.5
	if exit_edge == ZONE_EDGE_N:
		return Rect2(Vector2(cx - half, oz),
			Vector2(ZONE_CORRIDOR_WIDTH_M, ZONE_BORDER_STRIP_M))
	if exit_edge == ZONE_EDGE_S:
		return Rect2(Vector2(cx - half, oz + CHUNK_SIZE - ZONE_BORDER_STRIP_M),
			Vector2(ZONE_CORRIDOR_WIDTH_M, ZONE_BORDER_STRIP_M))
	if exit_edge == ZONE_EDGE_W:
		return Rect2(Vector2(ox, cz - half),
			Vector2(ZONE_BORDER_STRIP_M, ZONE_CORRIDOR_WIDTH_M))
	# ZONE_EDGE_E
	return Rect2(Vector2(ox + CHUNK_SIZE - ZONE_BORDER_STRIP_M, cz - half),
		Vector2(ZONE_BORDER_STRIP_M, ZONE_CORRIDOR_WIDTH_M))


# Dense tree scatter over each outer-strip rect of a zone-boundary chunk.
# Ignores the biome field so meadow noise can't punch a hole in the wall;
# rejects candidates that fall inside the corridor rect of an exit chunk;
# respects a relaxed min-distance against every tree already placed so the
# canopy reads unbroken but individual crowns don't stack.
func _collect_border_trees(rng: RandomNumberGenerator, key: Vector2i, edges: int,
		tree_out: Array[Dictionary]) -> void:
	var rects := _border_rects_for_edges(key, edges)
	var corridor := _corridor_rect_for_chunk(key)
	var has_corridor: bool = corridor.size.x > 0.0
	var min_dist_sq: float = ZONE_BORDER_TREE_MIN_DIST * ZONE_BORDER_TREE_MIN_DIST
	for rect: Rect2 in rects:
		var cx_count: int = int(ceil(rect.size.x / ZONE_BORDER_TREE_CELL))
		var cz_count: int = int(ceil(rect.size.y / ZONE_BORDER_TREE_CELL))
		for gi in cx_count:
			for gj in cz_count:
				var bx: float = rect.position.x + (float(gi) + 0.5) * ZONE_BORDER_TREE_CELL
				var bz: float = rect.position.y + (float(gj) + 0.5) * ZONE_BORDER_TREE_CELL
				var wx: float = bx + (rng.randf() - 0.5) * ZONE_BORDER_TREE_JITTER * 2.0
				var wz: float = bz + (rng.randf() - 0.5) * ZONE_BORDER_TREE_JITTER * 2.0
				# Jitter can push outside the rect — clamp so trees stay
				# inside the 32 m strip and don't spill into the zone interior.
				wx = clampf(wx, rect.position.x, rect.position.x + rect.size.x)
				wz = clampf(wz, rect.position.y, rect.position.y + rect.size.y)
				if has_corridor and corridor.has_point(Vector2(wx, wz)):
					continue
				if _exit_clearance_contains(wx, wz):
					continue
				if _near_obelisk_exclusion(wx, wz):
					continue
				var too_close: bool = false
				for p: Dictionary in tree_out:
					var ddx: float = p.xz.x - wx
					var ddz: float = p.xz.y - wz
					if ddx * ddx + ddz * ddz < min_dist_sq:
						too_close = true
						break
				if too_close:
					continue
				var diameter: float = lerp(TREE_DIAMETER_MIN, TREE_DIAMETER_MAX, rng.randf())
				var sc: float = diameter * TREE_SCALE_FACTOR * lerp(0.8, 1.6, rng.randf())
				var ry: float = rng.randf() * TAU
				var xform := _make_world_xform(Vector2(wx, wz), sc, ry)
				tree_out.append({"xz": Vector2(wx, wz), "scale": sc, "xform": xform})


# Marker obelisks flanking each exit corridor. Placed at the inner corner
# of the exit clearance so they sit in a border chunk (always loaded when
# the player nears an edge) and frame the corridor entrance. Rendered via
# MultiMeshInstance3D like the rest of the vegetation — one MMI per chunk
# that hosts obelisks, plus a per-instance StaticBody3D for collision.
func _spawn_zone_obelisks(parent: Node3D, key: Vector2i) -> void:
	if _obelisk_mesh == null or _obelisk_material == null:
		return
	var zone: Vector2i = _chunk_zone(key)
	var ox: float = float(key.x) * CHUNK_SIZE
	var oz: float = float(key.y) * CHUNK_SIZE
	var chunk_rect := Rect2(Vector2(ox, oz), Vector2(CHUNK_SIZE, CHUNK_SIZE))
	var placements: Array[Dictionary] = []
	for info: Dictionary in _obelisk_world_positions(zone):
		var p: Vector3 = info.pos
		if chunk_rect.has_point(Vector2(p.x, p.z)):
			placements.append(info)
	if placements.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = false
	mm.mesh = _obelisk_mesh
	mm.instance_count = placements.size()
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "mm_obelisks"
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mmi)
	var aabb: AABB = _obelisk_mesh.get_aabb()
	var aabb_ok: bool = aabb.size.length_squared() > 0.0
	for i in placements.size():
		var info: Dictionary = placements[i]
		var p: Vector3 = info.pos
		var y_rot: float = float(info.yrot)
		var rot_only := Basis.IDENTITY.rotated(Vector3.UP, y_rot) if y_rot != 0.0 else Basis.IDENTITY
		var scaled_basis := rot_only.scaled(Vector3(OBELISK_SCALE, OBELISK_SCALE, OBELISK_SCALE))
		mm.set_instance_transform(i, Transform3D(scaled_basis, Vector3(p.x, 0.0, p.z)))
		if aabb_ok:
			var body := StaticBody3D.new()
			var col := CollisionShape3D.new()
			var shape := BoxShape3D.new()
			# Pre-scale the collider in world units so the physics body keeps a
			# unit basis (Godot's physics engine dislikes non-unit scales).
			shape.size = aabb.size * OBELISK_SCALE
			col.shape = shape
			col.position = (aabb.position + aabb.size * 0.5) * OBELISK_SCALE
			body.add_child(col)
			body.transform = Transform3D(rot_only, Vector3(p.x, 0.0, p.z))
			parent.add_child(body)
	print("[obelisk] chunk=", key, " zone=", zone, " spawned=", placements.size())


static func _obelisk_world_positions(zone: Vector2i) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var zs: float = float(ZONE_CHUNKS_PER_SIDE) * CHUNK_SIZE
	var zone_ox: float = float(zone.x) * zs
	var zone_oz: float = float(zone.y) * zs
	var mid: float = zs * 0.5
	var dist: float = OBELISK_DEPTH_M
	var off: float = OBELISK_SIDE_OFFSET_M
	# N — corridor at (mid, 0), path runs inward along +z.
	out.append({"pos": Vector3(zone_ox + mid - off, 0.0, zone_oz + dist), "yrot": 0.0})
	out.append({"pos": Vector3(zone_ox + mid + off, 0.0, zone_oz + dist), "yrot": 0.0})
	# S — corridor at (mid, zs), path runs inward along -z.
	out.append({"pos": Vector3(zone_ox + mid - off, 0.0, zone_oz + zs - dist), "yrot": 0.0})
	out.append({"pos": Vector3(zone_ox + mid + off, 0.0, zone_oz + zs - dist), "yrot": 0.0})
	# W — corridor at (0, mid), path runs inward along +x.
	out.append({"pos": Vector3(zone_ox + dist, 0.0, zone_oz + mid - off), "yrot": PI * 0.5})
	out.append({"pos": Vector3(zone_ox + dist, 0.0, zone_oz + mid + off), "yrot": PI * 0.5})
	# E — corridor at (zs, mid), path runs inward along -x.
	out.append({"pos": Vector3(zone_ox + zs - dist, 0.0, zone_oz + mid - off), "yrot": PI * 0.5})
	out.append({"pos": Vector3(zone_ox + zs - dist, 0.0, zone_oz + mid + off), "yrot": PI * 0.5})
	return out


# Tall box-shape collider along each outer edge of a zone-boundary chunk.
# For exit chunks the wall is split into two flanks with a corridor-width
# gap so the player can walk through into the neighbouring zone.
func _spawn_zone_border_walls(parent: Node3D, key: Vector2i, edges: int) -> void:
	var ox: float = float(key.x) * CHUNK_SIZE
	var oz: float = float(key.y) * CHUNK_SIZE
	var exit_edge: int = _is_exit_edge(_chunk_local(key))
	if exit_edge != 0:
		_spawn_zone_corridor_trigger(parent, key, exit_edge)
	var half_thick: float = ZONE_BORDER_STRIP_M * 0.5
	var half_h: float = ZONE_WALL_HEIGHT_M * 0.5
	# Physical gap matches the VISUAL clearing (corridor + side clearance on
	# each flank) so invisible walls never spill past the treeline into the
	# cleared approach. Without this, the 8m-wide corridor gap left the
	# 5m-wide clearance margins blocked by the flanking wall segments.
	var gap_width: float = ZONE_CORRIDOR_WIDTH_M + 2.0 * EXIT_CLEAR_SIDE_MARGIN_M
	var side_len: float = (CHUNK_SIZE - gap_width) * 0.5
	if edges & ZONE_EDGE_W:
		_spawn_edge_wall_segment(parent, ox + half_thick, oz, true,
			exit_edge == ZONE_EDGE_W, half_h, side_len)
	if edges & ZONE_EDGE_E:
		_spawn_edge_wall_segment(parent, ox + CHUNK_SIZE - half_thick, oz, true,
			exit_edge == ZONE_EDGE_E, half_h, side_len)
	if edges & ZONE_EDGE_N:
		_spawn_edge_wall_segment(parent, oz + half_thick, ox, false,
			exit_edge == ZONE_EDGE_N, half_h, side_len)
	if edges & ZONE_EDGE_S:
		_spawn_edge_wall_segment(parent, oz + CHUNK_SIZE - half_thick, ox, false,
			exit_edge == ZONE_EDGE_S, half_h, side_len)


# along_is_z: true for W/E walls (strip runs along Z), false for N/S. `perp`
# is the strip's centre on the perpendicular axis; `along_base` is the chunk
# origin on the edge axis.
func _spawn_edge_wall_segment(parent: Node3D, perp: float, along_base: float,
		along_is_z: bool, has_gap: bool, half_h: float, side_len: float) -> void:
	var size_full: Vector3
	var size_side: Vector3
	if along_is_z:
		size_full = Vector3(ZONE_BORDER_STRIP_M, ZONE_WALL_HEIGHT_M, CHUNK_SIZE)
		size_side = Vector3(ZONE_BORDER_STRIP_M, ZONE_WALL_HEIGHT_M, side_len)
	else:
		size_full = Vector3(CHUNK_SIZE, ZONE_WALL_HEIGHT_M, ZONE_BORDER_STRIP_M)
		size_side = Vector3(side_len, ZONE_WALL_HEIGHT_M, ZONE_BORDER_STRIP_M)
	if has_gap:
		var a1: float = along_base + side_len * 0.5
		var a2: float = along_base + CHUNK_SIZE - side_len * 0.5
		var p1: Vector3 = (Vector3(perp, half_h, a1) if along_is_z
			else Vector3(a1, half_h, perp))
		var p2: Vector3 = (Vector3(perp, half_h, a2) if along_is_z
			else Vector3(a2, half_h, perp))
		_spawn_box_wall(parent, p1, size_side)
		_spawn_box_wall(parent, p2, size_side)
	else:
		var am: float = along_base + CHUNK_SIZE * 0.5
		var pm: Vector3 = (Vector3(perp, half_h, am) if along_is_z
			else Vector3(am, half_h, perp))
		_spawn_box_wall(parent, pm, size_full)


static func _spawn_box_wall(parent: Node3D, centre: Vector3, size: Vector3) -> void:
	var body := StaticBody3D.new()
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	col.shape = shape
	body.add_child(col)
	body.position = centre
	parent.add_child(body)
	if DEBUG_SHOW_BORDER_WALLS:
		var mi := MeshInstance3D.new()
		var m := BoxMesh.new()
		m.size = size
		mi.mesh = m
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(1.0, 0.15, 0.15, 0.35)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		body.add_child(mi)


# Area3D trigger filling the corridor opening. Non-blocking — body_entered
# fires when the player crosses into it so zone-transition hooks (fade,
# HUD label, new-zone generation) can be wired in later. Logs by default
# and paints a cyan translucent box when DEBUG_SHOW_CORRIDOR_TRIGGERS.
func _spawn_zone_corridor_trigger(parent: Node3D, key: Vector2i, exit_edge: int) -> void:
	var rect := _corridor_rect_for_chunk(key)
	if rect.size.x <= 0.0:
		return
	var centre_x: float = rect.position.x + rect.size.x * 0.5
	var centre_z: float = rect.position.y + rect.size.y * 0.5
	var box_size := Vector3(rect.size.x, ZONE_WALL_HEIGHT_M, rect.size.y)
	var area := Area3D.new()
	area.name = "ZoneCorridor"
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = box_size
	col.shape = shape
	area.add_child(col)
	area.position = Vector3(centre_x, ZONE_WALL_HEIGHT_M * 0.5, centre_z)
	parent.add_child(area)
	var from_zone: Vector2i = _chunk_zone(key)
	var to_zone: Vector2i = from_zone
	if exit_edge == ZONE_EDGE_W:
		to_zone.x -= 1
	elif exit_edge == ZONE_EDGE_E:
		to_zone.x += 1
	elif exit_edge == ZONE_EDGE_N:
		to_zone.y -= 1
	elif exit_edge == ZONE_EDGE_S:
		to_zone.y += 1
	area.set_meta("from_zone", from_zone)
	area.set_meta("to_zone", to_zone)
	area.body_entered.connect(_on_corridor_body_entered.bind(area))
	if DEBUG_SHOW_CORRIDOR_TRIGGERS:
		var mi := MeshInstance3D.new()
		var m := BoxMesh.new()
		m.size = box_size
		mi.mesh = m
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.2, 0.9, 1.0, 0.25)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		area.add_child(mi)


func _on_corridor_body_entered(body: Node3D, area: Area3D) -> void:
	if body != _player:
		return
	var from_zone: Vector2i = area.get_meta("from_zone")
	var to_zone: Vector2i = area.get_meta("to_zone")
	print("[zone] crossed corridor %s -> %s" % [from_zone, to_zone])


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

func _update_fog_opacity() -> void:
	if _fog_mat == null or _player == null:
		return
	var zone_size: float = float(ZONE_CHUNKS_PER_SIDE) * CHUNK_SIZE
	var lx: float = fposmod(_player.global_position.x, zone_size)
	var lz: float = fposmod(_player.global_position.z, zone_size)
	var dx_min: float = minf(lx, zone_size - lx)
	var dz_min: float = minf(lz, zone_size - lz)
	# Lateral offset from the nearest edge's corridor centreline — corridors
	# sit at the zone midpoint of each edge's perpendicular axis.
	var edge_mid: float = zone_size * 0.5
	var dist_to_edge: float
	var corridor_offset: float
	if dx_min < dz_min:
		dist_to_edge = dx_min
		corridor_offset = absf(lz - edge_mid)
	else:
		dist_to_edge = dz_min
		corridor_offset = absf(lx - edge_mid)
	# Border ramp: 0 far from edge, 1 at edge. sqrt curve rises fast early so
	# the fog is well into boost territory before the player hits the strip.
	var border_t: float = 1.0 - clampf(dist_to_edge / FOG_BORDER_RAMP_M, 0.0, 1.0)
	border_t = sqrt(border_t)
	# Corridor factor: 0 inside corridor (boost suppressed), 1 away from it.
	var corridor_factor: float = clampf(
		(corridor_offset - FOG_CORRIDOR_CLEAR_M)
			/ maxf(FOG_CORRIDOR_SOFTEN_M - FOG_CORRIDOR_CLEAR_M, 0.0001),
		0.0, 1.0)
	var boost: float = border_t * corridor_factor
	var opacity: float = lerpf(FOG_BASE_OPACITY, FOG_BORDER_OPACITY, boost)
	_fog_mat.set_shader_parameter("fog_opacity", opacity)


func _update_camera() -> void:
	if _camera == null or _player == null:
		return

	# Q / E orbit input. Direct key polling (not action-based) so the
	# camera spins continuously while held — same convention as the turbo
	# toggle in `terrain_player.gd`. Rotation is around world +Y; sign is
	# chosen so Q feels like "rotate the world counter-clockwise" (i.e.
	# the camera moves clockwise around the player when viewed from above).
	# BaseScreen extends RefCounted (not Node), so we borrow the player
	# node's delta — same pattern `_update_bush_push` uses elsewhere here.
	var dt: float = _player.get_process_delta_time()
	var yaw_step: float = deg_to_rad(CAM_YAW_SPEED_DEG) * dt
	if Input.is_key_pressed(KEY_Q):
		_camera_yaw_rad -= yaw_step
	if Input.is_key_pressed(KEY_E):
		_camera_yaw_rad += yaw_step
	# Push current yaw to the player so input becomes camera-relative
	# (W = "into screen" regardless of orbit angle).
	_player.camera_yaw_rad = _camera_yaw_rad

	var pitch: float = deg_to_rad(CAM_PITCH_DEG)
	# Demo 3's offset, then yaw-rotated around world +Y so the camera
	# orbits the player at constant CAM_DIST.
	var yaw_basis := Basis(Vector3.UP, _camera_yaw_rad)
	var offset_local := Vector3(0.0, -sin(pitch), cos(pitch))
	var offset: Vector3 = yaw_basis * offset_local * CAM_DIST
	# No lerp: orbital motion at 90 deg/s on CAM_DIST = 80 produces ~12 m
	# of target shift per second, which a 0.1-per-frame lerp can't keep
	# up with — the player would drift off-screen during rotation. Snap
	# straight to target each frame; player movement stays smooth via
	# the player's own move_and_slide, no camera-side smoothing needed.
	var tp: Vector3 = _player.global_position + offset

	# Snap basis is the camera's screen-aligned axes, rotated by yaw so
	# the dither / raster grid follows the camera's view orientation.
	var right: Vector3 = yaw_basis * Vector3(1.0, 0.0, 0.0)
	var up: Vector3 = yaw_basis * Vector3(0.0, cos(pitch), sin(pitch))
	var forward: Vector3 = yaw_basis * Vector3(0.0, -sin(pitch), cos(pitch))

	var vp_h: float = float(_viewport.size.y)
	var wppx: float = (2.0 * ORTHO_SIZE) / vp_h
	var vblock_x: float = maxf(1.0, float(_block_w) * 0.5)
	var vblock_y: float = maxf(1.0, float(_block_h) * 0.5)
	var wppb_x: float = wppx * vblock_x
	var wppb_y: float = wppx * vblock_y

	# Project the camera-target *relative to the player* onto the rotated
	# basis. The snap origin is now the player, not the world origin —
	# without this, basis rotation slides the snapped-to grid line by
	# half a cell each frame, drifting the player off-centre on screen.
	# Trade-off: dither is no longer phase-locked to world XZ, so a
	# slight shimmer is visible during fast player movement (acceptable
	# given orbit-cam needs the player visually centered).
	var rel: Vector3 = tp - _player.global_position
	var u_r: float = rel.dot(right)
	var u_u: float = rel.dot(up)
	var u_f: float = rel.dot(forward)
	var sn_r: float = floor(u_r / wppb_x) * wppb_x
	var sn_u: float = floor(u_u / wppb_y) * wppb_y
	var frac_r: float = u_r - sn_r
	var frac_u: float = u_u - sn_u

	_camera.global_position = _player.global_position + right * sn_r + up * sn_u + forward * u_f
	# Compose yaw + pitch directly via Basis so we don't rely on Godot's
	# Euler-angle order convention. Yaw first (rotates around world Y),
	# then pitch (rotates around the post-yaw local X) — gives the
	# expected "tilt down then orbit" camera behaviour.
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
