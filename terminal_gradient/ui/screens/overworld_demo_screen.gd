class_name OverworldDemoScreen
extends BaseScreen
## Full overworld renderer — port of js/main.js `renderOverworld` (lines
## 6480-6880). Streams chunks from OverworldWorld, expands each tile to
## 3x3 via OverworldTiles, overdraws animated center chars/colors, runs
## the shadow + forest-interior + god-ray passes, and draws the player
## with a rainbow glow.
##
## The world is a single lush habitat section: bounded left/right by
## the 7-tile gradient section wall, cylindrical (infinite) on Y.

# ── Light direction ──────────────────────────────
# Shadow direction (extends AWAY from the light source). (0.7, 0.7) puts
# the sun in the upper-left and casts shadows to the lower-right.
const SUN_DX: float = 0.7071
const SUN_DY: float = 0.7071
const IS_DAY: bool = true

# ── Shadow pass (js/main.js:6510-6570) ──
# The legacy caps shadow alpha at 0.8125 and forest interior darkening at
# 0.12. In our rendering pipeline that combination collapses dark-palette
# tiles (deep forest, water) all the way to black. We cap lower and also
# tint the cell BACKGROUND with far less alpha than the foreground — the
# fg character pixels dim normally (so shadow reads visually) but the bg
# stays near its base color (so cells don't collapse into pure black).
const MAX_RAY_LEN: int = 6
const BASE_SHADOW: float = 0.3125
const SHADOW_MAX: float = 0.55
const FOREST_DARKEN_DEPTH_MAX: int = 5
const FOREST_DARKEN_STEP: float = 0.015
const FOREST_DARKEN_MAX: float = 0.07
const SHADOW_BG_ALPHA_RATIO: float = 0.20

# ── God rays (js/main.js:6267-6339) ──
# The threshold + noise frequencies stay exact to the legacy. The
# intensity cap is dialled down because the legacy's canvas brighten
# (screen blend on an rgba overlay) produces subtler results on bright
# sky than our fg/bg lerp does on opaque tile cells. BG_ALPHA_RATIO
# limits how much of the sunbeam tint reaches the dark tile background
# — without this, forest/grassland bgs wash out to pale blue.
const GOD_RAY_THRESHOLD: float = 0.18
const GOD_RAY_INTENSITY_SCALE: float = 0.20
const GOD_RAY_NEAR_SHADOW_BOOST: float = 0.054
const GOD_RAY_INTENSITY_CAP: float = 0.16
const GOD_RAY_BG_ALPHA_RATIO: float = 0.25
const GOD_RAY_UPDATE_EVERY: int = 3  # recompute cached cells every N frames

# ── Animation frequencies ──
const WIND_COS: float = 0.7071
const WIND_SIN: float = 0.7071
const WATER_SHIMMER_SPEED: float = 1.1

# ── Movement ──
const PLAYER_REPEAT_DELAY: float = 0.0  # uses InputMgr's own key repeat

# ── World ──
var _world: OverworldWorld
var _player_x: int
var _player_y: int
var _cam_x: int
var _cam_y: int

# ── Noise for animation ──
var _grass_noise: PerlinNoise
var _water_noise: PerlinNoise
var _god_ray_noise: PerlinNoise

# ── Shadow buffer (indexed wy_off * vw + wx_off) ──
var _shadow_buf: PackedFloat32Array
var _highlight_buf: PackedFloat32Array
var _shadow_w: int = 0
var _shadow_h: int = 0

# ── God ray cache ──
# Flat array of quadruples: [wx_off, wy_off, intensity, ray_t, ...]
const INF_INT: int = -2147483648
var _god_ray_cells: PackedFloat32Array = PackedFloat32Array()
var _god_ray_frame: int = 0
var _god_ray_cache_cam_x: int = INF_INT
var _god_ray_cache_cam_y: int = INF_INT


func _init(ascii_grid: AsciiGrid) -> void:
	super._init(ascii_grid)
	_world = OverworldWorld.new()
	_grass_noise = PerlinNoise.new(SeededRNG.new(42))
	_water_noise = PerlinNoise.new(SeededRNG.new(99))
	_god_ray_noise = PerlinNoise.new(SeededRNG.new(256))

	# Spawn a short distance inside the west section wall so the wall
	# is immediately visible at the left edge of the viewport. The Y
	# coordinate is arbitrary (world wraps cylindrically on Y).
	_player_x = OverworldWorld.WALL_THICKNESS + 18
	_player_y = _world.section_height_tiles / 2
	# Spawn-safety: if the center tile is unwalkable (river, mountain),
	# scan outward in a small spiral until we find walkable ground.
	if not _world.is_walkable(_player_x, _player_y):
		var found: bool = false
		for radius in range(1, 30):
			for dy in range(-radius, radius + 1):
				for dx in range(-radius, radius + 1):
					if abs(dx) != radius and abs(dy) != radius:
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


