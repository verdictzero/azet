extends CharacterBody3D
## Terrain demo player. Y-billboarded sprite-sheet quad with directional walk cycle.
## Uses a custom spatial shader to cross-fade between consecutive walk frames.

const GROUND_Y: float = 0.9
const ANIM_FPS: float = 9.0
const WALK_PATTERN: PackedInt32Array = [1, 0, 1, 2]
const HFRAMES: int = 3
const VFRAMES: int = 4
const FRAME_PX: Vector2 = Vector2(100.0, 170.0)
const SPRITE_HEIGHT_M: float = 3.6
const WIDTH_SCALE: float = 0.9

const PlayerSpriteShader: Shader = preload("res://assets/shaders/player_sprite.gdshader")
const PlayerSpriteTex: Texture2D = preload("res://assets/sprites/player/tg_player_char_sprite.png")
const BlobShadowShader: Shader = preload("res://assets/shaders/blob_shadow.gdshader")

const SHADOW_Y: float = 0.05
const SHADOW_DIAMETER: float = 1.5
const SHADOW_ALPHA: float = 0.55

enum Facing { DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3 }

var move_speed: float = 7.5

var _mat: ShaderMaterial
var _facing: int = Facing.DOWN
var _anim_time: float = 0.0


func _ready() -> void:
	_build_shadow()
	_build_sprite()
	_apply_frames(1, 1, 0.0)


func _physics_process(delta: float) -> void:
	var mx: float = Input.get_axis("move_left", "move_right")
	var mz: float = Input.get_axis("move_up", "move_down")
	var moving: bool = absf(mx) > 0.0 or absf(mz) > 0.0
	if moving:
		_update_facing(mx, mz)
	var dir := Vector3(mx, 0.0, mz).normalized()
	velocity.x = dir.x * move_speed
	velocity.z = dir.z * move_speed
	velocity.y = 0.0
	move_and_slide()
	position.y = GROUND_Y
	_update_anim(delta, moving)


func _update_facing(mx: float, mz: float) -> void:
	if absf(mx) >= absf(mz):
		_facing = Facing.RIGHT if mx > 0.0 else Facing.LEFT
	else:
		_facing = Facing.DOWN if mz > 0.0 else Facing.UP


func _update_anim(delta: float, moving: bool) -> void:
	var col_a: int
	var col_b: int
	var t: float
	if moving:
		_anim_time += delta
		var phase: float = _anim_time * ANIM_FPS
		var n: int = WALK_PATTERN.size()
		var idx_a: int = int(phase) % n
		var idx_b: int = (idx_a + 1) % n
		col_a = WALK_PATTERN[idx_a]
		col_b = WALK_PATTERN[idx_b]
		t = phase - floor(phase)
	else:
		_anim_time = 0.0
		col_a = 1
		col_b = 1
		t = 0.0
	_apply_frames(col_a, col_b, t)


func _apply_frames(col_a: int, col_b: int, t: float) -> void:
	if _mat == null:
		return
	var row_v: float = float(_facing) / float(VFRAMES)
	_mat.set_shader_parameter("frame_a", Vector2(float(col_a) / float(HFRAMES), row_v))
	_mat.set_shader_parameter("frame_b", Vector2(float(col_b) / float(HFRAMES), row_v))
	_mat.set_shader_parameter("mix_t", t)


func _build_sprite() -> void:
	var aspect: float = FRAME_PX.x / FRAME_PX.y

	var q := QuadMesh.new()
	q.size = Vector2(SPRITE_HEIGHT_M * aspect * WIDTH_SCALE, SPRITE_HEIGHT_M)
	q.center_offset = Vector3(0.0, SPRITE_HEIGHT_M * 0.5, 0.0)

	_mat = ShaderMaterial.new()
	_mat.shader = PlayerSpriteShader
	_mat.render_priority = 1
	_mat.set_shader_parameter("tex", PlayerSpriteTex)
	_mat.set_shader_parameter("frame_size", Vector2(1.0 / float(HFRAMES), 1.0 / float(VFRAMES)))
	_mat.set_shader_parameter("frame_a", Vector2(1.0 / float(HFRAMES), 0.0))
	_mat.set_shader_parameter("frame_b", Vector2(1.0 / float(HFRAMES), 0.0))
	_mat.set_shader_parameter("mix_t", 0.0)

	var mi := MeshInstance3D.new()
	mi.name = "PlayerSprite"
	mi.mesh = q
	mi.material_override = _mat
	mi.position = Vector3(0.0, -GROUND_Y, 0.0)
	add_child(mi)


func _build_shadow() -> void:
	var shadow_mat := ShaderMaterial.new()
	shadow_mat.shader = BlobShadowShader
	shadow_mat.set_shader_parameter("color", Color(0.0, 0.0, 0.0, SHADOW_ALPHA))

	var plane := PlaneMesh.new()
	plane.size = Vector2.ONE

	var mi := MeshInstance3D.new()
	mi.name = "PlayerShadow"
	mi.mesh = plane
	mi.material_override = shadow_mat
	mi.scale = Vector3(SHADOW_DIAMETER, 1.0, SHADOW_DIAMETER)
	mi.position = Vector3(0.0, SHADOW_Y - GROUND_Y, 0.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
