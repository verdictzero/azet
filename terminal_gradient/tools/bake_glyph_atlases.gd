@tool
extends EditorScript
## Bake per-font glyph atlases to disk as alpha-mask PNGs.
##
## Run from the Godot Script Editor: File → Run (Ctrl+Shift+X).
##
## For each (font, size) in the matrix below, rasterizes the full
## GlyphAtlasBuilder.CHARSET into a 16×16 grid of white-on-transparent
## glyph cells and saves the result to:
##
##     res://assets/glyph_atlases/{font_name}_{size}.png
##
## A sidecar manifest at:
##
##     res://assets/glyph_atlases/manifest.json
##
## records cell dimensions and a hash of the live CHARSET. FontAtlasCache
## checks the hash at runtime and falls back to live rasterization if the
## baked PNGs have gone stale (someone edited CHARSET without rebaking).
##
## Cell dimensions are measured using the PRIMARY MONO font for every
## entry — this keeps every atlas slot-compatible so a single shader +
## cell_data texture can address any atlas interchangeably. Non-mono
## specialty fonts (Cuneiform, Egyptian, etc.) may have glyphs that
## extend past the cell or don't cover many ASCII codepoints; that's
## acceptable for lore/inscription use where the swap is a scoped
## artistic choice.

const OUT_DIR := "res://assets/glyph_atlases"
const MANIFEST_PATH := OUT_DIR + "/manifest.json"

# font_name -> resource path. Order is only for deterministic output.
# Keep `primary` first so log output is easy to scan.
const FONT_PATHS := {
	"primary":      "res://assets/fonts/Noto_Sans_Mono/static/NotoSansMono-Medium.ttf",
	"primary_bold": "res://assets/fonts/Noto_Sans_Mono/static/NotoSansMono-SemiBold.ttf",
	"menu":         "res://assets/fonts/Noto_Sans/static/NotoSans-Medium.ttf",
	"symbols2":     "res://assets/fonts/Noto_Sans_Symbols_2/NotoSansSymbols2-Regular.ttf",
	"math":         "res://assets/fonts/Noto_Sans_Math/NotoSansMath-Regular.ttf",
	# Specialty scripts (mirrors FontLibrary.SPECIALTY).
	"cuneiform":            "res://assets/fonts/Noto_Sans_Cuneiform/NotoSansCuneiform-Regular.ttf",
	"egyptian":             "res://assets/fonts/Noto_Sans_Egyptian_Hieroglyphs/NotoSansEgyptianHieroglyphs-Regular.ttf",
	"hatran":               "res://assets/fonts/Noto_Sans_Hatran/NotoSansHatran-Regular.ttf",
	"linear_b":             "res://assets/fonts/Noto_Sans_Linear_B/NotoSansLinearB-Regular.ttf",
	"lycian":               "res://assets/fonts/Noto_Sans_Lycian/NotoSansLycian-Regular.ttf",
	"masaram":              "res://assets/fonts/Noto_Sans_Masaram_Gondi/NotoSansMasaramGondi-Regular.ttf",
	"mayan":                "res://assets/fonts/Noto_Sans_Mayan_Numerals/NotoSansMayanNumerals-Regular.ttf",
	"ogham":                "res://assets/fonts/Noto_Sans_Ogham/NotoSansOgham-Regular.ttf",
	"arabian":              "res://assets/fonts/Noto_Sans_Old_South_Arabian/NotoSansOldSouthArabian-Regular.ttf",
	"runic":                "res://assets/fonts/Noto_Sans_Runic/NotoSansRunic-Regular.ttf",
	"signwriting":          "res://assets/fonts/Noto_Sans_SignWriting/NotoSansSignWriting-Regular.ttf",
	"canadian_aboriginal":  "res://assets/fonts/Noto_Sans_Canadian_Aboriginal/static/NotoSansCanadianAboriginal-Regular.ttf",
	"japanese":             "res://assets/fonts/Noto_Sans_JP/static/NotoSansJP-Regular.ttf",
}

# Sizes the runtime grid uses (16 px text buffer, 8 px gfx buffer).
const SIZES: Array[int] = [16, 8]


