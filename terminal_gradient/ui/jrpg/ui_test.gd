class_name JrpgUiTest
extends Control
## Self-contained gallery scene that exercises every primitive and screen
## layout from the JRPG UI handoff. Driven externally via handle_action(),
## so it can be hosted inside the existing BaseScreen state machine.

signal exit_requested()

const Primitives := {
	"JWindow": preload("res://ui/jrpg/primitives/j_window.gd"),
	"JMenu": preload("res://ui/jrpg/primitives/j_menu.gd"),
	"JBar": preload("res://ui/jrpg/primitives/j_bar.gd"),
	"Slot": preload("res://ui/jrpg/primitives/slot.gd"),
	"Portrait": preload("res://ui/jrpg/primitives/portrait.gd"),
}

const NAV_ITEMS := [
	{"text": "COMPONENTS", "action": "components"},
	{"text": "TITLE", "action": "title"},
	{"text": "MAIN MENU", "action": "main_menu"},
	{"text": "DIALOGUE", "action": "dialogue"},
	{"text": "CONVO (2)", "action": "convo2"},
	{"text": "CONVO (GROUP)", "action": "convo_group"},
	{"text": "BATTLE", "action": "battle"},
	{"text": "STATUS", "action": "status"},
	{"text": "INVENTORY", "action": "inventory"},
	{"text": "MAGIC", "action": "magic"},
	{"text": "EQUIP", "action": "equip"},
	{"text": "SHOP", "action": "shop"},
	{"text": "SAVE", "action": "save"},
	{"text": "WORLD MAP", "action": "world_map"},
	{"text": "LEVEL UP", "action": "level_up"},
]

@onready var _nav_menu: Node = %Nav
@onready var _content_host: Control = %ContentHost
@onready var _crumb_label: Label = %Crumb

var _atb_bars: Array = []  # battle ATB bars for animation
var _atb_t: float = 0.0
var _typewriter_target: RichTextLabel = null
var _typewriter_total: int = 0
var _typewriter_t: float = 0.0


func _ready() -> void:
	# Parent is the AsciiGrid (Node2D), not a Control, so anchors don't resolve
	# against a parent rect. Drive size directly from the viewport.
	_fit_to_viewport()
	var vp := get_viewport()
	if vp:
		vp.size_changed.connect(_fit_to_viewport)

	# Disable internal capture; the wrapper screen forwards actions instead.
	_nav_menu.capture_input = false
	_nav_menu.set_items(NAV_ITEMS)
	_nav_menu.item_chosen.connect(_on_nav_chosen)
	_nav_menu.selection_changed.connect(_on_nav_changed)
	_show_view(NAV_ITEMS[0].action)
	_crumb_label.text = NAV_ITEMS[0].text
	set_process(true)


func _fit_to_viewport() -> void:
	var vp := get_viewport()
	if vp == null:
		return
	# Reset anchors to 0 so the explicit size we set below isn't overwritten
	# by the layout pass (Godot warns otherwise).
	set_anchor(SIDE_LEFT, 0.0, false)
	set_anchor(SIDE_TOP, 0.0, false)
	set_anchor(SIDE_RIGHT, 0.0, false)
	set_anchor(SIDE_BOTTOM, 0.0, false)
	position = Vector2.ZERO
	size = Vector2(vp.size)


func handle_action(action: String) -> void:
	## Public entry point. Wrapper BaseScreen calls this for every input action.
	match action:
		"move_up":
			_nav_menu._step(-1)
		"move_down":
			_nav_menu._step(1)
		"interact":
			_nav_menu._confirm()
		"cancel":
			exit_requested.emit()


func _on_nav_changed(index: int) -> void:
	_crumb_label.text = NAV_ITEMS[index].text


func _on_nav_chosen(action: String, _index: int) -> void:
	_show_view(action)


func _show_view(view_name: String) -> void:
	for child in _content_host.get_children():
		child.queue_free()
	_atb_bars.clear()
	_typewriter_target = null

	var view: Control = null
	match view_name:
		"components": view = _build_components()
		"title": view = _build_title()
		"main_menu": view = _build_main_menu()
		"dialogue": view = _build_dialogue()
		"convo2": view = _build_convo(2)
		"convo_group": view = _build_convo(4)
		"battle": view = _build_battle()
		"status": view = _build_status()
		"inventory": view = _build_inventory()
		"magic": view = _build_magic()
		"equip": view = _build_equip()
		"shop": view = _build_shop()
		"save": view = _build_save()
		"world_map": view = _build_world_map()
		"level_up": view = _build_level_up()
	if view:
		view.anchor_right = 1.0
		view.anchor_bottom = 1.0
		view.offset_left = 0
		view.offset_top = 0
		view.offset_right = 0
		view.offset_bottom = 0
		_content_host.add_child(view)


