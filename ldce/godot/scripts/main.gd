extends Node2D

enum Tool {
	BULLDOZE, ROAD, RAIL, POWER_LINE, WATER_PIPE, SEWER_PIPE,
	ZONE_R, ZONE_C, ZONE_I,
	PARK, POLICE, FIRE,
	WIND, HYDRO, WATER_TOWER, WATER_PUMP, SEWER_PLANT,
	SOLAR, GAS, OIL, COAL, MICROWAVE, NUKE, FUSION,
	ARCO_PLYMOUTH, ARCO_FOREST, ARCO_DARCO, ARCO_LAUNCH,
}

# Per-tool metadata used by both the palette and the _apply_tool dispatch.
#  [tool_id,  icon_col, icon_row, name, cost_label]
const TOOL_TABLE := [
	[Tool.BULLDOZE,      0, 31, "Bulldoze",        ""],
	[Tool.ROAD,          2, 2,  "Road",            "$10/tile"],
	[Tool.RAIL,          2, 4,  "Rail",            "$25/tile"],
	[Tool.POWER_LINE,    2, 6,  "Power Line",      "$5/tile"],
	[Tool.WATER_PIPE,    2, 20, "Water Pipe",      "$3/tile"],
	[Tool.SEWER_PIPE,    2, 22, "Sewer Pipe",      "$4/tile"],
	[Tool.ZONE_R,        0, 9,  "Zone R",          "$20/tile"],
	[Tool.ZONE_C,        1, 9,  "Zone C",          "$20/tile"],
	[Tool.ZONE_I,        2, 9,  "Zone I",          "$20/tile"],
	[Tool.PARK,          6, 9,  "Park (1x1)",      "$100"],
	[Tool.POLICE,        6, 10, "Police (2x2)",    "$500"],
	[Tool.FIRE,          8, 10, "Fire (2x2)",      "$500"],

	[Tool.WATER_TOWER,   9, 18, "Water Tower",     "$250"],
	[Tool.WATER_PUMP,    0, 23, "Water Pump",      "$1500 (needs water)"],
	[Tool.SEWER_PLANT,   2, 23, "Sewer Plant",     "$1800"],
	[Tool.WIND,          7, 18, "Wind Turbine",    "$400"],
	[Tool.HYDRO,         8, 18, "Hydro Dam",       "$800 (needs water)"],
	[Tool.SOLAR,         4, 23, "Solar Plant",     "$2200"],
	[Tool.GAS,           8, 21, "Gas Plant",       "$2400"],
	[Tool.OIL,           6, 23, "Oil Refinery",    "$2800"],
	[Tool.COAL,          0, 12, "Coal Plant",      "$3000"],
	[Tool.MICROWAVE,     8, 19, "Microwave",       "$8000"],
	[Tool.NUKE,          2, 12, "Nuclear",         "$5000"],
	[Tool.FUSION,        0, 25, "Fusion",          "$12000"],

	[Tool.ARCO_PLYMOUTH, 3, 25, "Plymouth Arco",   "$100000"],
	[Tool.ARCO_FOREST,   6, 25, "Forest Arco",     "$100000"],
	[Tool.ARCO_DARCO,    0, 28, "Darco Arco",      "$100000"],
	[Tool.ARCO_LAUNCH,   3, 28, "Launch Arco",     "$100000"],
]

const ROW1_TOOLS := [Tool.BULLDOZE, Tool.ROAD, Tool.RAIL, Tool.POWER_LINE,
		Tool.WATER_PIPE, Tool.SEWER_PIPE,
		Tool.ZONE_R, Tool.ZONE_C, Tool.ZONE_I,
		Tool.PARK, Tool.POLICE, Tool.FIRE]

const ROW2_TOOLS := [Tool.WATER_TOWER, Tool.WATER_PUMP, Tool.SEWER_PLANT,
		Tool.WIND, Tool.HYDRO, Tool.SOLAR, Tool.GAS, Tool.OIL,
		Tool.COAL, Tool.MICROWAVE, Tool.NUKE, Tool.FUSION]

const ROW3_TOOLS := [Tool.ARCO_PLYMOUTH, Tool.ARCO_FOREST,
		Tool.ARCO_DARCO, Tool.ARCO_LAUNCH]

# Overlay buttons share a group; placed on row 3 after a spacer.
const OVERLAY_TABLE := [
	[City.Overlay.NONE,       1, 31, "Overlay: Off"],
	[City.Overlay.POLLUTION,  2, 31, "Overlay: Pollution"],
	[City.Overlay.CRIME,      3, 31, "Overlay: Crime"],
	[City.Overlay.LAND_VALUE, 4, 31, "Overlay: Land Value"],
	[City.Overlay.POWER,      5, 31, "Overlay: Power"],
	[City.Overlay.WATER_COV,  6, 31, "Overlay: Water"],
	[City.Overlay.SEWER_COV,  7, 31, "Overlay: Sewer"],
	[City.Overlay.TRAFFIC,    3, 32, "Overlay: Traffic"],
]

const TICK_INTERVAL := 0.5
const CAMERA_PAN_SPEED := 480.0
const CAMERA_ZOOM_STEP := 1.1
const CAMERA_ZOOM_MIN := Vector2(0.6, 0.6)  # 0.6 already fits the whole 128-tile map
const CAMERA_ZOOM_MAX := Vector2(4.0, 4.0)

# Below these zoom levels the detail layers add a pile of draw calls without
# adding readable information. Kill their visibility so the Pi GPU survives.
const ZOOM_HIDE_INDICATORS := 0.85
const ZOOM_HIDE_PIPES := 0.60
const PALETTE_BTN_SIZE := Vector2(36, 36)

# Time speed multipliers; speed_index 0 = paused.
const SPEED_STEPS: Array[float] = [0.0, 0.5, 1.0, 2.0, 4.0, 8.0]
const SPEED_LABELS: Array[String] = ["Paused", "0.5x", "1x", "2x", "4x", "8x"]

enum DragMode { NONE, PAINT, POINT, LINE, RECT }

