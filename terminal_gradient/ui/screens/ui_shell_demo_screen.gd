class_name UIShellDemoScreen
extends BaseScreen
## Demo screen exercising every UIShell feature: menu pane on the left
## controls a stage region on the right that swaps between layout presets
## and content types.

const DEMO_MODES: Array[String] = [
	"SINGLE",
	"SPLIT LR",
	"QUAD 2x2",
	"GRID 3x3",
	"GRID 4x4",
	"MIXED",
	"FIRE NOISE",
]

# Right-side stage area; left 25% is the permanent menu pane.
const STAGE_RECT: Rect2 = Rect2(0.25, 0.0, 0.75, 1.0)

var _shell: UIShell
var _selection: int = 0
var _logo_tex: Texture2D
var _sefirot_tex: Texture2D


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_shell = UIShell.new(ascii_grid)
	_logo_tex = load("res://assets/graphics/tg_main_title.png")
	_sefirot_tex = load("res://assets/graphics/tg_sefirot_title_6.png")


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	_selection = 0
	_rebuild()


func on_exit() -> void:
	_shell.clear()
	super.on_exit()


func handle_input(action: String) -> void:
	match action:
		"move_up":
			_selection = (_selection - 1 + DEMO_MODES.size()) % DEMO_MODES.size()
			_rebuild()
		"move_down":
			_selection = (_selection + 1) % DEMO_MODES.size()
			_rebuild()
		"interact":
			pass
		"cancel":
			request_action("goto_debug_menu")


func draw(cols: int, rows: int) -> void:
	_shell.draw(cols, rows)


# ── Layout assembly ─────────────────────────────────

func _rebuild() -> void:
	var panes: Array[UIShell.Pane] = [_make_menu_pane()]
	match _selection:
		0:
			panes.append_array(_layout_single())
		1:
			panes.append_array(_layout_split_lr())
		2:
			panes.append_array(_layout_quad())
		3:
			panes.append_array(_layout_grid(3, 3))
		4:
			panes.append_array(_layout_grid_4x4_mixed())
		5:
			panes.append_array(_layout_mixed())
		6:
			panes.append_array(_layout_fire_noise())
	_shell.set_panes(panes)


func _make_menu_pane() -> UIShell.Pane:
	var p := UIShell.Pane.new()
	p.rect = Rect2(0.0, 0.0, 0.25, 1.0)
	p.content_type = UIShell.ContentType.MENU
	p.title = "DEMOS"
	var items := PackedStringArray()
	for s in DEMO_MODES:
		items.append(s)
	p.menu_items = items
	p.menu_selected = _selection
	return p


func _ascii_pane(rect: Rect2, title: String, lines: Array[String]) -> UIShell.Pane:
	var p := UIShell.Pane.new()
	p.rect = rect
	p.content_type = UIShell.ContentType.ASCII
	p.title = title
	var arr := PackedStringArray()
	for ln in lines:
		arr.append(ln)
	p.ascii_lines = arr
	return p


func _raster_pane(rect: Rect2, title: String, tex: Texture2D) -> UIShell.Pane:
	var p := UIShell.Pane.new()
	p.rect = rect
	p.content_type = UIShell.ContentType.RASTER
	p.title = title
	p.texture = tex
	return p


func _text_pane(rect: Rect2, title: String, text: String) -> UIShell.Pane:
	var p := UIShell.Pane.new()
	p.rect = rect
	p.content_type = UIShell.ContentType.TEXT
	p.title = title
	p.text = text
	return p


func _fire_pane(rect: Rect2, title: String) -> UIShell.Pane:
	var p := UIShell.Pane.new()
	p.rect = rect
	p.content_type = UIShell.ContentType.FIRE
	p.title = title
	return p


func _menu_pane(rect: Rect2, title: String, items: Array[String], selected: int) -> UIShell.Pane:
	var p := UIShell.Pane.new()
	p.rect = rect
	p.content_type = UIShell.ContentType.MENU
	p.title = title
	var arr := PackedStringArray()
	for s in items:
		arr.append(s)
	p.menu_items = arr
	p.menu_selected = selected
	return p


# ── Layout presets ──────────────────────────────────

func _layout_single() -> Array[UIShell.Pane]:
	var lines: Array[String] = [
		"",
		"  Welcome to the UI shell demo.",
		"",
		"  This pane covers the entire stage area as a 1x1 layout.",
		"  Each entry in the menu on the left swaps this region",
		"  for a different pane configuration.",
		"",
		"  Four content types are supported:",
		"    - ASCII   drawn into the AsciiGrid text buffer",
		"    - RASTER  TextureRect with auto-applied dither12 filter",
		"    - TEXT    TTF Label with word-smart autowrap",
		"    - MENU    vertical TTF buttons styled like the title screen",
		"",
		"  Borders are box-drawing glyphs in the text buffer.",
		"  Pane bounds are normalized Rect2 in 0..1 viewport space,",
		"  so 1x1, 2x2, 4x4, uneven splits and nested grids are all",
		"  just lists of Rect2.",
		"",
		"  Use UP / DOWN to switch demos. ESC returns to the title.",
	]
	return [_ascii_pane(STAGE_RECT, "ASCII PANE - SINGLE", lines)]


