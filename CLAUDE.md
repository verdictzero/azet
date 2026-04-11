# CLAUDE.md — Terminal Gradient

ASCII roguelike set in an O'Neill cylinder space colony. **Godot 4.6** project
using the `gl_compatibility` renderer, 1280×720 SubViewport. Actively being
rewritten from a JS prototype — most `.gd` files still carry "Ported from
js/..." comments pointing at `__legacy/`.

## Top-level layout

- `terminal_gradient/` — **the only live code.** All work happens here.
- `__legacy/` — frozen JS prototype. Reference only, do not edit. The
  SaveMgr export format is intentionally cross-compatible with it.
- Main scene: `res://rendering/ascii_grid.tscn` → `main_scene.gd` calls
  `GameMgr.initialize(ascii_grid)` → starts at `State.TITLE_SCREEN`.

```
terminal_gradient/
  project.godot              -- autoloads, input map, gl_compatibility
  autoloads/                 -- EventBus, InputMgr, TimeMgr, AudioMgr, SaveMgr, GameMgr
  core/                      -- Constants, SeededRNG, PerlinNoise, CellularNoise, AStar, MathUtils
  rendering/
    ascii_grid.gd/.tscn      -- GPU dual-buffer grid renderer (the heart of the engine)
    glyph_atlas_builder.gd   -- async 16x16 glyph atlas via SubViewport
    atlas_drawer.gd          -- used by GlyphAtlasBuilder
    main_scene.gd            -- wires GameMgr to the AsciiGrid
  ui/
    ui_manager.gd            -- screen registry, screen stack, message log, HUD frame
    components/              -- cursor_list, ff_panel, hp_bar, word_wrap
    screens/                 -- BaseScreen + per-state screen classes
    shell/                   -- UIShell pane system, PaneLayout, MenuButtonStyle
  assets/
    fonts/NotoSansMono-Medium.ttf  -- the only UI font
    graphics/                -- tg_main_title.png, tg_sefirot_title_6.png (active)
    music/aq_*.ogg           -- referenced by AudioMgr.TRACKS
    shaders/                 -- see "Shaders" below
```

## Autoloads

Registered in `project.godot [autoload]`. All are global singletons accessed
by the names below (plain scripts, no `class_name`).

- **EventBus** — global signal hub. Systems emit/subscribe here without knowing
  about each other: `state_changed`, `player_moved`, `enemy_defeated`,
  `quest_accepted`, `weather_changed`, `message_logged`, etc.
- **InputMgr** — unified action queue. Held-key tracking via A/B dict swap
  (zero alloc); key-repeat for direction actions (220 ms delay, 90 ms
  interval); gamepad analog sticks injected as direction actions. Consumed
  once per frame by `GameMgr._process` → `ui_manager.handle_active_input`.
- **TimeMgr** — game clock. 1 hour = 30 real seconds. Day/night cycle with
  time-of-day tint colors.
- **AudioMgr** — dual-player crossfade music manager. Track keys live in
  `TRACKS` dict; `play("OVERWORLD_DAY")` crossfades smoothly.
- **SaveMgr** — JSON saves at `user://saves/slot_N.json` plus XOR+base64
  export/import for shareable strings. The cipher operates on raw bytes via
  `Marshalls.raw_to_base64`, **not** UTF-8 string XOR, to match JS
  `btoa/atob` behavior.
- **GameMgr** — central state machine. Owns UIManager, the SeededRNG,
  `turn_count`, and the main render loop: `begin_frame → ui_manager.draw_active
  → end_frame`. Routes screen action requests via `_handle_screen_action`.

## State machine

`GameMgr.State` is one big enum for every screen + every gameplay mode
(PREAMBLE, MENU, TITLE_SCREEN, UI_SHELL_DEMO, FIRE_DEMO, CHAR_CREATE, LOADING,
OVERWORLD, LOCATION, DUNGEON, COMBAT, DIALOGUE, SHOP, INVENTORY, CHARACTER,
QUEST_LOG, MAP, SETTINGS, GAME_OVER, …). **Most gameplay states don't have
screens registered yet** — only the title flow + demos are wired up.

