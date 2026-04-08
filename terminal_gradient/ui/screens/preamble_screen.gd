class_name PreambleScreen
extends BaseScreen
## "Press Here to Start" splash screen.
## Ported from js/ui.js drawPreamble (lines 363-449).

const BG_CHARS: Array[String] = [" ", ".", "·", ":", "∙", "░", "▒"]
const BG_COLORS: Array[Color] = [
	Color("#2a2a30"), Color("#303038"), Color("#383840"),
	Color("#2a3038"), Color("#403040"), Color("#302a34"),
]
const BG_BASE: Color = Color("#0c0c10")
const BOX_BG: Color = Color("#1a1a2a")
const BOX_BORDER: Color = Color("#808090")

var version_string: String = "v0.1.0"

# Voronoi seeds for animated background
var _voronoi_seeds: Array = []


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	# Generate 10 voronoi seed positions
	for i in range(10):
		_voronoi_seeds.append({
			"x": randf(),
			"y": randf(),
			"speed_x": randf_range(-0.1, 0.1),
			"speed_y": randf_range(-0.1, 0.1),
		})


func handle_input(_action: String) -> void:
	# Any action advances to menu
	request_action("goto_menu")


func draw(cols: int, rows: int) -> void:
	var t: float = grid.frame_time_sec

	# Animated voronoi background
	_draw_voronoi_bg(cols, rows, t)

	# Center container box
	var button_text: String = "[ Press Here to Start ]"
	var box_w: int = button_text.length() + 4
	var box_h: int = 7
	var box_x: int = (cols - box_w) / 2
	var box_y: int = (rows - box_h) / 2

	# Draw box with single-line border
	for r in range(box_y, box_y + box_h):
		for c in range(box_x, box_x + box_w):
			grid.set_char(c, r, " ", Constants.COLORS.WHITE, BOX_BG)

	# Border
	grid.set_char(box_x, box_y, "┌", BOX_BORDER, BOX_BG)
	grid.set_char(box_x + box_w - 1, box_y, "┐", BOX_BORDER, BOX_BG)
	grid.set_char(box_x, box_y + box_h - 1, "└", BOX_BORDER, BOX_BG)
	grid.set_char(box_x + box_w - 1, box_y + box_h - 1, "┘", BOX_BORDER, BOX_BG)
	for c in range(box_x + 1, box_x + box_w - 1):
		grid.set_char(c, box_y, "─", BOX_BORDER, BOX_BG)
		grid.set_char(c, box_y + box_h - 1, "─", BOX_BORDER, BOX_BG)
	for r in range(box_y + 1, box_y + box_h - 1):
		grid.set_char(box_x, r, "│", BOX_BORDER, BOX_BG)
		grid.set_char(box_x + box_w - 1, r, "│", BOX_BORDER, BOX_BG)

	# Button text with rainbow animation
	var btn_x: int = (cols - button_text.length()) / 2
	var btn_y: int = box_y + box_h / 2
	for i in range(button_text.length()):
		var hue: float = fmod(t * 0.167 + float(i) / float(button_text.length()), 1.0)
		var color := Color.from_hsv(hue, 0.8, 1.0)
		grid.set_char(btn_x + i, btn_y, button_text[i], color, BOX_BG)

	# Version string
	var ver_x: int = (cols - version_string.length()) / 2
	var ver_y: int = box_y + box_h - 2
	grid.draw_string_at(ver_x, ver_y, version_string, Constants.COLORS.BRIGHT_BLACK, BOX_BG)


func _draw_voronoi_bg(cols: int, rows: int, t: float) -> void:
	# Cache animated seed positions once per frame (not per cell)
	var seed_count: int = _voronoi_seeds.size()
	var cached_sx: PackedFloat32Array = PackedFloat32Array()
	var cached_sy: PackedFloat32Array = PackedFloat32Array()
	cached_sx.resize(seed_count)
	cached_sy.resize(seed_count)
	for i in range(seed_count):
		var sd: Dictionary = _voronoi_seeds[i]
		cached_sx[i] = fmod(sd.x + sd.speed_x * t + 10.0, 1.0)
		cached_sy[i] = fmod(sd.y + sd.speed_y * t + 10.0, 1.0)

	var inv_cols: float = 1.0 / float(cols)
	var inv_rows: float = 1.0 / float(rows)

	for r in range(rows):
		var ny: float = float(r) * inv_rows
		for c in range(cols):
			var nx: float = float(c) * inv_cols
			var min_dist: float = 999.0
			var nearest_idx: int = 0

			for i in range(seed_count):
				var dx: float = nx - cached_sx[i]
				var dy: float = ny - cached_sy[i]
				var dist: float = dx * dx + dy * dy
				if dist < min_dist:
					min_dist = dist
					nearest_idx = i

			var char_idx: int = clampi(int(min_dist * 80.0), 0, BG_CHARS.size() - 1)
			var color_idx: int = nearest_idx % BG_COLORS.size()
			grid.set_char(c, r, BG_CHARS[char_idx], BG_COLORS[color_idx], BG_BASE)
