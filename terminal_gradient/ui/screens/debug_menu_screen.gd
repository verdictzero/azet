class_name DebugMenuScreen
extends BaseScreen
## Debug hub screen. Lists debug/test destinations using UIShell.
## Stub items that have no screen yet trigger a violent shake + red flash.

const MENU_ITEMS: Array[String] = [
	"FIRE DEMO", "UI SHELL DEMO", "TERRAIN DEMO", "TERRAIN DEMO 2",
	"SPLATMAP SPAWN TEST",
]

const MENU_ACTIONS: Array[String] = [
	"open_fire_demo", "ui_shell_demo", "open_terrain_demo", "open_terrain_demo_2",
	"open_splatmap_spawn_test",
]

const MENU_DESCRIPTIONS: Array[String] = [
	"Full-screen Voronoi fire shader demo. 100% GPU-driven with 10 animated seed points.",
	"UIShell pane layout demo. Exercises every content type: ASCII, raster, text, menu, fire.",
	"TERRAIN DEMO",
	"TERRAIN DEMO 2",
	"Splatmap → spawn alignment test. Five bold-colour zones; cuboids inherit the colour of the zone they land in. Any mismatch between a cuboid and the ground beneath it = drift in the shared CPU/GPU sampler.",
]

var _shell: UIShell
var _selection: int = 0


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_shell = UIShell.new(ascii_grid)


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
			_selection = (_selection - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
			_rebuild()
		"move_down":
			_selection = (_selection + 1) % MENU_ITEMS.size()
			_rebuild()
		"interact":
			var act: String = MENU_ACTIONS[_selection]
			if act == "":
				_shell.reject_selection(0, _selection)
			else:
				request_action(act)
		"cancel":
			request_action("goto_title")


func draw(cols: int, rows: int) -> void:
	_shell.draw(cols, rows)


func _rebuild() -> void:
	var menu_pane := UIShell.Pane.new()
	menu_pane.rect = Rect2(0.0, 0.0, 0.30, 1.0)
	menu_pane.content_type = UIShell.ContentType.MENU
	menu_pane.title = "DEBUG MENU"
	var items := PackedStringArray()
	for s in MENU_ITEMS:
		items.append(s)
	menu_pane.menu_items = items
	menu_pane.menu_selected = _selection

	var desc_pane := UIShell.Pane.new()
	desc_pane.rect = Rect2(0.30, 0.0, 0.70, 1.0)
	desc_pane.content_type = UIShell.ContentType.TEXT
	desc_pane.title = MENU_ITEMS[_selection]
	desc_pane.text = MENU_DESCRIPTIONS[_selection]

	var panes: Array[UIShell.Pane] = [menu_pane, desc_pane]
	_shell.set_panes(panes)
