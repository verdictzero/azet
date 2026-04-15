extends CharacterBody3D
## Terrain demo player. Rainbow hue-shifting sphere on flat ground.

const GROUND_Y: float = 0.9

var move_speed: float = 10.0
var hue_rate: float = 0.25

var _mat: StandardMaterial3D
var _hue: float = 0.0


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
	position.y = GROUND_Y
	if _mat:
		_hue = fposmod(_hue + hue_rate * delta, 1.0)
		_mat.albedo_color = Color.from_hsv(_hue, 1.0, 1.0)
		_mat.emission = Color.from_hsv(_hue, 0.6, 1.0)


func _build_mesh() -> void:
	var mi := MeshInstance3D.new()
	mi.name = "PlayerMesh"
	var sphere := SphereMesh.new()
	sphere.radius = 0.7
	sphere.height = 1.4
	mi.mesh = sphere
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = Color.from_hsv(0.0, 1.0, 1.0)
	_mat.emission_enabled = true
	_mat.emission = Color.from_hsv(0.0, 0.6, 1.0)
	_mat.emission_energy_multiplier = 0.4
	mi.material_override = _mat
	add_child(mi)