func _process(delta: float) -> void:
	# Animate the battle ATB bars when the Battle view is up.
	if not _atb_bars.is_empty():
		_atb_t += delta
		for entry in _atb_bars:
			var bar: JBar = entry["bar"]
			var period: float = entry["period"]
			var phase: float = fmod(_atb_t + entry["offset"], period) / period
			bar.value = phase * bar.max_value

	# Typewriter for the Dialogue view.
	if _typewriter_target and is_instance_valid(_typewriter_target):
		_typewriter_t += delta
		_typewriter_target.visible_characters = mini(_typewriter_total, int(_typewriter_t * 38.0))


# ─── builders ──────────────────────────────────────────────────────────────

func _make_window(variant: int = 0) -> PanelContainer:
	var w := PanelContainer.new()
	match variant:
		1: w.theme_type_variation = &"JWindowTight"
		2: w.theme_type_variation = &"JWindowFlat"
	return w


func _make_label(text: String, variation: StringName = &"") -> Label:
	var l := Label.new()
	l.text = text
	if variation != &"":
		l.theme_type_variation = variation
	return l


func _make_bar(kind: int, w: float, h: float, max_v: float = 100.0, val: float = 100.0) -> JBar:
	var b := JBar.new()
	b.kind = kind
	b.custom_minimum_size = Vector2(w, h)
	b.max_value = max_v
	b.value = val
	return b


func _make_slot(text: String, secondary: String, w: float, h: float) -> Slot:
	var s := Slot.new()
	s.label_text = text
	s.label_secondary = secondary
	s.custom_minimum_size = Vector2(w, h)
	return s


# ─── Components gallery ────────────────────────────────────────────────────

func _build_components() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)

	var grid := VBoxContainer.new()
	grid.add_theme_constant_override("separation", 16)
	root.add_child(grid)

	# Row 1: Window variants
	var row1 := HBoxContainer.new()
	row1.add_theme_constant_override("separation", 16)
	grid.add_child(row1)
	for kv in [
		{"text": "JWindow · default", "v": 0},
		{"text": "JWindow · tight", "v": 1},
		{"text": "JWindow · flat", "v": 2},
	]:
		var w := _make_window(kv["v"])
		var l := _make_label(kv["text"])
		w.add_child(l)
		row1.add_child(w)

	# Row 2: Bars
	var row2 := _make_window(0)
	grid.add_child(row2)
	var bars_box := VBoxContainer.new()
	bars_box.add_theme_constant_override("separation", 10)
	row2.add_child(bars_box)
	bars_box.add_child(_make_label("JBar · HP / MP / XP", &"TextSM"))
	var hp_row := HBoxContainer.new()
	hp_row.add_theme_constant_override("separation", 12)
	bars_box.add_child(hp_row)
	hp_row.add_child(_make_label("HP", &"TextDim"))
	hp_row.add_child(_make_bar(JBar.Kind.HP, 240, 10, 100, 76))
	var mp_row := HBoxContainer.new()
	mp_row.add_theme_constant_override("separation", 12)
	bars_box.add_child(mp_row)
	mp_row.add_child(_make_label("MP", &"TextDim"))
	mp_row.add_child(_make_bar(JBar.Kind.MP, 240, 10, 100, 58))
	var xp_row := HBoxContainer.new()
	xp_row.add_theme_constant_override("separation", 12)
	bars_box.add_child(xp_row)
	xp_row.add_child(_make_label("XP", &"TextDim"))
	xp_row.add_child(_make_bar(JBar.Kind.XP, 240, 10, 100, 33))

	# Row 3: Slot + Portrait + JMenu sample
	var row3 := HBoxContainer.new()
	row3.add_theme_constant_override("separation", 16)
	grid.add_child(row3)

	row3.add_child(_make_slot("PORTRAIT", "VERRIN", 140, 140))
	row3.add_child(_make_slot("ENEMY · BONE KNIGHT", "", 200, 140))

	var menu_window := _make_window(0)
	row3.add_child(menu_window)
	var menu_box := VBoxContainer.new()
	menu_box.add_theme_constant_override("separation", 4)
	menu_window.add_child(menu_box)
	menu_box.add_child(_make_label("JMenu (preview)", &"TextSM"))
	var sample_menu := JMenu.new()
	sample_menu.capture_input = false
	sample_menu.set_items([
		{"text": "ATTACK", "action": ""},
		{"text": "MAGIC", "action": "", "submenu": true},
		{"text": "SKILL", "action": "", "submenu": true},
		{"text": "ITEM", "action": "", "submenu": true},
		{"text": "DEFEND", "action": ""},
		{"text": "FLEE", "action": "", "disabled": true},
	])
	menu_box.add_child(sample_menu)

	return root


# ─── Title ─────────────────────────────────────────────────────────────────