@onready var ground: TileMapLayer = $Ground
@onready var water_pipes: TileMapLayer = $WaterPipes
@onready var sewer_pipes: TileMapLayer = $SewerPipes
@onready var power_lines: TileMapLayer = $PowerLines
@onready var indicators: TileMapLayer = $Indicators
@onready var preview: TileMapLayer = $Preview
@onready var overlay: TileMapLayer = $Overlay
@onready var camera: Camera2D = $Camera2D
@onready var tool_label: Label = $HUD/Top/ToolLabel
@onready var funds_label: Label = $HUD/Top/FundsLabel
@onready var date_label: Label = $HUD/Top/DateLabel
@onready var pop_label: Label = $HUD/Top/PopLabel
@onready var demand_r_bar: ProgressBar = $HUD/Top/DemandR
@onready var demand_c_bar: ProgressBar = $HUD/Top/DemandC
@onready var demand_i_bar: ProgressBar = $HUD/Top/DemandI
@onready var info_btn: Button = $HUD/Top/WindowToggles/InfoBtn
@onready var budget_btn: Button = $HUD/Top/WindowToggles/BudgetBtn
@onready var slower_btn: Button = $HUD/Top/WindowToggles/SlowerBtn
@onready var pause_btn: Button = $HUD/Top/WindowToggles/PauseBtn
@onready var faster_btn: Button = $HUD/Top/WindowToggles/FasterBtn
@onready var speed_label: Label = $HUD/Top/WindowToggles/SpeedLabel
@onready var palette_row1: HBoxContainer = $HUD/Palette/Rows/Row1
@onready var palette_row2: HBoxContainer = $HUD/Palette/Rows/Row2
@onready var palette_row3: HBoxContainer = $HUD/Palette/Rows/Row3
@onready var city_info_window: GameWindow = $HUD/CityInfoWindow
@onready var budget_window: GameWindow = $HUD/BudgetWindow
@onready var advisor_label: Label = $HUD/AdvisorLabel
@onready var minimap: Minimap = $HUD/Minimap

var city: City
var current_tool: int = Tool.ROAD
var current_overlay: int = City.Overlay.NONE
var tick_accum: float = 0.0
var rng := RandomNumberGenerator.new()

# Drag state.
var drag_mode: int = DragMode.NONE
var drag_start_cell: Vector2i
var drag_preview_cells: Array[Vector2i] = []
var last_drag_cell: Vector2i = Vector2i(-1, -1)

# Speed state. Last non-zero index is used for resume-from-pause.
var speed_index: int = 2  # 1x
var last_nonzero_speed: int = 2

var atlas_tex: Texture2D
var tool_group := ButtonGroup.new()
var overlay_group := ButtonGroup.new()
var tool_buttons: Dictionary = {}     # Tool -> Button
var overlay_buttons: Dictionary = {}  # City.Overlay -> Button


func _ready() -> void:
	rng.randomize()
	city = City.new()
	city.changed.connect(_on_city_changed)
	city.advisor_message.connect(_on_advisor_message)
	camera.position = Vector2(city.width * 8, city.height * 8)

	atlas_tex = load("res://assets/tileset.png")
	_build_palette()
	_build_windows()

	info_btn.pressed.connect(func(): _toggle_window(city_info_window))
	budget_btn.pressed.connect(func(): _toggle_window(budget_window))
	slower_btn.pressed.connect(func(): _set_speed(speed_index - 1))
	faster_btn.pressed.connect(func(): _set_speed(speed_index + 1))
	pause_btn.pressed.connect(func(): _toggle_pause())
	minimap.cell_clicked.connect(_on_minimap_click)

	_render_dirty_and_minimap()
	_refresh_indicators_if_needed()
	_sync_palette()
	_update_hud()
	_apply_zoom_visibility()


func _process(delta: float) -> void:
	_handle_camera_pan(delta)
	# Defensive: if mouse release was eaten by a UI element, still end the drag.
	if drag_mode != DragMode.NONE and not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		_end_drag()
	# Time advancement scaled by speed_index.
	var speed := SPEED_STEPS[speed_index]
	if speed > 0.0:
		tick_accum += delta * speed
		if tick_accum >= TICK_INTERVAL:
			tick_accum -= TICK_INTERVAL
			city.tick(rng)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				_start_drag()
			else:
				_end_drag()
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			_zoom(CAMERA_ZOOM_STEP)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			_zoom(1.0 / CAMERA_ZOOM_STEP)
	elif event is InputEventMouseMotion:
		_handle_drag_motion()
	elif event is InputEventKey and event.pressed and not event.echo:
		_handle_key(event)


func _zoom(factor: float) -> void:
	var z := camera.zoom * factor
	z.x = clampf(z.x, CAMERA_ZOOM_MIN.x, CAMERA_ZOOM_MAX.x)
	z.y = clampf(z.y, CAMERA_ZOOM_MIN.y, CAMERA_ZOOM_MAX.y)
	camera.zoom = z
	_apply_zoom_visibility()


func _apply_zoom_visibility() -> void:
	var z := camera.zoom.x
	indicators.visible = z >= ZOOM_HIDE_INDICATORS
	power_lines.visible = z >= ZOOM_HIDE_PIPES
	water_pipes.visible = z >= ZOOM_HIDE_PIPES
	sewer_pipes.visible = z >= ZOOM_HIDE_PIPES


