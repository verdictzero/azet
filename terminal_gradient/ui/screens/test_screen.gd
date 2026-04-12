class_name TestScreen
extends BaseScreen
## Infinite procedural overworld demo. Renders into AsciiGrid's gfx
## buffer at full glyph-cell density (same grid the fire shader covers),
## one world tile per cell. Player moves with WASD/arrows; Escape
## returns to the title.

const PLAYER_GLYPH: String = "@"

var _world: TestWorld
var _player_x: int = 0
var _player_y: int = 0
var _cam_x: int = 0
var _cam_y: int = 0

var _player_fg: Color
var _player_bg: Color


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_player_fg = Constants.COLORS.BRIGHT_WHITE
	_player_bg = Color(0.0, 0.0, 0.0)


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	# Fresh world every entry so this actually feels like a scratch demo.
	_world = TestWorld.new(randi())
	_player_x = 0
	_player_y = 0
	# Nudge off an unwalkable spawn (rivers are the only blockers).
	if not _world.is_walkable(_player_x, _player_y):
		for radius in range(1, 64):
			var found: bool = false
			for dy in range(-radius, radius + 1):
				for dx in range(-radius, radius + 1):
					if absi(dx) != radius and absi(dy) != radius:
						continue
					if _world.is_walkable(_player_x + dx, _player_y + dy):
						_player_x += dx
						_player_y += dy
						found = true
						break
				if found:
					break
			if found:
				break
	# Edge-to-edge gfx buffer at glyph-cell density.
	grid.set_gfx_fills_viewport(true)


func on_exit() -> void:
	grid.set_gfx_fills_viewport(false)
	super.on_exit()


func handle_input(action: String) -> void:
	match action:
		"move_up":
			_try_move(0, -1)
		"move_down":
			_try_move(0, 1)
		"move_left":
			_try_move(-1, 0)
		"move_right":
			_try_move(1, 0)
		"cancel":
			request_action("goto_title")


func _try_move(dx: int, dy: int) -> void:
	var nx: int = _player_x + dx
	var ny: int = _player_y + dy
	if _world.is_walkable(nx, ny):
		_player_x = nx
		_player_y = ny


func draw(_cols: int, _rows: int) -> void:
	var vw: int = grid.g_cols
	var vh: int = grid.g_rows
	if vw <= 0 or vh <= 0:
		return

	# Camera strictly follows the player — no smoothing, no bounds.
	_cam_x = _player_x - vw / 2
	_cam_y = _player_y - vh / 2

	# The world animates (player moves) but never between frames on its
	# own, so the buffer-diff check would usually correctly skip uploads.
	# Invalidate anyway to keep things simple while the world is small.
	grid.invalidate()

	for row in range(vh):
		var wy: int = _cam_y + row
		for col in range(vw):
			var wx: int = _cam_x + col
			var tile: Dictionary = _world.get_tile(wx, wy)
			grid.set_gfx_char(col, row, tile.glyph, tile.fg, tile.bg)

	var px: int = _player_x - _cam_x
	var py: int = _player_y - _cam_y
	if px >= 0 and px < vw and py >= 0 and py < vh:
		grid.set_gfx_char(px, py, PLAYER_GLYPH, _player_fg, _player_bg)
