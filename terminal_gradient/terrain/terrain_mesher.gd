class_name TerrainMesher
extends RefCounted
## Static mesh builders for terrain chunks and vegetation.

const CHUNK_SIZE: float = 64.0
const CHUNK_VERTS: int = 33


static func build_chunk_mesh(chunk_x: int, chunk_z: int, noise: FastNoiseLite, height_scale: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var step: float = CHUNK_SIZE / float(CHUNK_VERTS - 1)
	var ox: float = float(chunk_x) * CHUNK_SIZE
	var oz: float = float(chunk_z) * CHUNK_SIZE
	var up := Vector3(0.0, 1.0, 0.0)

	for row in range(CHUNK_VERTS - 1):
		for col in range(CHUNK_VERTS - 1):
			var x0: float = ox + float(col) * step
			var x1: float = x0 + step
			var z0: float = oz + float(row) * step
			var z1: float = z0 + step

			var tl := Vector3(x0, noise.get_noise_2d(x0, z0) * height_scale, z0)
			var tr := Vector3(x1, noise.get_noise_2d(x1, z0) * height_scale, z0)
			var bl := Vector3(x0, noise.get_noise_2d(x0, z1) * height_scale, z1)
			var br := Vector3(x1, noise.get_noise_2d(x1, z1) * height_scale, z1)

			# Triangle 1: tl → tr → bl (CCW from above)
			st.set_normal(up); st.set_uv(Vector2(x0 * 0.02, z0 * 0.02)); st.add_vertex(tl)
			st.set_normal(up); st.set_uv(Vector2(x1 * 0.02, z0 * 0.02)); st.add_vertex(tr)
			st.set_normal(up); st.set_uv(Vector2(x0 * 0.02, z1 * 0.02)); st.add_vertex(bl)

			# Triangle 2: tr → br → bl (CCW from above)
			st.set_normal(up); st.set_uv(Vector2(x1 * 0.02, z0 * 0.02)); st.add_vertex(tr)
			st.set_normal(up); st.set_uv(Vector2(x1 * 0.02, z1 * 0.02)); st.add_vertex(br)
			st.set_normal(up); st.set_uv(Vector2(x0 * 0.02, z1 * 0.02)); st.add_vertex(bl)

	return st.commit()


# ── Vegetation builders ────────────────────────────

static func build_grass_tuft(rng: RandomNumberGenerator) -> Node3D:
	var g := Node3D.new()
	var m: StandardMaterial3D = _vmat(Color("#6aaa50"))
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	for i in range(3):
		var mi := MeshInstance3D.new()
		var q := QuadMesh.new(); q.size = Vector2(0.4, 0.6)
		mi.mesh = q; mi.material_override = m
		mi.rotation_degrees.y = float(i) * 60.0; mi.position.y = 0.3
		g.add_child(mi)
	var s: float = 0.8 + rng.randf() * 0.4
	g.scale = Vector3(s, s, s)
	return g


static func build_oak_tree(rng: RandomNumberGenerator) -> Node3D:
	var g := Node3D.new()
	var trunk_mi := MeshInstance3D.new()
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.3; trunk.bottom_radius = 0.3; trunk.height = 2.5
	trunk_mi.mesh = trunk; trunk_mi.material_override = _vmat(Color("#5c3d1e"))
	trunk_mi.position.y = 1.25; g.add_child(trunk_mi)
	var canopy_mi := MeshInstance3D.new()
	var canopy := SphereMesh.new(); canopy.radius = 2.0; canopy.height = 4.0
	canopy_mi.mesh = canopy; canopy_mi.material_override = _vmat(Color("#2d6e1f"))
	canopy_mi.position.y = 3.5; g.add_child(canopy_mi)
	var s: float = 0.7 + rng.randf() * 0.6
	g.scale = Vector3(s, s, s)
	return g


static func build_cactus(rng: RandomNumberGenerator) -> Node3D:
	var g := Node3D.new()
	var m: StandardMaterial3D = _vmat(Color("#4f7a3a"))
	var body_mi := MeshInstance3D.new()
	var body := CylinderMesh.new()
	body.top_radius = 0.35; body.bottom_radius = 0.35; body.height = 3.0
	body_mi.mesh = body; body_mi.material_override = m; body_mi.position.y = 1.5
	g.add_child(body_mi)
	for side in [-1.0, 1.0]:
		var arm_mi := MeshInstance3D.new()
		var arm := CylinderMesh.new()
		arm.top_radius = 0.2; arm.bottom_radius = 0.2; arm.height = 1.2
		arm_mi.mesh = arm; arm_mi.material_override = m
		arm_mi.position = Vector3(side * 0.5, 2.0, 0.0)
		arm_mi.rotation_degrees.z = side * -45.0
		g.add_child(arm_mi)
	var s: float = 0.8 + rng.randf() * 0.4
	g.scale = Vector3(s, s, s)
	return g


static func build_dry_shrub(rng: RandomNumberGenerator) -> Node3D:
	var g := Node3D.new()
	var mi := MeshInstance3D.new()
	var sp := SphereMesh.new(); sp.radius = 0.6; sp.height = 1.2
	mi.mesh = sp; mi.material_override = _vmat(Color("#8a7a45"))
	mi.position.y = 0.3; mi.scale = Vector3(1.0, 0.6, 1.0)
	g.add_child(mi)
	var s: float = 0.7 + rng.randf() * 0.6
	g.scale = Vector3(s, s, s)
	return g


static func build_pine_tree(rng: RandomNumberGenerator) -> Node3D:
	var g := Node3D.new()
	var trunk_mi := MeshInstance3D.new()
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.2; trunk.bottom_radius = 0.25; trunk.height = 3.0
	trunk_mi.mesh = trunk; trunk_mi.material_override = _vmat(Color("#5c3d1e"))
	trunk_mi.position.y = 1.5; g.add_child(trunk_mi)
	var lm: StandardMaterial3D = _vmat(Color("#1a4d1a"))
	for i in range(3):
		var cone_mi := MeshInstance3D.new()
		var cone := CylinderMesh.new()
		cone.top_radius = 0.0; cone.bottom_radius = 1.8 - float(i) * 0.4; cone.height = 2.0
		cone_mi.mesh = cone; cone_mi.material_override = lm
		cone_mi.position.y = 2.5 + float(i) * 1.2; g.add_child(cone_mi)
	var s: float = 0.7 + rng.randf() * 0.6
	g.scale = Vector3(s, s, s)
	return g


static func build_alpine_shrub(rng: RandomNumberGenerator) -> Node3D:
	var g := Node3D.new()
	var mi := MeshInstance3D.new()
	var sp := SphereMesh.new(); sp.radius = 0.45; sp.height = 0.9
	mi.mesh = sp; mi.material_override = _vmat(Color("#5a6e4a"))
	mi.position.y = 0.25
	mi.scale = Vector3(1.0 + rng.randf() * 0.3, 0.7 + rng.randf() * 0.3, 1.0 + rng.randf() * 0.3)
	g.add_child(mi)
	return g


static func _vmat(color: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX
	return mat