func _run() -> void:
	print("[bake_glyph_atlases] start")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT_DIR))

	var parent: Node = EditorInterface.get_base_control()
	if parent == null:
		push_error("[bake_glyph_atlases] EditorInterface.get_base_control() returned null")
		return

	var primary_font: Font = load(FONT_PATHS["primary"]) as Font
	if primary_font == null:
		push_error("[bake_glyph_atlases] failed to load primary font at %s" % FONT_PATHS["primary"])
		return

	# Measure cell dims ONCE per size using the primary mono font so every
	# baked atlas is slot-compatible with the runtime grid.
	var cell_dims: Dictionary = {}
	for size in SIZES:
		cell_dims[size] = _measure_cell_dims(primary_font, size)
		var d: Vector2i = cell_dims[size]
		print("[bake_glyph_atlases] size=%d cell=%dx%d" % [size, d.x, d.y])

	var entries: Dictionary = {}
	var ok_count: int = 0
	var fail_count: int = 0

	for font_name in FONT_PATHS.keys():
		var path: String = FONT_PATHS[font_name]
		var font: Font = load(path) as Font
		if font == null:
			push_warning("[bake_glyph_atlases] skip '%s' — failed to load %s" % [font_name, path])
			fail_count += 1
			continue

		# Log codepoints the font doesn't cover (will render as tofu).
		_log_coverage(font_name, font)

		for size in SIZES:
			var d: Vector2i = cell_dims[size]
			var cell_w: int = d.x
			var cell_h: int = d.y
			var img: Image = await GlyphAtlasBuilder._rasterize_to_image(font, size, cell_w, cell_h, parent)

			# Self-check dimensions and the transparent slot-0 invariant.
			var expected_w: int = GlyphAtlasBuilder.ATLAS_COLS * cell_w
			var expected_h: int = GlyphAtlasBuilder.ATLAS_ROWS * cell_h
			assert(img.get_width() == expected_w, "atlas width mismatch for %s_%d" % [font_name, size])
			assert(img.get_height() == expected_h, "atlas height mismatch for %s_%d" % [font_name, size])
			# Slot 0 = space; sample its center — must be transparent.
			var mid_px: Color = img.get_pixel(cell_w / 2, cell_h / 2)
			if mid_px.a > 0.01:
				push_warning("[bake_glyph_atlases] %s_%d: slot 0 (space) not transparent (a=%.3f)" % [font_name, size, mid_px.a])

			var png_name: String = "%s_%d.png" % [font_name, size]
			var png_path: String = OUT_DIR + "/" + png_name
			var save_err: Error = img.save_png(ProjectSettings.globalize_path(png_path))
			if save_err != OK:
				push_error("[bake_glyph_atlases] failed saving %s (err=%d)" % [png_path, save_err])
				fail_count += 1
				continue

			entries["%s_%d" % [font_name, size]] = {
				"font": font_name,
				"font_size": size,
				"cell_w": cell_w,
				"cell_h": cell_h,
				"png": png_name,
			}
			ok_count += 1
			print("[bake_glyph_atlases] wrote %s (%dx%d)" % [png_path, expected_w, expected_h])

	# Write manifest.
	var manifest: Dictionary = {
		"charset_hash": GlyphAtlasBuilder.charset_hash(),
		"atlas_cols": GlyphAtlasBuilder.ATLAS_COLS,
		"atlas_rows": GlyphAtlasBuilder.ATLAS_ROWS,
		"entries": entries,
	}
	var f := FileAccess.open(MANIFEST_PATH, FileAccess.WRITE)
	if f == null:
		push_error("[bake_glyph_atlases] failed to open manifest for write at %s" % MANIFEST_PATH)
		return
	f.store_string(JSON.stringify(manifest, "\t"))
	f.close()
	print("[bake_glyph_atlases] wrote %s (%d entries)" % [MANIFEST_PATH, entries.size()])

	# Ask Godot to rescan so the new PNGs are imported immediately.
	EditorInterface.get_resource_filesystem().scan()

	print("[bake_glyph_atlases] done: %d ok, %d failed" % [ok_count, fail_count])


static func _measure_cell_dims(primary: Font, size: int) -> Vector2i:
	# Matches AsciiGrid._measure_char_width + cell_height rule.
	var w: int = int(ceilf(primary.get_string_size("M", HORIZONTAL_ALIGNMENT_LEFT, -1, size).x))
	if w < 1:
		w = int(float(size) * 0.6)
	var h: int = int(ceilf(float(size) * 1.35))
	if h < 1:
		h = size
	return Vector2i(w, h)


static func _log_coverage(font_name: String, font: Font) -> void:
	var missing: PackedInt32Array = PackedInt32Array()
	for ch in GlyphAtlasBuilder.CHARSET:
		var cp: int = ch.unicode_at(0)
		if not font.has_char(cp):
			missing.append(cp)
	if missing.size() == 0:
		return
	var sample: String = ""
	var n: int = mini(missing.size(), 10)
	for i in range(n):
		sample += "U+%04X " % missing[i]
	push_warning("[bake_glyph_atlases] '%s' missing %d/%d glyphs (sample: %s…)" % [
		font_name, missing.size(), GlyphAtlasBuilder.CHARSET.size(), sample
	])
