class_name UIShell
extends RefCounted
## Reusable pane/grid UI shell. Owns a list of panes (each with a normalized
## viewport rect and a content type) and renders them across three layers:
##
##   ASCII  → AsciiGrid text buffer (borders, monospace content)
##   RASTER → child TextureRect with the shared dither shader
##   TEXT   → child Label with autowrap
##   MENU   → vertical stack of child Labels styled like the title menu
##
## Borders and ASCII content are redrawn every frame from `draw()`. Labels
## and TextureRects are persistent children of AsciiGrid and only get rebuilt
## when `set_panes()` is called.

const PaneRasterShader: Shader = preload("res://assets/shaders/pane_raster.gdshader")

enum ContentType { ASCII, RASTER, TEXT, MENU }

const BORDER_FG: Color = Color(0.55, 0.60, 0.72)
# IMPORTANT: ascii_grid.gdshader treats (space char + pure black bg) as
# transparent so the title screen's fire layer can show through. The check
# is `bg.r < 0.01`, but ascii_grid uploads via `int(c * 255)` (truncation),
# which knocks 0.01 down to byte 2 = 0.00784 — still under the threshold.
# Use 0.02 → byte 5 → 0.0196, comfortably above 0.01 after the round-trip.
# Visually indistinguishable from pure black.
const OPAQUE_BLACK: Color = Color(0.02, 0.02, 0.02, 1.0)
const BORDER_BG: Color = OPAQUE_BLACK
const TITLE_FG: Color = Color(0.90, 1.0, 0.95)
const ASCII_FG: Color = Color(0.78, 0.83, 0.92)
const TEXT_FG: Color = Color(0.85, 0.90, 1.0)
const MENU_SELECT_OFFSET_PX: float = 12.0
const MENU_TWEEN_DURATION: float = 0.10


class Pane extends RefCounted:
	var rect: Rect2 = Rect2(0.0, 0.0, 1.0, 1.0)
	# Defaults to ContentType.ASCII (0). Inner classes can't see outer enums,
	# so the demo screen sets this explicitly via UIShell.ContentType.* anyway.
	var content_type: int = 0
	var border: bool = true
	var title: String = ""
	# ASCII
	var ascii_lines: PackedStringArray = PackedStringArray()
	var ascii_fg: Color = Color(0.78, 0.83, 0.92)
	# RASTER
	var texture: Texture2D
	# TEXT
	var text: String = ""
	# MENU
	var menu_items: PackedStringArray = PackedStringArray()
	var menu_selected: int = 0


var grid: AsciiGrid
var _menu_font: Font
var _panes: Array[Pane] = []
# Parallel to _panes; each entry is the Array of Node children that pane owns.
var _pane_nodes: Array = []
# Parallel to _panes; for MENU panes, the per-item base position so the
# selection-offset tween knows where to slide back to.
var _menu_base_positions: Array = []
var _menu_tween: Tween
var background_color: Color = OPAQUE_BLACK


func _init(ascii_grid: AsciiGrid) -> void:
	grid = ascii_grid
	_menu_font = load("res://assets/fonts/NotoSansMono-Medium.ttf")


# ── Public API ──────────────────────────────────────

func set_panes(panes: Array[Pane]) -> void:
	## Replace the entire pane list. Rebuilds Labels and TextureRects.
	_clear_nodes()
	_panes = panes
	for pane in _panes:
		var nodes: Array = []
		var bases: Array = []
		match pane.content_type:
			ContentType.RASTER:
				nodes = _build_raster_nodes(pane)
			ContentType.TEXT:
				nodes = _build_text_nodes(pane)
			ContentType.MENU:
				var built: Dictionary = _build_menu_nodes(pane)
				nodes = built.get("nodes", [])
				bases = built.get("bases", [])
			# ASCII has no persistent nodes; redrawn each frame in draw().
		_pane_nodes.append(nodes)
		_menu_base_positions.append(bases)
	_restyle_menus()


func set_menu_selection(pane_index: int, selected: int) -> void:
	## Update the selected index of a MENU pane and re-tween the buttons.
	if pane_index < 0 or pane_index >= _panes.size():
		return
	var pane: Pane = _panes[pane_index]
	if pane.content_type != ContentType.MENU:
		return
	pane.menu_selected = selected
	_restyle_menus()


func draw(_cols: int, _rows: int) -> void:
	## Render border + ASCII content into the text buffer. Call every frame
	## from the host screen's draw().
	# Black canvas under everything so unused cells don't show the default
	# FF blue and box interiors stay clean.
	grid.fill_region(0, 0, grid.cols, grid.rows, " ", background_color, background_color)
	for i in range(_panes.size()):
		var pane: Pane = _panes[i]
		var outer: Rect2i = _pane_cell_rect(pane)
		if outer.size.x < 2 or outer.size.y < 2:
			continue
		if pane.border:
			grid.draw_box(outer.position.x, outer.position.y,
					outer.size.x, outer.size.y, BORDER_FG, BORDER_BG)
			if pane.title != "":
				var label_text: String = " " + pane.title + " "
				if label_text.length() > outer.size.x - 2:
					label_text = label_text.substr(0, outer.size.x - 2)
				grid.draw_string_at(outer.position.x + 1, outer.position.y,
						label_text, TITLE_FG, BORDER_BG)
		if pane.content_type == ContentType.ASCII:
			_draw_ascii_pane(pane, _inner_cell_rect(pane, outer))


