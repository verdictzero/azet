class_name JrpgUiTestScreen
extends BaseScreen
## Hosts the JRPG UI gallery (ui_test.tscn) as a Control-node overlay
## inside the existing ASCII grid scene tree.

const TEST_SCENE: PackedScene = preload("res://ui/jrpg/ui_test.tscn")

var _instance: Control = null


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	if _instance == null:
		_instance = TEST_SCENE.instantiate()
		_instance.exit_requested.connect(_on_exit_requested)
		grid.add_child(_instance)


func on_exit() -> void:
	if _instance:
		_instance.queue_free()
		_instance = null
	super.on_exit()


func draw(_cols: int, _rows: int) -> void:
	# Control-node hierarchy handles its own rendering.
	pass


func handle_input(action: String) -> void:
	if _instance and _instance.has_method("handle_action"):
		_instance.handle_action(action)


func _on_exit_requested() -> void:
	request_action("goto_debug_menu")