func on_enter(context: Dictionary = {}) -> void:
	super.on_enter(context)
	_center_camera_on_player()
	_invalidate_god_rays()


func on_exit() -> void:
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
	# Clamp X against section walls; Y wraps cylindrically.
	nx = clampi(nx, 0, _world.section_width_tiles - 1)
	ny = _world.wrap_y(ny)
	if _world.is_walkable(nx, ny):
		_player_x = nx
		_player_y = ny
		_center_camera_on_player()
		_invalidate_god_rays()


func _center_camera_on_player() -> void:
	## Camera always strictly tracks the player. X passes over the section
	## walls (beyond which get_tile returns VOID_SPACE → circuitry). Y wraps
	## cylindrically via get_tile's internal wrap_y.
	var vw: int = grid.world_cols
	var vh: int = grid.world_rows
	_cam_x = _player_x - vw / 2
	_cam_y = _player_y - vh / 2


# ── Drawing ─────────────────────────────────────────

func draw(cols: int, rows: int) -> void:
	_draw_hud_chrome(cols, rows)
	_draw_top_bar(cols)
	_draw_footer(cols, rows)

	_draw_world()
	_draw_player()


func _draw_hud_chrome(cols: int, rows: int) -> void:
	## HUD strip + side borders painted opaque (FF palette above the shader's
	## 0.01 transparency threshold). Viewport interior stays at the
	## transparent-default black so the gfx buffer shows through.
	var fg: Color = Constants.COLORS.FF_BORDER
	var bg: Color = Constants.COLORS.FF_BLUE_DARK
	var top: int = Constants.viewport_top()    # 3
	var bot: int = Constants.hud_bottom()      # 9

	grid.fill_region(0, 0, cols, top, " ", fg, bg)
	grid.fill_region(0, rows - bot, cols, bot, " ", fg, bg)
	var mid_h: int = rows - top - bot
	if mid_h > 0:
		grid.fill_region(0, top, 1, mid_h, " ", fg, bg)
		grid.fill_region(cols - 1, top, 1, mid_h, " ", fg, bg)

	grid.set_char(0, 0, Constants.BOX_TL, fg, bg)
	grid.set_char(cols - 1, 0, Constants.BOX_TR, fg, bg)
	grid.set_char(0, rows - 1, Constants.BOX_BL, fg, bg)
	grid.set_char(cols - 1, rows - 1, Constants.BOX_BR, fg, bg)
	for c in range(1, cols - 1):
		grid.set_char(c, 0, Constants.BOX_H, fg, bg)
		grid.set_char(c, rows - 1, Constants.BOX_H, fg, bg)
	for r in range(1, rows - 1):
		grid.set_char(0, r, Constants.BOX_V, fg, bg)
		grid.set_char(cols - 1, r, Constants.BOX_V, fg, bg)
	for c in range(cols):
		grid.set_char(c, top - 1, Constants.BOX_H, fg, bg)
		grid.set_char(c, rows - bot, Constants.BOX_H, fg, bg)


func _draw_top_bar(cols: int) -> void:
	var title: String = "OVERWORLD"
	var x: int = maxi(2, (cols - title.length()) / 2)
	grid.draw_string_at(x, 1, title,
		Constants.COLORS.BRIGHT_WHITE, Constants.COLORS.FF_BLUE_DARK)
	var pos: String = "x=%d y=%d" % [_player_x, _player_y]
	grid.draw_string_at(2, 1, pos,
		Constants.COLORS.BRIGHT_YELLOW, Constants.COLORS.FF_BLUE_DARK)
	var sect: String = "HABITAT RING"
	grid.draw_string_at(cols - sect.length() - 2, 1, sect,
		Constants.COLORS.BRIGHT_CYAN, Constants.COLORS.FF_BLUE_DARK)