func _handle_key(event: InputEventKey) -> void:
	var kc := event.keycode
	# Time controls.
	match kc:
		KEY_SPACE:  _toggle_pause(); return
		KEY_COMMA:  _set_speed(speed_index - 1); return
		KEY_PERIOD: _set_speed(speed_index + 1); return

	# Window toggles.
	match kc:
		KEY_F8: _toggle_window(city_info_window); return
		KEY_F9: _toggle_window(budget_window); return

	# Overlay hotkeys (F1..F7).
	match kc:
		KEY_F1: _set_overlay(City.Overlay.NONE); return
		KEY_F2: _set_overlay(City.Overlay.POLLUTION); return
		KEY_F3: _set_overlay(City.Overlay.CRIME); return
		KEY_F4: _set_overlay(City.Overlay.LAND_VALUE); return
		KEY_F5: _set_overlay(City.Overlay.POWER); return
		KEY_F6: _set_overlay(City.Overlay.WATER_COV); return
		KEY_F7: _set_overlay(City.Overlay.SEWER_COV); return

	if event.shift_pressed:
		match kc:
			KEY_1: _set_tool(Tool.ARCO_PLYMOUTH)
			KEY_2: _set_tool(Tool.ARCO_FOREST)
			KEY_3: _set_tool(Tool.ARCO_DARCO)
			KEY_4: _set_tool(Tool.ARCO_LAUNCH)
			_: return
		return

	match kc:
		KEY_1: _set_tool(Tool.BULLDOZE)
		KEY_2: _set_tool(Tool.ROAD)
		KEY_3: _set_tool(Tool.RAIL)
		KEY_4: _set_tool(Tool.POWER_LINE)
		KEY_5: _set_tool(Tool.ZONE_R)
		KEY_6: _set_tool(Tool.ZONE_C)
		KEY_7: _set_tool(Tool.ZONE_I)
		KEY_8: _set_tool(Tool.WATER_PIPE)
		KEY_9: _set_tool(Tool.SEWER_PIPE)
		KEY_0: _set_tool(Tool.PARK)
		KEY_Q: _set_tool(Tool.WIND)
		KEY_E: _set_tool(Tool.GAS)
		KEY_R: _set_tool(Tool.SOLAR)
		KEY_T: _set_tool(Tool.OIL)
		KEY_Y: _set_tool(Tool.WATER_TOWER)
		KEY_U: _set_tool(Tool.WATER_PUMP)
		KEY_I: _set_tool(Tool.SEWER_PLANT)
		KEY_O: _set_tool(Tool.MICROWAVE)
		KEY_P: _set_tool(Tool.COAL)
		KEY_BRACKETLEFT:  _set_tool(Tool.HYDRO)
		KEY_BRACKETRIGHT: _set_tool(Tool.NUKE)
		KEY_BACKSLASH:    _set_tool(Tool.FUSION)
		KEY_F: _set_tool(Tool.FIRE)
		KEY_G: _set_tool(Tool.POLICE)


func _handle_camera_pan(delta: float) -> void:
	var v := Vector2.ZERO
	if Input.is_key_pressed(KEY_LEFT)  or Input.is_key_pressed(KEY_A): v.x -= 1
	if Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D): v.x += 1
	if Input.is_key_pressed(KEY_UP)    or Input.is_key_pressed(KEY_W): v.y -= 1
	if Input.is_key_pressed(KEY_DOWN)  or Input.is_key_pressed(KEY_S): v.y += 1
	if v != Vector2.ZERO:
		camera.position += v.normalized() * CAMERA_PAN_SPEED * delta / camera.zoom.x
	var map_px := Vector2(city.width * 16, city.height * 16)
	camera.position.x = clampf(camera.position.x, 0, map_px.x)
	camera.position.y = clampf(camera.position.y, 0, map_px.y)


func _apply_tool_at_cell(cell: Vector2i) -> void:
	if not city.in_bounds(cell.x, cell.y):
		return
	match current_tool:
		Tool.BULLDOZE:   city.bulldoze(cell.x, cell.y)
		Tool.ROAD:       city.set_network(cell.x, cell.y, City.Net.ROAD)
		Tool.RAIL:       city.set_network(cell.x, cell.y, City.Net.RAIL)
		Tool.POWER_LINE: city.set_overlay(cell.x, cell.y, City.OverlayNet.POWER)
		Tool.WATER_PIPE: city.set_overlay(cell.x, cell.y, City.OverlayNet.WATER)
		Tool.SEWER_PIPE: city.set_overlay(cell.x, cell.y, City.OverlayNet.SEWER)
		Tool.ZONE_R:     city.set_zone(cell.x, cell.y, City.Zone.R)
		Tool.ZONE_C:     city.set_zone(cell.x, cell.y, City.Zone.C)
		Tool.ZONE_I:     city.set_zone(cell.x, cell.y, City.Zone.I)
		_:
			var bk := _tool_to_building(current_tool)
			if bk != City.Building.NONE:
				city.place_building(cell.x, cell.y, bk)


# ---------- drag / preview ----------

func _tool_drag_mode(t: int) -> int:
	match t:
		Tool.BULLDOZE: return DragMode.PAINT
		Tool.ROAD, Tool.RAIL, Tool.POWER_LINE, Tool.WATER_PIPE, Tool.SEWER_PIPE:
			return DragMode.LINE
		Tool.ZONE_R, Tool.ZONE_C, Tool.ZONE_I:
			return DragMode.RECT
	return DragMode.POINT


func _start_drag() -> void:
	var cell := _cell_under_mouse()
	if not city.in_bounds(cell.x, cell.y):
		return
	drag_mode = _tool_drag_mode(current_tool)
	drag_start_cell = cell
	last_drag_cell = cell
	drag_preview_cells.clear()
	match drag_mode:
		DragMode.PAINT, DragMode.POINT:
			_apply_tool_at_cell(cell)
		DragMode.LINE, DragMode.RECT:
			_update_drag_preview(cell)


func _end_drag() -> void:
	match drag_mode:
		DragMode.LINE: _commit_line()
		DragMode.RECT: _commit_rect()
	_clear_preview()
	drag_mode = DragMode.NONE
	drag_preview_cells.clear()
	last_drag_cell = Vector2i(-1, -1)


func _handle_drag_motion() -> void:
	if drag_mode == DragMode.NONE:
		return
	var cell := _cell_under_mouse()
	if cell == last_drag_cell:
		return
	last_drag_cell = cell
	match drag_mode:
		DragMode.PAINT:
			_apply_tool_at_cell(cell)
		DragMode.LINE, DragMode.RECT:
			_update_drag_preview(cell)


