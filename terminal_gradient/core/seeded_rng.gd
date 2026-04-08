class_name SeededRNG
extends RefCounted
## Deterministic random number generator (mulberry32).
## Exact port of js/utils.js SeededRNG for seed-compatible world generation.
##
## CRITICAL: GDScript ints are 64-bit signed. JS bitwise ops are 32-bit.
## All intermediate values must be masked to 32-bit, and the final result
## must be converted to unsigned before float division.

var _state: int


func _init(seed: int = 0) -> void:
	_state = seed & 0xFFFFFFFF


func next() -> float:
	## Returns float in [0, 1). Exact mulberry32 port.
	## Matches JS: ((t ^ (t >>> 14)) >>> 0) / 4294967296
	_state = (_state + 0x6D2B79F5) & 0xFFFFFFFF
	var t: int = _state
	t = _imul(t ^ _ushr(t, 15), t | 1)
	t = (t ^ ((t + _imul(t ^ _ushr(t, 7), t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
	var result: int = _to_unsigned(t ^ _ushr(t, 14))
	return float(result) / 4294967296.0


## Alias for next().
func next_f() -> float:
	return next()


func next_int(min_val: int, max_val: int) -> int:
	return int(floor(next() * float(max_val - min_val + 1))) + min_val


func next_float(min_val: float, max_val: float) -> float:
	return next() * (max_val - min_val) + min_val


func random_element(array: Array) -> Variant:
	if array.is_empty():
		return null
	return array[int(floor(next() * float(array.size())))]


func shuffle(array: Array) -> Array:
	var result: Array = array.duplicate()
	for i in range(result.size() - 1, 0, -1):
		var j: int = int(floor(next() * float(i + 1)))
		var tmp: Variant = result[i]
		result[i] = result[j]
		result[j] = tmp
	return result


func weighted(options: Array) -> Variant:
	## options: Array of { "weight": float, "value": Variant }
	var total: float = 0.0
	for opt in options:
		total += opt.weight
	var roll: float = next() * total
	for opt in options:
		roll -= opt.weight
		if roll <= 0.0:
			return opt.value
	return options[options.size() - 1].value


func chance(probability: float) -> bool:
	return next() < probability


func gaussian(mean: float = 0.0, stddev: float = 1.0) -> float:
	## Box-Muller transform.
	var u: float
	var v: float
	var s: float
	while true:
		u = next() * 2.0 - 1.0
		v = next() * 2.0 - 1.0
		s = u * u + v * v
		if s < 1.0 and s != 0.0:
			break
	var mul: float = sqrt((-2.0 * log(s)) / s)
	return mean + stddev * u * mul


# --- 32-bit integer math helpers matching JS semantics ---

static func _imul(a: int, b: int) -> int:
	## Replicates Math.imul(): signed 32-bit multiply (low 32 bits).
	## GDScript 64-bit multiply is safe; we just mask to 32 bits and sign-extend.
	var result: int = (a * b) & 0xFFFFFFFF
	if result >= 0x80000000:
		result -= 0x100000000
	return result


static func _ushr(val: int, shift: int) -> int:
	## Replicates JavaScript's >>> (unsigned right shift).
	## Converts to unsigned 32-bit, shifts, returns non-negative result.
	var unsigned: int = _to_unsigned(val)
	return unsigned >> shift


static func _to_unsigned(val: int) -> int:
	## Convert a potentially signed 32-bit value to unsigned [0, 0xFFFFFFFF].
	## In GDScript, (val & 0xFFFFFFFF) on a negative int still yields negative
	## because GDScript ints are 64-bit signed. We must explicitly fix this.
	var masked: int = val & 0xFFFFFFFF
	if masked < 0:
		return masked + 0x100000000
	return masked
