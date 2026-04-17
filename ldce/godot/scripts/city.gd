class_name City
extends Resource

# Terrain uses the world ground; all other cell state layers on top.
enum Terrain { GRASS, WATER, DIRT, TREE, RUBBLE }
enum Zone { NONE, R, C, I }
enum Net { NONE, ROAD, RAIL }  # POWER/WATER/SEWER moved to overlay bit-arrays.
enum OverlayNet { POWER, WATER, SEWER }

# Building kinds. 1x1: R_L1/C_L1/I_L1/PARK/WIND/HYDRO/WATER_TOWER.
# 2x2: R_L2/C_L2/I_L2/POLICE/FIRE/COAL/WATER_PUMP/SEWER_PLANT/SOLAR/GAS/OIL/MICROWAVE.
# 3x3: R_L3/C_L3/I_L3/NUKE/FUSION/ARCO_{PLYMOUTH,FOREST,DARCO,LAUNCH}.
# Sub-index stored in building_sub (row-major in footprint).
enum Building {
	NONE,
	R_L1, C_L1, I_L1,
	R_L2, C_L2, I_L2,
	R_L3, C_L3, I_L3,
	PARK,
	POLICE, FIRE,
	COAL, NUKE,
	WIND, HYDRO, WATER_TOWER,
	WATER_PUMP, SEWER_PLANT,
	SOLAR, GAS, OIL, MICROWAVE,
	FUSION,
	ARCO_PLYMOUTH, ARCO_FOREST, ARCO_DARCO, ARCO_LAUNCH,
}

enum Overlay { NONE, POLLUTION, CRIME, LAND_VALUE, POWER, WATER_COV, SEWER_COV, TRAFFIC }

# Uses Resource's built-in `changed` signal via emit_changed().

var width: int = 128
var height: int = 128

# --- layers ---
var terrain: PackedByteArray
var network: PackedByteArray          # ROAD/RAIL only. NONE = 0.
var zone: PackedByteArray
var building_type: PackedByteArray
var building_sub: PackedByteArray

# Overlay networks — each cell is 0 or 1, can coexist with anything.
var power_line: PackedByteArray
var water_pipe: PackedByteArray
var sewer_pipe: PackedByteArray

# Computed per tick.
var powered: PackedByteArray
var watered: PackedByteArray
var sewered: PackedByteArray

# --- sim grids (all bytes, 0..255) ---
var pollution: PackedByteArray
var land_value: PackedByteArray
var crime: PackedByteArray
var fire_risk: PackedByteArray
var police_cov: PackedByteArray
var fire_cov: PackedByteArray
var park_cov: PackedByteArray
var traffic: PackedByteArray

# --- global state ---
var funds: int = 20000
var population: int = 0
var jobs_c: int = 0
var jobs_i: int = 0
var month: int = 0          # 0..11
var year: int = 1900
var tick_count: int = 0     # monotonic since start
var demand_r: float = 1.0
var demand_c: float = 0.5
var demand_i: float = 0.5

# --- dirty cells for incremental rendering ---
var dirty: Dictionary = {}

# --- advisor / history ---
signal advisor_message(text: String, severity: int)
const SEVERITY_INFO: int = 0
const SEVERITY_WARN: int = 1
const SEVERITY_ALERT: int = 2
const HISTORY_CAP: int = 200
var pop_history: PackedInt32Array
var funds_history: PackedInt32Array
var pollution_history: PackedByteArray
var crime_history: PackedByteArray
var _last_pop_milestone: int = 0
var _funds_warned: bool = false

# Batch gate — edit ops skip emit_changed() while > 0, so a large drag commit
# triggers a single emit_changed() via end_batch() at the end.
var _batch_depth: int = 0


func begin_batch() -> void:
	_batch_depth += 1


func end_batch() -> void:
	_batch_depth -= 1
	if _batch_depth <= 0:
		_batch_depth = 0
		emit_changed()


func _emit_if_not_batching() -> void:
	if _batch_depth == 0:
		emit_changed()

const TICKS_PER_MONTH: int = 8

const NEIGHBOURS: Array[Vector2i] = [
	Vector2i(0, -1),
	Vector2i(1,  0),
	Vector2i(0,  1),
	Vector2i(-1, 0),
]
const BITS: Array[int] = [1, 2, 4, 8]

# --- costs & upkeep (per tile / placement / month) ---
const COST_ROAD: int = 10
const COST_RAIL: int = 25
const COST_POWER_LINE: int = 5
const COST_ZONE: int = 20
const COST_PARK: int = 100
const COST_POLICE: int = 500
const COST_FIRE: int = 500
const COST_COAL: int = 3000
const COST_NUKE: int = 5000

const UPKEEP_ROAD_PER_TILE: float = 0.1
const UPKEEP_RAIL_PER_TILE: float = 0.2
const UPKEEP_POLICE: int = 100
const UPKEEP_FIRE: int = 100
const UPKEEP_COAL: int = 50
const UPKEEP_NUKE: int = 200
const UPKEEP_PARK: int = 10
# Mutable tax rate (dollars per citizen per month). Exposed to the HUD slider.
var tax_rate: float = 0.07

# --- footprint sizes per building kind ---
const FOOTPRINT: Dictionary = {
	Building.NONE: Vector2i(0, 0),
	Building.R_L1: Vector2i(1, 1),
	Building.C_L1: Vector2i(1, 1),
	Building.I_L1: Vector2i(1, 1),
	Building.PARK: Vector2i(1, 1),
	Building.WIND: Vector2i(1, 1),
	Building.HYDRO: Vector2i(1, 1),
	Building.WATER_TOWER: Vector2i(1, 1),
	Building.R_L2: Vector2i(2, 2),
	Building.C_L2: Vector2i(2, 2),
	Building.I_L2: Vector2i(2, 2),
	Building.POLICE: Vector2i(2, 2),
	Building.FIRE: Vector2i(2, 2),
	Building.COAL: Vector2i(2, 2),
	Building.WATER_PUMP: Vector2i(2, 2),
	Building.SEWER_PLANT: Vector2i(2, 2),
	Building.SOLAR: Vector2i(2, 2),
	Building.GAS: Vector2i(2, 2),
	Building.OIL: Vector2i(2, 2),
	Building.MICROWAVE: Vector2i(2, 2),
	Building.R_L3: Vector2i(3, 3),
	Building.C_L3: Vector2i(3, 3),
	Building.I_L3: Vector2i(3, 3),
	Building.NUKE: Vector2i(3, 3),
	Building.FUSION: Vector2i(3, 3),
	Building.ARCO_PLYMOUTH: Vector2i(3, 3),
	Building.ARCO_FOREST: Vector2i(3, 3),
	Building.ARCO_DARCO: Vector2i(3, 3),
	Building.ARCO_LAUNCH: Vector2i(3, 3),
}

