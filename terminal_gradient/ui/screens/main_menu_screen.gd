class_name MainMenuScreen
extends BaseScreen
## Main menu / title screen.
## Ported from js/ui.js drawMainMenu (lines 453-753).

const MENU_ITEMS: Array[String] = [
	"New Game", "Quick Start", "Debug Start", "Continue",
	"Import Save", "Settings", "Help", "Debug Adv",
]

# Wave colors for title animation
const WAVE_COLORS: Array[Color] = [
	Constants.COLORS.BLUE,
	Constants.COLORS.BRIGHT_BLUE,
	Constants.COLORS.BRIGHT_CYAN,
	Constants.COLORS.BRIGHT_WHITE,
	Constants.COLORS.BRIGHT_CYAN,
	Constants.COLORS.BRIGHT_BLUE,
]

# Wide ASCII art title (92 chars wide, 5 lines)
const TITLE_WIDE: Array[String] = [
	"██████ █████ ████  ██  ██ ██ ██  █  ███  █      ████ ████   ███  ████  ██ █████ ██  █ ██████",
	"  ██   █     █  █  ██████ ██ ███ █ █   █ █     █     █  █  █   █ █   █ ██ █     ███ █   ██  ",
	"  ██   ████  ████  ██ ███ ██ █ ███ █████ █     █  ██ ████  █████ █   █ ██ ████  █ ███   ██  ",
	"  ██   █     █ █   ██  ██ ██ █  ██ █   █ █     █   █ █  █  █   █ █   █ ██ █     █  ██   ██  ",
	"  ██   █████ █  █  ██  ██ ██ █   █ █   █ █████  ███  █  █  █   █ ████  ██ █████ █   █   ██  ",
]

# Compact title
const TITLE_COMPACT: String = "T E R M I N A L   G R A D I E N T"

var selected_index: int = 0
var version_string: String = "v0.1.0"
var has_save: bool = false

# Voronoi seeds for animated background
var _voronoi_seeds: Array = []


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	for i in range(10):
		_voronoi_seeds.append({
			"x": randf(),
			"y": randf(),
			"speed_x": randf_range(-0.1, 0.1),
			"speed_y": randf_range(-0.1, 0.1),
		})


func draw(cols: int, rows: int) -> void:
	var t: float = grid.frame_time_sec

	# Animated voronoi background
	_draw_voronoi_bg(cols, rows, t)

	# Determine title mode
	var title_lines: Array[String]
	var title_width: int
	var use_compact: bool = false

	if cols >= TITLE_WIDE[0].length() + 6:
		title_lines = []
		for line in TITLE_WIDE:
			title_lines.append(line)
		title_width = TITLE_WIDE[0].length()
	elif cols >= TITLE_COMPACT.length() + 6:
		title_lines = [TITLE_COMPACT]
		title_width = TITLE_COMPACT.length()
		use_compact = true
	else:
		title_lines = [TITLE_COMPACT]
		title_width = TITLE_COMPACT.length()
		use_compact = true

	# Title box
	var box_w: int = title_width + 4
	var box_h: int = title_lines.size() + 4
	var box_x: int = (cols - box_w) / 2
	var box_y: int = maxi(1, rows / 4 - box_h / 2)

	# Draw double-line border with gold sheen animation
	FFPanel.draw_double_border(grid, box_x, box_y, box_w, box_h)
	_draw_gold_sheen(box_x, box_y, box_w, box_h, t)

	# Draw title text with wave animation
	var title_start_y: int = box_y + 2
	for line_idx in range(title_lines.size()):
		var line: String = title_lines[line_idx]
		var lx: int = (cols - line.length()) / 2
		var ly: int = title_start_y + line_idx
		for i in range(line.length()):
			if line[i] == " ":
				continue
			var phase: float = (float(ly) + float(i) * 3.0) * 0.1 - t * 1.8
			var wave: float = (sin(phase) + 1.0) / 2.0
			var color_idx: int = int(wave * float(WAVE_COLORS.size() - 1))
			color_idx = clampi(color_idx, 0, WAVE_COLORS.size() - 1)
			grid.set_char(lx + i, ly, line[i], WAVE_COLORS[color_idx], Constants.COLORS.BLACK)

	# Version string
	var ver_text: String = "[%s]" % version_string
	var ver_x: int = (cols - ver_text.length()) / 2
	var ver_y: int = box_y + box_h
	grid.draw_string_at(ver_x, ver_y, ver_text, Constants.COLORS.BRIGHT_BLACK, Constants.COLORS.BLACK)

	# Menu items
	var menu_y: int = ver_y + 2
	_draw_menu_items(cols, menu_y, t)

	# Footer
	var footer: String = "◄ ► Select  ·  Enter Confirm"
	var footer_x: int = (cols - footer.length()) / 2
	grid.draw_string_at(footer_x, rows - 2, footer, Constants.COLORS.BRIGHT_BLACK, Constants.COLORS.BLACK)