func clear() -> void:
	## Tear down all pane child nodes. Call from the host screen's on_exit().
	if _menu_tween:
		_menu_tween.kill()
		_menu_tween = null
	_clear_nodes()
	_panes.clear()


# ── Internals ───────────────────────────────────────

func _clear_nodes() -> void:
	for nodes in _pane_nodes:
		for n in nodes:
			if is_instance_valid(n):
				n.queue_free()
	_pane_nodes.clear()
	_menu_base_positions.clear()


func _pane_cell_rect(pane: Pane) -> Rect2i:
	var x: int = int(round(pane.rect.position.x * float(grid.cols)))
	var y: int = int(round(pane.rect.position.y * float(grid.rows)))
	var w: int = int(round(pane.rect.size.x * float(grid.cols)))
	var h: int = int(round(pane.rect.size.y * float(grid.rows)))
	return Rect2i(x, y, w, h)


func _inner_cell_rect(pane: Pane, outer: Rect2i) -> Rect2i:
	if not pane.border:
		return outer
	return Rect2i(outer.position.x + 1, outer.position.y + 1,
			maxi(0, outer.size.x - 2), maxi(0, outer.size.y - 2))


func _pane_inner_pixel_rect(pane: Pane) -> Rect2:
	## Inner pixel rect (excluding border) for child node positioning.
	var outer: Rect2i = _pane_cell_rect(pane)
	var inner: Rect2i = _inner_cell_rect(pane, outer)
	return Rect2(
		float(inner.position.x * grid.cell_width),
		float(inner.position.y * grid.cell_height),
		float(inner.size.x * grid.cell_width),
		float(inner.size.y * grid.cell_height),
	)


func _draw_ascii_pane(pane: Pane, inner: Rect2i) -> void:
	if inner.size.x <= 0 or inner.size.y <= 0:
		return
	var line_count: int = mini(pane.ascii_lines.size(), inner.size.y)
	for i in range(line_count):
		var raw: String = pane.ascii_lines[i]
		var visible: String = raw.substr(0, mini(raw.length(), inner.size.x))
		grid.draw_string_at(inner.position.x, inner.position.y + i,
				visible, pane.ascii_fg, background_color)


func _build_raster_nodes(pane: Pane) -> Array:
	var rect_px: Rect2 = _pane_inner_pixel_rect(pane)
	if pane.texture == null or rect_px.size.x <= 0.0 or rect_px.size.y <= 0.0:
		return []

	# Manual aspect-fit: compute the inner rect that the texture should
	# occupy at its natural aspect ratio, centered in the pane. We use a
	# Control wrapper with hard-fixed size as the TextureRect's parent —
	# letting Godot's layout/expand_mode rules try to size the TextureRect
	# directly was unreliable when the texture's natural size was much
	# larger than the target fit size (the rect kept ballooning to the
	# texture's natural dimensions and clipping at the pane edge).
	var tex_size: Vector2 = pane.texture.get_size()
	if tex_size.x <= 0.0 or tex_size.y <= 0.0:
		return []
	var tex_aspect: float = tex_size.x / tex_size.y
	var rect_aspect: float = rect_px.size.x / rect_px.size.y
	var fit_size: Vector2
	if tex_aspect > rect_aspect:
		fit_size = Vector2(rect_px.size.x, rect_px.size.x / tex_aspect)
	else:
		fit_size = Vector2(rect_px.size.y * tex_aspect, rect_px.size.y)
	var fit_pos: Vector2 = rect_px.position + (rect_px.size - fit_size) * 0.5

	# Wrapper Control: hard-fixed size, clip overflow, centred fit_pos.
	var holder := Control.new()
	holder.position = fit_pos
	holder.size = fit_size
	holder.custom_minimum_size = fit_size
	holder.clip_contents = true
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	grid.add_child(holder)

	var tr := TextureRect.new()
	tr.texture = pane.texture
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_SCALE
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var mat := ShaderMaterial.new()
	mat.shader = PaneRasterShader
	mat.set_shader_parameter("rect_size_px", fit_size)
	# Match the title screen exactly (title_screen.gd:_setup_shader): the
	# raster block is half a gfx cell wide and twice that tall, giving the
	# 1:2 fullblock aesthetic regardless of the host pane's size or the
	# surrounding text-cell density.
	var block_w: int = maxi(1, grid.g_cell_width / 2)
	var block_h: int = block_w * 2
	mat.set_shader_parameter("block_size", Vector2(float(block_w), float(block_h)))
	tr.material = mat

	# Add to tree first, THEN apply the full-rect preset so anchors compute
	# against the holder's actual size.
	holder.add_child(tr)
	tr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tr.size = fit_size
	return [holder]


