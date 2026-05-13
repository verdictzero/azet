class_name DesertBiomeTest6Screen
extends DesertBiomeTestScreen
## Desert biome test 6 — copy of Test 5 (HDRI-lit dust + test_structure_1 with
## roof fade + interior point light + 2× blob shadows), with an accelerated
## day/night cycle layered on top:
##
##   * Time of day animates 0..1 over CYCLE_SECONDS. The cycle drives a
##     three-stop interpolation through (NIGHT → TWILIGHT → DAY) for both
##     the HDRI fill (ambient_light_energy + background_energy_multiplier)
##     and a color-temperature tint.
##   * The tint is applied as a full-viewport ColorRect with multiply blend
##     mode, parented to the 3D SubViewport so it shades the rendered frame
##     globally.
##   * A small Label in the upper-right corner shows the current HH:MM.
##
## Otherwise identical to Test 5.

const WindParticlesLitShader: Shader = preload("res://assets/shaders/wind_particles_lit.gdshader")
const TestStructureScene: PackedScene = preload("res://assets/models/test_structure_1.glb")
const RoofMat: ShaderMaterial = preload("res://assets/materials/MAT_test_structure_1_roof.tres")

# Compass HUD — re-using the forest test's compass model + matcap.
const CompassScene: PackedScene = preload("res://assets/models/compass_0.glb")
const RockMatcapShader: Shader = preload("res://assets/shaders/rock_matcap.gdshader")
const COMPASS_MATCAP_TEX: Texture2D = preload("res://assets/matcap/compass_matcap.png")
const COMPASS_VIEWPORT_PX: int = 96
const COMPASS_INSET_PX: int = 8
const COMPASS_TILT_RAD: float = 0.610865  # ~35 deg, matches forest test
const COMPASS_ROTOR_NAME_HINTS: Array[String] = [
	"moving", "rotor", "needle", "spinner", "dial"
]

const STRUCTURE_SCALE: float = 0.75
const SINK_RATIO: float = 0.10
const STRUCTURE_OFFSET: Vector3 = Vector3(-30.0, 0.0, -30.0)
const STRUCTURE_YAW_RAD: float = 0.0
const CURTAIN_MARGIN: float = 1.0
const CLEARING_MARGIN: float = 6.0
const ROOF_FADE_DURATION: float = 0.35
const INTERIOR_BOX_SIZE: Vector3 = Vector3(12.0, 5.0, 9.0)
const INTERIOR_BOX_Y: float = 2.5

# Test 5 carry-overs.
const BLOB_SHADOW_ALPHA: float = 1.10
const INTERIOR_LIGHT_COLOR: Color = Color(1.0, 0.78, 0.45)
const INTERIOR_LIGHT_RANGE: float = 12.0
const INTERIOR_LIGHT_Y: float = 4.0
# Interior lamp tracks the cycle in inverse: dim during the day (lamp is
# barely visible in sunlight), much brighter at night (lamp is the dominant
# source inside the structure).
const INTERIOR_LIGHT_ENERGY_DAY: float = 1.5
const INTERIOR_LIGHT_ENERGY_NIGHT: float = 14.0

# Day/night cycle.
const CYCLE_SECONDS: float = 30.0  # accelerated full day-night loop
# Night is intentionally readable, not "real-world dark" — the test should
# still be visually parseable at midnight, so the floor of the brightness
# ramp sits well above black.
const NIGHT_AMBIENT: float = 0.60
const TWILIGHT_AMBIENT: float = 0.90
const DAY_AMBIENT: float = 1.5
const NIGHT_TINT: Color = Color(0.70, 0.80, 1.00)
const TWILIGHT_TINT: Color = Color(1.00, 0.82, 0.62)
const DAY_TINT: Color = Color(1.00, 1.00, 1.00)
# Phase offset so the screen opens around midday instead of midnight.
const CYCLE_START_OFFSET: float = 0.5

var _structure_root: Node3D = null
var _roof_material: ShaderMaterial = null
var _roof_tween: Tween = null
var _interior_lamp: OmniLight3D = null

