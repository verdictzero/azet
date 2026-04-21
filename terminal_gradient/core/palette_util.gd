class_name PaletteUtil
extends RefCounted
## Load `.hex` palette files and bake them into a 3D LUT texture for
## palette-snapping post-fx shaders. The `.hex` format is one `RRGGBB` per
## line (optionally `#`-prefixed); blank lines and whole-line comments (`;`
## or `//`) are skipped so we tolerate mild formatting drift across sources.

# LUT resolution trade-off: the sampler is `filter_nearest`, so this is just
# the "grid spacing" of the RGB-cube-to-palette mapping. 16 gives 4096 cells
# (≈1M distance checks against a 256-entry palette) which builds in under
# two seconds on a Pi 5; quality loss vs 32 is invisible because output is
# palette-bound anyway.
const DEFAULT_LUT_RES: int = 16


static func load_hex_palette(path: String) -> PackedColorArray:
	var out := PackedColorArray()
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_warning("PaletteUtil: failed to open %s" % path)
		return out
	while not f.eof_reached():
		var line: String = f.get_line().strip_edges()
		if line.is_empty():
			continue
		if line.begins_with(";") or line.begins_with("//"):
			continue
		if line.begins_with("#"):
			line = line.substr(1)
		if line.length() < 6:
			continue
		line = line.substr(0, 6)
		var rgb: int = line.hex_to_int()
		if rgb < 0:
			continue
		var r: float = float((rgb >> 16) & 0xff) / 255.0
		var g: float = float((rgb >> 8) & 0xff) / 255.0
		var b: float = float(rgb & 0xff) / 255.0
		out.append(Color(r, g, b, 1.0))
	return out


## Build a `lut_res³` 3D texture where each voxel holds the nearest palette
## entry (Euclidean in RGB) for the voxel's centre RGB coordinate. Slices
## index along the B axis. Inner loop pulls palette components into typed
## arrays so the O(res³·N) search doesn't thrash `Color` allocations.
static func build_palette_lut_3d(palette: PackedColorArray, lut_res: int = DEFAULT_LUT_RES) -> ImageTexture3D:
	if palette.is_empty():
		push_warning("PaletteUtil: empty palette")
		return null

	var n: int = palette.size()
	var pr := PackedFloat32Array()
	var pg := PackedFloat32Array()
	var pb := PackedFloat32Array()
	pr.resize(n); pg.resize(n); pb.resize(n)
	for i in n:
		pr[i] = palette[i].r
		pg[i] = palette[i].g
		pb[i] = palette[i].b

	var inv: float = 1.0 / float(maxi(lut_res - 1, 1))
	var images: Array[Image] = []
	for bi in lut_res:
		var img := Image.create(lut_res, lut_res, false, Image.FORMAT_RGB8)
		var bval: float = float(bi) * inv
		for gi in lut_res:
			var gval: float = float(gi) * inv
			for ri in lut_res:
				var rval: float = float(ri) * inv
				var best: int = 0
				var best_d: float = 1e30
				for pi in n:
					var dr: float = pr[pi] - rval
					var dg: float = pg[pi] - gval
					var db: float = pb[pi] - bval
					var d: float = dr * dr + dg * dg + db * db
					if d < best_d:
						best_d = d
						best = pi
				img.set_pixel(ri, gi, Color(pr[best], pg[best], pb[best], 1.0))
		images.append(img)

	var tex := ImageTexture3D.new()
	var err: int = tex.create(Image.FORMAT_RGB8, lut_res, lut_res, lut_res, false, images)
	if err != OK:
		push_warning("PaletteUtil: ImageTexture3D.create returned %d" % err)
		return null
	return tex
