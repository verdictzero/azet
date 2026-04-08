class_name UIManager
extends RefCounted
## Screen registry, lifecycle management, and screen stack.
##
## Manages all game screens with proper lifecycle (on_enter/on_exit).
## Supports a screen stack for modal overlays (inventory over world,
## dialogue over exploration, etc).

var grid: AsciiGrid

# Screen registry: State enum value → BaseScreen instance
var _screens: Dictionary = {}

# Screen stack: bottom is the base state, top is the active overlay
var _screen_stack: Array[int] = []  # stack of State enum values

# Message log
var message_log: Array[Dictionary] = []
const MAX_MESSAGES: int = 500
const VISIBLE_MESSAGES: int = 5

# Action callback — GameManager sets this to handle screen action requests
var on_screen_action: Callable


func _init(ascii_grid: AsciiGrid) -> void:
	grid = ascii_grid


# ── Screen Registration ──────────────────────────

func register_screen(state: int, screen: BaseScreen) -> void:
	## Register a screen for a game state. Call during initialization.
	_screens[state] = screen
	screen.action_requested.connect(_on_screen_action.bind(state))


func get_screen(state: int) -> BaseScreen:
	return _screens.get(state)


func has_screen(state: int) -> bool:
	return _screens.has(state)


# ── Screen Stack ─────────────────────────────────

func push_screen(state: int, context: Dictionary = {}) -> void:
	## Push a screen onto the stack (for overlays/modals).
	## The previous screen stays rendered underneath if it's a gameplay state.
	var screen: BaseScreen = _screens.get(state)
	if screen == null:
		push_warning("UIManager: No screen registered for state %d" % state)
		return
	_screen_stack.append(state)
	screen.on_enter(context)


func pop_screen() -> int:
	## Pop the top screen from the stack. Returns the popped state, or -1.
	if _screen_stack.is_empty():
		return -1
	var state: int = _screen_stack.pop_back()
	var screen: BaseScreen = _screens.get(state)
	if screen:
		screen.on_exit()
	return state


func switch_screen(state: int, context: Dictionary = {}) -> void:
	## Replace the entire stack with a single screen.
	## Calls on_exit on all current screens, on_enter on the new one.
	while not _screen_stack.is_empty():
		pop_screen()
	push_screen(state, context)


func active_state() -> int:
	## Return the topmost screen's state, or -1 if empty.
	if _screen_stack.is_empty():
		return -1
	return _screen_stack.back()


func active_screen() -> BaseScreen:
	var state: int = active_state()
	if state < 0:
		return null
	return _screens.get(state)


# ── Drawing ──────────────────────────────────────

func draw_active() -> void:
	## Draw the active (topmost) screen.
	var screen: BaseScreen = active_screen()
	if screen:
		screen.draw(grid.cols, grid.rows)


func handle_active_input(action: String) -> void:
	## Route input to the active (topmost) screen.
	var screen: BaseScreen = active_screen()
	if screen:
		screen.handle_input(action)


# ── Message Log ──────────────────────────────────

func add_message(text: String, color: Color = Constants.COLORS.WHITE) -> void:
	message_log.append({
		"text": text,
		"color": color,
		"turn": 0,  # Set by caller if needed
	})
	if message_log.size() > MAX_MESSAGES:
		message_log.pop_front()
	EventBus.message_logged.emit(text, color)


func draw_message_log(y: int, cols: int) -> void:
	## Draw the last VISIBLE_MESSAGES messages with age-based dimming.
	var start: int = maxi(0, message_log.size() - VISIBLE_MESSAGES)
	for i in range(start, message_log.size()):
		var msg: Dictionary = message_log[i]
		var row: int = y + (i - start)
		var age: int = i - start  # 0 = oldest visible, VISIBLE_MESSAGES-1 = newest
		# Dim older messages
		var color: Color = msg.color
		if age < VISIBLE_MESSAGES - 2:
			color = color.lerp(Constants.COLORS.BRIGHT_BLACK, 0.5)
		var text: String = msg.text
		if text.length() > cols - 2:
			text = text.substr(0, cols - 3) + "…"
		grid.draw_string_at(1, row, text, color, Constants.COLORS.BLACK)


# ── HUD ──────────────────────────────────────────

func draw_hud_borders() -> void:
	## Draw the standard HUD frame (borders, separators).
	var c: int = grid.cols
	var r: int = grid.rows
	var border_fg: Color = Constants.COLORS.FF_BORDER
	var border_bg: Color = Constants.COLORS.FF_BLUE_DARK

	# Top and bottom borders
	for col in range(c):
		grid.set_char(col, 0, Constants.BOX_H, border_fg, border_bg)
		grid.set_char(col, r - 1, Constants.BOX_H, border_fg, border_bg)

	# Side borders
	for row in range(r):
		grid.set_char(0, row, Constants.BOX_V, border_fg, border_bg)
		grid.set_char(c - 1, row, Constants.BOX_V, border_fg, border_bg)

	# Corners
	grid.set_char(0, 0, Constants.BOX_TL, border_fg, border_bg)
	grid.set_char(c - 1, 0, Constants.BOX_TR, border_fg, border_bg)
	grid.set_char(0, r - 1, Constants.BOX_BL, border_fg, border_bg)
	grid.set_char(c - 1, r - 1, Constants.BOX_BR, border_fg, border_bg)


# ── Internal ─────────────────────────────────────

func _on_screen_action(action_name: String, data: Variant, _source_state: int) -> void:
	if on_screen_action.is_valid():
		on_screen_action.call(action_name, data)
