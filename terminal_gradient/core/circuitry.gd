class_name Circuitry
extends RefCounted
## Procedural circuit-trace background for beyond-habitat VOID_SPACE tiles.
##
## Direct port of js/main.js:55-118 getCircuitryCell. Each world cell gets
## a deterministic hash; cells with hash < 0.35 have a "trace". Each trace
## cell picks a box-drawing char based on which of its 4 cardinal neighbors
## also have traces (connectivity bitmask). Non-trace cells render as black
## space. Trace cells pulse with an animated cyan/blue-green energy wave.
##
## The result is the fuzzy grid-of-traces look visible beyond the colony
## walls in the legacy screenshots.

# ── Connectivity bitmask → box-drawing char ──
# Bits: up=8, down=4, left=2, right=1 (matches main.js:68-85)
const _CONN_CHARS: Array[String] = [
	"·",  # 0000 isolated
	"─",  # 0001 right
	"─",  # 0010 left
	"─",  # 0011 left+right
	"│",  # 0100 down
	"┌",  # 0101 down+right
	"┐",  # 0110 down+left
	"┬",  # 0111 down+left+right
	"│",  # 1000 up
	"└",  # 1001 up+right
	"┘",  # 1010 up+left
	"┴",  # 1011 up+left+right
	"│",  # 1100 up+down
	"├",  # 1101 up+down+right
	"┤",  # 1110 up+down+left
	"○",  # 1111 all four — junction node
]

const TRACE_THRESHOLD: float = 0.35

# Visually indistinguishable from pure black but survives the shader's
# `bg.r < 0.01` transparency check (see AsciiGrid shader). Without this,
# non-trace circuit cells (which are space + near-black bg) get treated as
# transparent and show the SubViewport's grey clear color through the gfx
# layer. See ui_shell.gd OPAQUE_BLACK for the same trick.
const OPAQUE_BLACK: Color = Color(0.02, 0.02, 0.02, 1.0)


# ── Hash function — port of _circuitHash (js/main.js:55-60) ──
# JS used Math.imul, which is signed 32-bit multiply-low. We emulate via
# 32-bit masking + signed-wrap arithmetic so the hash sequence matches the
# legacy bit-for-bit.

static func _imul(a: int, b: int) -> int:
	var r: int = (a * b) & 0xFFFFFFFF
	if r >= 0x80000000:
		r -= 0x100000000
	return r


static func _ushr(v: int, shift: int) -> int:
	var masked: int = v & 0xFFFFFFFF
	if masked < 0:
		masked += 0x100000000
	return masked >> shift


static func _hash(wx: int, wy: int) -> float:
	var h: int = _imul(wx, 374761393) + _imul(wy, 668265263)
	h = _imul(h ^ _ushr(h, 13), 1274126177)
	h = h ^ _ushr(h, 16)
	var unsigned: int = h & 0xFFFFFFFF
	if unsigned < 0:
		unsigned += 0x100000000
	return float(unsigned) / 4294967296.0


static func has_trace(wx: int, wy: int) -> bool:
	return _hash(wx, wy) < TRACE_THRESHOLD


# ── Cell lookup ──
# Returns {"char": String, "fg": Color, "bg": Color}. Non-trace cells are
# solid black; trace cells pick a box-drawing char from the neighbor
# connectivity bitmask and pulse with an animated cyan energy wave.

static func get_cell(wx: int, wy: int, t: float) -> Dictionary:
	if not has_trace(wx, wy):
		# Non-trace cells: solid (but opaque) black. OPAQUE_BLACK keeps
		# the bg above the shader's transparency cutoff so the circuitry
		# area never shows the SubViewport clear color through the cracks.
		return {"char": " ", "fg": Color.BLACK, "bg": OPAQUE_BLACK}

	# Connectivity from cardinal neighbors.
	var conn: int = 0
	if has_trace(wx, wy - 1):
		conn |= 8
	if has_trace(wx, wy + 1):
		conn |= 4
	if has_trace(wx - 1, wy):
		conn |= 2
	if has_trace(wx + 1, wy):
		conn |= 1
	var ch: String = _CONN_CHARS[conn]

	# Animated energy pulse (js/main.js:105-109).
	var wave: float = sin(float(wx) * 0.3 + float(wy) * 0.2 - t * 1.5) * 0.5 + 0.5
	var pulse2: float = sin(float(wx) * 0.1 - float(wy) * 0.15 + t * 0.7) * 0.5 + 0.5
	var energy: float = wave * 0.7 + pulse2 * 0.3

	# Very dark cyan/blue-green palette (js/main.js:112-115).
	var cr: float = (6.0 + energy * 10.0) / 255.0
	var cg: float = (6.0 + energy * 50.0) / 255.0
	var cb: float = (18.0 + energy * 62.0) / 255.0

	return {"char": ch, "fg": Color(cr, cg, cb), "bg": OPAQUE_BLACK}