# Power output per plant type (for soft output/demand balancing — not enforced yet).
const POWER_OUTPUT: Dictionary = {
	Building.WIND: 10,
	Building.HYDRO: 40,
	Building.SOLAR: 50,
	Building.GAS: 150,
	Building.COAL: 200,
	Building.OIL: 220,
	Building.NUKE: 500,
	Building.MICROWAVE: 300,
	Building.FUSION: 1000,
}

# Costs / upkeep for the new buildings (COST_PARK..COST_NUKE declared above).
const COST_WIND: int = 400
const COST_HYDRO: int = 800
const COST_WATER_TOWER: int = 250
const COST_WATER_PUMP: int = 1500
const COST_SEWER_PLANT: int = 1800
const COST_SOLAR: int = 2200
const COST_GAS: int = 2400
const COST_OIL: int = 2800
const COST_MICROWAVE: int = 8000
const COST_FUSION: int = 12000
const COST_ARCO: int = 100000
const COST_WATER_PIPE: int = 3
const COST_SEWER_PIPE: int = 4

const UPKEEP_WIND: int = 5
const UPKEEP_HYDRO: int = 15
const UPKEEP_WATER_TOWER: int = 10
const UPKEEP_WATER_PUMP: int = 30
const UPKEEP_SEWER_PLANT: int = 40
const UPKEEP_SOLAR: int = 20
const UPKEEP_GAS: int = 30
const UPKEEP_OIL: int = 40
const UPKEEP_MICROWAVE: int = 150
const UPKEEP_FUSION: int = 400
const UPKEEP_ARCO: int = 800


func _init() -> void:
	_resize(width, height)
	_generate_world(1337)
	mark_all_dirty()


func _resize(w: int, h: int) -> void:
	width = w
	height = h
	var n := w * h
	terrain = PackedByteArray();       terrain.resize(n)
	network = PackedByteArray();       network.resize(n)
	zone = PackedByteArray();          zone.resize(n)
	building_type = PackedByteArray(); building_type.resize(n)
	building_sub = PackedByteArray();  building_sub.resize(n)
	power_line = PackedByteArray();    power_line.resize(n)
	water_pipe = PackedByteArray();    water_pipe.resize(n)
	sewer_pipe = PackedByteArray();    sewer_pipe.resize(n)
	powered = PackedByteArray();       powered.resize(n)
	watered = PackedByteArray();       watered.resize(n)
	sewered = PackedByteArray();       sewered.resize(n)
	pollution = PackedByteArray();     pollution.resize(n)
	land_value = PackedByteArray();    land_value.resize(n)
	crime = PackedByteArray();         crime.resize(n)
	fire_risk = PackedByteArray();     fire_risk.resize(n)
	police_cov = PackedByteArray();    police_cov.resize(n)
	fire_cov = PackedByteArray();      fire_cov.resize(n)
	park_cov = PackedByteArray();      park_cov.resize(n)
	traffic = PackedByteArray();       traffic.resize(n)


func _generate_world(seed: int) -> void:
	var noise := FastNoiseLite.new()
	noise.seed = seed
	noise.frequency = 0.02
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX

	var rng := RandomNumberGenerator.new()
	rng.seed = seed

	for i in range(terrain.size()):
		terrain[i] = Terrain.GRASS

	# Water via noise threshold — creates lakes and curving rivers.
	for y in range(height):
		for x in range(width):
			var n: float = noise.get_noise_2d(x, y)
			if n < -0.35:
				terrain[idx(x, y)] = Terrain.WATER

	# Tree clusters via a second noise octave.
	var tree_noise := FastNoiseLite.new()
	tree_noise.seed = seed ^ 0xBEEF
	tree_noise.frequency = 0.06
	for y in range(height):
		for x in range(width):
			if terrain[idx(x, y)] != Terrain.GRASS:
				continue
			var n: float = tree_noise.get_noise_2d(x, y)
			if n > 0.35 and rng.randf() < 0.7:
				terrain[idx(x, y)] = Terrain.TREE


func idx(x: int, y: int) -> int:
	return y * width + x