func _draw_footer(cols: int, rows: int) -> void:
	var hint: String = "WASD/arrows move  ·  walls block E/W  ·  Y wraps  ·  ESC back"
	var y: int = rows - 2
	var x: int = maxi(2, (cols - hint.length()) / 2)
	grid.draw_string_at(x, y, hint,
		Constants.COLORS.BRIGHT_BLACK, Constants.COLORS.FF_BLUE_DARK)


func _draw_world() -> void:
	var vw: int = grid.world_cols
	var vh: int = grid.world_rows
	if vw <= 0 or vh <= 0:
		return

	_build_shadow_buffer(vw, vh)

	var t_sec: float = grid.frame_time_sec

	# Pass 1: tile expansion + animated center overdraw.
	for wy_off in range(vh):
		for wx_off in range(vw):
			var wx: int = _cam_x + wx_off
			var wy: int = _cam_y + wy_off
			var tile: Dictionary = _world.get_tile(wx, wy)

			if tile.type == OverworldTiles.VOID_SPACE:
				# Beyond the habitat — paint the circuitry background.
				# Each world tile uses one circuit char expanded 3x3.
				var circuit: Dictionary = Circuitry.get_cell(wx, wy, t_sec)
				_draw_uniform_tile(wx_off, wy_off,
					circuit.char, circuit.fg, circuit.bg)
				continue

			var expanded: Dictionary = OverworldTiles.expand(tile, wx, wy)
			grid.draw_world_tile(wx_off, wy_off, expanded)

			var anim_char: String = _animated_char(tile, wx, wy, t_sec)
			var anim_fg: Color = _animated_color(tile, wx, wy, t_sec)
			grid.draw_entity_char(wx_off, wy_off, anim_char, anim_fg, tile.bg)

	# Pass 2: shadow buffer → darken each world cell's 3x3 block.
	# Skip cells where the underlying tile is VOID_SPACE so the circuitry
	# pulse stays at its native brightness.
	for wy_off in range(vh):
		for wx_off in range(vw):
			var a: float = _shadow_buf[wy_off * vw + wx_off]
			if a <= 0.001:
				continue
			var t: Dictionary = _world.get_tile(_cam_x + wx_off, _cam_y + wy_off)
			if t.type == OverworldTiles.VOID_SPACE:
				continue
			_darken_world_cell(wx_off, wy_off, a)

	# Pass 3: forest-interior darkening (depth highlight buffer). Same
	# VOID_SPACE skip as pass 2.
	for wy_off in range(vh):
		for wx_off in range(vw):
			var a: float = _highlight_buf[wy_off * vw + wx_off]
			if a <= 0.001:
				continue
			var t: Dictionary = _world.get_tile(_cam_x + wx_off, _cam_y + wy_off)
			if t.type == OverworldTiles.VOID_SPACE:
				continue
			_darken_world_cell(wx_off, wy_off, a)

	# Pass 4: god rays — computed on unshadowed cells, cached over frames.
	_update_god_rays(vw, vh)
	_apply_god_rays()

	# Pass 5: time-of-day tint overlay. Static midday for now → near-zero
	# alpha, so this is effectively a no-op. Left in place for future TOD.
	_apply_time_tint(vw, vh)


func _draw_player() -> void:
	var px: int = _player_x - _cam_x
	var py: int = _player_y - _cam_y
	if px < 0 or px >= grid.world_cols or py < 0 or py >= grid.world_rows:
		return
	# Rainbow glow — mirrors GlowManager.getGlowColor('PLAYER', …) from the
	# legacy, which cycles hue around the HSV wheel at ~0.5 Hz.
	var t: float = grid.frame_time_sec
	var hue: float = fmod(t * 0.5, 1.0)
	var glow: Color = Color.from_hsv(hue, 0.35, 1.0)
	grid.draw_entity_char(px, py, "◆", glow, Color.BLACK)


# ── Animation ───────────────────────────────────────

func _animated_char(tile: Dictionary, wx: int, wy: int, t: float) -> String:
	var base: String = tile.char
	match base:
		".", ",", "`":
			# js/engine.js:1484 grass wind — 45° Perlin wave picks one of
			# three chars based on noise value.
			var along: float = float(wx) * WIND_COS + float(wy) * WIND_SIN
			var perp: float = -float(wx) * WIND_SIN + float(wy) * WIND_COS
			var n: float = _grass_noise.noise_2d(along * 0.15 - t * 0.5, perp * 0.08)
			if n > 0.2:
				return "`"
			if n < -0.2:
				return "."
			return ","
		"~":
			# js/engine.js:1502 water — noise-driven ripple + trough.
			var n2: float = _water_noise.noise_2d(
				float(wx) * 0.38 - t * WATER_SHIMMER_SPEED, float(wy) * 0.28
			)
			if n2 > 0.25:
				return "≈"
			if n2 < -0.25:
				return " "
			return "~"
		"♣", "♠":
			# Tree tops render statically as ♣ (user request — clubs for
			# all canopy). Legacy had a 4-step ♣↔♠ sway animation; we
			# keep the glyph fixed so forests read consistently.
			return "♣"
	return base