# Day/night state.
var _world_env: WorldEnvironment = null
var _tint_rect: ColorRect = null
var _cycle_t: float = CYCLE_START_OFFSET * CYCLE_SECONDS
var _last_tick_usec: int = -1
# Driven each frame for the debug overlay.
var _cur_brightness: float = 0.0
var _cur_ambient: float = 0.0
var _cur_tint: Color = Color.WHITE
var _cur_lamp_energy: float = 0.0

# Debug HUD overlay.
var _debug_hud: RichTextLabel = null
var _debug_visible: bool = true
var _toggle_held: bool = false

# Compass.
var _compass_viewport: SubViewport = null
var _compass_camera: Camera3D = null
var _compass_root: Node3D = null
var _compass_rotor: Node3D = null
var _compass_rect: TextureRect = null


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)


func on_enter(context: Dictionary = {}) -> void:
	# Same pre-super structure prep as Test 5.
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

	# Stronger blob shadows (Test 5 delta).
	if _blob_shadow_material:
		_blob_shadow_material.set_shader_parameter(
			"color", Color(0.0, 0.0, 0.0, BLOB_SHADOW_ALPHA))

	_world_env = _find_world_env()
	_spawn_tint_overlay()
	# Suppress the base class's plain Label HUD — we replace it with a richer
	# RichTextLabel further below.
	if _hud_label:
		_hud_label.visible = false
	_spawn_debug_hud()
	_build_compass_viewport()
	_cycle_t = CYCLE_START_OFFSET * CYCLE_SECONDS
	_last_tick_usec = -1
	_apply_cycle()  # initial state so we don't flash at full-bright before draw()
	_apply_debug_visibility()

	_attach_structure(s, local_aabb)


func on_exit() -> void:
	if _roof_tween:
		_roof_tween.kill()
	_roof_tween = null
	_roof_material = null
	_structure_root = null
	_interior_lamp = null
	if _tint_rect:
		_tint_rect.queue_free()
		_tint_rect = null
	if _debug_hud:
		_debug_hud.queue_free()
		_debug_hud = null
	if _compass_rect:
		_compass_rect.queue_free()
		_compass_rect = null
	if _compass_viewport:
		_compass_viewport.queue_free()
		_compass_viewport = null
	_compass_camera = null
	_compass_root = null
	_compass_rotor = null
	_world_env = null
	super.on_exit()


func draw(cols: int, rows: int) -> void:
	# F3 toggles the debug HUD + compass visibility. Edge-detected so a held
	# key doesn't flicker.
	var toggle: bool = Input.is_physical_key_pressed(KEY_F3)
	if toggle and not _toggle_held:
		_debug_visible = not _debug_visible
		_apply_debug_visibility()
	_toggle_held = toggle

	# Advance the cycle clock using a self-tracked dt — the base screen does
	# the same trick for tumbleweeds because BaseScreen has no _process.
	var now_usec: int = Time.get_ticks_usec()
	var dt: float = 1.0 / 60.0
	if _last_tick_usec >= 0:
		dt = clampf(float(now_usec - _last_tick_usec) / 1_000_000.0, 0.0, 0.25)
	_last_tick_usec = now_usec
	_cycle_t = fmod(_cycle_t + dt, CYCLE_SECONDS)
	_apply_cycle()

	super.draw(cols, rows)

	# Compass rotor: north-up regardless of camera yaw. Same convention the
	# forest test uses (-_camera_yaw_rad + PI). _camera_yaw_rad is updated by
	# the base's _update_camera() which super.draw() already called.
	if _compass_rotor != null:
		_compass_rotor.rotation = Vector3(0.0, -_camera_yaw_rad + PI, 0.0)

	if _debug_visible and _debug_hud:
		_refresh_debug_hud()


# ── Day/night cycle ───────────────────────────────────────────────────

# 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 1.0 = midnight.
func _time_of_day() -> float:
	return _cycle_t / CYCLE_SECONDS


# 0 at midnight (and 24:00), 1 at noon. Smooth cosine — no harsh edges.
func _brightness_factor() -> float:
	var tod := _time_of_day()
	return cos((tod - 0.5) * TAU) * 0.5 + 0.5


