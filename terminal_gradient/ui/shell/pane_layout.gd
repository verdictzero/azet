class_name PaneLayout
extends RefCounted
## Static factories for normalized 0..1 viewport pane rectangles.
##
## Layouts are plain Array[Rect2] data — every factory just returns rects.
## To add a new layout, write a new function or build the array directly.

static func single() -> Array[Rect2]:
	return [Rect2(0.0, 0.0, 1.0, 1.0)]


static func split_lr(left_ratio: float = 0.5) -> Array[Rect2]:
	left_ratio = clampf(left_ratio, 0.05, 0.95)
	return [
		Rect2(0.0, 0.0, left_ratio, 1.0),
		Rect2(left_ratio, 0.0, 1.0 - left_ratio, 1.0),
	]


static func split_tb(top_ratio: float = 0.5) -> Array[Rect2]:
	top_ratio = clampf(top_ratio, 0.05, 0.95)
	return [
		Rect2(0.0, 0.0, 1.0, top_ratio),
		Rect2(0.0, top_ratio, 1.0, 1.0 - top_ratio),
	]


static func grid(cols: int, rows: int) -> Array[Rect2]:
	## Uniform `cols x rows` grid covering the full viewport.
	cols = maxi(1, cols)
	rows = maxi(1, rows)
	var result: Array[Rect2] = []
	var cw: float = 1.0 / float(cols)
	var rh: float = 1.0 / float(rows)
	for r in range(rows):
		for c in range(cols):
			result.append(Rect2(float(c) * cw, float(r) * rh, cw, rh))
	return result


static func compose(rects: Array[Rect2]) -> Array[Rect2]:
	## Identity helper — explicit entry point for ad-hoc / mixed layouts so
	## callers can write `PaneLayout.compose([...])` for clarity.
	var out: Array[Rect2] = []
	for r in rects:
		out.append(r)
	return out


static func inset(layout: Array[Rect2], host: Rect2) -> Array[Rect2]:
	## Reproject a 0..1 normalized layout into a sub-rectangle of the
	## viewport. Useful for nested layouts (e.g. running a 2x2 inside the
	## right pane of a split_lr).
	var out: Array[Rect2] = []
	for r in layout:
		out.append(Rect2(
			host.position.x + r.position.x * host.size.x,
			host.position.y + r.position.y * host.size.y,
			r.size.x * host.size.x,
			r.size.y * host.size.y,
		))
	return out