func _animated_color(tile: Dictionary, wx: int, wy: int, t: float) -> Color:
	var type: String = tile.type
	var base: Color = tile.fg
	match type:
		OverworldTiles.GRASSLAND, OverworldTiles.MEADOW, \
		OverworldTiles.TALL_GRASS, OverworldTiles.FIELD, \
		OverworldTiles.OUTER_SHORE, OverworldTiles.INNER_SHORE:
			# js/engine.js:1538 grass brightness — wind gusts brighten/darken.
			var along: float = float(wx) * WIND_COS + float(wy) * WIND_SIN
			var perp: float = -float(wx) * WIND_SIN + float(wy) * WIND_COS
			var n: float = _grass_noise.noise_2d(along * 0.15 - t * 0.5, perp * 0.08)
			return _brighten(base, n * 0.15)
		OverworldTiles.RIVER_WATER, OverworldTiles.SHALLOWS, \
		OverworldTiles.MEDIUM_WATER:
			# js/engine.js:1337 river shimmer — noise adjusts G + B toward white.
			var n2: float = _water_noise.noise_2d(
				float(wx) * 0.38 - t * WATER_SHIMMER_SPEED, float(wy) * 0.28
			)
			var shimmer: float = clampf(0.5 + n2, 0.0, 1.0) * 0.35
			return base.lerp(Color("#a0c8ff"), shimmer)
	return base


static func _brighten(c: Color, amount: float) -> Color:
	var a: float = clampf(amount, -1.0, 1.0)
	if a >= 0.0:
		return c.lerp(Color(1.0, 1.0, 1.0), a)
	return c.lerp(Color(0.0, 0.0, 0.0), -a)


# ── Shadow pass ─────────────────────────────────────

func _build_shadow_buffer(vw: int, vh: int) -> void:
	## Cast shadows from tall tiles in the sun direction, accumulating alpha
	## into _shadow_buf. Also populate _highlight_buf with forest-interior
	## directional darkening (depth lookup backward along the sun direction).
	## Ports js/main.js:6518-6566.
	var total: int = vw * vh
	if _shadow_w != vw or _shadow_h != vh or _shadow_buf.size() != total:
		_shadow_buf = PackedFloat32Array()
		_shadow_buf.resize(total)
		_highlight_buf = PackedFloat32Array()
		_highlight_buf.resize(total)
		_shadow_w = vw
		_shadow_h = vh
	for i in range(total):
		_shadow_buf[i] = 0.0
		_highlight_buf[i] = 0.0

	var inv_max_ray: float = 1.0 / float(MAX_RAY_LEN)

	for wy_off in range(vh):
		for wx_off in range(vw):
			var wx: int = _cam_x + wx_off
			var wy: int = _cam_y + wy_off
			var tile: Dictionary = _world.get_tile(wx, wy)
			var type: String = tile.type
			var h: int = OverworldTiles.height(type)
			if h <= 0:
				continue

			var is_veg: bool = OverworldTiles.is_vegetation(type)
			var shadow_alpha: float = (BASE_SHADOW * 0.5 if is_veg else BASE_SHADOW) \
				+ minf(0.1875, float(h) * 0.0375)

			# Cast shadow ray forward along the sun direction.
			for step in range(1, MAX_RAY_LEN + 1):
				var sx: int = wx_off + int(floor(SUN_DX * float(step)))
				var sy: int = wy_off + int(floor(SUN_DY * float(step)))
				if sx < 0 or sx >= vw or sy < 0 or sy >= vh:
					break
				var dist_t: float = float(step) * inv_max_ray
				var fade: float = (1.0 - dist_t) * (1.0 - dist_t)
				var add: float = shadow_alpha * fade
				var idx: int = sy * vw + sx
				_shadow_buf[idx] = minf(SHADOW_MAX, _shadow_buf[idx] + add)

			# Forest interior darkening: walk BACKWARD along the sun dir up
			# to 5 steps counting consecutive occluders. If we have any
			# depth, darken the current cell.
			var depth: int = 0
			for d in range(1, FOREST_DARKEN_DEPTH_MAX + 1):
				var cx: int = wx - int(round(SUN_DX * float(d)))
				var cy: int = wy - int(round(SUN_DY * float(d)))
				var check: Dictionary = _world.get_tile(cx, cy)
				if OverworldTiles.height(check.type) > 0:
					depth += 1
				else:
					break
			if depth > 0:
				var darken: float = minf(FOREST_DARKEN_MAX, float(depth) * FOREST_DARKEN_STEP)
				_highlight_buf[wy_off * vw + wx_off] = darken