func _update_drag_preview(end_cell: Vector2i) -> void:
	_clear_preview()
	if drag_mode == DragMode.LINE:
		drag_preview_cells = _line_cells(drag_start_cell, end_cell)
		for c in drag_preview_cells:
			if not city.in_bounds(c.x, c.y): continue
			preview.set_cell(c, TileIds.SOURCE_ID,
					_line_preview_atlas(c, drag_preview_cells))
	elif drag_mode == DragMode.RECT:
		drag_preview_cells = _rect_cells(drag_start_cell, end_cell)
		var zone_atlas := _zone_preview_atlas(current_tool)
		for c in drag_preview_cells:
			if not city.in_bounds(c.x, c.y): continue
			preview.set_cell(c, TileIds.SOURCE_ID, zone_atlas)


func _clear_preview() -> void:
	preview.clear()


func _line_cells(start: Vector2i, end: Vector2i) -> Array[Vector2i]:
	"""L-shaped path: horizontal first, then vertical."""
	var cells: Array[Vector2i] = []
	var x := start.x
	var y := start.y
	var dx_step: int = 0 if end.x == x else (1 if end.x > x else -1)
	var dy_step: int = 0 if end.y == y else (1 if end.y > y else -1)
	while x != end.x:
		cells.append(Vector2i(x, y))
		x += dx_step
	while y != end.y:
		cells.append(Vector2i(x, y))
		y += dy_step
	cells.append(Vector2i(x, y))
	return cells


func _rect_cells(a: Vector2i, b: Vector2i) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	var x0 := mini(a.x, b.x)
	var x1 := maxi(a.x, b.x)
	var y0 := mini(a.y, b.y)
	var y1 := maxi(a.y, b.y)
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			cells.append(Vector2i(x, y))
	return cells


func _line_preview_atlas(cell: Vector2i, path: Array[Vector2i]) -> Vector2i:
	"""Bitmask is based on in-path neighbours only (what the user is drawing)."""
	var set_cells: Dictionary = {}
	for c in path:
		set_cells[c] = true
	var mask := 0
	if Vector2i(cell.x, cell.y - 1) in set_cells: mask |= 1
	if Vector2i(cell.x + 1, cell.y) in set_cells: mask |= 2
	if Vector2i(cell.x, cell.y + 1) in set_cells: mask |= 4
	if Vector2i(cell.x - 1, cell.y) in set_cells: mask |= 8
	match current_tool:
		Tool.ROAD:       return TileIds.road(mask)
		Tool.RAIL:       return TileIds.rail(mask)
		Tool.POWER_LINE: return TileIds.power_line(mask)
		Tool.WATER_PIPE: return TileIds.water_pipe(mask)
		Tool.SEWER_PIPE: return TileIds.sewer_pipe(mask)
	return TileIds.GRASS


func _zone_preview_atlas(t: int) -> Vector2i:
	match t:
		Tool.ZONE_R: return TileIds.ZONE_R
		Tool.ZONE_C: return TileIds.ZONE_C
		Tool.ZONE_I: return TileIds.ZONE_I
	return TileIds.GRASS


func _commit_line() -> void:
	city.begin_batch()
	for c in drag_preview_cells:
		_apply_tool_at_cell(c)
	city.end_batch()


func _commit_rect() -> void:
	city.begin_batch()
	for c in drag_preview_cells:
		_apply_tool_at_cell(c)
	city.end_batch()


# ---------- time speed ----------

func _set_speed(idx: int) -> void:
	speed_index = clampi(idx, 0, SPEED_STEPS.size() - 1)
	if speed_index > 0:
		last_nonzero_speed = speed_index
	_update_hud()


func _toggle_pause() -> void:
	if speed_index == 0:
		speed_index = last_nonzero_speed
	else:
		last_nonzero_speed = speed_index
		speed_index = 0
	_update_hud()


func _tool_to_building(t: int) -> int:
	match t:
		Tool.PARK:          return City.Building.PARK
		Tool.POLICE:        return City.Building.POLICE
		Tool.FIRE:          return City.Building.FIRE
		Tool.WIND:          return City.Building.WIND
		Tool.HYDRO:         return City.Building.HYDRO
		Tool.WATER_TOWER:   return City.Building.WATER_TOWER
		Tool.WATER_PUMP:    return City.Building.WATER_PUMP
		Tool.SEWER_PLANT:   return City.Building.SEWER_PLANT
		Tool.SOLAR:         return City.Building.SOLAR
		Tool.GAS:           return City.Building.GAS
		Tool.OIL:           return City.Building.OIL
		Tool.COAL:          return City.Building.COAL
		Tool.MICROWAVE:     return City.Building.MICROWAVE
		Tool.NUKE:          return City.Building.NUKE
		Tool.FUSION:        return City.Building.FUSION
		Tool.ARCO_PLYMOUTH: return City.Building.ARCO_PLYMOUTH
		Tool.ARCO_FOREST:   return City.Building.ARCO_FOREST
		Tool.ARCO_DARCO:    return City.Building.ARCO_DARCO
		Tool.ARCO_LAUNCH:   return City.Building.ARCO_LAUNCH
	return City.Building.NONE


func _cell_under_mouse() -> Vector2i:
	var local := ground.to_local(get_global_mouse_position())
	return ground.local_to_map(local)


# ---------- palette ----------

