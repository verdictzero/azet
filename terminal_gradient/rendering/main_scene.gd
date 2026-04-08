extends Node
## Root scene script. Wires GameManager to the AsciiGrid.

@onready var ascii_grid: AsciiGrid = $SubViewportContainer/SubViewport/AsciiGrid


func _ready() -> void:
	# Initialize the game manager with the grid reference
	GameMgr.initialize(ascii_grid)
