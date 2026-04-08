class_name AtlasDrawer
extends Node2D
## Temporary Node2D used by GlyphAtlasBuilder.
## Draws all charset glyphs white-on-transparent in a grid layout.
## Added to a SubViewport, rendered once, then freed.

var font: Font
var font_size: int
var cell_w: int
var cell_h: int
var charset: PackedStringArray
var atlas_cols: int


func _draw() -> void:
	for i in range(charset.size()):
		var ch: String = charset[i]
		var ax: int = (i % atlas_cols) * cell_w
		var ay: int = (i / atlas_cols) * cell_h
		var baseline_y: int = ay + int(float(cell_h) * 0.85)
		draw_char(font, Vector2(ax, baseline_y), ch, font_size, Color.WHITE)
