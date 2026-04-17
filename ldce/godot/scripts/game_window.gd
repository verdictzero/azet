class_name GameWindow
extends PanelContainer

@onready var title_label: Label = $VB/Title/TitleLabel
@onready var close_button: Button = $VB/Title/CloseButton
@onready var title_bar: HBoxContainer = $VB/Title
@onready var content: VBoxContainer = $VB/Content

var dragging: bool = false
var drag_offset: Vector2


func _ready() -> void:
	close_button.pressed.connect(func(): hide())
	title_bar.gui_input.connect(_on_title_input)


func set_title(t: String) -> void:
	if title_label:
		title_label.text = t


func _on_title_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		dragging = event.pressed
		if dragging:
			drag_offset = get_global_mouse_position() - global_position


func _process(_delta: float) -> void:
	if dragging:
		# Clamp so windows stay on screen.
		var vp := get_viewport_rect().size
		var new_pos := get_global_mouse_position() - drag_offset
		new_pos.x = clampf(new_pos.x, -size.x * 0.5, vp.x - size.x * 0.5)
		new_pos.y = clampf(new_pos.y, 0.0, vp.y - 40.0)
		global_position = new_pos
