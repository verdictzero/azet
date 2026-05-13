@tool
class_name JWindow
extends PanelContainer
## JRPG window primitive — 2px white inner border + 2px black outer shadow over #1a1a1a fill.
##
## Variant switches the theme_type_variation so a single theme controls all three looks.

enum Variant { DEFAULT, TIGHT, FLAT }

@export var variant: Variant = Variant.DEFAULT:
	set(value):
		variant = value
		_apply_variant()


func _ready() -> void:
	_apply_variant()


func _apply_variant() -> void:
	match variant:
		Variant.DEFAULT:
			theme_type_variation = &""
		Variant.TIGHT:
			theme_type_variation = &"JWindowTight"
		Variant.FLAT:
			theme_type_variation = &"JWindowFlat"
