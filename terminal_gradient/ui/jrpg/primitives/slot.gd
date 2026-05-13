@tool
class_name Slot
extends PanelContainer
## Placeholder rectangle with an uppercase label. Stand-in for any
## illustration in the mockup. Each label string is the asset's working name.

@export var label_text: String = "SLOT":
	set(value):
		label_text = value.to_upper()
		if is_node_ready():
			_refresh()
@export var label_secondary: String = "":
	set(value):
		label_secondary = value.to_upper()
		if is_node_ready():
			_refresh()
@export var slot_variation: StringName = &"JWindowFlat":
	set(value):
		slot_variation = value
		theme_type_variation = value

var _label: Label
var _secondary: Label
var _vbox: VBoxContainer


func _ready() -> void:
	theme_type_variation = slot_variation
	if _vbox == null:
		_vbox = VBoxContainer.new()
		_vbox.alignment = BoxContainer.ALIGNMENT_CENTER
		_vbox.add_theme_constant_override("separation", 4)
		add_child(_vbox)
		_label = Label.new()
		_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_label.theme_type_variation = &"TextDim"
		_vbox.add_child(_label)
		_secondary = Label.new()
		_secondary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_secondary.theme_type_variation = &"TextDim"
		_vbox.add_child(_secondary)
	_refresh()


func _refresh() -> void:
	if _label:
		_label.text = label_text
	if _secondary:
		_secondary.text = label_secondary
		_secondary.visible = not label_secondary.is_empty()
