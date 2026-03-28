// ============================================================================
// world.js — World generation for ASCIIQUEST, a colony salvage roguelike
// ============================================================================
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │              WORLD GENERATION SYSTEMS — HEURISTIC ANALYSIS             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ── 1. GENERATION PIPELINE (execution order) ─────────────────────────────
//
// A) CHUNK GENERATION — ChunkManager._generateChunk() [line ~1486]
//    Chunks are 32×32 tiles, generated on demand when player is within
//    Manhattan distance 2 (5×5 ring). Cached by "cx,cy" key string.
//
//    Per-tile generation: _generateTile(wx, wy) [line ~720]
//    Priority/override order (first match wins):
//      1. VOID — beyond ship hull → VOID_SPACE
//      2. SECTION WALL — within 7 tiles of section edge → WALL_GRADIENT
//         2a. ENTRANCE — 3 fixed entrances per wall (top/mid/bottom)
//             Layers: outer hull → blast corridor → blast door → junction
//                     → grating → ENTRANCE_DOOR (habitat side, interactable)
//      3. INNER HULL — _generateInnerHullTile() [line ~1085]
//         Outer walls → central walkway → secondary walkway → machinery
//         Airlock openings aligned with adjacent section walls via hash match
//      4. FACILITY — _generateFacilityTile() [line ~1030]
//         C2 (Command) or ENG (Engineering) rooms/corridors
//      5. HABITAT BIOME — _generateHabitatTile() [line ~838]
//         Uses noise layers: height, moisture, anomaly, detail, temperature
//         Biome modifiers alter noise → terrain assignment
//
//    Post-chunk passes (after all 32×32 tiles generated):
//      B1. Colony substructure tears [line ~1516] — noise > 0.74 → tear tiles
//      B2. Remove small isolated blockers [line ~1519]
//      B3. Place settlement/location markers — from overworld locs
//      B4. Place bridge locations for rivers
//
// ── 2. RENDERING PIPELINE ────────────────────────────────────────────────
//
// OVERWORLD — renderOverworld() [main.js line ~5913]
//   Stage 1: Shadow/lighting computation (cached by camera+sun+density)
//     - TILE_HEIGHTS lookup for each tile type
//     - Recessed tiles (height < 0): self-shadow at 0.625 opacity
//     - Raised tiles (height > 0): cast linear shadow rays toward sun
//     - Vegetation reduces shadow alpha by 0.5x
//     - Shadow fades quadratically along ray
//   Stage 2: Tile rendering
//     - VOID_SPACE → procedural circuitry background
//     - Inner hull machinery → circuit pattern overlay on non-walkable
//     - Fog of war (night): tiles > viewRange dimmed
//     - Density expansion: expandTile() for zoom levels 2/3
//     - Color animation: getAnimatedColor() for special tile types
//   Stage 3: Location markers (▣□○▼♦†▪▲) with glow categories
//   Stage 4: Player (@) with pulsing reticle corners
//   Stage 5: Quest navigation line overlay
//
// DUNGEON — renderDungeon() [main.js line ~6357]
//   Stage 1: Light source collection (player + tile-based)
//     - Fireplace/Torch: fast jittery flicker
//     - Crystal: slow wave with color shift
//     - Ember: medium pulse with flares
//     - Pulse (machinery): smooth steady pulse
//   Stage 2: LightingSystem.compute() → per-tile brightness map
//     - Opacity function: walls and non-walkable block light
//   Stage 3: FOV/visibility determination
//     - With lighting: brightness > 0.02 = visible
//     - Legacy: raycasting to viewport perimeter
//   Stage 4: Tile rendering with brightness modulation
//     - Interactive tiles (stairs, doors, chests): glow effect
//     - Non-visible tiles: procedural circuitry background
//   Stage 5: Entities (enemies, items, player)
//
// ── 3. STATE TRANSITIONS & CLEANUP ───────────────────────────────────────
//
// OVERWORLD → DUNGEON (enterDungeon, line ~1249):
//   - Saves _preLocationZoom, sets zoom to 3
//   - Generates dungeon tiles, rooms, entity spots
//   - Spawns enemies + items from entity spots
//   - Places player at entrance room center
//   - setState('DUNGEON') — NO fade transition!
//
// DUNGEON → OVERWORLD (STAIRS_UP at floor 0, line ~2142):
//   - Nulls currentDungeon, currentTower, currentSettlement
//   - Clears enemies[], items[], npcs[]
//   - Restores player position from currentLocation.x/y
//   - Restores _preLocationZoom
//   - Recalculates camera viewport
//   - _clearRenderCaches() → clears shadow cache, highlight buf, tile cache
//   - setState('OVERWORLD') — NO fade transition!
//
// OVERWORLD → LOCATION (enterLocation, line ~1059):
//   - Generates settlement tiles + NPCs
//   - Creates locationCamera
//   - setState('LOCATION') — with startTransition() fade
//
// LOCATION → OVERWORLD (Escape, line ~1916):
//   - startTransition() fade → restores position, clears settlement/NPCs
//   - Restores zoom, recalculates camera
//   - _clearRenderCaches()
//
// ── 4. KNOWN ARTIFACT RISK AREAS ─────────────────────────────────────────
//
// [A] NO FADE ON DUNGEON EXIT — lines 2142-2170
//     Location exit uses startTransition() but dungeon STAIRS_UP exit does
//     NOT. This causes instant state swap with potential 1-frame glitch as
//     camera/viewport/zoom all change simultaneously without a black frame
//     buffer. Compare with location exit at line 1916 which fades properly.
//
// [B] DENSITY MISMATCH FRAME — lines 2155-2164
//     On dungeon exit: zoom restore → viewport recalc → camera snap → render.
//     If render fires between zoom restore and camera snap, viewport may
//     show tiles at wrong density. The camera.follow() + immediate x/y snap
//     happens in the same frame, but setState triggers a render.
//
// [C] SHADOW CACHE STALE ON CAMERA JUMP — _shadowCacheKey at line ~608
//     Shadow cache keyed by camera position + sun + density. After dungeon
//     exit, camera snaps to a new position. If the NEW position generates
//     the same cache key as a PRE-dungeon cached frame (unlikely but
//     possible with integer truncation), stale shadow data could render.
//     _clearRenderCaches() should prevent this, but verify it's called
//     BEFORE the first render frame after exit.
//
// [D] CHUNK CACHE ACROSS STATE TRANSITIONS
//     ChunkManager caches chunks by "cx,cy". These are never explicitly
//     invalidated on dungeon entry/exit. This is CORRECT behavior (overworld
//     chunks should persist), but if any generation code has side effects
//     on shared state (noise generators, RNG), chunks generated after
//     returning from dungeon could differ from pre-dungeon chunks at the
//     same coordinates. Verify noise objects are stateless/pure.
//
// [E] TILE EXPANSION CACHE (tileExpansion.js)
//     expandTile() may cache by position hash. Dungeon tiles and overworld
//     tiles use separate coordinate spaces (dungeon: 0-60, overworld:
//     world coords). If cache is global and not cleared, expansion patterns
//     from dungeon coords could bleed into overworld at matching positions.
//     clearTileCache() in _clearRenderCaches() should handle this.
//
// [F] ENTRANCE ALIGNMENT (replaced old hash system)
//     Habitat walls now use 3 fixed entrances at 1/4, 1/2, 3/4 of wrap height.
//     Inner hull corridor openings match these positions by checking the
//     adjacent habitat section's entrance positions via _getEntranceAtY().
//
// [G] locationCamera NOT NULLED ON DUNGEON EXIT — line 2142
//     On dungeon exit, currentSettlement is set to null but locationCamera
//     is not explicitly cleared. If render dispatch checks locationCamera
//     before checking state, a stale camera could affect rendering.
//
// [H] PLAYER POSITION FALLBACK — line 2148-2150
//     Player position restored from gameContext.currentLocation.x/y.
//     If currentLocation is null (e.g., entered dungeon via debug), player
//     position remains at dungeon coordinates (0-60 range), which maps to
//     a completely wrong overworld location near the west edge of C2.
//
// ── 5. TILE OVERRIDE PRIORITY (generation time) ──────────────────────────
//
// Highest → Lowest:
//   1. Section wall / airlock (non-overridable structural boundary)
//   2. Tear zones (noise-based, overwrites terrain in concentric rings)
//   3. Structure placement (obelisks, towers — sets structure:true flag)
//   4. Settlement/location markers (sets locationId)
//   5. Road construction (A* path, only overwrites walkable terrain)
//   6. Bridge placement (overwrites water with bridge tiles)
//   7. Base biome terrain (noise-derived, lowest priority)
//
// ── 6. RENDERING OVERRIDE PRIORITY (draw time) ───────────────────────────
//
// Layer 0: Background (circuitry for non-visible/void areas)
// Layer 1: Terrain tiles (grass, water, mountains, floor)
// Layer 2: Structure tiles (buildings, walls, tears, machinery)
// Layer 3: Location markers (settlement icons with glow)
// Layer 4: Shadow/lighting overlay (multiplicative dimming)
// Layer 5: Fog of war (night desaturation)
// Layer 6: Entities (enemies, NPCs, items)
// Layer 7: Player character (@) with reticle
// Layer 8: UI overlays (quest nav, HUD)
//
// ============================================================================

import { SeededRNG, PerlinNoise, CellularNoise, AStar, distance, floodFill } from './utils.js';

// ============================================================================
// Tile definition helpers
// ============================================================================

function tile(type, char, fg, bg, walkable, extra) {
  return { type, char, fg, bg, walkable, ...extra };
}

function _lerpColor(a, b, t) {
  const av = parseInt(a.slice(1), 16), bv = parseInt(b.slice(1), 16);
  const r = Math.round(((av >> 16) & 0xff) + t * (((bv >> 16) & 0xff) - ((av >> 16) & 0xff)));
  const g = Math.round(((av >> 8) & 0xff) + t * (((bv >> 8) & 0xff) - ((av >> 8) & 0xff)));
  const bl = Math.round((av & 0xff) + t * ((bv & 0xff) - (av & 0xff)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

function makeTileGrid(w, h, fillFn) {
  const tiles = [];
  for (let y = 0; y < h; y++) {
    tiles[y] = [];
    for (let x = 0; x < w; x++) {
      tiles[y][x] = fillFn(x, y);
    }
  }
  return tiles;
}

// ============================================================================
// OverworldGenerator
// ============================================================================

export class OverworldGenerator {

  generate(seed, width = 100, height = 60) {
    const rng = new SeededRNG(seed);
    const heightNoise = new PerlinNoise(rng);
    const moistureNoise = new PerlinNoise(rng);
    const anomalyNoise = new PerlinNoise(rng);
    const detailNoise = new PerlinNoise(rng);
    const temperatureNoise = new PerlinNoise(rng);

    // Cellular noise for smooth contiguous biome regions
    const biomeCell = new CellularNoise(rng, 0.8);  // large cells for primary biome zones
    const subCell = new CellularNoise(rng, 2.0);    // finer sub-regions within biomes

    // Generate base terrain
    const tiles = makeTileGrid(width, height, (x, y) => {
      const nx = x / width;
      const ny = y / height;

      // Height: blend Perlin elevation with cellular structure for smoother landforms
      const hPerlin = (heightNoise.fbm(nx * 2, ny * 2, 6) + 1) / 2;
      const cell = biomeCell.noise2D(nx * 3, ny * 3);
      const subCellData = subCell.noise2D(nx * 6, ny * 6);
      // Cell-based height contribution: each Voronoi cell has a base elevation
      const cellElevation = cell.cellId;
      // Blend: Perlin provides shape, cellular provides contiguous regions
      const h = hPerlin * 0.6 + cellElevation * 0.35 + subCellData.cellId * 0.05;

      // Moisture: Perlin with cellular smoothing for contiguous wet/dry zones
      const mPerlin = (moistureNoise.fbm(nx * 2 + 100, ny * 2 + 100, 5) + 1) / 2;
      const mCell = cell.cellId * 0.618 % 1.0; // derive moisture tendency from cell
      const m = mPerlin * 0.55 + mCell * 0.45;

      // Anomaly: keep Perlin-based but use cell edges for concentration
      const aRaw = (anomalyNoise.fbm(nx * 1, ny * 1, 4) + 1) / 2;
      // Anomalies cluster at Voronoi cell boundaries (low edge = near boundary)
      const a = aRaw * 0.7 + (1.0 - Math.min(1.0, cell.edge * 2.5)) * 0.3;

      // Detail noise for sub-biome features
      const d = (detailNoise.fbm(nx * 4, ny * 4, 3) + 1) / 2;

      // Temperature: smooth gradient from latitude + low-freq noise
      // Latitude contribution: poles cold, equator warm
      const latGrad = 1.0 - Math.abs(ny - 0.5) * 2.0; // 0 at edges, 1 at center
      const tNoise = (temperatureNoise.fbm(nx * 0.5 + 200, ny * 0.5 + 200, 3) + 1) / 2;
      // Cell-based temperature clustering for contiguous climate zones
      const tCell = cell.cellId * 0.382 % 1.0; // golden-ratio derived for good distribution
      const t = latGrad * 0.35 + tNoise * 0.35 + tCell * 0.3;

      return this._terrainFromNoise(h, m, a, d, t, cell.edge, subCellData.edge);
    });

    // Place locations
    const locations = this._placeLocations(rng, tiles, width, height);

    // Build roads between major locations
    const roads = this._buildRoads(rng, tiles, locations, width, height);

    return { tiles, width, height, locations, roads, getLocation: (x, y) => this._getLocation(locations, x, y) };
  }

  _terrainFromNoise(h, m, a = 0, d = 0.5, t = 0.5, cellEdge = 1.0, subEdge = 1.0) {
    // Terrain from height: water gradient → sand shores → grass → forest → mountains

    // ── GRASSLAND (h < 0.55) ──
    if (h < 0.55) {
      let prox = Math.max(0, Math.min(1, h / 0.55));              // 0 = low, 1 = near forest
      prox = Math.max(0, Math.min(1, prox + (d - 0.5) * 0.15));   // detail noise adds organic jitter
      const fg = _lerpColor('#33dd44', '#99aa33', prox);            // lush vivid green → muted yellow-green near forest
      const bg = _lerpColor('#0a2210', '#1a1a08', prox);            // cool dark green → warm olive dark near forest
      return tile('GRASSLAND', '.', fg, bg, true, { biome: 'grassland' });
    }

    // ── FOREST (h 0.55 - 0.7) — trees ──
    if (h < 0.62) return tile('FOREST', '\u2663', '#22AA22', '#0a1a0a', true, { biome: 'forest' });
    if (h < 0.7) return tile('DEEP_FOREST', '\u2660', '#116611', '#060f06', true, { biome: 'forest' });

    // ── MOUNTAIN (h 0.7+) ──
    if (h < 0.82) return tile('MOUNTAIN_BASE', '\u2593', '#AAAAAA', '#333333', false, { biome: 'mountain' });
    return tile('MOUNTAIN', '\u25B3', '#BBBBBB', '#444444', false, { biome: 'mountain' });
  }

  _placeLocations(rng, tiles, width, height) {
    const locationDefs = [
      { type: 'city', min: 1, max: 2, population: [800, 2000], difficulty: 1 },      // market hub
      { type: 'town', min: 3, max: 4, population: [200, 600], difficulty: 2 },       // small habitat
      { type: 'village', min: 6, max: 10, population: [30, 120], difficulty: 1 },    // small habitat
      { type: 'castle', min: 2, max: 3, population: [50, 200], difficulty: 4 },      // garrison
      { type: 'temple', min: 3, max: 5, population: [10, 50], difficulty: 3 },       // data archive
      { type: 'dungeon', min: 5, max: 8, population: [0, 0], difficulty: 5 },        // collapsed sub-level
      { type: 'ruins', min: 3, max: 5, population: [0, 10], difficulty: 4 },         // abandoned module
      { type: 'tower', min: 1, max: 3, population: [5, 20], difficulty: 5 },         // signal spire
      { type: 'camp', min: 2, max: 4, population: [10, 40], difficulty: 2 },         // scavenger camp
    ];

    const nameBank = {
      city: ['Ironhaven Hub', 'Sector Prime', 'Greymoor Central', 'Steelreach'],
      town: ['Ashford Junction', 'Raven Terminal', 'Misthallow Bay', 'Briar Lock', 'Deck Rest', 'Frostwatch Post'],
      village: [], // generated names
      castle: ['Fort Ironhold', 'Stormwall Garrison', 'Shadowguard Base', 'Citadel Ashvane'],
      temple: ['Archive of Stars', 'Data Vault of the Dawn', 'Sanctum of Whispers', 'Hall of Echoes',
               'Core of the Flame', 'Archive of the Moon'],
      dungeon: ['The Sunken Sub-Level', 'Catacombs of Dread', 'The Slag Pit', 'Shadow Depths',
                'The Hollow Core', 'Forgotten Tunnels', 'The Iron Maw', 'Echoing Ducts'],
      ruins: ['Old Thornhold Wreck', 'The Fallen Antenna', 'Duskbane Wreck', 'Shattered Module',
              'Crumbling Bay'],
      tower: ['Spire of Seeing', 'Stormwatch Beacon', 'The Obsidian Antenna'],
      camp: ['Drifter Den', 'Trader Outpost', 'Scavenger Crossing', 'Pathfinder Lodge'],
    };

    const locations = [];
    let idCounter = 0;
    const minDist = 12;

    for (const def of locationDefs) {
      const count = rng.nextInt(def.min, def.max);
      const names = rng.shuffle(nameBank[def.type] || []);
      let nameIdx = 0;

      for (let i = 0; i < count; i++) {
        let placed = false;
        for (let attempt = 0; attempt < 200; attempt++) {
          const x = rng.nextInt(3, width - 4);
          const y = rng.nextInt(3, height - 4);
          const t = tiles[y][x];

          // Must be on walkable, non-water, non-mountain terrain
          if (!t.walkable) continue;
          if (t.type === 'RIVER_WATER' || t.type === 'MOUNTAIN' || t.type === 'MOUNTAIN_BASE') continue;

          // Minimum distance from existing locations
          let tooClose = false;
          for (const loc of locations) {
            if (distance(x, y, loc.x, loc.y) < minDist) {
              tooClose = true;
              break;
            }
          }
          if (tooClose) continue;

          const pop = rng.nextInt(def.population[0], def.population[1]);
          const name = nameIdx < names.length ? names[nameIdx++] : `${def.type} #${idCounter}`;
          locations.push({
            id: idCounter++,
            name,
            type: def.type,
            x, y,
            population: pop,
            difficulty: def.difficulty + rng.nextInt(0, 2),
          });

          // Mark on map with a location character
          const charMap = {
            city: '*', town: 'o', village: '\u00b7', castle: '\u00a4',
            temple: '\u2020', dungeon: '\u2126', ruins: '\u00a7', tower: '!', camp: '\u00b0',
          };
          tiles[y][x] = tile('LOCATION', charMap[def.type] || '?', '#ffffff', '#442200', true,
            { biome: t.biome, locationId: idCounter - 1 });
          placed = true;
          break;
        }
      }
    }

    return locations;
  }

  _buildRoads(rng, tiles, locations, width, height) {
    // Connect cities/towns/castles via roads, plus some villages
    const majorTypes = new Set(['city', 'town', 'castle']);
    const majors = locations.filter(l => majorTypes.has(l.type));
    const minors = locations.filter(l => l.type === 'village').slice(0, 4);
    const toConnect = [...majors, ...minors];

    const roads = [];

    // Build minimum spanning tree of major locations
    if (toConnect.length < 2) return roads;

    const connected = new Set([0]);
    const remaining = new Set();
    for (let i = 1; i < toConnect.length; i++) remaining.add(i);

    while (remaining.size > 0) {
      let bestDist = Infinity;
      let bestFrom = -1;
      let bestTo = -1;

      for (const ci of connected) {
        for (const ri of remaining) {
          const d = distance(toConnect[ci].x, toConnect[ci].y, toConnect[ri].x, toConnect[ri].y);
          if (d < bestDist) {
            bestDist = d;
            bestFrom = ci;
            bestTo = ri;
          }
        }
      }

      if (bestTo === -1) break;
      connected.add(bestTo);
      remaining.delete(bestTo);

      // Carve road path
      const from = toConnect[bestFrom];
      const to = toConnect[bestTo];
      const path = this._findOverworldPath(rng, tiles, from.x, from.y, to.x, to.y, width, height);
      if (path) {
        roads.push({ from: from.id, to: to.id, path });
        for (const p of path) {
          const t = tiles[p.y][p.x];
          if (t.type === 'GRASSLAND' || t.type === 'FOREST' || t.type === 'DEEP_FOREST' ||
              t.type === 'INNER_SHORE' || t.type === 'OUTER_SHORE') {
            tiles[p.y][p.x] = tile('ROAD', '=', '#aa8844', '#332211', true, { biome: t.biome });
          } else if (t.type === 'RIVER_WATER') {
            tiles[p.y][p.x] = tile('BRIDGE', '=', '#aa6622', '#000066', true, { biome: t.biome });
          }
        }
      }
    }

    return roads;
  }

  _findOverworldPath(rng, tiles, sx, sy, ex, ey, width, height) {
    const impassable = new Set(['RIVER_WATER', 'MOUNTAIN']);
    const isWalkable = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const t = tiles[y][x];
      if (impassable.has(t.type)) return false;
      return true;
    };

    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 6) {
      return AStar.findPath(sx, sy, ex, ey, isWalkable, 5000);
    }

    // Perpendicular direction for offset
    const perpX = -dy / dist;
    const perpY = dx / dist;

    const numWaypoints = dist > 20 ? 3 : dist > 10 ? 2 : 1;
    const waypoints = [{ x: sx, y: sy }];

    for (let i = 0; i < numWaypoints; i++) {
      const t = (i + 1) / (numWaypoints + 1);
      const midX = sx + dx * t;
      const midY = sy + dy * t;
      const maxOffset = dist * 0.3;
      const offset = (rng.next() - 0.5) * 2 * maxOffset;
      const wpx = Math.round(Math.max(0, Math.min(width - 1, midX + perpX * offset)));
      const wpy = Math.round(Math.max(0, Math.min(height - 1, midY + perpY * offset)));
      waypoints.push({ x: wpx, y: wpy });
    }
    waypoints.push({ x: ex, y: ey });

    const fullPath = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const wp0 = waypoints[i];
      const wp1 = waypoints[i + 1];
      const seg = AStar.findPath(wp0.x, wp0.y, wp1.x, wp1.y, isWalkable, 5000);
      if (!seg) return null;
      for (let j = (i === 0 ? 0 : 1); j < seg.length; j++) {
        fullPath.push(seg[j]);
      }
    }
    return fullPath;
  }

  _getLocation(locations, x, y) {
    for (const loc of locations) {
      if (loc.x === x && loc.y === y) return loc;
    }
    return null;
  }
}

// ============================================================================
// SectionManager — O'Neill cylinder section layout & biome assignment
// ============================================================================

// Section dimensions in chunks
const HABITAT_WIDTH_CHUNKS = 128;   // ~4096 tiles E-W per habitat
const HABITAT_WRAP_CHUNKS = 512;    // ~16384 tiles N-S circumference
const FACILITY_WIDTH_CHUNKS = 64;   // ~2048 tiles E-W for C2/ENG
const FACILITY_WRAP_CHUNKS = 96;    // ~3072 tiles N-S for facilities
const INNER_HULL_WIDTH_CHUNKS = 8;  // ~256 tiles E-W engineering corridors

// Entrance parameters — 3 fixed entrances per habitat wall (top/middle/bottom)
const ENTRANCE_COUNT = 3;           // entrances per wall side
const ENTRANCE_HALF_HEIGHT = 2;     // entrance is 5 tiles tall (2 frame + 3 walkable)

// Wall thickness & gradient — solid hull plating with fading block gradient
const WALL_THICKNESS = 7;           // tiles thick at each edge of the section

// Get the 3 entrance Y positions for a given section (evenly spaced at 1/4, 1/2, 3/4 of wrap height)
function _getEntrancePositions(section) {
  const wrapHeight = section.wrapChunks * CHUNK_SIZE;
  return [
    Math.floor(wrapHeight / 4),       // entrance 0 — top
    Math.floor(wrapHeight / 2),       // entrance 1 — middle
    Math.floor(3 * wrapHeight / 4),   // entrance 2 — bottom
  ];
}

// Check if a Y coordinate is at an entrance position for the given section
// Returns { entranceIndex, phase } or null if not at an entrance
function _getEntranceAtY(wy, section) {
  const wrapHeight = section.wrapChunks * CHUNK_SIZE;
  const wrappedY = ((wy % wrapHeight) + wrapHeight) % wrapHeight;
  const positions = _getEntrancePositions(section);

  // Special cases: H1 west gets only entrance 1, H7 east gets only entrance 1
  // (handled by caller based on isWest flag)

  for (let i = 0; i < positions.length; i++) {
    const centerY = positions[i];
    const dy = wrappedY - centerY;
    // Entrance spans from -ENTRANCE_HALF_HEIGHT to +ENTRANCE_HALF_HEIGHT (5 tiles total)
    if (dy >= -ENTRANCE_HALF_HEIGHT && dy <= ENTRANCE_HALF_HEIGHT) {
      return { entranceIndex: i, phase: dy + ENTRANCE_HALF_HEIGHT }; // phase 0-4 (0 and 4 are frames)
    }
  }
  return null;
}

// Wall gradient: index 0 = outermost (hull exterior), index 6 = innermost (habitat side)
const WALL_GRADIENT = [
  { char: '█', fg: '#556677', bg: '#181830' },   // 0 — solid hull exterior
  { char: '█', fg: '#556677', bg: '#161626' },   // 1 — solid
  { char: '█', fg: '#4E5E6E', bg: '#141422' },   // 2 — solid
  { char: '█', fg: '#4A5A6A', bg: '#12121E' },   // 3 — solid interior
  { char: '▓', fg: '#445566', bg: '#10101A' },   // 4 — dark shade
  { char: '▒', fg: '#3A4A5A', bg: '#0D0D16' },   // 5 — medium shade
  { char: '░', fg: '#334455', bg: '#0A0A12' },   // 6 — light shade (habitat transition)
];

// Habitat biome types (H4 is always 'lush')
const HABITAT_BIOMES = [
  'lush',           // Healthy green ecosystem — rivers, forests, settlements
  'desert',         // Arid biodiversity preserve — sand, scrub, sparse outposts
  'boreal_frozen',  // Hull breach froze the section — ice, dead trees, cold
  'damaged',        // Catastrophic failure — rubble, metal, fires
  'vacuum',         // Vented to space — void, wreckage, aliens
  'swamp_toxic',    // Life support malfunction — toxic pools, overgrown biolabs
  'overgrown',      // Nature reclaimed — dense jungle, hidden ruins
];

// Section definitions — ordered left-to-right (west-to-east) matching the diagram
const SECTION_DEFS = [
  { id: 'C2',  label: 'Command & Control', type: 'facility', widthChunks: FACILITY_WIDTH_CHUNKS, wrapChunks: FACILITY_WRAP_CHUNKS, color: '#7B68A0' },
  { id: 'H1',  label: 'Habitat Ring 1',    type: 'habitat',  widthChunks: HABITAT_WIDTH_CHUNKS,  wrapChunks: HABITAT_WRAP_CHUNKS },
  { id: 'H2',  label: 'Habitat Ring 2',    type: 'habitat',  widthChunks: HABITAT_WIDTH_CHUNKS,  wrapChunks: HABITAT_WRAP_CHUNKS },
  { id: 'H3',  label: 'Habitat Ring 3',    type: 'habitat',  widthChunks: HABITAT_WIDTH_CHUNKS,  wrapChunks: HABITAT_WRAP_CHUNKS },
  { id: 'H4',  label: 'Habitat Ring 4',    type: 'habitat',  widthChunks: HABITAT_WIDTH_CHUNKS,  wrapChunks: HABITAT_WRAP_CHUNKS, fixedBiome: 'lush' },
  { id: 'H5',  label: 'Habitat Ring 5',    type: 'habitat',  widthChunks: HABITAT_WIDTH_CHUNKS,  wrapChunks: HABITAT_WRAP_CHUNKS },
  { id: 'H6',  label: 'Habitat Ring 6',    type: 'habitat',  widthChunks: HABITAT_WIDTH_CHUNKS,  wrapChunks: HABITAT_WRAP_CHUNKS },
  { id: 'H7',  label: 'Habitat Ring 7',    type: 'habitat',  widthChunks: HABITAT_WIDTH_CHUNKS,  wrapChunks: HABITAT_WRAP_CHUNKS },
  { id: 'ENG', label: 'Engineering',        type: 'facility', widthChunks: FACILITY_WIDTH_CHUNKS, wrapChunks: FACILITY_WRAP_CHUNKS, color: '#9B1B5B' },
];

export class SectionManager {
  constructor(seed, options = {}) {
    this.seed = seed;
    this.debugMode = !!options.debugMode;
    this.sections = [];
    this.sectionById = {};
    this.biomeAssignments = {};     // sectionId -> biome string
    this.transitStations = {};      // sectionId -> { active: bool, worldX, worldY }
    this._buildLayout();
    this._assignBiomes(seed);
  }

  // Build the coordinate layout — each section occupies a range of chunk X coordinates
  // with inner hull corridors between each pair of sections
  _buildLayout() {
    let chunkX = 0;
    this.sections = [];

    // Debug mode: tiny dimensions for fast testing microcosm
    const habitatW = this.debugMode ? 8 : HABITAT_WIDTH_CHUNKS;
    const habitatWrap = this.debugMode ? 8 : HABITAT_WRAP_CHUNKS;
    const facilityW = this.debugMode ? 4 : FACILITY_WIDTH_CHUNKS;
    const facilityWrap = this.debugMode ? 8 : FACILITY_WRAP_CHUNKS;
    const innerHullW = this.debugMode ? 4 : INNER_HULL_WIDTH_CHUNKS;

    for (let i = 0; i < SECTION_DEFS.length; i++) {
      const def = SECTION_DEFS[i];
      const isHabitat = def.type === 'habitat';
      const isFacility = def.type === 'facility';
      const effectiveWidth = isHabitat ? habitatW : (isFacility ? facilityW : def.widthChunks);
      const effectiveWrap = isHabitat ? habitatWrap : (isFacility ? facilityWrap : (def.wrapChunks || HABITAT_WRAP_CHUNKS));

      // Inner hull corridor BEFORE each section (except the first)
      if (i > 0) {
        const prevDef = SECTION_DEFS[i - 1];
        const prevIsHabitat = prevDef.type === 'habitat';
        const prevIsFacility = prevDef.type === 'facility';
        const prevWrap = prevIsHabitat ? habitatWrap : (prevIsFacility ? facilityWrap : (prevDef.wrapChunks || HABITAT_WRAP_CHUNKS));
        const corridor = {
          id: `HULL_${prevDef.id}_${def.id}`,
          label: `Inner Hull: ${prevDef.id}—${def.id}`,
          type: 'inner_hull',
          widthChunks: innerHullW,
          wrapChunks: Math.max(effectiveWrap, prevWrap),
          startChunkX: chunkX,
          endChunkX: chunkX + innerHullW - 1,
          leftSection: prevDef.id,
          rightSection: def.id,
        };
        this.sections.push(corridor);
        this.sectionById[corridor.id] = corridor;
        chunkX += innerHullW;
      }

      // The section itself
      const section = {
        ...def,
        widthChunks: effectiveWidth,
        wrapChunks: effectiveWrap,
        startChunkX: chunkX,
        endChunkX: chunkX + effectiveWidth - 1,
        centerChunkX: chunkX + Math.floor(effectiveWidth / 2),
      };
      this.sections.push(section);
      this.sectionById[section.id] = section;
      chunkX += effectiveWidth;
    }

    this.totalWidthChunks = chunkX;
  }

  // Deterministic biome assignment per seed — H4 always lush, others random
  _assignBiomes(seed) {
    const rng = new SeededRNG(seed + 99999);

    // Build pool: enough biomes for 6 non-H4 habitats (H1-H3, H5-H7)
    // Shuffle all biome types so each game is unique
    const pool = rng.shuffle([...HABITAT_BIOMES].filter(b => !this.debugMode || b !== 'vacuum'));

    let poolIdx = 0;
    for (const def of SECTION_DEFS) {
      if (def.type !== 'habitat') continue;
      if (def.fixedBiome) {
        this.biomeAssignments[def.id] = def.fixedBiome;
      } else {
        // Cycle through shuffled pool
        this.biomeAssignments[def.id] = pool[poolIdx % pool.length];
        poolIdx++;
      }
    }
  }

