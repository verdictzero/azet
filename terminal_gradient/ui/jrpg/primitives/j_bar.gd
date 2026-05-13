@tool
class_name JBar
extends Control
## Outlined progress bar. Three fill styles per the JRPG kit:
##   HP — solid white
##   MP — 45° white-on-black stripes (2px on / 2px off)
##   XP — 0° (vertical) stripes, same cadence
##
## Set value/max_value to drive the fill width. show_exclaim renders a "!"
## at the right edge when full (used by the battle Time bar).

enum Kind { HP, MP, XP }

@export var kind: Kind = Kind.HP:
	set(v):
		kind = v
		queue_redraw()
@export_range(0.0, 1.0e6) var max_value: float = 100.0:
	set(v):
		max_value = max(v, 0.0001)
		queue_redraw()
@export var value: float = 100.0:
	set(v):
		value = clamp(v, 0.0, max_value)
		queue_redraw()
@export var show_exclaim_when_full: bool = false:
	set(v):
		show_exclaim_when_full = v
		queue_redraw()

const FRAME_W := 2.0
const STRIPE_PERIOD := 4.0  # 2px on + 2px off


func _ready() -> void:
	if custom_minimum_size == Vector2.ZERO:
		custom_minimum_size = Vector2(70, 10)


func _draw() -> void:
	var rect := Rect2(Vector2.ZERO, size)
	# Outer black ring lives just outside the rect — Godot draws border lines
	# inside the rect, so we offset and overdraw to get the white-on-black
	# 2px combination described in the spec.
	draw_rect(rect.grow(FRAME_W), Color(0, 0, 0, 1), true)
	draw_rect(rect, Color(1, 1, 1, 1), false, FRAME_W)
	var inner := rect.grow(-FRAME_W)
	draw_rect(inner, Color(0.0392, 0.0392, 0.0392, 1), true)

	var fill_ratio: float = clamp(value / max_value, 0.0, 1.0)
	if fill_ratio <= 0.0:
		return
	var fill_rect := Rect2(inner.position, Vector2(inner.size.x * fill_ratio, inner.size.y))
	_draw_fill(fill_rect)

	if show_exclaim_when_full and fill_ratio >= 1.0:
		var font := get_theme_default_font()
		var fs: int = max(8, int(size.y) - 1)
		var glyph := "!"
		var gw: float = font.get_string_size(glyph, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var pos := Vector2(rect.size.x - gw - 2.0, (size.y + fs) * 0.5 - 2.0)
		draw_string(font, pos, glyph, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(0, 0, 0, 1))


func _draw_fill(fill_rect: Rect2) -> void:
	match kind:
		Kind.HP:
			draw_rect(fill_rect, Color(1, 1, 1, 1), true)
		Kind.MP:
			_draw_diagonal_stripes(fill_rect)
		Kind.XP:
			_draw_vertical_stripes(fill_rect)


func _draw_diagonal_stripes(r: Rect2) -> void:
	# Approximates a 45° "2px on / 2px off" repeating pattern by drawing
	# diagonal line segments stepped across the fill width.
	draw_rect(r, Color(0.0392, 0.0392, 0.0392, 1), true)
	var span: float = r.size.x + r.size.y
	var x: float = -r.size.y
	while x < r.size.x:
		var p1 := Vector2(r.position.x + x, r.position.y + r.size.y)
		var p2 := Vector2(r.position.x + x + r.size.y, r.position.y)
		# Clip endpoints against the fill rect.
		var clipped := _clip_segment(p1, p2, r)
		if clipped.size() == 2:
			draw_line(clipped[0], clipped[1], Color(1, 1, 1, 1), 2.0, false)
		x += STRIPE_PERIOD


func _draw_vertical_stripes(r: Rect2) -> void:
	draw_rect(r, Color(0.0392, 0.0392, 0.0392, 1), true)
	var x: float = r.position.x
	while x < r.position.x + r.size.x:
		var stripe := Rect2(Vector2(x, r.position.y), Vector2(2.0, r.size.y))
		stripe = stripe.intersection(r)
		if stripe.size.x > 0.0 and stripe.size.y > 0.0:
			draw_rect(stripe, Color(1, 1, 1, 1), true)
		x += STRIPE_PERIOD


func _clip_segment(p1: Vector2, p2: Vector2, r: Rect2) -> Array:
	# Cohen-Sutherland-style clipping against r. Returns [] or [start, end].
	var x_min: float = r.position.x
	var x_max: float = r.position.x + r.size.x
	var y_min: float = r.position.y
	var y_max: float = r.position.y + r.size.y

	var dx: float = p2.x - p1.x
	var dy: float = p2.y - p1.y
	var t0: float = 0.0
	var t1: float = 1.0

	var ps: Array = [-dx, dx, -dy, dy]
	var qs: Array = [p1.x - x_min, x_max - p1.x, p1.y - y_min, y_max - p1.y]
	for i in 4:
		var p: float = ps[i]
		var q: float = qs[i]
		if p == 0.0:
			if q < 0.0:
				return []
			continue
		var t: float = q / p
		if p < 0.0:
			t0 = max(t0, t)
		else:
			t1 = min(t1, t)
	if t0 > t1:
		return []
	var c1 := Vector2(p1.x + t0 * dx, p1.y + t0 * dy)
	var c2 := Vector2(p1.x + t1 * dx, p1.y + t1 * dy)
	return [c1, c2]