func _build_title() -> Control:
	var center := CenterContainer.new()

	var win := _make_window(0)
	win.custom_minimum_size = Vector2(420, 0)
	center.add_child(win)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 16)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	win.add_child(box)

	var title := _make_label("TERMINAL GRADIENT")
	title.theme_type_variation = &"TextXL"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)

	var subtitle := _make_label("an o'neill cylinder roguelike")
	subtitle.theme_type_variation = &"TextDim"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(subtitle)

	box.add_child(HSeparator.new())

	var menu := JMenu.new()
	menu.capture_input = false
	menu.set_items([
		{"text": "NEW GAME", "action": ""},
		{"text": "CONTINUE", "action": ""},
		{"text": "OPTIONS", "action": ""},
		{"text": "QUIT", "action": ""},
	])
	box.add_child(menu)

	return center


# ─── Main Menu ─────────────────────────────────────────────────────────────

func _build_main_menu() -> Control:
	var root := HBoxContainer.new()
	root.add_theme_constant_override("separation", 12)

	# Left side menu
	var side := _make_window(0)
	side.custom_minimum_size = Vector2(180, 0)
	side.size_flags_vertical = SIZE_EXPAND_FILL
	root.add_child(side)
	var side_box := VBoxContainer.new()
	side_box.add_theme_constant_override("separation", 6)
	side.add_child(side_box)
	side_box.add_child(_make_label("MENU", &"TextSM"))
	var side_menu := JMenu.new()
	side_menu.capture_input = false
	side_menu.set_items([
		{"text": "ITEM", "action": ""},
		{"text": "MAGIC", "action": ""},
		{"text": "EQUIP", "action": ""},
		{"text": "STATUS", "action": ""},
		{"text": "CONFIG", "action": ""},
		{"text": "SAVE", "action": ""},
	])
	side_box.add_child(side_menu)

	# Right column: party panel + footer windows
	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 12)
	right.size_flags_horizontal = SIZE_EXPAND_FILL
	right.size_flags_vertical = SIZE_EXPAND_FILL
	root.add_child(right)

	var party := _make_window(0)
	party.size_flags_horizontal = SIZE_EXPAND_FILL
	right.add_child(party)
	var party_box := VBoxContainer.new()
	party_box.add_theme_constant_override("separation", 8)
	party.add_child(party_box)
	party_box.add_child(_make_label("PARTY", &"TextSM"))
	for member in [
		{"n": "VERRIN", "lv": 17, "hp": [240, 240], "mp": [56, 80]},
		{"n": "OREN", "lv": 16, "hp": [202, 220], "mp": [110, 110]},
		{"n": "MIRELLE", "lv": 17, "hp": [188, 195], "mp": [70, 90]},
		{"n": "KAEL", "lv": 15, "hp": [149, 210], "mp": [22, 60]},
	]:
		party_box.add_child(_make_party_row(member))

	var footers := HBoxContainer.new()
	footers.add_theme_constant_override("separation", 12)
	right.add_child(footers)
	for kv in [
		{"title": "TIME", "value": "23:14"},
		{"title": "GOLD", "value": "12,480"},
		{"title": "STEPS", "value": "8,914"},
	]:
		var f := _make_window(1)
		f.size_flags_horizontal = SIZE_EXPAND_FILL
		footers.add_child(f)
		var fb := VBoxContainer.new()
		fb.add_theme_constant_override("separation", 2)
		f.add_child(fb)
		var t := _make_label(kv["title"], &"TextDim")
		t.theme_type_variation = &"TextXS"
		fb.add_child(t)
		var v := _make_label(kv["value"], &"TextLG")
		fb.add_child(v)

	return root


func _make_party_row(member: Dictionary) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)

	var p := _make_slot(member.n, "", 44, 44)
	row.add_child(p)

	var info := VBoxContainer.new()
	info.size_flags_horizontal = SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 2)
	row.add_child(info)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	info.add_child(head)
	head.add_child(_make_label(member.n))
	head.add_child(_make_label("LV %d" % member.lv, &"TextDim"))

	var hp_box := HBoxContainer.new()
	hp_box.add_theme_constant_override("separation", 8)
	info.add_child(hp_box)
	hp_box.add_child(_make_label("HP", &"TextDim"))
	var hp_bar := _make_bar(JBar.Kind.HP, 180, 8, member.hp[1], member.hp[0])
	hp_box.add_child(hp_bar)
	hp_box.add_child(_make_label("%d/%d" % [member.hp[0], member.hp[1]], &"TextSM"))

	var mp_box := HBoxContainer.new()
	mp_box.add_theme_constant_override("separation", 8)
	info.add_child(mp_box)
	mp_box.add_child(_make_label("MP", &"TextDim"))
	var mp_bar := _make_bar(JBar.Kind.MP, 180, 8, member.mp[1], member.mp[0])
	mp_box.add_child(mp_bar)
	mp_box.add_child(_make_label("%d/%d" % [member.mp[0], member.mp[1]], &"TextSM"))

	return row


# ─── Dialogue ──────────────────────────────────────────────────────────────