  // Get the section at a given chunk X coordinate
  getSectionAt(chunkX) {
    for (const s of this.sections) {
      if (chunkX >= s.startChunkX && chunkX <= s.endChunkX) return s;
    }
    return null; // beyond ship boundaries
  }

  // Get section by ID
  getSection(id) {
    return this.sectionById[id] || null;
  }

  // Get the biome for a habitat section
  getBiome(sectionId) {
    return this.biomeAssignments[sectionId] || null;
  }

  // Get all habitat sections with their biome assignments
  getHabitatBiomes() {
    const result = [];
    for (const def of SECTION_DEFS) {
      if (def.type === 'habitat') {
        result.push({ id: def.id, biome: this.biomeAssignments[def.id] });
      }
    }
    return result;
  }

  // Wrap chunk Y for cylindrical looping within a section
  wrapChunkY(cy, section) {
    if (!section) return cy;
    const wrap = section.wrapChunks;
    return ((cy % wrap) + wrap) % wrap;
  }

  // Wrap world Y coordinate for a section
  wrapWorldY(wy, section) {
    if (!section) return wy;
    const wrapTiles = section.wrapChunks * CHUNK_SIZE;
    return ((wy % wrapTiles) + wrapTiles) % wrapTiles;
  }

  // Check if chunk X is a section wall (boundary between section and inner hull)
  isWallChunkX(chunkX) {
    for (const s of this.sections) {
      if (s.type === 'inner_hull') continue;
      // The first and last chunk columns of each section have walls
      if (chunkX === s.startChunkX || chunkX === s.endChunkX) return true;
    }
    return false;
  }

  // Check if a world X is beyond the ship entirely
  isBeyondShip(worldX) {
    const cx = Math.floor(worldX / CHUNK_SIZE);
    return cx < 0 || cx >= this.totalWidthChunks;
  }

  // Get the center world coordinates for a section (for spawning)
  getSectionCenter(sectionId) {
    const s = this.sectionById[sectionId];
    if (!s) return null;
    const centerX = (s.startChunkX + Math.floor(s.widthChunks / 2)) * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
    const centerY = Math.floor((s.wrapChunks * CHUNK_SIZE) / 2);
    return { x: centerX, y: centerY };
  }

  // Get adjacent sections (for wall interaction messages)
  getAdjacentSections(sectionId) {
    const idx = SECTION_DEFS.findIndex(d => d.id === sectionId);
    if (idx < 0) return { west: null, east: null };
    return {
      west: idx > 0 ? SECTION_DEFS[idx - 1].id : null,
      east: idx < SECTION_DEFS.length - 1 ? SECTION_DEFS[idx + 1].id : null,
    };
  }

  // Get the inner hull corridor between two sections
  getCorridorBetween(sectionA, sectionB) {
    const corridorId = `HULL_${sectionA}_${sectionB}`;
    const corridorIdAlt = `HULL_${sectionB}_${sectionA}`;
    return this.sectionById[corridorId] || this.sectionById[corridorIdAlt] || null;
  }

  // Serialize for save
  toSaveData() {
    return {
      biomeAssignments: { ...this.biomeAssignments },
      transitStations: JSON.parse(JSON.stringify(this.transitStations)),
      debugMode: this.debugMode,
    };
  }

  // Restore from save
  loadSaveData(data) {
    if (data.biomeAssignments) this.biomeAssignments = { ...data.biomeAssignments };
    if (data.transitStations) this.transitStations = JSON.parse(JSON.stringify(data.transitStations));
  }
}

// ============================================================================
// ChunkManager — Section-aware chunk-based world
// ============================================================================

const CHUNK_SIZE = 32;
const TERRAIN_SCALE = 0.02;

// ── Deterministic horizontal river system ──
const RIVER_SPACING = 125;        // vertical distance between river center lines
const RIVER_MEANDER_AMP = 35;     // max vertical offset from base Y
const RIVER_MEANDER_FREQ = 0.015; // noise frequency for meander curves
const RIVER_HALF_WIDTH = 1;       // tiles from center = 3 total water tiles
const RIVER_SHORE_WIDTH = 1;      // 1 shore tile each side

// Procedural name generator using syllable combination
const NAME_PREFIXES = [
  'Rust', 'Iron', 'Hull', 'Grey', 'Steel', 'Vent', 'Deck', 'Arc', 'Core', 'Drift',
  'Junk', 'Wire', 'Bolt', 'Hatch', 'Pipe', 'Flux', 'Grid', 'Silo', 'Dusk', 'Storm',
];
const NAME_SUFFIXES = {
  city: ['gate', 'hold', 'ward', 'haven', 'hub', 'reach', 'core', 'central', 'spire', 'keep'],
  town: ['lock', 'junction', 'post', 'well', 'terminal', 'bridge', 'bay', 'sector', 'rest', 'watch'],
  village: ['stack', 'bay', 'den', 'port', 'works', 'block', 'nook', 'berth', 'crawl', 'end'],
  castle: [' Bastion', ' Garrison', ' Citadel', ' Stronghold', ' Compound'],
  temple: [' Archive', ' Vault', ' Shrine', ' Repository', ' Database'],
  dungeon: [' Depths', ' Sub-Level', ' Undercrypt', ' Shaft', ' Pit', ' Abyss', ' Core'],
  ruins: [' Wreckage', ' Remnants', ' Debris', ' Rubble', ' Scrapheap'],
  tower: [' Spire', ' Antenna', ' Beacon', ' Relay', ' Watchtower'],
  camp: [' Camp', ' Den', ' Crossing', ' Lodge', ' Waypost'],
  mechanical_ruin: [' Manufactory', ' Bore Shaft', ' Gearworks', ' Pipe Nexus', ' Turbine Hall', ' Crane Dock'],
};

const LOCATION_DEFS = [
  { type: 'village', weight: 50, population: [30, 120], difficulty: 1 },
  { type: 'town', weight: 10, population: [200, 600], difficulty: 2 },
  { type: 'dungeon', weight: 15, population: [0, 0], difficulty: 5 },
  { type: 'temple', weight: 8, population: [10, 50], difficulty: 3 },
  { type: 'ruins', weight: 8, population: [0, 10], difficulty: 4 },
  { type: 'camp', weight: 6, population: [10, 40], difficulty: 2 },
  { type: 'castle', weight: 3, population: [50, 200], difficulty: 4 },
  { type: 'city', weight: 2, population: [800, 2000], difficulty: 1 },
  { type: 'tower', weight: 2, population: [5, 20], difficulty: 5 },
];
const TOTAL_WEIGHT = LOCATION_DEFS.reduce((s, d) => s + d.weight, 0);

export class ChunkManager {
  constructor(seed, sectionManager) {
    this.seed = seed;
    this.sectionManager = sectionManager || new SectionManager(seed);
    const initRng = new SeededRNG(seed);
    this.heightNoise = new PerlinNoise(initRng);
    this.moistureNoise = new PerlinNoise(initRng);
    this.anomalyNoise = new PerlinNoise(initRng);
    this.detailNoise = new PerlinNoise(initRng);
    this.temperatureNoise = new PerlinNoise(initRng);
    this.tearNoise = new PerlinNoise(initRng);
    this.riverNoise = new PerlinNoise(initRng);      // for meandering rivers
    this._unusedNoise = new PerlinNoise(initRng);   // placeholder to keep RNG sequence stable
    this._terrainGen = new OverworldGenerator(); // reuse _terrainFromNoise

    this.chunks = new Map();       // "cx,cy" -> { tiles: [][], locations: [] }
    this.locationMap = new Map();  // "wx,wy" -> location object
    this.exploredChunks = new Set();
    this._roadCache = new Set();   // "cx1,cy1|cx2,cy2" pairs already connected
    this._mapScars = [];           // Historical map scars from world history
    this._scarZones = [];          // Precomputed scar zones in chunk coordinates
  }

  // Set historical map scars from world history generator
  setMapScars(scars, regions) {
    this._mapScars = scars || [];
    if (!scars || scars.length === 0) return;

    // Assign each region a stable chunk coordinate based on seed
    const regionRng = new SeededRNG(this.seed + 7777);
    const regionCoords = new Map();
    if (regions) {
      for (let i = 0; i < regions.length; i++) {
        const r = regions[i];
        // Spread regions across the map in a grid pattern around origin
        const gridSize = Math.ceil(Math.sqrt(regions.length));
        const gx = (i % gridSize) - Math.floor(gridSize / 2);
        const gy = Math.floor(i / gridSize) - Math.floor(gridSize / 2);
        // Add some randomness to avoid perfect grid
        const cx = gx * 4 + regionRng.nextInt(-2, 2);
        const cy = gy * 4 + regionRng.nextInt(-2, 2);
        regionCoords.set(r.id, { cx, cy });
      }
    }

    // Convert scars to chunk-coordinate zones
    const SCAR_SAFE_RADIUS = 4; // chunks clear around starting town
    for (const scar of scars) {
      const coords = scar.regionId ? regionCoords.get(scar.regionId) : null;
      let cx = coords ? coords.cx : regionRng.nextInt(-10, 10);
      let cy = coords ? coords.cy : regionRng.nextInt(-6, 6);
      const radius = scar.radius || 3;

      // Push scar center so its full radius clears the safe zone around origin
      const minDist = SCAR_SAFE_RADIUS + radius;
      const scarDist = Math.sqrt(cx * cx + cy * cy);
      if (scarDist < minDist) {
        if (scarDist > 0) {
          const scale = minDist / scarDist;
          cx = Math.round(cx * scale);
          cy = Math.round(cy * scale);
        } else {
          // Push in deterministic direction based on scar year
          const angle = ((scar.year || 0) % 360) * Math.PI / 180;
          cx = Math.round(Math.cos(angle) * minDist);
          cy = Math.round(Math.sin(angle) * minDist);
        }
      }

      this._scarZones.push({
        ...scar,
        cx, cy, radius,
      });
    }
  }

  _chunkKey(cx, cy) { return `${cx},${cy}`; }

  // ── Deterministic horizontal river helpers ──
  _getRiverCenterY(wx, riverIndex) {
    const baseY = riverIndex * RIVER_SPACING;
    const offset = riverIndex * 1000;
    const noiseVal = this.riverNoise.fbm(wx * RIVER_MEANDER_FREQ + offset, 0.5, 3);
    return Math.round(baseY + noiseVal * RIVER_MEANDER_AMP);
  }

  _getRiverDistance(wx, wy) {
    const baseIndex = Math.round(wy / RIVER_SPACING);
    let minDist = Infinity;
    for (let di = -1; di <= 1; di++) {
      const ri = baseIndex + di;
      const centerY = this._getRiverCenterY(wx, ri);
      const dist = Math.abs(wy - centerY);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  _chunkRng(cx, cy) {
    const h = (this.seed ^ (cx * 73856093) ^ (cy * 19349663)) >>> 0;
    return new SeededRNG(h);
  }

  _generateTile(wx, wy) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const section = this.sectionManager.getSectionAt(cx);

    // Beyond ship hull — vacuum of space
    if (!section) {
      return tile('VOID_SPACE', ' ', '#000000', '#000000', false, { biome: 'void' });
    }

    // Section walls — 7-tile-thick hull plating with 3 fixed entrances per wall
    if (section.type !== 'inner_hull') {
      const localTileX = wx - section.startChunkX * CHUNK_SIZE;
      const sectionWidth = section.widthChunks * CHUNK_SIZE;

      // Determine wall distance: 0 = outermost (hull edge), 6 = innermost (habitat side)
      let wallDist = -1;
      if (localTileX < WALL_THICKNESS) wallDist = localTileX;
      else if (localTileX >= sectionWidth - WALL_THICKNESS) wallDist = sectionWidth - 1 - localTileX;

      if (wallDist >= 0) {
        const isWest = localTileX < WALL_THICKNESS;

        // Check for entrance at this Y position (3 fixed entrances per wall)
        if (section.type === 'habitat') {
          const entranceInfo = _getEntranceAtY(wy, section);

          // Determine if this wall side should have entrances
          // H1 west wall: single special entrance (index 1 only) → C2 access
          // H7 east wall: single special entrance (index 1 only) → ENG access
          // All other habitat walls: 3 entrances
          let hasEntrance = false;
          let isSpecialAccess = false;
          if (entranceInfo) {
            if (section.id === 'H1' && isWest) {
              hasEntrance = entranceInfo.entranceIndex === 1;
              isSpecialAccess = true;
            } else if (section.id === 'H7' && !isWest) {
              hasEntrance = entranceInfo.entranceIndex === 1;
              isSpecialAccess = true;
            } else {
              hasEntrance = true;
            }
          }

          if (hasEntrance && entranceInfo) {
            const { entranceIndex, phase } = entranceInfo;
            const isCenterRow = phase === ENTRANCE_HALF_HEIGHT;

            // Frame rows — top and bottom of entrance (phase 0 and phase 4)
            if (phase === 0 || phase === ENTRANCE_HALF_HEIGHT * 2) {
              const isTop = phase === 0;
              // Gold paneling for wallDist 5-6 frames
              if (wallDist >= 5) {
                const frameFg = isSpecialAccess ? '#DD4444' : '#DDAA22';
                let ch;
                if (wallDist === 6) ch = isTop ? (isWest ? '╗' : '╔') : (isWest ? '╝' : '╚');
                else ch = '═';
                return tile('ENTRANCE_PANEL', ch, frameFg, '#221100', false,
                  { biome: 'hull', entranceFrame: true });
              }
              let ch;
              if (wallDist === 0) ch = isTop ? (isWest ? '╔' : '╗') : (isWest ? '╚' : '╝');
              else ch = '─';
              return tile('ENTRANCE_FRAME', ch, isSpecialAccess ? '#DD4444' : '#CC9900', '#0D0800', false,
                { biome: 'hull', entranceFrame: true });
            }

            // Passage rows (3 walkable rows between frames)
            // Clean gradient: arrow → light shade → medium shade → open → panel → door
            // wallDist 0: Outer hull entrance — directional arrow
            if (wallDist === 0) {
              const ch = isWest ? '►' : '◄';
              return tile('ENTRANCE_PASSAGE', ch, '#FFAA00', '#1A1100', true,
                { biome: 'hull', entrance: true });
            }
            // wallDist 1-2: Blast corridor — light shade blending with wall
            if (wallDist === 1 || wallDist === 2) {
              return tile('ENTRANCE_PASSAGE', '░', '#CC9900', '#0D0800', true,
                { biome: 'hull', entrance: true });
            }
            // wallDist 3: Inner blast door — medium shade continuing gradient
            if (wallDist === 3) {
              return tile('ENTRANCE_PASSAGE', '▒', '#AA7700', '#0D0800', true,
                { biome: 'hull', entrance: true });
            }
            // wallDist 4: Interstitial junction — open passage
            if (wallDist === 4) {
              return tile('ENTRANCE_PASSAGE', '·', '#FFCC44', '#1A1100', true,
                { biome: 'hull', entrance: true });
            }
            // wallDist 5: Gold paneling transition
            if (wallDist === 5) {
              return tile('ENTRANCE_PANEL', '▓', isSpecialAccess ? '#AA3333' : '#CCAA33', '#1A1100', false,
                { biome: 'hull', entrance: true, entranceFrame: true });
            }
            // wallDist 6: ENTRANCE DOOR — the habitat-side door the player interacts with
            // Non-walkable: player must press E/Enter to interact and enter engineering space
            if (isCenterRow) {
              const doorChar = isSpecialAccess ? '⊠' : (isWest ? '◄' : '►');
              const doorFg = isSpecialAccess ? '#FF4444' : '#FFDD44';
              const dirSuffix = isWest ? '_W' : '_E';
              const doorType = isSpecialAccess ? 'SPECIAL_ACCESS_DOOR' + dirSuffix : 'ENTRANCE_DOOR' + dirSuffix;
              return tile(doorType, doorChar, doorFg, '#221100', false,
                { biome: 'hull', entranceDoor: true, entrance: true, isWestWall: isWest,
                  sectionId: section.id, entranceIndex, isSpecialAccess });
            }
            // Non-center rows at habitat edge: gold paneling pillars
            return tile('ENTRANCE_PANEL', '▓', isSpecialAccess ? '#AA3333' : '#DDAA22', '#221100', false,
              { biome: 'hull', entranceFrame: true });
          }
        }

        // Solid gradient wall — no noise variation, clean fading block characters
        const grad = WALL_GRADIENT[wallDist];
        return tile('SECTION_WALL', grad.char, grad.fg, grad.bg, false,
          { biome: 'hull', sectionWall: true });
      }
    }

    // Inner hull engineering corridors
    if (section.type === 'inner_hull') {
      return this._generateInnerHullTile(wx, wy, section);
    }

    // Facility sections (C2 / ENG)
    if (section.type === 'facility') {
      return this._generateFacilityTile(wx, wy, section);
    }

    // Habitat sections — biome-modified terrain
    const biome = this.sectionManager.getBiome(section.id);
    return this._generateHabitatTile(wx, wy, biome);
  }

  // Generate terrain for habitat sections with biome modifications
  _generateHabitatTile(wx, wy, biome) {
    let h = (this.heightNoise.fbm(wx * TERRAIN_SCALE, wy * TERRAIN_SCALE, 6) + 1) / 2;
    let m = (this.moistureNoise.fbm(wx * TERRAIN_SCALE + 100, wy * TERRAIN_SCALE + 100, 5) + 1) / 2;
    const a = (this.anomalyNoise.fbm(wx * TERRAIN_SCALE * 0.5, wy * TERRAIN_SCALE * 0.5, 4) + 1) / 2;
    const d = (this.detailNoise.fbm(wx * TERRAIN_SCALE * 2, wy * TERRAIN_SCALE * 2, 3) + 1) / 2;
    let t = (this.temperatureNoise.fbm(wx * TERRAIN_SCALE * 0.1 + 200, wy * TERRAIN_SCALE * 0.1 + 200, 3) + 1) / 2;

    // Apply biome modifications to noise values
    switch (biome) {
      case 'lush':
        // Default — no modifications, rivers active
        break;

      case 'desert':
        h = h * 0.7 + 0.1;       // flatten terrain, raise floor slightly
        m = m * 0.2;              // very low moisture
        t = t * 0.3 + 0.7;       // hot
        // No rivers in desert
        return this._desertTerrain(h, m, d, t);

      case 'boreal_frozen':
        t = t * 0.2;              // cold
        m = m * 0.6 + 0.2;       // moderate moisture (snow/ice)
        return this._frozenTerrain(h, m, d, t, wx, wy);

      case 'damaged':
        // High structural damage — mix of terrain and exposed hull
        return this._damagedTerrain(h, m, a, d, wx, wy);

      case 'vacuum':
        // Vented to space — mostly void with wreckage
        return this._vacuumTerrain(h, a, d, wx, wy);

      case 'swamp_toxic':
        h = h * 0.6;             // lower terrain = more water
        m = m * 0.4 + 0.6;      // very wet
        return this._toxicSwampTerrain(h, m, d, wx, wy);

      case 'overgrown':
        h = h * 0.85;            // slightly flatter
        m = m * 0.3 + 0.7;      // very moist
        return this._overgrownTerrain(h, m, d, wx, wy);
    }

    // Default (lush) — standard terrain with rivers
    const riverDist = this._getRiverDistance(wx, wy);
    if (riverDist <= RIVER_HALF_WIDTH) {
      return tile('RIVER_WATER', '~', '#4488ff', '#001144', false, { biome: 'river', waterDepth: 1 });
    }
    if (riverDist <= RIVER_HALF_WIDTH + RIVER_SHORE_WIDTH) {
      return tile('INNER_SHORE', '\u00B7', '#8B7D5B', '#2A2210', true, { biome: 'shore', waterDepth: -1 });
    }
    return this._terrainGen._terrainFromNoise(h, m, a, d, t);
  }

  // ── Biome-specific terrain generators ──

  _desertTerrain(h, m, d, t) {
    if (h < 0.3) {
      const fg = _lerpColor('#DDCC88', '#CCBB66', d);
      return tile('SAND', '.', fg, '#332200', true, { biome: 'desert' });
    }
    if (h < 0.5) {
      return tile('DUNE', '~', '#CCAA55', '#2A1A00', true, { biome: 'desert' });
    }
    if (h < 0.65) {
      return tile('SCRUB', ',', '#998844', '#221100', true, { biome: 'desert' });
    }
    if (h < 0.75) {
      return tile('DESERT_ROCK', '▓', '#AA8866', '#332211', false, { biome: 'desert' });
    }
    return tile('MESA', '△', '#BB9977', '#443322', false, { biome: 'desert' });
  }

  _frozenTerrain(h, m, d, t, wx, wy) {
    // Frozen rivers become ice paths
    const riverDist = this._getRiverDistance(wx, wy);
    if (riverDist <= RIVER_HALF_WIDTH + RIVER_SHORE_WIDTH) {
      return tile('FROZEN_RIVER', '=', '#AADDFF', '#334466', true, { biome: 'frozen', waterDepth: 0 });
    }

    if (h < 0.5) {
      const fg = _lerpColor('#CCDDEE', '#AABBCC', d);
      return tile('SNOW_GROUND', '.', fg, '#1A2233', true, { biome: 'frozen' });
    }
    if (h < 0.6) {
      return tile('FROZEN_TREE', '♣', '#6688AA', '#0A1522', true, { biome: 'frozen' });
    }
    if (h < 0.7) {
      return tile('DEAD_TREE', '♠', '#556677', '#0A1118', true, { biome: 'frozen' });
    }
    if (h < 0.8) {
      return tile('ICE_ROCK', '▓', '#99BBDD', '#223344', false, { biome: 'frozen' });
    }
    // Hull breach zones — exposed structural ice at high elevation
    const breachNoise = (this.tearNoise.fbm(wx * 0.1, wy * 0.1, 3) + 1) / 2;
    if (breachNoise > 0.7) {
      return tile('HULL_BREACH_ICE', '#', '#88AACC', '#112244', false, { biome: 'frozen', hullBreach: true });
    }
    return tile('ICE_FORMATION', '△', '#BBDDFF', '#223355', false, { biome: 'frozen' });
  }

  _damagedTerrain(h, m, a, d, wx, wy) {
    const damage = (this.tearNoise.fbm(wx * 0.08, wy * 0.08, 4) + 1) / 2;

    if (damage > 0.7) {
      // Exposed substructure
      if (d > 0.6) return tile('DAMAGE_FIRE', '~', '#FF4422', '#441100', false, { biome: 'damaged', hazard: 'fire' });
      return tile('DAMAGE_GRID', '#', '#888888', '#1A1A1A', false, { biome: 'damaged' });
    }
    if (damage > 0.5) {
      // Rubble and debris
      return tile('RUBBLE', '%', '#AA8866', '#2A1A0A', true, { biome: 'damaged' });
    }
    if (damage > 0.35) {
      // Damaged but passable
      return tile('CRACKED_FLOOR', '.', '#887766', '#1A1408', true, { biome: 'damaged' });
    }
    // Surviving patches of terrain
    if (h < 0.55) {
      return tile('DAMAGED_GRASS', ',', '#667744', '#0E1208', true, { biome: 'damaged' });
    }
    return tile('CHARRED_TREE', '♠', '#554433', '#0A0804', true, { biome: 'damaged' });
  }

  _vacuumTerrain(h, a, d, wx, wy) {
    const debris = (this.detailNoise.fbm(wx * 0.15, wy * 0.15, 3) + 1) / 2;
    const structure = (this.tearNoise.fbm(wx * 0.06, wy * 0.06, 4) + 1) / 2;

    // Scattered wreckage in void
    if (structure > 0.75) {
      // Intact sealed rooms (atmosphere pockets)
      if (d > 0.7) return tile('SEALED_ROOM_WALL', '█', '#556688', '#111122', false, { biome: 'vacuum', sealed: true });
      return tile('SEALED_ROOM_FLOOR', '.', '#445566', '#0A0A11', true, { biome: 'vacuum', sealed: true, atmosphere: true });
    }
    if (debris > 0.7) {
      return tile('VACUUM_WRECKAGE', '%', '#667788', '#000008', true, { biome: 'vacuum' });
    }
    if (debris > 0.55) {
      // Floating debris / structural remains
      return tile('VACUUM_DEBRIS', '·', '#334455', '#000004', true, { biome: 'vacuum' });
    }
    // Open vacuum — alien structures may spawn here
    if (a > 0.8) {
      return tile('ALIEN_GROWTH', '*', '#CC44FF', '#110022', true, { biome: 'vacuum', alien: true });
    }
    return tile('VACUUM_VOID', ' ', '#080810', '#000002', true, { biome: 'vacuum' });
  }

  _toxicSwampTerrain(h, m, d, wx, wy) {
    if (h < 0.25) {
      return tile('TOXIC_POOL', '~', '#44FF44', '#002200', false, { biome: 'toxic', hazard: 'toxic', waterDepth: 1 });
    }
    if (h < 0.4) {
      return tile('TOXIC_MUD', '.', '#556633', '#1A1A08', true, { biome: 'toxic' });
    }
    if (h < 0.55) {
      return tile('MUTANT_VINE', '♣', '#33AA33', '#0A1A0A', true, { biome: 'toxic' });
    }
    if (h < 0.65) {
      return tile('TOXIC_THICKET', '♠', '#228822', '#061006', true, { biome: 'toxic' });
    }
    if (h < 0.75) {
      const gasNoise = (this.anomalyNoise.fbm(wx * 0.2, wy * 0.2, 2) + 1) / 2;
      if (gasNoise > 0.7) return tile('TOXIC_GAS', '░', '#88FF88', '#113311', true, { biome: 'toxic', hazard: 'toxic_gas' });
      return tile('BIOLAB_RUIN', '#', '#558855', '#112211', false, { biome: 'toxic' });
    }
    return tile('CONTAINMENT_WALL', '█', '#446644', '#0A1A0A', false, { biome: 'toxic' });
  }

  _overgrownTerrain(h, m, d, wx, wy) {
    if (h < 0.35) {
      return tile('VINE_FLOOR', ',', '#22CC22', '#061A06', true, { biome: 'overgrown' });
    }
    if (h < 0.55) {
      const fg = _lerpColor('#11AA11', '#228822', d);
      return tile('DENSE_JUNGLE', '♣', fg, '#041004', true, { biome: 'overgrown' });
    }
    if (h < 0.7) {
      return tile('CANOPY', '♠', '#117711', '#020802', true, { biome: 'overgrown' });
    }
    // Hidden ruins under vegetation
    const ruinNoise = (this.tearNoise.fbm(wx * 0.1, wy * 0.1, 3) + 1) / 2;
    if (ruinNoise > 0.65) {
      if (d > 0.5) return tile('OVERGROWN_WALL', '▓', '#448844', '#112211', false, { biome: 'overgrown' });
      return tile('OVERGROWN_RUIN', '.', '#337733', '#0A1A0A', true, { biome: 'overgrown' });
    }
    return tile('GIANT_TREE', '♠', '#0A5A0A', '#010601', false, { biome: 'overgrown' });
  }

  // ── Facility tile generation (C2, ENG) ──
  _generateFacilityTile(wx, wy, section) {
    // Use noise to create room/corridor patterns
    const roomNoise = (this.heightNoise.fbm(wx * 0.08, wy * 0.08, 4) + 1) / 2;
    const corridorNoise = (this.moistureNoise.fbm(wx * 0.15, wy * 0.15, 3) + 1) / 2;
    const detailN = (this.detailNoise.fbm(wx * 0.3, wy * 0.3, 2) + 1) / 2;

    const isC2 = section.id === 'C2';
    const wallFg = isC2 ? '#6655AA' : '#AA4455';
    const wallBg = isC2 ? '#110022' : '#220011';
    const floorFg = isC2 ? '#443366' : '#664433';
    const floorBg = isC2 ? '#0A0011' : '#110A00';

    // Room structure: high roomNoise = walls, low = floor
    if (roomNoise > 0.68) {
      // Walls
      if (detailN > 0.7) return tile('FACILITY_PANEL', '░', wallFg, wallBg, false, { biome: section.id === 'C2' ? 'command' : 'engineering' });
      return tile('FACILITY_WALL', '█', wallFg, wallBg, false, { biome: section.id === 'C2' ? 'command' : 'engineering' });
    }

    // Corridors: strong corridor noise in horizontal/vertical bands
    const gridX = Math.abs(wx % 16 - 8);
    const gridY = Math.abs(wy % 16 - 8);
    const isCorridorX = gridX < 2;
    const isCorridorY = gridY < 2;

    if (isCorridorX || isCorridorY) {
      // Main corridors — always walkable
      if (isCorridorX && isCorridorY) {
        // Corridor intersection
        return tile('FACILITY_JUNCTION', '+', '#AAAAAA', floorBg, true, { biome: section.id === 'C2' ? 'command' : 'engineering' });
      }
      return tile('FACILITY_CORRIDOR', '.', '#888888', floorBg, true, { biome: section.id === 'C2' ? 'command' : 'engineering' });
    }

    // Room interiors
    if (roomNoise < 0.4) {
      // Open room floor
      if (detailN > 0.8) {
        // Room furniture / equipment
        const chars = isC2 ? ['◊', '□', '○'] : ['⚙', '◊', '□'];
        const charIdx = Math.floor(detailN * 10) % chars.length;
        return tile('FACILITY_EQUIPMENT', chars[charIdx], isC2 ? '#8877CC' : '#CC7744', floorBg, false,
          { biome: section.id === 'C2' ? 'command' : 'engineering' });
      }
      return tile('FACILITY_FLOOR', '.', floorFg, floorBg, true, { biome: section.id === 'C2' ? 'command' : 'engineering' });
    }

    // Intermediate: thin walls or doorways
    if (corridorNoise > 0.6) {
      return tile('FACILITY_FLOOR', '.', floorFg, floorBg, true, { biome: section.id === 'C2' ? 'command' : 'engineering' });
    }
    return tile('FACILITY_WALL', '█', wallFg, wallBg, false, { biome: section.id === 'C2' ? 'command' : 'engineering' });
  }

  // ── Inner hull engineering corridor generation ──
  // Layered industrial corridors: pipe runs → wall gradient → open walkway → wall gradient → pipe runs
  _generateInnerHullTile(wx, wy, section) {
    const localX = wx - section.startChunkX * CHUNK_SIZE;
    const totalWidth = section.widthChunks * CHUNK_SIZE; // ~256 tiles

    // ── Entrance openings — match the 3 entrance positions from adjacent habitat walls ──
    const isWestEdge = localX < 2;
    const isEastEdge = localX >= totalWidth - 2;
    if (isWestEdge || isEastEdge) {
      const adjSectionId = isWestEdge ? section.leftSection : section.rightSection;
      const adjSection = adjSectionId ? this.sectionManager.getSection(adjSectionId) : null;

      if (adjSection && adjSection.type === 'habitat') {
        const entranceInfo = _getEntranceAtY(wy, adjSection);
        if (entranceInfo) {
          let hasEntrance = true;
          if (adjSection.id === 'H1' && !isWestEdge) {
            hasEntrance = entranceInfo.entranceIndex === 1;
          } else if (adjSection.id === 'H7' && isWestEdge) {
            hasEntrance = entranceInfo.entranceIndex === 1;
          }
          if (hasEntrance) {
            const isPassageY = entranceInfo.phase > 0 && entranceInfo.phase < ENTRANCE_HALF_HEIGHT * 2;
            const isFrameY = entranceInfo.phase === 0 || entranceInfo.phase === ENTRANCE_HALF_HEIGHT * 2;
            if (isPassageY) {
              const isCenterRow = entranceInfo.phase === ENTRANCE_HALF_HEIGHT;
              const ch = isCenterRow ? '❖' : (isWestEdge ? '╣' : '╠');
              const fg = isCenterRow ? '#FFCC44' : '#CC9900';
              const bg = isCenterRow ? '#1A1100' : '#0D0800';
              return tile('ENTRANCE_PASSAGE', ch, fg, bg, true, { biome: 'inner_hull', entrance: true });
            }
            if (isFrameY) {
              const ch = isWestEdge ? (entranceInfo.phase === 0 ? '╗' : '╝') : (entranceInfo.phase === 0 ? '╚' : '╔');
              return tile('ENTRANCE_FRAME', ch, '#AA8800', '#0D0800', false, { biome: 'inner_hull', entranceFrame: true });
            }
          }
        }
      }
    }

    // ── Symmetrical layer zones — distance from nearest edge ──
    const distFromWest = localX;
    const distFromEast = totalWidth - 1 - localX;
    const edgeDist = Math.min(distFromWest, distFromEast);

    // Layer boundaries (tiles from each edge, symmetrical)
    const PIPE_ZONE = 40;       // 0–39: pipe conduit runs
    const WALL_ZONE = 48;       // 40–47: solid wall █
    const DARK_ZONE = 54;       // 48–53: dark shade ▓
    const MED_ZONE = 60;        // 54–59: medium shade ▒
    const PANEL_ZONE = 68;      // 60–67: panel/grating ◘
    // 68+: open walkway ◙

    // ── Pipe conduit zone (outermost 40 tiles each side) ──
    if (edgeDist < PIPE_ZONE) {
      // 4-row repeating pipe joint pattern
      // Joint pairs at regular intervals along the pipe run
      const pipeLocalX = edgeDist; // 0–39 from the nearest edge
      const rowPhase = ((wy % 4) + 4) % 4;
      const jointPeriod = 10;
      const jointPos = pipeLocalX % jointPeriod;

      // Determine pipe character based on row phase and joint position
      let ch, fg;
      if (rowPhase === 0 || rowPhase === 2) {
        // Straight runs with vertical junction pairs
        if (jointPos === 0 || jointPos === 1) {
          ch = '║';
          fg = '#4A6A8A';
        } else {
          ch = '═';
          fg = '#3A5A7A';
        }
      } else {
        // Bend/junction rows (phase 1 and 3)
        if (jointPos === 0) {
          ch = (rowPhase === 1) ? '╝' : '╗';
          fg = '#4A6A8A';
        } else if (jointPos === 1) {
          ch = '║';
          fg = '#4A6A8A';
        } else if (jointPos === jointPeriod - 1) {
          ch = (rowPhase === 1) ? '╔' : '╚';
          fg = '#4A6A8A';
        } else {
          ch = '═';
          fg = '#3A5A7A';
        }
      }

      // Slight brightness variation across the pipe field
      const pipeDepth = pipeLocalX / PIPE_ZONE;
      const brightness = 0.7 + 0.3 * pipeDepth;
      const r = Math.floor(parseInt(fg.slice(1, 3), 16) * brightness);
      const g = Math.floor(parseInt(fg.slice(3, 5), 16) * brightness);
      const b = Math.floor(parseInt(fg.slice(5, 7), 16) * brightness);
      const adjFg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

      return tile('HULL_PIPE', ch, adjFg, '#020208', false, { biome: 'inner_hull' });
    }

    // ── Solid wall zone ──
    if (edgeDist < WALL_ZONE) {
      return tile('HULL_CORRIDOR_WALL', '█', '#334455', '#020205', false, { biome: 'inner_hull' });
    }

    // ── Dark shade zone ──
    if (edgeDist < DARK_ZONE) {
      return tile('HULL_SHADE_DARK', '▓', '#2A3A4A', '#020206', false, { biome: 'inner_hull' });
    }

    // ── Medium shade zone ──
    if (edgeDist < MED_ZONE) {
      return tile('HULL_SHADE_MED', '▒', '#223344', '#010104', false, { biome: 'inner_hull' });
    }

    // ── Panel/grating zone ──
    if (edgeDist < PANEL_ZONE) {
      return tile('HULL_PANEL', '◘', '#1A2A3A', '#010104', false, { biome: 'inner_hull' });
    }

    // ── Central walkway (everything beyond the panel zone) ──
    const centerX = Math.floor(totalWidth / 2);
    const distFromCenter = Math.abs(localX - centerX);

    // Transit station marker every ~512 tiles along Y
    const stationY = wy % (CHUNK_SIZE * 16);
    if (stationY >= 0 && stationY < 3 && distFromCenter < 1) {
      return tile('TRANSIT_PLATFORM', '◊', '#FFAA00', '#0A0800', true,
        { biome: 'inner_hull', transitStation: true, corridorId: section.id });
    }

    // Subtle grid lines on the walkway floor
    if (wy % 16 === 0 && localX === centerX) {
      return tile('HULL_CATWALK_LINE', '┼', '#1A2A3A', '#030308', true, { biome: 'inner_hull' });
    }
    if (wy % 16 === 0) {
      return tile('HULL_CATWALK_LINE', '─', '#152535', '#030308', true, { biome: 'inner_hull' });
    }
    if (localX === centerX) {
      return tile('HULL_CATWALK_LINE', '│', '#152535', '#030308', true, { biome: 'inner_hull' });
    }

    // Default walkway floor
    return tile('HULL_WALKWAY', '◙', '#0D1D2D', '#030308', true, { biome: 'inner_hull' });
  }

  // (Megalithic structures removed — will be re-added deliberately later)

  _generateChunk(cx, cy) {
    // Apply N-S cylindrical wrapping based on section
    const section = this.sectionManager.getSectionAt(cx);
    const wrappedCY = section ? this.sectionManager.wrapChunkY(cy, section) : cy;
    const key = this._chunkKey(cx, wrappedCY);
    if (this.chunks.has(key)) return this.chunks.get(key);

    // Beyond ship boundaries — empty void
    if (!section) {
      const tiles = makeTileGrid(CHUNK_SIZE, CHUNK_SIZE, () =>
        tile('VOID_SPACE', ' ', '#000000', '#000000', false, { biome: 'void' })
      );
      const chunk = { tiles, locations: [], structures: [], cx, cy: wrappedCY, sectionId: null };
      this.chunks.set(key, chunk);
      return chunk;
    }

    const ox = cx * CHUNK_SIZE;
    const oy = wrappedCY * CHUNK_SIZE;
    const tiles = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      tiles[ly] = [];
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        tiles[ly][lx] = this._generateTile(ox + lx, oy + ly);
      }
    }