func in_bounds(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < width and y < height


func mark_dirty(x: int, y: int) -> void:
	if in_bounds(x, y):
		dirty[idx(x, y)] = true


func mark_dirty_neighbors(x: int, y: int) -> void:
	mark_dirty(x, y)
	for off in NEIGHBOURS:
		mark_dirty(x + off.x, y + off.y)


func mark_all_dirty() -> void:
	for i in range(width * height):
		dirty[i] = true


# ---------- edit operations ----------

func bulldoze(x: int, y: int) -> bool:
	if not in_bounds(x, y): return false
	var i := idx(x, y)
	var bt: int = building_type[i]
	if bt != Building.NONE:
		_remove_building_footprint(x, y, bt, building_sub[i])
	else:
		# If an overlay (power/water/sewer) is present, bulldoze clears only that.
		if power_line[i] == 1 or water_pipe[i] == 1 or sewer_pipe[i] == 1:
			power_line[i] = 0
			water_pipe[i] = 0
			sewer_pipe[i] = 0
			mark_dirty_neighbors(x, y)
		else:
			network[i] = Net.NONE
			zone[i] = Zone.NONE
			if terrain[i] == Terrain.TREE or terrain[i] == Terrain.RUBBLE:
				terrain[i] = Terrain.GRASS
			mark_dirty_neighbors(x, y)
	_emit_if_not_batching()
	return true


func set_overlay(x: int, y: int, kind: int) -> bool:
	"""Paint a power_line / water_pipe / sewer_pipe bit on (x, y).
	Overlay networks can go on any cell regardless of underlying terrain/network/building.
	"""
	if not in_bounds(x, y): return false
	var i := idx(x, y)
	var already := false
	match kind:
		OverlayNet.POWER: already = power_line[i] == 1
		OverlayNet.WATER: already = water_pipe[i] == 1
		OverlayNet.SEWER: already = sewer_pipe[i] == 1
		_: return false
	if already: return true
	var cost := _overlay_cost(kind)
	if funds < cost: return false
	funds -= cost
	match kind:
		OverlayNet.POWER: power_line[i] = 1
		OverlayNet.WATER: water_pipe[i] = 1
		OverlayNet.SEWER: sewer_pipe[i] = 1
	mark_dirty_neighbors(x, y)
	_emit_if_not_batching()
	return true


func overlay_bitmask(x: int, y: int, kind: int) -> int:
	"""For rendering: return N/E/S/W bitmask of overlay presence around (x, y),
	where the cell itself (x, y) is assumed to have the overlay set.
	"""
	var m := 0
	for di in range(4):
		var nx := x + NEIGHBOURS[di].x
		var ny := y + NEIGHBOURS[di].y
		if not in_bounds(nx, ny): continue
		var ni := idx(nx, ny)
		var present := false
		match kind:
			OverlayNet.POWER: present = power_line[ni] == 1
			OverlayNet.WATER: present = water_pipe[ni] == 1
			OverlayNet.SEWER: present = sewer_pipe[ni] == 1
		if present:
			m |= BITS[di]
	return m


func set_network(x: int, y: int, kind: int) -> bool:
	if not in_bounds(x, y): return false
	var i := idx(x, y)
	if terrain[i] == Terrain.WATER: return false
	if building_type[i] != Building.NONE: return false
	var cost := _network_cost(kind)
	if funds < cost: return false
	# Idempotent: don't charge for repaint.
	if network[i] == kind: return true
	funds -= cost
	if terrain[i] == Terrain.TREE:
		terrain[i] = Terrain.GRASS
	network[i] = kind
	zone[i] = Zone.NONE
	mark_dirty_neighbors(x, y)
	_emit_if_not_batching()
	return true


func set_zone(x: int, y: int, z: int) -> bool:
	if not in_bounds(x, y): return false
	var i := idx(x, y)
	if terrain[i] == Terrain.WATER: return false
	if network[i] != Net.NONE: return false
	if building_type[i] != Building.NONE: return false
	if funds < COST_ZONE: return false
	if zone[i] == z: return true
	funds -= COST_ZONE
	if terrain[i] == Terrain.TREE:
		terrain[i] = Terrain.GRASS
	zone[i] = z
	mark_dirty(x, y)
	_emit_if_not_batching()
	return true


func place_building(x: int, y: int, kind: int) -> bool:
	"""Place a building with natural footprint at (x, y) as top-left.
	Used for all player-placed buildings (services, plants, arcologies)."""
	var fp: Vector2i = FOOTPRINT[kind]
	if fp == Vector2i(0, 0): return false
	# Special placement constraints.
	if kind == Building.HYDRO or kind == Building.WATER_PUMP:
		if not _footprint_adjacent_to_water(x, y, fp.x, fp.y):
			return false
	if not _footprint_clear(x, y, fp.x, fp.y): return false
	var cost := _building_cost(kind)
	if funds < cost: return false
	funds -= cost
	_write_building_footprint(x, y, kind, fp.x, fp.y)
	_emit_if_not_batching()
	return true


func _footprint_adjacent_to_water(tx: int, ty: int, cols: int, rows: int) -> bool:
	for dy in range(-1, rows + 1):
		for dx in range(-1, cols + 1):
			var nx := tx + dx
			var ny := ty + dy
			# Only check the 1-cell ring around the footprint.
			var in_footprint := dx >= 0 and dx < cols and dy >= 0 and dy < rows
			if in_footprint: continue
			if not in_bounds(nx, ny): continue
			if terrain[idx(nx, ny)] == Terrain.WATER:
				return true
	return false


# Growth/promotion skips the funds check.
func _place_building_free(x: int, y: int, kind: int) -> bool:
	var fp: Vector2i = FOOTPRINT[kind]
	if fp == Vector2i(0, 0): return false
	if not _footprint_clear(x, y, fp.x, fp.y): return false
	_write_building_footprint(x, y, kind, fp.x, fp.y)
	return true


func _footprint_clear(tx: int, ty: int, cols: int, rows: int) -> bool:
	for dy in range(rows):
		for dx in range(cols):
			var nx := tx + dx
			var ny := ty + dy
			if not in_bounds(nx, ny): return false
			var i := idx(nx, ny)
			if terrain[i] == Terrain.WATER: return false
			if network[i] != Net.NONE: return false
			if building_type[i] != Building.NONE: return false
	return true


func _write_building_footprint(tx: int, ty: int, kind: int, cols: int, rows: int) -> void:
	var sub := 0
	for dy in range(rows):
		for dx in range(cols):
			var i := idx(tx + dx, ty + dy)
			if terrain[i] == Terrain.TREE or terrain[i] == Terrain.RUBBLE:
				terrain[i] = Terrain.GRASS
			zone[i] = Zone.NONE
			building_type[i] = kind
			building_sub[i] = sub
			mark_dirty(tx + dx, ty + dy)
			sub += 1


func _remove_building_footprint(x: int, y: int, kind: int, sub: int) -> void:
	# Locate TL from sub + footprint.
	var fp: Vector2i = FOOTPRINT[kind]
	var sub_col := sub % fp.x
	var sub_row := int(sub / fp.x)
	var tx := x - sub_col
	var ty := y - sub_row
	for dy in range(fp.y):
		for dx in range(fp.x):
			var nx := tx + dx
			var ny := ty + dy
			if in_bounds(nx, ny):
				var i := idx(nx, ny)
				building_type[i] = Building.NONE
				building_sub[i] = 0
				mark_dirty(nx, ny)


func _network_cost(kind: int) -> int:
	match kind:
		Net.ROAD: return COST_ROAD
		Net.RAIL: return COST_RAIL
	return 0


func _overlay_cost(kind: int) -> int:
	match kind:
		OverlayNet.POWER: return COST_POWER_LINE
		OverlayNet.WATER: return COST_WATER_PIPE
		OverlayNet.SEWER: return COST_SEWER_PIPE
	return 0


func _building_cost(kind: int) -> int:
	match kind:
		Building.PARK:          return COST_PARK
		Building.POLICE:        return COST_POLICE
		Building.FIRE:          return COST_FIRE
		Building.COAL:          return COST_COAL
		Building.NUKE:          return COST_NUKE
		Building.WIND:          return COST_WIND
		Building.HYDRO:         return COST_HYDRO
		Building.WATER_TOWER:   return COST_WATER_TOWER
		Building.WATER_PUMP:    return COST_WATER_PUMP
		Building.SEWER_PLANT:   return COST_SEWER_PLANT
		Building.SOLAR:         return COST_SOLAR
		Building.GAS:           return COST_GAS
		Building.OIL:           return COST_OIL
		Building.MICROWAVE:     return COST_MICROWAVE
		Building.FUSION:        return COST_FUSION
		Building.ARCO_PLYMOUTH: return COST_ARCO
		Building.ARCO_FOREST:   return COST_ARCO
		Building.ARCO_DARCO:    return COST_ARCO
		Building.ARCO_LAUNCH:   return COST_ARCO
	return 0


# ---------- simulation ----------

func tick(rng: RandomNumberGenerator) -> void:
	tick_count += 1
	_compute_power()
	_compute_water()
	_compute_sewer()
	_compute_coverage()
	_diffuse_pollution()
	_compute_land_value()
	_compute_crime()
	_compute_fire_risk()
	_compute_traffic()
	_fire_events(rng)
	_count_pop_and_jobs()
	_update_demand()
	_grow_decay(rng)
	if tick_count % TICKS_PER_MONTH == 0:
		_advance_month()
	emit_changed()


# --- utility BFS helpers ------------------------------------------

func _is_power_source(bt: int) -> bool:
	return bt in [Building.COAL, Building.NUKE, Building.WIND, Building.HYDRO,
			Building.SOLAR, Building.GAS, Building.OIL,
			Building.MICROWAVE, Building.FUSION]


func _is_water_source(bt: int) -> bool:
	return bt == Building.WATER_PUMP or bt == Building.WATER_TOWER


func _is_sewer_source(bt: int) -> bool:
	return bt == Building.SEWER_PLANT


# --- power --------------------------------------------------------

func _compute_power() -> void:
	for i in range(powered.size()):
		powered[i] = 0
	var queue: Array[int] = []
	for i in range(building_type.size()):
		if _is_power_source(building_type[i]):
			powered[i] = 1
			queue.append(i)
	while queue.size() > 0:
		var i: int = queue.pop_front()
		var x := i % width
		var y := int(i / width)
		for off in NEIGHBOURS:
			var nx := x + off.x
			var ny := y + off.y
			if not in_bounds(nx, ny): continue
			var ni := idx(nx, ny)
			if powered[ni] == 1: continue
			# Power flows through dedicated lines and through any building.
			if power_line[ni] == 1 or building_type[ni] != Building.NONE:
				powered[ni] = 1
				queue.append(ni)


# --- water -------------------------------------------------------

func _compute_water() -> void:
	for i in range(watered.size()):
		watered[i] = 0
	var queue: Array[int] = []
	for i in range(building_type.size()):
		if _is_water_source(building_type[i]):
			watered[i] = 1
			queue.append(i)
	while queue.size() > 0:
		var i: int = queue.pop_front()
		var x := i % width
		var y := int(i / width)
		for off in NEIGHBOURS:
			var nx := x + off.x
			var ny := y + off.y
			if not in_bounds(nx, ny): continue
			var ni := idx(nx, ny)
			if watered[ni] == 1: continue
			if water_pipe[ni] == 1 or building_type[ni] != Building.NONE:
				watered[ni] = 1
				queue.append(ni)


# --- sewer -------------------------------------------------------

func _compute_sewer() -> void:
	for i in range(sewered.size()):
		sewered[i] = 0
	var queue: Array[int] = []
	for i in range(building_type.size()):
		if _is_sewer_source(building_type[i]):
			sewered[i] = 1
			queue.append(i)
	while queue.size() > 0:
		var i: int = queue.pop_front()
		var x := i % width
		var y := int(i / width)
		for off in NEIGHBOURS:
			var nx := x + off.x
			var ny := y + off.y
			if not in_bounds(nx, ny): continue
			var ni := idx(nx, ny)
			if sewered[ni] == 1: continue
			if sewer_pipe[ni] == 1 or building_type[ni] != Building.NONE:
				sewered[ni] = 1
				queue.append(ni)


# --- service coverage ---------------------------------------------

func _compute_coverage() -> void:
	for i in range(police_cov.size()): police_cov[i] = 0
	for i in range(fire_cov.size()):   fire_cov[i]   = 0
	for i in range(park_cov.size()):   park_cov[i]   = 0
	for y in range(height):
		for x in range(width):
			var i := idx(x, y)
			if building_sub[i] != 0: continue      # only stamp once per structure
			var bt: int = building_type[i]
			match bt:
				Building.POLICE: _stamp_coverage(police_cov, x, y, 6, 200)
				Building.FIRE:   _stamp_coverage(fire_cov,   x, y, 5, 200)
				Building.PARK:   _stamp_coverage(park_cov,   x, y, 3, 160)


func _stamp_coverage(arr: PackedByteArray, cx: int, cy: int, radius: int, maxv: int) -> void:
	for dy in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			var nx := cx + dx
			var ny := cy + dy
			if not in_bounds(nx, ny): continue
			var d: int = max(abs(dx), abs(dy))
			var v := int(maxv * (1.0 - float(d) / float(radius + 1)))
			var i := idx(nx, ny)
			if v > arr[i]:
				arr[i] = v


# --- pollution ----------------------------------------------------

func _diffuse_pollution() -> void:
	# Compute source term per cell, then blend with decayed neighbor average.
	var next := PackedByteArray()
	next.resize(pollution.size())
	for y in range(height):
		for x in range(width):
			var i := idx(x, y)
			var src := _pollution_source(i)
			var acc := 0
			var count := 0
			for off in NEIGHBOURS:
				var nx := x + off.x
				var ny := y + off.y
				if in_bounds(nx, ny):
					acc += pollution[idx(nx, ny)]
					count += 1
			var avg: int = 0 if count == 0 else int(acc / count)
			var decayed: int = int(max(pollution[i], avg) * 0.88)
			var v: int = decayed + src
			if v > 255: v = 255
			next[i] = v
	pollution = next


func _pollution_source(i: int) -> int:
	match building_type[i]:
		Building.I_L1: return 30
		Building.I_L2: return 55
		Building.I_L3: return 90
		Building.COAL: return 80
		Building.OIL:  return 95
		Building.GAS:  return 40
		Building.NUKE: return 5
		Building.WIND, Building.HYDRO, Building.SOLAR, \
		Building.MICROWAVE, Building.FUSION: return 0
	if network[i] == Net.ROAD: return 2
	return 0


# --- land value ---------------------------------------------------

func _compute_land_value() -> void:
	for y in range(height):
		for x in range(width):
			var i := idx(x, y)
			var v: int = 32
			v += park_cov[i] / 2
			v += police_cov[i] / 3
			v += fire_cov[i] / 6
			v -= int(pollution[i] * 0.6)
			v -= int(crime[i] * 0.3)
			if terrain[i] == Terrain.WATER: v = 0
			if terrain[i] == Terrain.RUBBLE: v = max(0, v - 40)
			land_value[i] = clampi(v, 0, 255)


# --- crime --------------------------------------------------------

func _compute_crime() -> void:
	# Crime only exists where there's a building to commit crime against.
	# Applying the 100-LV/2 base to empty grass creates a feedback loop that
	# crashes land value before any zone can grow.
	for y in range(height):
		for x in range(width):
			var i := idx(x, y)
			if building_type[i] == Building.NONE:
				crime[i] = 0
				continue
			var v: int = 60 - land_value[i] / 3
			v -= police_cov[i]
			match building_type[i]:
				Building.C_L1, Building.C_L2, Building.C_L3: v += 10
				Building.I_L1, Building.I_L2, Building.I_L3: v += 15
			crime[i] = clampi(v, 0, 255)


# --- fire risk ----------------------------------------------------

func _compute_traffic() -> void:
	# Road/rail cells pick up commute load from neighbouring buildings. Residents
	# leave for jobs (C/I), customers drive to commerce. A toy 1-hop model —
	# good enough for a visible overlay without a proper routing pass.
	for i in range(traffic.size()):
		traffic[i] = 0
	for y in range(height):
		for x in range(width):
			var i := idx(x, y)
			var n: int = network[i]
			if n != Net.ROAD and n != Net.RAIL:
				continue
			var load := 0
			for off in NEIGHBOURS:
				var nx := x + off.x
				var ny := y + off.y
				if not in_bounds(nx, ny): continue
				var ni := idx(nx, ny)
				if building_sub[ni] != 0: continue
				var bt: int = building_type[ni]
				if POP_PER.has(bt):       load += int(POP_PER[bt] / 4)
				elif JOBS_C_PER.has(bt):  load += int(JOBS_C_PER[bt] / 3)
				elif JOBS_I_PER.has(bt):  load += int(JOBS_I_PER[bt] / 3)
			# Rail carries more per lane than road — scale it down so it looks
			# like a relief valve in a mixed network.
			if n == Net.RAIL:
				load = int(load * 0.4)
			traffic[i] = clampi(int(load / 4), 0, 255)


func _compute_fire_risk() -> void:
	for y in range(height):
		for x in range(width):
			var i := idx(x, y)
			var bt: int = building_type[i]
			var base := 0
			match bt:
				Building.R_L1, Building.C_L1, Building.I_L1: base = 8
				Building.R_L2, Building.C_L2, Building.I_L2: base = 14
				Building.R_L3, Building.C_L3, Building.I_L3: base = 22
				Building.COAL: base = 30
				Building.NUKE: base = 50
			var mitigation: int = fire_cov[i] / 2
			fire_risk[i] = clampi(base - mitigation, 0, 255)


# --- stochastic fires ---------------------------------------------

func _fire_events(rng: RandomNumberGenerator) -> void:
	for y in range(height):
		for x in range(width):
			var i := idx(x, y)
			var bt: int = building_type[i]
			if bt == Building.NONE: continue
			# Only root-cell (sub=0) rolls; fire consumes the whole footprint.
			if building_sub[i] != 0: continue
			var risk := fire_risk[i]
			if risk <= 0: continue
			# Base annual ~0.5% per point of risk.
			if rng.randf() < risk / 60000.0:
				_burn_building(x, y, bt, building_sub[i])
				advisor_message.emit(
						"Fire at (%d, %d) — a building was lost." % [x, y],
						SEVERITY_ALERT)


func trigger_tornado(rng: RandomNumberGenerator) -> void:
	"""Walk a 30-60 cell streak from a random seed in a random diagonal direction,
	clearing everything the tornado crosses and leaving rubble."""
	begin_batch()
	var x := rng.randi_range(0, width - 1)
	var y := rng.randi_range(0, height - 1)
	var sx := x
	var sy := y
	var angle := rng.randf() * TAU
	var dx := cos(angle)
	var dy := sin(angle)
	var steps := rng.randi_range(30, 60)
	var px := float(x)
	var py := float(y)
	for _i in range(steps):
		px += dx
		py += dy
		var cx := int(roundf(px)) + rng.randi_range(-1, 1)
		var cy := int(roundf(py)) + rng.randi_range(-1, 1)
		if in_bounds(cx, cy):
			_wreck_cell(cx, cy)
	end_batch()
	advisor_message.emit("Tornado carved a path near (%d, %d)!" % [sx, sy], SEVERITY_ALERT)


func trigger_earthquake(rng: RandomNumberGenerator) -> void:
	"""Clear 20 random cells as rubble."""
	begin_batch()
	for _i in range(20):
		var x := rng.randi_range(0, width - 1)
		var y := rng.randi_range(0, height - 1)
		_wreck_cell(x, y)
	end_batch()
	advisor_message.emit("Earthquake — 20 cells wrecked!", SEVERITY_ALERT)


func trigger_flood(rng: RandomNumberGenerator) -> void:
	"""Find a random water tile and flood up to 30 nearby land cells with water."""
	var water_cells: Array[int] = []
	for i in range(terrain.size()):
		if terrain[i] == Terrain.WATER:
			water_cells.append(i)
	if water_cells.is_empty():
		advisor_message.emit("Flood warning dispersed — no water on the map.", SEVERITY_INFO)
		return
	var seed_idx: int = water_cells[rng.randi() % water_cells.size()]
	var sx := seed_idx % width
	var sy := int(seed_idx / width)
	begin_batch()
	var queue: Array[Vector2i] = [Vector2i(sx, sy)]
	var visited: Dictionary = {}
	var flooded := 0
	var limit := rng.randi_range(20, 35)
	while queue.size() > 0 and flooded < limit:
		var c: Vector2i = queue.pop_front()
		if c in visited: continue
		visited[c] = true
		if not in_bounds(c.x, c.y): continue
		var i := idx(c.x, c.y)
		if terrain[i] != Terrain.WATER:
			terrain[i] = Terrain.WATER
			building_type[i] = Building.NONE
			building_sub[i] = 0
			zone[i] = Zone.NONE
			network[i] = Net.NONE
			power_line[i] = 0
			water_pipe[i] = 0
			sewer_pipe[i] = 0
			mark_dirty_neighbors(c.x, c.y)
			flooded += 1
		for off in NEIGHBOURS:
			queue.append(Vector2i(c.x + off.x, c.y + off.y))
	end_batch()
	advisor_message.emit("Flood at (%d, %d) — %d cells swamped." % [sx, sy, flooded], SEVERITY_ALERT)


func _wreck_cell(x: int, y: int) -> void:
	var i := idx(x, y)
	var bt: int = building_type[i]
	if bt != Building.NONE:
		_burn_building(x, y, bt, building_sub[i])
	network[i] = Net.NONE
	zone[i] = Zone.NONE
	power_line[i] = 0
	water_pipe[i] = 0
	sewer_pipe[i] = 0
	terrain[i] = Terrain.RUBBLE
	mark_dirty_neighbors(x, y)


func _burn_building(x: int, y: int, kind: int, sub: int) -> void:
	var fp: Vector2i = FOOTPRINT[kind]
	var sub_col := sub % fp.x
	var sub_row := int(sub / fp.x)
	var tx := x - sub_col
	var ty := y - sub_row
	for dy in range(fp.y):
		for dx in range(fp.x):
			var nx := tx + dx
			var ny := ty + dy
			if in_bounds(nx, ny):
				var i := idx(nx, ny)
				building_type[i] = Building.NONE
				building_sub[i] = 0
				zone[i] = Zone.NONE
				terrain[i] = Terrain.RUBBLE
				mark_dirty(nx, ny)


# --- population / jobs --------------------------------------------

const POP_PER: Dictionary = {
	Building.R_L1: 8,
	Building.R_L2: 40,
	Building.R_L3: 200,
	Building.ARCO_PLYMOUTH: 2500,
	Building.ARCO_FOREST:   3000,
	Building.ARCO_DARCO:    4000,
	Building.ARCO_LAUNCH:   5000,
}
const JOBS_C_PER: Dictionary = {
	Building.C_L1: 4,
	Building.C_L2: 20,
	Building.C_L3: 100,
}
const JOBS_I_PER: Dictionary = {
	Building.I_L1: 6,
	Building.I_L2: 30,
	Building.I_L3: 150,
}

func _count_pop_and_jobs() -> void:
	var pop := 0
	var jc := 0
	var ji := 0
	for i in range(building_type.size()):
		if building_sub[i] != 0: continue  # count once per structure
		var bt: int = building_type[i]
		if POP_PER.has(bt): pop += POP_PER[bt]
		elif JOBS_C_PER.has(bt): jc += JOBS_C_PER[bt]
		elif JOBS_I_PER.has(bt): ji += JOBS_I_PER[bt]
	population = pop
	jobs_c = jc
	jobs_i = ji


# --- RCI demand ---------------------------------------------------

func _update_demand() -> void:
	# Baselines keep a fresh city from idling at 0 demand; the balance terms
	# then push demand around as the population and jobs ratio evolves.
	var total_jobs := jobs_c + jobs_i
	demand_r = clampf(0.5 + (total_jobs - population) / 300.0, -1.0, 1.0)
	demand_c = clampf(0.2 + (population * 0.5 - jobs_c) / 150.0, -1.0, 1.0)
	demand_i = clampf(0.3 + (population * 0.3 - jobs_i) / 150.0, -1.0, 1.0)


# --- growth / decay -----------------------------------------------

func _grow_decay(rng: RandomNumberGenerator) -> void:
	for y in range(height):
		for x in range(width):
			var i := idx(x, y)
			var z: int = zone[i]
			var bt: int = building_type[i]
			# Empty zone cells aren't themselves in the power BFS (which flows
			# through buildings and power lines). Accept a powered neighbour as
			# "within the grid" so a zone next to a plant or power line grows.
			var powered_here := powered[i] == 1 or _any_powered_neighbor(x, y)

			# Decay first: buildings lose tier without support.
			if bt != Building.NONE and building_sub[i] == 0:
				if _is_zoned_building(bt):
					if not powered_here or not _any_transit_near_footprint(x, y, bt):
						if rng.randf() < 0.05:
							_demote(x, y, bt)
							continue
					# L2+ needs water; L3 needs sewer.
					if _tier_of_building(bt) >= 2 and watered[i] == 0 and rng.randf() < 0.08:
						_demote(x, y, bt)
						continue
					if _tier_of_building(bt) == 3 and sewered[i] == 0 and rng.randf() < 0.05:
						_demote(x, y, bt)
						continue
					if pollution[i] > 200 and _is_residential(bt) and rng.randf() < 0.03:
						_demote(x, y, bt)
						continue
					# Promote if demand + value + room + utilities.
					_try_promote(x, y, bt, rng)
				continue

			# Empty zoned cell -> try L1.
			if z == Zone.NONE or bt != Building.NONE: continue
			if not powered_here: continue
			if not _adjacent_to_transit(x, y): continue
			if land_value[i] < 32: continue
			var demand := _demand_for_zone(z)
			if demand < -0.2: continue
			var p: float = 0.1 + 0.2 * demand * (land_value[i] / 255.0)
			if rng.randf() < p:
				building_type[i] = _l1_for_zone(z)
				building_sub[i] = 0
				mark_dirty(x, y)


func _is_zoned_building(bt: int) -> bool:
	return bt in [
		Building.R_L1, Building.R_L2, Building.R_L3,
		Building.C_L1, Building.C_L2, Building.C_L3,
		Building.I_L1, Building.I_L2, Building.I_L3,
	]


func _is_residential(bt: int) -> bool:
	return bt == Building.R_L1 or bt == Building.R_L2 or bt == Building.R_L3


func _zone_of_building(bt: int) -> int:
	match bt:
		Building.R_L1, Building.R_L2, Building.R_L3: return Zone.R
		Building.C_L1, Building.C_L2, Building.C_L3: return Zone.C
		Building.I_L1, Building.I_L2, Building.I_L3: return Zone.I
	return Zone.NONE


func _l1_for_zone(z: int) -> int:
	match z:
		Zone.R: return Building.R_L1
		Zone.C: return Building.C_L1
		Zone.I: return Building.I_L1
	return Building.NONE


func _l2_for_zone(z: int) -> int:
	match z:
		Zone.R: return Building.R_L2
		Zone.C: return Building.C_L2
		Zone.I: return Building.I_L2
	return Building.NONE


func _l3_for_zone(z: int) -> int:
	match z:
		Zone.R: return Building.R_L3
		Zone.C: return Building.C_L3
		Zone.I: return Building.I_L3
	return Building.NONE


func _demand_for_zone(z: int) -> float:
	match z:
		Zone.R: return demand_r
		Zone.C: return demand_c
		Zone.I: return demand_i
	return 0.0


func _try_promote(x: int, y: int, bt: int, rng: RandomNumberGenerator) -> void:
	var z := _zone_of_building(bt)
	if z == Zone.NONE: return
	var demand := _demand_for_zone(z)
	if demand < 0.0: return
	var i := idx(x, y)
	var lv := land_value[i]
	# L1 -> L2  (needs water)
	if bt in [Building.R_L1, Building.C_L1, Building.I_L1]:
		if lv < 96: return
		if watered[i] == 0: return
		var p: float = 0.01 + 0.04 * demand * (lv / 255.0)
		if rng.randf() > p: return
		var tl := _find_free_footprint_for_promotion(x, y, 2, z)
		if tl.x == -1: return
		_clear_cells_for_growth(tl.x, tl.y, 2, 2)
		_place_building_free(tl.x, tl.y, _l2_for_zone(z))
		return
	# L2 -> L3  (needs water + sewer)
	if bt in [Building.R_L2, Building.C_L2, Building.I_L2]:
		if lv < 160: return
		if watered[i] == 0 or sewered[i] == 0: return
		var p2: float = 0.005 + 0.02 * demand * (lv / 255.0)
		if rng.randf() > p2: return
		var tl2 := _find_free_footprint_for_promotion(x, y, 3, z)
		if tl2.x == -1: return
		_clear_cells_for_growth(tl2.x, tl2.y, 3, 3)
		_place_building_free(tl2.x, tl2.y, _l3_for_zone(z))


func _tier_of_building(bt: int) -> int:
	match bt:
		Building.R_L1, Building.C_L1, Building.I_L1: return 1
		Building.R_L2, Building.C_L2, Building.I_L2: return 2
		Building.R_L3, Building.C_L3, Building.I_L3: return 3
	return 0


func _find_free_footprint_for_promotion(x: int, y: int, size: int, z: int) -> Vector2i:
	"""Find a top-left such that the size×size block contains (x,y), has no water,
	no network, all cells are zoned `z` or already part of an L(size-1) of `z`.
	"""
	for dy in range(size):
		for dx in range(size):
			var tx := x - dx
			var ty := y - dy
			if not _cells_promotable(tx, ty, size, z):
				continue
			return Vector2i(tx, ty)
	return Vector2i(-1, -1)


func _cells_promotable(tx: int, ty: int, size: int, z: int) -> bool:
	for dy in range(size):
		for dx in range(size):
			var nx := tx + dx
			var ny := ty + dy
			if not in_bounds(nx, ny): return false
			var i := idx(nx, ny)
			if terrain[i] == Terrain.WATER: return false
			if network[i] != Net.NONE: return false
			# Either empty zoned `z` OR already part of an R/C/I building of `z`.
			var bt: int = building_type[i]
			if bt == Building.NONE:
				if zone[i] != z: return false
			else:
				if _zone_of_building(bt) != z: return false
	return true


func _clear_cells_for_growth(tx: int, ty: int, cols: int, rows: int) -> void:
	for dy in range(rows):
		for dx in range(cols):
			var i := idx(tx + dx, ty + dy)
			building_type[i] = Building.NONE
			building_sub[i] = 0
			mark_dirty(tx + dx, ty + dy)


func _demote(x: int, y: int, bt: int) -> void:
	var z := _zone_of_building(bt)
	var fp: Vector2i = FOOTPRINT[bt]
	# Clear footprint, then drop a lower tier at (x, y) if possible.
	for dy in range(fp.y):
		for dx in range(fp.x):
			var i := idx(x + dx, y + dy)
			building_type[i] = Building.NONE
			building_sub[i] = 0
			zone[i] = z
			mark_dirty(x + dx, y + dy)
	# Drop to next tier down at TL if L2/L3; L1 just vacates.
	match bt:
		Building.R_L3, Building.C_L3, Building.I_L3:
			_place_building_free(x, y, _l2_for_zone(z))
		Building.R_L2, Building.C_L2, Building.I_L2:
			building_type[idx(x, y)] = _l1_for_zone(z)
			building_sub[idx(x, y)] = 0


func _adjacent_to_transit(x: int, y: int) -> bool:
	for off in NEIGHBOURS:
		var nx := x + off.x
		var ny := y + off.y
		if not in_bounds(nx, ny): continue
		var n: int = network[idx(nx, ny)]
		if n == Net.ROAD or n == Net.RAIL:
			return true
	return false


func _any_powered_neighbor(x: int, y: int) -> bool:
	for off in NEIGHBOURS:
		var nx := x + off.x
		var ny := y + off.y
		if in_bounds(nx, ny) and powered[idx(nx, ny)] == 1:
			return true
	return false


func _any_transit_near_footprint(x: int, y: int, bt: int) -> bool:
	var fp: Vector2i = FOOTPRINT[bt]
	for dy in range(fp.y):
		for dx in range(fp.x):
			if _adjacent_to_transit(x + dx, y + dy):
				return true
	return false


# --- economy / calendar -------------------------------------------

func _advance_month() -> void:
	# Monthly tax revenue (tax_rate is per-citizen-per-month, user-tunable).
	var revenue: int = int(population * tax_rate)
	funds += revenue
	# Upkeep: count networks + structures once per root cell, then apply rates.
	var road_tiles := 0
	var rail_tiles := 0
	for i in range(network.size()):
		if network[i] == Net.ROAD: road_tiles += 1
		elif network[i] == Net.RAIL: rail_tiles += 1
	funds -= int(road_tiles * UPKEEP_ROAD_PER_TILE)
	funds -= int(rail_tiles * UPKEEP_RAIL_PER_TILE)
	var counts: Dictionary = {}
	for i in range(building_type.size()):
		if building_sub[i] != 0: continue
		var bt: int = building_type[i]
		if bt == Building.NONE: continue
		counts[bt] = counts.get(bt, 0) + 1
	var upkeep_table: Dictionary = {
		Building.POLICE:        UPKEEP_POLICE,
		Building.FIRE:          UPKEEP_FIRE,
		Building.PARK:          UPKEEP_PARK,
		Building.COAL:          UPKEEP_COAL,
		Building.NUKE:          UPKEEP_NUKE,
		Building.WIND:          UPKEEP_WIND,
		Building.HYDRO:         UPKEEP_HYDRO,
		Building.WATER_TOWER:   UPKEEP_WATER_TOWER,
		Building.WATER_PUMP:    UPKEEP_WATER_PUMP,
		Building.SEWER_PLANT:   UPKEEP_SEWER_PLANT,
		Building.SOLAR:         UPKEEP_SOLAR,
		Building.GAS:           UPKEEP_GAS,
		Building.OIL:           UPKEEP_OIL,
		Building.MICROWAVE:     UPKEEP_MICROWAVE,
		Building.FUSION:        UPKEEP_FUSION,
		Building.ARCO_PLYMOUTH: UPKEEP_ARCO,
		Building.ARCO_FOREST:   UPKEEP_ARCO,
		Building.ARCO_DARCO:    UPKEEP_ARCO,
		Building.ARCO_LAUNCH:   UPKEEP_ARCO,
	}
	for bt in counts:
		if upkeep_table.has(bt):
			funds -= counts[bt] * upkeep_table[bt]

	month += 1
	if month >= 12:
		month = 0
		year += 1

	# Append to rolling history.
	_push_history(pop_history, population)
	_push_history(funds_history, funds)
	_push_history_byte(pollution_history, _byte_mean(pollution))
	_push_history_byte(crime_history, _byte_mean(crime))

	# Advisory messages.
	if funds < 0 and not _funds_warned:
		_funds_warned = true
		advisor_message.emit("Funds below zero — raise taxes or bulldoze upkeep.", SEVERITY_WARN)
	elif funds >= 500:
		_funds_warned = false

	for threshold in [100, 1000, 10000, 100000]:
		if population >= threshold and _last_pop_milestone < threshold:
			_last_pop_milestone = threshold
			advisor_message.emit("Population reached %d!" % threshold, SEVERITY_INFO)


func _push_history(buf: PackedInt32Array, value: int) -> void:
	buf.append(value)
	while buf.size() > HISTORY_CAP:
		buf.remove_at(0)


func _push_history_byte(buf: PackedByteArray, value: int) -> void:
	buf.append(clampi(value, 0, 255))
	while buf.size() > HISTORY_CAP:
		buf.remove_at(0)


func _byte_mean(arr: PackedByteArray) -> int:
	if arr.size() == 0: return 0
	var s := 0
	for v in arr: s += v
	return int(s / arr.size())


# ---------- render queries ----------

func network_bitmask(x: int, y: int, kind: int) -> int:
	var m := 0
	for di in range(4):
		var nx := x + NEIGHBOURS[di].x
		var ny := y + NEIGHBOURS[di].y
		if in_bounds(nx, ny) and network[idx(nx, ny)] == kind:
			m |= BITS[di]
	return m


func water_bitmask(x: int, y: int) -> int:
	var m := 0
	for di in range(4):
		var nx := x + NEIGHBOURS[di].x
		var ny := y + NEIGHBOURS[di].y
		if in_bounds(nx, ny) and terrain[idx(nx, ny)] == Terrain.WATER:
			m |= BITS[di]
	return m