func _build_dialogue() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	root.add_child(col)

	# Expanding spacer at TOP — pushes the portrait + dialogue pair together
	# down to the bottom of the stage, JRPG-style.
	var top_spacer := Control.new()
	top_spacer.size_flags_vertical = SIZE_EXPAND_FILL
	col.add_child(top_spacer)

	# Portrait row — left-aligned, large.
	var p_row := HBoxContainer.new()
	p_row.add_theme_constant_override("separation", 0)
	p_row.size_flags_horizontal = SIZE_EXPAND_FILL
	col.add_child(p_row)
	var portrait := Portrait.new()
	portrait.portrait_name = "VERRIN"
	portrait.portrait_size = Vector2(280, 280)
	portrait.show_name_plate = false
	p_row.add_child(portrait)
	var h_spacer := Control.new()
	h_spacer.size_flags_horizontal = SIZE_EXPAND_FILL
	p_row.add_child(h_spacer)

	# Dialogue box — sits directly below the portrait, full width.
	var dlg := _make_window(0)
	dlg.size_flags_horizontal = SIZE_EXPAND_FILL
	col.add_child(dlg)

	var d_col := VBoxContainer.new()
	d_col.add_theme_constant_override("separation", 8)
	dlg.add_child(d_col)

	var header := HBoxContainer.new()
	header.size_flags_horizontal = SIZE_EXPAND_FILL
	d_col.add_child(header)
	header.add_child(_make_label("VERRIN", &"TextSM"))
	var header_spacer := Control.new()
	header_spacer.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(header_spacer)
	header.add_child(_make_label("1 / 3", &"TextDim"))

	var text := RichTextLabel.new()
	text.bbcode_enabled = true
	text.fit_content = false
	text.scroll_active = false
	text.custom_minimum_size = Vector2(0, 110)
	text.size_flags_horizontal = SIZE_EXPAND_FILL
	text.size_flags_vertical = SIZE_EXPAND_FILL
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.text = "The cylinder hums under us tonight. Whatever they sealed in the [color=#cccccc]inner core[/color] is leaking again — I can taste copper in the air all the way up here."
	d_col.add_child(text)
	_typewriter_target = text
	_typewriter_total = text.get_total_character_count()
	text.visible_characters = 0
	_typewriter_t = 0.0

	return root


# ─── Conversation (2 / group) ──────────────────────────────────────────────

func _build_convo(count: int) -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	root.add_child(col)

	# Expanding spacer at TOP — keeps portraits + dialogue together near the bottom.
	var top_spacer := Control.new()
	top_spacer.size_flags_vertical = SIZE_EXPAND_FILL
	col.add_child(top_spacer)

	# Portrait row:
	#   2-character convo → opposite sides (left + right, expand spacer between)
	#   3+ characters     → centered, evenly spaced
	var p_row := HBoxContainer.new()
	p_row.add_theme_constant_override("separation", 16)
	p_row.size_flags_horizontal = SIZE_EXPAND_FILL
	col.add_child(p_row)
	var names := ["VERRIN", "OREN", "MIRELLE", "KAEL"]
	var p_size := Vector2(220, 220) if count > 2 else Vector2(260, 260)
	var active_idx: int = 0
	if count == 2:
		var left := Portrait.new()
		left.portrait_name = names[0]
		left.portrait_size = p_size
		left.active = (active_idx == 0)
		left.show_name_plate = false
		p_row.add_child(left)
		var split := Control.new()
		split.size_flags_horizontal = SIZE_EXPAND_FILL
		p_row.add_child(split)
		var right := Portrait.new()
		right.portrait_name = names[1]
		right.portrait_size = p_size
		right.active = (active_idx == 1)
		right.show_name_plate = false
		p_row.add_child(right)
	else:
		p_row.alignment = BoxContainer.ALIGNMENT_CENTER
		for i in count:
			var p := Portrait.new()
			p.portrait_name = names[i]
			p.portrait_size = p_size
			p.active = (i == active_idx)
			p.show_name_plate = false
			p_row.add_child(p)

	# Dialogue box — sits directly below the portrait row, full width.
	var dlg := _make_window(0)
	dlg.size_flags_horizontal = SIZE_EXPAND_FILL
	col.add_child(dlg)

	var d_col := VBoxContainer.new()
	d_col.add_theme_constant_override("separation", 8)
	dlg.add_child(d_col)
	d_col.add_child(_make_label(names[active_idx], &"TextSM"))

	var text := RichTextLabel.new()
	text.bbcode_enabled = true
	text.fit_content = false
	text.scroll_active = false
	text.custom_minimum_size = Vector2(0, 96)
	text.size_flags_horizontal = SIZE_EXPAND_FILL
	text.size_flags_vertical = SIZE_EXPAND_FILL
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.text = "We don't have time to argue about it. Either the ring stays open or we burn — pick one."
	d_col.add_child(text)
	_typewriter_target = text
	_typewriter_total = text.get_total_character_count()
	text.visible_characters = 0
	_typewriter_t = 0.0

	return root


# ─── Battle ────────────────────────────────────────────────────────────────