    // Only apply tears, locations, bridges to habitat sections
    if (section.type === 'habitat') {
      // Apply colony substructure tears — patches where floor is torn revealing metal grid
      this._applyTears(cx, wrappedCY, tiles);

      // Remove small isolated non-walkable clusters (< 25 tiles) to prevent movement frustration
      this._removeSmallBlockers(tiles);

      // Only place settlements in habitable biomes
      const biome = this.sectionManager.getBiome(section.id);
      const habitableForLocations = biome !== 'vacuum';
      const locations = habitableForLocations ? this._placeChunkLocations(cx, wrappedCY, tiles) : [];

      // Detect horizontal river segments and place bridge locations (only for biomes with rivers)
      if (biome === 'lush') {
        this._placeBridgeLocations(cx, wrappedCY, tiles, locations);
      }

      const chunk = { tiles, locations, structures: [], cx, cy: wrappedCY, sectionId: section.id };
      this.chunks.set(key, chunk);
      return chunk;
    }

    // For facilities and inner hull, just clean up blockers
    this._removeSmallBlockers(tiles);

    const chunk = { tiles, locations: [], structures: [], cx, cy: wrappedCY, sectionId: section.id };
    this.chunks.set(key, chunk);
    return chunk;
  }

  _applyTears(cx, cy, tiles) {
    const TEAR_SCALE = TERRAIN_SCALE * 0.8;
    const LAND_TYPES = new Set([
      'GRASSLAND', 'FOREST', 'DEEP_FOREST', 'MEADOW', 'TALL_GRASS',
      'SCRUBLAND', 'BARREN_WASTE', 'FIELD', 'SPARSE_TREES',
    ]);
    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;

    // Border around chunk to detect tear centers in neighboring chunks
    const BORDER = 8;
    const CORE_THRESHOLD = 0.74;

    // Pass 1: find tear core positions (exposed substructure centers)
    // Sample chunk + border for cross-chunk tear rings
    const cores = [];
    for (let ly = -BORDER; ly < CHUNK_SIZE + BORDER; ly++) {
      for (let lx = -BORDER; lx < CHUNK_SIZE + BORDER; lx++) {
        const wx = ox + lx;
        const wy = oy + ly;
        const tearVal = (this.tearNoise.fbm(wx * TEAR_SCALE + 300, wy * TEAR_SCALE + 300, 4) + 1) / 2;
        if (tearVal >= CORE_THRESHOLD) {
          cores.push({ lx, ly });
        }
      }
    }

    if (cores.length === 0) return;

    // Pass 2: assign concentric rings with noise-warped distance for irregular edges
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const t = tiles[ly][lx];
        if (!LAND_TYPES.has(t.type)) continue;
        if (t.structure || t.locationId) continue;

        const wx = ox + lx;
        const wy = oy + ly;

        let minRawDist = Infinity;
        for (const c of cores) {
          const d = Math.max(Math.abs(lx - c.lx), Math.abs(ly - c.ly));
          if (d < minRawDist) minRawDist = d;
        }

        // Warp distance with detail noise for irregular, organic edges
        const warp = (this.detailNoise.fbm(wx * 0.15, wy * 0.15, 2) + 1) / 2; // 0–1
        const minDist = minRawDist + (warp - 0.5) * 2.5; // ±1.25 cell jitter

        // Expanded rings: 0–1 grid, 1–2 dark metal, 2–3 light metal, 3–5 dirt, 5–8 grass
        if (minDist < 1) {
          tiles[ly][lx] = tile('TEAR_GRID', '#', '#C0C0C0', '#1A1A1A', false, { tearZone: true, depth: -2 });
        } else if (minDist < 2) {
          tiles[ly][lx] = tile('TEAR_DARK_METAL', '\u2592', '#707070', '#2A2A2A', false, { tearZone: true, depth: -2 });
        } else if (minDist < 3) {
          tiles[ly][lx] = tile('TEAR_LIGHT_METAL', '\u2591', '#A0A0A0', '#505050', true, { tearZone: true });
        } else if (minDist < 5) {
          tiles[ly][lx] = tile('TEAR_DIRT', '\u00B7', '#8B6914', '#3D2B08', true, { tearZone: true });
        } else if (minDist < 8) {
          tiles[ly][lx] = tile('TEAR_GRASS', ',', '#338833', '#0E1E0E', true, { tearZone: true });
        }
      }
    }
  }

  _applyMapScarsToChunk(cx, cy, tiles) {
    if (this._scarZones.length === 0) return;

    // Safety net: convert non-walkable scar terrain to walkable rubble near starting town
    const ORIGIN_SAFE_CHUNKS = 3;
    const nearOrigin = Math.abs(cx) <= ORIGIN_SAFE_CHUNKS && Math.abs(cy) <= ORIGIN_SAFE_CHUNKS;

    for (const scar of this._scarZones) {
      const dx = cx - scar.cx;
      const dy = cy - scar.cy;
      const chunkDist = Math.sqrt(dx * dx + dy * dy);

      if (chunkDist > scar.radius) continue;

      // This chunk is within the scar zone — apply terrain effects
      const intensity = 1 - (chunkDist / scar.radius); // 1.0 at center, 0 at edge
      const rng = this._chunkRng(cx + scar.year, cy + scar.year); // deterministic per scar+chunk

      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          // Probability of replacement based on intensity and severity
          if (!rng.chance(intensity * (scar.severity || 0.5) * 0.7)) continue;

          switch (scar.type) {
            case 'slag_zone':
              tiles[ly][lx] = tile('REACTOR_SLAG', '~', '#FF6622', '#331100', true, {
                biome: 'reactor_slag', historicalScar: scar.description,
              });
              break;
            case 'void_rift':
              tiles[ly][lx] = tile('VOID_RIFT', ' ', '#220044', '#000000', true, {
                biome: 'void_rift', historicalScar: scar.description,
              });
              break;
            case 'breach_zone':
              tiles[ly][lx] = tile('HULL_BREACH', '%', '#8899AA', '#111122', true, {
                biome: 'hull_breach', historicalScar: scar.description,
              });
              break;
            case 'war_ruins':
              if (rng.chance(0.3)) {
                tiles[ly][lx] = tile('RUBBLE', '.', '#666655', '#222211', true, {
                  biome: 'ruins', historicalScar: scar.description,
                });
              } else if (rng.chance(0.15)) {
                tiles[ly][lx] = tile('RUINED_WALL', '#', '#555544', '#222211', false, {
                  biome: 'ruins', historicalScar: scar.description, structure: true,
                });
              }
              break;
            case 'plague_zone':
              tiles[ly][lx] = tile(
                'TOXIC_SUMP',
                '~',
                '#44FF00',
                '#112200',
                false,
                { biome: 'toxic_sump', historicalScar: scar.description }
              );
              break;
            case 'transformed_biome':
              if (scar.terrainEffect === 'HYDROPONIC_JUNGLE') {
                tiles[ly][lx] = tile('HYDRO_JUNGLE', '&', '#00FF66', '#002211', true, { biome: 'hydro_jungle', historicalScar: scar.description });
              } else if (scar.terrainEffect === 'CRYSTALLINE_GROWTH') {
                tiles[ly][lx] = tile('CRYSTAL_ZONE', '#', '#44FFFF', '#002222', false, { biome: 'crystal_zone', historicalScar: scar.description });
              } else if (scar.terrainEffect === 'NANO_PLAGUE') {
                tiles[ly][lx] = tile('NANO_PLAGUE', ':', '#888888', '#222222', true, { biome: 'nano_plague', historicalScar: scar.description });
              } else if (scar.terrainEffect === 'ALIEN_CRASH') {
                tiles[ly][lx] = tile('ALIEN_CRASH', '*', '#FF44FF', '#220022', true, { biome: 'alien_crash', historicalScar: scar.description });
              }
              break;
            case 'abandoned_district':
              if (rng.chance(0.4)) {
                tiles[ly][lx] = tile('RUBBLE', '.', '#444433', '#1A1A11', true, { biome: 'ruins', historicalScar: scar.description });
              } else if (rng.chance(0.1)) {
                tiles[ly][lx] = tile('RUINED_WALL', '#', '#333322', '#1A1A11', false, { biome: 'ruins', historicalScar: scar.description, structure: true });
              }
              break;
            case 'monument':
              // Only place a monument at the center tile of the scar
              if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && lx === Math.floor(CHUNK_SIZE / 2) && ly === Math.floor(CHUNK_SIZE / 2)) {
                tiles[ly][lx] = tile('MONUMENT', '\u2666', '#FFD700', '#332200', false, {
                  biome: 'monument', historicalScar: scar.description, structure: true, lightSource: { radius: 10, r: 1, g: 0.85, b: 0.3, intensity: 0.8 },
                });
              }
              break;
            case 'fortress':
              if (rng.chance(0.25)) {
                tiles[ly][lx] = tile('FORTIFICATION', '#', '#778899', '#222233', false, {
                  biome: 'fortress', historicalScar: scar.description, structure: true,
                });
              }
              break;
            case 'machine_shrine':
              if (rng.chance(0.2)) {
                tiles[ly][lx] = tile('MACHINE_SHRINE', '+', '#00CCFF', '#001122', true, {
                  biome: 'machine_shrine', historicalScar: scar.description,
                });
              } else if (rng.chance(0.05) && lx === Math.floor(CHUNK_SIZE / 2) && ly === Math.floor(CHUNK_SIZE / 2)) {
                tiles[ly][lx] = tile('SHRINE_CORE', '\u2726', '#00FFFF', '#002233', false, {
                  biome: 'machine_shrine', historicalScar: scar.description, structure: true,
                  lightSource: { radius: 8, r: 0, g: 0.8, b: 1, intensity: 0.7 },
                });
              }
              break;
            case 'hidden_archive':
              // Subtle — only a few tiles hint at buried knowledge
              if (rng.chance(0.05)) {
                tiles[ly][lx] = tile('ARCHIVE_MARKER', '\u00b7', '#4488FF', '#111133', true, {
                  biome: 'archive', historicalScar: scar.description,
                });
              }
              break;
            case 'megastructure':
              if (rng.chance(0.15)) {
                tiles[ly][lx] = tile('MEGASTRUCTURE', '=', '#AABBCC', '#1A1A2A', false, {
                  biome: 'megastructure', historicalScar: scar.description, structure: true,
                });
              }
              break;
          }

          // Revert non-walkable scar tiles near starting town to walkable rubble
          if (nearOrigin && !tiles[ly][lx].walkable && tiles[ly][lx].historicalScar) {
            tiles[ly][lx] = tile('RUBBLE', '.', '#555544', '#222211', true, {
              biome: 'ruins', historicalScar: tiles[ly][lx].historicalScar,
            });
          }
        }
      }
    }
  }

  _removeSmallBlockers(tiles) {
    const S = CHUNK_SIZE;
    const MIN_CLUSTER = 25; // minimum 5x5 equivalent cluster size
    const visited = new Uint8Array(S * S);
    // River water is exempt
    const WATER_TYPES = new Set(['RIVER_WATER']);
    // Walkable replacement for non-walkable terrain by biome
    const REPLACEMENTS = {
      forest: { type: 'GRASSLAND', char: '.', fg: '#44cc44', bg: '#112211', biome: 'grassland' },
      mountain: { type: 'GRASSLAND', char: '.', fg: '#44cc44', bg: '#112211', biome: 'grassland' },
      grassland: { type: 'GRASSLAND', char: '.', fg: '#44cc44', bg: '#112211', biome: 'grassland' },
    };
    const DEFAULT_REPLACE = { type: 'GRASSLAND', char: '.', fg: '#44cc44', bg: '#112211', biome: 'grassland' };

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const idx = y * S + x;
        if (visited[idx]) continue;
        const t = tiles[y][x];
        if (t.walkable || t.structure || t.locationId || t.tearZone || t.airlockFrame || WATER_TYPES.has(t.type)) {
          visited[idx] = 1;
          continue;
        }
        // Flood-fill to find connected non-walkable cluster
        const cluster = [];
        const stack = [[x, y]];
        visited[idx] = 1;
        while (stack.length > 0) {
          const [cx, cy] = stack.pop();
          cluster.push([cx, cy]);
          for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
            if (nx < 0 || nx >= S || ny < 0 || ny >= S) continue;
            const ni = ny * S + nx;
            if (visited[ni]) continue;
            const nt = tiles[ny][nx];
            if (nt.walkable || nt.structure || nt.locationId || nt.airlockFrame || WATER_TYPES.has(nt.type)) {
              visited[ni] = 1;
              continue;
            }
            visited[ni] = 1;
            stack.push([nx, ny]);
          }
        }
        // Convert small clusters to walkable terrain
        if (cluster.length < MIN_CLUSTER) {
          for (const [cx, cy] of cluster) {
            const orig = tiles[cy][cx];
            const biome = orig.biome || 'grassland';
            const rep = REPLACEMENTS[biome] || DEFAULT_REPLACE;
            tiles[cy][cx] = tile(rep.type, rep.char, rep.fg, rep.bg, true, { biome: rep.biome });
          }
        }
      }
    }
  }

  _generateName(rng, type) {
    const prefix = rng.random(NAME_PREFIXES);
    const suffixes = NAME_SUFFIXES[type] || NAME_SUFFIXES.village;
    const suffix = rng.random(suffixes);
    // Some types use "Prefix Suffix" format (castle, temple, dungeon, ruins, tower, camp)
    if (suffix.startsWith(' ')) {
      return prefix + suffix;          // e.g. "Iron Keep"
    }
    return prefix + suffix;             // e.g. "Ashbrook"
  }

  // ── Bridge detection: find horizontal water segments 7-9 cells wide ──
  _isWaterTile(t) {
    return t && t.type === 'RIVER_WATER';
  }

  _isLandTile(t) {
    return t && t.walkable && !this._isWaterTile(t) && t.type !== 'BRIDGE_ENTRANCE';
  }

  _placeBridgeLocations(cx, cy, tiles, locations) {
    const rng = new SeededRNG(this.seed + cx * 31337 + cy * 7919 + 88888);
    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;
    const WATER_TYPES = new Set(['RIVER_WATER']);

    // Scan columns for vertical water segments (rivers now flow left-to-right)
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
      // Only consider bridge-eligible X positions every ~50 world tiles
      const worldX = ox + lx;
      const bridgeHash = ((worldX * 73856093) ^ (this.seed)) >>> 0;
      if (bridgeHash % 50 !== 0) continue;

      let waterStart = -1;
      for (let ly = 1; ly < CHUNK_SIZE - 1; ly++) {
        const t = tiles[ly][lx];
        if (WATER_TYPES.has(t.type)) {
          if (waterStart === -1) waterStart = ly;
        } else {
          if (waterStart !== -1) {
            const span = ly - waterStart;
            if (span >= 3 && span <= 5) {
              // Check walkable land above and below
              const aboveTile = waterStart > 0 ? tiles[waterStart - 1][lx] : null;
              const belowTile = ly < CHUNK_SIZE ? tiles[ly][lx] : null;
              const aboveOk = aboveTile && aboveTile.walkable && !WATER_TYPES.has(aboveTile.type);
              const belowOk = belowTile && belowTile.walkable && !WATER_TYPES.has(belowTile.type);

              // Confirm water extends left and right (real river, not pond)
              if (aboveOk && belowOk) {
                let leftWater = 0, rightWater = 0;
                for (let sy = waterStart; sy < ly; sy++) {
                  if (lx > 0 && WATER_TYPES.has(tiles[sy][lx - 1].type)) leftWater++;
                  if (lx < CHUNK_SIZE - 1 && WATER_TYPES.has(tiles[sy][lx + 1].type)) rightWater++;
                }
                const halfSpan = span / 2;
                if (leftWater >= halfSpan && rightWater >= halfSpan) {
                  if (rng.next() < 0.55) {
                    this._createBridgeAtColumn(cx, cy, tiles, locations, ox, oy, rng,
                      waterStart, ly - 1, lx, span);
                  }
                }
              }
            }
            waterStart = -1;
          }
        }
      }
    }
  }

  _createBridgeAtColumn(cx, cy, tiles, locations, ox, oy, rng, startY, endY, lx, span) {
    const midY = Math.floor((startY + endY) / 2);
    const wx = ox + lx;
    const wy = oy + midY;

    // Check not too close to other locations
    for (const loc of locations) {
      if (distance(wx, wy, loc.x, loc.y) < 10) return;
    }
    // Check neighboring chunks
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nk = this._chunkKey(cx + dx, cy + dy);
        const neighbor = this.chunks.get(nk);
        if (!neighbor) continue;
        for (const nloc of neighbor.locations) {
          if (distance(wx, wy, nloc.x, nloc.y) < 10) return;
        }
      }
    }

    // Determine bridge state (discovered later by player)
    // 0 = has enemies+shops, 1 = has enemies only, 2 = empty/safe, 3 = broken/impassable
    const stateRoll = rng.next();
    let bridgeState;
    if (stateRoll < 0.35) bridgeState = 0;       // enemies + shops
    else if (stateRoll < 0.65) bridgeState = 1;   // enemies only
    else if (stateRoll < 0.80) bridgeState = 2;   // empty
    else bridgeState = 3;                          // broken

    const id = (cx + 50000) * 100000 + (cy + 50000) * 10 + 9;
    const bridgeName = this._generateName(rng, 'camp').replace(/ Camp| Den| Crossing| Lodge| Waypost/, '') + ' Bridge';

    const loc = {
      id,
      name: bridgeName,
      type: 'bridge_dungeon',
      x: wx, y: wy,
      population: 0,
      difficulty: 2 + rng.nextInt(0, 3),
      bridgeState,
      bridgeSpan: span,
      bridgeStartY: oy + startY,
      bridgeEndY: oy + endY,
      bridgeX: wx,
      // Legacy compat: map to old fields for bridge dungeon generator
      bridgeStartX: wx,
      bridgeEndX: wx,
      bridgeY: wy,
      discovered: false,
      markedBroken: false,
    };
    locations.push(loc);
    this.locationMap.set(`${wx},${wy}`, loc);

    // North entrance (land side)
    const northY = startY - 1;
    if (northY >= 0 && northY < CHUNK_SIZE) {
      tiles[northY][lx] = tile('BRIDGE_ENTRANCE', '\u2302', '#AA8866', '#332211', true,
        { biome: 'bridge', locationId: id, bridgeSide: 'north' });
      this.locationMap.set(`${wx},${oy + northY}`, loc);
    }
    // South entrance (land side)
    const southY = endY + 1;
    if (southY >= 0 && southY < CHUNK_SIZE) {
      tiles[southY][lx] = tile('BRIDGE_ENTRANCE', '\u2302', '#AA8866', '#332211', true,
        { biome: 'bridge', locationId: id, bridgeSide: 'south' });
      this.locationMap.set(`${wx},${oy + southY}`, loc);
    }

    // Draw bridge structure across the water (vertically)
    for (let by = startY; by <= endY; by++) {
      if (by >= 0 && by < CHUNK_SIZE) {
        tiles[by][lx] = tile('BRIDGE', '=', '#887766', '#222211', false,
          { biome: 'bridge', locationId: id });
      }
    }
    // Center marker
    tiles[midY][lx] = tile('LOCATION', '\u2302', '#CCAA88', '#332211', true,
      { biome: 'bridge', locationId: id });
  }

  _placeChunkLocations(cx, cy, tiles) {
    const rng = this._chunkRng(cx, cy);
    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;

    // 0-2 locations per chunk (sparse distribution)
    const roll = rng.next();
    const count = roll < 0.65 ? 0 : roll < 0.95 ? 1 : 2;

    const locations = [];
    const minDist = 15;

    for (let i = 0; i < count; i++) {
      // Pick a weighted random location type
      let r = rng.next() * TOTAL_WEIGHT;
      let def = LOCATION_DEFS[0];
      for (const d of LOCATION_DEFS) {
        r -= d.weight;
        if (r <= 0) { def = d; break; }
      }

      let placed = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        const lx = rng.nextInt(2, CHUNK_SIZE - 3);
        const ly = rng.nextInt(2, CHUNK_SIZE - 3);
        const t = tiles[ly][lx];

        if (!t.walkable) continue;
        if (t.type === 'RIVER_WATER' || t.type === 'MOUNTAIN' || t.type === 'MOUNTAIN_BASE' || t.type === 'INNER_SHORE') continue;

        const wx = ox + lx;
        const wy = oy + ly;

        // Check distance from other locations in this chunk
        let tooClose = false;
        for (const loc of locations) {
          if (distance(wx, wy, loc.x, loc.y) < minDist) { tooClose = true; break; }
        }
        if (tooClose) continue;

        // Check 8 neighboring chunks for minimum distance
        for (let dx = -1; dx <= 1 && !tooClose; dx++) {
          for (let dy = -1; dy <= 1 && !tooClose; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nk = this._chunkKey(cx + dx, cy + dy);
            const neighbor = this.chunks.get(nk);
            if (!neighbor) continue;
            for (const nloc of neighbor.locations) {
              if (distance(wx, wy, nloc.x, nloc.y) < minDist) { tooClose = true; break; }
            }
          }
        }
        if (tooClose) continue;

        // Deterministic ID: encode chunk coords + local index
        const id = (cx + 50000) * 100000 + (cy + 50000) * 10 + i;
        const pop = rng.nextInt(def.population[0], def.population[1]);

        const loc = {
          id,
          name: this._generateName(rng, def.type),
          type: def.type,
          x: wx, y: wy,
          population: pop,
          difficulty: def.difficulty + rng.nextInt(0, 2),
        };
        locations.push(loc);
        this.locationMap.set(`${wx},${wy}`, loc);

        // Mark tile as location
        const charMap = {
          city: '*', town: 'o', village: '\u00b7', castle: '\u00a4',
          temple: '\u2020', dungeon: '\u2126', ruins: '\u00a7', tower: '!', camp: '\u00b0',
        };
        tiles[ly][lx] = tile('LOCATION', charMap[def.type] || '?', '#ffffff', '#442200', true,
          { biome: t.biome, locationId: id });
        placed = true;
        break;
      }
    }

    return locations;
  }

  getTile(wx, wy) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    // Apply N-S wrapping for cylindrical geometry
    const section = this.sectionManager.getSectionAt(cx);
    const wrappedWY = section ? this.sectionManager.wrapWorldY(wy, section) : wy;
    const cy = Math.floor(wrappedWY / CHUNK_SIZE);
    const chunk = this._generateChunk(cx, cy);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wrappedWY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.tiles[ly][lx];
  }

  getLocation(wx, wy) {
    return this.locationMap.get(`${wx},${wy}`) || null;
  }

  getLoadedLocations() {
    const locs = [];
    for (const chunk of this.chunks.values()) {
      for (const loc of chunk.locations) locs.push(loc);
    }
    return locs;
  }

  // Get the current section at world coordinates
  getSectionAtWorld(wx) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    return this.sectionManager.getSectionAt(cx);
  }

  ensureChunksAround(wx, wy) {
    const pcx = Math.floor(wx / CHUNK_SIZE);
    const section = this.sectionManager.getSectionAt(pcx);
    const wrappedWY = section ? this.sectionManager.wrapWorldY(wy, section) : wy;
    const pcy = Math.floor(wrappedWY / CHUNK_SIZE);
    const radius = 2; // 5x5 ring

    for (let dx = -radius; dx <= radius; dx++) {
      const targetCX = pcx + dx;
      // Don't generate chunks beyond ship boundaries
      if (this.sectionManager.isBeyondShip(targetCX * CHUNK_SIZE)) continue;

      for (let dy = -radius; dy <= radius; dy++) {
        const chunk = this._generateChunk(targetCX, pcy + dy);
        this.exploredChunks.add(this._chunkKey(targetCX, chunk.cy));
      }
    }

    // Evict distant chunks (Manhattan distance > 4)
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > 4 || Math.abs(chunk.cy - pcy) > 4) {
        this.chunks.delete(key);
        // Remove locations from locationMap
        for (const loc of chunk.locations) {
          this.locationMap.delete(`${loc.x},${loc.y}`);
        }
      }
    }

    // Build roads between nearby loaded locations
    this._buildLocalRoads();
  }

  _buildLocalRoads() {
    const locs = this.getLoadedLocations();
    const majorTypes = new Set(['city', 'town', 'castle', 'village']);
    const connectable = locs.filter(l => majorTypes.has(l.type));
    if (connectable.length < 2) return;

    // Build MST on nearby locations (within ~40 tiles)
    const maxRoadDist = 30;
    const edges = [];
    for (let i = 0; i < connectable.length; i++) {
      for (let j = i + 1; j < connectable.length; j++) {
        const d = distance(connectable[i].x, connectable[i].y, connectable[j].x, connectable[j].y);
        if (d < maxRoadDist) {
          edges.push({ i, j, d });
        }
      }
    }
    edges.sort((a, b) => a.d - b.d);

    // Simple union-find for MST
    const parent = connectable.map((_, idx) => idx);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };

    for (const { i, j } of edges) {
      const a = connectable[i], b = connectable[j];
      const cacheKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (this._roadCache.has(cacheKey)) continue;

      const ri = find(i), rj = find(j);
      if (ri === rj) continue;
      parent[ri] = rj;
      this._roadCache.add(cacheKey);

      // Carve road using A*
      const path = this._findPath(a.x, a.y, b.x, b.y);
      if (path) {
        for (const p of path) {
          const cx = Math.floor(p.x / CHUNK_SIZE);
          const cy = Math.floor(p.y / CHUNK_SIZE);
          const chunk = this.chunks.get(this._chunkKey(cx, cy));
          if (!chunk) continue;
          const lx = ((p.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const ly = ((p.y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const t = chunk.tiles[ly][lx];
          if (t.type === 'GRASSLAND' || t.type === 'FOREST' || t.type === 'DEEP_FOREST' ||
              t.type === 'INNER_SHORE' || t.type === 'OUTER_SHORE') {
            chunk.tiles[ly][lx] = tile('ROAD', '=', '#aa8844', '#332211', true, { biome: t.biome });
          } else if (t.type === 'RIVER_WATER') {
            chunk.tiles[ly][lx] = tile('BRIDGE', '=', '#aa6622', '#000066', true, { biome: t.biome });
          }
        }
      }
    }
  }

  _findPath(sx, sy, ex, ey) {
    const self = this;
    const IMPASSABLE = new Set(['RIVER_WATER', 'MOUNTAIN']);
    const isWalkable = (x, y) => {
      const t = self.getTile(x, y);
      if (IMPASSABLE.has(t.type)) return false;
      return true;
    };

    // Generate 1-3 waypoints offset from the direct line to create meandering
    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 8) {
      // Short roads don't need meandering
      return AStar.findPath(sx, sy, ex, ey, isWalkable, 5000);
    }

    // Deterministic RNG from endpoint coords
    const waypointRng = new SeededRNG(this.seed + sx * 7919 + sy * 6271 + ex * 4219 + ey * 3037);

    // Perpendicular direction
    const perpX = -dy / dist;
    const perpY = dx / dist;

    // Number of waypoints based on distance
    const numWaypoints = dist > 25 ? 3 : dist > 15 ? 2 : 1;
    const waypoints = [{ x: sx, y: sy }];

    for (let i = 0; i < numWaypoints; i++) {
      const t = (i + 1) / (numWaypoints + 1); // evenly spaced along line
      const midX = sx + dx * t;
      const midY = sy + dy * t;
      // Offset perpendicular by up to 30% of total distance
      const maxOffset = dist * 0.3;
      const offset = (waypointRng.next() - 0.5) * 2 * maxOffset;
      waypoints.push({
        x: Math.round(midX + perpX * offset),
        y: Math.round(midY + perpY * offset),
      });
    }
    waypoints.push({ x: ex, y: ey });

    // A* between consecutive waypoints, concatenate
    const fullPath = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const wp0 = waypoints[i];
      const wp1 = waypoints[i + 1];
      const seg = AStar.findPath(wp0.x, wp0.y, wp1.x, wp1.y, isWalkable, 5000);
      if (!seg) return null; // if any segment fails, no road
      // Skip first point of subsequent segments to avoid duplicates
      for (let j = (i === 0 ? 0 : 1); j < seg.length; j++) {
        fullPath.push(seg[j]);
      }
    }
    return fullPath;
  }
}

