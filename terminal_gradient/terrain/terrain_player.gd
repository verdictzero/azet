extends CharacterBody3D
## Terrain demo player. Y-billboarded sprite-sheet quad with directional walk cycle.
## Uses a custom spatial shader to cross-fade between consecutive walk frames.

const GROUND_Y: float = 0.9
# Gravity + GROUND_Y-as-floor prep: the demo terrain has no physics collider
# (it's render-only), so we can't rely on CharacterBody3D's built-in is_on_floor
# detection for the meadow. Instead, gravity pulls Y down each frame and a
# hard clamp treats GROUND_Y as an invisible floor plane. When the player
# stands on top of a rock (or any other collider), `is_on_floor()` returns
# true, Y velocity zeroes, and the clamp is inactive — leaving room for
# walk-over-rocks behaviour to be wired up later without a player rewrite.
const GRAVITY: float = 28.0
# Stair traversal: when a horizontal move is blocked by a wall whose top is
# within STEP_HEIGHT_MAX of our feet, we lift onto it after move_and_slide().
# STEP_HEIGHT_MAX is generous enough for the 0.5 m steps on test_structure_0
# (and small rocks that are now walk-on-able) but short enough to still feel
# like a wall blocks tall obstacles.
const STEP_HEIGHT_MAX: float = 0.6
# Ride a small distance below the player to keep the capsule glued to floors
# when descending stairs — without it, each step launches the player into a
# brief airborne arc.
const STEP_FLOOR_SNAP: float = 0.5
const ANIM_FPS: float = 9.0
const WALK_PATTERN: PackedInt32Array = [1, 0, 1, 2]
const HFRAMES: int = 3
const VFRAMES: int = 4
const FRAME_PX: Vector2 = Vector2(100.0, 170.0)
const SPRITE_HEIGHT_M: float = 3.6
const WIDTH_SCALE: float = 0.9

const PlayerSpriteShader: Shader = preload("res://assets/shaders/player_sprite.gdshader")
const PlayerXrayOutlineShader: Shader = preload("res://assets/shaders/player_xray_outline.gdshader")
const PlayerSpriteTex: Texture2D = preload("res://assets/sprites/player/tg_player_char_sprite.png")
const BlobShadowShader: Shader = preload("res://assets/shaders/blob_shadow.gdshader")
const RainbowOrbShader: Shader = preload("res://assets/shaders/rainbow_orb.gdshader")
const RainbowSparkShader: Shader = preload("res://assets/shaders/rainbow_spark.gdshader")

const SHADOW_Y: float = 0.05
const SHADOW_DIAMETER: float = 1.5
const SHADOW_ALPHA: float = 0.55

enum Facing { DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3 }

var move_speed: float = 7.5
# Camera-yaw orientation in radians. Default 0 → world-axis WASD (current
# behaviour for every screen that doesn't set this). Demos with an orbit
# camera (e.g. terrain_demo_4) write to this each frame so input becomes
# camera-relative: pressing W always moves the player "into the screen"
# regardless of where the camera is.
# Sprite facing stays based on RAW input direction (not the rotated
# velocity) so a billboard sprite still visibly faces "up on screen" when
# the player walks "up".
var camera_yaw_rad: float = 0.0
# Debug turbo: backtick (`) toggles a 3× movement multiplier. Polled in
# _physics_process with an edge-detect latch so we don't depend on input
# routing through the SubViewport.
const TURBO_MULT: float = 3.0
# Turbo form: replaces the sprite with a hue-shifting sphere that hovers
# above ground, ignores collision, and trails tiny shrinking sparks.
const TURBO_SPHERE_RADIUS_M: float = 0.55
const TURBO_SPHERE_CENTRE_Y_M: float = 1.1
const TURBO_HOVER_AMP_M: float = 0.25
const TURBO_HOVER_FREQ_HZ: float = 1.3
const TURBO_HUE_SPEED: float = 0.4
const TURBO_BRIGHTNESS: float = 1.1
const TURBO_SPARK_COUNT: int = 14
const TURBO_SPARK_LIFETIME: float = 1.1
const TURBO_SPARK_SIZE_M: float = 0.09
var _turbo: bool = false
var _turbo_key_was_down: bool = false
var _turbo_time: float = 0.0
# When false, the walk-cycle frame swap is discrete — no cross-fade between
# consecutive frames (mix_t is held at 0). Pixel-art-style stepped animation.
# Default true preserves v1 demo's smooth cross-fade.
var tween_frames: bool = true

