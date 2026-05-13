# JRPG UI — Godot 4 Handoff

This package is a **visual + structural spec** for a minimal monochrome JRPG UI.
The HTML mockup is the source of truth for layout, sizing, and behavior;
this document maps every primitive 1:1 to Godot 4 nodes and resources.

---

## 0. Files in this repo

| File | Purpose |
|---|---|
| `JRPG UI Kit.html` | Live mockup (open in browser) — all styles inlined in `<style>` |
| `screens.jsx` | One React function per screen — read as **layout reference** |
| `ui-bits.jsx` | Primitives (`JWindow`, `JMenu`, `JBar`, `Slot`, `Typewriter`) |
| `app.jsx` | Mounts every screen in the design canvas |
| `HANDOFF.md` | **This file** — Godot port instructions |
| `tokens.json` | Design tokens (colors, font sizes, paddings) for codegen |

---

## 1. Design tokens

These map directly into `Theme.tres` constants/colors and `StyleBoxFlat` resources.

```
# Colors
bg              #0a0a0a   (root background)
fill            #1a1a1a   (window fill)
fill_2          #232323   (nested panel fill)
stroke_in       #ffffff   (visible 2px white edge)
stroke_out      #000000   (outer 2px black edge — second StyleBox or expand_margin)
text            #ffffff
text_dim        #8a8a8a
text_disabled   #3e3e3e
cursor          #ffffff

# Type — Pixelify Sans (Google Fonts), weight 400, NO antialias
font_xs   11   (spec / caption / dim labels)
font_sm   13/14
font_md   16/17
font_lg   18/20
font_xl   22+

# Strokes / spacing
stroke_in_w   2px   (every visible window border)
stroke_out_w  2px   (offset/expand outside the visible white)
window_pad    14px 16px   (default)
window_pad_t  8px  12px   (tight variant)
```

In Godot:
- Disable font smoothing: import the TTF/OTF with **Antialiasing = None** and **Hinting = None**.
- Force pixel-perfect: `Project Settings → Rendering → Textures → Default Texture Filter = Nearest`.

---

## 2. Window primitive (`JWindow`) → `PanelContainer`

The signature window is **2px black outer + 2px white inner + dark gray fill**.

In Godot, build it as a `PanelContainer` with a `StyleBoxFlat`:

```gdscript
# style_window.tres (StyleBoxFlat)
bg_color           = Color("#1a1a1a")
border_color       = Color("#ffffff")
border_width_*     = 2
expand_margin_*    = 2          # the black ring lives in the expand margin
shadow_color       = Color("#000000")
shadow_size        = 0
content_margin_*   = 14, 16, 14, 16   # left, top, right, bottom for default
```

The black ring is achieved by giving the `PanelContainer` an outer
`StyleBoxFlat` (use a wrapping `MarginContainer` + sibling `Panel`) **OR**,
simpler, set:

```gdscript
border_color = Color("#000000")
border_width_* = 4
# then draw the inner white via a child Panel that fills with 2px inset
```

Recommended: bake both rings into a single 9-slice `StyleBoxTexture`
generated from a 6×6 PNG of the exact frame in the HTML. This survives
scaling and is the cheapest at runtime.

Variants:
- `JWindow tight` → same box, content_margin = 8/12
- `JWindow flat` → same box, bg_color = `#232323`

---

## 3. Menu / cursor (`JMenu`) → `VBoxContainer` of `Button`

Each menu item is a `Button` (or `Label` + click area) with:
- 22px left padding to reserve cursor gutter
- Selected row: a `▶` glyph in a left-anchored `Label` blinking via `AnimationPlayer` (0.7s steps(2)).
- Disabled row: text color → `text_disabled`, mouse_filter = `IGNORE`.

The cursor character is `U+25B6 ▶`. Animate `modulate.a` between 1.0 and 0.0
on a 0.7-second step tween (no easing).

---

## 4. Bars (`JBar`) → `TextureProgressBar` or `Panel` + child `ColorRect`

Three flavors share the same outline (2px white, fill = bg). Only the inner fill differs:

