class_name DesertBiomeTest5Screen
extends DesertBiomeTestScreen
## Desert biome test 5 — copy of Test 3 (HDRI-lit wind dust + test_structure_1
## with roof-fade + interior trigger), bumped for visual punch:
##
##   1. Blob-shadow alpha 0.55 → 1.10 (≈2× as opaque). The shader is
##      `ALPHA = color.a * radial_falloff`, so passing > 1.0 doubles the
##      falloff edges while the center clamps at fully opaque.
##   2. ambient_light_energy + background_energy_multiplier 1.0 → 1.5,
##      so the HDRI fill reads half-again brighter than Test 3.
##
## Otherwise byte-for-byte the same scene wiring as Test 3.

const WindParticlesLitShader: Shader = preload("res://assets/shaders/wind_particles_lit.gdshader")
const TestStructureScene: PackedScene = preload("res://assets/models/test_structure_1.glb")
const RoofMat: ShaderMaterial = preload("res://assets/materials/MAT_test_structure_1_roof.tres")

const STRUCTURE_SCALE: float = 0.75
# Sink the building so this fraction of its scaled height ends up below the
# ground plane (y = 0). Stair traversal still works because terrain_player's
# _resolve_step_up handles steps up to STEP_HEIGHT_MAX (0.6 m); at scale
# 0.75 the post-scale step heights stay well within that envelope.
const SINK_RATIO: float = 0.10
# Northwest of the platform. -X = west, -Z = north (Godot default convention).
const STRUCTURE_OFFSET: Vector3 = Vector3(-30.0, 0.0, -30.0)
const STRUCTURE_YAW_RAD: float = 0.0
const CURTAIN_MARGIN: float = 1.0
const CLEARING_MARGIN: float = 6.0
const ROOF_FADE_DURATION: float = 0.35
# Interior trigger box. Mesh AABB is 23 × 9 × 18 m; at scale 0.75 the world
# extents are 17.25 × 6.75 × 13.5 (yaw 0). A 12 × 5 × 9 box leaves ~2.6 m
# horizontal buffer past walls/thresholds.
const INTERIOR_BOX_SIZE: Vector3 = Vector3(12.0, 5.0, 9.0)
const INTERIOR_BOX_Y: float = 2.5

# Lighting knobs — the deltas vs. Test 3.
const AMBIENT_MULTIPLIER: float = 1.5
const BLOB_SHADOW_ALPHA: float = 1.10  # base 0.55 × 2
# Interior point light — a single warm omni hung high inside the building.
const INTERIOR_LIGHT_COLOR: Color = Color(1.0, 0.78, 0.45)
const INTERIOR_LIGHT_ENERGY: float = 4.0
const INTERIOR_LIGHT_RANGE: float = 12.0
# Y-offset above the structure's pivot, picked so the light sits near the
# ceiling of the interior trigger box (INTERIOR_BOX_Y is its center).
const INTERIOR_LIGHT_Y: float = 4.0

var _structure_root: Node3D = null
var _roof_material: ShaderMaterial = null
var _roof_tween: Tween = null


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)


func on_enter(context: Dictionary = {}) -> void:
	# Build the structure ahead of super.on_enter so we can compute the
	# AABB-driven curtain footprint + clearing radius the parent's chunk
	# bake reads during _build_world.
	var s: Node3D = TestStructureScene.instantiate() as Node3D
	s.scale = Vector3.ONE * STRUCTURE_SCALE
	s.rotation = Vector3(0.0, STRUCTURE_YAW_RAD, 0.0)
	_add_trimesh_colliders(s)

	var local_aabb: AABB = _aggregate_local_aabb(s, s)
	var world_max_extent: float = maxf(local_aabb.size.x, local_aabb.size.z) * STRUCTURE_SCALE * 0.5
	_extra_curtain_xz = Vector2(STRUCTURE_OFFSET.x, STRUCTURE_OFFSET.z)
	_extra_curtain_footprint_r = world_max_extent + CURTAIN_MARGIN
	_extra_clearing_radius = world_max_extent + CLEARING_MARGIN

	super.on_enter(context)

	if _wind_particles_material != null:
		_wind_particles_material.shader = WindParticlesLitShader

	_bump_lighting()
	_attach_structure(s, local_aabb)


func on_exit() -> void:
	if _roof_tween:
		_roof_tween.kill()
	_roof_tween = null
	_roof_material = null
	_structure_root = null
	super.on_exit()


# ── Lighting tweaks (the deltas vs. Test 3) ───────────────────────────

