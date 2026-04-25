class_name SplatTestZone
extends RefCounted
## Single source of truth for the SPLATMAP SPAWN TEST sampler.
##
## Maps a world XZ coordinate to one of 5 zone ids (0..4) using a layered
## noise splat-map: each id has its own FBM weight field, and the id whose
## weight is highest at a given point wins (argmax). This is the classic
## splat-map pattern used by MicroSplat / Gaia / Map Magic — organic, curved
## boundaries; no axis-aligned grid hints to hide drift bugs.
##
## **MUST MATCH `assets/shaders/splat_test_zone.gdshaderinc` byte-for-byte.**
## - hash21 (we reuse `BiomeField.hash21`, mirrored in the .gdshaderinc)
## - value_noise (mirrored)
## - fbm3 — 3 octaves, 2.03 lacunarity, 0.5 gain (mirrored)
## - layer phase offsets (17.3, 11.1) etc.
## - base frequency (NOISE_FREQ)
## - id derivation: argmax over 5 fbm weights
## - the 5 colours

# Base frequency for the layered FBM. Smaller = bigger zone patches. Tuned so
# zones average ~30–50 m across at this value.
const NOISE_FREQ: float = 0.018

# Bold, well-separated primaries. High saturation so the cuboid's hue stays
# instantly identifiable through the matcap modulation. The ground shader
# pulls these toward grey (see `splat_test_ground.gdshader`) so a cuboid
# always reads as more saturated than the tile under it.
const ZONE_COLORS: Array[Color] = [
	Color(1.00, 0.15, 0.15),  # 0 red
	Color(0.15, 0.35, 1.00),  # 1 blue
	Color(0.15, 0.85, 0.25),  # 2 green
	Color(1.00, 0.90, 0.15),  # 3 yellow
	Color(1.00, 0.20, 0.85),  # 4 magenta
]


# Layered FBM. Same hash as biome_field.gd but the FBM is locally inlined at
# 3 octaves so the shader's per-fragment cost stays cheap (5 fbm calls × 3
# octaves × 4 hash lookups ≈ 60 hashes per pixel).

static func _value_noise(px: float, pz: float) -> float:
	var ix: float = floor(px)
	var iz: float = floor(pz)
	var fx: float = px - ix
	var fz: float = pz - iz
	var ux: float = fx * fx * (3.0 - 2.0 * fx)
	var uz: float = fz * fz * (3.0 - 2.0 * fz)
	var a: float = BiomeField.hash21(ix, iz)
	var b: float = BiomeField.hash21(ix + 1.0, iz)
	var c: float = BiomeField.hash21(ix, iz + 1.0)
	var d: float = BiomeField.hash21(ix + 1.0, iz + 1.0)
	return lerp(lerp(a, b, ux), lerp(c, d, ux), uz)


static func _fbm3(px: float, pz: float) -> float:
	var v: float = 0.0
	var a: float = 0.5
	var x: float = px
	var z: float = pz
	for _i in 3:
		v += a * _value_noise(x, z)
		x *= 2.03
		z *= 2.03
		a *= 0.5
	return v


static func zone_id_at(wx: float, wz: float) -> int:
	# 5 weight fields — same FBM, different phase offsets so each id has a
	# decorrelated coverage pattern. argmax picks the dominant zone.
	var fx: float = wx * NOISE_FREQ
	var fz: float = wz * NOISE_FREQ
	var w0: float = _fbm3(fx,         fz)
	var w1: float = _fbm3(fx + 17.3,  fz + 11.1)
	var w2: float = _fbm3(fx + 31.5,  fz +  7.7)
	var w3: float = _fbm3(fx + 52.1,  fz + 23.7)
	var w4: float = _fbm3(fx + 73.4,  fz + 41.5)

	var best: int = 0
	var best_w: float = w0
	if w1 > best_w: best = 1; best_w = w1
	if w2 > best_w: best = 2; best_w = w2
	if w3 > best_w: best = 3; best_w = w3
	if w4 > best_w: best = 4; best_w = w4
	return best


static func zone_color(id: int) -> Color:
	return ZONE_COLORS[clampi(id, 0, 4)]