func _apply_cycle() -> void:
	var b: float = _brightness_factor()
	var ambient: float
	var tint: Color
	if b < 0.5:
		var t: float = b / 0.5
		tint = NIGHT_TINT.lerp(TWILIGHT_TINT, t)
		ambient = lerp(NIGHT_AMBIENT, TWILIGHT_AMBIENT, t)
	else:
		var t: float = (b - 0.5) / 0.5
		tint = TWILIGHT_TINT.lerp(DAY_TINT, t)
		ambient = lerp(TWILIGHT_AMBIENT, DAY_AMBIENT, t)

	if _world_env and _world_env.environment:
		_world_env.environment.ambient_light_energy = ambient
		_world_env.environment.background_energy_multiplier = ambient
	if _tint_rect:
		_tint_rect.color = tint
	var lamp_energy: float = lerp(
		INTERIOR_LIGHT_ENERGY_NIGHT, INTERIOR_LIGHT_ENERGY_DAY, b)
	if _interior_lamp:
		_interior_lamp.light_energy = lamp_energy

	# Cache values the debug HUD reads next frame.
	_cur_brightness = b
	_cur_ambient = ambient
	_cur_tint = tint
	_cur_lamp_energy = lamp_energy


# ── Overlay setup ─────────────────────────────────────────────────────

func _spawn_tint_overlay() -> void:
	if _viewport == null:
		return
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL
	_tint_rect = ColorRect.new()
	_tint_rect.name = "DayNightTint"
	_tint_rect.material = mat
	_tint_rect.color = Color.WHITE
	_tint_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tint_rect.position = Vector2.ZERO
	_tint_rect.size = Vector2(_viewport.size)
	_viewport.add_child(_tint_rect)


func _spawn_debug_hud() -> void:
	# Upper-right, BBCode-coloured multi-section panel. Replaces the base
	# screen's plain _hud_label (which is hidden in on_enter).
	_debug_hud = RichTextLabel.new()
	_debug_hud.name = "DebugHud"
	_debug_hud.bbcode_enabled = true
	_debug_hud.fit_content = true
	_debug_hud.scroll_active = false
	_debug_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_debug_hud.add_theme_font_size_override("normal_font_size", 14)
	# Monospace plate so columns line up.
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.62)
	bg.border_color = Color(0.7, 0.7, 0.75, 0.9)
	bg.border_width_left = 1
	bg.border_width_top = 1
	bg.border_width_right = 1
	bg.border_width_bottom = 1
	bg.content_margin_left = 10
	bg.content_margin_right = 12
	bg.content_margin_top = 8
	bg.content_margin_bottom = 8
	_debug_hud.add_theme_stylebox_override("normal", bg)
	_debug_hud.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_debug_hud.offset_right = -10
	_debug_hud.offset_left = -260
	_debug_hud.offset_top = 10
	_debug_hud.offset_bottom = 220
	grid.add_child(_debug_hud)


func _apply_debug_visibility() -> void:
	if _debug_hud:
		_debug_hud.visible = _debug_visible
	if _compass_rect:
		_compass_rect.visible = _debug_visible


func _refresh_debug_hud() -> void:
	var tod: float = _time_of_day()
	var total_minutes: int = int(tod * 24.0 * 60.0)
	var hh: int = (total_minutes / 60) % 24
	var mm: int = total_minutes % 60
	var phase: String = _phase_name(_cur_brightness)
	var fps: int = int(Engine.get_frames_per_second())
	var chunks: int = _chunks_state.size()
	var px: float = 0.0
	var py: float = 0.0
	var pz: float = 0.0
	var cx: int = 0
	var cz: int = 0
	if _player:
		px = _player.global_position.x
		py = _player.global_position.y
		pz = _player.global_position.z
		cx = int(floor(px / CHUNK_SIZE))
		cz = int(floor(pz / CHUNK_SIZE))
	var tint_hex: String = "#%02x%02x%02x" % [
		int(clampf(_cur_tint.r, 0, 1) * 255.0),
		int(clampf(_cur_tint.g, 0, 1) * 255.0),
		int(clampf(_cur_tint.b, 0, 1) * 255.0)]

	# Each color block ends with a [/color] so subsequent text stays default.
	var lines: PackedStringArray = PackedStringArray()
	lines.append("[color=#ffd866][b]DESERT TEST 6[/b][/color]")
	lines.append("[color=#fceea7]TIME[/color]    %02d:%02d  ([color=#fceea7]%s[/color])" % [hh, mm, phase])
	lines.append("[color=#fceea7]CYCLE[/color]   t=%.1f / %.1fs  b=%.2f" % [_cycle_t, CYCLE_SECONDS, _cur_brightness])
	lines.append("[color=#b3e88a]FPS[/color]     %d" % fps)
	lines.append("[color=#b3e88a]CHUNKS[/color]  %d loaded" % chunks)
	lines.append("[color=#c5a3ff]POS[/color]     (%6.1f, %5.1f, %6.1f)" % [px, py, pz])
	lines.append("[color=#c5a3ff]CHUNK[/color]   (%d, %d)" % [cx, cz])
	lines.append("[color=#ffae5e]AMBIENT[/color] %.2f" % _cur_ambient)
	lines.append("[color=#ffae5e]TINT[/color]    [color=%s]%s[/color]" % [tint_hex, tint_hex])
	lines.append("[color=#ffae5e]LAMP[/color]    %.2f" % _cur_lamp_energy)
	lines.append("[color=#888888][F3] toggle HUD · [ESC] back[/color]")
	_debug_hud.text = "\n".join(lines)


