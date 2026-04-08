class_name CellularNoise
extends RefCounted
## Worley/Voronoi noise for smooth contiguous regions.
## Exact port of js/utils.js CellularNoise.

var _density: float
var _seed_x: int
var _seed_y: int
var _seed_id: int


func _init(rng: SeededRNG, density: float = 1.0) -> void:
	_density = density
	_seed_x = int(floor(rng.next_f() * 2147483647.0))
	_seed_y = int(floor(rng.next_f() * 2147483647.0))
	_seed_id = int(floor(rng.next_f() * 2147483647.0))


func _hash(ix: int, iy: int, seed_val: int) -> float:
	# Mask inputs to 32-bit before multiply to prevent 64-bit overflow divergence
	var h: int = ((ix & 0xFFFFFFFF) * 374761393 + (iy & 0xFFFFFFFF) * 668265263 + seed_val) & 0xFFFFFFFF
	h = SeededRNG._imul(h ^ SeededRNG._ushr(h, 13), 1274126177)
	h = h ^ SeededRNG._ushr(h, 16)
	return float(SeededRNG._to_unsigned(h)) / 4294967296.0


func noise_2d(x: float, y: float) -> Dictionary:
	## Returns { f1, f2, edge, cell_id, cell_x, cell_y }.
	var sx: float = x * _density
	var sy: float = y * _density
	var ix: int = int(floor(sx))
	var iy: int = int(floor(sy))

	var min_dist1: float = 999.0
	var min_dist2: float = 999.0
	var nearest_cx: int = 0
	var nearest_cy: int = 0

	# Check 3x3 neighborhood
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var cx: int = ix + dx
			var cy: int = iy + dy
			var px: float = float(cx) + _hash(cx, cy, _seed_x)
			var py: float = float(cy) + _hash(cx, cy, _seed_y)
			var ddx: float = sx - px
			var ddy: float = sy - py
			var dist: float = sqrt(ddx * ddx + ddy * ddy)
			if dist < min_dist1:
				min_dist2 = min_dist1
				min_dist1 = dist
				nearest_cx = cx
				nearest_cy = cy
			elif dist < min_dist2:
				min_dist2 = dist

	var cell_id: float = _hash(nearest_cx, nearest_cy, _seed_id)

	return {
		"f1": min_dist1,
		"f2": min_dist2,
		"edge": min_dist2 - min_dist1,
		"cell_id": cell_id,
		"cell_x": nearest_cx,
		"cell_y": nearest_cy,
	}


func fbm_cell(x: float, y: float, scale: float = 1.0, octaves: int = 2) -> Dictionary:
	var result: Dictionary = noise_2d(x * scale, y * scale)
	if octaves <= 1:
		return result
	var detail_edge: float = 0.0
	var amp: float = 0.5
	for i in range(1, octaves):
		var s: float = scale * pow(2.0, float(i))
		var detail: Dictionary = noise_2d(x * s, y * s)
		detail_edge += detail.edge * amp
		amp *= 0.5
	result.edge = result.edge * 0.7 + detail_edge * 0.3
	return result