var _mat: ShaderMaterial
# Optional second material/mesh that paints a tinted silhouette of the player
# with depth_test_disabled. Built lazily by enable_xray_outline() so screens
# that don't want it (v1 demo) pay zero cost.
var _xray_mat: ShaderMaterial = null
var _facing: int = Facing.DOWN
var _anim_time: float = 0.0

# References for the turbo form-swap: hide normal visuals + toggle the
# sphere + sparks in one place.
var _sprite_mi: MeshInstance3D = null
var _shadow_mi: MeshInstance3D = null
var _xray_mi: MeshInstance3D = null
var _orb_mi: MeshInstance3D = null
var _orb_mat: ShaderMaterial = null
var _orb_sparks: GPUParticles3D = null
var _saved_collision_layer: int = 0
var _saved_collision_mask: int = 0


func _ready() -> void:
	_build_shadow()
	_build_sprite()
	_apply_frames(1, 1, 0.0)
	_build_turbo_orb()
	_saved_collision_layer = collision_layer
	_saved_collision_mask = collision_mask
	# Stair-friendly floor handling. Snap pulls us back onto a step when
	# walking off its edge; raising floor_max_angle lets the body treat the
	# top edge of a step (a near-vertical micro-slope from the body's POV)
	# as floor instead of wall after we've snapped onto it.
	floor_snap_length = STEP_FLOOR_SNAP
	floor_max_angle = deg_to_rad(60.0)


func _physics_process(delta: float) -> void:
	var turbo_down: bool = Input.is_key_pressed(KEY_QUOTELEFT)
	if turbo_down and not _turbo_key_was_down:
		_turbo = not _turbo
		_apply_turbo_visuals(_turbo)
	_turbo_key_was_down = turbo_down
	var speed: float = move_speed * (TURBO_MULT if _turbo else 1.0)
	var mx: float = Input.get_axis("move_left", "move_right")
	var mz: float = Input.get_axis("move_up", "move_down")
	var moving: bool = absf(mx) > 0.0 or absf(mz) > 0.0
	if moving:
		# Facing uses RAW (screen-space) input so the sprite tracks
		# what's "up" / "right" on screen, not the rotated world axis.
		_update_facing(mx, mz)
	# Rotate input by camera yaw so "up on screen" maps to the camera's
	# current forward direction in world. With camera_yaw_rad = 0 (default)
	# this collapses to world-axis movement — every existing screen is
	# unaffected. R_y(yaw) * (mx, 0, mz):
	var c: float = cos(camera_yaw_rad)
	var s: float = sin(camera_yaw_rad)
	var world_mx: float = mx * c + mz * s
	var world_mz: float = mz * c - mx * s
	var dir := Vector3(world_mx, 0.0, world_mz).normalized()
	velocity.x = dir.x * speed
	velocity.z = dir.z * speed
	if _turbo:
		_turbo_time += delta
		if _orb_mi != null:
			# Bias the sine so hover is strictly non-negative — sphere kisses the
			# ground at the low point instead of clipping through it.
			var hover: float = (sin(_turbo_time * TAU * TURBO_HOVER_FREQ_HZ) + 1.0) * TURBO_HOVER_AMP_M
			_orb_mi.position = Vector3(0.0,
				TURBO_SPHERE_CENTRE_Y_M - GROUND_Y + hover, 0.0)
	# Vertical: gravity accumulates unless we're grounded on a real collider
	# or at the invisible GROUND_Y floor. Keeps the door open for step-up /
	# walk-on-rock behaviour — when future rock colliders give the player
	# a surface to stand on, is_on_floor() starts returning true and the
	# clamp below becomes inert.
	if is_on_floor() or position.y <= GROUND_Y:
		velocity.y = 0.0
	else:
		velocity.y -= GRAVITY * delta
	var horiz_velocity := Vector3(velocity.x, 0.0, velocity.z)
	move_and_slide()
	# Step-up: if the horizontal move was blocked by a wall whose top is
	# within reach, lift onto it. Skipped during turbo (orb passes through
	# everything), and only meaningful when the player is actually trying to
	# move horizontally.
	if not _turbo and horiz_velocity.length_squared() > 0.01:
		_resolve_step_up(horiz_velocity)
	if position.y < GROUND_Y:
		position.y = GROUND_Y
		velocity.y = 0.0
	_update_anim(delta, moving)


