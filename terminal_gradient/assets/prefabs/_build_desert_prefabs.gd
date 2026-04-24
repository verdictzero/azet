@tool
extends EditorScript

# One-shot EditorScript: extracts each MeshInstance3D from
# `desert_props_0.glb` and saves it as its own .tscn prefab under
# `assets/prefabs/`, wiring the surface material override to the matching
# pre-authored ShaderMaterial .tres.
#
# Run with `File > Run` from the Godot Script editor (no node binding needed).
# Idempotent — safe to re-run; overwrites the existing prefab files.

const GLB_PATH := "res://assets/models/desert_props_0.glb"
const PREFABS_DIR := "res://assets/prefabs"

const FLESH_TALL := "res://assets/prefabs/cactus_flesh_tall.tres"
const FLESH_SHORT := "res://assets/prefabs/cactus_flesh_short.tres"
const SPIKE := "res://assets/prefabs/cactus_spike.tres"
const ROCK := "res://assets/prefabs/desert_rock.tres"

# prefab base name → list of [mesh_node_name, material_path] pairs.
const PREFABS := {
	"cactus_tall_a": [["tall_cactus_A", FLESH_TALL]],
	"cactus_tall_b": [["tall_cactus_B", FLESH_TALL]],
	"cactus_tall_c": [["tall_cactus_C", FLESH_TALL]],
	"cactus_short": [
		["short_cactus_body", FLESH_SHORT],
		["short_cactus_thorns", SPIKE],
	],
	"desert_rock": [["desert_rock", ROCK]],
}

func _run() -> void:
	var glb_scene := load(GLB_PATH) as PackedScene
	if glb_scene == null:
		push_error("[desert_prefabs] Failed to load GLB at %s (import it in Godot first)" % GLB_PATH)
		return
	var glb_root := glb_scene.instantiate()
	var meshes := {}
	_collect_meshes(glb_root, meshes)
	glb_root.queue_free()

	if meshes.is_empty():
		push_error("[desert_prefabs] No MeshInstance3Ds found in GLB — aborting")
		return

	for prefab_name in PREFABS.keys():
		var entries: Array = PREFABS[prefab_name]
		var root := Node3D.new()
		root.name = _pascal_case(prefab_name)
		var missing := false
		for entry in entries:
			var node_name: String = entry[0]
			var mat_path: String = entry[1]
			if not meshes.has(node_name):
				push_warning("[desert_prefabs] mesh '%s' missing from GLB, skipping prefab %s" % [node_name, prefab_name])
				missing = true
				break
			var mi := MeshInstance3D.new()
			mi.name = node_name
			mi.mesh = meshes[node_name]
			var mat := load(mat_path) as Material
			if mat != null:
				mi.set_surface_override_material(0, mat)
			else:
				push_warning("[desert_prefabs] failed to load material %s" % mat_path)
			root.add_child(mi)
			mi.owner = root
		if missing:
			root.queue_free()
			continue
		var packed := PackedScene.new()
		var pack_err := packed.pack(root)
		if pack_err != OK:
			push_error("[desert_prefabs] pack failed for %s (err %d)" % [prefab_name, pack_err])
			root.queue_free()
			continue
		var out_path := "%s/%s.tscn" % [PREFABS_DIR, prefab_name]
		var save_err := ResourceSaver.save(packed, out_path)
		if save_err != OK:
			push_error("[desert_prefabs] save failed for %s (err %d)" % [out_path, save_err])
		else:
			print("[desert_prefabs] wrote %s" % out_path)
		root.queue_free()

	var fs := EditorInterface.get_resource_filesystem()
	if fs != null:
		fs.scan()

func _collect_meshes(node: Node, out: Dictionary) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		if mi.mesh != null:
			out[mi.name] = mi.mesh
	for child in node.get_children():
		_collect_meshes(child, out)

func _pascal_case(s: String) -> String:
	var parts := s.split("_")
	var result := ""
	for p in parts:
		if p.length() > 0:
			result += p.substr(0, 1).to_upper() + p.substr(1)
	return result
