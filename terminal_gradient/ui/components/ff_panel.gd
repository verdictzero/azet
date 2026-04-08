class_name FFPanel
extends RefCounted
## FF-style bordered panel with rounded corners.
## Draws to the AsciiGrid text buffer.

static func draw(grid: AsciiGrid, x: int, y: int, w: int, h: int,
		fg: Color = Constants.COLORS.FF_BORDER, bg: Color = Constants.COLORS.FF_BLUE_BG) -> void:
	grid.draw_box(x, y, w, h, fg, bg)


static func draw_double_border(grid: AsciiGrid, x: int, y: int, w: int, h: int,
		fg: Color = Constants.COLORS.FF_BORDER, bg: Color = Constants.COLORS.BLACK) -> void:
	## Draw a double-line bordered box (used for title screen).
	if w < 2 or h < 2:
		return
	# Double-line box drawing characters
	const TL := "╔"
	const TR := "╗"
	const BL := "╚"
	const BR := "╝"
	const H := "═"
	const V := "║"

	grid.set_char(x, y, TL, fg, bg)
	grid.set_char(x + w - 1, y, TR, fg, bg)
	grid.set_char(x, y + h - 1, BL, fg, bg)
	grid.set_char(x + w - 1, y + h - 1, BR, fg, bg)

	for c in range(x + 1, x + w - 1):
		grid.set_char(c, y, H, fg, bg)
		grid.set_char(c, y + h - 1, H, fg, bg)

	for r in range(y + 1, y + h - 1):
		grid.set_char(x, r, V, fg, bg)
		grid.set_char(x + w - 1, r, V, fg, bg)

	# Fill interior
	for r in range(y + 1, y + h - 1):
		for c in range(x + 1, x + w - 1):
			grid.set_char(c, r, " ", fg, bg)
