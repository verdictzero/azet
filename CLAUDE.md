# CLAUDE.md

## Project: Terminal Gradient

ASCII roguelike set in an O'Neill cylinder space colony. Godot 4.6, GL compatibility renderer, 1280x720 viewport. Single project lives in `terminal_gradient/`.

- Main scene: `terminal_gradient/rendering/ascii_grid.tscn`
- Project file: `terminal_gradient/project.godot`

## Layout

- `autoloads/` — six singletons registered in `project.godot`: `EventBus`, `InputMgr`, `TimeMgr`, `AudioMgr`, `SaveMgr`, `GameMgr`. Inter-system comms go through `EventBus` signals; `GameMgr` owns the state machine (OVERWORLD, COMBAT, DIALOGUE, demo states, etc.).
- `core/` — pure utilities: `constants.gd` (CGA palette, layout metrics), `astar_pathfinding.gd`, `perlin_noise.gd`, `cellular_noise.gd`, `seeded_rng.gd`, `math_utils.gd`.
- `rendering/` — the GPU ASCII pipeline. `ascii_grid.gd` is the renderer; `glyph_atlas_builder.gd` + `atlas_drawer.gd` build the glyph atlas at startup; `main_scene.gd` wires `GameMgr` to the grid.
- `terrain/` — `terrain_mesher.gd` (chunked 3D terrain + billboard vegetation) and `terrain_player.gd`.
- `ui/` — `ui_manager.gd` (screen stack + message log; **regular node, not an autoload**), `screens/` (all extend `base_screen.gd` with `on_enter`/`on_exit` lifecycle), `components/` (`cursor_list`, `ff_panel`, `hp_bar`, `word_wrap`), `shell/` (`ui_shell`, `pane_layout`, `menu_button_style`).
- `assets/` — `shaders/` (`ascii_grid`, `crt_postprocess`, `fire_grid`, `title_screen`, `matcap`, `pane_fire`, `title_particles`), `fonts/` (NotoSansMono-Medium), `graphics/` (title art), `models/`, `music/`. `assets/music/__legacy/` holds the old Aether Quest tracks.

## Core architectural notes

- **GPU ASCII rendering.** The grid is not sprite-per-cell. Glyphs are pre-rendered to a single atlas; per frame, cell data (char index + fg/bg colors) is uploaded as small data textures and composited by `ascii_grid.gdshader` in 1–2 draw calls. If font rendering breaks, look at `GlyphAtlasBuilder._build_atlas()`.
- **Dual buffers.** Text buffer uses 16px font for HUD/menus; graphics buffer uses 8px font (2× density) for the world viewport. They composite separately.
- **SubViewport + transition overlay.** The main scene wraps the grid in a SubViewportContainer/SubViewport with a `TransitionOverlay` ColorRect for fades.
- **Screens are stacked, signal-driven.** Screens never call each other directly — they emit `action_requested` and `UIManager` mediates. Modals push onto the stack; base state stays underneath.
- **Decoupled comms.** Prefer `EventBus` signals over direct singleton calls when wiring new systems.

## Inputs (from `project.godot`)

WASD / arrows for movement, Space/Enter `interact`, Esc `cancel`, `I` inventory, `C` character, `Q` quest log, `M` map, `P` pause, `Ctrl+D` debug menu. Gamepad bound on all movement and core actions.

## Gotchas

- `UIManager` looks like an autoload but isn't — it's a node inside the main scene tree. Don't try to access it as a global.
- Renderer is `gl_compatibility`, not Forward+ — shaders must stay GLES3-compatible.
- Cell data textures regenerate every frame; performance is bound by upload bandwidth, not draw calls.
- CRT post-process is optional; if the screen looks flat, check `crt_postprocess.gdshader` is wired into the viewport chain.