// ============================================================================
// SettlementGenerator
// ============================================================================

export class SettlementGenerator {

  generate(rng, type, population, biome) {
    const coreSizes = { village: [20, 20], town: [35, 35], city: [50, 40], castle: [40, 40] };
    const [coreW, coreH] = coreSizes[type] || [25, 25];

    // Add outskirts padding: 30-40 tiles around the settlement
    const pad = type === 'city' ? 40 : type === 'town' ? 35 : type === 'castle' ? 30 : 30;
    const width = coreW + pad * 2;
    const height = coreH + pad * 2;

    // Fill entire grid with outskirts terrain
    const tiles = makeTileGrid(width, height, (x, y) =>
      this._outskirtsFromBiome(rng, biome, x, y, pad, coreW, coreH, width, height)
    );

    // Now generate the core settlement inside the padded area
    const coreTiles = makeTileGrid(coreW, coreH, () =>
      tile('GRASSLAND', ',', '#44aa44', '#112211', true, { buildingId: null })
    );

    const buildings = [];
    const npcSlots = [];

    if (type === 'castle') {
      this._generateCastle(rng, coreTiles, coreW, coreH, buildings, npcSlots);
    } else {
      this._generateSettlement(rng, coreTiles, coreW, coreH, type, population, buildings, npcSlots, biome);
    }

    // Copy core tiles into the padded grid
    for (let y = 0; y < coreH; y++) {
      for (let x = 0; x < coreW; x++) {
        tiles[pad + y][pad + x] = coreTiles[y][x];
      }
    }

    // Offset building and NPC positions by pad
    for (const b of buildings) { b.x += pad; b.y += pad; }
    for (const s of npcSlots) { s.position.x += pad; s.position.y += pad; }

    // Add roads leading from settlement edges outward
    this._generateOutskirtRoads(rng, tiles, pad, coreW, coreH, width, height);

    // Place the fallen mechanical arm to the left of every settlement
    this._placeMechanicalArm(tiles, pad, coreW, coreH, width, height);

    return { tiles, width, height, buildings, npcSlots, coreOffset: { x: pad, y: pad } };
  }

  // Apply historical context to a generated settlement (war ruins, monuments, plague, etc.)
  applyHistoricalContext(settlement, rng, historicalContext) {
    if (!historicalContext || !historicalContext.scars || historicalContext.scars.length === 0) return settlement;

    const { tiles, buildings, npcSlots, coreOffset } = settlement;
    const coreW = settlement.width - coreOffset.x * 2;
    const coreH = settlement.height - coreOffset.y * 2;

    for (const scar of historicalContext.scars) {
      switch (scar.type) {
        case 'war_ruins': {
          // Damage some buildings — replace tiles with rubble
          const damageRate = Math.min(0.4, scar.severity * 0.5);
          for (let y = coreOffset.y; y < coreOffset.y + coreH; y++) {
            for (let x = coreOffset.x; x < coreOffset.x + coreW; x++) {
              if (tiles[y] && tiles[y][x] && rng.chance(damageRate * 0.15)) {
                tiles[y][x] = tile('RUBBLE', '.', '#666655', '#222211', true, {
                  historicalScar: scar.description,
                });
              }
            }
          }
          // Remove some NPC slots (fewer people in war-torn settlements)
          const removeCount = Math.floor(npcSlots.length * damageRate * 0.3);
          for (let i = 0; i < removeCount && npcSlots.length > 2; i++) {
            npcSlots.pop();
          }
          break;
        }
        case 'monument': {
          // Place a golden monument in the settlement center
          const mx = coreOffset.x + Math.floor(coreW / 2);
          const my = coreOffset.y + Math.floor(coreH / 2);
          if (tiles[my] && tiles[my][mx]) {
            tiles[my][mx] = tile('MONUMENT', '\u2666', '#FFD700', '#332200', false, {
              historicalScar: scar.description, structure: true,
              lightSource: { radius: 6, r: 1, g: 0.85, b: 0.3, intensity: 0.6 },
            });
          }
          break;
        }
        case 'plague_zone': {
          // Reduce NPCs
          const plagueCull = Math.floor(npcSlots.length * 0.3);
          for (let i = 0; i < plagueCull && npcSlots.length > 1; i++) {
            npcSlots.pop();
          }
          break;
        }
        case 'machine_shrine': {
          // Add a tech-shrine structure
          const sx = coreOffset.x + rng.nextInt(2, coreW - 3);
          const sy = coreOffset.y + rng.nextInt(2, coreH - 3);
          if (tiles[sy] && tiles[sy][sx]) {
            tiles[sy][sx] = tile('SHRINE_CORE', '\u2726', '#00FFFF', '#002233', false, {
              historicalScar: scar.description, structure: true,
              lightSource: { radius: 6, r: 0, g: 0.8, b: 1, intensity: 0.5 },
            });
          }
          break;
        }
        case 'fortress': {
          // Add fortification walls around settlement edges
          for (let x = coreOffset.x; x < coreOffset.x + coreW; x++) {
            if (tiles[coreOffset.y] && rng.chance(0.7)) {
              tiles[coreOffset.y][x] = tile('FORTIFICATION', '#', '#778899', '#222233', false, { structure: true, historicalScar: scar.description });
            }
            if (tiles[coreOffset.y + coreH - 1] && rng.chance(0.7)) {
              tiles[coreOffset.y + coreH - 1][x] = tile('FORTIFICATION', '#', '#778899', '#222233', false, { structure: true, historicalScar: scar.description });
            }
          }
          for (let y = coreOffset.y; y < coreOffset.y + coreH; y++) {
            if (tiles[y] && rng.chance(0.7)) {
              tiles[y][coreOffset.x] = tile('FORTIFICATION', '#', '#778899', '#222233', false, { structure: true, historicalScar: scar.description });
            }
            if (tiles[y] && rng.chance(0.7)) {
              tiles[y][coreOffset.x + coreW - 1] = tile('FORTIFICATION', '#', '#778899', '#222233', false, { structure: true, historicalScar: scar.description });
            }
          }
          break;
        }
      }
    }

    return settlement;
  }

  _outskirtsFromBiome(rng, biome, x, y, pad, coreW, coreH, totalW, totalH) {
    // Distance from nearest core edge
    const cx = pad, cy = pad;
    const dxLeft = cx - x, dxRight = x - (cx + coreW - 1);
    const dyTop = cy - y, dyBot = y - (cy + coreH - 1);
    const distX = Math.max(0, dxLeft, dxRight);
    const distY = Math.max(0, dyTop, dyBot);
    const dist = Math.max(distX, distY);

    // Near the core: paths, fences, farms. Far out: wild terrain.
    const r = rng.next ? rng.next() : Math.random();

    if (dist <= 3) {
      // Immediate surroundings: packed dirt / paths
      if (r < 0.3) return tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      return tile('GRASSLAND', ',', '#44aa44', '#112211', true, { buildingId: null });
    }

    if (dist <= 15) {
      // Near outskirts: grass with occasional trees
      if (r < 0.10) return tile('TREE', '\u2663', '#228822', '#112211', false, { buildingId: null });
      return tile('GRASSLAND', ',', '#55bb55', '#112211', true, { buildingId: null });
    }

    // Far outskirts: grass with more trees
    if (r < 0.15) return tile('TREE', '\u2663', '#228822', '#0a1a0a', false, { buildingId: null });
    if (r < 0.25) return tile('TREE', '\u2660', '#116611', '#0a1a0a', false, { buildingId: null });
    return tile('GRASSLAND', '.', '#44cc44', '#112211', true, { buildingId: null });
  }

  _generateOutskirtRoads(rng, tiles, pad, coreW, coreH, totalW, totalH) {
    const cx = pad + Math.floor(coreW / 2);
    const cy = pad + Math.floor(coreH / 2);

    // Road going south from settlement
    for (let y = pad + coreH; y < totalH - 2; y++) {
      if (tiles[y][cx].type === 'GRASSLAND') {
        tiles[y][cx] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }
    // Road going north
    for (let y = pad - 1; y >= 2; y--) {
      if (tiles[y][cx].type === 'GRASSLAND') {
        tiles[y][cx] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }
    // Road going east
    for (let x = pad + coreW; x < totalW - 2; x++) {
      if (tiles[cy][x].type === 'GRASSLAND') {
        tiles[cy][x] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }
    // Road going west
    for (let x = pad - 1; x >= 2; x--) {
      if (tiles[cy][x].type === 'GRASSLAND') {
        tiles[cy][x] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }
  }

  _placeMechanicalArm(tiles, pad, coreW, coreH, width, height) {
    const template = this._getMechanicalArmTemplate();
    const tH = template.length;
    const tW = template[0].length;

    // Position: left of settlement core, vertically centered
    const armX = Math.max(1, pad - tW - 2);
    const armY = Math.max(1, pad + Math.floor(coreH / 2) - Math.floor(tH / 2));

    for (let row = 0; row < tH; row++) {
      for (let col = 0; col < tW; col++) {
        const cell = template[row][col];
        if (!cell) continue;
        const tx = armX + col;
        const ty = armY + row;
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;
        const existing = tiles[ty][tx];
        if (existing.type !== 'GRASSLAND' && existing.type !== 'TREE' &&
            existing.type !== 'TREE_CANOPY' && existing.type !== 'TREE_TRUNK' &&
            existing.type !== 'FOREST' && existing.type !== 'DEEP_FOREST') continue;
        tiles[ty][tx] = tile(cell.type, cell.char, cell.fg, cell.bg, false, { structure: true, solid: true });
      }
    }
  }

  _getMechanicalArmTemplate() {
    // Based on broken_arm.txt — metallic depth shading
    // Top rows (fingertips) are brightest, bottom rows (shoulder) are darkest
    const _ = null;
    const M = (char, fg, bg) => ({ type: 'MECH_ARM', char, fg, bg: bg || '#0D0D1A' });

    // Metallic palette — depth-based gradient (bright = high/near, dark = low/far)
    const TIP   = '#BBCCDD';  // Brightest — fingertip edges catching light
    const BRI   = '#AABBCC';  // Bright — finger body, hand structural edges
    const MID   = '#8899AA';  // Mid — hand/palm surface
    const STL   = '#778899';  // Steel — wrist transition
    const FRM   = '#667788';  // Forearm — mid structure
    const DRK   = '#556677';  // Dark — forearm body
    const DIM   = '#445566';  // Dim — upper arm
    const DEP   = '#334455';  // Deepest — shoulder, lowest surfaces
    const BG    = '#0D0D1A';  // Default dark bg
    const BG2   = '#111122';  // Slightly lighter bg for solid surfaces

    // 11 cols x 19 rows — fingertips at top, shoulder/base at bottom
    // Derived from broken_arm.txt with depth-aware metallic shading
    return [
      // Row 0: Fingertip tops (brightest — highest point)
      [_,_,_,_,_, M('\u256D',TIP,BG), M('\u256E',TIP,BG), M('\u256D',TIP,BG), M('\u256E',TIP,BG), _,_],
      // Row 1: Finger joints
      [_,_,_, M('\u256D',TIP,BG), M('\u256E',TIP,BG), M('\u2560',TIP,BG), M('\u2563',TIP,BG), M('\u2560',TIP,BG), M('\u2563',TIP,BG), M('\u256D',TIP,BG), M('\u256E',TIP,BG)],
      // Row 2: Finger body
      [_,_,_, M('\u2560',BRI,BG), M('\u2563',BRI,BG), M('\u2560',BRI,BG), M('\u2563',BRI,BG), M('\u2560',BRI,BG), M('\u2563',BRI,BG), M('\u2560',BRI,BG), M('\u2563',BRI,BG)],
      // Row 3: Finger body + thumb bracket
      [M('\u250C',BRI,BG), M('\u2510',BRI,BG), _, M('\u2560',BRI,BG), M('\u2563',BRI,BG), M('\u2560',BRI,BG), M('\u2563',BRI,BG), M('\u2560',BRI,BG), M('\u2563',BRI,BG), M('\u2560',BRI,BG), M('\u2563',BRI,BG)],
      // Row 4: Palm top — depth transition with recesses
      [M('\u251C',MID,BG), M('\u2588',MID,BG2), _, M('\u2560',MID,BG), M('\u2591',STL,BG2), M('\u2580',MID,BG), M('\u2584',STL,BG), M('\u2584',STL,BG), M('\u2580',MID,BG), M('\u2591',STL,BG2), M('\u2563',MID,BG)],
      // Row 5: Palm body — deeper recesses
      [M('\u2514',MID,BG), M('\u2588',MID,BG2), M('\u2588',MID,BG2), M('\u256C',MID,BG), M('\u2593',STL,BG2), M('\u2592',DRK,BG2), M('\u2592',DRK,BG2), M('\u2592',DRK,BG2), M('\u2592',DRK,BG2), M('\u2593',STL,BG2), M('\u2563',MID,BG)],
      // Row 6: Palm bottom
      [_, M('\u2514',STL,BG), M('\u2534',STL,BG), M('\u255A',STL,BG), M('\u2588',STL,BG2), M('\u2592',DRK,BG2), M('\u2584',STL,BG), M('\u2584',STL,BG), M('\u2592',DRK,BG2), M('\u2588',STL,BG2), M('\u255D',STL,BG)],
      // Row 7: Wrist — solid structural band
      [_,_,_,_, M('\u2588',FRM,BG2), M('\u2588',FRM,BG2), M('\u2588',FRM,BG2), M('\u2588',FRM,BG2), M('\u2588',FRM,BG2), M('\u2588',FRM,BG2), _],
      // Row 8: Wrist joint
      [_,_,_,_,_, M('\u2560',FRM,BG), M('\u2593',DRK,BG2), M('\u2593',DRK,BG2), M('\u2563',FRM,BG), _,_],
      // Row 9: Forearm flare — widening
      [_,_,_, M('\u2584',FRM,BG), M('\u2588',FRM,BG2), M('\u2588',FRM,BG2), M('\u2593',DRK,BG2), M('\u2593',DRK,BG2), M('\u2588',FRM,BG2), M('\u2588',FRM,BG2), M('\u2584',FRM,BG)],
      // Row 10: Forearm body
      [_,_,_, M('\u2590',DRK,BG), M('\u2588',DRK,BG2), M('\u2580',DRK,BG), M('\u2588',DRK,BG2), M('\u2588',DRK,BG2), M('\u2588',DRK,BG2), M('\u2588',DRK,BG2), M('\u2588',DRK,BG2)],
      // Row 11: Break zone — jagged fracture
      [_,_,_,_,_,_, M('\u2588',DRK,BG2), M('\u2588',DRK,BG2), M('\u2588',DRK,BG2), M('\u2580',DRK,BG), M('\u258C',DRK,BG)],
      // Row 12: Break gap
      [_,_,_,_,_,_,_, M('\u2580',DIM,BG), M('\u2580',DIM,BG), _,_],
      // Row 13: Upper arm start (after break)
      [_,_,_,_, M('\u2584',DIM,BG), _,_,_,_,_,_],
      // Row 14: Upper arm body
      [_,_,_, M('\u2590',DIM,BG), M('\u2588',DIM,BG2), M('\u2584',DIM,BG), M('\u2584',DIM,BG), _,_, M('\u2584',DIM,BG), _],
      // Row 15: Upper arm widening
      [_,_,_, M('\u2588',DIM,BG2), M('\u2588',DIM,BG2), M('\u2588',DIM,BG2), M('\u2588',DIM,BG2), M('\u2584',DEP,BG), M('\u2584',DEP,BG), M('\u2588',DIM,BG2), M('\u258C',DIM,BG)],
      // Row 16: Shoulder joint — recessed center
      [_,_,_, M('\u2588',DEP,BG2), M('\u2588',DEP,BG2), M('\u2588',DEP,BG2), M('\u2593',DEP,BG2), M('\u2593',DEP,BG2), M('\u2588',DEP,BG2), M('\u2588',DEP,BG2), M('\u2588',DEP,BG2)],
      // Row 17: Shoulder base
      [_,_,_,_, M('\u2588',DEP,BG2), M('\u2588',DEP,BG2), M('\u2593',DEP,BG2), M('\u2593',DEP,BG2), M('\u2588',DEP,BG2), M('\u2588',DEP,BG2), _],
      // Row 18: Shoulder bottom
      [_,_,_,_, M('\u2590',DEP,BG), M('\u2580',DEP,BG), M('\u2588',DEP,BG2), M('\u2588',DEP,BG2), M('\u2588',DEP,BG2), M('\u258C',DEP,BG), _],
    ];
  }

  _generateCastle(rng, tiles, w, h, buildings, npcSlots) {
    // Outer walls
    const margin = 3;
    for (let y = margin; y < h - margin; y++) {
      for (let x = margin; x < w - margin; x++) {
        if (y === margin || y === h - margin - 1 || x === margin || x === w - margin - 1) {
          tiles[y][x] = tile('WALL', '#', '#aaaaaa', '#333333', false, { buildingId: null });
        } else {
          tiles[y][x] = tile('FLOOR', '.', '#888888', '#222222', true, { buildingId: null });
        }
      }
    }

    // Corner towers
    const corners = [
      [margin, margin], [w - margin - 1, margin],
      [margin, h - margin - 1], [w - margin - 1, h - margin - 1],
    ];
    for (const [cx, cy] of corners) {
      tiles[cy][cx] = tile('TOWER', '\u25D9', '#BBBBBB', '#333333', false, { buildingId: null }); // ◙
    }

    // Battlements along top wall - alternate merlon/crenel
    for (let x = margin + 1; x < w - margin - 1; x++) {
      if (x % 2 === 0) {
        tiles[margin][x] = tile('MERLON', '\u2565', '#AAAAAA', '#333333', false, { buildingId: null }); // ╥
      } else {
        tiles[margin][x] = tile('CRENEL', '\u2550', '#888888', '#333333', false, { buildingId: null }); // ═
      }
    }

    // Arrow slits on side walls
    for (let y = margin + 2; y < h - margin - 2; y += 3) {
      tiles[y][margin] = tile('ARROW_SLIT', '\u25AB', '#444444', '#333333', false, { buildingId: null }); // ▫
      tiles[y][w - margin - 1] = tile('ARROW_SLIT', '\u25AB', '#444444', '#333333', false, { buildingId: null });
    }

    // Gate at bottom center - portcullis
    const gateX = Math.floor(w / 2);
    tiles[h - margin - 1][gateX] = tile('PORTCULLIS', '\u256B', '#888888', '#222222', true, { buildingId: null }); // ╫
    tiles[h - margin - 1][gateX - 1] = tile('PORTCULLIS', '\u256B', '#888888', '#222222', true, { buildingId: null });
    // Guard pillars flanking gate
    if (gateX - 2 >= margin) tiles[h - margin - 1][gateX - 2] = tile('PILLAR', '\u25CB', '#AAAAAA', '#333333', false, { buildingId: null }); // ○
    if (gateX + 1 < w - margin) tiles[h - margin - 1][gateX + 1] = tile('PILLAR', '\u25CB', '#AAAAAA', '#333333', false, { buildingId: null });

    // Road from gate inward
    for (let y = h - margin; y < h; y++) {
      tiles[y][gateX] = tile('ROAD', '\u25AA', '#BBAA77', '#332211', true, { buildingId: null }); // ▪
    }

    // Inner courtyard road with cobblestone
    const courtY = Math.floor(h / 2);
    for (let x = margin + 2; x < w - margin - 2; x++) {
      const ph = ((x * 31 + courtY * 17) & 0xFFFF) / 65536;
      if (ph < 0.6) {
        tiles[courtY][x] = tile('COBBLESTONE', '\u25AA', '#BBAA77', '#332211', true, { buildingId: null });
      } else {
        tiles[courtY][x] = tile('ROAD', '\u00B7', '#AA9966', '#332211', true, { buildingId: null });
      }
    }

    // Courtyard decorations
    const courtCX = Math.floor(w / 2);
    // Well in courtyard
    if (tiles[courtY - 2] && tiles[courtY - 2][courtCX]) {
      tiles[courtY - 2][courtCX] = tile('WELL', '\u25CE', '#4488ff', '#222222', false, { buildingId: null }); // ◎
    }
    // Training dummies
    if (tiles[courtY + 2]) {
      if (courtCX - 3 >= margin + 2) tiles[courtY + 2][courtCX - 3] = tile('TRAINING_DUMMY', '\u253C', '#AA8844', '#222222', false, { buildingId: null }); // ┼
      if (courtCX + 3 < w - margin - 2) tiles[courtY + 2][courtCX + 3] = tile('TRAINING_DUMMY', '\u253C', '#AA8844', '#222222', false, { buildingId: null });
    }
    // Weapon racks near courtyard
    if (tiles[courtY - 1] && courtCX - 4 >= margin + 2) {
      tiles[courtY - 1][courtCX - 4] = tile('WEAPON_RACK', '/', '#aaaaaa', '#222222', false, { buildingId: null });
    }

    // Place internal buildings - first one becomes throne room
    const internalDefs = [
      { type: 'tavern', name: 'Throne Room', minW: 10, minH: 8 },
      { type: 'barracks', name: 'Guard Post', minW: 8, minH: 6 },
      { type: 'blacksmith', name: 'Smithy', minW: 6, minH: 5 },
      { type: 'temple', name: 'Chapel', minW: 6, minH: 6 },
    ];

    // Place buildings in quadrants
    const quadrants = [
      { x: margin + 2, y: margin + 2, w: Math.floor((w - 2 * margin - 4) / 2) - 1, h: courtY - margin - 3 },
      { x: Math.floor(w / 2) + 1, y: margin + 2, w: Math.floor((w - 2 * margin - 4) / 2) - 1, h: courtY - margin - 3 },
      { x: margin + 2, y: courtY + 2, w: Math.floor((w - 2 * margin - 4) / 2) - 1, h: h - margin - courtY - 4 },
      { x: Math.floor(w / 2) + 1, y: courtY + 2, w: Math.floor((w - 2 * margin - 4) / 2) - 1, h: h - margin - courtY - 4 },
    ];

    for (let i = 0; i < Math.min(internalDefs.length, quadrants.length); i++) {
      const def = internalDefs[i];
      const q = quadrants[i];
      const bw = Math.min(def.minW, q.w);
      const bh = Math.min(def.minH, q.h);
      if (bw < 4 || bh < 4) continue;

      const bx = q.x;
      const by = q.y;
      const bid = buildings.length;
      this._carveBuilding(tiles, bx, by, bw, bh, bid);
      buildings.push({ id: bid, type: def.type, name: def.name, x: bx, y: by, w: bw, h: bh });
      npcSlots.push({ buildingId: bid, role: def.type === 'barracks' ? 'guard' : def.type === 'tavern' ? 'innkeeper' : 'npc', position: { x: bx + 2, y: by + 2 } });

      // Throne room decoration for the first building (tavern/Great Hall)
      if (i === 0 && bw >= 6 && bh >= 5) {
        const throneX = bx + Math.floor(bw / 2);
        const throneY = by + 1;
        // Throne
        if (tiles[throneY][throneX].type === 'FLOOR') {
          tiles[throneY][throneX] = tile('THRONE', '\u03A9', '#FFD700', '#222222', false, { buildingId: bid }); // Ω
        }
        // Carpet runner from door to throne
        for (let ry = throneY + 1; ry < by + bh - 1; ry++) {
          if (tiles[ry][throneX].type === 'FLOOR') {
            tiles[ry][throneX] = tile('CARPET', '\u2592', '#882222', '#222222', true, { buildingId: bid }); // ▒
          }
        }
        // Flanking pillars
        if (throneX - 2 > bx && tiles[throneY + 1][throneX - 2].type === 'FLOOR') {
          tiles[throneY + 1][throneX - 2] = tile('PILLAR', '\u25CB', '#AAAAAA', '#222222', false, { buildingId: bid });
        }
        if (throneX + 2 < bx + bw - 1 && tiles[throneY + 1][throneX + 2].type === 'FLOOR') {
          tiles[throneY + 1][throneX + 2] = tile('PILLAR', '\u25CB', '#AAAAAA', '#222222', false, { buildingId: bid });
        }
        // Wall banners
        if (tiles[by + 1][bx + 1].type === 'FLOOR') {
          tiles[by + 1][bx + 1] = tile('BANNER', '\u2691', '#CC2222', '#222222', false, { buildingId: bid }); // ⚑
        }
        if (tiles[by + 1][bx + bw - 2].type === 'FLOOR') {
          tiles[by + 1][bx + bw - 2] = tile('BANNER', '\u2691', '#2222CC', '#222222', false, { buildingId: bid });
        }
      }
    }
  }

  _generateSettlement(rng, tiles, w, h, type, population, buildings, npcSlots, biome) {
    // Get biome-specific building theme
    const biomeTheme = this._getBiomeTheme(biome);

    // Central plaza — simple open area
    const plazaW = type === 'city' ? 8 : type === 'town' ? 6 : 4;
    const plazaH = type === 'city' ? 6 : type === 'town' ? 5 : 3;
    const plazaX = Math.floor((w - plazaW) / 2);
    const plazaY = Math.floor((h - plazaH) / 2);

    for (let y = plazaY; y < plazaY + plazaH; y++) {
      for (let x = plazaX; x < plazaX + plazaW; x++) {
        tiles[y][x] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }

    const fcx = plazaX + Math.floor(plazaW / 2);
    const fcy = plazaY + Math.floor(plazaH / 2);

    // Determine building count based on type — just core buildings
    const buildingCounts = {
      village: { house: 3, tavern: 1, shop: 1 },
      town: { house: 10, tavern: 2, shop: 3, blacksmith: 2, temple: 1, guild_hall: 1, barracks: 1 },
      city: { house: 10, tavern: 2, shop: 3, blacksmith: 2, temple: 1, guild_hall: 1, barracks: 1 },
    };

    const counts = buildingCounts[type] || buildingCounts.village;
    const buildingDefs = [];

    for (const [bType, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        buildingDefs.push(bType);
      }
    }

    const shuffled = rng.shuffle(buildingDefs);
    const placed = []; // {x, y, w, h} rects for collision avoidance

    // Place buildings around the plaza
    for (const bType of shuffled) {
      const bw = rng.nextInt(5, 8);
      const bh = rng.nextInt(5, 7);

      let bestX = -1, bestY = -1;
      for (let attempt = 0; attempt < 100; attempt++) {
        const bx = rng.nextInt(1, w - bw - 1);
        const by = rng.nextInt(1, h - bh - 1);

        // Don't overlap plaza
        if (this._rectsOverlap(bx - 1, by - 1, bw + 2, bh + 2, plazaX - 1, plazaY - 1, plazaW + 2, plazaH + 2)) continue;

        // Don't overlap other buildings
        let overlap = false;
        for (const p of placed) {
          if (this._rectsOverlap(bx - 1, by - 1, bw + 2, bh + 2, p.x, p.y, p.w, p.h)) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        bestX = bx;
        bestY = by;
        break;
      }

      if (bestX === -1) continue;

      const bid = buildings.length;
      this._carveBuilding(tiles, bestX, bestY, bw, bh, bid, biomeTheme);
      placed.push({ x: bestX - 1, y: bestY - 1, w: bw + 2, h: bh + 2 });

      const nameMap = {
        tavern: 'Tavern', shop: 'General Store', blacksmith: 'Smithy',
        temple: 'Temple', house: 'Dwelling', guild_hall: 'Guild Hall',
        barracks: 'Guard Post',
      };

      buildings.push({
        id: bid, type: bType, name: nameMap[bType] || bType,
        x: bestX, y: bestY, w: bw, h: bh,
        interior: null,
      });

      // NPC slot inside the building
      const roleMap = {
        tavern: 'innkeeper', shop: 'merchant', blacksmith: 'blacksmith',
        temple: 'priest', house: 'villager', guild_hall: 'guildmaster',
        barracks: 'guard',
      };
      npcSlots.push({
        buildingId: bid,
        role: roleMap[bType] || 'villager',
        position: { x: bestX + Math.floor(bw / 2), y: bestY + Math.floor(bh / 2) },
      });
    }

    // Build roads from buildings to plaza
    for (const b of buildings) {
      const doorX = b.x + Math.floor(b.w / 2);
      const doorY = b.y + b.h - 1;
      // Simple straight-line road toward plaza center
      this._carveRoad(tiles, doorX, doorY + 1, fcx, fcy, w, h);
    }

    // Extra wandering townspeople for towns and cities
    if (type === 'town' || type === 'city') {
      const extraRoles = ['guard', 'guard', 'guard', 'farmer', 'farmer', 'scholar', 'hunter', 'beggar', 'child', 'child', 'noble'];
      for (const role of extraRoles) {
        for (let attempt = 0; attempt < 50; attempt++) {
          const nx = rng.nextInt(1, w - 1);
          const ny = rng.nextInt(1, h - 1);
          const t = tiles[ny][nx];
          if (t.walkable && (t.type === 'ROAD' || t.type === 'GRASSLAND') && !t.metadata?.buildingId) {
            npcSlots.push({ buildingId: null, role, position: { x: nx, y: ny } });
            break;
          }
        }
      }
    }
  }

  // ── Multi-tile tree templates and placement ──

  _getTreeTemplates() {
    // Each template: { width, height, tiles: [{dx, dy, type, char, fgIdx, walkable}] }
    // fgIdx indexes into a color array chosen per-tree instance
    const CANOPY_CHARS = ['\u2663', '\u2660', '\u2663', '\u2660']; // ♣ ♠
    return [
      // Small (1x2): single canopy + trunk
      {
        width: 1, height: 2, weight: 2,
        cells: [
          { dx: 0, dy: 0, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 0, dy: 1, type: 'TREE_TRUNK', char: '|', walkable: false },
        ]
      },
      // Medium (2x3): 2-wide canopy, trunk center-bottom
      {
        width: 2, height: 3, weight: 3,
        cells: [
          { dx: 0, dy: 0, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 1, dy: 0, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 0, dy: 1, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 1, dy: 1, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 0, dy: 2, type: 'TREE_TRUNK', char: '|', walkable: false },
        ]
      },
      // Large (3x3): 3-wide crown, trunk center-bottom
      {
        width: 3, height: 3, weight: 3,
        cells: [
          { dx: 0, dy: 0, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 1, dy: 0, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 2, dy: 0, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 0, dy: 1, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 1, dy: 1, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 2, dy: 1, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 1, dy: 2, type: 'TREE_TRUNK', char: '|', walkable: false },
        ]
      },
      // Extra Large (3x4): tallest variant
      {
        width: 3, height: 4, weight: 2,
        cells: [
          { dx: 1, dy: 0, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 0, dy: 1, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 1, dy: 1, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 2, dy: 1, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 0, dy: 2, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 1, dy: 2, type: 'TREE_CANOPY', char: '\u2663', walkable: false },
          { dx: 2, dy: 2, type: 'TREE_CANOPY', char: '\u2660', walkable: false },
          { dx: 1, dy: 3, type: 'TREE_TRUNK', char: '|', walkable: false },
        ]
      },
    ];
  }

  _placeMultiTileTrees(rng, tiles, w, h, placed, type) {
    const treeCounts = { village: 6, town: 10, city: 8 };
    const count = treeCounts[type] || 6;
    const templates = this._getTreeTemplates();

    // Build weighted list for template selection
    const weighted = [];
    for (const tmpl of templates) {
      // Bias toward larger trees in towns/cities
      const sizeBonus = (type === 'town' || type === 'city') && tmpl.width >= 3 ? 2 : 0;
      for (let i = 0; i < tmpl.weight + sizeBonus; i++) weighted.push(tmpl);
    }

    const CANOPY_GREENS = ['#228822', '#338833', '#226622', '#2A8A2A'];
    const TRUNK_BROWNS = ['#886644', '#775533'];
    const CANOPY_BGS = ['#0D1A0D', '#112211', '#0A180A'];

    for (let i = 0; i < count; i++) {
      const tmpl = rng.random(weighted);
      const greenFg = rng.random(CANOPY_GREENS);
      const greenFg2 = rng.random(CANOPY_GREENS);
      const trunkFg = rng.random(TRUNK_BROWNS);
      const canopyBg = rng.random(CANOPY_BGS);

      for (let attempt = 0; attempt < 50; attempt++) {
        const tx = rng.nextInt(1, w - tmpl.width - 1);
        const ty = rng.nextInt(1, h - tmpl.height - 1);

        // Check all footprint tiles are GRASSLAND
        let valid = true;
        for (const cell of tmpl.cells) {
          const cx = tx + cell.dx;
          const cy = ty + cell.dy;
          if (cy < 0 || cy >= h || cx < 0 || cx >= w || tiles[cy][cx].type !== 'GRASSLAND') {
            valid = false;
            break;
          }
        }
        if (!valid) continue;

        // Check no overlap with placed rects (1-tile margin)
        let overlap = false;
        for (const p of placed) {
          if (this._rectsOverlap(tx - 1, ty - 1, tmpl.width + 2, tmpl.height + 2, p.x, p.y, p.w, p.h)) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        // Place the tree
        for (const cell of tmpl.cells) {
          const fg = cell.type === 'TREE_TRUNK' ? trunkFg :
            (cell.char === '\u2663' ? greenFg : greenFg2);
          const bg = cell.type === 'TREE_TRUNK' ? '#112211' : canopyBg;
          tiles[ty + cell.dy][tx + cell.dx] = tile(cell.type, cell.char, fg, bg, cell.walkable, { buildingId: null });
        }
        placed.push({ x: tx - 1, y: ty - 1, w: tmpl.width + 2, h: tmpl.height + 2 });
        break;
      }
    }
  }

  _getBiomeTheme(biome) {
    const themes = {
      // Cold biomes
      tundra:          { wallFg: '#88BBDD', wallBg: '#112233', floorFg: '#6699BB', floorBg: '#0A1A2A', windowFg: '#AADDFF', doorFg: '#4488AA' },
      permafrost:      { wallFg: '#77AACC', wallBg: '#0A1520', floorFg: '#5588AA', floorBg: '#081018', windowFg: '#88CCEE', doorFg: '#3377AA' },
      frozen_deck:     { wallFg: '#88BBDD', wallBg: '#112233', floorFg: '#6699BB', floorBg: '#0A1A2A', windowFg: '#AADDFF', doorFg: '#4488AA' },
      void_exposure:   { wallFg: '#8899AA', wallBg: '#060610', floorFg: '#667788', floorBg: '#040408', windowFg: '#AABBCC', doorFg: '#556688' },
      structural_grid: { wallFg: '#778899', wallBg: '#0A0A15', floorFg: '#556677', floorBg: '#060610', windowFg: '#99AABB', doorFg: '#667788' },
      // Hot biomes
      desert:          { wallFg: '#CCAA66', wallBg: '#332200', floorFg: '#AA8844', floorBg: '#2A1A00', windowFg: '#DDBB88', doorFg: '#BB8833' },
      scorched_waste:  { wallFg: '#DD8844', wallBg: '#441100', floorFg: '#CC6633', floorBg: '#330800', windowFg: '#FF9955', doorFg: '#CC6622' },
      magma_fields:    { wallFg: '#DD5522', wallBg: '#330800', floorFg: '#CC4411', floorBg: '#220500', windowFg: '#FF6633', doorFg: '#DD4411' },
      inferno_core:    { wallFg: '#DD3311', wallBg: '#330500', floorFg: '#CC2200', floorBg: '#220000', windowFg: '#FF4422', doorFg: '#DD2200' },
      reactor_slag:    { wallFg: '#CC5522', wallBg: '#331100', floorFg: '#AA4411', floorBg: '#220800', windowFg: '#FF7733', doorFg: '#CC5511' },
      // Organic biomes
      hydro_jungle:    { wallFg: '#44AA66', wallBg: '#002211', floorFg: '#338855', floorBg: '#001A0A', windowFg: '#66CC88', doorFg: '#338844' },
      toxic_sump:      { wallFg: '#88AA44', wallBg: '#112200', floorFg: '#668833', floorBg: '#0A1800', windowFg: '#AACC55', doorFg: '#88AA33' },
      // Anomaly biomes
      hull_breach:     { wallFg: '#8899AA', wallBg: '#111122', floorFg: '#667788', floorBg: '#0A0A18', windowFg: '#99AABB', doorFg: '#778899' },
      crystal_zone:    { wallFg: '#44DDEE', wallBg: '#002222', floorFg: '#33BBCC', floorBg: '#001818', windowFg: '#66EEFF', doorFg: '#44CCDD' },
      alien_crash:     { wallFg: '#CC44DD', wallBg: '#220022', floorFg: '#AA33BB', floorBg: '#180018', windowFg: '#EE66FF', doorFg: '#BB33CC' },
    };
    return themes[biome] || null;
  }

  _carveBuilding(tiles, bx, by, bw, bh, buildingId, biomeTheme) {
    // Vary wall style based on building hash
    const hash = (typeof buildingId === 'string' ? buildingId.charCodeAt(0) : buildingId) || 0;
    const useDouble = (hash % 3) === 0; // ~33% of buildings use double-line walls
    const wallColor = biomeTheme ? biomeTheme.wallFg : ['#cccccc', '#bbbbaa', '#aabbcc', '#ccbbaa'][hash % 4];
    const wallBg = biomeTheme ? biomeTheme.wallBg : ['#333333', '#2a2a33', '#33332a', '#2a332a'][hash % 4];
    const floorFg = biomeTheme ? biomeTheme.floorFg : '#999999';
    const floorBg = biomeTheme ? biomeTheme.floorBg : '#222222';

    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        if (y === by || y === by + bh - 1 || x === bx || x === bx + bw - 1) {
          let ch;
          if (useDouble) {
            // Double-line box drawing
            if (y === by && x === bx) ch = '\u2554';           // ╔
            else if (y === by && x === bx + bw - 1) ch = '\u2557'; // ╗
            else if (y === by + bh - 1 && x === bx) ch = '\u255A'; // ╚
            else if (y === by + bh - 1 && x === bx + bw - 1) ch = '\u255D'; // ╝
            else if (y === by || y === by + bh - 1) ch = '\u2550'; // ═
            else ch = '\u2551'; // ║
          } else {
            // Single-line box drawing
            if (y === by && x === bx) ch = '\u250C';           // ┌
            else if (y === by && x === bx + bw - 1) ch = '\u2510'; // ┐
            else if (y === by + bh - 1 && x === bx) ch = '\u2514'; // └
            else if (y === by + bh - 1 && x === bx + bw - 1) ch = '\u2518'; // ┘
            else if (y === by || y === by + bh - 1) ch = '\u2500'; // ─
            else ch = '\u2502'; // │
          }
          tiles[y][x] = tile('WALL', ch, wallColor, wallBg, false, { solid: true, buildingId });
        } else {
          tiles[y][x] = tile('FLOOR', '.', floorFg, floorBg, true, { solid: false, buildingId });
        }
      }
    }

    // Windows every 3 tiles on side walls
    const windowFg = biomeTheme ? biomeTheme.windowFg : '#AADDFF';
    for (let y = by + 1; y < by + bh - 1; y++) {
      if ((y - by) % 3 === 0) {
        tiles[y][bx] = tile('WINDOW', '\u25AF', windowFg, wallBg, false, { solid: true, buildingId }); // ▯
        tiles[y][bx + bw - 1] = tile('WINDOW', '\u25AF', windowFg, wallBg, false, { solid: true, buildingId });
      }
    }

    // Door at bottom center with biome-varied color
    const doorFg = biomeTheme ? biomeTheme.doorFg : ['#aa6622', '#cc4444', '#4466aa', '#44aa44', '#aa44aa'][hash % 5];
    const doorX = bx + Math.floor(bw / 2);
    tiles[by + bh - 1][doorX] = tile('DOOR', '\u25AF', doorFg, floorBg, true, { solid: false, buildingId }); // ▯
  }

  _carveRoad(tiles, sx, sy, ex, ey, w, h) {
    // Simple L-shaped road with cobblestone variation near center
    const midX = sx;
    const centerX = Math.floor(w / 2), centerY = Math.floor(h / 2);

    const roadTile = (rx, ry) => {
      const dist = Math.abs(rx - centerX) + Math.abs(ry - centerY);
      if (dist < 8) {
        const ph = ((rx * 31 + ry * 17) & 0xFFFF) / 65536;
        if (ph < 0.5) return tile('COBBLESTONE', '\u25AA', '#BBAA77', '#332211', true, { buildingId: null });
        return tile('COBBLESTONE', '\u00B7', '#AA9966', '#332211', true, { buildingId: null });
      }
      if (dist < 15) {
        return tile('ROAD', '\u00B7', '#AA9966', '#332211', true, { buildingId: null });
      }
      return tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
    };

    // Vertical segment
    const yDir = ey > sy ? 1 : -1;
    let y = sy;
    while (y !== ey && y >= 0 && y < h) {
      const t = tiles[y][midX];
      if (t.type === 'GRASSLAND') {
        tiles[y][midX] = roadTile(midX, y);
      }
      y += yDir;
    }
    // Horizontal segment
    const xDir = ex > midX ? 1 : -1;
    let x = midX;
    while (x !== ex && x >= 0 && x < w) {
      const t = tiles[ey][x];
      if (t.type === 'GRASSLAND') {
        tiles[ey][x] = roadTile(x, ey);
      }
      x += xDir;
    }
  }

  _carveGarden(rng, tiles, bx, by, bw, bh, buildingId) {
    // Fence perimeter
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        if (y === by || y === by + bh - 1 || x === bx || x === bx + bw - 1) {
          tiles[y][x] = tile('FENCE', '\u2502', '#aa6622', '#112211', false, { solid: true, buildingId });
        } else {
          // Dense interior foliage
          const pick = rng.random([
            tile('FLOWER_BED', '\u273F', '#44AA44', '#112211', true, { buildingId }), // ✿
            tile('FLOWER_BED', '\u2740', '#FF88AA', '#112211', true, { buildingId }), // ❀
            tile('FLOWER_BED', '\u2740', '#FFAA44', '#112211', true, { buildingId }), // ❀ orange
            tile('GARDEN', '\u273B', '#66CC66', '#112211', true, { buildingId }),     // ✻
            tile('GARDEN', '\u2698', '#88DD88', '#112211', true, { buildingId }),     // ⚘
            tile('TREE', '\u2663', '#228822', '#112211', false, { buildingId }),      // ♣
            tile('FLOOR', '.', '#557744', '#112211', true, { buildingId }),           // path
            tile('FLOOR', '.', '#557744', '#112211', true, { buildingId }),           // path (weighted)
          ]);
          tiles[y][x] = pick;
        }
      }
    }
    // Horizontal fences for top/bottom
    for (let x = bx; x < bx + bw; x++) {
      tiles[by][x] = tile('FENCE', '\u2500', '#aa6622', '#112211', false, { solid: true, buildingId });
      tiles[by + bh - 1][x] = tile('FENCE', '\u2500', '#aa6622', '#112211', false, { solid: true, buildingId });
    }
    // Corner posts
    tiles[by][bx] = tile('FENCE', '\u250C', '#aa6622', '#112211', false, { solid: true, buildingId });
    tiles[by][bx + bw - 1] = tile('FENCE', '\u2510', '#aa6622', '#112211', false, { solid: true, buildingId });
    tiles[by + bh - 1][bx] = tile('FENCE', '\u2514', '#aa6622', '#112211', false, { solid: true, buildingId });
    tiles[by + bh - 1][bx + bw - 1] = tile('FENCE', '\u2518', '#aa6622', '#112211', false, { solid: true, buildingId });
    // Gate
    const doorX = bx + Math.floor(bw / 2);
    tiles[by + bh - 1][doorX] = tile('DOOR', '\u25AF', '#44aa44', '#112211', true, { solid: false, buildingId });
    // Center bench and fountain
    const cx = bx + Math.floor(bw / 2);
    const cy = by + Math.floor(bh / 2);
    if (tiles[cy][cx]) tiles[cy][cx] = tile('FOUNTAIN', '\u00A4', '#4488FF', '#112211', false, { buildingId });
    if (tiles[cy + 1] && tiles[cy + 1][cx - 1]) tiles[cy + 1][cx - 1] = tile('BENCH', '\u2564', '#886644', '#112211', false, { buildingId });
  }

  _decorateWatchtower(tiles, bx, by, bw, bh, buildingId) {
    // Roof marker (triangle) on top wall
    const cx = bx + Math.floor(bw / 2);
    tiles[by][cx] = tile('ROOF', '\u25B2', '#886644', '#333333', false, { solid: true, buildingId }); // ▲
    // Arrow slits on walls
    for (let y = by + 1; y < by + bh - 1; y++) {
      tiles[y][bx] = tile('ARROW_SLIT', '\u25AB', '#AAAAAA', '#333333', false, { solid: true, buildingId }); // ▫
      tiles[y][bx + bw - 1] = tile('ARROW_SLIT', '\u25AB', '#AAAAAA', '#333333', false, { solid: true, buildingId });
    }
  }

  _decorateWarehouse(rng, tiles, bx, by, bw, bh, buildingId) {
    // Fill interior with crates and barrels
    for (let y = by + 1; y < by + bh - 1; y++) {
      for (let x = bx + 1; x < bx + bw - 1; x++) {
        if (tiles[y][x].type !== 'FLOOR') continue;
        // Leave a walkable aisle down the center
        if (x === bx + Math.floor(bw / 2)) continue;
        if (rng.chance(0.5)) {
          const pick = rng.random([
            tile('CRATE', '\u25AA', '#886644', '#222222', false, { buildingId }), // ▪
            tile('CRATE', '\u2592', '#776633', '#222222', false, { buildingId }), // ▒
            tile('BARREL', '\u25CB', '#886644', '#222222', false, { buildingId }), // ○
            tile('CRATE', '\u25A0', '#776644', '#222222', false, { buildingId }), // ■
          ]);
          tiles[y][x] = pick;
        }
      }
    }
    // Roof marking: ≡ on top edge
    for (let x = bx + 1; x < bx + bw - 1; x++) {
      if (x % 2 === 0) {
        tiles[by][x] = tile('ROOF', '\u2261', '#888888', '#333333', false, { solid: true, buildingId }); // ≡
      }
    }
  }

  _scatterDecorations(rng, tiles, w, h, biome, placed) {
    const decorCount = Math.floor(w * h * 0.06);
    for (let i = 0; i < decorCount; i++) {
      const x = rng.nextInt(1, w - 2);
      const y = rng.nextInt(1, h - 2);
      const t = tiles[y][x];
      if (t.type !== 'GRASSLAND') continue;

      // Don't place inside building footprints
      let inside = false;
      for (const p of placed) {
        if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) { inside = true; break; }
      }
      if (inside) continue;

      const decor = rng.random([
        // Saplings (reduced — multi-tile trees handle the big ones)
        tile('TREE', '\u2663', '#228822', '#112211', false, { buildingId: null }),      // ♣ sapling
        tile('TREE', '\u2660', '#227722', '#0D1A0D', false, { buildingId: null }),      // ♠ sapling
        // Flowers & bushes (more weight now)
        tile('BUSH', '\u273F', '#44AA44', '#112211', false, { buildingId: null }),      // ✿
        tile('FLOWER_BED', '\u2740', '#FF88AA', '#112211', true, { buildingId: null }), // ❀
        tile('FLOWER_BED', '\u2740', '#FFAA44', '#112211', true, { buildingId: null }), // ❀ orange
        tile('GARDEN', '\u273B', '#66CC66', '#112211', true, { buildingId: null }),     // ✻
        tile('GARDEN', '\u2698', '#88DD88', '#112211', true, { buildingId: null }),     // ⚘ potted flower
        // Infrastructure
        tile('LAMP_POST', '\u263C', '#FFDD44', '#112211', false, { buildingId: null }), // ☼
        tile('LAMP_POST', '\u00A4', '#FFcc33', '#112211', false, { buildingId: null }), // ¤ hanging lantern
        tile('BENCH', '\u2564', '#886644', '#112211', false, { buildingId: null }),     // ╤
        tile('FENCE', '\u2502', '#aa6622', '#112211', false, { buildingId: null }),     // │
        tile('FENCE', '\u2500', '#aa6622', '#112211', false, { buildingId: null }),     // ─ horizontal fence
        // Containers & objects
        tile('CRATE', '\u25AA', '#886644', '#112211', false, { buildingId: null }),     // ▪
        tile('CRATE', '\u2592', '#776633', '#112211', false, { buildingId: null }),     // ▒ cargo
        tile('WELL', '\u25CE', '#4488ff', '#112211', false, { buildingId: null }),      // ◎
        tile('BARREL', '\u25CB', '#886644', '#112211', false, { buildingId: null }),    // ○
        tile('HAY_BALE', '\u2593', '#CCAA44', '#112211', false, { buildingId: null }),  // ▓
        tile('WAGON', '\u25D8', '#886644', '#112211', false, { buildingId: null }),     // ◘
        tile('STATUE', '\u03A9', '#AAAAAA', '#112211', false, { buildingId: null }),    // Ω
        // New decorations
        tile('MARKET_STALL', '\u256A', '#AA7744', '#112211', false, { buildingId: null }), // ╪ market post
        tile('SIGN_POST', '\u2561', '#886644', '#112211', false, { buildingId: null }),    // ╡ sign
        tile('CHIMNEY', '\u2261', '#888888', '#112211', false, { buildingId: null }),       // ≡ chimney
        tile('ARCH', '\u2552', '#AAAAAA', '#112211', false, { buildingId: null }),          // ╒ stone arch
        tile('AWNING', '\u2550', '#CC6633', '#112211', false, { buildingId: null }),        // ═ awning
        tile('WINDOW_BOX', '\u2740', '#FF6688', '#556622', true, { buildingId: null }),     // ❀ on green bg
        tile('RAIN_BARREL', '\u25C9', '#4466AA', '#112211', false, { buildingId: null }),   // ◉ rain barrel
        tile('WOOD_PILE', '\u2261', '#AA6633', '#112211', false, { buildingId: null }),     // ≡ wood pile
        tile('TRELLIS', '\u256C', '#44AA44', '#112211', false, { buildingId: null }),       // ╬ vine trellis
        tile('ROCK', '\u25C6', '#888888', '#112211', false, { buildingId: null }),          // ◆ decorative rock
      ]);
      tiles[y][x] = decor;
    }
  }

  _rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }
}

// ============================================================================
// BuildingInterior
// ============================================================================

export class BuildingInterior {

