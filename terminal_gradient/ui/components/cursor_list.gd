class_name CursorList
extends RefCounted
## Scrollable list with cursor indicator for menu selection.

var selected_index: int = 0
var scroll_offset: int = 0
var items: Array[String] = []
var visible_count: int = 10


func set_items(new_items: Array[String]) -> void:
	items = new_items
	selected_index = clampi(selected_index, 0, maxi(0, items.size() - 1))
	_clamp_scroll()


func move_up() -> void:
	if items.is_empty():
		return
	selected_index = (selected_index - 1 + items.size()) % items.size()
	_clamp_scroll()


func move_down() -> void:
	if items.is_empty():
		return
	selected_index = (selected_index + 1) % items.size()
	_clamp_scroll()


func get_selected() -> String:
	if items.is_empty():
		return ""
	return items[selected_index]


func draw(grid: AsciiGrid, x: int, y: int, width: int,
		fg: Color = Constants.COLORS.BRIGHT_WHITE,
		selected_fg: Color = Constants.COLORS.BRIGHT_WHITE,
		selected_bg: Color = Constants.COLORS.FF_BLUE_DARK) -> void:
	var end_idx: int = mini(scroll_offset + visible_count, items.size())
	for i in range(scroll_offset, end_idx):
		var row: int = y + (i - scroll_offset)
		var is_selected: bool = (i == selected_index)
		var item_fg: Color = selected_fg if is_selected else fg
		var item_bg: Color = selected_bg if is_selected else Constants.COLORS.BLACK
		var prefix: String = "► " if is_selected else "  "
		var text: String = prefix + items[i]
		# Truncate if too wide
		if text.length() > width:
			text = text.substr(0, width - 1) + "…"
		grid.draw_string_at(x, row, text, item_fg, item_bg)
		# Fill remaining width with background
		for c in range(text.length(), width):
			grid.set_char(x + c, row, " ", item_fg, item_bg)


func _clamp_scroll() -> void:
	if selected_index < scroll_offset:
		scroll_offset = selected_index
	elif selected_index >= scroll_offset + visible_count:
		scroll_offset = selected_index - visible_count + 1
	scroll_offset = clampi(scroll_offset, 0, maxi(0, items.size() - visible_count))
