# CLAUDE.md — ASCIIQUEST

## Project Overview

ASCIIQUEST is a browser-based ASCII roguelike game (colony salvage theme) built entirely in vanilla JavaScript with ES6 modules. No frameworks, no build tools, no npm dependencies. Everything runs directly in the browser via HTML5 Canvas 2D API.

- **Version:** 0.0.201 (alpha)
- **Entry point:** `index.html` → `<script type="module" src="js/main.js">`
- **Font:** Noto Sans Mono (Google Fonts)
- **Audio:** Web Audio API with OGG tracks in `music/`

## Directory Structure

```
azet/
├── index.html              # Main game HTML entry point
├── version.json            # {"version": "0.0.201", "phase": "alpha"}
├── css/style.css           # UI/canvas styling, mobile gamepad layout
├── js/                     # Core game modules (~29K lines)
│   ├── main.js             # Game loop, state, save/load (~7,500 lines)
│   ├── engine.js           # Renderer, camera, input manager (~2,200 lines)
│   ├── world.js            # World/terrain/dungeon generation (~5,000 lines)
│   ├── entities.js         # NPCs, players, name generation (~3,100 lines)
│   ├── systems.js          # Combat, quests, shops, factions (~2,600 lines)
│   ├── ui.js               # HUD, menus, dialogs (~3,950 lines)
│   ├── worldhistory.js     # Procedural history generation (~2,700 lines)
│   ├── utils.js            # RNG, noise, pathfinding (~500 lines)
│   ├── monsterart.js       # Boss/monster ASCII art library
│   ├── tileExpansion.js    # Tile zoom patterns
│   ├── crystal-frames.js   # Crystal animation frames
│   └── music.js            # Audio/music system
├── music/                  # OGG audio tracks (title, overworld, battle, etc.)
└── utils/
    ├── paint/              # Standalone ASCII art painting tool
    │   ├── index.html, app.js, tools.js, renderer.js, state.js, palette.js
    │   └── style.css
    └── decrypter/          # Save file decrypt/encrypt utility
        └── index.html
```

## Module Dependency Graph

```
main.js (orchestrator)
  ├── engine.js    → Renderer, Camera, InputManager, ParticleSystem, GlowEffect
  ├── utils.js     → SeededRNG, PerlinNoise, CellularNoise, AStar, Bresenham
  ├── world.js     → OverworldGenerator, ChunkManager, DungeonGenerator, SettlementGenerator
  ├── entities.js  → NameGenerator, NPC, DialogueGenerator, ItemGenerator
  ├── systems.js   → CombatSystem, QuestSystem, ShopSystem, FactionSystem
  ├── ui.js        → UIManager, HUD, menus, dialogs
  ├── worldhistory.js → CivilizationGenerator, HistoryGenerator, LoreSystem
  ├── music.js     → MusicManager
  ├── monsterart.js
  ├── tileExpansion.js
  └── crystal-frames.js
```

## Tech Stack & Key Algorithms

- **Language:** JavaScript (ES6+ modules, no TypeScript)
- **Rendering:** HTML5 Canvas 2D with monospace font grid
- **RNG:** Mulberry32 seeded PRNG (deterministic/reproducible worlds)
- **Terrain:** Perlin noise + Voronoi cellular noise for biomes
- **Pathfinding:** A* algorithm
- **Line drawing:** Bresenham's algorithm
- **Save system:** XOR cipher (key: `'AETHEON-ASCIIQUEST-2024'`) + Base64 encoding
- **Visual effects:** Particle system, glow/bloom, CRT post-processing, god rays

## Code Conventions

- **Naming:** camelCase for functions/variables, PascalCase for classes, UPPER_CASE for constants
- **Comments:** Section headers use `// ─── SECTION NAME ───` style
- **Architecture:** ECS-inspired with game loop, state machines for combat/UI/weather
- **No linting/formatting tools configured** — follow existing code style
- **No external dependencies** — do not introduce npm packages or build tools

## Development Workflow

- **No build step.** Open `index.html` in a browser to run.
- **No tests.** Manual testing in browser.
- **No CI/CD pipeline.**
- **Versioning:** Update `version.json` and the `<title>` in `index.html` together.
- **Git branching:** Feature branches are created as `claude/<description>-<id>` and merged via PRs to `main`.
- **Default branch:** `main`

## Important Patterns to Follow

1. **All world generation must be seeded.** Use `SeededRNG` from `utils.js` — never use `Math.random()` directly, as it breaks reproducibility.
2. **Files are large.** `main.js` is ~7,500 lines. When editing, read only the relevant section — do not attempt to rewrite entire files.
3. **No framework abstractions.** The codebase uses plain DOM APIs and Canvas directly. Do not introduce React, Vue, or any UI framework.
4. **Save compatibility matters.** Changes to game state structure can break existing saves. Be careful when modifying serialized state.
5. **Mobile support.** The game has touch controls (SNES-style gamepad). UI changes must account for both keyboard and touch input.
6. **Chunk-based world.** The overworld uses a streaming chunk system. Terrain changes must work within this system.

## Common Tasks

- **Adding a new game feature:** Identify which module owns the feature (world.js for terrain, entities.js for NPCs, systems.js for game mechanics, ui.js for interface). Add the feature in the appropriate module and wire it into main.js.
- **Version bump:** Update both `version.json` and the `<title>` tag in `index.html`.
- **Adding ASCII art:** Use the paint tool at `utils/paint/index.html` or add directly to `monsterart.js`.
- **Debugging:** The game has a built-in debug panel toggled via the DBG button (touch) or debug key binding.