| kind | fill |
|---|---|
| `hp` | solid white `ColorRect` |
| `mp` | 45° stripe — repeating-linear-gradient at 2px on / 2px off |
| `xp` | 0° stripe — repeating-linear-gradient at 2px on / 2px off |

Cleanest in Godot: a `Control` with custom `_draw()` that paints the stripe
pattern, OR a 4×4 tiling `Texture2D` set on a `TextureProgressBar`'s
`texture_progress`.

Default sizes: bars are typically 70/120/180px wide × 10px tall. For the FF7
battle Time bar use 110×9 with a `!` glyph appearing at the right edge when
filled.

---

## 5. Slot (`Slot`) → `TextureRect` placeholder

Every illustration in the mockup is rendered as an outlined dark rectangle
with an uppercase label inside (`PORTRAIT`, `ENEMY · BONE KNIGHT`, etc.).
At handoff each one becomes a `TextureRect` (or `Sprite2D` for animated).

In Godot, keep the placeholder PanelContainer subclass during development;
swap children in once art exists. Use the **label string** as the asset's
working name.

---

## 6. Screen → Scene mapping

Build one scene per screen. All screens use a 1:1 anchor to a fixed design
size; let the project's viewport stretch handle scaling.

| Mockup screen | Scene file | Root | Notes |
|---|---|---|---|
| Battle | `scenes/battle/Battle.tscn` | `Control` | See §7 |
| Dialogue (single) | `scenes/dialogue/Dialogue.tscn` | `Control` | One `Portrait` slot top-right + `DialogueBox` |
| Conversation (2) | `scenes/dialogue/Convo2.tscn` | `Control` | HBox of 2 `Portrait`, the active one bright |
| Conversation (group) | `scenes/dialogue/ConvoGroup.tscn` | `Control` | HBox of N `Portrait`; same active rules |
| Title | `scenes/menus/Title.tscn` | `Control` | Centered `JWindow` + menu |
| Main menu | `scenes/menus/MainMenu.tscn` | `Control` | Side menu + party panel + 3 footer windows |
| Status | `scenes/menus/Status.tscn` | `Control` | Single `JWindow` filling, sub-grids inside |
| Inventory | `scenes/menus/Inventory.tscn` | `Control` | Tabs + list (`ItemList`) + detail pane |
| Magic | `scenes/menus/Magic.tscn` | `Control` | Caster strip + spell list + detail pane |
| Equip | `scenes/menus/Equip.tscn` | `Control` | Slot list + stat compare table |
| Shop | `scenes/menus/Shop.tscn` | `Control` | Header strip + tabs + table + detail |
| Save / Load | `scenes/menus/Save.tscn` | `Control` | List of slot rows |
| World map | `scenes/menus/WorldMap.tscn` | `Control` | Big `Slot` for map texture + legend |
| Level up | `scenes/popups/LevelUp.tscn` | `Control` | Centered modal `JWindow` |
| Components | reference only | — | Don't port — it's the handoff sheet |

---

## 7. Battle screen — node tree

The battle is the most complex screen. Build it like this:

```
Battle (Control)
├─ MarginContainer  (8px)
│  └─ VBoxContainer  (separation 8)
│     ├─ ActionBar (PanelContainer · JWindow tight)
│     │  └─ HBoxContainer
│     │     └─ RichTextLabel  ("VERRIN attacks SCAR WYRM!")
│     ├─ Viewport (Panel · 2px white border, expand 2px black, bg #000)
│     │  └─ CenterContainer
│     │     └─ HBoxContainer  (separation 40)
│     │        ├─ Enemy_Bone   (Slot · 150x170)
│     │        ├─ Enemy_Wyrm   (Slot · 210x230 · target)
│     │        └─ Enemy_Bat    (Slot · 130x130)
│     │  └─ TargetCursor (Label "▼" · animated)
│     │  └─ DamageNumber (Label "247" · transient)
│     └─ BottomBar (HBoxContainer · separation 8)
│        ├─ CommandPanel (PanelContainer · width 220)
│        │  └─ VBoxContainer
│        │     ├─ HeaderRow (active actor name + "cmd")
│        │     └─ JMenu  (Attack / Magic ▶ / Skill ▶ / Summon ▶ / Item ▶ / Defend)
│        └─ PartyPanel (PanelContainer · stretch)
│           └─ GridContainer columns=6
│              (header row + one row per party member)
│              Columns: cursor | name | HP | MP | Limit bar | Time bar (+ "!")
```