func _build_text_nodes(pane: Pane) -> Array:
	var rect_px: Rect2 = _pane_inner_pixel_rect(pane)
	if rect_px.size.x <= 0.0 or rect_px.size.y <= 0.0:
		return []

	# Use a Control wrapper purely for clip_contents so anything that
	# overflows the inner pane area gets clipped at the parent level. The
	# child is a RichTextLabel because plain Label.autowrap is unreliable
	# when its parent isn't a Container — RichTextLabel always wraps to its
	# own size.
	var clip := Control.new()
	clip.position = rect_px.position
	clip.size = rect_px.size
	clip.clip_contents = true
	clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	grid.add_child(clip)

	var pad: float = 6.0
	var inner_w: float = maxf(0.0, rect_px.size.x - pad * 2.0)
	var inner_h: float = maxf(0.0, rect_px.size.y - pad * 2.0)
	var smaller: float = minf(rect_px.size.x, rect_px.size.y)
	var font_size: int = clampi(int(smaller * 0.05), 11, 16)

	var rtl := RichTextLabel.new()
	rtl.bbcode_enabled = false
	rtl.fit_content = false
	rtl.scroll_active = false
	rtl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rtl.position = Vector2(pad, pad)
	rtl.size = Vector2(inner_w, inner_h)
	rtl.custom_minimum_size = Vector2(inner_w, inner_h)
	rtl.add_theme_font_override("normal_font", _menu_font)
	rtl.add_theme_font_size_override("normal_font_size", font_size)
	rtl.add_theme_color_override("default_color", TEXT_FG)
	rtl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rtl.text = pane.text
	clip.add_child(rtl)
	return [clip]


func _build_menu_nodes(pane: Pane) -> Dictionary:
	var rect_px: Rect2 = _pane_inner_pixel_rect(pane)
	if rect_px.size.x <= 0.0 or rect_px.size.y <= 0.0 or pane.menu_items.is_empty():
		return {"nodes": [], "bases": []}
	var item_count: int = pane.menu_items.size()
	var smaller: float = minf(rect_px.size.x, rect_px.size.y)
	var font_size: int = clampi(int(smaller * 0.06), 12, 18)
	var line_h: float = _menu_font.get_height(font_size)
	var pad_v: float = float(font_size) * 0.25
	var item_h: float = line_h + pad_v * 2.0
	var gap: float = float(font_size) * 0.4
	var total_h: float = item_h * float(item_count) + gap * float(maxi(0, item_count - 1))
	var start_y: float = rect_px.position.y + maxf(0.0, (rect_px.size.y - total_h) * 0.5)
	# Leave room on the right so the slide-on-select offset stays inside.
	var inner_w: float = rect_px.size.x * 0.78
	var base_x: float = rect_px.position.x + (rect_px.size.x - inner_w) * 0.5 - MENU_SELECT_OFFSET_PX * 0.5

	var nodes: Array = []
	var bases: Array = []
	for i in range(item_count):
		var label := Label.new()
		label.text = pane.menu_items[i]
		label.add_theme_font_override("font", _menu_font)
		label.add_theme_font_size_override("font_size", font_size)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		var base_pos := Vector2(base_x, start_y + float(i) * (item_h + gap))
		label.position = base_pos
		label.size = Vector2(inner_w, item_h)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		grid.add_child(label)
		nodes.append(label)
		bases.append(base_pos)
	return {"nodes": nodes, "bases": bases}


func _restyle_menus() -> void:
	var any_menu := false
	for pane in _panes:
		if pane.content_type == ContentType.MENU:
			any_menu = true
			break
	if not any_menu:
		return
	if _menu_tween:
		_menu_tween.kill()
	_menu_tween = grid.create_tween().set_parallel(true)
	for i in range(_panes.size()):
		var pane: Pane = _panes[i]
		if pane.content_type != ContentType.MENU:
			continue
		var labels: Array = _pane_nodes[i]
		var bases: Array = _menu_base_positions[i] if i < _menu_base_positions.size() else []
		for j in range(labels.size()):
			var label: Label = labels[j]
			var selected: bool = (j == pane.menu_selected)
			MenuButtonStyle.apply(label, selected)
			if j < bases.size():
				var base_pos: Vector2 = bases[j]
				var target := base_pos + (Vector2(MENU_SELECT_OFFSET_PX, 0.0) if selected else Vector2.ZERO)
				_menu_tween.tween_property(label, "position", target, MENU_TWEEN_DURATION) \
					.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
