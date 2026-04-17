class_name Minimap
extends TextureRect

signal cell_clicked(x: int, y: int)

const WIDTH := 128
const HEIGHT := 128

var image: Image
var img_tex: ImageTexture
var dirty_any: bool = false


func _ready() -> void:
	image = Image.create(WIDTH, HEIGHT, false, Image.FORMAT_RGB8)
	image.fill(Color(0.35, 0.55, 0.3))
	img_tex = ImageTexture.create_from_image(image)
	texture = img_tex
	mouse_filter = Control.MOUSE_FILTER_STOP
	stretch_mode = TextureRect.STRETCH_SCALE


func set_pixel(x: int, y: int, c: Color) -> void:
	if x < 0 or x >= WIDTH or y < 0 or y >= HEIGHT:
		return
	image.set_pixel(x, y, c)
	dirty_any = true


func flush() -> void:
	if dirty_any:
		img_tex.update(image)
		dirty_any = false


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_emit_click(event.position)
	elif event is InputEventMouseMotion and (event.button_mask & MOUSE_BUTTON_MASK_LEFT):
		_emit_click(event.position)


func _emit_click(pos: Vector2) -> void:
	if size.x <= 0 or size.y <= 0:
		return
	var cell_x := int(pos.x / size.x * WIDTH)
	var cell_y := int(pos.y / size.y * HEIGHT)
	cell_clicked.emit(cell_x, cell_y)
