class_name BaseScreen
extends RefCounted
## Abstract base class for all game screens.
##
## Screens draw to AsciiGrid buffers and handle input actions.
## They have a lifecycle: on_enter → draw/handle_input (loop) → on_exit.
## Screens can emit signals to request state changes without coupling
## to GameManager directly.

signal action_requested(action_name: String, data: Variant)

var grid: AsciiGrid
var is_active: bool = false


func _init(ascii_grid: AsciiGrid) -> void:
	grid = ascii_grid


func on_enter(context: Dictionary = {}) -> void:
	## Called when this screen becomes active. Override for initialization.
	## context: arbitrary data passed from the state transition.
	is_active = true


func on_exit() -> void:
	## Called when this screen is deactivated. Override for cleanup.
	is_active = false


func draw(_cols: int, _rows: int) -> void:
	## Override: render this screen's content to the grid buffers.
	pass


func handle_input(_action: String) -> void:
	## Override: process an input action string.
	pass


func request_action(action_name: String, data: Variant = null) -> void:
	## Emit an action request (e.g., "start_new_game", "open_settings").
	## GameManager listens to these instead of screens calling GameMgr directly.
	action_requested.emit(action_name, data)