func _build_palette() -> void:
	# Tool metadata indexed by tool id for fast lookup.
	var tool_meta: Dictionary = {}
	for entry in TOOL_TABLE:
		tool_meta[entry[0]] = entry

	for t in ROW1_TOOLS:
		palette_row1.add_child(_make_tool_button(tool_meta[t]))
	for t in ROW2_TOOLS:
		palette_row2.add_child(_make_tool_button(tool_meta[t]))
	for t in ROW3_TOOLS:
		palette_row3.add_child(_make_tool_button(tool_meta[t]))

	# Spacer + overlay buttons on row 3.
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(24, PALETTE_BTN_SIZE.y)
	palette_row3.add_child(spacer)
	for entry in OVERLAY_TABLE:
		palette_row3.add_child(_make_overlay_button(entry))

	# Disaster buttons after overlays.
	var spacer2 := Control.new()
	spacer2.custom_minimum_size = Vector2(24, PALETTE_BTN_SIZE.y)
	palette_row3.add_child(spacer2)
	palette_row3.add_child(_make_disaster_button(0, 32, "Tornado",
			func(): city.trigger_tornado(rng)))
	palette_row3.add_child(_make_disaster_button(1, 32, "Earthquake",
			func(): city.trigger_earthquake(rng)))
	palette_row3.add_child(_make_disaster_button(2, 32, "Flood",
			func(): city.trigger_flood(rng)))


func _make_disaster_button(col: int, row: int, tip: String, action: Callable) -> Button:
	var btn := Button.new()
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size = PALETTE_BTN_SIZE
	btn.expand_icon = true
	btn.icon = _atlas_icon(col, row)
	btn.tooltip_text = tip
	btn.pressed.connect(action)
	return btn


func _make_tool_button(entry: Array) -> Button:
	var id: int = entry[0]
	var col: int = entry[1]
	var row: int = entry[2]
	var tool_name: String = entry[3]
	var cost: String = entry[4]
	var btn := Button.new()
	btn.toggle_mode = true
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size = PALETTE_BTN_SIZE
	btn.expand_icon = true
	btn.icon = _atlas_icon(col, row)
	btn.button_group = tool_group
	btn.tooltip_text = "%s   %s" % [tool_name, cost] if cost != "" else tool_name
	btn.toggled.connect(func(is_on: bool):
		if is_on:
			current_tool = id
			_update_hud()
	)
	tool_buttons[id] = btn
	return btn


func _make_overlay_button(entry: Array) -> Button:
	var id: int = entry[0]
	var col: int = entry[1]
	var row: int = entry[2]
	var tip: String = entry[3]
	var btn := Button.new()
	btn.toggle_mode = true
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size = PALETTE_BTN_SIZE
	btn.expand_icon = true
	btn.icon = _atlas_icon(col, row)
	btn.button_group = overlay_group
	btn.tooltip_text = tip
	btn.toggled.connect(func(is_on: bool):
		if is_on:
			_set_overlay(id)
	)
	overlay_buttons[id] = btn
	return btn


func _atlas_icon(col: int, row: int) -> AtlasTexture:
	var at := AtlasTexture.new()
	at.atlas = atlas_tex
	at.region = Rect2(col * 16, row * 16, 16, 16)
	return at


func _set_tool(t: int) -> void:
	current_tool = t
	_sync_palette()
	_update_hud()


func _set_overlay(o: int) -> void:
	current_overlay = o
	_sync_palette()
	_refresh_overlay()


func _sync_palette() -> void:
	if current_tool in tool_buttons:
		tool_buttons[current_tool].set_pressed_no_signal(true)
	if current_overlay in overlay_buttons:
		overlay_buttons[current_overlay].set_pressed_no_signal(true)


# ---------- windows ----------

func _build_windows() -> void:
	city_info_window.set_title("City Info")
	budget_window.set_title("Budget")
	_refresh_city_info()
	_refresh_budget()


func _toggle_window(win: GameWindow) -> void:
	win.visible = not win.visible
	if win.visible:
		_refresh_city_info()
		_refresh_budget()


func _refresh_city_info() -> void:
	if city == null or not city_info_window.visible:
		return
	var c := city_info_window.content
	_clear_children(c)
	_add_line(c, "Population: %d" % city.population)
	_add_line(c, "Funds: $%d" % city.funds)
	_add_line(c, "Date: %s %d" % [_month_name(city.month), city.year])
	_add_line(c, "Jobs (C / I): %d / %d" % [city.jobs_c, city.jobs_i])
	_add_line(c, "Demand R / C / I: %+.2f  %+.2f  %+.2f" % [
			city.demand_r, city.demand_c, city.demand_i])
	_add_line(c, "Avg Pollution: %d" % _byte_avg(city.pollution))
	_add_line(c, "Avg Crime: %d" % _byte_avg(city.crime))
	_add_line(c, "Avg Land Value: %d" % _byte_avg(city.land_value))
	_add_line(c, "Powered cells: %d" % _byte_count(city.powered))
	_add_line(c, "Watered cells: %d" % _byte_count(city.watered))
	_add_line(c, "Sewered cells: %d" % _byte_count(city.sewered))


func _refresh_budget() -> void:
	if city == null or not budget_window.visible:
		return
	var c := budget_window.content
	_clear_children(c)
	var revenue: int = int(city.population * city.tax_rate)
	_add_line(c, "Monthly Revenue")
	_add_line(c, "  Taxes: +$%d" % revenue)
	_add_tax_slider(c)

	var road_tiles := 0
	var rail_tiles := 0
	for i in range(city.network.size()):
		if city.network[i] == City.Net.ROAD: road_tiles += 1
		elif city.network[i] == City.Net.RAIL: rail_tiles += 1
	var road_upkeep := int(road_tiles * City.UPKEEP_ROAD_PER_TILE)
	var rail_upkeep := int(rail_tiles * City.UPKEEP_RAIL_PER_TILE)

	var counts: Dictionary = {}
	for i in range(city.building_type.size()):
		if city.building_sub[i] != 0: continue
		var bt: int = city.building_type[i]
		if bt == City.Building.NONE: continue
		counts[bt] = counts.get(bt, 0) + 1

	var upkeep_rates := _upkeep_rates()
	var total_bld_upkeep := 0
	var bld_lines: Array = []
	for bt in counts:
		if upkeep_rates.has(bt):
			var line_upkeep: int = counts[bt] * upkeep_rates[bt]
			bld_lines.append([_building_name(bt), counts[bt], line_upkeep])
			total_bld_upkeep += line_upkeep

	_add_line(c, "Monthly Upkeep")
	_add_line(c, "  Roads (%d tiles): -$%d" % [road_tiles, road_upkeep])
	_add_line(c, "  Rail (%d tiles): -$%d" % [rail_tiles, rail_upkeep])
	for entry in bld_lines:
		_add_line(c, "  %s (%d): -$%d" % entry)

	var total_upkeep: int = road_upkeep + rail_upkeep + total_bld_upkeep
	_add_line(c, "")
	_add_line(c, "Net: $%d - $%d = $%s%d" % [
			revenue, total_upkeep,
			("+" if revenue - total_upkeep >= 0 else ""), revenue - total_upkeep])


