class_name DesertBiomeTest2Screen
extends DesertBiomeTestScreen

const TestStructureScene: PackedScene = preload("res://assets/prefabs/PRE_test_structure_0.tscn")
# The prefab already references MAT_test_structure_0.tres as material_override
# on both meshes, so the body picks up the shared concrete material without
# any screen-side override. The roof needs its own copy so fade_amount can
# tween independently per spawn — we duplicate the same source material.
const StructureMat: ShaderMaterial = preload("res://assets/materials/MAT_test_structure_0.tres")
const ExteriorDimShader: Shader = preload("res://assets/shaders/exterior_dim.gdshader")

const STRUCTURE_SCALE: float = 0.75
# Lift the building up from the terrain plane. Mesh AABB local Y range is
# -3 → +6, so at scale 0.75 the floor sits 2.25 m below the pivot. A small
# positive lift keeps the foundation footings clear of any micro-terrain
# variation around the spawn area.
const STRUCTURE_LIFT_Y: float = 0.5
# Northwest of the platform: -X = west, -Z = north (Godot's default convention,
# matching how the desert biome test treats wind/orientation).
const STRUCTURE_OFFSET: Vector3 = Vector3(-30.0, 0.0, -30.0)
# Yaw the structure so its local -X face points world +Z (south). Rotating
# the +Y axis CCW by 90° (PI/2 rad) maps local -X → world +Z.
const STRUCTURE_YAW_RAD: float = PI / 2.0
const ROOF_FADE_DURATION: float = 0.35

# Interior trigger sized so the player's CENTER must be solidly past the
# building walls before the roof fade starts — not just their capsule edge
# overlapping a doorway. Building world AABB is 13.5 × 6.75 × 17.25 m at
# scale 0.75 (after the 90° yaw); a 9.5 × 4.5 × 13.0 box leaves ~2 m of
# wall+threshold buffer on each horizontal axis, so body_entered fires only
# once the player is well inside.
const INTERIOR_BOX_SIZE: Vector3 = Vector3(9.5, 4.5, 13.0)
const INTERIOR_BOX_Y: float = 2.25

# Outside-dim overlay: how dark the "everything outside the structure" gets
# at full strength. 0.7 ≈ outside reads as in shadow. Tweens 0 → DIM_TARGET
# in lockstep with the roof fade.
const DIM_TARGET: float = 0.7

# Metal-plating curtain margin past the building's footprint, matching the
# platform's R_PLATFORM_MARGIN convention so the splat reads consistently.
const CURTAIN_MARGIN: float = 1.0
# Vegetation/rock exclusion radius around the building. Slightly larger than
# the curtain's outer edge (footprint_r + R_BREAKUP_BAND ≈ 16 m) so cacti
# don't poke through the noisy fade zone.
const CLEARING_MARGIN: float = 18.0

var _structure_root: Node3D = null
var _roof_material: ShaderMaterial = null
var _roof_tween: Tween = null
var _dim_material: ShaderMaterial = null
var _dim_tween: Tween = null


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)


func on_enter(context: Dictionary = {}) -> void:
	# Tell the parent's chunk-bake job to also stamp a metal-plating curtain
	# around the building. _platform_center_xz is (0, 0) before _build_world
	# runs, so STRUCTURE_OFFSET is already the world XZ. World extents after
	# the 90° yaw: world-X = 18 * scale, world-Z = 23 * scale. Footprint
	# radius = max(world extents) / 2 + margin.
	_extra_curtain_xz = Vector2(STRUCTURE_OFFSET.x, STRUCTURE_OFFSET.z)
	var world_max_extent: float = maxf(18.0, 23.0) * STRUCTURE_SCALE * 0.5
	_extra_curtain_footprint_r = world_max_extent + CURTAIN_MARGIN
	_extra_clearing_radius = world_max_extent + CLEARING_MARGIN
	super.on_enter(context)
	_spawn_structure()


func on_exit() -> void:
	if _roof_tween:
		_roof_tween.kill()
	if _dim_tween:
		_dim_tween.kill()
	_roof_tween = null
	_dim_tween = null
	_roof_material = null
	_dim_material = null
	_structure_root = null
	super.on_exit()


# Per-frame: keep the dim overlay's bright centre locked to the player's
# screen-space position so the bright disc follows the camera even as it
# orbits/lerps. Cheap — one unproject_position call.
func draw(cols: int, rows: int) -> void:
	super.draw(cols, rows)
	_update_dim_center()


