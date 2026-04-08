class_name MathUtils
extends RefCounted
## Math utility functions ported from js/utils.js.


static func distance(x1: float, y1: float, x2: float, y2: float) -> float:
	var dx := x2 - x1
	var dy := y2 - y1
	return sqrt(dx * dx + dy * dy)


static func manhattan_dist(x1: int, y1: int, x2: int, y2: int) -> int:
	return abs(x2 - x1) + abs(y2 - y1)


static func bresenham_line(x1: int, y1: int, x2: int, y2: int) -> Array[Vector2i]:
	var points: Array[Vector2i] = []
	var dx: int = abs(x2 - x1)
	var dy: int = abs(y2 - y1)
	var sx := 1 if x1 < x2 else -1
	var sy := 1 if y1 < y2 else -1
	var err: int = dx - dy
	var x := x1
	var y := y1

	while true:
		points.append(Vector2i(x, y))
		if x == x2 and y == y2:
			break
		var e2: int = 2 * err
		if e2 > -dy:
			err -= dy
			x += sx
		if e2 < dx:
			err += dx
			y += sy

	return points


static func flood_fill(start_x: int, start_y: int, is_valid: Callable, max_size: int = 1000) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var visited := {}
	var stack: Array[Vector2i] = [Vector2i(start_x, start_y)]

	while stack.size() > 0 and result.size() < max_size:
		var pos: Vector2i = stack.pop_back()
		var key := "%d,%d" % [pos.x, pos.y]
		if visited.has(key):
			continue
		if not is_valid.call(pos.x, pos.y):
			continue
		visited[key] = true
		result.append(pos)
		stack.append(Vector2i(pos.x + 1, pos.y))
		stack.append(Vector2i(pos.x - 1, pos.y))
		stack.append(Vector2i(pos.x, pos.y + 1))
		stack.append(Vector2i(pos.x, pos.y - 1))

	return result


static func rect_intersects(r1: Rect2i, r2: Rect2i) -> bool:
	return r1.position.x < r2.position.x + r2.size.x \
		and r1.position.x + r1.size.x > r2.position.x \
		and r1.position.y < r2.position.y + r2.size.y \
		and r1.position.y + r1.size.y > r2.position.y