func _upkeep_rates() -> Dictionary:
	return {
		City.Building.POLICE:        City.UPKEEP_POLICE,
		City.Building.FIRE:          City.UPKEEP_FIRE,
		City.Building.PARK:          City.UPKEEP_PARK,
		City.Building.COAL:          City.UPKEEP_COAL,
		City.Building.NUKE:          City.UPKEEP_NUKE,
		City.Building.WIND:          City.UPKEEP_WIND,
		City.Building.HYDRO:         City.UPKEEP_HYDRO,
		City.Building.WATER_TOWER:   City.UPKEEP_WATER_TOWER,
		City.Building.WATER_PUMP:    City.UPKEEP_WATER_PUMP,
		City.Building.SEWER_PLANT:   City.UPKEEP_SEWER_PLANT,
		City.Building.SOLAR:         City.UPKEEP_SOLAR,
		City.Building.GAS:           City.UPKEEP_GAS,
		City.Building.OIL:           City.UPKEEP_OIL,
		City.Building.MICROWAVE:     City.UPKEEP_MICROWAVE,
		City.Building.FUSION:        City.UPKEEP_FUSION,
		City.Building.ARCO_PLYMOUTH: City.UPKEEP_ARCO,
		City.Building.ARCO_FOREST:   City.UPKEEP_ARCO,
		City.Building.ARCO_DARCO:    City.UPKEEP_ARCO,
		City.Building.ARCO_LAUNCH:   City.UPKEEP_ARCO,
	}


func _building_name(bt: int) -> String:
	match bt:
		City.Building.POLICE: return "Police"
		City.Building.FIRE: return "Fire"
		City.Building.PARK: return "Park"
		City.Building.COAL: return "Coal"
		City.Building.NUKE: return "Nuclear"
		City.Building.WIND: return "Wind"
		City.Building.HYDRO: return "Hydro"
		City.Building.WATER_TOWER: return "Water Tower"
		City.Building.WATER_PUMP: return "Water Pump"
		City.Building.SEWER_PLANT: return "Sewer Plant"
		City.Building.SOLAR: return "Solar"
		City.Building.GAS: return "Gas"
		City.Building.OIL: return "Oil"
		City.Building.MICROWAVE: return "Microwave"
		City.Building.FUSION: return "Fusion"
		City.Building.ARCO_PLYMOUTH: return "Arco Plymouth"
		City.Building.ARCO_FOREST: return "Arco Forest"
		City.Building.ARCO_DARCO: return "Arco Darco"
		City.Building.ARCO_LAUNCH: return "Arco Launch"
	return "?"


func _byte_avg(arr: PackedByteArray) -> int:
	if arr.size() == 0: return 0
	var s := 0
	for v in arr: s += v
	return int(s / arr.size())


func _byte_count(arr: PackedByteArray) -> int:
	var c := 0
	for v in arr:
		if v > 0: c += 1
	return c


func _clear_children(node: Node) -> void:
	for child in node.get_children():
		child.queue_free()


func _add_line(container: Node, text: String) -> void:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_color_override("font_color", Color(0.95, 0.95, 0.95))
	container.add_child(lbl)


func _add_tax_slider(container: Node) -> void:
	var row := HBoxContainer.new()
	var lbl := Label.new()
	lbl.text = "  Tax rate:"
	lbl.add_theme_color_override("font_color", Color(0.95, 0.95, 0.95))
	row.add_child(lbl)
	var slider := HSlider.new()
	slider.min_value = 0.0
	slider.max_value = 20.0
	slider.step = 0.5
	slider.value = city.tax_rate * 100.0
	slider.custom_minimum_size = Vector2(140, 20)
	slider.focus_mode = Control.FOCUS_NONE
	row.add_child(slider)
	var pct := Label.new()
	pct.text = "%.1f%%" % (city.tax_rate * 100.0)
	pct.custom_minimum_size = Vector2(60, 20)
	pct.add_theme_color_override("font_color", Color(1, 1, 0.7))
	row.add_child(pct)
	slider.value_changed.connect(func(v: float):
		city.tax_rate = v / 100.0
		pct.text = "%.1f%%" % v
	)
	container.add_child(row)


# ---------- rendering ----------

func _on_city_changed() -> void:
	_render_dirty_and_minimap()
	_refresh_indicators_if_needed()
	_refresh_overlay_if_active()
	_refresh_city_info()
	_refresh_budget()
	_update_hud()


func _render_dirty_and_minimap() -> void:
	for key in city.dirty.keys():
		var i: int = key
		var x := i % city.width
		var y := int(i / city.width)
		var cell := Vector2i(x, y)
		ground.set_cell(cell, TileIds.SOURCE_ID, _atlas_for(x, y))
		_paint_overlay_net(power_lines, cell, city.power_line, TileIds.power_line(
				city.overlay_bitmask(x, y, City.OverlayNet.POWER)))
		_paint_overlay_net(water_pipes, cell, city.water_pipe, TileIds.water_pipe(
				city.overlay_bitmask(x, y, City.OverlayNet.WATER)))
		_paint_overlay_net(sewer_pipes, cell, city.sewer_pipe, TileIds.sewer_pipe(
				city.overlay_bitmask(x, y, City.OverlayNet.SEWER)))
		minimap.set_pixel(x, y, _minimap_color(x, y))
	minimap.flush()
	city.dirty.clear()