func _spawn_structure() -> void:
	var scene: Node3D = _viewport.get_node_or_null("DesertScene") as Node3D
	if scene == null:
		return

	var s: Node3D = TestStructureScene.instantiate() as Node3D
	s.scale = Vector3.ONE * STRUCTURE_SCALE
	s.rotation = Vector3(0.0, STRUCTURE_YAW_RAD, 0.0)
	s.position = Vector3(
		_platform_center_xz.x + STRUCTURE_OFFSET.x,
		STRUCTURE_LIFT_Y,
		_platform_center_xz.y + STRUCTURE_OFFSET.z)

	# Body picks up MAT_test_structure_0.tres directly via the prefab's
	# material_override — no screen-side write needed. Roof gets a fresh
	# duplicate so its fade_amount tween doesn't bleed into other instances
	# (or back into the source asset). Both meshes sit under the prefab's
	# `test_structure_0` Node3D, not the prefab root, so the path is two
	# levels deep.
	var roof_mi: MeshInstance3D = s.get_node_or_null("test_structure_0/test_structure_roof") as MeshInstance3D
	if roof_mi:
		_roof_material = StructureMat.duplicate(true) as ShaderMaterial
		roof_mi.material_override = _roof_material

	scene.add_child(s)
	_structure_root = s

	_spawn_dim_overlay()

	var area := Area3D.new()
	area.name = "StructureInterior"
	area.collision_layer = 0
	area.collision_mask = 2
	var col := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = INTERIOR_BOX_SIZE
	col.shape = box
	area.add_child(col)
	area.position = s.position + Vector3(0.0, INTERIOR_BOX_Y, 0.0)
	scene.add_child(area)
	area.body_entered.connect(_on_interior_entered)
	area.body_exited.connect(_on_interior_exited)


func _on_interior_entered(body: Node3D) -> void:
	if body != _player:
		return
	if _roof_material != null:
		_start_roof_tween(1.0)
	if _dim_material != null:
		_start_dim_tween(DIM_TARGET)


func _on_interior_exited(body: Node3D) -> void:
	if body != _player:
		return
	if _roof_material != null:
		_start_roof_tween(0.0)
	if _dim_material != null:
		_start_dim_tween(0.0)


func _start_roof_tween(target: float) -> void:
	if _roof_tween:
		_roof_tween.kill()
	var current: float = _roof_material.get_shader_parameter("fade_amount")
	_roof_tween = grid.create_tween()
	_roof_tween.tween_method(_set_roof_fade, current, target, ROOF_FADE_DURATION)


func _set_roof_fade(v: float) -> void:
	if _roof_material:
		_roof_material.set_shader_parameter("fade_amount", v)


# ── Outside-dim overlay ──────────────────────────────────────────────

# Build a viewport-sized ColorRect inside the SubViewport with the
# `exterior_dim` shader. Lives until the screen tears down via super._cleanup.
func _spawn_dim_overlay() -> void:
	if _viewport == null:
		return
	_dim_material = ShaderMaterial.new()
	_dim_material.shader = ExteriorDimShader
	_dim_material.set_shader_parameter("dim_amount", 0.0)
	_dim_material.set_shader_parameter("bright_center_uv", Vector2(0.5, 0.5))
	_dim_material.set_shader_parameter("dim_inner_radius_uv", 0.18)
	_dim_material.set_shader_parameter("dim_outer_radius_uv", 0.42)
	var vs := Vector2(_viewport.size)
	var aspect: float = (vs.x / vs.y) if vs.y > 0.0 else 1.778
	_dim_material.set_shader_parameter("aspect_correction", aspect)

	var rect := ColorRect.new()
	rect.name = "ExteriorDimOverlay"
	rect.position = Vector2.ZERO
	rect.size = vs
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.color = Color.WHITE  # blend_mul: brightness lives in shader output
	rect.material = _dim_material
	_viewport.add_child(rect)


func _start_dim_tween(target: float) -> void:
	if _dim_tween:
		_dim_tween.kill()
	var current: float = _dim_material.get_shader_parameter("dim_amount")
	_dim_tween = grid.create_tween()
	_dim_tween.tween_method(_set_dim_amount, current, target, ROOF_FADE_DURATION)


func _set_dim_amount(v: float) -> void:
	if _dim_material:
		_dim_material.set_shader_parameter("dim_amount", v)


func _update_dim_center() -> void:
	if _camera == null or _player == null or _dim_material == null:
		return
	var vs := Vector2(_viewport.size)
	if vs.x <= 0.0 or vs.y <= 0.0:
		return
	var sp: Vector2 = _camera.unproject_position(_player.global_position)
	_dim_material.set_shader_parameter("bright_center_uv", sp / vs)
