class_name DesertBiomeTest3Screen
extends DesertBiomeTestScreen
## Desert biome test 3 — same chunked desert terrain as the base test, but
## with two scene-local additions:
##
##   1. The wind dust cloud is shaded by the desert HDRI: the parent's
##      `_wind_particles_material` is hot-swapped from the unshaded shader
##      to `wind_particles_lit.gdshader` after the world is built. Same
##      uniform interface, so no parameters need rebinding.
##
##   2. test_structure_1.glb is spawned northwest of the platform (replacing
##      Test 2's test_structure_0 prefab). The GLB has no authored colliders,
##      so we walk every descendant MeshInstance3D and call
##      `create_trimesh_collision()` on it — that gives every wall, roof,
##      stair, prop, and detail mesh in the model a ConcavePolygonShape3D
##      sibling under a fresh StaticBody3D, so the player collides with the
##      whole structure rather than just the building shell.
##
## We deliberately don't extend Test 2: that scene's roof-fade + outside-
## dim machinery is bound to test_structure_0's known mesh layout and would
## fail or read wrong on test_structure_1.

const WindParticlesLitShader: Shader = preload("res://assets/shaders/wind_particles_lit.gdshader")
const TestStructureScene: PackedScene = preload("res://assets/models/test_structure_1.glb")

const STRUCTURE_SCALE: float = 0.75
# Sink the building so this fraction of its scaled height ends up below the
# ground plane (y = 0). Stair traversal still works because terrain_player's
# _resolve_step_up handles steps up to STEP_HEIGHT_MAX (0.6 m); at scale
# 0.75 the post-scale step heights stay well within that envelope. If
# stairs end up too tall, either lower STRUCTURE_SCALE further or raise
# STEP_HEIGHT_MAX in terrain_player.gd.
const SINK_RATIO: float = 0.25
# Northwest of the platform. -X = west, -Z = north (Godot default convention,
# matching how the base desert test treats wind/orientation).
const STRUCTURE_OFFSET: Vector3 = Vector3(-30.0, 0.0, -30.0)
const STRUCTURE_YAW_RAD: float = 0.0
# Margin past the building's footprint for the metal-plating curtain stamp.
const CURTAIN_MARGIN: float = 1.0
# Vegetation/rock exclusion margin around the building.
const CLEARING_MARGIN: float = 6.0

var _structure_root: Node3D = null


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)


func on_enter(context: Dictionary = {}) -> void:
	# Build the structure ahead of super.on_enter so we can compute the
	# AABB-driven curtain footprint + clearing radius the parent's chunk
	# bake reads during _build_world. Colliders are added pre-attach; that's
	# fine — `create_trimesh_collision()` only needs the MeshInstance3D, not
	# the surrounding tree.
	var s: Node3D = TestStructureScene.instantiate() as Node3D
	s.scale = Vector3.ONE * STRUCTURE_SCALE
	s.rotation = Vector3(0.0, STRUCTURE_YAW_RAD, 0.0)
	_add_trimesh_colliders(s)

	var local_aabb: AABB = _aggregate_local_aabb(s, s)
	# Yaw is 0, scale uniform — local XZ extents map directly to world XZ
	# extents under multiplication by scale. (Update if STRUCTURE_YAW_RAD is
	# ever made non-zero; rotated AABBs need re-projection.)
	var world_max_extent: float = maxf(local_aabb.size.x, local_aabb.size.z) * STRUCTURE_SCALE * 0.5
	_extra_curtain_xz = Vector2(STRUCTURE_OFFSET.x, STRUCTURE_OFFSET.z)
	_extra_curtain_footprint_r = world_max_extent + CURTAIN_MARGIN
	_extra_clearing_radius = world_max_extent + CLEARING_MARGIN

	super.on_enter(context)

	if _wind_particles_material != null:
		_wind_particles_material.shader = WindParticlesLitShader

	_attach_structure(s, local_aabb)


func on_exit() -> void:
	_structure_root = null
	super.on_exit()


func _attach_structure(s: Node3D, local_aabb: AABB) -> void:
	var scene: Node3D = _viewport.get_node_or_null("DesertScene") as Node3D
	if scene == null:
		s.queue_free()
		return
	# Sink: place the model so the floor sits at world y = -SINK_RATIO *
	# scaled_height. floor_world_y is where AABB.min.y should land, so the
	# pivot offset is floor_world_y - (AABB.min.y * scale).
	var scaled_height: float = local_aabb.size.y * STRUCTURE_SCALE
	var floor_world_y: float = -SINK_RATIO * scaled_height
	var pivot_y: float = floor_world_y - local_aabb.position.y * STRUCTURE_SCALE
	s.position = Vector3(
		_platform_center_xz.x + STRUCTURE_OFFSET.x,
		pivot_y,
		_platform_center_xz.y + STRUCTURE_OFFSET.z)
	scene.add_child(s)
	_structure_root = s


# ── Mesh collider generation ──────────────────────────────────────────

# Walk every descendant MeshInstance3D under `root` and give each one a
# trimesh collision sibling. `create_trimesh_collision()` adds a
# StaticBody3D + CollisionShape3D(ConcavePolygonShape3D) as a child of the
# MeshInstance3D, on default collision_layer 1 — the same layer the player
# capsule masks against.
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


# Aggregate the AABB of every descendant MeshInstance3D into `root`'s local
# space. We can't rely on global_transform here because the structure is
# being measured BEFORE it's attached to the tree, so we walk parents
# manually, composing local transforms.
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
