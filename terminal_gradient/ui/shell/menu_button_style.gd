class_name MenuButtonStyle
extends RefCounted
## Shared styling for menu-button Labels — black background, single-pixel
## border in the selection color. Selection is communicated purely by color
## change (no scale, no zoom). Position offsets for selected items are the
## responsibility of the menu owner since they depend on layout direction.

const COLOR_SELECTED: Color = Color(0.90, 1.0, 0.95)
const COLOR_DESELECTED: Color = Color(0.30, 0.33, 0.38)


static func apply(label: Label, selected: bool) -> void:
	## Apply the menu-button look to a Label.
	var color: Color = COLOR_SELECTED if selected else COLOR_DESELECTED
	label.add_theme_color_override("font_color", color)

	var bg := StyleBoxFlat.new()
	bg.bg_color = Color.BLACK
	bg.border_color = color
	bg.border_width_left = 1
	bg.border_width_right = 1
	bg.border_width_top = 1
	bg.border_width_bottom = 1
	bg.content_margin_left = label.size.x * 0.05
	bg.content_margin_right = label.size.x * 0.05
	bg.content_margin_top = label.size.y * 0.1
	bg.content_margin_bottom = label.size.y * 0.1
	label.add_theme_stylebox_override("normal", bg)
