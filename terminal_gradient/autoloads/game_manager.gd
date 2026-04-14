extends Node
## Central game state machine and main loop orchestrator.
## Ported from js/main.js Game class.
##
## Uses UIManager's screen registry and stack for decoupled screen management.
## Screens communicate back via action_requested signals, not direct GameMgr calls.

enum State {
	PREAMBLE,
	MENU,
	CHAR_CREATE,
	LOADING,
	WORLD_GEN_PAUSE,
	TEST,
	LOCATION,
	DUNGEON,
	COMBAT,
	BATTLE_ENTER,
	ENEMY_DEATH,
	BATTLE_RESULTS,
	DIALOGUE,
	SHOP,
	INVENTORY,
	EQUIPMENT,
	CHARACTER,
	QUEST_LOG,
	MAP,
	ALMANAC,
	FACTION,
	HELP,
	SETTINGS,
	GAME_OVER,
	QUEST_COMPASS,
	TRANSIT_MAP,
	DEBUG_MENU,
	CONSOLE_LOG,
	GAMEPAD_MENU,
	REST_ITEM_SELECT,
	ASCII_CUTSCENE,
	VIDEO_CUTSCENE,
	ENGINEERING_SPACE,
	FIRE_DEMO,
	TITLE_SCREEN,
	UI_SHELL_DEMO,
}

var current_state: State = State.PREAMBLE
var prev_state: State = State.PREAMBLE

var seed: int = 0
var rng: SeededRNG
var turn_count: int = 0

# Transition
var transition_timer: float = 0.0
var transition_duration: float = 0.3
var _transitioning: bool = false

# FPS overlay (F3)
var _show_fps: bool = false
var _fps_accum: float = 0.0
var _fps_frame_count: int = 0
var _fps_display: int = 0

# References
var ascii_grid: AsciiGrid
var ui_manager: UIManager

const AUTO_SAVE_INTERVAL: int = 100


func initialize(grid: AsciiGrid) -> void:
	## Called by main scene to wire up the grid reference and register screens.
	ascii_grid = grid
	ui_manager = UIManager.new(ascii_grid)

	# Set up action handler for screen requests
	ui_manager.on_screen_action = _handle_screen_action

	# Register Phase 1 screens
	ui_manager.register_screen(State.PREAMBLE, PreambleScreen.new(ascii_grid))
	ui_manager.register_screen(State.MENU, MainMenuScreen.new(ascii_grid))
	ui_manager.register_screen(State.FIRE_DEMO, FireDemoScreen.new(ascii_grid))
	ui_manager.register_screen(State.TITLE_SCREEN, TitleScreen.new(ascii_grid))
	ui_manager.register_screen(State.UI_SHELL_DEMO, UIShellDemoScreen.new(ascii_grid))
	ui_manager.register_screen(State.TEST, TestScreen.new(ascii_grid))

	# Start at title screen
	set_state(State.TITLE_SCREEN)


func set_state(new_state: State) -> void:
	prev_state = current_state
	current_state = new_state

	InputMgr.clear_actions()

	_transitioning = true
	transition_timer = transition_duration

	# Switch the screen stack
	ui_manager.switch_screen(new_state)

	EventBus.state_changed.emit(prev_state, new_state)
	EventBus.transition_started.emit(State.keys()[new_state])


func push_overlay(state: State, context: Dictionary = {}) -> void:
	## Push a modal screen (inventory, dialogue, etc.) over the current state.
	ui_manager.push_screen(state, context)


func pop_overlay() -> void:
	## Pop the topmost overlay screen.
	ui_manager.pop_screen()


func _process(delta: float) -> void:
	if ascii_grid == null:
		return

	# Advance the day/night clock. TimeMgr.paused (menus/cutscenes) gates
	# the accumulator internally, so this is safe to call unconditionally.
	TimeMgr.update_real_time(delta)

	# Update transition
	if _transitioning:
		transition_timer -= delta
		if transition_timer <= 0.0:
			transition_timer = 0.0
			_transitioning = false
			EventBus.transition_completed.emit()

	# Process input (skip during transitions)
	if not _transitioning:
		var action: String = InputMgr.consume_action()
		if action != "":
			ui_manager.handle_active_input(action)

	# FPS tracking (runs whether or not the counter is visible so the
	# reading is warm the instant the user presses F3)
	_fps_accum += delta
	_fps_frame_count += 1
	if _fps_accum >= 0.5:
		_fps_display = roundi(float(_fps_frame_count) / _fps_accum)
		_fps_accum = 0.0
		_fps_frame_count = 0

	# Render frame
	ascii_grid.begin_frame()
	ui_manager.draw_active()
	if _show_fps:
		_draw_fps_overlay()
	ascii_grid.end_frame(_transitioning)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_fps"):
		_show_fps = not _show_fps
		get_viewport().set_input_as_handled()


func _draw_fps_overlay() -> void:
	var text: String = " FPS:%d " % _fps_display
	var fg: Color = Constants.COLORS.BRIGHT_GREEN
	var bg := Color(0.02, 0.02, 0.02, 1.0)
	for i in range(text.length()):
		ascii_grid.set_char(i, 0, text[i], fg, bg)


func is_gameplay_state() -> bool:
	return current_state in [
		State.LOCATION, State.DUNGEON,
		State.COMBAT, State.DIALOGUE, State.SHOP,
	]


func start_new_game(player_seed: int = 0) -> void:
	if player_seed == 0:
		seed = randi()
	else:
		seed = player_seed
	rng = SeededRNG.new(seed)
	turn_count = 0
	set_state(State.LOADING)


# ── Screen action handler ────────────────────────

func _handle_screen_action(action_name: String, data: Variant) -> void:
	## Central handler for all screen action requests.
	## Screens emit actions; GameManager decides what to do.
	match action_name:
		"goto_menu":
			set_state(State.MENU)
		"new_game":
			start_new_game()
		"quick_start":
			start_new_game()
		"debug_start":
			start_new_game()
		"continue_game":
			var save_data: Variant = SaveMgr.load_game()
			if save_data != null:
				pass  # TODO: Restore game state from save_data
		"open_settings":
			set_state(State.SETTINGS)
		"open_help":
			set_state(State.HELP)
		"ui_shell_demo":
			set_state(State.UI_SHELL_DEMO)
		"test_screen":
			set_state(State.TEST)
		"goto_title":
			set_state(State.TITLE_SCREEN)
		_:
			push_warning("GameManager: Unhandled screen action '%s'" % action_name)