static func _phase_name(b: float) -> String:
	if b < 0.15:
		return "night"
	if b < 0.45:
		return "twilight"
	if b < 0.85:
		return "morning/evening"
	return "day"


func _find_world_env() -> WorldEnvironment:
	var scene: Node3D = _viewport.get_node_or_null("DesertScene") as Node3D
	if scene == null:
		return null
	for ch in scene.get_children():
		if ch is WorldEnvironment:
			return ch
	return null


# ── Structure attach + roof fade (verbatim from Test 5) ──────────────

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

	var roof_mi: MeshInstance3D = s.get_node_or_null("test_structure_1_roof") as MeshInstance3D
	if roof_mi:
		_roof_material = RoofMat.duplicate(true) as ShaderMaterial
		roof_mi.material_override = _roof_material

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

	var lamp := OmniLight3D.new()
	lamp.name = "InteriorLamp"
	lamp.light_color = INTERIOR_LIGHT_COLOR
	lamp.light_energy = INTERIOR_LIGHT_ENERGY_NIGHT  # initial; cycle drives this per-frame
	lamp.omni_range = INTERIOR_LIGHT_RANGE
	lamp.shadow_enabled = false
	lamp.position = s.position + Vector3(0.0, INTERIOR_LIGHT_Y, 0.0)
	scene.add_child(lamp)
	_interior_lamp = lamp


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


# ── Mesh collider generation (verbatim from Test 5) ──────────────────

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


# ── Compass HUD ──────────────────────────────────────────────────────
# Lifted from forest_biome_test_screen's compass setup. The compass renders
# in its own SubViewport with an ortho top-down camera; the rotor's Y rotation
# is locked to the camera yaw so the N-marker always points world-north.
# The TextureRect that samples it lives inside the main 3D viewport so any
# post-process picks it up alongside the world.