func _layout_split_lr() -> Array[UIShell.Pane]:
	var rects: Array[Rect2] = PaneLayout.inset(PaneLayout.split_lr(0.5), STAGE_RECT)
	var ascii_lines: Array[String] = [
		"",
		"  ASCII left,",
		"  raster right.",
		"",
		"  The right pane",
		"  carries the same",
		"  dither12 + fullblock",
		"  filter the title",
		"  screen uses for its",
		"  logo and sefirot.",
		"",
		"  This is the default",
		"  for any RASTER pane,",
		"  never opt-in.",
	]
	return [
		_ascii_pane(rects[0], "ASCII", ascii_lines),
		_raster_pane(rects[1], "RASTER (DITHERED)", _sefirot_tex),
	]


func _layout_quad() -> Array[UIShell.Pane]:
	var rects: Array[Rect2] = PaneLayout.inset(PaneLayout.grid(2, 2), STAGE_RECT)
	var ascii_lines: Array[String] = [
		"",
		"  Cell-snapped",
		"  monospace text.",
		"",
		"  Cheap to draw,",
		"  crisp at any DPI.",
	]
	var menu_items: Array[String] = ["ALPHA", "BETA", "GAMMA"]
	return [
		_ascii_pane(rects[0], "ASCII", ascii_lines),
		_raster_pane(rects[1], "RASTER", _logo_tex),
		_text_pane(rects[2], "TEXT",
			"Native TTF Label with autowrap. Crisp at any DPI. " +
			"Layered on top of the AsciiGrid text buffer."),
		_menu_pane(rects[3], "MENU", menu_items, 1),
	]


func _layout_grid(cols: int, rows: int) -> Array[UIShell.Pane]:
	var rects: Array[Rect2] = PaneLayout.inset(PaneLayout.grid(cols, rows), STAGE_RECT)
	var out: Array[UIShell.Pane] = []
	for i in range(rects.size()):
		var col: int = i % cols
		var row: int = i / cols
		var lines: Array[String] = ["", "  cell %d" % i]
		out.append(_ascii_pane(rects[i], "%d,%d" % [col, row], lines))
	return out


func _layout_grid_4x4_mixed() -> Array[UIShell.Pane]:
	var panes: Array[UIShell.Pane] = _layout_grid(4, 4)
	# Swap the (1,1) cell to RASTER and the (2,2) cell to TEXT.
	var idx_raster: int = 1 * 4 + 1
	panes[idx_raster].content_type = UIShell.ContentType.RASTER
	panes[idx_raster].title = "RAST"
	panes[idx_raster].texture = _sefirot_tex
	var idx_text: int = 2 * 4 + 2
	panes[idx_text].content_type = UIShell.ContentType.TEXT
	panes[idx_text].title = "TEXT"
	panes[idx_text].text = "Mixed TTF cell."
	return panes


func _layout_fire_noise() -> Array[UIShell.Pane]:
	# Top: full-width fire pane on its own. Bottom: split with an ASCII
	# pane next to a smaller fire pane so you can see how the procedural
	# background composes alongside other content types.
	var top_rect := Rect2(STAGE_RECT.position.x, STAGE_RECT.position.y,
			STAGE_RECT.size.x, STAGE_RECT.size.y * 0.55)
	var bottom_y: float = STAGE_RECT.position.y + STAGE_RECT.size.y * 0.55
	var bottom_h: float = STAGE_RECT.size.y * 0.45
	var bottom_l := Rect2(STAGE_RECT.position.x, bottom_y,
			STAGE_RECT.size.x * 0.5, bottom_h)
	var bottom_r := Rect2(STAGE_RECT.position.x + STAGE_RECT.size.x * 0.5, bottom_y,
			STAGE_RECT.size.x * 0.5, bottom_h)
	var ascii_lines: Array[String] = [
		"",
		"  Voronoi-glyph fire layer",
		"  extracted from the title",
		"  screen as a reusable pane",
		"  background.",
		"",
		"  Each pane animates its own",
		"  seeds + time uniforms,",
		"  scaled to the pane's own",
		"  glyph-cell dimensions.",
	]
	return [
		_fire_pane(top_rect, "FIRE NOISE - FULL"),
		_ascii_pane(bottom_l, "ASCII", ascii_lines),
		_fire_pane(bottom_r, "FIRE NOISE - HALF"),
	]


func _layout_mixed() -> Array[UIShell.Pane]:
	var raw: Array[Rect2] = [
		Rect2(0.0, 0.0, 0.45, 1.0),    # tall left raster
		Rect2(0.45, 0.0, 0.55, 0.4),   # right top: TEXT
		Rect2(0.45, 0.4, 0.55, 0.35),  # right mid: ASCII
		Rect2(0.45, 0.75, 0.55, 0.25), # right bottom: sub-MENU
	]
	var rects: Array[Rect2] = PaneLayout.inset(raw, STAGE_RECT)
	var ascii_lines: Array[String] = [
		"",
		"  Cell-grid content.",
		"  Always pixel-snapped.",
		"  Free to draw.",
	]
	var sub_items: Array[String] = ["ONE", "TWO"]
	return [
		_raster_pane(rects[0], "TALL RASTER", _sefirot_tex),
		_text_pane(rects[1], "TEXT (TTF)",
			"Uneven splits work — layouts are just Array[Rect2]. " +
			"Nested, asymmetric, anything goes."),
		_ascii_pane(rects[2], "ASCII", ascii_lines),
		_menu_pane(rects[3], "SUB-MENU", sub_items, 0),
	]
