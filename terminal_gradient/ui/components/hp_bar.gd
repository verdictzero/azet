class_name HPBar
extends RefCounted
## Colored progress bar for HP/MP display.

static func draw(grid: AsciiGrid, x: int, y: int, width: int,
		current: int, maximum: int, fill_color: Color, empty_color: Color = Constants.COLORS.BRIGHT_BLACK,
		bg: Color = Constants.COLORS.BLACK) -> void:
	if maximum <= 0 or width <= 0:
		return
	var fill_count: int = int(float(current) / float(maximum) * float(width))
	fill_count = clampi(fill_count, 0, width)

	for i in range(width):
		if i < fill_count:
			grid.set_char(x + i, y, "█", fill_color, bg)
		else:
			grid.set_char(x + i, y, "░", empty_color, bg)


static func get_hp_color(current: int, maximum: int) -> Color:
	## Returns color based on HP percentage: red < 25%, yellow < 50%, green otherwise.
	if maximum <= 0:
		return Constants.COLORS.RED
	var pct: float = float(current) / float(maximum)
	if pct < 0.25:
		return Constants.COLORS.BRIGHT_RED
	elif pct < 0.5:
		return Constants.COLORS.BRIGHT_YELLOW
	else:
		return Constants.COLORS.BRIGHT_GREEN