func _build_compass_viewport() -> void:
	_compass_viewport = SubViewport.new()
	_compass_viewport.size = Vector2i(COMPASS_VIEWPORT_PX, COMPASS_VIEWPORT_PX)
	_compass_viewport.transparent_bg = true
	_compass_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_compass_viewport.handle_input_locally = false
	_compass_viewport.msaa_3d = Viewport.MSAA_2X
	grid.add_child(_compass_viewport)

	# Desert-day HDRI for the compass's own ambient. Matcap shading is unlit,
	# but the env still seeds the IBL probe — keeps the gold ring reading warm.
	var compass_env := WorldEnvironment.new()
	var env := Environment.new()
	var sky := Sky.new()
	var sky_mat := PanoramaSkyMaterial.new()
	sky_mat.panorama = preload("res://assets/hdri/desert_day_test.exr")
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 1.0
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	compass_env.environment = env
	_compass_viewport.add_child(compass_env)

	_compass_root = Node3D.new()
	_compass_root.name = "CompassRoot"
	_compass_viewport.add_child(_compass_root)

	var inst: Node = CompassScene.instantiate()
	if inst is Node3D:
		_compass_root.add_child(inst)
	else:
		var wrap := Node3D.new()
		wrap.add_child(inst)
		_compass_root.add_child(wrap)
	_apply_matcap_with_authored_tints(_compass_root, RockMatcapShader,
		COMPASS_MATCAP_TEX, Color(0.7, 0.7, 0.75))

	_compass_root.rotation = Vector3(COMPASS_TILT_RAD, 0.0, 0.0)
	_compass_rotor = _find_compass_rotor(_compass_root, COMPASS_ROTOR_NAME_HINTS)

	# Ortho camera, top-down (-Y look). +X = right, -Z = up on screen.
	var compass_aabb: AABB = _gather_local_aabb(_compass_root, _compass_root)
	var ortho_size: float = 1.0
	var centre := Vector3.ZERO
	if compass_aabb.size.length_squared() > 0.0:
		ortho_size = maxf(compass_aabb.size.x, compass_aabb.size.z) * 1.1
		centre = compass_aabb.position + compass_aabb.size * 0.5
	var height_above: float = maxf(compass_aabb.size.y * 1.5, 1.0)
	_compass_camera = Camera3D.new()
	_compass_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_compass_camera.size = ortho_size
	_compass_camera.near = 0.05
	_compass_camera.far = maxf(height_above * 4.0, 50.0)
	_compass_camera.current = true
	_compass_camera.transform = Transform3D(
		Basis(Vector3(1, 0, 0), Vector3(0, 0, -1), Vector3(0, 1, 0)),
		Vector3(centre.x, centre.y + height_above, centre.z))
	_compass_viewport.add_child(_compass_camera)

	# Sample into a TextureRect anchored bottom-right. Note: parented to `grid`
	# (the ASCII grid root), not to `_viewport`. The forest test parents its
	# compass rect inside `_viewport` so it gets the same raster/dither pass,
	# but Test 6 has a full-viewport multiply tint inside `_viewport` for the
	# day/night cycle — leaving the compass under it would dim/tint the
	# compass too. Parenting to `grid` keeps the compass at full brightness
	# regardless of time of day. Trade-off: compass doesn't share the dither
	# look; ok for a debug HUD element.
	_compass_rect = TextureRect.new()
	_compass_rect.name = "CompassRect"
	_compass_rect.texture = _compass_viewport.get_texture()
	_compass_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_compass_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_compass_rect.stretch_mode = TextureRect.STRETCH_SCALE
	var grid_w: float = float(grid.cols * grid.cell_width)
	var grid_h: float = float(grid.rows * grid.cell_height)
	# 2× the source viewport so the compass reads at a comparable on-screen
	# size to forest's (which gets upscaled by _texture_rect's 2× display).
	var rect_size: Vector2 = Vector2(COMPASS_VIEWPORT_PX * 2, COMPASS_VIEWPORT_PX * 2)
	_compass_rect.size = rect_size
	_compass_rect.position = Vector2(
		grid_w - rect_size.x - COMPASS_INSET_PX,
		grid_h - rect_size.y - COMPASS_INSET_PX)
	grid.add_child(_compass_rect)


static func _find_compass_rotor(node: Node, hints: Array[String]) -> Node3D:
	var lower: String = node.name.to_lower()
	for h in hints:
		if String(h) in lower and node is Node3D:
			return node as Node3D
	for c in node.get_children():
		var hit: Node3D = _find_compass_rotor(c, hints)
		if hit != null:
			return hit
	return null


static func _apply_matcap_with_authored_tints(node: Node, matcap_shader: Shader,
		matcap_tex: Texture2D, default_tint: Color) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if mi.mesh != null:
			for surf_idx in mi.mesh.get_surface_count():
				var orig: Material = mi.mesh.surface_get_material(surf_idx)
				var tint: Color = default_tint
				if orig is BaseMaterial3D:
					tint = (orig as BaseMaterial3D).albedo_color
				var mat := ShaderMaterial.new()
				mat.shader = matcap_shader
				mat.set_shader_parameter("matcap", matcap_tex)
				mat.set_shader_parameter("tint", tint)
				mat.set_shader_parameter("matcap_tint_strength", 1.0)
				mi.set_surface_override_material(surf_idx, mat)
	for c in node.get_children():
		_apply_matcap_with_authored_tints(c, matcap_shader, matcap_tex, default_tint)