  generate(rng, buildingType, width, height) {
    // Walls around the perimeter, floor inside
    const tiles = makeTileGrid(width, height, (x, y) => {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        return tile('WALL', '#', '#cccccc', '#333333', false);
      }
      return tile('FLOOR', '.', '#999999', '#222222', true);
    });

    // Door at bottom center
    const doorX = Math.floor(width / 2);
    tiles[height - 1][doorX] = tile('DOOR', '+', '#aa6622', '#222222', true);

    // Windows on side walls (not door wall)
    this._placeWindows(tiles, width, height, doorX);

    const npcPositions = [];
    const itemPositions = [];

    switch (buildingType) {
      case 'tavern':
        this._furnishTavern(rng, tiles, width, height, npcPositions, itemPositions);
        break;
      case 'shop':
        this._furnishShop(rng, tiles, width, height, npcPositions, itemPositions);
        break;
      case 'blacksmith':
        this._furnishBlacksmith(rng, tiles, width, height, npcPositions, itemPositions);
        break;
      case 'temple':
        this._furnishTemple(rng, tiles, width, height, npcPositions, itemPositions);
        break;
      case 'house':
      default:
        this._furnishHouse(rng, tiles, width, height, npcPositions, itemPositions);
        break;
    }

    // Resolve wall characters to box-drawing
    this._resolveInteriorWalls(tiles, width, height);

    return { tiles, width, height, npcPositions, itemPositions };
  }

  _place(tiles, x, y, type, char, fg, bg) {
    if (x >= 0 && y >= 0 && x < tiles[0].length && y < tiles.length && tiles[y][x].type === 'FLOOR') {
      tiles[y][x] = tile(type, char, fg, bg || '#222222', false);
      return true;
    }
    return false;
  }

  _placeWindows(tiles, w, h, doorX) {
    // Windows on top wall
    for (let x = 2; x < w - 2; x += 3) {
      if (tiles[0][x].type === 'WALL') {
        tiles[0][x] = tile('WINDOW', '\u25AF', '#AADDFF', '#333333', false);
      }
    }
    // Windows on left wall
    for (let y = 2; y < h - 2; y += 3) {
      if (tiles[y][0].type === 'WALL') {
        tiles[y][0] = tile('WINDOW', '\u25AF', '#AADDFF', '#333333', false);
      }
    }
    // Windows on right wall
    for (let y = 2; y < h - 2; y += 3) {
      if (tiles[y][w - 1].type === 'WALL') {
        tiles[y][w - 1] = tile('WINDOW', '\u25AF', '#AADDFF', '#333333', false);
      }
    }
  }

  _resolveInteriorWalls(tiles, width, height) {
    // Single-line box-drawing for interior walls
    const chars = [
      '\u25CB', // 0: isolated ○
      '\u2502', // 1: N │
      '\u2500', // 2: E ─
      '\u2514', // 3: N+E └
      '\u2502', // 4: S │
      '\u2502', // 5: N+S │
      '\u250C', // 6: S+E ┌
      '\u251C', // 7: N+S+E ├
      '\u2500', // 8: W ─
      '\u2518', // 9: N+W ┘
      '\u2500', // 10: E+W ─
      '\u2534', // 11: N+E+W ┴
      '\u2510', // 12: S+W ┐
      '\u2524', // 13: N+S+W ┤
      '\u252C', // 14: S+E+W ┬
      '\u253C', // 15: all ┼
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].type !== 'WALL') continue;

        const isWallLike = (nx, ny) => {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
          const t = tiles[ny][nx].type;
          return t === 'WALL' || t === 'DOOR' || t === 'WINDOW';
        };

        let mask = 0;
        if (isWallLike(x, y - 1)) mask |= 1;
        if (isWallLike(x + 1, y)) mask |= 2;
        if (isWallLike(x, y + 1)) mask |= 4;
        if (isWallLike(x - 1, y)) mask |= 8;

        tiles[y][x] = tile('WALL', chars[mask], '#cccccc', '#333333', false);
      }
    }
  }

  _placeRug(tiles, cx, cy, w, h, fg) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const rx = cx + dx, ry = cy + dy;
        if (rx > 0 && ry > 0 && rx < w - 1 && ry < h - 1 && tiles[ry][rx].type === 'FLOOR') {
          tiles[ry][rx] = tile('RUG', '\u2592', fg, '#222222', true);
        }
      }
    }
  }

  _furnishTavern(rng, tiles, w, h, npcPositions, itemPositions) {
    // Warm rug in the center
    this._placeRug(tiles, Math.floor(w / 2), Math.floor(h / 2), w, h, '#884422');

    // Bar counter along the top wall
    for (let x = 2; x < Math.min(w - 2, 7); x++) {
      this._place(tiles, x, 2, 'COUNTER', '\u2550', '#aa6622'); // ═
    }
    // Barrels behind counter
    this._place(tiles, 2, 1, 'BARREL', '\u25CB', '#886644'); // ○
    if (w > 6) this._place(tiles, 5, 1, 'BARREL', '\u25CB', '#886644');

    // Innkeeper behind bar
    npcPositions.push({ x: 3, y: 1, role: 'innkeeper' });

    // Tables and chairs scattered
    const tablePositions = [];
    for (let ty = 4; ty < h - 3; ty += 3) {
      for (let tx = 2; tx < w - 3; tx += 4) {
        if (rng.chance(0.7)) {
          this._place(tiles, tx, ty, 'TABLE', '\u2565', '#886644'); // ╥
          tablePositions.push({ x: tx, y: ty });
          // Chairs around table
          if (tx > 1) this._place(tiles, tx - 1, ty, 'CHAIR', '\u2561', '#664422'); // ╡
          if (tx < w - 2) this._place(tiles, tx + 1, ty, 'CHAIR', '\u255E', '#664422'); // ╞
          if (ty > 1) this._place(tiles, tx, ty - 1, 'CHAIR', '\u2568', '#664422'); // ╨
          // Candle on some tables
          if (rng.chance(0.4) && ty + 1 < h - 1) {
            this._place(tiles, tx, ty + 1, 'CANDLE', '\u2219', '#FFDD00');
          }
        }
      }
    }

    // Fireplace on a side wall
    this._place(tiles, w - 2, 1, 'FIREPLACE', '\u2593', '#ff4400'); // ▓
    this._place(tiles, w - 2, 2, 'FIREPLACE', '\u2591', '#ff6622'); // ░

    // Kitchen area in corner
    if (h > 6) {
      this._place(tiles, 1, h - 2, 'POT', '\u25CE', '#886644'); // ◎
      this._place(tiles, 2, h - 2, 'KNIFE', '\u254C', '#AAAAAA'); // ╌
    }

    // Stairs up
    this._place(tiles, 1, 1, 'STAIRS_UP', '<', '#ffffff');

    // Patrons at some tables
    for (const tp of tablePositions.slice(0, 2)) {
      npcPositions.push({ x: tp.x - 1, y: tp.y, role: 'patron' });
    }
  }

  _furnishShop(rng, tiles, w, h, npcPositions, itemPositions) {
    // Rug in front of counter
    this._placeRug(tiles, Math.floor(w / 2), 3, w, h, '#664433');

    // Counter near the top
    for (let x = 2; x < Math.min(w - 2, 7); x++) {
      this._place(tiles, x, 2, 'COUNTER', '\u2550', '#aa6622'); // ═
    }
    // Shopkeeper behind counter
    npcPositions.push({ x: 3, y: 1, role: 'merchant' });

    // Lantern above counter
    this._place(tiles, Math.floor(w / 2), 1, 'LANTERN', '\u263C', '#FFDD44'); // ☼

    // Shelves along walls (bookshelf-style)
    for (let y = 3; y < h - 2; y += 2) {
      this._place(tiles, 1, y, 'SHELF', '\u2562', '#886644'); // ╢
      this._place(tiles, w - 2, y, 'SHELF', '\u2562', '#886644');
      itemPositions.push({ x: 1, y, type: 'merchandise' });
      itemPositions.push({ x: w - 2, y, type: 'merchandise' });
    }

    // Display cases in the middle
    for (let x = 3; x < w - 3; x += 3) {
      const dy = Math.floor(h / 2);
      this._place(tiles, x, dy, 'DISPLAY_CASE', '\u25A1', '#aaaacc'); // □
      itemPositions.push({ x, y: dy, type: 'valuable' });
    }

    // Sign near door
    const doorX = Math.floor(w / 2);
    if (doorX + 1 < w - 1) {
      this._place(tiles, doorX + 1, h - 2, 'SIGN', '\u2691', '#CC8844'); // ⚑
    }
  }

  _furnishBlacksmith(rng, tiles, w, h, npcPositions, itemPositions) {
    // Forge in a corner - heat gradient
    this._place(tiles, 1, 1, 'FORGE', '\u2593', '#ff4400');  // ▓
    this._place(tiles, 2, 1, 'FORGE', '\u2593', '#ff2200');
    this._place(tiles, 1, 2, 'FORGE', '\u2591', '#ff6622');  // ░ cooler edge

    // Bellows next to forge
    this._place(tiles, 3, 1, 'BELLOWS', '\u2302', '#AA8866'); // ⌂

    // Water trough
    this._place(tiles, 1, 3, 'WATER_TROUGH', '\u2248', '#4488FF'); // ≈

    // Counter separating workshop from customer area
    const counterY = Math.min(3, Math.floor(h / 2) - 1);
    for (let x = 2; x < Math.min(w - 2, 7); x++) {
      this._place(tiles, x, counterY, 'COUNTER', '\u2550', '#aa6622'); // ═
    }

    // Anvil behind counter
    const ax = Math.floor(w / 2);
    this._place(tiles, ax, 1, 'ANVIL', '\u22A4', '#aaaaaa'); // ⊤
    npcPositions.push({ x: ax + 1, y: counterY - 1, role: 'blacksmith' });

    // Horseshoe on wall
    this._place(tiles, w - 2, 1, 'HORSESHOE', '\u2229', '#AA8844'); // ∩

    // Barrels along the bottom wall
    for (let x = 1; x < w - 1; x += 2) {
      this._place(tiles, x, h - 2, 'BARREL', '\u25CB', '#886644'); // ○
    }

    // Weapon rack on side wall
    for (let y = counterY + 1; y < Math.min(h - 2, counterY + 4); y++) {
      this._place(tiles, w - 2, y, 'WEAPON_RACK', '\u2571', '#aaaaaa'); // ╱ (or /)
      itemPositions.push({ x: w - 2, y, type: 'weapon' });
    }
  }

  _furnishTemple(rng, tiles, w, h, npcPositions, itemPositions) {
    // Carpet runner down the center aisle
    const altarX = Math.floor(w / 2);
    for (let y = 2; y < h - 1; y++) {
      if (tiles[y][altarX].type === 'FLOOR') {
        tiles[y][altarX] = tile('CARPET', '\u2592', '#442266', '#222222', true);
      }
    }

    // Altar at the top center - enhanced
    this._place(tiles, altarX, 1, 'ALTAR', '\u2565', '#ddddaa'); // ╥
    // Holy symbol above altar
    this._place(tiles, altarX, 2, 'HOLY_SYMBOL', '\u2020', '#ffdd44'); // †

    // Incense near altar
    if (altarX - 1 > 0) this._place(tiles, altarX - 1, 1, 'INCENSE', '\u2591', '#886688'); // ░
    if (altarX + 1 < w - 1) this._place(tiles, altarX + 1, 1, 'INCENSE', '\u2591', '#886688');

    // Pews in rows
    for (let y = 4; y < h - 2; y += 2) {
      for (let x = 2; x < w - 2; x++) {
        if (x === altarX) continue; // Leave center aisle clear
        this._place(tiles, x, y, 'PEW', '\u2261', '#664422'); // ≡
      }
    }

    // Candelabras along side walls
    for (let y = 1; y < h - 1; y += 2) {
      this._place(tiles, 1, y, 'CANDELABRA', '\u2219', '#FFDD00'); // ∙
      this._place(tiles, w - 2, y, 'CANDELABRA', '\u2219', '#FFDD00');
    }

    // Stained glass windows (override regular windows with colored ones)
    for (let x = 2; x < w - 2; x += 3) {
      if (tiles[0][x].type === 'WINDOW') {
        tiles[0][x] = tile('STAINED_GLASS', '\u25C8', rng.chance(0.5) ? '#FF44AA' : '#44AAFF', '#333333', false); // ◈
      }
    }

    // Priest at the altar
    npcPositions.push({ x: altarX, y: 3, role: 'priest' });
  }

  _furnishHouse(rng, tiles, w, h, npcPositions, itemPositions) {
    // Rug in center
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    this._placeRug(tiles, cx, cy, w, h, '#885544');

    // Bed in a corner
    this._place(tiles, 1, 1, 'BED', '\u2261', '#4444aa'); // ≡
    this._place(tiles, 2, 1, 'BED', '\u2261', '#4444aa');

    // Table and chair
    this._place(tiles, cx, cy, 'TABLE', '\u2565', '#886644'); // ╥
    this._place(tiles, cx + 1, cy, 'CHAIR', '\u255E', '#664422'); // ╞

    // Chest
    this._place(tiles, w - 2, 1, 'CHEST', '\u25A1', '#886644'); // □
    itemPositions.push({ x: w - 2, y: 1, type: 'loot' });

    // Bookshelf on wall
    this._place(tiles, 1, Math.floor(h / 2), 'BOOKSHELF', '\u2562', '#886644'); // ╢
    if (h > 5) this._place(tiles, 1, Math.floor(h / 2) + 1, 'BOOKSHELF', '\u2562', '#886644');

    // Potted plant in corner
    this._place(tiles, w - 2, h - 2, 'PLANT', '\u2663', '#44AA44'); // ♣

    // Fireplace
    this._place(tiles, w - 2, Math.floor(h / 2), 'FIREPLACE', '\u2593', '#ff4400'); // ▓

    // Resident
    npcPositions.push({ x: cx - 1, y: cy, role: 'resident' });
  }
}

