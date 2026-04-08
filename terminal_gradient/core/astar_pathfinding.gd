class_name AStarGrid
extends RefCounted
## A* pathfinding with 8-directional movement.
## Exact port of js/utils.js AStar.

const SQRT2 := 1.4142135623730951

# 8 movement directions: cardinals then diagonals
const DIRS: Array = [
	{ "dx": 0, "dy": -1, "cost": 1.0 },
	{ "dx": 1, "dy": 0, "cost": 1.0 },
	{ "dx": 0, "dy": 1, "cost": 1.0 },
	{ "dx": -1, "dy": 0, "cost": 1.0 },
	{ "dx": 1, "dy": -1, "cost": SQRT2 },
	{ "dx": 1, "dy": 1, "cost": SQRT2 },
	{ "dx": -1, "dy": 1, "cost": SQRT2 },
	{ "dx": -1, "dy": -1, "cost": SQRT2 },
]


static func find_path(start_x: int, start_y: int, end_x: int, end_y: int, is_walkable: Callable, max_steps: int = 1000) -> Array[Vector2i]:
	var g_score := {}
	var came_from := {}
	var closed := {}

	var start_key := "%d,%d" % [start_x, start_y]
	var end_key := "%d,%d" % [end_x, end_y]
	g_score[start_key] = 0.0

	# Open set as array sorted by f-score (simple approach; binary heap if perf needed)
	var open: Array = [{
		"x": start_x,
		"y": start_y,
		"f": _heuristic(start_x, start_y, end_x, end_y),
	}]

	var steps := 0

	while open.size() > 0 and steps < max_steps:
		steps += 1
		# Find lowest f-score
		var best_idx := 0
		for i in range(1, open.size()):
			if open[i].f < open[best_idx].f:
				best_idx = i
		var current: Dictionary = open[best_idx]
		open.remove_at(best_idx)

		var cur_key := "%d,%d" % [current.x, current.y]
		if cur_key == end_key:
			# Reconstruct path
			var path: Array[Vector2i] = []
			var k: Variant = end_key
			while k != null:
				var parts: PackedStringArray = k.split(",")
				path.append(Vector2i(parts[0].to_int(), parts[1].to_int()))
				k = came_from.get(k)
			path.reverse()
			return path

		if closed.has(cur_key):
			continue
		closed[cur_key] = true

		var current_g: float = g_score[cur_key]

		for dir in DIRS:
			var nx: int = current.x + dir.dx
			var ny: int = current.y + dir.dy
			var n_key := "%d,%d" % [nx, ny]

			if closed.has(n_key):
				continue
			if not is_walkable.call(nx, ny):
				continue

			var tentative_g: float = current_g + dir.cost
			var prev_g: Variant = g_score.get(n_key)

			if prev_g == null or tentative_g < prev_g:
				g_score[n_key] = tentative_g
				came_from[n_key] = cur_key
				open.append({
					"x": nx,
					"y": ny,
					"f": tentative_g + _heuristic(nx, ny, end_x, end_y),
				})

	return []  # No path found


static func _heuristic(x: int, y: int, end_x: int, end_y: int) -> float:
	var dx := abs(x - end_x)
	var dy := abs(y - end_y)
	return float(dx + dy) + (SQRT2 - 2.0) * float(min(dx, dy))
