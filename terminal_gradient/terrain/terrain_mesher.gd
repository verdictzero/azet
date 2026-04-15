class_name TerrainMesher
extends RefCounted
## Static mesh builders for flat terrain chunks and billboard vegetation.

const CHUNK_SIZE: float = 64.0
const CHUNK_VERTS: int = 33


static func build_flat_chunk_mesh(chunk_x: int, chunk_z: int) -> ArrayMesh:
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

			var tl := Vector3(x0, 0.0, z0)
			var tr := Vector3(x1, 0.0, z0)
			var bl := Vector3(x0, 0.0, z1)
			var br := Vector3(x1, 0.0, z1)

			st.set_normal(up); st.set_uv(Vector2(x0 * 0.02, z0 * 0.02)); st.add_vertex(tl)
			st.set_normal(up); st.set_uv(Vector2(x1 * 0.02, z0 * 0.02)); st.add_vertex(tr)
			st.set_normal(up); st.set_uv(Vector2(x0 * 0.02, z1 * 0.02)); st.add_vertex(bl)

			st.set_normal(up); st.set_uv(Vector2(x1 * 0.02, z0 * 0.02)); st.add_vertex(tr)
			st.set_normal(up); st.set_uv(Vector2(x1 * 0.02, z1 * 0.02)); st.add_vertex(br)
			st.set_normal(up); st.set_uv(Vector2(x0 * 0.02, z1 * 0.02)); st.add_vertex(bl)

	return st.commit()


static func build_ball(diameter: float, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var s := SphereMesh.new()
	s.radius = diameter * 0.5
	s.height = diameter
	s.radial_segments = 12
	s.rings = 6
	mi.mesh = s
	mi.material_override = mat
	return mi


static func build_billboard(tex: Texture2D, world_height: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var tex_size: Vector2 = tex.get_size()
	var aspect: float = tex_size.x / tex_size.y
	var q := QuadMesh.new()
	q.size = Vector2(world_height * aspect, world_height)
	mi.mesh = q

	var mat := StandardMaterial3D.new()
	mat.albedo_texture = tex
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	mat.alpha_scissor_threshold = 0.5
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	mat.billboard_keep_scale = true
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX
	mi.material_override = mat
	return mi