func _draw_uniform_tile(wx_off: int, wy_off: int, ch: String, fg: Color, bg: Color) -> void:
	## Fill all 9 gfx cells of a world tile with the same char/fg/bg.
	## Mirrors engine.js drawUniformTile used for VOID_SPACE circuitry.
	var base_c: int = wx_off * Constants.TILE_DENSITY
	var base_r: int = wy_off * Constants.TILE_DENSITY
	for dy in range(Constants.TILE_DENSITY):
		for dx in range(Constants.TILE_DENSITY):
			grid.set_gfx_char(base_c + dx, base_r + dy, ch, fg, bg)


func _darken_world_cell(wx_off: int, wy_off: int, alpha: float) -> void:
	## Shadow darkening. Tints fg at full alpha, bg at a reduced ratio so
	## dark tile backgrounds don't collapse into pure black when shadows
	## accumulate. See SHADOW_BG_ALPHA_RATIO for the rationale.
	var base_c: int = wx_off * Constants.TILE_DENSITY
	var base_r: int = wy_off * Constants.TILE_DENSITY
	var bg_alpha: float = alpha * SHADOW_BG_ALPHA_RATIO
	for dy in range(Constants.TILE_DENSITY):
		for dx in range(Constants.TILE_DENSITY):
			grid.tint_gfx_cell_weighted(
				base_c + dx, base_r + dy, Color.BLACK, alpha, bg_alpha
			)


func _brighten_world_cell(wx_off: int, wy_off: int, alpha: float, tint: Color) -> void:
	## Used by the god-ray pass. Tints fg with the full alpha but only
	## applies `alpha * GOD_RAY_BG_ALPHA_RATIO` to bg so dark tile
	## backgrounds stay dark (preventing the blue-wash artifact).
	var base_c: int = wx_off * Constants.TILE_DENSITY
	var base_r: int = wy_off * Constants.TILE_DENSITY
	var bg_alpha: float = alpha * GOD_RAY_BG_ALPHA_RATIO
	for dy in range(Constants.TILE_DENSITY):
		for dx in range(Constants.TILE_DENSITY):
			grid.tint_gfx_cell_weighted(base_c + dx, base_r + dy, tint, alpha, bg_alpha)


# ── God rays ────────────────────────────────────────
# Port of js/main.js:6267-6339. We sample two octaves of Perlin noise in
# the direction perpendicular to the sun, then accept cells where the
# combined value exceeds 0.18. Each accepted cell gets an intensity and
# a "ray T" parameter used for the color-temperature gradient.

func _invalidate_god_rays() -> void:
	_god_ray_cells.resize(0)
	_god_ray_cache_cam_x = INF_INT
	_god_ray_cache_cam_y = INF_INT