func _minimap_color(x: int, y: int) -> Color:
	var i := city.idx(x, y)
	var bt: int = city.building_type[i]
	if bt != City.Building.NONE:
		return _minimap_building_color(bt)
	var n: int = city.network[i]
	if n == City.Net.ROAD: return Color(0.25, 0.25, 0.27)
	if n == City.Net.RAIL: return Color(0.45, 0.35, 0.2)
	var z: int = city.zone[i]
	if z == City.Zone.R: return Color(0.5, 0.75, 0.5)
	if z == City.Zone.C: return Color(0.55, 0.65, 0.85)
	if z == City.Zone.I: return Color(0.85, 0.75, 0.45)
	match city.terrain[i]:
		City.Terrain.WATER:  return Color(0.2, 0.4, 0.7)
		City.Terrain.TREE:   return Color(0.15, 0.35, 0.15)
		City.Terrain.DIRT:   return Color(0.55, 0.4, 0.25)
		City.Terrain.RUBBLE: return Color(0.4, 0.3, 0.2)
	return Color(0.35, 0.55, 0.3)  # grass


func _minimap_building_color(bt: int) -> Color:
	if bt == City.Building.R_L1 or bt == City.Building.R_L2 or bt == City.Building.R_L3:
		return Color(0.2, 0.85, 0.3)
	if bt == City.Building.C_L1 or bt == City.Building.C_L2 or bt == City.Building.C_L3:
		return Color(0.4, 0.6, 1.0)
	if bt == City.Building.I_L1 or bt == City.Building.I_L2 or bt == City.Building.I_L3:
		return Color(1.0, 0.85, 0.25)
	if bt == City.Building.PARK:   return Color(0.4, 1.0, 0.4)
	if bt == City.Building.POLICE: return Color(0.3, 0.4, 1.0)
	if bt == City.Building.FIRE:   return Color(1.0, 0.3, 0.3)
	if bt == City.Building.ARCO_PLYMOUTH or bt == City.Building.ARCO_FOREST \
			or bt == City.Building.ARCO_DARCO or bt == City.Building.ARCO_LAUNCH:
		return Color(1.0, 0.4, 0.9)
	# Plants + utilities bucket.
	return Color(0.75, 0.75, 0.8)


func _on_minimap_click(mx: int, my: int) -> void:
	if not city.in_bounds(mx, my):
		return
	camera.position = Vector2(mx * 16 + 8, my * 16 + 8)


func _paint_overlay_net(layer: TileMapLayer, cell: Vector2i,
		bit_array: PackedByteArray, atlas_coord: Vector2i) -> void:
	var i := cell.y * city.width + cell.x
	if bit_array[i] == 1:
		layer.set_cell(cell, TileIds.SOURCE_ID, atlas_coord)
	else:
		layer.erase_cell(cell)


func _atlas_for(x: int, y: int) -> Vector2i:
	var i := city.idx(x, y)
	var bt: int = city.building_type[i]
	if bt != City.Building.NONE:
		return _building_atlas(bt, city.building_sub[i])

	var n: int = city.network[i]
	if n == City.Net.ROAD:
		return TileIds.road(city.network_bitmask(x, y, City.Net.ROAD))
	if n == City.Net.RAIL:
		return TileIds.rail(city.network_bitmask(x, y, City.Net.RAIL))

	var z: int = city.zone[i]
	if z == City.Zone.R: return TileIds.ZONE_R
	if z == City.Zone.C: return TileIds.ZONE_C
	if z == City.Zone.I: return TileIds.ZONE_I

	match city.terrain[i]:
		City.Terrain.WATER:  return TileIds.WATER
		City.Terrain.DIRT:   return TileIds.DIRT
		City.Terrain.TREE:   return TileIds.TREE
		City.Terrain.RUBBLE: return TileIds.RUBBLE

	var shore_mask := city.water_bitmask(x, y)
	if shore_mask != 0:
		return TileIds.shore(shore_mask)
	return TileIds.GRASS


func _building_atlas(bt: int, sub: int) -> Vector2i:
	match bt:
		City.Building.R_L1: return TileIds.BLD_R_L1
		City.Building.C_L1: return TileIds.BLD_C_L1
		City.Building.I_L1: return TileIds.BLD_I_L1
		City.Building.PARK: return TileIds.PARK
		City.Building.WIND: return TileIds.WIND
		City.Building.HYDRO: return TileIds.HYDRO
		City.Building.WATER_TOWER: return TileIds.WATER_TOWER
		City.Building.R_L2: return TileIds.BLD_R_L2[sub]
		City.Building.C_L2: return TileIds.BLD_C_L2[sub]
		City.Building.I_L2: return TileIds.BLD_I_L2[sub]
		City.Building.POLICE: return TileIds.POLICE[sub]
		City.Building.FIRE: return TileIds.FIRE[sub]
		City.Building.COAL: return TileIds.COAL[sub]
		City.Building.WATER_PUMP: return TileIds.WATER_PUMP[sub]
		City.Building.SEWER_PLANT: return TileIds.SEWER_PLANT[sub]
		City.Building.SOLAR: return TileIds.SOLAR[sub]
		City.Building.GAS: return TileIds.GAS[sub]
		City.Building.OIL: return TileIds.OIL[sub]
		City.Building.MICROWAVE: return TileIds.MICROWAVE[sub]
		City.Building.R_L3: return TileIds.BLD_R_L3[sub]
		City.Building.C_L3: return TileIds.BLD_C_L3[sub]
		City.Building.I_L3: return TileIds.BLD_I_L3[sub]
		City.Building.NUKE: return TileIds.NUKE[sub]
		City.Building.FUSION: return TileIds.FUSION[sub]
		City.Building.ARCO_PLYMOUTH: return TileIds.ARCO_PLYMOUTH[sub]
		City.Building.ARCO_FOREST: return TileIds.ARCO_FOREST[sub]
		City.Building.ARCO_DARCO: return TileIds.ARCO_DARCO[sub]
		City.Building.ARCO_LAUNCH: return TileIds.ARCO_LAUNCH[sub]
	return TileIds.GRASS


