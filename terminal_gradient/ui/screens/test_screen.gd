class_name TestScreen
extends BaseScreen
## Infinite procedural overworld demo. Renders into AsciiGrid's gfx
## buffer at full glyph-cell density (same grid the fire shader covers),
## one world tile per cell. Player moves with WASD/arrows; Escape
## returns to the title.
##
## Perf shape:
##  - Idle frame (camera unchanged): early-return, zero work. The gfx
##    buffer retains last frame's contents and AsciiGrid's A/B diff
##    skips the GPU upload.
##  - Moving frame: ~15,400 cells × at most 8 Perlin samples each +
##    one set_gfx_char per cell. Dictionary-free hot path.

const PLAYER_GLYPH: String = "@"

# ── Biome palette ────────────────────────────────
# Held on the screen (not TestWorld) so the draw loop can pick colors
# without a Dictionary allocation per cell.
var _c_grass_fg: Color
var _c_grass_fg_alt: Color
var _c_grass_bg: Color
var _c_dirt_fg: Color
var _c_dirt_bg: Color
var _c_forest_fg: Color
var _c_forest_bg: Color
var _c_deep_forest_fg: Color
var _c_deep_forest_bg: Color
var _c_flood_fg: Color
var _c_flood_bg: Color
var _c_river_fg: Color
var _c_river_fg_alt: Color
var _c_river_bg: Color
var _player_fg: Color
var _player_bg: Color

var _world: TestWorld
var _player_x: int = 0
var _player_y: int = 0
var _cam_x: int = 0
var _cam_y: int = 0

# Static-camera skip state. Sentinel value forces a full draw on the
# first frame after on_enter().
const _CAM_DIRTY: int = 0x7FFFFFFF
var _last_cam_x: int = _CAM_DIRTY
var _last_cam_y: int = _CAM_DIRTY
var _last_vw: int = 0
var _last_vh: int = 0


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_c_grass_fg       = Constants.COLORS.BRIGHT_GREEN
	_c_grass_fg_alt   = Constants.COLORS.GREEN
	_c_grass_bg       = Color(0.04, 0.08, 0.04)
	_c_dirt_fg        = Constants.COLORS.YELLOW
	_c_dirt_bg        = Color(0.10, 0.07, 0.03)
	_c_forest_fg      = Constants.COLORS.GREEN
	_c_forest_bg      = Color(0.03, 0.06, 0.03)
	_c_deep_forest_fg = Color(0.10, 0.45, 0.18)
	_c_deep_forest_bg = Color(0.02, 0.04, 0.02)
	_c_flood_fg       = Constants.COLORS.BRIGHT_CYAN
	_c_flood_bg       = Color(0.03, 0.08, 0.09)
	_c_river_fg       = Constants.COLORS.BRIGHT_CYAN
	_c_river_fg_alt   = Constants.COLORS.CYAN
	_c_river_bg       = Color(0.02, 0.05, 0.12)
	_player_fg        = Constants.COLORS.BRIGHT_WHITE
	_player_bg        = Color(0.0, 0.0, 0.0)


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
	# Force a full redraw on the first frame.
	_last_cam_x = _CAM_DIRTY
	_last_cam_y = _CAM_DIRTY
	_last_vw = 0
	_last_vh = 0


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

	# Static-camera skip: nothing to do. The gfx buffer still holds the
	# previous frame's data, and end_frame()'s A/B diff will skip the
	# GPU upload since we don't touch any cells.
	if (_cam_x == _last_cam_x and _cam_y == _last_cam_y
			and vw == _last_vw and vh == _last_vh):
		return

	# Fan out locals so the inner loop doesn't pay `.` lookups repeatedly.
	var world := _world
	var g := grid
	var B_RIVER: int = TestWorld.Biome.RIVER
	var B_FLOOD: int = TestWorld.Biome.FLOODLAND
	var B_DEEP:  int = TestWorld.Biome.DEEP_FOREST
	var B_FOR:   int = TestWorld.Biome.FOREST
	var B_DIRT:  int = TestWorld.Biome.DIRT

	for row in range(vh):
		var wy: int = _cam_y + row
		for col in range(vw):
			var wx: int = _cam_x + col
			var biome: int = world.get_biome(wx, wy)
			var d: float = world.get_detail(wx, wy)
			var glyph: String
			var fg: Color
			var bg: Color
			if biome == B_RIVER:
				glyph = "≈" if d > 0.25 else ("~" if d > -0.25 else " ")
				fg = _c_river_fg if d > 0.0 else _c_river_fg_alt
				bg = _c_river_bg
			elif biome == B_FLOOD:
				glyph = "," if d > 0.0 else "."
				fg = _c_flood_fg
				bg = _c_flood_bg
			elif biome == B_DEEP:
				glyph = "♣" if d > -0.1 else "♠"
				fg = _c_deep_forest_fg
				bg = _c_deep_forest_bg
			elif biome == B_FOR:
				if d > 0.3:
					glyph = "♣"
				elif d > -0.1:
					glyph = "♠"
				else:
					glyph = "\""
				fg = _c_forest_fg
				bg = _c_forest_bg
			elif biome == B_DIRT:
				glyph = "·" if d > 0.0 else ","
				fg = _c_dirt_fg
				bg = _c_dirt_bg
			else:
				# Grassland
				if d > 0.3:
					glyph = "\""
				elif d > -0.1:
					glyph = ","
				else:
					glyph = "."
				fg = _c_grass_fg if d > 0.1 else _c_grass_fg_alt
				bg = _c_grass_bg
			g.set_gfx_char(col, row, glyph, fg, bg)

	var px: int = _player_x - _cam_x
	var py: int = _player_y - _cam_y
	if px >= 0 and px < vw and py >= 0 and py < vh:
		g.set_gfx_char(px, py, PLAYER_GLYPH, _player_fg, _player_bg)

	_last_cam_x = _cam_x
	_last_cam_y = _cam_y
	_last_vw = vw
	_last_vh = vh