func _build_battle() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 8)
	root.add_theme_constant_override("margin_top", 8)
	root.add_theme_constant_override("margin_right", 8)
	root.add_theme_constant_override("margin_bottom", 8)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	root.add_child(col)

	# Action bar
	var action_bar := _make_window(1)
	action_bar.size_flags_horizontal = SIZE_EXPAND_FILL
	col.add_child(action_bar)
	var ab_text := RichTextLabel.new()
	ab_text.bbcode_enabled = true
	ab_text.fit_content = true
	ab_text.size_flags_horizontal = SIZE_EXPAND_FILL
	ab_text.text = "[color=#ffffff]VERRIN[/color] attacks [color=#ffffff]SCAR WYRM[/color] — [color=#ffffff]247[/color] damage"
	action_bar.add_child(ab_text)

	# Viewport
	var viewport := _make_window(2)
	viewport.size_flags_horizontal = SIZE_EXPAND_FILL
	viewport.size_flags_vertical = SIZE_EXPAND_FILL
	viewport.custom_minimum_size = Vector2(0, 320)
	col.add_child(viewport)

	var viewport_inner := CenterContainer.new()
	viewport.add_child(viewport_inner)
	var enemies := HBoxContainer.new()
	enemies.add_theme_constant_override("separation", 40)
	enemies.alignment = BoxContainer.ALIGNMENT_CENTER
	viewport_inner.add_child(enemies)
	enemies.add_child(_make_slot("BONE KNIGHT", "", 150, 170))
	var wyrm := _make_slot("SCAR WYRM", "TARGET ▼", 210, 230)
	enemies.add_child(wyrm)
	enemies.add_child(_make_slot("CAVE BAT", "", 130, 130))

	# Bottom bar: command panel + party table
	var bottom := HBoxContainer.new()
	bottom.add_theme_constant_override("separation", 8)
	col.add_child(bottom)

	var cmd := _make_window(0)
	cmd.custom_minimum_size = Vector2(220, 0)
	bottom.add_child(cmd)
	var cmd_box := VBoxContainer.new()
	cmd_box.add_theme_constant_override("separation", 4)
	cmd.add_child(cmd_box)
	var cmd_head := HBoxContainer.new()
	cmd_box.add_child(cmd_head)
	cmd_head.add_child(_make_label("VERRIN", &"TextSM"))
	var sp := Control.new()
	sp.size_flags_horizontal = SIZE_EXPAND_FILL
	cmd_head.add_child(sp)
	cmd_head.add_child(_make_label("cmd", &"TextDim"))
	var cmd_menu := JMenu.new()
	cmd_menu.capture_input = false
	cmd_menu.set_items([
		{"text": "ATTACK", "action": ""},
		{"text": "MAGIC", "action": "", "submenu": true},
		{"text": "SKILL", "action": "", "submenu": true},
		{"text": "SUMMON", "action": "", "submenu": true},
		{"text": "ITEM", "action": "", "submenu": true},
		{"text": "DEFEND", "action": ""},
	])
	cmd_box.add_child(cmd_menu)

	var party := _make_window(0)
	party.size_flags_horizontal = SIZE_EXPAND_FILL
	bottom.add_child(party)
	var grid := GridContainer.new()
	grid.columns = 6
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 4)
	party.add_child(grid)
	for header in ["", "NAME", "HP", "MP", "LIMIT", "TIME"]:
		grid.add_child(_make_label(header, &"TextDim"))
	for member in [
		{"n": "VERRIN", "hp": [240, 240], "mp": [56, 80], "limit": 0.42, "time": 0.95, "period": 4.0, "offset": 0.0},
		{"n": "OREN", "hp": [202, 220], "mp": [110, 110], "limit": 0.10, "time": 0.62, "period": 4.5, "offset": 1.2},
		{"n": "MIRELLE", "hp": [188, 195], "mp": [70, 90], "limit": 0.78, "time": 0.30, "period": 5.0, "offset": 0.5},
		{"n": "KAEL", "hp": [149, 210], "mp": [22, 60], "limit": 0.05, "time": 1.00, "period": 3.5, "offset": 2.0},
	]:
		grid.add_child(_make_label("▶" if member.n == "VERRIN" else " "))
		grid.add_child(_make_label(member.n))
		var hp := HBoxContainer.new()
		hp.add_theme_constant_override("separation", 6)
		hp.add_child(_make_bar(JBar.Kind.HP, 90, 8, member.hp[1], member.hp[0]))
		hp.add_child(_make_label("%d" % member.hp[0], &"TextSM"))
		grid.add_child(hp)
		var mp := HBoxContainer.new()
		mp.add_theme_constant_override("separation", 6)
		mp.add_child(_make_bar(JBar.Kind.MP, 80, 8, member.mp[1], member.mp[0]))
		mp.add_child(_make_label("%d" % member.mp[0], &"TextSM"))
		grid.add_child(mp)
		grid.add_child(_make_bar(JBar.Kind.XP, 90, 8, 1.0, member.limit))
		var time_bar := _make_bar(JBar.Kind.HP, 110, 9, 1.0, member.time)
		time_bar.show_exclaim_when_full = true
		grid.add_child(time_bar)
		_atb_bars.append({"bar": time_bar, "period": member.period, "offset": member.offset})

	return root