// ============================================================================
// DungeonGenerator
// ============================================================================

export class DungeonGenerator {

  generate(rng, width = 60, height = 40, depth = 1, biome = 'standard') {
    const useCaves = biome === 'cave' || biome === 'cavern' || biome === 'natural';

    let tiles, rooms, corridors;

    if (useCaves) {
      ({ tiles, rooms, corridors } = this._generateCaves(rng, width, height, depth));
    } else {
      ({ tiles, rooms, corridors } = this._generateBSP(rng, width, height, depth));
    }

    // Place stairs
    if (rooms.length >= 2) {
      const entrance = rooms[0];
      const last = rooms[rooms.length - 1];
      entrance.type = 'entrance';

      const sx = entrance.x + Math.floor(entrance.w / 2);
      const sy = entrance.y + Math.floor(entrance.h / 2);
      tiles[sy][sx] = tile('STAIRS_UP', '<', '#ffffff', '#222222', true);

      const ex = last.x + Math.floor(last.w / 2);
      const ey = last.y + Math.floor(last.h / 2);
      tiles[ey][ex] = tile('STAIRS_DOWN', '>', '#ffffff', '#222222', true);
    }

    // Designate special rooms based on depth
    this._designateSpecialRooms(rng, rooms, depth);

    // Generate entity spots
    const entitySpots = this._placeEntitySpots(rng, tiles, rooms, depth, width, height);

    // Add water/lava features based on depth
    if (depth > 3 && biome !== 'cave') {
      this._addLiquidFeatures(rng, tiles, width, height, depth);
    }

    // Add decorative features to rooms
    this._decorateRooms(rng, tiles, rooms, depth, width, height, useCaves, biome);

    return { tiles, width, height, rooms, corridors, entitySpots, depth };
  }

  // --- BSP Dungeon Generation ---

  _generateBSP(rng, width, height, depth) {
    // Fill with walls
    const tiles = makeTileGrid(width, height, () =>
      tile('WALL', '#', '#666666', '#111111', false)
    );

    // Min room size scales slightly with depth
    const minRoomSize = Math.max(4, 6 - Math.floor(depth / 3));
    const maxSplitDepth = 4 + Math.min(depth, 4);

    // Create BSP tree
    const root = { x: 1, y: 1, w: width - 2, h: height - 2, left: null, right: null, room: null };
    this._splitNode(rng, root, 0, maxSplitDepth, minRoomSize);

    // Create rooms in leaf nodes
    const rooms = [];
    this._createRooms(rng, root, rooms, minRoomSize);

    // Connect rooms via BSP tree
    const corridors = [];
    this._connectRooms(rng, root, tiles, corridors);

    // Carve rooms into tiles with varied floor characters
    for (const room of rooms) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          tiles[y][x] = this._floorTile(rng, x, y, depth, false);
        }
      }
    }

    // Carve corridors and place doors
    for (const cor of corridors) {
      for (const p of cor.points) {
        if (p.x >= 0 && p.y >= 0 && p.x < width && p.y < height) {
          tiles[p.y][p.x] = this._floorTile(rng, p.x, p.y, depth, false);
        }
      }
    }

    // Place doors at room entrances
    this._placeDoors(rng, tiles, rooms, width, height);

    // Resolve wall characters to box-drawing
    this._resolveWallChars(tiles, width, height, depth, false);

    return { tiles, rooms, corridors };
  }

  _splitNode(rng, node, depth, maxDepth, minSize) {
    if (depth >= maxDepth) return;

    const canSplitH = node.h >= minSize * 2 + 2;
    const canSplitV = node.w >= minSize * 2 + 2;

    if (!canSplitH && !canSplitV) return;

    let splitH;
    if (canSplitH && canSplitV) {
      splitH = node.h > node.w ? rng.chance(0.7) : rng.chance(0.3);
    } else {
      splitH = canSplitH;
    }

    if (splitH) {
      const splitAt = rng.nextInt(node.y + minSize, node.y + node.h - minSize);
      node.left = { x: node.x, y: node.y, w: node.w, h: splitAt - node.y, left: null, right: null, room: null };
      node.right = { x: node.x, y: splitAt, w: node.w, h: node.y + node.h - splitAt, left: null, right: null, room: null };
    } else {
      const splitAt = rng.nextInt(node.x + minSize, node.x + node.w - minSize);
      node.left = { x: node.x, y: node.y, w: splitAt - node.x, h: node.h, left: null, right: null, room: null };
      node.right = { x: splitAt, y: node.y, w: node.x + node.w - splitAt, h: node.h, left: null, right: null, room: null };
    }

    this._splitNode(rng, node.left, depth + 1, maxDepth, minSize);
    this._splitNode(rng, node.right, depth + 1, maxDepth, minSize);
  }

  _createRooms(rng, node, rooms, minSize) {
    if (node.left || node.right) {
      if (node.left) this._createRooms(rng, node.left, rooms, minSize);
      if (node.right) this._createRooms(rng, node.right, rooms, minSize);
      return;
    }

    // Leaf node: create a room inside it
    const rw = rng.nextInt(minSize, Math.max(minSize, node.w - 2));
    const rh = rng.nextInt(minSize, Math.max(minSize, node.h - 2));
    const rx = rng.nextInt(node.x, node.x + node.w - rw);
    const ry = rng.nextInt(node.y, node.y + node.h - rh);

    const room = { x: rx, y: ry, w: rw, h: rh, type: 'normal' };
    node.room = room;
    rooms.push(room);
  }

  _getRoom(node) {
    if (node.room) return node.room;
    if (node.left) {
      const r = this._getRoom(node.left);
      if (r) return r;
    }
    if (node.right) {
      const r = this._getRoom(node.right);
      if (r) return r;
    }
    return null;
  }

  _connectRooms(rng, node, tiles, corridors) {
    if (!node.left || !node.right) return;

    this._connectRooms(rng, node.left, tiles, corridors);
    this._connectRooms(rng, node.right, tiles, corridors);

    const roomA = this._getRoom(node.left);
    const roomB = this._getRoom(node.right);
    if (!roomA || !roomB) return;

    // Connect centers of rooms A and B with an L-shaped corridor
    const ax = roomA.x + Math.floor(roomA.w / 2);
    const ay = roomA.y + Math.floor(roomA.h / 2);
    const bx = roomB.x + Math.floor(roomB.w / 2);
    const by = roomB.y + Math.floor(roomB.h / 2);

    const points = [];

    if (rng.chance(0.5)) {
      // Horizontal then vertical
      const xDir = bx > ax ? 1 : -1;
      for (let x = ax; x !== bx; x += xDir) {
        points.push({ x, y: ay });
      }
      const yDir = by > ay ? 1 : -1;
      for (let y = ay; y !== by + yDir; y += yDir) {
        points.push({ x: bx, y });
      }
    } else {
      // Vertical then horizontal
      const yDir = by > ay ? 1 : -1;
      for (let y = ay; y !== by; y += yDir) {
        points.push({ x: ax, y });
      }
      const xDir = bx > ax ? 1 : -1;
      for (let x = ax; x !== bx + xDir; x += xDir) {
        points.push({ x, y: by });
      }
    }

    corridors.push({ points });
  }

  _placeDoors(rng, tiles, rooms, w, h) {
    for (const room of rooms) {
      // Check edges of the room for corridor connections
      for (let x = room.x; x < room.x + room.w; x++) {
        for (const y of [room.y - 1, room.y + room.h]) {
          if (y < 0 || y >= h || x < 0 || x >= w) continue;
          if (tiles[y][x].type === 'FLOOR') {
            // Check if this is a transition point (wall adjacent on sides)
            const wallLeft = x > 0 && tiles[y][x - 1].type === 'WALL';
            const wallRight = x < w - 1 && tiles[y][x + 1].type === 'WALL';
            if ((wallLeft || wallRight) && rng.chance(0.4)) {
              tiles[y][x] = tile('DOOR', '+', '#aa6622', '#222222', true);
            }
          }
        }
      }
      for (let y = room.y; y < room.y + room.h; y++) {
        for (const x of [room.x - 1, room.x + room.w]) {
          if (y < 0 || y >= h || x < 0 || x >= w) continue;
          if (tiles[y][x].type === 'FLOOR') {
            const wallUp = y > 0 && tiles[y - 1][x].type === 'WALL';
            const wallDown = y < h - 1 && tiles[y + 1][x].type === 'WALL';
            if ((wallUp || wallDown) && rng.chance(0.4)) {
              tiles[y][x] = tile('DOOR', '+', '#aa6622', '#222222', true);
            }
          }
        }
      }
    }
  }

  // --- Cellular Automata Caves ---

  _generateCaves(rng, width, height, depth) {
    // Initialize random fill
    const grid = [];
    for (let y = 0; y < height; y++) {
      grid[y] = [];
      for (let x = 0; x < width; x++) {
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          grid[y][x] = 1; // wall
        } else {
          grid[y][x] = rng.chance(0.45) ? 1 : 0;
        }
      }
    }

    // Cellular automata iterations (4-5 rule)
    for (let iter = 0; iter < 5; iter++) {
      const next = [];
      for (let y = 0; y < height; y++) {
        next[y] = [];
        for (let x = 0; x < width; x++) {
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
            next[y][x] = 1;
            continue;
          }
          let walls = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (grid[y + dy][x + dx] === 1) walls++;
            }
          }
          // Birth at 5+, survival at 4+
          next[y][x] = walls >= 5 ? 1 : (walls >= 4 && grid[y][x] === 1) ? 1 : 0;
        }
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          grid[y][x] = next[y][x];
        }
      }
    }

    // Ensure connectivity via flood fill
    // Find the largest connected region of floor tiles
    const visited = new Set();
    let largestRegion = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const k = `${x},${y}`;
        if (grid[y][x] === 0 && !visited.has(k)) {
          const region = floodFill(x, y, (fx, fy) => {
            if (fx < 0 || fy < 0 || fx >= width || fy >= height) return false;
            return grid[fy][fx] === 0 && !visited.has(`${fx},${fy}`);
          }, width * height);
          for (const p of region) visited.add(`${p.x},${p.y}`);
          if (region.length > largestRegion.length) largestRegion = region;
        }
      }
    }

    // Fill everything not in the largest region with walls, then carve largest region
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid[y][x] = 1;
      }
    }
    const regionSet = new Set(largestRegion.map(p => `${p.x},${p.y}`));
    for (const p of largestRegion) {
      grid[p.y][p.x] = 0;
    }

    // Convert grid to tiles with varied floor characters
    const tiles = makeTileGrid(width, height, (x, y) => {
      if (grid[y][x] === 0) {
        return this._floorTile(rng, x, y, depth, true);
      }
      return tile('WALL', '#', '#666655', '#111100', false);
    });

    // Identify "rooms" as open areas (we pick some representative points)
    const rooms = this._identifyCaveRooms(rng, grid, largestRegion, width, height);
    const corridors = []; // Caves don't have explicit corridors

    // Resolve wall characters to single-line box-drawing
    this._resolveWallChars(tiles, width, height, depth, true);

    return { tiles, rooms, corridors };
  }

  _identifyCaveRooms(rng, grid, region, width, height) {
    // Place pseudo-rooms by finding open areas via sampling
    const rooms = [];
    const shuffled = [...region];
    // Manual shuffle with the rng
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (const p of shuffled) {
      if (rooms.length >= 8) break;
      // Check if this point has enough open space around it (acts like a room center)
      let open = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = p.x + dx;
          const ny = p.y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && grid[ny][nx] === 0) open++;
        }
      }
      if (open >= 20) {
        // Check distance from existing rooms
        let tooClose = false;
        for (const r of rooms) {
          if (distance(p.x, p.y, r.x + r.w / 2, r.y + r.h / 2) < 8) { tooClose = true; break; }
        }
        if (!tooClose) {
          rooms.push({ x: p.x - 2, y: p.y - 2, w: 5, h: 5, type: 'normal' });
        }
      }
    }

    // Ensure at least 2 rooms
    if (rooms.length < 2 && region.length > 1) {
      rooms.push({ x: region[0].x - 1, y: region[0].y - 1, w: 3, h: 3, type: 'normal' });
      const last = region[region.length - 1];
      rooms.push({ x: last.x - 1, y: last.y - 1, w: 3, h: 3, type: 'normal' });
    }

    return rooms;
  }

  _designateSpecialRooms(rng, rooms, depth) {
    if (rooms.length < 3) return;

    // Last room is boss room at certain depths
    if (depth % 5 === 0 || depth >= 8) {
      rooms[rooms.length - 1].type = 'boss';
    }

    // A random middle room becomes treasure room
    const mid = rng.nextInt(1, Math.max(1, rooms.length - 2));
    rooms[mid].type = 'treasure';
  }

  _placeEntitySpots(rng, tiles, rooms, depth, width, height) {
    const spots = [];
    const enemyCount = Math.floor(3 + depth * 1.5);

    for (const room of rooms) {
      if (room.type === 'entrance') continue;

      const count = room.type === 'boss' ? 1 + depth : room.type === 'treasure' ? rng.nextInt(1, 2) : rng.nextInt(1, Math.min(4, 1 + depth));

      for (let i = 0; i < count && spots.length < enemyCount * 2; i++) {
        const ex = rng.nextInt(room.x + 1, room.x + room.w - 2);
        const ey = rng.nextInt(room.y + 1, room.y + room.h - 2);
        if (ex >= 0 && ey >= 0 && ex < width && ey < height && tiles[ey][ex].type === 'FLOOR') {
          spots.push({
            x: ex, y: ey,
            type: room.type === 'boss' ? 'boss' : room.type === 'treasure' ? 'item' : rng.chance(0.7) ? 'enemy' : 'item',
            difficulty: depth + (room.type === 'boss' ? 3 : 0),
          });
        }
      }
    }

    return spots;
  }

  _addLiquidFeatures(rng, tiles, width, height, depth) {
    const isLava = depth > 6;
    const liquidChar = '\u2248';
    const liquidFg = isLava ? '#ff4400' : '#4488ff';
    const liquidBg = isLava ? '#441100' : '#000066';
    const liquidType = isLava ? 'LAVA' : 'WATER';

    // Add small pools
    const poolCount = rng.nextInt(1, 3);
    for (let p = 0; p < poolCount; p++) {
      const cx = rng.nextInt(5, width - 6);
      const cy = rng.nextInt(5, height - 6);
      const radius = rng.nextInt(2, 4);

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
          if (dx * dx + dy * dy <= radius * radius && tiles[ny][nx].type === 'FLOOR' && rng.chance(0.75)) {
            tiles[ny][nx] = tile(liquidType, liquidChar, liquidFg, liquidBg, false);
          }
        }
      }
    }
  }

  // --- Context-sensitive wall characters using box-drawing ---

  _resolveWallChars(tiles, width, height, depth, isCave) {
    // Depth-based wall colors
    const wallColors = depth <= 2 ? ['#AAAAAA', '#222222']
      : depth <= 4 ? ['#888888', '#1A1A1A']
      : depth <= 6 ? ['#666666', '#111111']
      : ['#555566', '#0A0A11'];
    const caveFg = '#666655';
    const caveBg = '#111100';

    // Double-line box-drawing for constructed dungeons (indexed by 4-bit adjacency mask)
    const doubleChars = [
      '\u25CB', // 0: isolated pillar ○
      '\u2551', // 1: N only ║
      '\u2550', // 2: E only ═
      '\u255A', // 3: N+E ╚
      '\u2551', // 4: S only ║
      '\u2551', // 5: N+S ║
      '\u2554', // 6: S+E ╔
      '\u2560', // 7: N+S+E ╠
      '\u2550', // 8: W only ═
      '\u255D', // 9: N+W ╝
      '\u2550', // 10: E+W ═
      '\u2569', // 11: N+E+W ╩
      '\u2557', // 12: S+W ╗
      '\u2563', // 13: N+S+W ╣
      '\u2566', // 14: S+E+W ╦
      '\u256C', // 15: all ╬
    ];

    // Single-line box-drawing for caves
    const singleChars = [
      '\u25CF', // 0: isolated ●
      '\u2502', // 1: N │
      '\u2500', // 2: E ─
      '\u2514', // 3: N+E └
      '\u2502', // 4: S │
      '\u2502', // 5: N+S │
      '\u250C', // 6: S+E ┌
      '\u251C', // 7: N+S+E ├
      '\u2500', // 8: W ─
      '\u2518', // 9: N+W ┘
      '\u2500', // 10: E+W ─
      '\u2534', // 11: N+E+W ┴
      '\u2510', // 12: S+W ┐
      '\u2524', // 13: N+S+W ┤
      '\u252C', // 14: S+E+W ┬
      '\u253C', // 15: all ┼
    ];

    const chars = isCave ? singleChars : doubleChars;
    const fg = isCave ? caveFg : wallColors[0];
    const bg = isCave ? caveBg : wallColors[1];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].type !== 'WALL') continue;

        // Build adjacency mask: check if neighbor is wall/door/out-of-bounds
        const isWallLike = (nx, ny) => {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
          const t = tiles[ny][nx].type;
          return t === 'WALL' || t === 'DOOR' || t === 'MOSSY_WALL';
        };

        let mask = 0;
        if (isWallLike(x, y - 1)) mask |= 1; // N
        if (isWallLike(x + 1, y)) mask |= 2; // E
        if (isWallLike(x, y + 1)) mask |= 4; // S
        if (isWallLike(x - 1, y)) mask |= 8; // W

        tiles[y][x] = tile('WALL', chars[mask], fg, bg, false);
      }
    }
  }

  // --- Varied floor tiles ---

  _floorTile(rng, x, y, depth, isCave) {
    const hash = ((x * 31 + y * 17) & 0xFFFF) / 65536;

    if (isCave) {
      const chars = ['\u00B7', '.', '\u2219', ',', '\u2058'];
      const weights = [0.35, 0.60, 0.80, 0.95, 1.0];
      let ch = chars[chars.length - 1];
      for (let i = 0; i < weights.length; i++) {
        if (hash < weights[i]) { ch = chars[i]; break; }
      }
      // Earthy color variation
      const v = ((x * 7 + y * 13) % 30) - 15;
      const r = Math.min(255, Math.max(0, 0xAA + v));
      const g = Math.min(255, Math.max(0, 0x99 + v));
      const b = Math.min(255, Math.max(0, 0x77 + v));
      const fg = '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
      const bv = ((x * 3 + y * 11) % 16) - 8;
      const br = Math.min(255, Math.max(0, 0x22 + bv));
      const bgr = Math.min(255, Math.max(0, 0x22 + bv));
      const bgb = Math.min(255, Math.max(0, 0x11 + bv));
      const bg = '#' + br.toString(16).padStart(2, '0') + bgr.toString(16).padStart(2, '0') + bgb.toString(16).padStart(2, '0');
      return tile('FLOOR', ch, fg, bg, true);
    }

    // Constructed dungeon
    const chars = ['\u00B7', '\u2219', '\u22C5', '\u2591', '\u2236'];
    const weights = [0.40, 0.65, 0.85, 0.95, 1.0];
    let ch = chars[chars.length - 1];
    for (let i = 0; i < weights.length; i++) {
      if (hash < weights[i]) { ch = chars[i]; break; }
    }
    const v = ((x * 7 + y * 13) % 30) - 15;
    const base = Math.max(0x55, 0x88 - depth * 5);
    const r = Math.min(255, Math.max(0, base + v));
    const g = Math.min(255, Math.max(0, base + v));
    const b = Math.min(255, Math.max(0, base + v));
    const fg = '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    const bv = ((x * 3 + y * 11) % 16) - 8;
    const bgVal = Math.min(255, Math.max(0, 0x22 + bv));
    const bg = '#' + bgVal.toString(16).padStart(2, '0') + bgVal.toString(16).padStart(2, '0') + bgVal.toString(16).padStart(2, '0');
    return tile('FLOOR', ch, fg, bg, true);
  }

  // --- Room and corridor decorations ---

  _decorateRooms(rng, tiles, rooms, depth, width, height, isCave, biome = 'standard') {
    const isMechanical = biome === 'mechanical';

    for (const room of rooms) {
      const isLargeRoom = room.w >= 7 && room.h >= 7;

      if (!isCave) {
        // Pillars in large rooms - evenly spaced
        if (isLargeRoom) {
          for (let y = room.y + 2; y < room.y + room.h - 2; y += 3) {
            for (let x = room.x + 2; x < room.x + room.w - 2; x += 3) {
              if (tiles[y][x].type === 'FLOOR') {
                tiles[y][x] = isMechanical
                  ? tile('MECH_GEAR', '\u2699', '#CCAA44', tiles[y][x].bg, false)
                  : tile('PILLAR', '\u25CB', '#AAAAAA', tiles[y][x].bg, false);
              }
            }
          }
        }

        // Torches / conduits on walls adjacent to rooms
        for (let x = room.x; x < room.x + room.w; x++) {
          for (const wy of [room.y - 1, room.y + room.h]) {
            if (wy < 0 || wy >= height) continue;
            if (tiles[wy][x].type === 'WALL' && (x - room.x) % 5 === 2 && rng.chance(0.6)) {
              tiles[wy][x] = isMechanical
                ? tile('MECH_CONDUIT', '\u26A1', '#44AAFF', tiles[wy][x].bg, false)
                : tile('TORCH', '\u263C', '#FFAA22', tiles[wy][x].bg, false);
            }
          }
        }
        for (let y = room.y; y < room.y + room.h; y++) {
          for (const wx of [room.x - 1, room.x + room.w]) {
            if (wx < 0 || wx >= width) continue;
            if (tiles[y][wx].type === 'WALL' && (y - room.y) % 5 === 2 && rng.chance(0.6)) {
              tiles[y][wx] = isMechanical
                ? tile('MECH_CONDUIT', '\u26A1', '#44AAFF', tiles[y][wx].bg, false)
                : tile('TORCH', '\u263C', '#FFAA22', tiles[y][wx].bg, false);
            }
          }
        }

        // Cobwebs / oil stains in corners
        const corners = [
          [room.x, room.y], [room.x + room.w - 1, room.y],
          [room.x, room.y + room.h - 1], [room.x + room.w - 1, room.y + room.h - 1],
        ];
        for (const [cx, cy] of corners) {
          if (cx >= 0 && cy >= 0 && cx < width && cy < height && tiles[cy][cx].type === 'FLOOR' && rng.chance(0.3)) {
            tiles[cy][cx] = isMechanical
              ? tile('PUDDLE', '~', '#333322', tiles[cy][cx].bg, true)
              : tile('COBWEB', '\u224B', '#777777', tiles[cy][cx].bg, true);
          }
        }

        // Mechanical rooms: pipes along walls
        if (isMechanical) {
          // Horizontal pipes along top and bottom walls
          for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
            if (room.y > 0 && tiles[room.y][x].type === 'FLOOR' && rng.chance(0.3)) {
              tiles[room.y][x] = tile('MECH_PIPE', '\u2550', '#778899', tiles[room.y][x].bg, true);
            }
            if (room.y + room.h - 1 < height && tiles[room.y + room.h - 1][x].type === 'FLOOR' && rng.chance(0.3)) {
              tiles[room.y + room.h - 1][x] = tile('MECH_PIPE', '\u2550', '#778899', tiles[room.y + room.h - 1][x].bg, true);
            }
          }
          // Vertical pipes along left and right walls
          for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
            if (tiles[y][room.x].type === 'FLOOR' && rng.chance(0.3)) {
              tiles[y][room.x] = tile('MECH_PIPE', '\u2551', '#778899', tiles[y][room.x].bg, true);
            }
            if (room.x + room.w - 1 < width && tiles[y][room.x + room.w - 1].type === 'FLOOR' && rng.chance(0.3)) {
              tiles[y][room.x + room.w - 1] = tile('MECH_PIPE', '\u2551', '#778899', tiles[y][room.x + room.w - 1].bg, true);
            }
          }
        }
      }

      // Scatter decorations on floor tiles
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if (tiles[y][x].type !== 'FLOOR') continue;

          const r = rng.next();

          if (isCave) {
            // Cave decorations
            if (r < 0.04 && depth > 3) {
              const crystalFg = rng.chance(0.7) ? '#44DDFF' : '#FF44DD';
              tiles[y][x] = tile('CRYSTAL', '\u25C6', crystalFg, tiles[y][x].bg, false);
            } else if (r < 0.09) {
              // Stalagmite on floor
              const nearWall = (x > 0 && tiles[y][x - 1].type === 'WALL') ||
                (x < width - 1 && tiles[y][x + 1].type === 'WALL') ||
                (y > 0 && tiles[y - 1][x].type === 'WALL') ||
                (y < height - 1 && tiles[y + 1][x].type === 'WALL');
              if (nearWall && rng.chance(0.5)) {
                tiles[y][x] = tile('STALAGMITE', '\u25B2', '#887766', tiles[y][x].bg, false);
              }
            } else if (r < 0.12) {
              tiles[y][x] = tile('FUNGAL_PATCH', '\u2234', '#88CC44', tiles[y][x].bg, true);
            }
          } else if (isMechanical) {
            // Mechanical dungeon decorations
            if (r < 0.03) {
              tiles[y][x] = tile('MECH_GEAR', '\u2699', '#CCAA44', tiles[y][x].bg, false);
            } else if (r < 0.05) {
              tiles[y][x] = tile('MECH_VALVE', '\u25C9', '#FF4444', tiles[y][x].bg, false);
            } else if (r < 0.08) {
              // Coolant puddle
              tiles[y][x] = tile('PUDDLE', '\u2248', '#22AAAA', tiles[y][x].bg, true);
            } else if (r < 0.10) {
              // Scrap metal
              tiles[y][x] = tile('RUBBLE', '%', '#889988', tiles[y][x].bg, true);
            } else if (r < 0.12) {
              // Pipe segment
              const pipeChar = rng.chance(0.5) ? '\u2550' : '\u2551';
              tiles[y][x] = tile('MECH_PIPE', pipeChar, '#778899', tiles[y][x].bg, true);
            }
          } else {
            // Constructed dungeon decorations
            if (r < 0.03) {
              tiles[y][x] = tile('RUBBLE', '\u2234', '#887766', tiles[y][x].bg, true);
            } else if (r < 0.05) {
              tiles[y][x] = tile('PUDDLE', '\u223D', '#4466AA', tiles[y][x].bg, true);
            } else if (r < 0.05 + 0.01 * depth) {
              tiles[y][x] = tile('BONES', '\u00A5', '#CCCCAA', tiles[y][x].bg, true);
            } else if (r < 0.08 && depth > 3) {
              tiles[y][x] = tile('MOSS', '\u2248', '#448844', tiles[y][x].bg, true);
            }
          }
        }
      }

      // Special room decorations
      if (room.type === 'treasure') {
        // Braziers at accessible corners
        const offsets = [[1, 1], [room.w - 2, 1], [1, room.h - 2], [room.w - 2, room.h - 2]];
        for (const [ox, oy] of offsets) {
          const bx = room.x + ox, by = room.y + oy;
          if (bx >= 0 && by >= 0 && bx < width && by < height && tiles[by][bx].type === 'FLOOR') {
            tiles[by][bx] = tile('BRAZIER', '\u2609', '#FF6622', tiles[by][bx].bg, false);
          }
        }
        // Gold piles
        for (let i = 0; i < 3; i++) {
          const gx = rng.nextInt(room.x + 1, room.x + room.w - 2);
          const gy = rng.nextInt(room.y + 1, room.y + room.h - 2);
          if (gx >= 0 && gy >= 0 && gx < width && gy < height && tiles[gy][gx].type === 'FLOOR') {
            tiles[gy][gx] = tile('GOLD_PILE', '$', '#FFD700', tiles[gy][gx].bg, true);
          }
        }
      }

      if (room.type === 'boss') {
        // Pillars flanking the room
        const offsets = [[1, 1], [room.w - 2, 1], [1, room.h - 2], [room.w - 2, room.h - 2]];
        for (const [ox, oy] of offsets) {
          const px = room.x + ox, py = room.y + oy;
          if (px >= 0 && py >= 0 && px < width && py < height && tiles[py][px].type === 'FLOOR') {
            tiles[py][px] = tile('PILLAR', '\u25CB', '#AAAAAA', tiles[py][px].bg, false);
          }
        }
        // Braziers
        const mid = Math.floor(room.w / 2);
        for (const [ox, oy] of [[mid, 1], [mid, room.h - 2]]) {
          const bx = room.x + ox, by = room.y + oy;
          if (bx >= 0 && by >= 0 && bx < width && by < height && tiles[by][bx].type === 'FLOOR') {
            tiles[by][bx] = tile('BRAZIER', '\u2609', '#FF6622', tiles[by][bx].bg, false);
          }
        }
        // Extra bones
        for (let i = 0; i < 4; i++) {
          const bx = rng.nextInt(room.x + 1, room.x + room.w - 2);
          const by = rng.nextInt(room.y + 1, room.y + room.h - 2);
          if (bx >= 0 && by >= 0 && bx < width && by < height && tiles[by][bx].type === 'FLOOR') {
            tiles[by][bx] = tile('BONES', '\u00A5', '#CCCCAA', tiles[by][bx].bg, true);
          }
        }
      }
    }

    // Stalactites on cave walls above open space
    if (isCave) {
      for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width; x++) {
          if (tiles[y][x].type === 'WALL' && tiles[y + 1][x].type === 'FLOOR' && rng.chance(0.08)) {
            tiles[y][x] = tile('STALACTITE', '\u25BC', '#998877', tiles[y][x].bg, false);
          }
        }
      }
    }
  }
}

// ============================================================================
// BridgeDungeonGenerator — Ancient abandoned metal tech bridge sub-levels
// ============================================================================

export class BridgeDungeonGenerator {

  generate(rng, bridgeLocation) {
    const span = bridgeLocation.bridgeSpan || 5;
    const state = bridgeLocation.bridgeState; // 0=enemies+shops, 1=enemies, 2=empty, 3=broken

    // Outdoor landscape: wider than tall, bridge runs vertically (top to bottom)
    const width = 60;
    const height = 44;
    const bridgeX = Math.floor(width / 2); // Bridge center column
    const bridgeW = 3; // Bridge deck width (center ± 1)

    const tiles = makeTileGrid(width, height, (x, y) =>
      this._terrainAt(rng, x, y, width, height, bridgeX, bridgeW, span)
    );

    // ── Lay the vertical bridge structure ──
    this._buildBridge(tiles, rng, width, height, bridgeX, bridgeW, state);

    // ── Scatter natural decorations on grass ──
    this._decorateGrass(tiles, rng, width, height, bridgeX, bridgeW);

    // ── Place bridge-side decorations (signposts, barrels, machinery) ──
    this._decorateBridgeEnds(tiles, rng, width, height, bridgeX, bridgeW, state);

    // ── Apply broken state ──
    if (state === 3) {
      this._applyBrokenState(tiles, rng, width, height, bridgeX, bridgeW);
    }

    // ── Place entity spots ──
    const entitySpots = this._placeEntities(rng, tiles, state, width, height, bridgeX, bridgeW);

    return {
      tiles, width, height,
      buildings: [],
      npcSlots: [],
      coreOffset: { x: 0, y: 0 },
      isBridge: true,
      bridgeState: state,
      entitySpots,
      bridgeX,
    };
  }