func handle_input(action: String) -> void:
	match action:
		"move_left":
			selected_index = (selected_index - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
		"move_right":
			selected_index = (selected_index + 1) % MENU_ITEMS.size()
		"move_up":
			selected_index = (selected_index - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
		"move_down":
			selected_index = (selected_index + 1) % MENU_ITEMS.size()
		"interact":
			_select_item()


func _select_item() -> void:
	match selected_index:
		0:  # New Game
			request_action("new_game")
		1:  # Quick Start
			request_action("quick_start")
		2:  # Debug Start
			request_action("debug_start")
		3:  # Continue
			if has_save:
				request_action("continue_game")
		4:  # Import Save
			request_action("import_save")
		5:  # Settings
			request_action("open_settings")
		6:  # Help
			request_action("open_help")
		7:  # Debug Adv
			request_action("debug_advanced")


func _draw_menu_items(cols: int, y: int, _t: float) -> void:
	# Calculate total width of all items
	var total_width: int = 0
	for item in MENU_ITEMS:
		total_width += item.length() + 4  # brackets + spaces
	total_width += (MENU_ITEMS.size() - 1) * 3  # separators

	if total_width <= cols:
		# All items fit on one line
		var x: int = (cols - total_width) / 2
		for i in range(MENU_ITEMS.size()):
			var is_selected: bool = (i == selected_index)
			var text: String
			var fg: Color
			var bg: Color
			if is_selected:
				text = "[%s]" % MENU_ITEMS[i]
				fg = Constants.COLORS.BRIGHT_WHITE
				bg = Constants.COLORS.FF_BLUE_DARK
			else:
				text = " %s " % MENU_ITEMS[i]
				fg = Constants.COLORS.BRIGHT_BLACK
				bg = Constants.COLORS.BLACK
			grid.draw_string_at(x, y, text, fg, bg)
			x += text.length() + 3
	else:
		# Narrow mode: show subset with arrows
		var visible_items: int = 3
		var start: int = clampi(selected_index - visible_items / 2, 0, maxi(0, MENU_ITEMS.size() - visible_items))
		var end_idx: int = mini(start + visible_items, MENU_ITEMS.size())

		var line: String = ""
		if start > 0:
			line += "◄ "
		for i in range(start, end_idx):
			var is_selected: bool = (i == selected_index)
			if is_selected:
				line += "[%s]" % MENU_ITEMS[i]
			else:
				line += " %s " % MENU_ITEMS[i]
			if i < end_idx - 1:
				line += "   "
		if end_idx < MENU_ITEMS.size():
			line += " ►"

		var x: int = (cols - line.length()) / 2

		# Draw with proper colors per segment
		var draw_x: int = x
		if start > 0:
			grid.draw_string_at(draw_x, y, "◄ ", Constants.COLORS.BRIGHT_YELLOW)
			draw_x += 2

		for i in range(start, end_idx):
			var is_selected: bool = (i == selected_index)
			var text: String
			var fg: Color
			var bg: Color
			if is_selected:
				text = "[%s]" % MENU_ITEMS[i]
				fg = Constants.COLORS.BRIGHT_WHITE
				bg = Constants.COLORS.FF_BLUE_DARK
			else:
				text = " %s " % MENU_ITEMS[i]
				fg = Constants.COLORS.BRIGHT_BLACK
				bg = Constants.COLORS.BLACK
			grid.draw_string_at(draw_x, y, text, fg, bg)
			draw_x += text.length()
			if i < end_idx - 1:
				draw_x += 3

		if end_idx < MENU_ITEMS.size():
			grid.draw_string_at(draw_x, y, " ►", Constants.COLORS.BRIGHT_YELLOW)


func _draw_gold_sheen(box_x: int, box_y: int, box_w: int, box_h: int, t: float) -> void:
	## Animated gold sheen traveling around the border.
	var perimeter: int = 2 * (box_w + box_h) - 4
	var sheen_pos: float = fmod(t * 1.2, 1.0) * float(perimeter)

	# Walk the perimeter and brighten cells near sheen position
	var idx: int = 0
	# Top edge
	for c in range(box_x, box_x + box_w):
		var dist: float = abs(float(idx) - sheen_pos)
		if dist > float(perimeter) / 2.0:
			dist = float(perimeter) - dist
		var brightness: float = exp(-dist * dist / 8.0)
		if brightness > 0.1:
			var gold := Color(
				lerpf(0.627, 1.0, brightness),
				lerpf(0.471, 0.922, brightness),
				lerpf(0.118, 0.51, brightness),
			)
			# Re-draw the border char with gold tint
			var ch: String = grid.get_text_char(c, box_y)
			grid.set_char(c, box_y, ch, gold, Constants.COLORS.BLACK)
		idx += 1
	# Right edge
	for r in range(box_y + 1, box_y + box_h - 1):
		var dist: float = abs(float(idx) - sheen_pos)
		if dist > float(perimeter) / 2.0:
			dist = float(perimeter) - dist
		var brightness: float = exp(-dist * dist / 8.0)
		if brightness > 0.1:
			var gold := Color(
				lerpf(0.627, 1.0, brightness),
				lerpf(0.471, 0.922, brightness),
				lerpf(0.118, 0.51, brightness),
			)
			var ch: String = grid.get_text_char(box_x + box_w - 1, r)
			grid.set_char(box_x + box_w - 1, r, ch, gold, Constants.COLORS.BLACK)
		idx += 1
	# Bottom edge (reverse)
	for c in range(box_x + box_w - 1, box_x - 1, -1):
		var dist: float = abs(float(idx) - sheen_pos)
		if dist > float(perimeter) / 2.0:
			dist = float(perimeter) - dist
		var brightness: float = exp(-dist * dist / 8.0)
		if brightness > 0.1:
			var gold := Color(
				lerpf(0.627, 1.0, brightness),
				lerpf(0.471, 0.922, brightness),
				lerpf(0.118, 0.51, brightness),
			)
			var ch: String = grid.get_text_char(c, box_y + box_h - 1)
			grid.set_char(c, box_y + box_h - 1, ch, gold, Constants.COLORS.BLACK)
		idx += 1
	# Left edge (reverse)
	for r in range(box_y + box_h - 2, box_y, -1):
		var dist: float = abs(float(idx) - sheen_pos)
		if dist > float(perimeter) / 2.0:
			dist = float(perimeter) - dist
		var brightness: float = exp(-dist * dist / 8.0)
		if brightness > 0.1:
			var gold := Color(
				lerpf(0.627, 1.0, brightness),
				lerpf(0.471, 0.922, brightness),
				lerpf(0.118, 0.51, brightness),
			)
			var ch: String = grid.get_text_char(box_x, r)
			grid.set_char(box_x, r, ch, gold, Constants.COLORS.BLACK)
		idx += 1


func _draw_voronoi_bg(cols: int, rows: int, t: float) -> void:
	const BG_CHARS: Array[String] = [" ", ".", "·", ":", "∙", "░", "▒"]
	const BG_COLORS: Array[Color] = [
		Color("#2a2a30"), Color("#303038"), Color("#383840"),
		Color("#2a3038"), Color("#403040"), Color("#302a34"),
	]
	const BG_BASE: Color = Color("#0c0c10")

	# Cache animated seed positions once per frame
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
