extends Node
## Unified input manager: keyboard, gamepad, touch → action queue.
## Ported from js/engine.js InputManager.
##
## Uses held-key state tracking (like JS _keysDown/_keysPressed) instead of
## raw event queueing, to correctly distinguish first-press from held keys
## and prevent duplicate actions from mixed input sources.

# Action queue consumed by GameManager each frame
var _action_queue: Array[String] = []

# Held state tracking — two pre-allocated dicts, swapped each frame (zero alloc)
var _keys_down_a: Dictionary = {}
var _keys_down_b: Dictionary = {}
var _keys_down: Dictionary = _keys_down_a       # current frame (write target)
var _keys_down_prev: Dictionary = _keys_down_b   # previous frame (read-only)

# Key repeat
var _repeat_action: String = ""
var _repeat_timer: float = 0.0
var _repeating: bool = false
const REPEAT_DELAY: float = 0.220
const REPEAT_INTERVAL: float = 0.090

# Gamepad
const GAMEPAD_DEADZONE: float = 0.4

const DIRECTION_ACTIONS: Array[String] = [
	"move_up", "move_down", "move_left", "move_right",
]

const ALL_ACTIONS: Array[String] = [
	"move_up", "move_down", "move_left", "move_right",
	"interact", "cancel", "inventory", "character",
	"quest_log", "map", "pause_menu", "debug_menu",
]


func _process(delta: float) -> void:
	# Swap: previous current becomes prev, previous prev gets cleared and reused
	var tmp: Dictionary = _keys_down_prev
	_keys_down_prev = _keys_down
	_keys_down = tmp
	_keys_down.clear()
	for action in ALL_ACTIONS:
		if Input.is_action_pressed(action):
			_keys_down[action] = true

	# Add gamepad analog stick as held state
	_poll_gamepad_into_keys_down()

	# Detect newly pressed actions (down this frame, not last frame)
	for action in _keys_down:
		if not _keys_down_prev.has(action):
			_action_queue.append(action)
			# Start repeat for direction keys
			if action in DIRECTION_ACTIONS:
				_repeat_action = action
				_repeat_timer = 0.0
				_repeating = false

	# Handle key repeat for held direction keys
	if _repeat_action != "" and _keys_down.has(_repeat_action):
		_repeat_timer += delta
		var threshold: float = REPEAT_DELAY if not _repeating else REPEAT_INTERVAL
		if _repeat_timer >= threshold:
			_repeat_timer = 0.0
			_repeating = true
			_action_queue.append(_repeat_action)
	elif _repeat_action != "":
		_repeat_action = ""
		_repeat_timer = 0.0
		_repeating = false


func consume_action() -> String:
	## Pop and return the oldest queued action, or "" if none.
	if _action_queue.is_empty():
		return ""
	return _action_queue.pop_front()


func peek_action() -> String:
	if _action_queue.is_empty():
		return ""
	return _action_queue[0]


func clear_actions() -> void:
	## Clear everything (call on state transitions).
	_action_queue.clear()
	_keys_down.clear()
	_keys_down_prev.clear()
	_repeat_action = ""
	_repeat_timer = 0.0
	_repeating = false


func has_action() -> bool:
	return not _action_queue.is_empty()


func is_held(action: String) -> bool:
	## Check if an action is currently held (useful for modifier-style checks).
	return _keys_down.has(action)


func _poll_gamepad_into_keys_down() -> void:
	## Read analog sticks and inject into _keys_down as if they were buttons.
	var left_x: float = Input.get_joy_axis(0, JOY_AXIS_LEFT_X)
	var left_y: float = Input.get_joy_axis(0, JOY_AXIS_LEFT_Y)

	if left_x > GAMEPAD_DEADZONE:
		_keys_down["move_right"] = true
	elif left_x < -GAMEPAD_DEADZONE:
		_keys_down["move_left"] = true
	if left_y > GAMEPAD_DEADZONE:
		_keys_down["move_down"] = true
	elif left_y < -GAMEPAD_DEADZONE:
		_keys_down["move_up"] = true