func _bump_lighting() -> void:
	if _blob_shadow_material:
		_blob_shadow_material.set_shader_parameter(
			"color", Color(0.0, 0.0, 0.0, BLOB_SHADOW_ALPHA))
	var world_env: WorldEnvironment = _find_world_env()
	if world_env and world_env.environment:
		world_env.environment.ambient_light_energy = AMBIENT_MULTIPLIER
		world_env.environment.background_energy_multiplier = AMBIENT_MULTIPLIER


func _find_world_env() -> WorldEnvironment:
	var scene: Node3D = _viewport.get_node_or_null("DesertScene") as Node3D
	if scene == null:
		return null
	for ch in scene.get_children():
		if ch is WorldEnvironment:
			return ch
	return null


# ── Structure attach + roof fade ──────────────────────────────────────

func _attach_structure(s: Node3D, local_aabb: AABB) -> void:
	var scene: Node3D = _viewport.get_node_or_null("DesertScene") as Node3D
	if scene == null:
		s.queue_free()
		return
	var scaled_height: float = local_aabb.size.y * STRUCTURE_SCALE
	var floor_world_y: float = -SINK_RATIO * scaled_height
	var pivot_y: float = floor_world_y - local_aabb.position.y * STRUCTURE_SCALE
	s.position = Vector3(
		_platform_center_xz.x + STRUCTURE_OFFSET.x,
		pivot_y,
		_platform_center_xz.y + STRUCTURE_OFFSET.z)
	scene.add_child(s)
	_structure_root = s

	# Roof fade — per-spawn material so tweens don't bleed into the .tres on disk.
	var roof_mi: MeshInstance3D = s.get_node_or_null("test_structure_1_roof") as MeshInstance3D
	if roof_mi:
		_roof_material = RoofMat.duplicate(true) as ShaderMaterial
		roof_mi.material_override = _roof_material

	# Interior trigger box.
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

	# Single warm omni hung near the interior ceiling — no shadows (project
	# convention is HDRI-IBL fill only, all directional/shadow rendering off).
	var lamp := OmniLight3D.new()
	lamp.name = "InteriorLamp"
	lamp.light_color = INTERIOR_LIGHT_COLOR
	lamp.light_energy = INTERIOR_LIGHT_ENERGY
	lamp.omni_range = INTERIOR_LIGHT_RANGE
	lamp.shadow_enabled = false
	lamp.position = s.position + Vector3(0.0, INTERIOR_LIGHT_Y, 0.0)
	scene.add_child(lamp)


func _on_interior_entered(body: Node3D) -> void:
	if body != _player or _roof_material == null:
		return
	_start_roof_tween(1.0)


func _on_interior_exited(body: Node3D) -> void:
	if body != _player or _roof_material == null:
		return
	_start_roof_tween(0.0)


func _start_roof_tween(target: float) -> void:
	if _roof_tween:
		_roof_tween.kill()
	var current: float = _roof_material.get_shader_parameter("fade_amount")
	_roof_tween = grid.create_tween()
	_roof_tween.tween_method(_set_roof_fade, current, target, ROOF_FADE_DURATION)


func _set_roof_fade(v: float) -> void:
	if _roof_material:
		_roof_material.set_shader_parameter("fade_amount", v)


# ── Mesh collider generation (verbatim from Test 3) ──────────────────

func _add_trimesh_colliders(root: Node3D) -> void:
	for mi in _collect_mesh_instances(root):
		if mi.mesh != null:
			mi.create_trimesh_collision()


func _collect_mesh_instances(node: Node) -> Array:
	var out: Array = []
	if node is MeshInstance3D:
		out.append(node)
	for child in node.get_children():
		out.append_array(_collect_mesh_instances(child))
	return out


func _aggregate_local_aabb(node: Node3D, root: Node3D) -> AABB:
	var combined := AABB()
	var first := true
	for mi in _collect_mesh_instances(node):
		var local_mesh_aabb: AABB = (mi as MeshInstance3D).get_aabb()
		var t := _local_transform_relative_to(mi, root)
		var transformed: AABB = t * local_mesh_aabb
		if first:
			combined = transformed
			first = false
		else:
			combined = combined.merge(transformed)
	return combined


func _local_transform_relative_to(node: Node3D, root: Node3D) -> Transform3D:
	var t := Transform3D.IDENTITY
	var n: Node = node
	while n != root and n != null:
		if n is Node3D:
			t = (n as Node3D).transform * t
		n = n.get_parent()
	return t
