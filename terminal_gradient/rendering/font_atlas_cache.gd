class_name FontAtlasCache
extends RefCounted
## Runtime cache for pre-baked glyph atlases.
##
## Atlases are generated offline by `tools/bake_glyph_atlases.gd` and
## committed under `res://assets/glyph_atlases/`. At runtime we load the
## PNGs directly and return them to the shader, skipping the SubViewport
## rasterization AsciiGrid used to do on every boot.
##
## Key insight — the invariant that makes whole-atlas font swaps cheap:
## every baked atlas is rasterized from the SAME GlyphAtlasBuilder.CHARSET,
## so the char_map (char -> slot index) and gi_table (codepoint -> slot
## index) are identical across every font. Swapping a font on a live grid
## only means rebinding the `glyph_atlas` shader uniform — no per-cell
## data needs to change and no char_map rebuild is required.
##
## Missing-glyph policy: if a specialty font (e.g. Cuneiform) doesn't
## cover a codepoint in CHARSET, that atlas slot renders as tofu.
## That's by design — filtering CHARSET per font would break slot
## alignment and defeat the cheap-swap property. Swapping to a specialty
## font is a scoped artistic choice (lore inscriptions, etc.), not a
## general-purpose replacement for the primary mono font.
##
## Invalidation: the manifest stores a SHA-256 of the live CHARSET at
## bake time. If it no longer matches GlyphAtlasBuilder.charset_hash()
## the cache refuses to serve baked atlases and pushes an error — callers
## then fall back to the legacy async `GlyphAtlasBuilder.build_atlas`.
## Loud failure beats silently-wrong glyphs.
##
## FUTURE(per-cell-font): when mixing fonts on a single grid, this class
## will grow a `pack_array(font_names: Array, size: int) -> Texture2DArray`
## method. The shader's `glyph_atlas` uniform will be promoted to
## `sampler2DArray` and a parallel `cell_font` R8 data texture will pick
## the layer per cell. The bake output and manifest shape don't need to
## change for that — Texture2DArray is packed from the existing per-font
## PNGs at load time.

const MANIFEST_PATH := "res://assets/glyph_atlases/manifest.json"
const ATLAS_DIR := "res://assets/glyph_atlases"

# Loaded manifest (or null if missing / stale).
static var _manifest: Dictionary = {}
static var _manifest_loaded: bool = false
static var _manifest_valid: bool = false

# font_key ("<font_name>_<size>") -> Texture2D
static var _tex_cache: Dictionary = {}

# Shared across every font (CHARSET is identical for all baked atlases).
static var _char_map_cache: Dictionary = {}
static var _gi_table_cache: PackedInt32Array = PackedInt32Array()


## Load and validate the manifest. Idempotent. Safe to call repeatedly.
## Returns true if the manifest exists and its CHARSET hash matches the
## running code; false on missing/invalid/stale.
static func load_manifest() -> bool:
	if _manifest_loaded:
		return _manifest_valid
	_manifest_loaded = true

	if not FileAccess.file_exists(MANIFEST_PATH):
		push_warning("[FontAtlasCache] no manifest at %s — run tools/bake_glyph_atlases.gd" % MANIFEST_PATH)
		_manifest_valid = false
		return false

	var f := FileAccess.open(MANIFEST_PATH, FileAccess.READ)
	if f == null:
		push_error("[FontAtlasCache] failed to open %s" % MANIFEST_PATH)
		_manifest_valid = false
		return false
	var text: String = f.get_as_text()
	f.close()

	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("[FontAtlasCache] manifest is not an object")
		_manifest_valid = false
		return false

	_manifest = parsed
	var live_hash: String = GlyphAtlasBuilder.charset_hash()
	var baked_hash: String = String(_manifest.get("charset_hash", ""))
	if baked_hash != live_hash:
		push_error("[FontAtlasCache] CHARSET hash mismatch (baked=%s, live=%s). Rebake via tools/bake_glyph_atlases.gd — falling back to runtime rasterization." % [
			baked_hash.substr(0, 12), live_hash.substr(0, 12)
		])
		_manifest_valid = false
		return false

	_manifest_valid = true
	return true


## Return a baked atlas for (font_name, size), or an empty Dictionary
## if the manifest is stale/missing or the entry doesn't exist.
##
## Returned dictionary shape on success:
##   {
##     "texture":  Texture2D,
##     "cell_w":   int,
##     "cell_h":   int,
##     "char_map": Dictionary[String, int],
##     "gi_table": PackedInt32Array,
##   }
##
## On miss the caller should fall back to `GlyphAtlasBuilder.build_atlas()`.
static func get_atlas(font_name: String, size: int) -> Dictionary:
	if not load_manifest():
		return {}

	var key: String = "%s_%d" % [font_name, size]
	var entries: Dictionary = _manifest.get("entries", {})
	if not entries.has(key):
		push_warning("[FontAtlasCache] no baked entry for '%s'" % key)
		return {}

	var entry: Dictionary = entries[key]
	var tex: Texture2D = _tex_cache.get(key)
	if tex == null:
		var png_rel: String = String(entry.get("png", ""))
		var png_path: String = ATLAS_DIR + "/" + png_rel
		tex = load(png_path) as Texture2D
		if tex == null:
			push_error("[FontAtlasCache] failed to load %s" % png_path)
			return {}
		_tex_cache[key] = tex

	return {
		"texture":  tex,
		"cell_w":   int(entry.get("cell_w", 0)),
		"cell_h":   int(entry.get("cell_h", 0)),
		"char_map": get_char_map(),
		"gi_table": get_gi_table(),
	}


## Shared char_map. Identical for every baked atlas; computed once.
static func get_char_map() -> Dictionary:
	if _char_map_cache.is_empty():
		_char_map_cache = GlyphAtlasBuilder.build_char_map()
	return _char_map_cache


## Shared gi_table — codepoint -> slot index. Identical for every baked
## atlas (they all use the same CHARSET). Computed once.
static func get_gi_table() -> PackedInt32Array:
	if _gi_table_cache.is_empty():
		var cm: Dictionary = get_char_map()
		var max_cp: int = 0
		for ch in cm:
			var cp: int = ch.unicode_at(0)
			if cp > max_cp:
				max_cp = cp
		_gi_table_cache.resize(max_cp + 1)
		_gi_table_cache.fill(0)
		for ch in cm:
			_gi_table_cache[ch.unicode_at(0)] = cm[ch]
	return _gi_table_cache


## Drop all cached state. Call if you've rebaked at runtime (rare).
static func clear() -> void:
	_manifest = {}
	_manifest_loaded = false
	_manifest_valid = false
	_tex_cache.clear()
	_char_map_cache.clear()
	_gi_table_cache = PackedInt32Array()