func _update_god_rays(vw: int, vh: int) -> void:
	_god_ray_frame += 1
	var camera_moved: bool = (
		_cam_x != _god_ray_cache_cam_x
		or _cam_y != _god_ray_cache_cam_y
	)
	var cache_empty: bool = _god_ray_cells.is_empty()
	if not cache_empty and not camera_moved and (_god_ray_frame % GOD_RAY_UPDATE_EVERY != 0):
		return

	_god_ray_cache_cam_x = _cam_x
	_god_ray_cache_cam_y = _cam_y
	_god_ray_cells.resize(0)

	# Perpendicular and along-sun direction vectors.
	var along_x: float = SUN_DX
	var along_y: float = SUN_DY
	var perp_x: float = -SUN_DY
	var perp_y: float = SUN_DX

	# Compute the along-axis projection range across the viewport so we can
	# normalize to a 0..1 ray-t parameter (used in the color gradient).
	var c0: float = 0.0
	var c1: float = float(vw - 1) * along_x
	var c2: float = float(vh - 1) * along_y
	var c3: float = c1 + c2
	var min_along: float = minf(minf(c0, c1), minf(c2, c3))
	var max_along: float = maxf(maxf(c0, c1), maxf(c2, c3))
	var along_range: float = max_along - min_along
	if along_range == 0.0:
		along_range = 1.0

	var ts: float = grid.frame_time_sec

	for sy in range(vh):
		for sx in range(vw):
			# Skip cells that are already shadowed.
			if _shadow_buf[sy * vw + sx] > 0.0:
				continue
			# Skip VOID_SPACE cells — the circuitry is its own visual layer
			# and god rays don't belong on it.
			var world_tile: Dictionary = _world.get_tile(_cam_x + sx, _cam_y + sy)
			if world_tile.type == OverworldTiles.VOID_SPACE:
				continue

			# Near-shadow boost: if a shadow is within 1-2 steps forward,
			# the ray lands brighter right next to the occluder edge.
			var near_shadow: bool = false
			for nd in range(1, 3):
				var ckx: int = sx + int(round(along_x * float(nd)))
				var cky: int = sy + int(round(along_y * float(nd)))
				if (ckx >= 0 and ckx < vw and cky >= 0 and cky < vh
						and _shadow_buf[cky * vw + ckx] > 0.0):
					near_shadow = true
					break

			# Perpendicular projection into ray-stripe space.
			var proj: float = float(sx) * perp_x + float(sy) * perp_y
			var thin_n: float = _god_ray_noise.noise_2d(
				proj * 0.25 + ts * 0.03, ts * 0.02
			)
			var wide_n: float = _god_ray_noise.noise_2d(
				proj * 0.08 + ts * 0.02, ts * 0.015 + 50.0
			)
			var ray_n: float = thin_n * 0.5 + wide_n * 0.5
			if ray_n <= GOD_RAY_THRESHOLD:
				continue

			var intensity: float = (
				(ray_n - GOD_RAY_THRESHOLD) / (1.0 - GOD_RAY_THRESHOLD)
				* GOD_RAY_INTENSITY_SCALE
			)
			if near_shadow:
				intensity += GOD_RAY_NEAR_SHADOW_BOOST

			# Sparse temporal pulsation so rays slowly fade in/out.
			var fade_cycle: float = sin(ts * 0.15 + proj * 0.1) * 0.35 + 0.65
			intensity *= fade_cycle
			intensity = minf(GOD_RAY_INTENSITY_CAP, intensity)
			if intensity <= 0.0:
				continue

			var along_proj: float = float(sx) * along_x + float(sy) * along_y
			var ray_t: float = (along_proj - min_along) / along_range

			_god_ray_cells.append(float(sx))
			_god_ray_cells.append(float(sy))
			_god_ray_cells.append(intensity)
			_god_ray_cells.append(ray_t)


func _apply_god_rays() -> void:
	# Replay cached cells with a color-temperature gradient along ray_t.
	# Day: warm yellow (near) → orange (far). Night: cool blue → purple.
	var i: int = 0
	var n: int = _god_ray_cells.size()
	while i < n:
		var sx: int = int(_god_ray_cells[i])
		var sy: int = int(_god_ray_cells[i + 1])
		var intensity: float = _god_ray_cells[i + 2]
		var t: float = _god_ray_cells[i + 3]

		var cr: int
		var cg: int
		var cb: int
		var dim: float
		if IS_DAY:
			cr = int(round(221.0 + t * 34.0))
			cg = int(round(238.0 - t * 34.0))
			cb = int(round(255.0 - t * 153.0))
			dim = 1.0 - t * 0.35
		else:
			cr = int(round(170.0 - t * 34.0))
			cg = int(round(187.0 - t * 34.0))
			cb = int(round(221.0 - t * 17.0))
			dim = 0.6 - t * 0.2

		var tint: Color = Color(
			clampi(cr, 0, 255) / 255.0,
			clampi(cg, 0, 255) / 255.0,
			clampi(cb, 0, 255) / 255.0,
		)
		_brighten_world_cell(sx, sy, intensity * dim, tint)
		i += 4


# ── Time-of-day tint ────────────────────────────────
# Placeholder for js/systems.js:1849 getTimeTint. Static midday → alpha
# is zero so no cells are touched. Kept as a hook so switching the demo
# to night/dusk later becomes trivial.

func _apply_time_tint(_vw: int, _vh: int) -> void:
	pass
