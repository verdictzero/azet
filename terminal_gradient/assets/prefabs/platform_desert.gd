extends Node3D
## Wrapper around platform_0.glb that swaps the platform's authored diffuse
## texture for the desert variant (`platform_0_desert_test.png`). Used by
## DesertBiomeTestScreen — same model + collider, different albedo.

const DesertDiffuseTex: Texture2D = preload("res://assets/models/platform_0_desert_test.png")


func _ready() -> void:
	_apply_desert_diffuse(self)


static func _apply_desert_diffuse(node: Node) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if mi.mesh != null:
			for surf_idx in mi.mesh.get_surface_count():
				var orig: Material = mi.mesh.surface_get_material(surf_idx)
				if orig is StandardMaterial3D:
					var sm: StandardMaterial3D = orig as StandardMaterial3D
					if sm.albedo_texture == null:
						continue
					var dup: StandardMaterial3D = sm.duplicate()
					dup.albedo_texture = DesertDiffuseTex
					mi.set_surface_override_material(surf_idx, dup)
	for child in node.get_children():
		_apply_desert_diffuse(child)
