extends CharacterBody3D
## Terrain demo player. Reads input directly for continuous movement.

var height_noise: FastNoiseLite
var biome_noise: FastNoiseLite
var move_speed: float = 10.0


func _ready() -> void:
	_build_mesh()


func _physics_process(delta: float) -> void:
	var mx: float = Input.get_axis("move_left", "move_right")
	var mz: float = Input.get_axis("move_up", "move_down")
	var dir := Vector3(mx, 0.0, mz).normalized()
	velocity.x = dir.x * move_speed
	velocity.z = dir.z * move_speed
	velocity.y = 0.0
	move_and_slide()
	if height_noise and biome_noise:
		position.y = _height_at(position.x, position.z) + 0.9
	if dir.length() > 0.01:
		var mesh: Node3D = get_node_or_null("PlayerMesh")
		if mesh:
			var tb := Basis.looking_at(dir, Vector3.UP)
			mesh.basis = mesh.basis.slerp(tb, 10.0 * delta)


func _height_at(wx: float, wz: float) -> float:
	var val: float = biome_noise.get_noise_2d(wx, wz)
	var hs: float = 8.0
	if val < -0.33: hs = 5.0
	elif val >= 0.33: hs = 22.0
	return height_noise.get_noise_2d(wx, wz) * hs


func _build_mesh() -> void:
	var root := Node3D.new()
	root.name = "PlayerMesh"
	add_child(root)
	_box(root, Vector3(0.6, 0.9, 0.3), Vector3(0, 0.85, 0), Color("#3a6fbf"))
	_box(root, Vector3(0.45, 0.45, 0.45), Vector3(0, 1.55, 0), Color("#f5c07a"))
	for side in [-1.0, 1.0]:
		var mi := MeshInstance3D.new()
		var arm := CylinderMesh.new()
		arm.top_radius = 0.1; arm.bottom_radius = 0.1; arm.height = 0.7
		mi.mesh = arm; mi.material_override = _mat(Color("#3a6fbf"))
		mi.position = Vector3(side * 0.42, 0.9, 0.0)
		mi.rotation_degrees.z = side * -10.0
		root.add_child(mi)
	for side in [-1.0, 1.0]:
		var mi := MeshInstance3D.new()
		var leg := CylinderMesh.new()
		leg.top_radius = 0.12; leg.bottom_radius = 0.12; leg.height = 0.75
		mi.mesh = leg; mi.material_override = _mat(Color("#2a2a4a"))
		mi.position = Vector3(side * 0.18, 0.25, 0.0)
		root.add_child(mi)


func _box(parent: Node3D, size: Vector3, pos: Vector3, color: Color) -> void:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new(); b.size = size
	mi.mesh = b; mi.material_override = _mat(color); mi.position = pos
	parent.add_child(mi)


func _mat(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX
	return m