# ─── Status / Inventory / Magic / Equip / Shop / Save / WorldMap / LevelUp ─

func _build_status() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)
	var win := _make_window(0)
	root.add_child(win)
	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 16)
	win.add_child(hbox)

	var portrait_col := VBoxContainer.new()
	portrait_col.add_theme_constant_override("separation", 8)
	hbox.add_child(portrait_col)
	var portrait := _make_slot("PORTRAIT", "VERRIN", 220, 260)
	portrait_col.add_child(portrait)
	portrait_col.add_child(_make_label("VERRIN", &"TextLG"))
	portrait_col.add_child(_make_label("RIDGEWALKER · LV 17", &"TextDim"))

	var stats := GridContainer.new()
	stats.columns = 2
	stats.add_theme_constant_override("h_separation", 24)
	stats.add_theme_constant_override("v_separation", 4)
	stats.size_flags_horizontal = SIZE_EXPAND_FILL
	hbox.add_child(stats)
	for kv in [
		["STR", "92"], ["VIT", "78"],
		["DEX", "61"], ["AGI", "70"],
		["INT", "44"], ["MND", "55"],
		["LUK", "33"], ["RES", "40"],
		["WEAPON", "BENT SABRE"], ["ARMOR", "PLATE COAT"],
		["ACC 1", "STONE RING"], ["ACC 2", "—"],
	]:
		stats.add_child(_make_label(kv[0], &"TextDim"))
		stats.add_child(_make_label(kv[1]))

	return root


func _build_inventory() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	root.add_child(col)

	# Tabs
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 0)
	col.add_child(tabs)
	for i in ["ALL", "WEAPONS", "ARMOR", "ACCESS", "ITEMS", "KEY"]:
		var t := _make_window(2)
		t.size_flags_horizontal = SIZE_EXPAND_FILL
		var l := _make_label(i, &"TextSM")
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		if i == "ITEMS":
			t.theme_type_variation = &""
		t.add_child(l)
		tabs.add_child(t)

	# Body: list + detail
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_vertical = SIZE_EXPAND_FILL
	col.add_child(body)

	var list_win := _make_window(0)
	list_win.size_flags_horizontal = SIZE_EXPAND_FILL
	list_win.size_flags_stretch_ratio = 0.6
	body.add_child(list_win)
	var list_box := VBoxContainer.new()
	list_box.add_theme_constant_override("separation", 4)
	list_win.add_child(list_box)
	for item in [
		{"name": "POTION", "qty": 12},
		{"name": "ETHER", "qty": 4},
		{"name": "PHOENIX DOWN", "qty": 2},
		{"name": "REMEDY", "qty": 5},
		{"name": "TENT", "qty": 1},
		{"name": "SMOKE CHARM", "qty": 3},
	]:
		var r := HBoxContainer.new()
		list_box.add_child(r)
		r.add_child(_make_label("▶" if item.name == "ETHER" else " "))
		var nm := _make_label(item.name)
		nm.size_flags_horizontal = SIZE_EXPAND_FILL
		r.add_child(nm)
		r.add_child(_make_label("× %d" % item.qty, &"TextDim"))

	var detail := _make_window(0)
	detail.size_flags_horizontal = SIZE_EXPAND_FILL
	detail.size_flags_stretch_ratio = 0.4
	body.add_child(detail)
	var d_col := VBoxContainer.new()
	d_col.add_theme_constant_override("separation", 6)
	detail.add_child(d_col)
	d_col.add_child(_make_label("ETHER", &"TextLG"))
	d_col.add_child(_make_label("Restores 50 MP to one ally.", &"TextDim"))
	d_col.add_child(HSeparator.new())
	d_col.add_child(_make_label("OWNED: 4", &"TextSM"))
	d_col.add_child(_make_label("VALUE: 320 GP", &"TextSM"))

	return root