  // ── Terrain generation: grass → shore → water gradient → shore → grass ──
  _terrainAt(rng, x, y, width, height, bridgeX, bridgeW, span) {
    // Compute vertical band: water is in the middle, grass at top/bottom
    // Water zone spans roughly the middle ~40% of height
    const waterCenter = Math.floor(height / 2);
    const waterHalfSpan = Math.max(6, Math.floor(span * 1.8)); // total water ~12+ rows
    const waterTop = waterCenter - waterHalfSpan;
    const waterBot = waterCenter + waterHalfSpan;

    // Shore bands (2 rows each side)
    const outerShoreTop = waterTop - 2;
    const innerShoreTop = waterTop - 1;
    const innerShoreBot = waterBot + 1;
    const outerShoreBot = waterBot + 2;

    // Determine terrain band from Y position
    if (y <= outerShoreTop - 1 || y >= outerShoreBot + 1) {
      // Grass zone
      return this._grassTile(rng, x, y);
    }
    if (y === outerShoreTop || y === outerShoreBot) {
      // Outer shore — sandy transition to grass
      const prox = 0.5 + rng.next() * 0.3;
      const fg = _lerpColor('#C2B280', '#88AA55', prox);
      const bg = _lerpColor('#3D3418', '#1A2210', prox);
      return tile('OUTER_SHORE', '.', fg, bg, true, { biome: 'shore', waterDepth: -2, solid: false });
    }
    if (y === innerShoreTop || y === innerShoreBot) {
      // Inner shore — wet sand
      const prox = 0.3 + rng.next() * 0.4;
      const fg = _lerpColor('#8B7D5B', '#C2B280', prox);
      const bg = _lerpColor('#2A2210', '#3D3418', prox);
      return tile('INNER_SHORE', '\u00B7', fg, bg, true, { biome: 'shore', waterDepth: -1, solid: false });
    }

    // Water zone — depth gradient from edges to center
    const distFromEdge = Math.min(y - waterTop, waterBot - y);
    const maxDist = waterHalfSpan;
    const depthFrac = distFromEdge / maxDist; // 0 at edges, 1 at center

    if (depthFrac < 0.15) {
      // Walkable shallows (edge)
      return tile('SHALLOWS', '~', '#4488ff', '#001144', true, { biome: 'lake', waterDepth: 0, solid: false });
    }
    if (depthFrac < 0.30) {
      return tile('SHALLOWS', '~', '#4488ff', '#001144', false, { biome: 'lake', waterDepth: 1, solid: true });
    }
    if (depthFrac < 0.45) {
      return tile('MEDIUM_WATER', '~', '#2266CC', '#000066', false, { biome: 'lake', waterDepth: 2, solid: true });
    }
    if (depthFrac < 0.60) {
      return tile('OCEAN', '\u223D', '#0044AA', '#000055', false, { biome: 'ocean', waterDepth: 3, solid: true });
    }
    if (depthFrac < 0.80) {
      return tile('DEEP_WATER', '\u223D', '#002277', '#000033', false, { biome: 'ocean', waterDepth: 4, solid: true });
    }
    return tile('VERY_DEEP_WATER', '\u2248', '#001155', '#000022', false, { biome: 'ocean', waterDepth: 5, solid: true });
  }

  _grassTile(rng, x, y) {
    const r = rng.next();
    if (r < 0.08) return tile('TREE', '\u2663', '#228822', '#112211', false, { solid: true });
    if (r < 0.12) return tile('TREE', '\u2660', '#116611', '#0a1a0a', false, { solid: true });
    if (r < 0.18) {
      // Tall grass variation
      return tile('GRASSLAND', ';', '#55bb55', '#112211', true, { biome: 'grassland', solid: false });
    }
    if (r < 0.22) {
      // Flowers
      const flowerFg = rng.random(['#ee66aa', '#ffaa33', '#aaaaff', '#ffff44']);
      return tile('GRASSLAND', '*', flowerFg, '#112211', true, { biome: 'grassland', solid: false });
    }
    // Standard grass with slight color variation
    const prox = rng.next() * 0.3;
    const fg = _lerpColor('#44aa44', '#55cc55', prox);
    return tile('GRASSLAND', ',', fg, '#112211', true, { biome: 'grassland', solid: false });
  }

  // ── Build the vertical bridge structure ──
  _buildBridge(tiles, rng, width, height, bridgeX, bridgeW, state) {
    const halfW = Math.floor(bridgeW / 2);
    const leftRail = bridgeX - halfW - 1;
    const rightRail = bridgeX + halfW + 1;

    for (let y = 0; y < height; y++) {
      const baseTile = tiles[y][bridgeX];
      const isWater = baseTile.waterDepth != null && baseTile.waterDepth >= 0;
      const isShore = baseTile.type === 'INNER_SHORE' || baseTile.type === 'OUTER_SHORE';

      // Bridge deck (3 tiles wide)
      for (let dx = -halfW; dx <= halfW; dx++) {
        const bx = bridgeX + dx;
        if (bx < 0 || bx >= width) continue;

        if (isWater || isShore) {
          // Over water/shore: metallic bridge deck
          tiles[y][bx] = this._metalFloor(rng, bx, y);
        } else {
          // On grass: stone road surface leading to/from bridge
          tiles[y][bx] = this._stoneRoad(rng, bx, y);
        }
      }

      // Railings (only over water and shore)
      if (isWater || isShore) {
        if (leftRail >= 0 && leftRail < width) {
          tiles[y][leftRail] = tile('BRIDGE_RAILING', '\u2502', '#887766', '#1A1A18', false,
            { structure: true, solid: true }); // │ left railing
        }
        if (rightRail >= 0 && rightRail < width) {
          tiles[y][rightRail] = tile('BRIDGE_RAILING', '\u2502', '#887766', '#1A1A18', false,
            { structure: true, solid: true }); // │ right railing
        }
      }
    }

    // ── Gate archways at north and south ends ──
    // Find where water/shore starts from top and bottom
    let northGateY = 0;
    let southGateY = height - 1;
    for (let y = 0; y < height; y++) {
      const t = tiles[y][bridgeX];
      if (t.type === 'OUTER_SHORE' || t.type === 'INNER_SHORE' ||
          (t.waterDepth != null && t.waterDepth >= 0 && t.type !== 'BRIDGE_FLOOR')) {
        northGateY = y - 1;
        break;
      }
    }
    for (let y = height - 1; y >= 0; y--) {
      const t = tiles[y][bridgeX];
      if (t.type === 'OUTER_SHORE' || t.type === 'INNER_SHORE' ||
          (t.waterDepth != null && t.waterDepth >= 0 && t.type !== 'BRIDGE_FLOOR')) {
        southGateY = y + 1;
        break;
      }
    }

    // North gate archway
    if (northGateY >= 0 && northGateY < height) {
      if (leftRail >= 0) tiles[northGateY][leftRail] = tile('BRIDGE_GATE', '\u2554', '#AA7744', '#221100', false, { structure: true, solid: true }); // ╔
      if (rightRail < width) tiles[northGateY][rightRail] = tile('BRIDGE_GATE', '\u2557', '#AA7744', '#221100', false, { structure: true, solid: true }); // ╗
      // Horizontal bar across top
      for (let dx = -halfW; dx <= halfW; dx++) {
        const bx = bridgeX + dx;
        if (bx >= 0 && bx < width) {
          tiles[northGateY][bx] = tile('BRIDGE_GATE', '\u2550', '#AA7744', '#112211', true, { structure: true, solid: false }); // ═ walkable arch
        }
      }
    }

    // South gate archway
    if (southGateY >= 0 && southGateY < height) {
      if (leftRail >= 0) tiles[southGateY][leftRail] = tile('BRIDGE_GATE', '\u255A', '#AA7744', '#221100', false, { structure: true, solid: true }); // ╚
      if (rightRail < width) tiles[southGateY][rightRail] = tile('BRIDGE_GATE', '\u255D', '#AA7744', '#221100', false, { structure: true, solid: true }); // ╝
      for (let dx = -halfW; dx <= halfW; dx++) {
        const bx = bridgeX + dx;
        if (bx >= 0 && bx < width) {
          tiles[southGateY][bx] = tile('BRIDGE_GATE', '\u2550', '#AA7744', '#112211', true, { structure: true, solid: false }); // ═ walkable arch
        }
      }
    }

    // ── Bridge support pillars in water (every 4 rows) ──
    for (let y = 0; y < height; y++) {
      if (y % 4 !== 0) continue;
      for (const rx of [leftRail, rightRail]) {
        if (rx < 0 || rx >= width) continue;
        const base = tiles[y][rx];
        if (base.waterDepth != null && base.waterDepth >= 1) {
          tiles[y][rx] = tile('BRIDGE_PILLAR', '\u2588', '#776655', '#001144', false,
            { structure: true, solid: true }); // █ pillar in water
        }
      }
    }
  }

  _metalFloor(rng, x, y) {
    const roll = rng.next();
    if (roll < 0.15) return tile('BRIDGE_FLOOR', '\u2591', '#6B6B6B', '#1A1A18', true, { structure: true, solid: false }); // ░
    if (roll < 0.25) return tile('BRIDGE_FLOOR', '\u2592', '#5A5A5A', '#1A1A18', true, { structure: true, solid: false }); // ▒
    if (roll < 0.35) return tile('BRIDGE_FLOOR', '\u00B7', '#7A7A7A', '#1A1A18', true, { structure: true, solid: false }); // ·
    return tile('BRIDGE_FLOOR', '.', '#888877', '#1A1A18', true, { structure: true, solid: false });
  }

  _stoneRoad(rng, x, y) {
    const roll = rng.next();
    if (roll < 0.2) return tile('ROAD', '=', '#bbaa66', '#332211', true, { solid: false });
    if (roll < 0.4) return tile('ROAD', '\u00B7', '#aa9955', '#332211', true, { solid: false }); // · cobblestone
    return tile('ROAD', '=', '#ccaa44', '#332211', true, { solid: false });
  }

  // ── Broken bridge: gap in the middle over deepest water ──
  _applyBrokenState(tiles, rng, width, height, bridgeX, bridgeW) {
    const halfW = Math.floor(bridgeW / 2);
    const gapCenter = Math.floor(height / 2);
    const gapHalf = 2 + rng.nextInt(0, 2); // gap of 4-6 rows
    const gapTop = gapCenter - gapHalf;
    const gapBot = gapCenter + gapHalf;

    for (let y = gapTop; y <= gapBot; y++) {
      if (y < 0 || y >= height) continue;
      for (let dx = -halfW - 1; dx <= halfW + 1; dx++) {
        const bx = bridgeX + dx;
        if (bx < 0 || bx >= width) continue;
        const t = tiles[y][bx];
        if (t.type === 'BRIDGE_FLOOR' || t.type === 'BRIDGE_RAILING' || t.type === 'BRIDGE_PILLAR') {
          tiles[y][bx] = tile('BRIDGE_VOID', ' ', '#110011', '#000000', false,
            { structure: true, broken: true, solid: true });
        }
      }
    }

    // Crumbling edges
    for (const edgeY of [gapTop - 1, gapBot + 1]) {
      if (edgeY < 0 || edgeY >= height) continue;
      for (let dx = -halfW; dx <= halfW; dx++) {
        const bx = bridgeX + dx;
        if (bx < 0 || bx >= width) continue;
        if (tiles[edgeY][bx].type === 'BRIDGE_FLOOR') {
          tiles[edgeY][bx] = tile('BRIDGE_CRUMBLE', '%', '#665544', '#1A1A18', true,
            { structure: true, crumbling: true, solid: false });
        }
      }
    }
  }

  // ── Natural decorations on grass areas ──
  _decorateGrass(tiles, rng, width, height, bridgeX, bridgeW) {
    const halfW = Math.floor(bridgeW / 2);

    // Add rocks, bushes near shoreline
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Skip bridge area
        if (Math.abs(x - bridgeX) <= halfW + 2) continue;
        const t = tiles[y][x];
        if (t.type !== 'GRASSLAND' || t.solid) continue;

        // Near-shore decorations
        const isNearShore = (y > 0 && (tiles[y - 1][x].type === 'OUTER_SHORE' || tiles[y - 1][x].type === 'INNER_SHORE')) ||
                            (y < height - 1 && (tiles[y + 1][x].type === 'OUTER_SHORE' || tiles[y + 1][x].type === 'INNER_SHORE'));
        if (isNearShore && rng.next() < 0.12) {
          const r = rng.next();
          if (r < 0.5) {
            tiles[y][x] = tile('ROCK', 'o', '#999999', '#112211', false, { solid: true }); // scattered rocks
          } else {
            tiles[y][x] = tile('BUSH', '\u00A7', '#33aa33', '#112211', false, { solid: true }); // § bush
          }
        }
      }
    }
  }

  // ── Decorations near bridge entrances ──
  _decorateBridgeEnds(tiles, rng, width, height, bridgeX, bridgeW, state) {
    const halfW = Math.floor(bridgeW / 2);

    // Signposts at bridge entrances (north and south grass)
    for (const baseY of [3, height - 4]) {
      const sx = bridgeX + halfW + 2;
      if (sx < width && baseY >= 0 && baseY < height && tiles[baseY][sx].type === 'GRASSLAND') {
        tiles[baseY][sx] = tile('BRIDGE_SIGNPOST', '\u2020', '#CC9944', '#112211', false,
          { structure: true, solid: true }); // † signpost
      }
    }

    // Barrels and crates near bridge (state 0 has merchant stalls)
    if (state === 0) {
      // Small market area near north entrance
      for (let i = 0; i < 3; i++) {
        const mx = bridgeX + halfW + 3 + i;
        const my = 4 + rng.nextInt(0, 2);
        if (mx < width && my < height && tiles[my][mx].type === 'GRASSLAND' && !tiles[my][mx].solid) {
          const r = rng.next();
          if (r < 0.5) tiles[my][mx] = tile('BARREL', 'o', '#996633', '#112211', false, { structure: true, solid: true });
          else tiles[my][mx] = tile('CRATE', '\u25A1', '#887744', '#112211', false, { structure: true, solid: true }); // □
        }
      }
    }

    // Ancient machinery / tech decorations along bridge sides
    for (let y = 0; y < height; y += 6 + rng.nextInt(0, 3)) {
      for (const side of [-1, 1]) {
        const dx = bridgeX + side * (halfW + 3);
        if (dx < 0 || dx >= width || y < 0 || y >= height) continue;
        if (tiles[y][dx].type === 'GRASSLAND' && !tiles[y][dx].solid && rng.next() < 0.4) {
          const r = rng.next();
          if (r < 0.3) {
            tiles[y][dx] = tile('RUSTED_MACHINE', '\u2699', '#885533', '#112211', false, { structure: true, solid: true }); // ⚙
          } else if (r < 0.6) {
            tiles[y][dx] = tile('COLLAPSED_BEAM', '/', '#776655', '#112211', false, { structure: true, solid: true });
          } else {
            tiles[y][dx] = tile('METAL_DEBRIS', '%', '#777766', '#112211', false, { structure: true, solid: true });
          }
        }
      }
    }
  }

  // ── Entity placement ──
  _placeEntities(rng, tiles, state, width, height, bridgeX, bridgeW) {
    const spots = [];
    const halfW = Math.floor(bridgeW / 2);

    if (state === 3) {
      // Broken bridge — minimal entities
      return spots;
    }

    // Enemy spots along the bridge and near shore (states 0, 1)
    if (state === 0 || state === 1) {
      // Enemies on the bridge deck
      const bridgeEnemies = 2 + rng.nextInt(0, 3);
      for (let i = 0; i < bridgeEnemies; i++) {
        for (let attempt = 0; attempt < 30; attempt++) {
          const ex = bridgeX + rng.nextInt(-halfW, halfW);
          const ey = rng.nextInt(8, height - 8);
          if (ey >= 0 && ey < height && ex >= 0 && ex < width &&
              tiles[ey][ex].type === 'BRIDGE_FLOOR' && !tiles[ey][ex].solid) {
            spots.push({ type: 'enemy', x: ex, y: ey });
            break;
          }
        }
      }
      // Enemies on grass near bridge
      const grassEnemies = rng.nextInt(1, 3);
      for (let i = 0; i < grassEnemies; i++) {
        for (let attempt = 0; attempt < 30; attempt++) {
          const ex = rng.nextInt(5, width - 5);
          const ey = rng.next() < 0.5 ? rng.nextInt(1, 6) : rng.nextInt(height - 7, height - 2);
          if (ey >= 0 && ey < height && ex >= 0 && ex < width &&
              tiles[ey][ex].type === 'GRASSLAND' && !tiles[ey][ex].solid) {
            spots.push({ type: 'enemy', x: ex, y: ey });
            break;
          }
        }
      }
    }

    // Shop NPCs near bridge entrances (state 0 only)
    if (state === 0) {
      // Merchant on north grass near bridge
      const shopX = bridgeX + halfW + 2;
      const shopY = 5;
      if (shopX < width && shopY < height && tiles[shopY][shopX].type === 'GRASSLAND' && !tiles[shopY][shopX].solid) {
        spots.push({ type: 'shop_npc', x: shopX, y: shopY });
      }
      // Second merchant on south grass if lucky
      if (rng.next() < 0.5) {
        const shopX2 = bridgeX - halfW - 2;
        const shopY2 = height - 6;
        if (shopX2 >= 0 && shopY2 >= 0 && tiles[shopY2][shopX2].type === 'GRASSLAND' && !tiles[shopY2][shopX2].solid) {
          spots.push({ type: 'shop_npc', x: shopX2, y: shopY2 });
        }
      }
    }

    // Item spots — on bridge or grass
    const itemCount = state === 2 ? rng.nextInt(2, 5) : rng.nextInt(1, 3);
    for (let i = 0; i < itemCount; i++) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const ix = rng.nextInt(3, width - 3);
        const iy = rng.nextInt(2, height - 2);
        if (iy >= 0 && iy < height && ix >= 0 && ix < width &&
            !tiles[iy][ix].solid && tiles[iy][ix].walkable) {
          spots.push({ type: 'item', x: ix, y: iy });
          break;
        }
      }
    }

    return spots;
  }
}

// ============================================================================
// TowerGenerator
// ============================================================================

export class TowerGenerator {

  generate(rng, floors = 10, purpose = 'wizard') {
    const size = 15;
    const result = [];

    for (let f = 0; f < floors; f++) {
      const floorData = this._generateFloor(rng, size, size, f, floors, purpose);
      floorData.floorNum = f;
      result.push(floorData);
    }

    return result;
  }

  _generateFloor(rng, width, height, floorNum, totalFloors, purpose) {
    // Fill with void
    const tiles = makeTileGrid(width, height, () =>
      tile('VOID', ' ', '#000000', '#000000', false)
    );

    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const radius = 6;

    // Carve octagonal shape
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        // Octagonal distance approximation
        const dist = Math.max(dx, dy) + Math.min(dx, dy) * 0.41;

        if (dist <= radius) {
          if (dist >= radius - 0.8) {
            tiles[y][x] = tile('WALL', '\u2591', '#888888', '#222222', false); // ░ textured stone
          } else {
            // Varied floor tiles for tower
            const fh = ((x * 31 + y * 17) & 0xFFFF) / 65536;
            const fch = fh < 0.5 ? '\u00B7' : fh < 0.8 ? '\u2219' : '.'; // · ∙ .
            tiles[y][x] = tile('FLOOR', fch, '#999999', '#222222', true);
          }
        }
      }
    }

    // Central staircase
    tiles[cy][cx] = tile('STAIRS_DOWN', '>', '#ffffff', '#222222', true);
    tiles[cy][cx - 1] = tile('STAIRS_UP', '<', '#ffffff', '#222222', true);

    // No stairs down on bottom floor, no stairs up on top floor
    if (floorNum === 0) {
      tiles[cy][cx] = tile('FLOOR', '.', '#999999', '#222222', true);
      // Entrance door at bottom
      tiles[cy + radius - 1][cx] = tile('DOOR', '+', '#aa6622', '#222222', true);
    }
    if (floorNum === totalFloors - 1) {
      tiles[cy][cx - 1] = tile('FLOOR', '.', '#999999', '#222222', true);
    }

    const entities = [];
    const items = [];

    // Floor-specific furnishing
    if (floorNum === 0) {
      // Entrance / guard room
      this._addGuardRoom(rng, tiles, cx, cy, radius, entities);
    } else if (floorNum === totalFloors - 1) {
      // Boss room / top floor
      this._addBossRoom(rng, tiles, cx, cy, radius, entities, items, purpose);
    } else if (floorNum <= 2) {
      // Lower floors: storage / guard
      this._addStorageRoom(rng, tiles, cx, cy, radius, entities, items);
    } else {
      // Middle floors based on purpose
      this._addPurposeRoom(rng, tiles, cx, cy, radius, entities, items, purpose, floorNum);
    }

    return { tiles, entities, items, width, height };
  }

  _addGuardRoom(rng, tiles, cx, cy, radius, entities) {
    // Guard positions near entrance
    entities.push({ x: cx - 2, y: cy + radius - 3, type: 'guard', difficulty: 2 });
    entities.push({ x: cx + 2, y: cy + radius - 3, type: 'guard', difficulty: 2 });

    // Weapon racks
    this._placeFurniture(tiles, cx - 3, cy - 2, 'WEAPON_RACK', '/', '#aaaaaa');
    this._placeFurniture(tiles, cx + 3, cy - 2, 'WEAPON_RACK', '/', '#aaaaaa');
  }

  _addBossRoom(rng, tiles, cx, cy, radius, entities, items, purpose) {
    const bossTypes = {
      wizard: 'archmage', dark: 'lich', military: 'commander',
    };
    entities.push({ x: cx, y: cy - 2, type: bossTypes[purpose] || 'boss', difficulty: 10 });

    // Treasure around the edges
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const tx = cx + Math.round(Math.cos(angle) * (radius - 2));
      const ty = cy + Math.round(Math.sin(angle) * (radius - 2));
      if (tiles[ty] && tiles[ty][tx] && tiles[ty][tx].type === 'FLOOR') {
        this._placeFurniture(tiles, tx, ty, 'CHEST', '\u25a1', '#ffdd44');
        items.push({ x: tx, y: ty, type: 'treasure' });
      }
    }
  }

  _addStorageRoom(rng, tiles, cx, cy, radius, entities, items) {
    // Barrels and crates
    for (let i = 0; i < 6; i++) {
      const sx = rng.nextInt(cx - radius + 2, cx + radius - 2);
      const sy = rng.nextInt(cy - radius + 2, cy + radius - 2);
      if (tiles[sy] && tiles[sy][sx] && tiles[sy][sx].type === 'FLOOR') {
        const obj = rng.chance(0.5) ? ['BARREL', 'o', '#886644'] : ['CRATE', '\u00a4', '#886644'];
        this._placeFurniture(tiles, sx, sy, obj[0], obj[1], obj[2]);
        if (rng.chance(0.3)) items.push({ x: sx, y: sy, type: 'supply' });
      }
    }
    // A guard
    entities.push({ x: cx + 2, y: cy, type: 'guard', difficulty: 3 });
  }

  _addPurposeRoom(rng, tiles, cx, cy, radius, entities, items, purpose, floorNum) {
    switch (purpose) {
      case 'wizard':
        // Library / laboratory
        if (floorNum % 2 === 0) {
          // Library: bookshelves
          for (let x = cx - 3; x <= cx + 3; x += 2) {
            for (let y = cy - 3; y <= cy - 1; y++) {
              this._placeFurniture(tiles, x, y, 'BOOKSHELF', '%', '#886644');
            }
          }
          items.push({ x: cx, y: cy + 2, type: 'scroll' });
        } else {
          // Lab: tables with potions
          this._placeFurniture(tiles, cx - 2, cy - 2, 'TABLE', '\u03c0', '#886644');
          this._placeFurniture(tiles, cx + 2, cy - 2, 'TABLE', '\u03c0', '#886644');
          items.push({ x: cx - 2, y: cy - 2, type: 'potion' });
          items.push({ x: cx + 2, y: cy - 2, type: 'potion' });
          // Cauldron
          this._placeFurniture(tiles, cx, cy + 2, 'CAULDRON', 'o', '#44aa44');
        }
        entities.push({ x: cx - 1, y: cy + 1, type: 'apprentice', difficulty: floorNum + 1 });
        break;

      case 'dark':
        // Cells and torture
        this._placeFurniture(tiles, cx - 3, cy - 2, 'CAGE', '#', '#444444');
        this._placeFurniture(tiles, cx + 3, cy - 2, 'CAGE', '#', '#444444');
        this._placeFurniture(tiles, cx, cy + 2, 'ALTAR', '\u2534', '#880000');
        entities.push({ x: cx, y: cy - 1, type: 'undead', difficulty: floorNum + 2 });
        break;

      case 'military':
      default:
        // Barracks
        for (let x = cx - 3; x <= cx + 3; x += 2) {
          this._placeFurniture(tiles, x, cy - 2, 'BED', '~', '#4444aa');
        }
        this._placeFurniture(tiles, cx - 3, cy + 2, 'WEAPON_RACK', '/', '#aaaaaa');
        this._placeFurniture(tiles, cx + 3, cy + 2, 'WEAPON_RACK', '/', '#aaaaaa');
        entities.push({ x: cx + 1, y: cy + 1, type: 'soldier', difficulty: floorNum + 1 });
        break;
    }
  }

  _placeFurniture(tiles, x, y, type, char, fg) {
    if (y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length && tiles[y][x].type === 'FLOOR') {
      tiles[y][x] = tile(type, char, fg, '#222222', false);
    }
  }
}

// ============================================================================
// RuinGenerator
// ============================================================================

export class RuinGenerator {

  generate(rng, originalType = 'settlement', damageLevel = 70) {
    // First, generate the base structure
    let baseTiles, width, height;

    if (originalType === 'settlement') {
      const settlement = new SettlementGenerator();
      const base = settlement.generate(rng, 'village', 40, 'deckplate');
      baseTiles = base.tiles;
      width = base.width;
      height = base.height;
    } else {
      // Building-based ruin
      width = 25;
      height = 20;
      const interior = new BuildingInterior();
      const base = interior.generate(rng, 'house', width, height);
      baseTiles = base.tiles;
    }

    // Apply destruction
    const damageFraction = damageLevel / 100;
    const wallRemoveChance = 0.4 + damageFraction * 0.4; // 40-80%

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = baseTiles[y][x];

        // Remove walls randomly
        if (t.type === 'WALL' && rng.chance(wallRemoveChance)) {
          baseTiles[y][x] = rng.chance(0.4)
            ? tile('RUBBLE', '\u2591', '#888877', '#222211', true)
            : tile('FLOOR', '.', '#777766', '#222211', true);
        }

        // Damage floors
        if (t.type === 'FLOOR' && rng.chance(damageFraction * 0.3)) {
          baseTiles[y][x] = rng.chance(0.3)
            ? tile('HOLE', ' ', '#000000', '#000000', false)
            : tile('RUBBLE', '\u2591', '#888877', '#222211', true);
        }

        // Remove doors
        if (t.type === 'DOOR' && rng.chance(damageFraction * 0.6)) {
          baseTiles[y][x] = tile('FLOOR', '.', '#777766', '#222211', true);
        }

        // Destroy furniture
        if (!t.walkable && t.type !== 'WALL' && t.type !== 'VOID' && t.type !== 'HOLE' && rng.chance(damageFraction * 0.5)) {
          baseTiles[y][x] = rng.chance(0.5)
            ? tile('RUBBLE', '\u2591', '#888877', '#222211', true)
            : tile('FLOOR', '.', '#777766', '#222211', true);
        }
      }
    }

    // Add overgrowth
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const t = baseTiles[y][x];

        if (t.walkable && t.type !== 'HOLE') {
          // Vines
          if (rng.chance(0.06 * damageFraction)) {
            baseTiles[y][x] = tile('VINE', '\u2240', '#44aa22', '#222211', true);
          }
          // Trees growing through floor
          if (rng.chance(0.02 * damageFraction)) {
            baseTiles[y][x] = tile('TREE', 't', '#228822', '#222211', false);
          }
        }

        // Moss on remaining walls
        if (t.type === 'WALL' && rng.chance(0.3 * damageFraction)) {
          baseTiles[y][x] = tile('MOSSY_WALL', '#', '#448844', '#112211', false);
        }
      }
    }

    // Place atmospheric light sources in ruins
    const lightCount = rng.nextInt(2, 5 + Math.floor(damageFraction * 4));
    for (let i = 0; i < lightCount; i++) {
      const lx = rng.nextInt(1, width - 2);
      const ly = rng.nextInt(1, height - 2);
      if (baseTiles[ly][lx].walkable && baseTiles[ly][lx].type !== 'HOLE') {
        const lightType = rng.random([
          { type: 'GLOWING_RUNE', char: '\u2726', fg: '#9955FF', bg: '#1a0033', name: 'glowing rune' },       // ✦
          { type: 'GLOWING_RUNE', char: '\u2606', fg: '#AA66FF', bg: '#1a0033', name: 'pulsing sigil' },       // ☆
          { type: 'ANCIENT_CRYSTAL', char: '\u25C6', fg: '#44FFEE', bg: '#002222', name: 'ancient crystal' },   // ◆
          { type: 'ANCIENT_CRYSTAL', char: '\u2666', fg: '#33EEFF', bg: '#001a22', name: 'humming crystal' },   // ♦
          { type: 'EMBER_PIT', char: '\u2237', fg: '#FF6622', bg: '#221100', name: 'smouldering embers' },      // ∷
          { type: 'EMBER_PIT', char: '\u2059', fg: '#FF4400', bg: '#220800', name: 'dying fire pit' },          // ⁙
          { type: 'BIOLUM_MOSS', char: '\u223C', fg: '#33FF88', bg: '#001a0d', name: 'bioluminescent moss' },   // ∼
        ]);
        baseTiles[ly][lx] = tile(lightType.type, lightType.char, lightType.fg, lightType.bg, true);
      }
    }

    // Place environmental storytelling
    const storyElements = [];
    const storyCount = rng.nextInt(3, 8);
    for (let i = 0; i < storyCount; i++) {
      const sx = rng.nextInt(1, width - 2);
      const sy = rng.nextInt(1, height - 2);
      if (baseTiles[sy][sx].walkable && baseTiles[sy][sx].type !== 'HOLE') {
        const element = rng.random([
          { type: 'BONES', char: '\u00a5', fg: '#ccccaa', name: 'scattered bones' },           // ¥
          { type: 'BROKEN_FURNITURE', char: '\u2234', fg: '#886644', name: 'broken furniture' }, // ∴
          { type: 'INSCRIPTION', char: '\u00a7', fg: '#aaaacc', name: 'faded inscription' },     // §
          { type: 'SKULL', char: '\u25CF', fg: '#CCCCAA', name: 'bleached skull' },              // ●
          { type: 'SHATTERED_CRYSTAL', char: '\u25C7', fg: '#88AABB', name: 'shattered crystal' }, // ◇
          { type: 'OLD_WEAPON', char: '\u2571', fg: '#887766', name: 'rusted weapon' },          // ╱
          { type: 'COBWEB', char: '\u224B', fg: '#777777', name: 'thick cobwebs' },              // ≋
        ]);
        baseTiles[sy][sx] = tile(element.type, element.char, element.fg, '#222211', true);
        storyElements.push({ x: sx, y: sy, type: element.type, name: element.name });
      }
    }

    // Ensure connectivity: flood fill from a walkable tile, connect isolated areas
    this._ensureConnectivity(rng, baseTiles, width, height);

    return { tiles: baseTiles, width, height, storyElements };
  }

  _ensureConnectivity(rng, tiles, width, height) {
    // Find first walkable tile
    let startX = -1, startY = -1;
    for (let y = 0; y < height && startX === -1; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].walkable) {
          startX = x;
          startY = y;
          break;
        }
      }
    }
    if (startX === -1) return;

    const mainRegion = floodFill(startX, startY, (fx, fy) => {
      if (fx < 0 || fy < 0 || fx >= width || fy >= height) return false;
      return tiles[fy][fx].walkable;
    }, width * height);

    const mainSet = new Set(mainRegion.map(p => `${p.x},${p.y}`));

    // Find isolated walkable tiles and connect them
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (tiles[y][x].walkable && !mainSet.has(`${x},${y}`)) {
          // Carve a path toward the main region
          const nearest = mainRegion.reduce((best, p) => {
            const d = distance(x, y, p.x, p.y);
            return d < best.d ? { x: p.x, y: p.y, d } : best;
          }, { x: startX, y: startY, d: Infinity });

          // Carve a straight line
          let cx = x, cy = y;
          let safety = 100;
          while ((cx !== nearest.x || cy !== nearest.y) && safety-- > 0) {
            if (cx < nearest.x) cx++;
            else if (cx > nearest.x) cx--;
            if (cy < nearest.y) cy++;
            else if (cy > nearest.y) cy--;
            if (cx >= 0 && cy >= 0 && cx < width && cy < height && !tiles[cy][cx].walkable) {
              tiles[cy][cx] = tile('RUBBLE', '\u2591', '#888877', '#222211', true);
            }
            mainSet.add(`${cx},${cy}`);
          }
        }
      }
    }
  }
}

