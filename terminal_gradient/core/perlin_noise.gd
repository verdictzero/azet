class_name PerlinNoise
extends RefCounted
## Classic 2D Perlin noise with fBm support.
## Exact port of js/utils.js PerlinNoise for deterministic world generation.

var _perm: PackedInt32Array

# 2D gradient vectors (12 directions from classic Perlin set)
const _GRAD2: Array = [
	[1, 1], [-1, 1], [1, -1], [-1, -1],
	[1, 0], [-1, 0], [0, 1], [0, -1],
	[1, 1], [-1, 1], [1, -1], [-1, -1],
]


func _init(rng: SeededRNG) -> void:
	# Build permutation table from the seeded RNG
	var perm: Array[int] = []
	perm.resize(256)
	for i in range(256):
		perm[i] = i
	# Fisher-Yates shuffle using the provided RNG
	for i in range(255, 0, -1):
		var j: int = int(floor(rng.next_f() * float(i + 1)))
		var tmp: int = perm[i]
		perm[i] = perm[j]
		perm[j] = tmp
	# Double the table to avoid index wrapping
	_perm = PackedInt32Array()
	_perm.resize(512)
	for i in range(512):
		_perm[i] = perm[i & 255]


func _dot2(hash_val: int, x: float, y: float) -> float:
	var g: Array = _GRAD2[hash_val & 11]
	return float(g[0]) * x + float(g[1]) * y


static func _fade(t: float) -> float:
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


func noise_2d(x: float, y: float) -> float:
	var p := _perm
	# Grid cell coordinates
	var xi: int = int(floor(x)) & 255
	var yi: int = int(floor(y)) & 255
	# Relative position within cell
	var xf: float = x - floor(x)
	var yf: float = y - floor(y)
	# Fade curves
	var u: float = _fade(xf)
	var v: float = _fade(yf)
	# Hash coordinates of the 4 corners
	var aa: int = p[p[xi] + yi]
	var ab: int = p[p[xi] + yi + 1]
	var ba: int = p[p[xi + 1] + yi]
	var bb: int = p[p[xi + 1] + yi + 1]
	# Gradient dot products at each corner, then bilinear interpolation
	var x1: float = lerpf(_dot2(aa, xf, yf), _dot2(ba, xf - 1.0, yf), u)
	var x2: float = lerpf(_dot2(ab, xf, yf - 1.0), _dot2(bb, xf - 1.0, yf - 1.0), u)
	return lerpf(x1, x2, v)


func fbm(x: float, y: float, octaves: int = 4, lacunarity: float = 2.0, gain: float = 0.5) -> float:
	var sum: float = 0.0
	var amplitude: float = 1.0
	var frequency: float = 1.0
	var max_amplitude: float = 0.0
	for i in range(octaves):
		sum += noise_2d(x * frequency, y * frequency) * amplitude
		max_amplitude += amplitude
		amplitude *= gain
		frequency *= lacunarity
	return sum / max_amplitude