func _build_magic() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	root.add_child(col)

	# Caster strip
	var strip := HBoxContainer.new()
	strip.add_theme_constant_override("separation", 8)
	col.add_child(strip)
	for n in ["VERRIN", "OREN", "MIRELLE", "KAEL"]:
		var w := _make_window(1 if n != "OREN" else 0)
		var l := _make_label(n, &"TextSM")
		w.add_child(l)
		strip.add_child(w)

	# Spell list + detail
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_vertical = SIZE_EXPAND_FILL
	col.add_child(body)

	var list_win := _make_window(0)
	list_win.size_flags_horizontal = SIZE_EXPAND_FILL
	list_win.size_flags_stretch_ratio = 0.55
	body.add_child(list_win)
	var lb := VBoxContainer.new()
	lb.add_theme_constant_override("separation", 4)
	list_win.add_child(lb)
	for sp in [
		{"name": "FIRA", "cost": 12},
		{"name": "BLIZZARA", "cost": 12},
		{"name": "THUNDARA", "cost": 12},
		{"name": "CURA", "cost": 22},
		{"name": "ESUNA", "cost": 14},
		{"name": "PROTECT", "cost": 12},
	]:
		var r := HBoxContainer.new()
		r.add_theme_constant_override("separation", 12)
		lb.add_child(r)
		r.add_child(_make_label("▶" if sp.name == "CURA" else " "))
		var n := _make_label(sp.name)
		n.size_flags_horizontal = SIZE_EXPAND_FILL
		r.add_child(n)
		r.add_child(_make_label("%d MP" % sp.cost, &"TextDim"))

	var detail := _make_window(0)
	detail.size_flags_horizontal = SIZE_EXPAND_FILL
	detail.size_flags_stretch_ratio = 0.45
	body.add_child(detail)
	var dc := VBoxContainer.new()
	dc.add_theme_constant_override("separation", 6)
	detail.add_child(dc)
	dc.add_child(_make_label("CURA", &"TextLG"))
	dc.add_child(_make_label("Mid-tier healing. Single target.", &"TextDim"))
	dc.add_child(HSeparator.new())
	dc.add_child(_make_label("POWER: 240 HP", &"TextSM"))
	dc.add_child(_make_label("RANGE: ALLY", &"TextSM"))
	dc.add_child(_make_label("COST: 22 MP", &"TextSM"))

	return root


func _build_equip() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	root.add_child(body)

	var slots_win := _make_window(0)
	slots_win.size_flags_horizontal = SIZE_EXPAND_FILL
	slots_win.size_flags_stretch_ratio = 0.55
	body.add_child(slots_win)
	var sc := VBoxContainer.new()
	sc.add_theme_constant_override("separation", 4)
	slots_win.add_child(sc)
	for s in [
		["RIGHT HAND", "BENT SABRE"],
		["LEFT HAND", "—"],
		["HEAD", "STEEL CAP"],
		["BODY", "PLATE COAT"],
		["ACC 1", "STONE RING"],
		["ACC 2", "—"],
	]:
		var r := HBoxContainer.new()
		r.add_theme_constant_override("separation", 12)
		sc.add_child(r)
		var n := _make_label(s[0], &"TextDim")
		n.custom_minimum_size = Vector2(120, 0)
		r.add_child(n)
		r.add_child(_make_label(s[1]))

	var stats_win := _make_window(0)
	stats_win.size_flags_horizontal = SIZE_EXPAND_FILL
	stats_win.size_flags_stretch_ratio = 0.45
	body.add_child(stats_win)
	var stats := GridContainer.new()
	stats.columns = 4
	stats.add_theme_constant_override("h_separation", 14)
	stats.add_theme_constant_override("v_separation", 4)
	stats_win.add_child(stats)
	for h in ["STAT", "NOW", "NEW", "Δ"]:
		stats.add_child(_make_label(h, &"TextDim"))
	for row in [
		["ATK", "118", "124", "+6"],
		["DEF", "96", "96", "0"],
		["M.ATK", "44", "44", "0"],
		["M.DEF", "52", "55", "+3"],
		["SPD", "70", "68", "−2"],
	]:
		stats.add_child(_make_label(row[0], &"TextDim"))
		stats.add_child(_make_label(row[1]))
		stats.add_child(_make_label(row[2]))
		stats.add_child(_make_label(row[3]))

	return root


func _build_shop() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	root.add_child(col)

	# Header strip
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	col.add_child(header)
	var who := _make_window(1)
	who.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(who)
	var who_box := VBoxContainer.new()
	who.add_child(who_box)
	who_box.add_child(_make_label("KOLM'S WARES", &"TextLG"))
	who_box.add_child(_make_label("Provisioner of dust and rope.", &"TextDim"))
	var gold := _make_window(1)
	header.add_child(gold)
	var gb := VBoxContainer.new()
	gold.add_child(gb)
	var gl := _make_label("GOLD", &"TextDim")
	gl.theme_type_variation = &"TextXS"
	gb.add_child(gl)
	gb.add_child(_make_label("12,480", &"TextLG"))

	# Tabs
	var tabs := HBoxContainer.new()
	col.add_child(tabs)
	for t in ["BUY", "SELL"]:
		var w := _make_window(2 if t == "SELL" else 0)
		w.size_flags_horizontal = SIZE_EXPAND_FILL
		var l := _make_label(t, &"TextSM")
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		w.add_child(l)
		tabs.add_child(w)

	# Body
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_vertical = SIZE_EXPAND_FILL
	col.add_child(body)

	var table_win := _make_window(0)
	table_win.size_flags_horizontal = SIZE_EXPAND_FILL
	table_win.size_flags_stretch_ratio = 0.6
	body.add_child(table_win)
	var table := GridContainer.new()
	table.columns = 3
	table.add_theme_constant_override("h_separation", 16)
	table.add_theme_constant_override("v_separation", 3)
	table_win.add_child(table)
	for h in ["ITEM", "STOCK", "PRICE"]:
		table.add_child(_make_label(h, &"TextDim"))
	for row in [
		["POTION", "∞", "80"],
		["ETHER", "12", "320"],
		["PHOENIX DOWN", "4", "920"],
		["SMOKE CHARM", "6", "150"],
		["TENT", "9", "420"],
	]:
		table.add_child(_make_label(row[0]))
		table.add_child(_make_label(row[1]))
		table.add_child(_make_label(row[2]))

	var detail := _make_window(0)
	detail.size_flags_horizontal = SIZE_EXPAND_FILL
	detail.size_flags_stretch_ratio = 0.4
	body.add_child(detail)
	var dc := VBoxContainer.new()
	dc.add_theme_constant_override("separation", 6)
	detail.add_child(dc)
	dc.add_child(_make_label("PHOENIX DOWN", &"TextLG"))
	dc.add_child(_make_label("Revives one fallen ally with 25% HP.", &"TextDim"))
	dc.add_child(HSeparator.new())
	dc.add_child(_make_label("OWNED: 2", &"TextSM"))
	dc.add_child(_make_label("PRICE: 920 GP", &"TextSM"))

	return root


