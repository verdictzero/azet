class_name SplatTestZone
extends RefCounted
## CPU-only zone classifier for the SPLATMAP SPAWN TEST.
##
## Maps a world XZ coordinate to one of 5 zone ids (0..4) using a layered
## noise splat-map: each id has its own FBM weight field, and the id whose
## weight is highest at a given point wins (argmax). This is the classic
## splat-map pattern used by MicroSplat / Gaia / Map Magic — organic, curved
## boundaries; no axis-aligned grid hints to hide drift bugs.
##
## Single source of truth for zone IDs. Consumed once per texel by the
## splat-test screen's per-chunk bake, then BOTH the spawn loop and the
## ground shader read from the baked image — so prefab placement vs ground
## colour can no longer drift on a sampler mismatch.
##
## `ZONE_COLORS` IS still mirrored in `assets/shaders/splat_test_ground.gdshader`
## as a 5-entry GLSL constant array; that's the only remaining cross-language
## drift surface and it's five hex tuples, trivial to keep aligned.

# Base frequency for the layered FBM. Smaller = bigger zone patches. Tuned so
# zones average ~30–50 m across at this value.
const NOISE_FREQ: float = 0.018

# Bold, well-separated primaries. High saturation so the cuboid's hue stays
# instantly identifiable through the matcap modulation. The ground shader
# pulls these toward grey (see `splat_test_ground.gdshader`) so a cuboid
# always reads as more saturated than the tile under it.
# **MUST match the `ZONE_COLORS` constant array in BOTH
# `assets/shaders/splat_test_ground.gdshader` AND
# `assets/shaders/splat_test_3_ground.gdshader` — five hex tuples mirrored
# in two shaders, trivial to keep aligned.**
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
	var w: PackedFloat32Array = zone_weights_at(wx, wz)
	var best: int = 0
	var best_w: float = w[0]
	if w[1] > best_w: best = 1; best_w = w[1]
	if w[2] > best_w: best = 2; best_w = w[2]
	if w[3] > best_w: best = 3; best_w = w[3]
	if w[4] > best_w: best = 4; best_w = w[4]
	return best


# Returns the 5 raw `_fbm3` weights `zone_id_at` argmaxes over. Test 3
# bakes these continuously (instead of just the winning id) and bilinear-
# samples them in the shader so the argmax flip-line becomes a sub-texel-
# sharp curve — gives smooth boundaries while keeping CPU/GPU agreement
# (both sides bilinear-blend the same baked bytes and run the same
# argmax). Test 1 / Test 2 don't need the weights since they only care
# about the winning id.
static func zone_weights_at(wx: float, wz: float) -> PackedFloat32Array:
	var fx: float = wx * NOISE_FREQ
	var fz: float = wz * NOISE_FREQ
	var out := PackedFloat32Array()
	out.resize(5)
	out[0] = _fbm3(fx,         fz)
	out[1] = _fbm3(fx + 17.3,  fz + 11.1)
	out[2] = _fbm3(fx + 31.5,  fz +  7.7)
	out[3] = _fbm3(fx + 52.1,  fz + 23.7)
	out[4] = _fbm3(fx + 73.4,  fz + 41.5)
	return out


static func zone_color(id: int) -> Color:
	return ZONE_COLORS[clampi(id, 0, 4)]