### State machine — battle

Implement as a finite-state machine on the Battle root:

```
WAIT_INPUT      ATB ticking; first actor to fill picks a command
PICK_COMMAND    Command list focused; ←/→ moves cursor; Z confirms
PICK_TARGET     Targeting cursor on enemies; ←/→ cycles
RESOLVE_ACTION  Animate, deal damage, queue text in ActionBar
VICTORY / DEFEAT
```

Each command that opens a submenu (Magic ▶) pushes a sub-FSM that swaps
the command panel contents and consumes the same input. ATB pauses while
any submenu is open if you want classic FF "ATB Wait" mode; otherwise
keep it ticking for "Active" mode.

---

## 8. Dialogue / conversation

```
Dialogue (Control)
├─ PortraitRow (HBoxContainer · anchor bottom-right · separation 16)
│  └─ Portrait × N  (Slot · 216×216 each)
└─ DialogueBox (PanelContainer · JWindow · anchor bottom, full width)
   ├─ TextLabel (RichTextLabel · `bbcode_enabled = true`)
   └─ PageCounter (Label · top-right of box)
```

`Portrait` is a custom scene with three states driven by an exported
`active: bool`:

| state | filter / modulate | border color |
|---|---|---|
| active | `Color(1,1,1,1)` | `#ffffff` |
| inactive | `Color(0.32, 0.32, 0.32, 1)` (saturate down by darkening modulate) | `#3e3e3e` |

A `▼` blinker sits above the active portrait; a name plate (PanelContainer
with the same StyleBoxFlat) hangs off the bottom edge.

The typewriter effect is the standard `RichTextLabel.visible_characters`
tween from 0 to text length at a fixed chars-per-second rate (~38 cps).

---

## 9. Background grid (development only)

The mockup uses an alternating-green checker as a contrast/edge test
backdrop. **Do not port this** — it's purely a designer aid. In Godot,
each screen's root sits over whatever your gameplay scene draws (battle
backdrop, field map, etc.) or a solid `#0a0a0a`.

---

## 10. Input map (suggested)

```
ui_accept   →  Z, Enter, Gamepad A
ui_cancel   →  X, Escape, Gamepad B
ui_up/down/left/right → arrow keys + d-pad
ui_menu     →  C, Tab, Gamepad Start  (open main menu in field)
```

All menus must be reachable with **D-pad / arrows only** — no mouse
required.

---

## 11. Build order recommendation for Claude Code

1. `Theme.tres` with the StyleBoxFlats and font setup (§1, §2, §3)
2. Reusable scenes: `JWindow.tscn`, `JMenu.tscn`, `JBar.tscn`, `Slot.tscn`,
   `Portrait.tscn` (§2–5, §8)
3. `Title.tscn` (simplest screen — verifies theme works)
4. `MainMenu.tscn` (proves party panel + multi-window layout)
5. `Dialogue.tscn` + `Convo2.tscn` (proves typewriter + portrait states)
6. `Battle.tscn` with stub FSM (the centerpiece — §7)
7. Remaining menu screens
8. World map last (mostly art)

---

## 12. Acceptance checks

When porting any screen, the implementation passes when:
- Every window has the **2px white inner + 2px black outer** ring exactly.
- Window fills are `#1a1a1a`. No accent colors anywhere.
- Font is Pixelify Sans 400, no antialiasing.
- Every text size matches the token scale (no arbitrary px values).
- All `Slot` placeholders are present and labeled until art replaces them.
- Cursor blinks at 0.7s steps(2). Damage/notice blinks at 0.5–0.6s steps(2).
- Bars use the right pattern fill (HP solid, MP 45°, XP 0°).
- The screen reads identically at 1× and 2× viewport stretch.

---

*Source mockup: `JRPG UI Kit.html` — open it side-by-side while porting.*