func _resolve_step_up(horiz_velocity: Vector3) -> void:
	# For each wall collision opposing our motion, probe at the collision
	# point (offset slightly into the wall) for a horizontal step-top
	# surface within reach. First success wins.
	var horiz_dir := horiz_velocity.normalized()
	var space := get_world_3d().direct_space_state
	var foot_y: float = global_position.y - 0.9
	for i in get_slide_collision_count():
		var col := get_slide_collision(i)
		var n := col.get_normal()
		if absf(n.y) >= 0.7:
			continue  # not a wall — floor or ceiling hit
		if horiz_dir.dot(-n) <= 0.3:
			continue  # wall isn't opposing our motion direction
		var into_xz := Vector2(-n.x, -n.z)
		if into_xz.length_squared() < 0.0001:
			continue
		into_xz = into_xz.normalized() * 0.1
		var col_pos: Vector3 = col.get_position()
		var probe_x: float = col_pos.x + into_xz.x
		var probe_z: float = col_pos.z + into_xz.y
		# Cast down from STEP_HEIGHT_MAX above the foot to just below it.
		var ray := PhysicsRayQueryParameters3D.create(
			Vector3(probe_x, foot_y + STEP_HEIGHT_MAX + 0.1, probe_z),
			Vector3(probe_x, foot_y - 0.05, probe_z))
		ray.collision_mask = collision_mask
		ray.exclude = [get_rid()]
		var hit := space.intersect_ray(ray)
		if hit.is_empty():
			continue
		# Confirm we hit a near-horizontal surface (an actual step top, not
		# the side of an adjacent wall taller than our reach).
		var step_normal: Vector3 = hit["normal"]
		if step_normal.y < 0.7:
			continue
		var step_top_y: float = (hit["position"] as Vector3).y
		var step_height: float = step_top_y - foot_y
		if step_height <= 0.05 or step_height > STEP_HEIGHT_MAX:
			continue
		# Headroom: 1.8 m capsule must fit at the new position.
		var head_ray := PhysicsRayQueryParameters3D.create(
			Vector3(probe_x, step_top_y + 0.1, probe_z),
			Vector3(probe_x, step_top_y + 1.85, probe_z))
		head_ray.collision_mask = collision_mask
		head_ray.exclude = [get_rid()]
		if not space.intersect_ray(head_ray).is_empty():
			continue
		# Lift onto the step. Reset vertical velocity so the next gravity
		# tick doesn't immediately yank us back off.
		global_position.y = step_top_y + 0.9 + 0.02
		velocity.y = 0.0
		return


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
		t = phase - floor(phase) if tween_frames else 0.0
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
	var fa := Vector2(float(col_a) / float(HFRAMES), row_v)
	var fb := Vector2(float(col_b) / float(HFRAMES), row_v)
	_mat.set_shader_parameter("frame_a", fa)
	_mat.set_shader_parameter("frame_b", fb)
	_mat.set_shader_parameter("mix_t", t)
	if _xray_mat != null:
		_xray_mat.set_shader_parameter("frame_a", fa)
		_xray_mat.set_shader_parameter("frame_b", fb)
		_xray_mat.set_shader_parameter("mix_t", t)


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
	_sprite_mi = mi