// ============================================================================
// CorridorGenerator — Long meandering inter-habitat engineering corridors
// Single entrance (habitat side) + airlock (opposite side), connected by
// a long horizontal path with sub-rooms branching off
// ============================================================================

export class CorridorGenerator {

  generate(rng, sectionId, entranceIndex, isWestWall, isSpecialAccess = false) {
    const width = 300;
    const height = 20;

    // Fill with hull walls
    const tiles = makeTileGrid(width, height, () =>
      tile('WALL', '#', '#334455', '#0A0A12', false)
    );

    // Entrance on one side, airlock on the other
    // Entering through habitat's west wall → entrance on east (right), airlock on west (left)
    const entranceSide = isWestWall ? 'east' : 'west';
    const airlockSide = isWestWall ? 'west' : 'east';

    // ── Layered cross-section: pipes → wall → shades → panels → walkway ──
    const corridorCenterY = Math.floor(height / 2); // row 10
    // Fixed pathY for backward compat with helper methods
    const pathY = new Array(width).fill(corridorCenterY);

    // Paint the layered structure across the full corridor width
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const edgeDist = Math.min(y, height - 1 - y); // distance from nearest top/bottom edge

        if (edgeDist <= 1) {
          // Pipe conduit runs (rows 0-1 top, 18-19 bottom)
          tiles[y][x] = this._pipeConduitTile(x, y, edgeDist);
        } else if (edgeDist === 2) {
          // Solid wall █ (rows 2, 17)
          tiles[y][x] = tile('CORRIDOR_WALL', '█', '#334455', '#020205', false, { biome: 'engineering' });
        } else if (edgeDist === 3) {
          // Dark shade ▓ (rows 3, 16)
          tiles[y][x] = tile('CORRIDOR_DARK_SHADE', '▓', '#2A3A4A', '#020206', false, { biome: 'engineering' });
        } else if (edgeDist === 4) {
          // Medium shade ▒ (rows 4, 15)
          tiles[y][x] = tile('CORRIDOR_MED_SHADE', '▒', '#223344', '#010104', false, { biome: 'engineering' });
        } else if (edgeDist === 5) {
          // Panel/grating ◘ (rows 5, 14)
          tiles[y][x] = tile('CORRIDOR_PANEL', '◘', '#1A2A3A', '#010104', false, { biome: 'engineering' });
        } else {
          // Open walkway ◙ (rows 6-13)
          tiles[y][x] = this._hullFloorTile(x, y);
        }
      }
    }

    // ── Branch sub-rooms off the walkway into the wall layers ──
    const ROOM_TYPES = ['cargo', 'maintenance', 'operations'];
    const rooms = [];
    let nextRoomX = rng.nextInt(20, 35);
    while (nextRoomX < width - 20) {
      const roomW = rng.nextInt(6, 10);
      const roomH = rng.nextInt(3, 5); // smaller rooms to fit in wall zone
      const above = rng.chance(0.5);
      // Rooms sit in the wall/pipe zone (rows 0-5 above, rows 14-19 below)
      const roomY = above ? Math.max(0, 5 - roomH) : 14;

      if (nextRoomX + roomW < width - 2) {
        const roomType = ROOM_TYPES[rooms.length % ROOM_TYPES.length];
        const room = { x: nextRoomX, y: roomY, w: roomW, h: roomH, roomType };
        rooms.push(room);

        // Carve room interior
        for (let ry = roomY; ry < roomY + roomH; ry++) {
          for (let rx = nextRoomX; rx < nextRoomX + roomW; rx++) {
            if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
              tiles[ry][rx] = this._hullFloorTile(rx, ry);
            }
          }
        }

        // Carve doorway through wall layers connecting room to walkway
        const doorX = nextRoomX + Math.floor(roomW / 2);
        const connStart = above ? roomY + roomH : corridorCenterY + 4; // walkway edge
        const connEnd = above ? 6 : roomY; // walkway row 6 (top) or room start
        const doorTiles = [];
        for (let ddx = -1; ddx <= 1; ddx++) {
          const dx = doorX + ddx;
          if (dx < 0 || dx >= width) continue;
          for (let y = Math.min(connStart, connEnd); y <= Math.max(connStart, connEnd); y++) {
            if (y >= 0 && y < height) {
              tiles[y][dx] = this._hullFloorTile(dx, y);
              doorTiles.push({ x: dx, y });
            }
          }
        }
        room.doorTiles = doorTiles;

        // Fill room with boxes/crates and conduits
        this._decorateSubRoom(rng, tiles, room, width, height);

        // Restore doorway tiles in case decorations overwrote them
        for (const dt of room.doorTiles) {
          if (!tiles[dt.y][dt.x].walkable) {
            tiles[dt.y][dt.x] = this._hullFloorTile(dt.x, dt.y);
          }
        }
      }

      nextRoomX += rng.nextInt(25, 40);
    }

    // ── Place conduits along corridor walls ──
    this._addWallConduits(rng, tiles, pathY, width, height);

    // ── Place entrance door ──
    const entranceX = entranceSide === 'west' ? 0 : width - 1;
    const entranceY = pathY[entranceSide === 'west' ? 1 : width - 2];
    const entranceType = entranceSide === 'west' ? 'ENGINEERING_ENTRANCE_W' : 'ENGINEERING_ENTRANCE_E';
    const entranceChar = entranceSide === 'west' ? '◄' : '►';
    tiles[entranceY][entranceX] = tile(entranceType, entranceChar, '#FFDD44', '#221100', true,
      { biome: 'engineering', engineeringDoor: true, doorSide: entranceSide, isEntrance: true, entranceIndex: 0 });
    const entrances = [{ x: entranceX, y: entranceY, index: 0 }];

    // ── Place airlock door ──
    const airlockX = airlockSide === 'west' ? 0 : width - 1;
    const airlockY = pathY[airlockSide === 'west' ? 1 : width - 2];
    const airlockType = airlockSide === 'west' ? 'ENGINEERING_AIRLOCK_W' : 'ENGINEERING_AIRLOCK_E';
    const airlockChar = airlockSide === 'west' ? '◄' : '►';
    tiles[airlockY][airlockX] = tile(airlockType, airlockChar, '#FF6644', '#221100', true,
      { biome: 'engineering', engineeringDoor: true, doorSide: airlockSide, isEntrance: false });
    const airlock = { x: airlockX, y: airlockY };

    // ── Place interactive elements ──
    this._placeTerminals(rng, tiles, pathY, width, height);
    this._placeLightSwitch(rng, tiles, pathY, width, height, entranceSide);

    // ── Add flickering lights and damage ──
    this._addFlickeringLights(rng, tiles, width, height);
    this._addDamagedSections(rng, tiles, width, height);

    // Resolve wall characters to box-drawing
    this._resolveWallChars(tiles, width, height);

    return { tiles, width, height, rooms, corridors: [], entrances, airlock, sectionId, isWestWall, isSpecialAccess, lightsOn: true };
  }

  // Generate a full crossing: Corridor A + Umbilical + Corridor B
  generateFullCorridor(rngA, rngB, sectionId, entranceIndex, isWestWall, isSpecialAccess, adjSectionId, adjIsWestWall, adjIsSpecialAccess) {
    // Generate both corridors
    const corridorA = this.generate(rngA, sectionId, entranceIndex, isWestWall, isSpecialAccess);
    const corridorB = this.generate(rngB, adjSectionId, 0, adjIsWestWall, adjIsSpecialAccess);

    // Generate umbilical
    const umbilicalWidth = 140;
    const umbilicalHeight = corridorA.height; // same height for stitching

    // Determine connection Y positions
    const aAirlockY = corridorA.airlock.y;
    const bAirlockY = corridorB.airlock.y;
    const umbilicalY = Math.floor((aAirlockY + bAirlockY) / 2);

    const umbilical = this._generateUmbilical(umbilicalWidth, umbilicalHeight, umbilicalY);

    // Stitch together: corridorA + umbilical + corridorB (flipped)
    const totalWidth = corridorA.width + umbilicalWidth + corridorB.width;
    const totalHeight = corridorA.height;

    const combined = makeTileGrid(totalWidth, totalHeight, () =>
      tile('WALL', '#', '#334455', '#0A0A12', false)
    );

    // Determine layout direction based on which side airlocks are on
    // corridorA: airlock is on airlockSide. corridorB: airlock is also on its side.
    // We need to arrange them so they connect through the umbilical.
    // corridorA airlock side → umbilical → corridorB airlock side

    const aGoesLeft = corridorA.airlock.x === 0; // corridorA's airlock is on left
    let offsetA, offsetUmb, offsetB;

    if (aGoesLeft) {
      // corridorA airlock on left → corridorB on left, so: corridorB | umbilical | corridorA
      offsetB = 0;
      offsetUmb = corridorB.width;
      offsetA = corridorB.width + umbilicalWidth;
    } else {
      // corridorA airlock on right → corridorA | umbilical | corridorB
      offsetA = 0;
      offsetUmb = corridorA.width;
      offsetB = corridorA.width + umbilicalWidth;
    }

    // Copy corridorA tiles
    for (let y = 0; y < corridorA.height; y++) {
      for (let x = 0; x < corridorA.width; x++) {
        combined[y][offsetA + x] = corridorA.tiles[y][x];
      }
    }

    // Copy umbilical tiles
    for (let y = 0; y < umbilicalHeight; y++) {
      for (let x = 0; x < umbilicalWidth; x++) {
        combined[y][offsetUmb + x] = umbilical.tiles[y][x];
      }
    }

    // Copy corridorB tiles
    for (let y = 0; y < corridorB.height; y++) {
      for (let x = 0; x < corridorB.width; x++) {
        combined[y][offsetB + x] = corridorB.tiles[y][x];
      }
    }

    // Connect corridorA airlock to umbilical entrance
    // Carve connecting path between corridorA airlock Y and umbilical center Y
    const umbLeftX = offsetUmb;
    const umbRightX = offsetUmb + umbilicalWidth - 1;

    if (aGoesLeft) {
      // corridorB right edge → umbilical left edge
      this._carveConnection(combined, offsetB + corridorB.width - 1, bAirlockY, umbLeftX, umbilicalY, totalWidth, totalHeight);
      // umbilical right edge → corridorA left edge
      this._carveConnection(combined, umbRightX, umbilicalY, offsetA, aAirlockY, totalWidth, totalHeight);
    } else {
      // corridorA right edge → umbilical left edge
      this._carveConnection(combined, offsetA + corridorA.width - 1, aAirlockY, umbLeftX, umbilicalY, totalWidth, totalHeight);
      // umbilical right edge → corridorB left edge
      this._carveConnection(combined, umbRightX, umbilicalY, offsetB, bAirlockY, totalWidth, totalHeight);
    }

    // Update entrance/airlock positions to combined coordinates
    const entranceA = {
      x: offsetA + corridorA.entrances[0].x,
      y: corridorA.entrances[0].y,
      index: 0,
      isSourceEntrance: true,
      sectionId: sectionId,
      entranceIndex: entranceIndex,
      isWestWall: isWestWall,
      isSpecialAccess: isSpecialAccess
    };

    const entranceB = {
      x: offsetB + corridorB.entrances[0].x,
      y: corridorB.entrances[0].y,
      index: 1,
      isSourceEntrance: false,
      sectionId: adjSectionId,
      entranceIndex: 0,
      isWestWall: adjIsWestWall,
      isSpecialAccess: adjIsSpecialAccess
    };

    // Mark the far entrance door tile with destination info
    const farDoorTile = combined[entranceB.y][entranceB.x];
    farDoorTile.isDestEntrance = true;
    farDoorTile.destSectionId = adjSectionId;
    farDoorTile.destIsWestWall = adjIsWestWall;
    farDoorTile.destIsSpecialAccess = adjIsSpecialAccess;

    return {
      tiles: combined,
      width: totalWidth,
      height: totalHeight,
      rooms: [],
      corridors: [],
      entrances: [entranceA, entranceB],
      airlock: { x: offsetA + corridorA.airlock.x, y: corridorA.airlock.y },
      sectionId,
      isWestWall,
      isSpecialAccess,
      lightsOn: true,
      sourceEntrance: entranceA,
      destEntrance: entranceB,
    };
  }

  _generateUmbilical(width, height, centerY) {
    // Clamp centerY so 13-tile structure fits within grid
    centerY = Math.max(6, Math.min(height - 7, centerY));

    // Fill with void — the umbilical floats in empty space
    const tiles = makeTileGrid(width, height, () =>
      tile('UMBILICAL_VOID', ' ', '#0A0A18', '#000000', false,
        { biome: 'engineering' })
    );

    // Distribute viewport windows evenly across the umbilical length
    // Each viewport is 2 tiles wide, with ~7 tile spacing between them
    const viewportStarts = [];
    const vpSpacing = Math.floor((width - 6) / Math.floor(width / 8));
    for (let vx = 3; vx + 1 < width - 3; vx += vpSpacing) {
      viewportStarts.push(vx);
    }

    // Layer definitions: [dy offset, row type]
    const layers = [
      [-6, 'hull'], [-5, 'rail'], [-4, 'rail'], [-3, 'rail'],
      [-2, 'frame'],
      [-1, 'walk'], [0, 'walk'], [1, 'walk'],
      [2, 'frame'],
      [3, 'rail'], [4, 'rail'], [5, 'rail'], [6, 'hull']
    ];

    for (let x = 0; x < width; x++) {
      const isBulkhead = x < 3 || x >= width - 3;
      const isViewportCol = viewportStarts.some(vs => x === vs || x === vs + 1);
      const isRib = x % 8 === 0 && !isBulkhead;

      for (const [dy, rowType] of layers) {
        const y = centerY + dy;
        if (y < 0 || y >= height) continue;

        if (isBulkhead) {
          tiles[y][x] = tile('WALL', '▓', '#445566', '#0A0A12', false,
            { biome: 'engineering' });
          continue;
        }

        const absDy = Math.abs(dy);

        switch (rowType) {
          case 'hull': {
            if (isRib) {
              tiles[y][x] = tile('UMBILICAL_OUTER_HULL', '║', '#2A3A50', '#060810', false,
                { biome: 'engineering' });
            } else {
              tiles[y][x] = tile('UMBILICAL_OUTER_HULL', '▓', '#1A2540', '#060810', false,
                { biome: 'engineering' });
            }
            break;
          }
          case 'rail': {
            if (isRib) {
              tiles[y][x] = tile('UMBILICAL_RAIL', '╬', '#3A4A5A', '#080C14', false,
                { biome: 'engineering' });
            } else if (absDy === 4) {
              tiles[y][x] = tile('UMBILICAL_RAIL', '═', '#2A3A4A', '#080C14', false,
                { biome: 'engineering' });
            } else {
              tiles[y][x] = tile('UMBILICAL_RAIL', '─', '#222E3A', '#080C14', false,
                { biome: 'engineering' });
            }
            break;
          }
          case 'frame': {
            if (isViewportCol) {
              tiles[y][x] = tile('UMBILICAL_VIEWPORT_GLASS', '█', '#CCDDFF', '#8899BB', false,
                { biome: 'engineering' });
            } else if (isRib) {
              tiles[y][x] = tile('UMBILICAL_FRAME', '║', '#5A6A7A', '#0A0E18', false,
                { biome: 'engineering' });
            } else {
              tiles[y][x] = tile('UMBILICAL_FRAME', '▒', '#4A5A6A', '#0A0E18', false,
                { biome: 'engineering' });
            }
            break;
          }
          case 'walk': {
            if (dy === 0 && isRib) {
              tiles[y][x] = tile('UMBILICAL_RIB', '┼', '#3A5A6A', '#050A10', true,
                { biome: 'engineering' });
            } else if (dy === 0 && isViewportCol) {
              // Subtle light spill from viewport above
              tiles[y][x] = tile('UMBILICAL_FLOOR', '·', '#3A5A6A', '#0A1018', true,
                { biome: 'engineering' });
            } else {
              tiles[y][x] = tile('UMBILICAL_FLOOR', '·', '#2A4A5A', '#050A10', true,
                { biome: 'engineering' });
            }
            break;
          }
        }
      }
    }

    return { tiles, width, height };
  }

  _carveConnection(tiles, x1, y1, x2, y2, totalWidth, totalHeight) {
    // Wider carve (4 tiles each side of center) to match the 8-row walkway
    const halfWidth = 3;

    // Straight horizontal if Y matches
    if (y1 === y2) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (x >= 0 && x < totalWidth) {
          for (let dy = -halfWidth; dy <= halfWidth; dy++) {
            const y = y1 + dy;
            if (y >= 1 && y < totalHeight - 1) {
              tiles[y][x] = this._hullFloorTile(x, y);
            }
          }
        }
      }
      return;
    }

    // Smooth diagonal transition
    const dx = x2 > x1 ? 1 : -1;
    const yDiff = y2 - y1;
    const yDir = yDiff > 0 ? 1 : -1;
    const absYDiff = Math.abs(yDiff);
    let curY = y1;

    for (let x = x1; x !== x2 + dx; x += dx) {
      if (x < 0 || x >= totalWidth) continue;
      if (curY !== y2) {
        const xRemaining = Math.abs(x2 - x);
        const stepsNeeded = Math.abs(curY - y2);
        if (stepsNeeded > 0 && xRemaining <= stepsNeeded + 2) {
          curY += yDir;
        }
      }
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const y = curY + dy;
        if (y >= 1 && y < totalHeight - 1) {
          tiles[y][x] = this._hullFloorTile(x, y);
        }
      }
    }
  }

  _pipeConduitTile(x, y, bandRow) {
    // 4-phase repeating pipe pattern along X axis
    const phase = ((x % 4) + 4) % 4;
    const jointPeriod = 10;
    const jointPos = ((x % jointPeriod) + jointPeriod) % jointPeriod;

    let ch, fg;
    if (phase === 0 || phase === 2) {
      // Straight runs with vertical junction pairs
      if (jointPos === 0 || jointPos === 1) {
        ch = '║'; fg = '#4A6A8A';
      } else {
        ch = '═'; fg = '#3A5A7A';
      }
    } else {
      // Bend/junction rows
      if (jointPos === 0) {
        ch = (phase === 1) ? '╝' : '╗'; fg = '#4A6A8A';
      } else if (jointPos === 1) {
        ch = '║'; fg = '#4A6A8A';
      } else if (jointPos === jointPeriod - 1) {
        ch = (phase === 1) ? '╔' : '╚'; fg = '#4A6A8A';
      } else {
        ch = '═'; fg = '#3A5A7A';
      }
    }

    return tile('CORRIDOR_PIPE', ch, fg, '#020208', false, { biome: 'engineering' });
  }

  _hullFloorTile(x, y) {
    const hash = ((x * 2654435761) ^ (y * 2246822519)) >>> 0;
    const v = (hash % 100) / 100;

    if (v < 0.04) {
      return tile('HULL_VALVE', '⊕', '#445566', '#040410', true, { biome: 'engineering' });
    }
    if (v < 0.08) {
      const conduits = ['─', '│', '┌', '┐', '└', '┘'];
      return tile('HULL_CONDUIT', conduits[hash % conduits.length], '#2A3A4A', '#040410', true, { biome: 'engineering' });
    }
    if (v < 0.12) {
      return tile('HULL_GRATING', '░', '#2A3A4A', '#040410', true, { biome: 'engineering' });
    }
    if ((x + y) % 8 === 0) {
      return tile('HULL_CATWALK_LINE', '┼', '#445566', '#040410', true, { biome: 'engineering' });
    }
    if (x % 4 === 0) {
      return tile('HULL_CATWALK_LINE', '│', '#3A4A5A', '#040410', true, { biome: 'engineering' });
    }
    if (y % 4 === 0) {
      return tile('HULL_CATWALK_LINE', '─', '#3A4A5A', '#040410', true, { biome: 'engineering' });
    }
    return tile('HULL_CATWALK', '·', '#2A3A4A', '#040410', true, { biome: 'engineering' });
  }

  _decorateSubRoom(rng, tiles, room, width, height) {
    const roomType = room.roomType || 'cargo';

    // Collect wall-adjacent interior positions (1 tile inside each wall)
    const wallPositions = [];
    for (let rx = room.x + 1; rx < room.x + room.w - 1; rx++) {
      wallPositions.push({ x: rx, y: room.y });             // top wall
      wallPositions.push({ x: rx, y: room.y + room.h - 1 }); // bottom wall
    }
    for (let ry = room.y + 1; ry < room.y + room.h - 1; ry++) {
      wallPositions.push({ x: room.x, y: ry });              // left wall
      wallPositions.push({ x: room.x + room.w - 1, y: ry }); // right wall
    }

    // Shuffle wall positions
    for (let i = wallPositions.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i);
      [wallPositions[i], wallPositions[j]] = [wallPositions[j], wallPositions[i]];
    }

    // Determine decoration count and items based on room type
    const itemCount = rng.nextInt(4, Math.max(6, Math.floor(room.w * room.h / 4)));
    let placed = 0;

    if (roomType === 'cargo') {
      // Cargo: containers along walls + some mid-room stacks
      for (const pos of wallPositions) {
        if (placed >= itemCount) break;
        if (pos.x >= 1 && pos.x < width - 1 && pos.y >= 1 && pos.y < height - 1 && tiles[pos.y][pos.x].walkable) {
          const r = rng.next();
          if (r < 0.4) {
            tiles[pos.y][pos.x] = tile('HULL_MACHINERY', '▓', '#887766', '#040410', false, { biome: 'engineering' });
          } else if (r < 0.7) {
            tiles[pos.y][pos.x] = tile('HULL_MACHINERY', '■', '#665544', '#040410', false, { biome: 'engineering' });
          } else {
            tiles[pos.y][pos.x] = tile('HULL_MACHINERY', '□', '#778888', '#040410', false, { biome: 'engineering' });
          }
          placed++;
        }
      }
      // A few mid-room cargo containers
      for (let i = 0; i < 2 && placed < itemCount; i++) {
        const mx = rng.nextInt(room.x + 2, room.x + room.w - 3);
        const my = rng.nextInt(room.y + 2, room.y + room.h - 3);
        if (mx >= 1 && mx < width - 1 && my >= 1 && my < height - 1 && tiles[my][mx].walkable) {
          tiles[my][mx] = tile('HULL_MACHINERY', '▓', '#776655', '#040410', false, { biome: 'engineering' });
          placed++;
        }
      }
    } else if (roomType === 'maintenance') {
      // Maintenance: pipes, valves, conduits along walls, workbench
      for (const pos of wallPositions) {
        if (placed >= itemCount) break;
        if (pos.x >= 1 && pos.x < width - 1 && pos.y >= 1 && pos.y < height - 1 && tiles[pos.y][pos.x].walkable) {
          const r = rng.next();
          if (r < 0.3) {
            tiles[pos.y][pos.x] = tile('HULL_PIPE', '║', '#4A5A6A', '#040410', false, { biome: 'engineering' });
          } else if (r < 0.5) {
            tiles[pos.y][pos.x] = tile('HULL_VALVE', '⊕', '#5A6A7A', '#040410', false, { biome: 'engineering' });
          } else if (r < 0.7) {
            tiles[pos.y][pos.x] = tile('HULL_CONDUIT', '┐', '#3A5A5A', '#040410', false, { biome: 'engineering' });
          } else if (r < 0.85) {
            tiles[pos.y][pos.x] = tile('HULL_PIPE', '═', '#4A5A6A', '#040410', false, { biome: 'engineering' });
          } else {
            tiles[pos.y][pos.x] = tile('HULL_MACHINERY', '▬', '#6A7A8A', '#040410', false, { biome: 'engineering' });
          }
          placed++;
        }
      }
    } else if (roomType === 'operations') {
      // Operations: consoles and screens along back wall (wall furthest from door)
      // Sort wall positions to prefer the wall furthest from corridor
      const doorY = room.doorTiles ? room.doorTiles[0].y : room.y;
      const backWallY = Math.abs(room.y - doorY) > Math.abs(room.y + room.h - 1 - doorY)
        ? room.y : room.y + room.h - 1;
      // Place consoles along back wall first
      const backPositions = wallPositions.filter(p => p.y === backWallY);
      const otherPositions = wallPositions.filter(p => p.y !== backWallY);

      for (const pos of backPositions) {
        if (placed >= itemCount) break;
        if (pos.x >= 1 && pos.x < width - 1 && pos.y >= 1 && pos.y < height - 1 && tiles[pos.y][pos.x].walkable) {
          const r = rng.next();
          if (r < 0.5) {
            tiles[pos.y][pos.x] = tile('HULL_MACHINERY', '▣', '#44CCCC', '#040410', false, { biome: 'engineering' });
          } else {
            tiles[pos.y][pos.x] = tile('HULL_MACHINERY', '▪', '#44CC88', '#040410', false, { biome: 'engineering' });
          }
          placed++;
        }
      }
      // Fill remaining walls with secondary equipment
      for (const pos of otherPositions) {
        if (placed >= itemCount) break;
        if (pos.x >= 1 && pos.x < width - 1 && pos.y >= 1 && pos.y < height - 1 && tiles[pos.y][pos.x].walkable) {
          const r = rng.next();
          if (r < 0.4) {
            tiles[pos.y][pos.x] = tile('HULL_MACHINERY', '□', '#556677', '#040410', false, { biome: 'engineering' });
          } else {
            tiles[pos.y][pos.x] = tile('HULL_CONDUIT', '─', '#3A5A5A', '#040410', false, { biome: 'engineering' });
          }
          placed++;
        }
      }
    }
  }

  _addWallConduits(rng, tiles, pathY, width, height) {
    // Layered walls already provide visual structure — add subtle conduit details on panel rows
    for (let x = 5; x < width - 5; x += rng.nextInt(4, 8)) {
      if (rng.chance(0.4)) {
        // Top panel row (row 5)
        if (tiles[5][x].type === 'CORRIDOR_PANEL') {
          tiles[5][x] = tile('CORRIDOR_PANEL', '◙', '#2A3A4A', '#010104', false, { biome: 'engineering' });
        }
      }
      if (rng.chance(0.4)) {
        // Bottom panel row (row 14)
        if (tiles[14][x].type === 'CORRIDOR_PANEL') {
          tiles[14][x] = tile('CORRIDOR_PANEL', '◙', '#2A3A4A', '#010104', false, { biome: 'engineering' });
        }
      }
    }
  }

  _placeTerminals(rng, tiles, pathY, width, height) {
    // Place 3-5 interactive terminals on the panel rows (row 5 top, row 14 bottom)
    const termCount = rng.nextInt(3, 5);
    const spacing = Math.floor(width / (termCount + 1));
    for (let i = 0; i < termCount; i++) {
      const tx = spacing * (i + 1) + rng.nextInt(-5, 5);
      if (tx < 3 || tx >= width - 3) continue;
      const above = rng.chance(0.5);
      const ty = above ? 5 : 14; // panel rows
      if (!tiles[ty][tx].walkable && !tiles[ty][tx].engineeringDoor) {
        tiles[ty][tx] = tile('ENG_TERMINAL', '▣', '#44CCCC', '#040410', false,
          { biome: 'engineering', interactive: true, terminalId: i });
      }
    }
  }

  _placeLightSwitch(rng, tiles, pathY, width, height, entranceSide) {
    // Place 1 light switch near the entrance on a panel row
    const switchX = entranceSide === 'west' ? rng.nextInt(5, 15) : width - rng.nextInt(5, 15);
    const above = rng.chance(0.5);
    const sy = above ? 5 : 14; // panel rows
    tiles[sy][switchX] = tile('ENG_LIGHT_SWITCH', '◘', '#FFDD44', '#040410', false,
      { biome: 'engineering', interactive: true, lightSwitch: true });
  }

  _addFlickeringLights(rng, tiles, width, height) {
    const lightCount = rng.nextInt(20, 40);
    for (let i = 0; i < lightCount; i++) {
      const lx = rng.nextInt(2, width - 3);
      const ly = rng.nextInt(2, height - 3);
      if (tiles[ly][lx].walkable && !tiles[ly][lx].engineeringDoor) {
        tiles[ly][lx] = tile('ENG_LIGHT', '◦', '#FFCC66', '#0A0A12', true,
          { biome: 'engineering', lightSource: 'pulse' });
      }
    }
  }

  _addDamagedSections(rng, tiles, width, height) {
    const damagePatches = rng.nextInt(4, 10);
    for (let p = 0; p < damagePatches; p++) {
      const cx = rng.nextInt(10, width - 11);
      const cy = rng.nextInt(3, height - 4);
      const radius = rng.nextInt(2, 4);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx < 1 || tx >= width - 1 || ty < 1 || ty >= height - 1) continue;
          if (dx * dx + dy * dy > radius * radius) continue;
          if (!tiles[ty][tx].walkable || tiles[ty][tx].engineeringDoor) continue;
          if (rng.chance(0.4)) {
            tiles[ty][tx] = tile('ENG_DAMAGED_FLOOR', '%', '#3A2A1A', '#040408', true,
              { biome: 'engineering' });
          } else if (rng.chance(0.2)) {
            tiles[ty][tx] = tile('ENG_SPARKING', '*', '#FFAA00', '#1A0A00', true,
              { biome: 'engineering', lightSource: 'pulse' });
          }
        }
      }
    }
  }

  _resolveWallChars(tiles, width, height) {
    const chars = [
      '○', '║', '═', '╚', '║', '║', '╔', '╠',
      '═', '╝', '═', '╩', '╗', '╣', '╦', '╬',
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].type !== 'WALL') continue;
        const isWall = (nx, ny) => {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
          return !tiles[ny][nx].walkable;
        };
        let mask = 0;
        if (isWall(x, y - 1)) mask |= 1;
        if (isWall(x + 1, y)) mask |= 2;
        if (isWall(x, y + 1)) mask |= 4;
        if (isWall(x - 1, y)) mask |= 8;
        tiles[y][x] = tile('WALL', chars[mask], '#445566', '#0A0A12', false, { biome: 'engineering' });
      }
    }

    // Depth shading pass — walls near walkable floors get edge highlighting
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].type !== 'WALL') continue;
        // Check Manhattan distance to nearest walkable tile (max 3)
        let minDist = 4;
        for (let dy = -2; dy <= 2 && minDist > 1; dy++) {
          for (let dx = -2; dx <= 2 && minDist > 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width && tiles[ny][nx].walkable) {
              minDist = Math.min(minDist, Math.abs(dx) + Math.abs(dy));
            }
          }
        }
        if (minDist === 1) {
          tiles[y][x].fg = '#667788'; // bright edge highlight
          tiles[y][x].bg = '#141422';
        } else if (minDist === 2) {
          tiles[y][x].fg = '#556677'; // medium depth
          tiles[y][x].bg = '#101018';
        }
        // minDist >= 3: keep default dark
      }
    }
  }
}