# ---------- indicators ----------

func _refresh_indicators_if_needed() -> void:
	# Skip the full-grid rescan when indicators aren't visible (zoomed-out Pi).
	if not indicators.visible:
		return
	indicators.clear()
	for y in range(city.height):
		for x in range(city.width):
			var i := city.idx(x, y)
			if city.building_sub[i] != 0: continue
			var bt: int = city.building_type[i]
			if bt == City.Building.NONE: continue
			if not _building_needs_utilities(bt): continue
			if city.powered[i] == 0:
				indicators.set_cell(Vector2i(x, y), TileIds.SOURCE_ID, TileIds.NO_POWER_IND)
			elif _building_needs_water(bt) and city.watered[i] == 0:
				indicators.set_cell(Vector2i(x, y), TileIds.SOURCE_ID, TileIds.NO_WATER_IND)


func _building_needs_utilities(bt: int) -> bool:
	return bt in [
		City.Building.R_L1, City.Building.R_L2, City.Building.R_L3,
		City.Building.C_L1, City.Building.C_L2, City.Building.C_L3,
		City.Building.I_L1, City.Building.I_L2, City.Building.I_L3,
		City.Building.POLICE, City.Building.FIRE,
		City.Building.ARCO_PLYMOUTH, City.Building.ARCO_FOREST,
		City.Building.ARCO_DARCO, City.Building.ARCO_LAUNCH,
	]


func _building_needs_water(bt: int) -> bool:
	return bt in [
		City.Building.R_L2, City.Building.C_L2, City.Building.I_L2,
		City.Building.R_L3, City.Building.C_L3, City.Building.I_L3,
		City.Building.ARCO_PLYMOUTH, City.Building.ARCO_FOREST,
		City.Building.ARCO_DARCO, City.Building.ARCO_LAUNCH,
	]


# ---------- overlay ----------

func _refresh_overlay_if_active() -> void:
	if current_overlay != City.Overlay.NONE:
		_refresh_overlay()


func _refresh_overlay() -> void:
	overlay.clear()
	if current_overlay == City.Overlay.NONE:
		overlay.modulate = Color.WHITE
		_update_hud()
		return
	overlay.modulate = _overlay_tint(current_overlay)
	for y in range(city.height):
		for x in range(city.width):
			var v: int = _overlay_scalar(current_overlay, x, y)
			if v <= 20: continue
			var ramp := _overlay_ramp_tile(v)
			overlay.set_cell(Vector2i(x, y), TileIds.SOURCE_ID, ramp)
	_update_hud()


func _overlay_scalar(mode: int, x: int, y: int) -> int:
	var i := city.idx(x, y)
	match mode:
		City.Overlay.POLLUTION:  return city.pollution[i]
		City.Overlay.CRIME:      return city.crime[i]
		City.Overlay.LAND_VALUE: return city.land_value[i]
		City.Overlay.POWER:      return 200 if city.powered[i] == 1 else 0
		City.Overlay.WATER_COV:  return 200 if city.watered[i] == 1 else 0
		City.Overlay.SEWER_COV:  return 200 if city.sewered[i] == 1 else 0
		City.Overlay.TRAFFIC:    return city.traffic[i]
	return 0


func _overlay_tint(mode: int) -> Color:
	match mode:
		City.Overlay.POLLUTION:  return Color(0.9, 0.2, 0.1, 1.0)
		City.Overlay.CRIME:      return Color(0.9, 0.1, 0.6, 1.0)
		City.Overlay.LAND_VALUE: return Color(0.2, 0.9, 0.3, 1.0)
		City.Overlay.POWER:      return Color(1.0, 0.9, 0.2, 1.0)
		City.Overlay.WATER_COV:  return Color(0.3, 0.7, 1.0, 1.0)
		City.Overlay.SEWER_COV:  return Color(0.7, 0.5, 0.3, 1.0)
		City.Overlay.TRAFFIC:    return Color(1.0, 0.5, 0.2, 1.0)
	return Color.WHITE


func _overlay_ramp_tile(v: int) -> Vector2i:
	if v < 50:   return TileIds.OVERLAY_0
	if v < 100:  return TileIds.OVERLAY_1
	if v < 150:  return TileIds.OVERLAY_2
	if v < 200:  return TileIds.OVERLAY_3
	return TileIds.OVERLAY_4


# ---------- HUD ----------

func _update_hud() -> void:
	var tool_name := "?"
	for entry in TOOL_TABLE:
		if entry[0] == current_tool:
			tool_name = entry[3]
			break
	tool_label.text = "Tool: %s" % tool_name
	funds_label.text = "$%d" % city.funds
	date_label.text = "%s %d" % [_month_name(city.month), city.year]
	pop_label.text = "Pop: %d" % city.population
	demand_r_bar.value = _demand_to_bar(city.demand_r)
	demand_c_bar.value = _demand_to_bar(city.demand_c)
	demand_i_bar.value = _demand_to_bar(city.demand_i)
	speed_label.text = "Speed: %s" % SPEED_LABELS[speed_index]
	pause_btn.text = "▶" if speed_index == 0 else "||"


func _demand_to_bar(d: float) -> float:
	return clampf((d + 1.0) * 50.0, 0.0, 100.0)


func _on_advisor_message(text: String, severity: int) -> void:
	advisor_label.text = text
	var col: Color
	match severity:
		City.SEVERITY_WARN:  col = Color(1.0, 0.85, 0.3)
		City.SEVERITY_ALERT: col = Color(1.0, 0.4, 0.3)
		_:                   col = Color(0.95, 0.95, 0.95)
	advisor_label.modulate = col
	advisor_label.add_theme_color_override("font_color", col)
	# Hold visible 3s, then fade over 1.5s.
	var tween := create_tween()
	tween.tween_interval(3.0)
	tween.tween_property(advisor_label, "modulate:a", 0.0, 1.5)


func _month_name(m: int) -> String:
	var names := ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
			"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	if m < 0 or m >= names.size():
		return "?"
	return names[m]