- `set_state(new_state)` — clears input, replaces the screen stack, emits
  `state_changed`, runs a short fade transition.
- `push_overlay(state, ctx)` / `pop_overlay()` — for modal screens (inventory
  over world, dialogue over exploration). These drive
  `UIManager._screen_stack`.

## Rendering pipeline — `AsciiGrid` is the core

One `Node2D` with two overlapping `ColorRect`s, each driven by a fragment
shader that reads per-cell data from small textures. Frame lifecycle:

1. `begin_frame()` — clears both text + gfx buffers
2. Active screen's `draw()` writes cells via `set_char / set_gfx_char /
   draw_string_at / draw_box / fill_region / draw_world_tile`
3. `end_frame()` — A/B buffer diff check → upload data textures if dirty → swap

**Two cell grids overlaid on top of each other:**

- **Text buffer** — full-size font (`font_size=16`, NotoSansMono-Medium).
  HUD, menus, borders, dialogue.
- **Graphics buffer** — half-size font (`g_font_size ≈ 8`), 2× density.
  Lives inside the HUD frame (text buffer draws on top for FPS/HUD chrome).
- `TILE_DENSITY = 3`: one world tile = 3×3 graphics cells. `draw_world_tile`
  and `draw_entity_char` do the scaling.

**Glyph atlas** — `GlyphAtlasBuilder.build_atlas()` renders every glyph in
`CHARSET` (ASCII + box drawing + blocks + geometric + suits + arrows + math,
up to 256) into a 16×16 texture via a transient SubViewport. `_char_map` is
the `String → glyph_index` lookup. **The atlas is rebuilt on viewport resize,
and `atlas_generation` increments** — screens that installed custom shaders
watch this to re-run their setup (see `_setup_gen` pattern in `TitleScreen` /
`FireDemoScreen`).

**Data textures** — each cell's glyph index + FG color packed into one
RGBA8 texel of `_t_data_img`; BG into `_t_bg_img`. `ascii_grid.gdshader`
reads both and composites `mix(bg, fg, glyph_alpha)`.

**Double buffering** — `_t_chars_a/b`, `_t_fg_a/b`, `_t_bg_a/b` (and gfx
equivalents). `_buffers_differ()` skips GPU uploads when nothing changed.

**Custom shader escape hatch** — when a screen wants to replace ASCII
rendering entirely (title screen, fire demo, UI shell fire panes):

- `set_gfx_shader(shader)` swaps the gfx rect's shader. The new shader owns
  its own rendering; no data-texture uploads happen for that layer.
- `set_gfx_fullscreen(true)` expands the gfx rect to cover the whole
  viewport. Uses `ceili` on the grid dims so the shader covers every pixel —
  integer truncation used to leave a strip at the bottom.
- `set_gfx_shader_param(name, value)` pushes uniforms.
- `get_gfx_atlas()` returns the small glyph atlas so custom shaders can
  still do ASCII rendering (the fire shaders use this).
- `clear_gfx_shader()` restores the default pipeline. **Screens must call
  this in `on_exit`** or the next screen inherits a broken shader state.

### ⚠ Transparency gotcha — `OPAQUE_BLACK`

`ascii_grid.gdshader` treats `(glyph_index == 0 && bg.rgb < 0.01)` as
transparent so whatever is under the text buffer (fire layer, custom gfx
shader) shows through. **Don't pass pure black as a background unless you
actually want that cell transparent.** `UIShell.OPAQUE_BLACK` is
`Color(0.02, 0.02, 0.02)` — visually indistinguishable from pure black but
survives the `int(c * 255)` byte round-trip comfortably above the 0.01
threshold. Use it whenever you need an opaque cell background in a UI pane.

## Screen system

`BaseScreen` (`ui/screens/base_screen.gd`) — abstract:

- Lifecycle: `on_enter(context) → draw(cols, rows) → handle_input(action) → on_exit`
- Emits `action_requested(name, data)`. Screens **never** call `GameMgr`
  directly — they emit and `UIManager` forwards to
  `GameMgr._handle_screen_action(name, data)`.

`UIManager` (`ui/ui_manager.gd`) — screen registry + screen stack:

- `register_screen(state, screen)` — called from `GameMgr.initialize`
- `switch_screen(state)` — replaces the entire stack (normal transitions)
- `push_screen(state, ctx)` / `pop_screen()` — modal overlays
- `draw_active` / `handle_active_input` — always operate on the top of the stack
- Also owns the shared message log (`MAX_MESSAGES=500`, `VISIBLE_MESSAGES=5`)
  and the HUD frame drawing helpers.

**Currently wired-up screens:**

- `PreambleScreen` — "Press Here to Start" with CPU-side animated Voronoi
  background
- `MainMenuScreen` — CGA-style wide ASCII-art title box with traveling gold
  sheen (the legacy look, kept around for reference)
- `TitleScreen` — **current primary title.** Custom gfx shader
  (`title_screen.gdshader`) composites: fire background → particle layer
  (SubViewport) → dithered sefirot → dithered logo → gold wash. Menu items
  are native TTF `Label` nodes layered over the grid for crisp kerning.
  Re-runs `_setup_shader` whenever `grid.atlas_generation` changes.
- `UIShellDemoScreen` — exercises every pane/content-type combo (reachable
  from the title as "UI SHELL")
- `FireDemoScreen` — fullscreen GPU Voronoi fire + FPS counter

## UI Shell (`ui/shell/`) — reusable pane/grid system

`UIShell.new(ascii_grid)` gives you a pane layout engine that can mix four
content types in a single screen. Host pattern:

1. Build `Array[UIShell.Pane]` with content + normalized rect
2. `shell.set_panes(panes)` — builds persistent child nodes
3. `shell.draw(cols, rows)` from the host's `draw()` each frame
4. `shell.clear()` from `on_exit`

`UIShell.Pane` fields: `rect: Rect2` (0..1 viewport), `content_type: int`,
`border: bool`, `title: String`, plus per-type payload (`ascii_lines`,
`texture`, `text`, `menu_items`, `menu_selected`).

**Content types:**

- **ASCII** — drawn into the text buffer every frame via `_draw_ascii_pane`.
  No persistent child nodes.
- **RASTER** — `TextureRect` wrapped in a `Control` for hard aspect-fit
  (letting Godot's built-in expand/fit rules handle oversized textures was
  unreliable). Uses `pane_raster.gdshader` — fullblock 1:2 cells + `dither12`,
  matching the title screen's chunky raster look. Block size is derived from
  `g_cell_width` so it stays consistent with the surrounding text density.
- **TEXT** — `RichTextLabel` (not plain `Label` — autowrap is unreliable
  outside `Container`s), word-smart wrap, clipped to pane bounds via a
  wrapping `Control`.
- **MENU** — vertical stack of native `Label`s styled by `MenuButtonStyle`
  (black bg, 1 px colored border, color-only selection — no scale). Selection
  offset animates via a shared `Tween`. `menu_base_positions` remembers each
  item's base position so the slide-back-when-deselected tween works right.
- **FIRE** — `ColorRect` + `pane_fire.gdshader`. Uniforms pushed every frame
  from `_animate_fire_pane`: seed positions move in glyph-cell space scaled
  to the pane's own dimensions. Multiple fire panes of different sizes are
  fine; each owns its own `ShaderMaterial`.

`PaneLayout` — static factories returning `Array[Rect2]`:

- `single()`, `split_lr(ratio)`, `split_tb(ratio)`, `grid(cols, rows)`,
  `compose([rects])`
- `inset(layout, host)` — reprojects a normalized layout into a sub-rect.
  This is how you nest layouts (e.g. a 2×2 grid inside the right pane of a
  split). `UIShellDemoScreen` uses it heavily.

`MenuButtonStyle.apply(label, selected)` — shared look for menu `Label`s.
Also used directly by `TitleScreen` for its top-level menu.

## Shaders (`assets/shaders/`)

- `ascii_grid.gdshader` — default cell renderer (data texture → glyph atlas
  → composite). Owns the `(space + near-black bg) == transparent` rule.
- `dither.gdshaderinc` — shared `dither12(color, cell)` helper (8×8 Bayer,
  12 levels/channel). Included wherever chunky raster is needed. `cell` is
  the integer block index in whatever coordinate space the caller is in.
- `title_screen.gdshader` — title composite: logo → sefirot → fire → particles
  → gold wash tint applied to everything except the logo.
- `title_particles.gdshader` — 22 rock-chunks × 10 trailing crumbs each.
  Rendered into a **block-resolution** `SubViewport`, not per-pixel at full
  res; the main title shader samples the result as a texture with
  `filter_nearest` at block centers. Without this the per-pixel evaluation
  tanked framerate on low-end GPUs. Uses AABB culling per particle and
  lighting matches the sefirot's lower-right light direction.
- `pane_fire.gdshader` — fire extracted from the title for reuse in UI panes.
  Identical palette to the title fire but sized to a per-pane rect.
- `pane_raster.gdshader` — fullblock 1:2 + `dither12` for raster panes.
- `fire_grid.gdshader` — fullscreen fire for `FireDemoScreen`.
- `crt_postprocess.gdshader`, `matcap.gdshader` — not currently wired up.

## Core utilities (`core/`)

- `Constants` — CGA color palette (`BLACK`, `BLUE`, `BRIGHT_WHITE`, …), FF
  HUD colors (`FF_BLUE_BG`, `FF_BORDER`, …), box-drawing chars
  (`BOX_TL/TR/BL/BR/H/V` = `╭╮╰╯─│`), layout row metrics, `TILE_DENSITY=3`.
  `viewport_top()`, `hud_bottom()`, `hud_total()` compute the HUD frame rows.
- `SeededRNG` — deterministic RNG used by GameMgr + noise classes
- `PerlinNoise`, `CellularNoise` — procgen noise
- `AStarPathfinding`, `MathUtils`

## Input actions

Defined in `project.godot [input]`. WASD + arrows + analog stick → direction
actions. Space / Enter / pad A → `interact`. Escape / pad B → `cancel`.

`move_up/down/left/right`, `interact`, `cancel`, `inventory`, `character`,
`quest_log`, `map`, `pause_menu`, `debug_menu` (Ctrl+D).

## Conventions

- **Typed arrays** everywhere: `Array[Pane]`, `Array[Rect2]`,
  `PackedStringArray`, `PackedColorArray`, `PackedVector2Array`.
- **`class_name`** for reusable classes (`AsciiGrid`, `BaseScreen`, `UIShell`,
  `PaneLayout`, `Constants`, `FFPanel`, `GlyphAtlasBuilder`, `SeededRNG`,
  `PerlinNoise`, `MenuButtonStyle`). Autoloads stay script-name-only.
- **Signal-based decoupling**: screens never call `GameMgr` directly; they
  emit `action_requested("new_game")` and `GameMgr._handle_screen_action`
  dispatches. To add a new screen action, extend that match in
  `game_manager.gd`.
- **`_setup_gen: int = -1` pattern**: any screen that uses a custom gfx
  shader caches `grid.atlas_generation` and re-runs `_setup_shader()` when
  it changes (viewport resize rebuilds the atlas → shader uniforms must be
  repushed). `TitleScreen` and `FireDemoScreen` both do this.
- **`on_exit` must call `grid.clear_gfx_shader()`** if the screen used
  `set_gfx_shader`. Also tear down any persistent child nodes the screen
  parented to the grid (title menu labels, particle subviewport, etc.).
- **"Ported from js/..."** comments — the legacy JS prototype lives in
  `__legacy/`. Compare against it when porting behavior; the save file
  format is intentionally cross-compatible.
- **Native TTF labels** for anything that needs crisp kerning (title menu,
  UI shell MENU + TEXT panes). They're parented directly to the AsciiGrid
  node and positioned in pixel space — glyph-grid alignment is not required
  for these.
