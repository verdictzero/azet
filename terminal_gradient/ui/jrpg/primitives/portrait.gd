class_name Portrait
extends Control
## Conversation portrait with active/inactive states.
##
## Active: full-brightness frame + ▼ blinker overhead + name plate visible.
## Inactive: darkened modulate, dim border, blinker hidden.

@export var portrait_name: String = "VERRIN":
	set(value):
		portrait_name = value.to_upper()
		if is_node_ready():
			_refresh()
@export var active: bool = true:
	set(value):
		active = value
		if is_node_ready():
			_refresh()
@export var portrait_size: Vector2 = Vector2(216, 216):
	set(value):
		portrait_size = value
		if is_node_ready():
			_refresh()
@export var show_name_plate: bool = true:
	set(value):
		show_name_plate = value
		if is_node_ready():
			_refresh()

const BLINK_PERIOD := 0.7
var _blink_t: float = 0.0

var _frame: PanelContainer
var _slot: Slot
var _name_plate: PanelContainer
var _name_label: Label
var _blinker: Label


func _ready() -> void:
	custom_minimum_size = portrait_size

	_frame = PanelContainer.new()
	_frame.position = Vector2.ZERO
	_frame.custom_minimum_size = portrait_size
	add_child(_frame)

	_slot = Slot.new()
	_slot.label_text = portrait_name
	_slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_slot.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_frame.add_child(_slot)

	_blinker = Label.new()
	_blinker.text = "▼"
	_blinker.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_blinker.size = Vector2(portrait_size.x, 16)
	_blinker.position = Vector2(0, -20)
	add_child(_blinker)

	_name_plate = PanelContainer.new()
	_name_plate.theme_type_variation = &"JWindowTight"
	_name_plate.position = Vector2(0, portrait_size.y + 4)
	add_child(_name_plate)

	_name_label = Label.new()
	_name_label.text = portrait_name
	_name_label.theme_type_variation = &"TextSM"
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_plate.add_child(_name_label)

	set_process(true)
	_refresh()


func _refresh() -> void:
	if _slot:
		_slot.label_text = portrait_name
	if _name_label:
		_name_label.text = portrait_name
	if _frame:
		_frame.custom_minimum_size = portrait_size
	custom_minimum_size = portrait_size

	if active:
		modulate = Color(1, 1, 1, 1)
		if _blinker:
			_blinker.visible = true
		if _name_plate:
			_name_plate.visible = show_name_plate
	else:
		modulate = Color(0.32, 0.32, 0.32, 1)
		if _blinker:
			_blinker.visible = false
		if _name_plate:
			_name_plate.visible = false


func _process(delta: float) -> void:
	if not active or _blinker == null:
		return
	_blink_t += delta
	var phase: float = fmod(_blink_t, BLINK_PERIOD)
	_blinker.modulate.a = 1.0 if phase < (BLINK_PERIOD * 0.5) else 0.0
