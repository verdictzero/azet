class_name JMenu
extends VBoxContainer
## Vertical list of menu items with a blinking ▶ cursor on the selected row.
##
## Items are populated via set_items({text, action, disabled?, submenu?}).
## Navigation: up/down moves cursor; ui_accept emits item_chosen(action);
## ui_cancel emits cancel_requested.

signal item_chosen(action: String, index: int)
signal selection_changed(index: int)
signal cancel_requested()

const CURSOR_GLYPH := "▶"
const CURSOR_GUTTER_W := 22.0
const ROW_HEIGHT := 22.0
const BLINK_PERIOD := 0.7

@export var capture_input: bool = true

var _items: Array = []
var _selection: int = 0
var _rows: Array[HBoxContainer] = []
var _cursors: Array[Label] = []
var _blink_t: float = 0.0


func _ready() -> void:
	add_theme_constant_override("separation", 2)
	set_process(true)


func set_items(items: Array) -> void:
	## items: Array of Dictionaries:
	##   {text: String, action: String, disabled: bool=false, submenu: bool=false, suffix: String=""}
	_items = items
	_selection = _first_enabled_index()
	_rebuild()


func get_selection() -> int:
	return _selection


func set_selection(index: int) -> void:
	if index < 0 or index >= _items.size():
		return
	_selection = index
	_refresh_cursors()
	selection_changed.emit(_selection)


func _first_enabled_index() -> int:
	for i in _items.size():
		if not _items[i].get("disabled", false):
			return i
	return 0


func _rebuild() -> void:
	for child in get_children():
		child.queue_free()
	_rows.clear()
	_cursors.clear()

	for i in _items.size():
		var item: Dictionary = _items[i]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 0)
		row.custom_minimum_size = Vector2(0, ROW_HEIGHT)

		var cursor_label := Label.new()
		cursor_label.text = CURSOR_GLYPH
		cursor_label.custom_minimum_size = Vector2(CURSOR_GUTTER_W, 0)
		cursor_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		cursor_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		cursor_label.modulate = Color(1, 1, 1, 0)
		row.add_child(cursor_label)
		_cursors.append(cursor_label)

		var text_label := Label.new()
		text_label.text = item.get("text", "")
		text_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		text_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if item.get("disabled", false):
			text_label.theme_type_variation = &"TextDisabled"
		row.add_child(text_label)

		var suffix: String = item.get("suffix", "")
		if item.get("submenu", false):
			suffix = "▶"
		if not suffix.is_empty():
			var suffix_label := Label.new()
			suffix_label.text = suffix
			suffix_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			if item.get("disabled", false):
				suffix_label.theme_type_variation = &"TextDisabled"
			row.add_child(suffix_label)

		add_child(row)
		_rows.append(row)

	_refresh_cursors()


func _refresh_cursors() -> void:
	for i in _cursors.size():
		var visible_cursor: bool = (i == _selection)
		_cursors[i].modulate = Color(1, 1, 1, 1) if visible_cursor else Color(1, 1, 1, 0)


func _process(delta: float) -> void:
	if _cursors.is_empty():
		return
	_blink_t += delta
	# 0.7s step(2): 0..0.35 visible, 0.35..0.7 hidden.
	var phase: float = fmod(_blink_t, BLINK_PERIOD)
	var visible_now: bool = phase < (BLINK_PERIOD * 0.5)
	if _selection >= 0 and _selection < _cursors.size():
		_cursors[_selection].modulate.a = 1.0 if visible_now else 0.0


func _unhandled_input(event: InputEvent) -> void:
	if not capture_input or _items.is_empty():
		return
	if event.is_action_pressed("move_up"):
		_step(-1)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("move_down"):
		_step(1)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("interact"):
		_confirm()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("cancel"):
		cancel_requested.emit()
		get_viewport().set_input_as_handled()


func _step(direction: int) -> void:
	if _items.is_empty():
		return
	var idx: int = _selection
	for _i in _items.size():
		idx = (idx + direction + _items.size()) % _items.size()
		if not _items[idx].get("disabled", false):
			_selection = idx
			_blink_t = 0.0
			_refresh_cursors()
			selection_changed.emit(_selection)
			return


func _confirm() -> void:
	if _selection < 0 or _selection >= _items.size():
		return
	var item: Dictionary = _items[_selection]
	if item.get("disabled", false):
		return
	item_chosen.emit(item.get("action", ""), _selection)