# Opt-in: build a second silhouette mesh that draws first with depth_test off,
# painting a tinted player shape that only remains visible where the main
# (depth-tested) sprite gets occluded. Cheap; no per-frame compute beyond an
# extra draw call. Must be called after _ready so _build_sprite already wired
# the underlying QuadMesh and ShaderMaterial.
func enable_xray_outline(color: Color = Color(0.55, 0.85, 1.0, 0.28)) -> void:
	if _xray_mat != null:
		return
	# Force the main sprite to write ALPHA=1.0. Without this, sub-1 alpha at
	# soft sprite edges lets the xray color bleed through when the player is
	# unoccluded — visible as a constant tint halo.
	if _mat != null:
		_mat.set_shader_parameter("force_opaque_alpha", true)
	var aspect: float = FRAME_PX.x / FRAME_PX.y
	var q := QuadMesh.new()
	q.size = Vector2(SPRITE_HEIGHT_M * aspect * WIDTH_SCALE, SPRITE_HEIGHT_M)
	q.center_offset = Vector3(0.0, SPRITE_HEIGHT_M * 0.5, 0.0)

	_xray_mat = ShaderMaterial.new()
	_xray_mat.shader = PlayerXrayOutlineShader
	# render_priority lower than the main sprite (which is 1) so this draws
	# first within the transparent queue. Main sprite then over-paints where
	# its depth-test passes; the silhouette shows through where it fails.
	_xray_mat.render_priority = 0
	_xray_mat.set_shader_parameter("tex", PlayerSpriteTex)
	_xray_mat.set_shader_parameter("frame_size", Vector2(1.0 / float(HFRAMES), 1.0 / float(VFRAMES)))
	_xray_mat.set_shader_parameter("frame_a", Vector2(1.0 / float(HFRAMES), 0.0))
	_xray_mat.set_shader_parameter("frame_b", Vector2(1.0 / float(HFRAMES), 0.0))
	_xray_mat.set_shader_parameter("mix_t", 0.0)
	_xray_mat.set_shader_parameter("outline_color", color)

	var mi := MeshInstance3D.new()
	mi.name = "PlayerXrayOutline"
	mi.mesh = q
	mi.material_override = _xray_mat
	mi.position = Vector3(0.0, -GROUND_Y, 0.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	_xray_mi = mi


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
	_shadow_mi = mi


func _build_turbo_orb() -> void:
	var sphere := SphereMesh.new()
	sphere.radius = TURBO_SPHERE_RADIUS_M
	sphere.height = TURBO_SPHERE_RADIUS_M * 2.0
	sphere.rings = 8
	sphere.radial_segments = 16

	_orb_mat = ShaderMaterial.new()
	_orb_mat.shader = RainbowOrbShader
	_orb_mat.set_shader_parameter("hue_speed", TURBO_HUE_SPEED)
	_orb_mat.set_shader_parameter("brightness", TURBO_BRIGHTNESS)
	sphere.material = _orb_mat

	_orb_mi = MeshInstance3D.new()
	_orb_mi.name = "TurboOrb"
	_orb_mi.mesh = sphere
	_orb_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_orb_mi.position = Vector3(0.0, TURBO_SPHERE_CENTRE_Y_M - GROUND_Y, 0.0)
	_orb_mi.visible = false
	add_child(_orb_mi)

	_orb_sparks = _build_turbo_sparks()
	_orb_sparks.visible = false
	_orb_sparks.emitting = false
	_orb_mi.add_child(_orb_sparks)


func _build_turbo_sparks() -> GPUParticles3D:
	var quad := QuadMesh.new()
	quad.size = Vector2(TURBO_SPARK_SIZE_M, TURBO_SPARK_SIZE_M)
	var mat := ShaderMaterial.new()
	mat.shader = RainbowSparkShader
	mat.set_shader_parameter("hue_speed", TURBO_HUE_SPEED)
	quad.material = mat

	# Shrink-to-nothing curve (1.0 → 0.0 over life).
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 1.0))
	curve.add_point(Vector2(1.0, 0.0))
	var ctex := CurveTexture.new()
	ctex.curve = curve

	var proc := ParticleProcessMaterial.new()
	proc.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	proc.emission_sphere_radius = TURBO_SPHERE_RADIUS_M * 0.7
	proc.direction = Vector3(0.0, 0.0, 0.0)
	proc.spread = 60.0
	proc.initial_velocity_min = 0.15
	proc.initial_velocity_max = 0.55
	proc.gravity = Vector3.ZERO
	proc.scale_min = 0.8
	proc.scale_max = 1.2
	proc.scale_curve = ctex

	var p := GPUParticles3D.new()
	p.name = "TurboSparks"
	p.amount = TURBO_SPARK_COUNT
	p.lifetime = TURBO_SPARK_LIFETIME
	p.explosiveness = 0.0
	p.one_shot = false
	p.local_coords = false
	p.process_material = proc
	p.draw_pass_1 = quad
	return p


func _apply_turbo_visuals(on: bool) -> void:
	if _sprite_mi != null: _sprite_mi.visible = not on
	if _xray_mi != null: _xray_mi.visible = not on
	if _shadow_mi != null: _shadow_mi.visible = not on
	if _orb_mi != null: _orb_mi.visible = on
	if _orb_sparks != null:
		_orb_sparks.visible = on
		_orb_sparks.emitting = on
	if on:
		collision_layer = 0
		collision_mask = 0
	else:
		collision_layer = _saved_collision_layer
		collision_mask = _saved_collision_mask
		_turbo_time = 0.0