func _build_save() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)
	var win := _make_window(0)
	root.add_child(win)
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 8)
	win.add_child(list)
	list.add_child(_make_label("SAVE / LOAD", &"TextLG"))
	for slot in [
		{"id": "01", "name": "VERRIN · LV 17", "loc": "Inner Ring · Sector 4", "time": "14:22:08"},
		{"id": "02", "name": "VERRIN · LV 12", "loc": "Outer Ring · Foundry", "time": "08:11:47"},
		{"id": "03", "name": "—", "loc": "EMPTY", "time": ""},
		{"id": "04", "name": "—", "loc": "EMPTY", "time": ""},
	]:
		var w := _make_window(2)
		list.add_child(w)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 16)
		w.add_child(row)
		var id_label := _make_label("#%s" % slot.id, &"TextDim")
		id_label.custom_minimum_size = Vector2(40, 0)
		row.add_child(id_label)
		var center_col := VBoxContainer.new()
		center_col.size_flags_horizontal = SIZE_EXPAND_FILL
		row.add_child(center_col)
		center_col.add_child(_make_label(slot.name))
		center_col.add_child(_make_label(slot.loc, &"TextDim"))
		row.add_child(_make_label(slot.time, &"TextDim"))

	return root


func _build_world_map() -> Control:
	var root := MarginContainer.new()
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 16)
	root.add_theme_constant_override("margin_right", 16)
	root.add_theme_constant_override("margin_bottom", 16)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	root.add_child(body)
	var map := _make_slot("WORLD MAP", "AETHER QUEST · O'NEILL CYLINDER", 0, 0)
	map.size_flags_horizontal = SIZE_EXPAND_FILL
	map.size_flags_vertical = SIZE_EXPAND_FILL
	map.size_flags_stretch_ratio = 0.7
	body.add_child(map)

	var legend := _make_window(0)
	legend.size_flags_horizontal = SIZE_EXPAND_FILL
	legend.size_flags_stretch_ratio = 0.3
	body.add_child(legend)
	var lc := VBoxContainer.new()
	lc.add_theme_constant_override("separation", 6)
	legend.add_child(lc)
	lc.add_child(_make_label("LEGEND", &"TextLG"))
	for kv in [
		["▲", "SETTLEMENT"],
		["■", "RUIN"],
		["◆", "ANOMALY"],
		["○", "TRADE POST"],
		["✦", "OBJECTIVE"],
	]:
		var r := HBoxContainer.new()
		r.add_theme_constant_override("separation", 10)
		lc.add_child(r)
		var g := _make_label(kv[0])
		g.custom_minimum_size = Vector2(24, 0)
		r.add_child(g)
		r.add_child(_make_label(kv[1], &"TextDim"))

	return root


func _build_level_up() -> Control:
	var root := Control.new()
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(center)

	var win := _make_window(0)
	win.custom_minimum_size = Vector2(420, 0)
	center.add_child(win)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	win.add_child(box)

	var title := _make_label("LEVEL UP!", &"TextXL")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	box.add_child(_make_label("VERRIN reached LV 17.", &"TextDim"))
	box.add_child(HSeparator.new())
	var stats := GridContainer.new()
	stats.columns = 3
	stats.add_theme_constant_override("h_separation", 24)
	box.add_child(stats)
	for row in [
		["HP", "230 → 240", "+10"],
		["MP", "72 → 80", "+8"],
		["STR", "88 → 92", "+4"],
		["VIT", "74 → 78", "+4"],
		["AGI", "68 → 70", "+2"],
	]:
		stats.add_child(_make_label(row[0], &"TextDim"))
		stats.add_child(_make_label(row[1]))
		stats.add_child(_make_label(row[2]))

	return root
