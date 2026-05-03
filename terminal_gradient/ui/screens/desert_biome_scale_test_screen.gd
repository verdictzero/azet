class_name DesertBiomeScaleTestScreen
extends DesertBiomeTestScreen

# Calibration field east of the spawn platform: ten rows of solid-colored
# tall thin cuboids stepping 1 m → 10 m, each with a billboard label showing
# its height. Nothing else changes vs. Desert Biome Test 1 — the parent
# handles terrain, platform, player, cacti, rocks, tumbleweeds.

const HEIGHTS_M: Array[int] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const ROW_SPACING_X: float = 3.0
const COL_SPACING_Z: float = 2.0
const COLS_PER_ROW: int = 4
# Player spawns on the platform at (0, _, 0). Field starts well east so the
# 1 m row is the first thing the player hits when walking +X.
const FIELD_ORIGIN_OFFSET: Vector2 = Vector2(30.0, 0.0)
# Cuboid footprint — "tall and thin" per the spec.
const CUBOID_SIDE: float = 0.4
# Label sits half a metre above the cuboid top.
const LABEL_TOP_GAP: float = 0.5
# Bounding-circle radius for the whole field, used to clear vegetation.
# Field span: 9 * ROW_SPACING_X = 27 m along X, (COLS-1)*COL_SPACING_Z = 6 m
# along Z. Diagonal radius ≈ sqrt(13.5² + 3²) ≈ 13.8; add a margin so cacti
# don't poke the edges.
const FIELD_CLEARING_MARGIN: float = 3.0

# Height-indexed CGA palette pull. Cool → warm gradient so the row order
# reads even from far away.
const HEIGHT_COLORS: Dictionary = {
	1: "BRIGHT_BLUE",
	2: "BRIGHT_CYAN",
	3: "CYAN",
	4: "BRIGHT_GREEN",
	5: "GREEN",
	6: "BRIGHT_YELLOW",
	7: "YELLOW",
	8: "BRIGHT_RED",
	9: "RED",
	10: "BRIGHT_MAGENTA",
}

var _field_root: Node3D = null


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)


func on_enter(context: Dictionary = {}) -> void:
	# Tell the parent's chunk-bake job to skip cacti/rocks under the field.
	# _platform_center_xz is (0,0) before _build_world runs, so the field's
	# world XZ equals FIELD_ORIGIN_OFFSET + the row/col extents below.
	var span_x: float = float(HEIGHTS_M.size() - 1) * ROW_SPACING_X
	var span_z: float = float(COLS_PER_ROW - 1) * COL_SPACING_Z
	var field_center_xz: Vector2 = FIELD_ORIGIN_OFFSET + Vector2(span_x * 0.5, 0.0)
	var bounding_r: float = sqrt(pow(span_x * 0.5, 2.0) + pow(span_z * 0.5, 2.0))
	# Curtain footprint stays 0 → no metal splat is stamped (sand reads fine).
	# But _extra_curtain_xz still needs a non-INF value, since the parent's
	# clearing check requires both an anchor and a positive radius.
	_extra_curtain_xz = field_center_xz
	_extra_clearing_radius = bounding_r + FIELD_CLEARING_MARGIN

	super.on_enter(context)
	_spawn_cuboid_field()


func on_exit() -> void:
	if _field_root:
		_field_root.queue_free()
		_field_root = null
	super.on_exit()


func _spawn_cuboid_field() -> void:
	var scene: Node3D = _viewport.get_node_or_null("DesertScene") as Node3D
	if scene == null:
		return

	_field_root = Node3D.new()
	_field_root.name = "ScaleCalibrationField"
	scene.add_child(_field_root)

	var origin_x: float = _platform_center_xz.x + FIELD_ORIGIN_OFFSET.x
	var origin_z: float = _platform_center_xz.y + FIELD_ORIGIN_OFFSET.y
	var col_z_start: float = -float(COLS_PER_ROW - 1) * COL_SPACING_Z * 0.5

	for row_i in HEIGHTS_M.size():
		var height: int = HEIGHTS_M[row_i]
		var color: Color = Constants.COLORS[HEIGHT_COLORS[height]]
		var row_x: float = origin_x + float(row_i) * ROW_SPACING_X
		for col_i in COLS_PER_ROW:
			var z: float = origin_z + col_z_start + float(col_i) * COL_SPACING_Z
			_build_cuboid(height, color, Vector3(row_x, 0.0, z))


func _build_cuboid(height_m: int, color: Color, base_pos: Vector3) -> void:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(CUBOID_SIDE, float(height_m), CUBOID_SIDE)

	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = base_pos + Vector3(0.0, float(height_m) * 0.5, 0.0)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX
	mi.material_override = mat

	mi.add_child(_build_label(height_m))
	_field_root.add_child(mi)


func _build_label(height_m: int) -> Label3D:
	var label := Label3D.new()
	label.text = "%dm" % height_m
	# Local space: cuboid mesh is centered on the parent MI, so its top is at
	# +height/2. Add LABEL_TOP_GAP above that.
	label.position = Vector3(0.0, float(height_m) * 0.5 + LABEL_TOP_GAP, 0.0)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.fixed_size = true
	label.no_depth_test = false
	label.font_size = 32
	label.outline_size = 6
	label.outline_modulate = Color.BLACK
	label.modulate = Color.WHITE
	return label
