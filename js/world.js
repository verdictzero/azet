// ============================================================================
// world.js — World generation for ASCIIQUEST, a colony salvage roguelike
// ============================================================================

import { SeededRNG, PerlinNoise, CellularNoise, AStar, distance, floodFill } from './utils.js';

// ============================================================================
// Tile definition helpers
// ============================================================================

function tile(type, char, fg, bg, walkable, extra) {
  return { type, char, fg, bg, walkable, ...extra };
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
    // Simplified terrain: grass, trees, mountains, water (rivers/lakes)

    // ── WATER (h < 0.3) — forms rivers and lakes ──
    if (h < 0.18) return tile('OCEAN', '\u223D', '#0044AA', '#000055', false, { biome: 'ocean' });
    if (h < 0.27) return tile('SHALLOWS', '~', '#4488ff', '#000066', false, { biome: 'lake' });
    if (h < 0.3) return tile('SHALLOWS', '~', '#4488ff', '#000066', true, { biome: 'lake' });

    // ── GRASSLAND (h 0.3 - 0.55) ──
    if (h < 0.55) return tile('GRASSLAND', '.', '#44cc44', '#112211', true, { biome: 'grassland' });

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
    const minDist = 6;

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
          if (t.type === 'SHALLOWS' || t.type === 'OCEAN' || t.type === 'MOUNTAIN' || t.type === 'MOUNTAIN_BASE') continue;

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
      const path = this._findOverworldPath(tiles, from.x, from.y, to.x, to.y, width, height);
      if (path) {
        roads.push({ from: from.id, to: to.id, path });
        for (const p of path) {
          const t = tiles[p.y][p.x];
          if (t.type === 'GRASSLAND' || t.type === 'FOREST' || t.type === 'DEEP_FOREST') {
            tiles[p.y][p.x] = tile('ROAD', '=', '#aa8844', '#332211', true, { biome: t.biome });
          } else if (t.type === 'SHALLOWS') {
            tiles[p.y][p.x] = tile('BRIDGE', '=', '#aa6622', '#000066', true, { biome: t.biome });
          }
        }
      }
    }

    return roads;
  }

  _findOverworldPath(tiles, sx, sy, ex, ey, width, height) {
    const isWalkable = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const t = tiles[y][x];
      // Allow shallows for bridges, but discourage it; block deep lakes and high peaks
      if (t.type === 'OCEAN' || t.type === 'MOUNTAIN') return false;
      return true;
    };
    return AStar.findPath(sx, sy, ex, ey, isWalkable, 5000);
  }

  _getLocation(locations, x, y) {
    for (const loc of locations) {
      if (loc.x === x && loc.y === y) return loc;
    }
    return null;
  }
}

// ============================================================================
// ChunkManager — Infinite chunk-based overworld
// ============================================================================

const CHUNK_SIZE = 32;
const TERRAIN_SCALE = 0.02;

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
  constructor(seed) {
    this.seed = seed;
    const initRng = new SeededRNG(seed);
    this.heightNoise = new PerlinNoise(initRng);
    this.moistureNoise = new PerlinNoise(initRng);
    this.anomalyNoise = new PerlinNoise(initRng);
    this.detailNoise = new PerlinNoise(initRng);
    this.temperatureNoise = new PerlinNoise(initRng);
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

  _chunkRng(cx, cy) {
    const h = (this.seed ^ (cx * 73856093) ^ (cy * 19349663)) >>> 0;
    return new SeededRNG(h);
  }

  _generateTile(wx, wy) {
    const h = (this.heightNoise.fbm(wx * TERRAIN_SCALE, wy * TERRAIN_SCALE, 6) + 1) / 2;
    const m = (this.moistureNoise.fbm(wx * TERRAIN_SCALE + 100, wy * TERRAIN_SCALE + 100, 5) + 1) / 2;
    const a = (this.anomalyNoise.fbm(wx * TERRAIN_SCALE * 0.5, wy * TERRAIN_SCALE * 0.5, 4) + 1) / 2;
    const d = (this.detailNoise.fbm(wx * TERRAIN_SCALE * 2, wy * TERRAIN_SCALE * 2, 3) + 1) / 2;
    // Very low-frequency temperature noise for massive contiguous hot/cold regions
    const t = (this.temperatureNoise.fbm(wx * TERRAIN_SCALE * 0.1 + 200, wy * TERRAIN_SCALE * 0.1 + 200, 3) + 1) / 2;
    return this._terrainGen._terrainFromNoise(h, m, a, d, t);
  }

  // ── Megalithic surface structure definitions ──
  _structureDefs() {
    return [
      {
        type: 'signal_obelisk', w: 3, h: 5, biomes: null, // any biome
        build(tiles, sx, sy) {
          // Tall pillar with beacon
          for (let dy = 0; dy < 5; dy++) tiles[sy + dy][sx + 1] = tile('OBELISK', '|', '#6688AA', '#111122', false, { structure: true });
          tiles[sy][sx + 1] = tile('OBELISK_TOP', '*', '#44FFFF', '#111122', false, { structure: true });
          tiles[sy + 4][sx] = tile('OBELISK_BASE', '[', '#556677', '#111122', false, { structure: true });
          tiles[sy + 4][sx + 2] = tile('OBELISK_BASE', ']', '#556677', '#111122', false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 1, y: oy + sy, radius: 8, r: 0, g: 0.8, b: 1, intensity: 0.9 }];
        },
      },
      {
        type: 'reactor_monolith', w: 5, h: 5, biomes: ['reactor_slag'],
        build(tiles, sx, sy) {
          for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) {
            if (dx === 0 || dx === 4 || dy === 0 || dy === 4)
              tiles[sy + dy][sx + dx] = tile('REACTOR_WALL', '#', '#AA4400', '#331100', false, { structure: true });
            else
              tiles[sy + dy][sx + dx] = tile('REACTOR_CORE', '~', '#FF8822', '#441100', false, { structure: true });
          }
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 2, y: oy + sy + 2, radius: 12, r: 1, g: 0.4, b: 0, intensity: 1.0 }];
        },
      },
      {
        type: 'alien_spire', w: 4, h: 7, biomes: ['alien_crash', 'crystal_zone'],
        build(tiles, sx, sy) {
          for (let dy = 0; dy < 7; dy++) {
            tiles[sy + dy][sx + 1] = tile('ALIEN_PILLAR', '|', '#CC44FF', '#220033', false, { structure: true });
            tiles[sy + dy][sx + 2] = tile('ALIEN_PILLAR', '|', '#CC44FF', '#220033', false, { structure: true });
          }
          tiles[sy][sx + 1] = tile('ALIEN_NODE', '*', '#FF88FF', '#220033', false, { structure: true });
          tiles[sy][sx + 2] = tile('ALIEN_NODE', '*', '#FF88FF', '#220033', false, { structure: true });
          tiles[sy + 3][sx] = tile('ALIEN_NODE', '*', '#DD66FF', '#220033', false, { structure: true });
          tiles[sy + 3][sx + 3] = tile('ALIEN_NODE', '*', '#DD66FF', '#220033', false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [
            { x: ox + sx + 1, y: oy + sy, radius: 10, r: 0.8, g: 0, b: 1, intensity: 0.85 },
            { x: ox + sx + 1, y: oy + sy + 3, radius: 6, r: 0.6, g: 0, b: 0.8, intensity: 0.5 },
          ];
        },
      },
      {
        type: 'cryo_pylon', w: 3, h: 3, biomes: ['frozen_deck'],
        build(tiles, sx, sy) {
          tiles[sy][sx] = tile('CRYO_HOUSING', '[', '#6688AA', '#112233', false, { structure: true });
          tiles[sy][sx + 2] = tile('CRYO_HOUSING', ']', '#6688AA', '#112233', false, { structure: true });
          tiles[sy][sx + 1] = tile('CRYO_EMITTER', '*', '#88DDFF', '#112233', false, { structure: true });
          tiles[sy + 1][sx] = tile('CRYO_HOUSING', '[', '#6688AA', '#112233', false, { structure: true });
          tiles[sy + 1][sx + 2] = tile('CRYO_HOUSING', ']', '#6688AA', '#112233', false, { structure: true });
          tiles[sy + 2][sx + 1] = tile('CRYO_BASE', '=', '#556688', '#112233', false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 1, y: oy + sy, radius: 6, r: 0.3, g: 0.6, b: 1, intensity: 0.7 }];
        },
      },
      {
        type: 'data_shrine', w: 4, h: 4, biomes: ['glitch_zone'],
        build(tiles, sx, sy) {
          for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
            if (dx === 0 || dx === 3 || dy === 0 || dy === 3)
              tiles[sy + dy][sx + dx] = tile('DATA_FRAME', '#', '#FF4488', '#110011', false, { structure: true });
            else
              tiles[sy + dy][sx + dx] = tile('DATA_CORE', '?', '#FF0088', '#220011', false, { structure: true });
          }
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 2, y: oy + sy + 2, radius: 6, r: 1, g: 0, b: 0.5, intensity: 0.8 }];
        },
      },
      {
        type: 'void_gate', w: 5, h: 3, biomes: ['void_rift'],
        build(tiles, sx, sy) {
          tiles[sy][sx] = tile('VOID_ARCH', '(', '#6644AA', '#000011', false, { structure: true });
          tiles[sy][sx + 4] = tile('VOID_ARCH', ')', '#6644AA', '#000011', false, { structure: true });
          tiles[sy + 1][sx] = tile('VOID_ARCH', '(', '#6644AA', '#000011', false, { structure: true });
          tiles[sy + 1][sx + 4] = tile('VOID_ARCH', ')', '#6644AA', '#000011', false, { structure: true });
          tiles[sy + 2][sx + 1] = tile('VOID_BASE', '=', '#443366', '#000011', false, { structure: true });
          tiles[sy + 2][sx + 3] = tile('VOID_BASE', '=', '#443366', '#000011', false, { structure: true });
          // Void center
          for (let dx = 1; dx <= 3; dx++) {
            tiles[sy][sx + dx] = tile('VOID_CENTER', ' ', '#110022', '#000000', false, { structure: true });
            tiles[sy + 1][sx + dx] = tile('VOID_CENTER', ' ', '#110022', '#000000', false, { structure: true });
          }
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 2, y: oy + sy + 1, radius: 10, r: 0.4, g: 0, b: 0.8, intensity: 0.9 }];
        },
      },
      // ── Mechanical mega-structures ──
      {
        type: 'collapsed_manufactory', w: 10, h: 8, biomes: null, mega: true,
        entrance: { dx: 5, dy: 7 }, locationType: 'mechanical_ruin', difficulty: 5,
        build(tiles, sx, sy) {
          const bg = '#1A1008';
          // Smokestacks (columns 1-2 and 7-8)
          for (let dy = 0; dy < 6; dy++) {
            tiles[sy + dy][sx + 1] = tile('MANUFACTORY_STACK', '\u2551', '#AA7744', bg, false, { structure: true });
            tiles[sy + dy][sx + 2] = tile('MANUFACTORY_STACK', '\u2551', '#AA7744', bg, false, { structure: true });
            tiles[sy + dy][sx + 7] = tile('MANUFACTORY_STACK', '\u2551', '#AA7744', bg, false, { structure: true });
            tiles[sy + dy][sx + 8] = tile('MANUFACTORY_STACK', '\u2551', '#AA7744', bg, false, { structure: true });
          }
          // Stack tops
          tiles[sy][sx + 1] = tile('MANUFACTORY_STACK_TOP', '\u2593', '#CC8844', bg, false, { structure: true });
          tiles[sy][sx + 2] = tile('MANUFACTORY_STACK_TOP', '\u2593', '#CC8844', bg, false, { structure: true });
          tiles[sy][sx + 7] = tile('MANUFACTORY_STACK_TOP', '\u2593', '#CC8844', bg, false, { structure: true });
          tiles[sy][sx + 8] = tile('MANUFACTORY_STACK_TOP', '\u2593', '#CC8844', bg, false, { structure: true });
          // Walls
          for (let dy = 1; dy < 7; dy++) {
            tiles[sy + dy][sx] = tile('MANUFACTORY_WALL', '[', '#886644', bg, false, { structure: true });
            tiles[sy + dy][sx + 9] = tile('MANUFACTORY_WALL', ']', '#886644', bg, false, { structure: true });
          }
          // Roof beam
          for (let dx = 3; dx <= 6; dx++) tiles[sy + 1][sx + dx] = tile('MANUFACTORY_CONVEYOR', '\u2550', '#887766', bg, false, { structure: true });
          // Gear housings
          tiles[sy + 2][sx + 3] = tile('MANUFACTORY_GEAR', '\u2699', '#CCAA44', bg, false, { structure: true });
          tiles[sy + 2][sx + 6] = tile('MANUFACTORY_GEAR', '\u2699', '#CCAA44', bg, false, { structure: true });
          tiles[sy + 5][sx + 3] = tile('MANUFACTORY_GEAR', '\u2699', '#CCAA44', bg, false, { structure: true });
          tiles[sy + 5][sx + 6] = tile('MANUFACTORY_GEAR', '\u2699', '#CCAA44', bg, false, { structure: true });
          // Conveyor lines
          for (let dx = 3; dx <= 6; dx++) {
            tiles[sy + 3][sx + dx] = tile('MANUFACTORY_CONVEYOR', '\u2550', '#887766', bg, false, { structure: true });
            tiles[sy + 6][sx + dx] = tile('MANUFACTORY_CONVEYOR', '\u2550', '#887766', bg, false, { structure: true });
          }
          // Furnace cores
          for (let dx = 4; dx <= 5; dx++) {
            tiles[sy + 4][sx + dx] = tile('MANUFACTORY_FURNACE', '\u25CA', '#FF6622', '#331100', false, { structure: true });
          }
          // Interior floor
          for (let dx = 3; dx <= 6; dx++) {
            for (const dy of [2, 4, 5]) {
              if (tiles[sy + dy][sx + dx].type.startsWith('MANUFACTORY_')) continue;
              tiles[sy + dy][sx + dx] = tile('MANUFACTORY_FLOOR', '.', '#665544', bg, true, { structure: true });
            }
          }
          // Base / entrance
          for (let dx = 0; dx <= 9; dx++) tiles[sy + 7][sx + dx] = tile('MANUFACTORY_CONVEYOR', '\u2550', '#887766', bg, false, { structure: true });
          tiles[sy + 7][sx + 4] = tile('MANUFACTORY_FLOOR', '\u25A3', '#CCAA44', bg, true, { structure: true });
          tiles[sy + 7][sx + 5] = tile('MANUFACTORY_FLOOR', '\u25A3', '#CCAA44', bg, true, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [
            { x: ox + sx + 4, y: oy + sy + 4, radius: 6, r: 1, g: 0.4, b: 0, intensity: 0.8 },
            { x: ox + sx + 5, y: oy + sy + 4, radius: 6, r: 1, g: 0.4, b: 0, intensity: 0.8 },
            { x: ox + sx + 5, y: oy + sy + 4, radius: 10, r: 0.8, g: 0.5, b: 0.1, intensity: 0.5 },
          ];
        },
      },
      {
        type: 'bore_engine', w: 8, h: 10, biomes: ['reactor_slag', 'hull_breach'], mega: true,
        entrance: { dx: 4, dy: 9 }, locationType: 'mechanical_ruin', difficulty: 6,
        build(tiles, sx, sy) {
          const bg = '#0A0A11';
          // Drill heads
          tiles[sy][sx + 3] = tile('BORE_DRILL', '\u25BC', '#AABBCC', bg, false, { structure: true });
          tiles[sy][sx + 4] = tile('BORE_DRILL', '\u25BC', '#AABBCC', bg, false, { structure: true });
          // Drill housing
          tiles[sy + 1][sx + 2] = tile('BORE_HOUSING', '[', '#889999', bg, false, { structure: true });
          tiles[sy + 1][sx + 3] = tile('BORE_CROSSBRACE', '\u256C', '#889999', bg, false, { structure: true });
          tiles[sy + 1][sx + 4] = tile('BORE_CROSSBRACE', '\u256C', '#889999', bg, false, { structure: true });
          tiles[sy + 1][sx + 5] = tile('BORE_HOUSING', ']', '#889999', bg, false, { structure: true });
          // Shaft
          for (let dy = 2; dy <= 3; dy++) {
            tiles[sy + dy][sx + 2] = tile('BORE_HOUSING', '[', '#889999', bg, false, { structure: true });
            tiles[sy + dy][sx + 3] = tile('BORE_SHAFT', '\u2551', '#778888', bg, false, { structure: true });
            tiles[sy + dy][sx + 4] = tile('BORE_SHAFT', '\u2551', '#778888', bg, false, { structure: true });
            tiles[sy + dy][sx + 5] = tile('BORE_HOUSING', ']', '#889999', bg, false, { structure: true });
          }
          // Cross-brace platform
          for (let dx = 0; dx <= 7; dx++) tiles[sy + 4][sx + dx] = tile('BORE_PLATFORM', '\u2550', '#778888', bg, false, { structure: true });
          tiles[sy + 4][sx + 3] = tile('BORE_CROSSBRACE', '\u256C', '#889999', bg, false, { structure: true });
          tiles[sy + 4][sx + 4] = tile('BORE_CROSSBRACE', '\u256C', '#889999', bg, false, { structure: true });
          // Gear assembly
          tiles[sy + 5][sx + 1] = tile('BORE_HOUSING', '[', '#889999', bg, false, { structure: true });
          tiles[sy + 5][sx + 2] = tile('BORE_GEAR', '\u2699', '#CCAA44', bg, false, { structure: true });
          tiles[sy + 5][sx + 5] = tile('BORE_GEAR', '\u2699', '#CCAA44', bg, false, { structure: true });
          tiles[sy + 5][sx + 6] = tile('BORE_HOUSING', ']', '#889999', bg, false, { structure: true });
          // Support columns
          tiles[sy + 6][sx + 1] = tile('BORE_HOUSING', '[', '#889999', bg, false, { structure: true });
          tiles[sy + 6][sx + 3] = tile('BORE_SHAFT', '\u2551', '#778888', bg, false, { structure: true });
          tiles[sy + 6][sx + 4] = tile('BORE_SHAFT', '\u2551', '#778888', bg, false, { structure: true });
          tiles[sy + 6][sx + 6] = tile('BORE_HOUSING', ']', '#889999', bg, false, { structure: true });
          // Base platform
          for (let dx = 0; dx <= 7; dx++) tiles[sy + 7][sx + dx] = tile('BORE_PLATFORM', '\u2550', '#778888', bg, false, { structure: true });
          // Exhaust vents
          for (let dx = 3; dx <= 5; dx++) tiles[sy + 8][sx + dx] = tile('BORE_EXHAUST', '\u2593', '#AA6633', '#221100', false, { structure: true });
          // Slag pool
          for (let dx = 3; dx <= 5; dx++) tiles[sy + 9][sx + dx] = tile('BORE_SLAG', '~', '#FF4400', '#331100', false, { structure: true });
          // Entrance
          tiles[sy + 9][sx + 4] = tile('BORE_SLAG', '\u25A3', '#CCAA44', '#331100', true, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [
            { x: ox + sx + 3, y: oy + sy, radius: 8, r: 0.5, g: 0.7, b: 1, intensity: 0.85 },
            { x: ox + sx + 4, y: oy + sy + 9, radius: 6, r: 1, g: 0.3, b: 0, intensity: 0.9 },
          ];
        },
      },
      {
        type: 'clockwork_citadel', w: 12, h: 10, biomes: null, mega: true,
        entrance: { dx: 5, dy: 9 }, locationType: 'mechanical_ruin', difficulty: 7,
        build(tiles, sx, sy) {
          const bg = '#0F0D0A';
          // Corner turrets
          for (const [tx, ty] of [[0, 0], [11, 0], [0, 9], [11, 9]]) {
            tiles[sy + ty][sx + tx] = tile('CLOCKWORK_TURRET', '\u25B2', '#99AABB', bg, false, { structure: true });
          }
          // Tower columns at corners
          for (let dy = 1; dy <= 8; dy++) {
            tiles[sy + dy][sx + 0] = tile('CLOCKWORK_TOWER', '\u2551', '#99AABB', bg, false, { structure: true });
            tiles[sy + dy][sx + 11] = tile('CLOCKWORK_TOWER', '\u2551', '#99AABB', bg, false, { structure: true });
          }
          // Gear-wall facade (top and bottom)
          for (let dx = 2; dx <= 9; dx++) {
            tiles[sy + 1][sx + dx] = tile('CLOCKWORK_GEAR', '\u2699', '#CCAA44', bg, false, { structure: true });
            tiles[sy + 8][sx + dx] = tile('CLOCKWORK_GEAR', '\u2699', '#CCAA44', bg, false, { structure: true });
          }
          // Inner walls
          for (let dy = 2; dy <= 7; dy++) {
            tiles[sy + dy][sx + 2] = tile('CLOCKWORK_WALL', '#', '#887766', bg, false, { structure: true });
            tiles[sy + dy][sx + 9] = tile('CLOCKWORK_WALL', '#', '#887766', bg, false, { structure: true });
          }
          for (let dx = 3; dx <= 8; dx++) {
            tiles[sy + 2][sx + dx] = tile('CLOCKWORK_WALL', '#', '#887766', bg, false, { structure: true });
            tiles[sy + 7][sx + dx] = tile('CLOCKWORK_WALL', '#', '#887766', bg, false, { structure: true });
          }
          // Side platforms
          for (const dy of [4, 5]) {
            tiles[sy + dy][sx + 1] = tile('CLOCKWORK_PLATFORM', '\u2550', '#887766', bg, false, { structure: true });
            tiles[sy + dy][sx + 10] = tile('CLOCKWORK_PLATFORM', '\u2550', '#887766', bg, false, { structure: true });
          }
          // Flywheel cores (center)
          for (let dy = 4; dy <= 5; dy++) {
            tiles[sy + dy][sx + 5] = tile('CLOCKWORK_FLYWHEEL', '\u2295', '#FFCC44', '#221100', false, { structure: true });
            tiles[sy + dy][sx + 6] = tile('CLOCKWORK_FLYWHEEL', '\u2295', '#FFCC44', '#221100', false, { structure: true });
          }
          // Interior floor
          for (let dy = 3; dy <= 6; dy++) {
            for (let dx = 3; dx <= 8; dx++) {
              if (tiles[sy + dy][sx + dx].type.startsWith('CLOCKWORK_')) continue;
              tiles[sy + dy][sx + dx] = tile('CLOCKWORK_FLOOR', '.', '#665544', bg, true, { structure: true });
            }
          }
          // Base / gate entrance
          for (let dx = 1; dx <= 10; dx++) tiles[sy + 9][sx + dx] = tile('CLOCKWORK_PLATFORM', '\u2550', '#887766', bg, false, { structure: true });
          tiles[sy + 9][sx + 5] = tile('CLOCKWORK_GATE', '\u25A3', '#FFCC44', bg, true, { structure: true });
          tiles[sy + 9][sx + 6] = tile('CLOCKWORK_GATE', '\u25A3', '#FFCC44', bg, true, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [
            { x: ox + sx + 0, y: oy + sy, radius: 8, r: 0.6, g: 0.7, b: 1, intensity: 0.7 },
            { x: ox + sx + 11, y: oy + sy, radius: 8, r: 0.6, g: 0.7, b: 1, intensity: 0.7 },
            { x: ox + sx + 5, y: oy + sy + 4, radius: 6, r: 1, g: 0.8, b: 0.2, intensity: 0.9 },
            { x: ox + sx + 6, y: oy + sy + 5, radius: 6, r: 1, g: 0.8, b: 0.2, intensity: 0.9 },
          ];
        },
      },
      {
        type: 'pipeline_junction', w: 10, h: 8, biomes: ['hull_breach', 'reactor_slag', 'nano_plague'], mega: true,
        entrance: { dx: 5, dy: 4 }, locationType: 'mechanical_ruin', difficulty: 5,
        build(tiles, sx, sy) {
          const bg = '#0A0A11';
          // Top pipes
          for (let dx = 0; dx <= 2; dx++) tiles[sy][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
          tiles[sy][sx + 3] = tile('PIPE_JUNCTION', '\u2557', '#778899', bg, false, { structure: true });
          tiles[sy][sx + 6] = tile('PIPE_JUNCTION', '\u2554', '#778899', bg, false, { structure: true });
          for (let dx = 7; dx <= 9; dx++) tiles[sy][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
          // Vertical pipes
          for (let dy = 1; dy <= 6; dy++) {
            tiles[sy + dy][sx + 3] = tile('PIPE_VERTICAL', '\u2551', '#778899', bg, false, { structure: true });
            tiles[sy + dy][sx + 6] = tile('PIPE_VERTICAL', '\u2551', '#778899', bg, false, { structure: true });
          }
          // Cross junctions
          tiles[sy + 2][sx + 3] = tile('PIPE_JUNCTION', '\u2560', '#778899', bg, false, { structure: true });
          tiles[sy + 2][sx + 6] = tile('PIPE_JUNCTION', '\u2563', '#778899', bg, false, { structure: true });
          tiles[sy + 5][sx + 3] = tile('PIPE_JUNCTION', '\u2560', '#778899', bg, false, { structure: true });
          tiles[sy + 5][sx + 6] = tile('PIPE_JUNCTION', '\u2563', '#778899', bg, false, { structure: true });
          // Horizontal cross pipes
          for (let dx = 4; dx <= 5; dx++) {
            tiles[sy + 2][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
            tiles[sy + 5][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
          }
          // Side pipes
          for (let dx = 0; dx <= 2; dx++) {
            tiles[sy + 3][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
            tiles[sy + 4][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
          }
          tiles[sy + 3][sx + 3] = tile('PIPE_JUNCTION', '\u2563', '#778899', bg, false, { structure: true });
          tiles[sy + 4][sx + 3] = tile('PIPE_JUNCTION', '\u2563', '#778899', bg, false, { structure: true });
          for (let dx = 7; dx <= 9; dx++) {
            tiles[sy + 3][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
            tiles[sy + 4][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
          }
          tiles[sy + 3][sx + 6] = tile('PIPE_JUNCTION', '\u2560', '#778899', bg, false, { structure: true });
          tiles[sy + 4][sx + 6] = tile('PIPE_JUNCTION', '\u2560', '#778899', bg, false, { structure: true });
          // Central valves
          tiles[sy + 3][sx + 4] = tile('PIPE_VALVE', '\u25C9', '#FF4444', '#110000', false, { structure: true });
          tiles[sy + 3][sx + 5] = tile('PIPE_VALVE', '\u25C9', '#FF4444', '#110000', false, { structure: true });
          tiles[sy + 4][sx + 4] = tile('PIPE_VALVE', '\u25C9', '#FF4444', '#110000', false, { structure: true });
          tiles[sy + 4][sx + 5] = tile('PIPE_VALVE', '\u25C9', '#FF4444', '#110000', true, { structure: true });
          // Bottom pipes
          tiles[sy + 7][sx + 3] = tile('PIPE_JUNCTION', '\u255A', '#778899', bg, false, { structure: true });
          tiles[sy + 7][sx + 6] = tile('PIPE_JUNCTION', '\u255D', '#778899', bg, false, { structure: true });
          for (let dx = 0; dx <= 2; dx++) tiles[sy + 7][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
          for (let dx = 7; dx <= 9; dx++) tiles[sy + 7][sx + dx] = tile('PIPE_HORIZONTAL', '\u2550', '#778899', bg, false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [
            { x: ox + sx + 5, y: oy + sy + 3, radius: 8, r: 1, g: 0.2, b: 0.1, intensity: 0.85 },
            { x: ox + sx + 4, y: oy + sy + 4, radius: 4, r: 0.1, g: 0.8, b: 0.2, intensity: 0.6 },
          ];
        },
      },
      {
        type: 'turbine_array', w: 12, h: 6, biomes: ['hull_breach', 'frozen_deck'], mega: true,
        entrance: { dx: 6, dy: 5 }, locationType: 'mechanical_ruin', difficulty: 5,
        build(tiles, sx, sy) {
          const bg = '#0A0A11';
          // 4 turbines at columns 1, 4, 7, 10
          const turbineCols = [1, 4, 7, 10];
          for (const tc of turbineCols) {
            // Blade tip
            tiles[sy][sx + tc] = tile('TURBINE_BLADE', '*', '#BBDDFF', bg, false, { structure: true });
            // Nacelle with brackets
            tiles[sy + 1][sx + tc - 1] = tile('TURBINE_BRACKET', '[', '#667788', bg, false, { structure: true });
            tiles[sy + 1][sx + tc] = tile('TURBINE_NACELLE', '\u25CE', '#EEDDAA', bg, false, { structure: true });
            tiles[sy + 1][sx + tc + 1] = tile('TURBINE_BRACKET', ']', '#667788', bg, false, { structure: true });
            // Tower shaft
            tiles[sy + 2][sx + tc] = tile('TURBINE_TOWER', '\u2551', '#667788', bg, false, { structure: true });
            tiles[sy + 3][sx + tc] = tile('TURBINE_TOWER', '\u2551', '#667788', bg, false, { structure: true });
            // Base housing with brackets
            tiles[sy + 4][sx + tc - 1] = tile('TURBINE_BRACKET', '[', '#667788', bg, false, { structure: true });
            tiles[sy + 4][sx + tc] = tile('TURBINE_HOUSING', '\u256C', '#778899', bg, false, { structure: true });
            tiles[sy + 4][sx + tc + 1] = tile('TURBINE_BRACKET', ']', '#667788', bg, false, { structure: true });
          }
          // Foundation
          for (let dx = 0; dx < 12; dx++) tiles[sy + 5][sx + dx] = tile('TURBINE_PLATFORM', '\u2550', '#555566', bg, false, { structure: true });
          // Entrance
          tiles[sy + 5][sx + 6] = tile('TURBINE_PLATFORM', '\u25A3', '#CCAA44', bg, true, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [1, 4, 7, 10].map(tc => ({
            x: ox + sx + tc, y: oy + sy + 1, radius: 5, r: 0.8, g: 0.85, b: 1, intensity: 0.4,
          }));
        },
      },
      {
        type: 'crane_yard', w: 10, h: 10, biomes: ['hull_breach', 'reactor_slag'], mega: true,
        entrance: { dx: 5, dy: 9 }, locationType: 'mechanical_ruin', difficulty: 6,
        build(tiles, sx, sy) {
          const bg = '#0A0A11';
          // Crane boom (top)
          tiles[sy][sx + 2] = tile('CRANE_BOOM', '\u2564', '#BBAA44', bg, false, { structure: true });
          for (let dx = 3; dx <= 7; dx++) tiles[sy][sx + dx] = tile('CRANE_BOOM', '\u2550', '#BBAA44', bg, false, { structure: true });
          tiles[sy][sx + 8] = tile('CRANE_BOOM', '\u2564', '#BBAA44', bg, false, { structure: true });
          // Vertical supports
          for (let dy = 1; dy <= 5; dy++) {
            tiles[sy + dy][sx + 2] = tile('CRANE_SUPPORT', '\u2551', '#778888', bg, false, { structure: true });
            tiles[sy + dy][sx + 8] = tile('CRANE_SUPPORT', '\u2551', '#778888', bg, false, { structure: true });
          }
          // Hook / cable
          tiles[sy + 2][sx + 5] = tile('CRANE_HOOK', '\u2193', '#BBAA44', bg, false, { structure: true });
          tiles[sy + 3][sx + 5] = tile('CRANE_HOOK', '\u2193', '#BBAA44', bg, false, { structure: true });
          // Cross beam
          tiles[sy + 4][sx + 2] = tile('CRANE_CROSSBEAM', '\u256C', '#889988', bg, false, { structure: true });
          for (let dx = 3; dx <= 7; dx++) tiles[sy + 4][sx + dx] = tile('CRANE_CROSSBEAM', '\u2550', '#889988', bg, false, { structure: true });
          tiles[sy + 4][sx + 8] = tile('CRANE_CROSSBEAM', '\u256C', '#889988', bg, false, { structure: true });
          // Base frame
          tiles[sy + 6][sx + 0] = tile('CRANE_FRAME', '[', '#778888', bg, false, { structure: true });
          for (let dx = 1; dx <= 2; dx++) tiles[sy + 6][sx + dx] = tile('CRANE_CROSSBEAM', '\u2550', '#889988', bg, false, { structure: true });
          tiles[sy + 6][sx + 3] = tile('CRANE_CROSSBEAM', '\u256C', '#889988', bg, false, { structure: true });
          tiles[sy + 6][sx + 7] = tile('CRANE_CROSSBEAM', '\u256C', '#889988', bg, false, { structure: true });
          for (let dx = 8; dx <= 8; dx++) tiles[sy + 6][sx + dx] = tile('CRANE_CROSSBEAM', '\u2550', '#889988', bg, false, { structure: true });
          tiles[sy + 6][sx + 9] = tile('CRANE_FRAME', ']', '#778888', bg, false, { structure: true });
          // Machinery
          tiles[sy + 7][sx + 0] = tile('CRANE_FRAME', '[', '#778888', bg, false, { structure: true });
          tiles[sy + 7][sx + 2] = tile('CRANE_MACHINERY', '\u2593', '#AA6633', '#221100', false, { structure: true });
          tiles[sy + 7][sx + 3] = tile('CRANE_MACHINERY', '\u2593', '#AA6633', '#221100', false, { structure: true });
          tiles[sy + 7][sx + 7] = tile('CRANE_MACHINERY', '\u2593', '#AA6633', '#221100', false, { structure: true });
          tiles[sy + 7][sx + 8] = tile('CRANE_MACHINERY', '\u2593', '#AA6633', '#221100', false, { structure: true });
          tiles[sy + 7][sx + 9] = tile('CRANE_FRAME', ']', '#778888', bg, false, { structure: true });
          // Basin
          tiles[sy + 8][sx + 0] = tile('CRANE_FRAME', '[', '#778888', bg, false, { structure: true });
          for (let dx = 3; dx <= 7; dx++) tiles[sy + 8][sx + dx] = tile('CRANE_BASIN', '\u2248', '#224466', '#001122', false, { structure: true });
          tiles[sy + 8][sx + 9] = tile('CRANE_FRAME', ']', '#778888', bg, false, { structure: true });
          // Dock floor
          for (let dx = 0; dx <= 9; dx++) tiles[sy + 9][sx + dx] = tile('CRANE_PLATFORM', '\u2550', '#555566', bg, false, { structure: true });
          // Entrance
          tiles[sy + 9][sx + 5] = tile('CRANE_PLATFORM', '\u25A3', '#CCAA44', bg, true, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [
            { x: ox + sx + 5, y: oy + sy + 2, radius: 6, r: 0.9, g: 0.9, b: 1, intensity: 0.7 },
            { x: ox + sx + 5, y: oy + sy + 7, radius: 5, r: 1, g: 0.5, b: 0.1, intensity: 0.7 },
          ];
        },
      },
      // ── Temperature-biome structures ──
      {
        type: 'collapsed_habitat_dome', w: 8, h: 6, biomes: ['tundra', 'permafrost', 'desert', 'scorched_waste'],
        build(tiles, sx, sy) {
          const bg = '#0A0A10';
          // Dome outline
          for (let dx = 2; dx <= 5; dx++) tiles[sy][sx + dx] = tile('DOME_ARC', '\u2500', '#889999', bg, false, { structure: true });
          tiles[sy + 1][sx + 1] = tile('DOME_ARC', '/', '#889999', bg, false, { structure: true });
          tiles[sy + 1][sx + 6] = tile('DOME_ARC', '\\', '#889999', bg, false, { structure: true });
          for (let dy = 2; dy <= 4; dy++) {
            tiles[sy + dy][sx] = tile('DOME_WALL', '|', '#778888', bg, false, { structure: true });
            tiles[sy + dy][sx + 7] = tile('DOME_WALL', '|', '#778888', bg, false, { structure: true });
          }
          // Dome interior (rubble)
          for (let dy = 2; dy <= 4; dy++) for (let dx = 1; dx <= 6; dx++) {
            const r = Math.random();
            if (r < 0.3) tiles[sy + dy][sx + dx] = tile('DOME_RUBBLE', '.', '#556666', bg, true, { structure: true });
            else tiles[sy + dy][sx + dx] = tile('DOME_FLOOR', ',', '#445555', bg, true, { structure: true });
          }
          // Base
          for (let dx = 0; dx <= 7; dx++) tiles[sy + 5][sx + dx] = tile('DOME_BASE', '=', '#667777', bg, false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 4, y: oy + sy + 3, radius: 7, r: 0.5, g: 0.7, b: 0.9, intensity: 0.6 }];
        },
      },
      {
        type: 'frozen_transport', w: 6, h: 3, biomes: ['tundra', 'permafrost', 'frozen_deck'],
        build(tiles, sx, sy) {
          const bg = '#0A1520';
          tiles[sy][sx + 1] = tile('TRANSPORT_CAB', '[', '#6688AA', bg, false, { structure: true });
          tiles[sy][sx + 2] = tile('TRANSPORT_CAB', '=', '#5577AA', bg, false, { structure: true });
          tiles[sy][sx + 3] = tile('TRANSPORT_CAB', '=', '#5577AA', bg, false, { structure: true });
          tiles[sy][sx + 4] = tile('TRANSPORT_CAB', ']', '#6688AA', bg, false, { structure: true });
          for (let dx = 0; dx <= 5; dx++) tiles[sy + 1][sx + dx] = tile('TRANSPORT_BODY', '#', '#4466AA', bg, false, { structure: true });
          tiles[sy + 2][sx + 1] = tile('TRANSPORT_WHEEL', 'o', '#334488', bg, false, { structure: true });
          tiles[sy + 2][sx + 4] = tile('TRANSPORT_WHEEL', 'o', '#334488', bg, false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 3, y: oy + sy + 1, radius: 4, r: 0.3, g: 0.5, b: 1, intensity: 0.4 }];
        },
      },
      {
        type: 'magma_drill', w: 5, h: 7, biomes: ['magma_fields', 'inferno_core', 'scorched_waste'],
        build(tiles, sx, sy) {
          const bg = '#2A0800';
          // Drill tower
          for (let dy = 0; dy < 5; dy++) {
            tiles[sy + dy][sx + 2] = tile('DRILL_SHAFT', '|', '#CC6622', bg, false, { structure: true });
          }
          tiles[sy][sx + 2] = tile('DRILL_TOP', '*', '#FF8844', bg, false, { structure: true });
          // Platform
          for (let dx = 0; dx <= 4; dx++) tiles[sy + 5][sx + dx] = tile('DRILL_PLATFORM', '=', '#AA5522', bg, false, { structure: true });
          // Lava pool
          for (let dx = 1; dx <= 3; dx++) tiles[sy + 6][sx + dx] = tile('DRILL_POOL', '~', '#FF4400', '#330000', false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 2, y: oy + sy + 6, radius: 10, r: 1, g: 0.3, b: 0, intensity: 0.9 }];
        },
      },
      {
        type: 'exposed_conduit_grid', w: 6, h: 6, biomes: ['structural_grid', 'void_exposure'],
        build(tiles, sx, sy) {
          const bg = '#060610';
          for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) {
            if (dy % 2 === 0 || dx % 2 === 0)
              tiles[sy + dy][sx + dx] = tile('CONDUIT', '+', '#556677', bg, false, { structure: true });
            else
              tiles[sy + dy][sx + dx] = tile('CONDUIT_GAP', '.', '#334455', bg, true, { structure: true });
          }
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 3, y: oy + sy + 3, radius: 5, r: 0.3, g: 0.4, b: 0.8, intensity: 0.5 }];
        },
      },
      {
        type: 'observation_deck', w: 7, h: 5, biomes: ['void_exposure'],
        build(tiles, sx, sy) {
          const bg = '#000005';
          // Viewport wall
          for (let dx = 0; dx <= 6; dx++) {
            tiles[sy][sx + dx] = tile('OBS_WALL', '=', '#556677', bg, false, { structure: true });
            tiles[sy + 4][sx + dx] = tile('OBS_WALL', '=', '#556677', bg, false, { structure: true });
          }
          for (let dy = 1; dy <= 3; dy++) {
            tiles[sy + dy][sx] = tile('OBS_WALL', '|', '#556677', bg, false, { structure: true });
            tiles[sy + dy][sx + 6] = tile('OBS_WALL', '|', '#556677', bg, false, { structure: true });
          }
          // Stars visible through viewport
          for (let dy = 1; dy <= 3; dy++) for (let dx = 1; dx <= 5; dx++) {
            if (Math.random() < 0.15) tiles[sy + dy][sx + dx] = tile('VIEWPORT_STAR', '*', '#FFFFFF', '#000000', false, { structure: true });
            else tiles[sy + dy][sx + dx] = tile('VIEWPORT', ' ', '#000000', '#000000', false, { structure: true });
          }
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 3, y: oy + sy + 2, radius: 4, r: 0.8, g: 0.8, b: 1, intensity: 0.3 }];
        },
      },
      {
        type: 'ruined_cooling_tower', w: 5, h: 6, biomes: null,
        build(tiles, sx, sy) {
          const bg = '#111111';
          for (let dy = 0; dy < 6; dy++) {
            tiles[sy + dy][sx] = tile('TOWER_WALL', '|', '#777777', bg, false, { structure: true });
            tiles[sy + dy][sx + 4] = tile('TOWER_WALL', '|', '#777777', bg, false, { structure: true });
          }
          for (let dx = 1; dx <= 3; dx++) {
            tiles[sy][sx + dx] = tile('TOWER_TOP', '=', '#888888', bg, false, { structure: true });
            tiles[sy + 5][sx + dx] = tile('TOWER_BASE', '=', '#666666', bg, false, { structure: true });
          }
          tiles[sy + 1][sx + 2] = tile('TOWER_VENT', '~', '#AABBCC', bg, false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 2, y: oy + sy + 1, radius: 5, r: 0.6, g: 0.6, b: 0.7, intensity: 0.5 }];
        },
      },
      {
        type: 'abandoned_checkpoint', w: 7, h: 3, biomes: null,
        build(tiles, sx, sy) {
          const bg = '#111108';
          // Fence/barriers
          for (let dx = 0; dx <= 6; dx++) {
            tiles[sy][sx + dx] = tile('CHECKPOINT_FENCE', '-', '#887744', bg, false, { structure: true });
            tiles[sy + 2][sx + dx] = tile('CHECKPOINT_FENCE', '-', '#887744', bg, false, { structure: true });
          }
          // Guard booth
          tiles[sy + 1][sx] = tile('CHECKPOINT_WALL', '[', '#776633', bg, false, { structure: true });
          tiles[sy + 1][sx + 1] = tile('CHECKPOINT_BOOTH', '#', '#665522', bg, false, { structure: true });
          tiles[sy + 1][sx + 2] = tile('CHECKPOINT_WALL', ']', '#776633', bg, false, { structure: true });
          // Gate opening
          tiles[sy + 1][sx + 3] = tile('CHECKPOINT_GATE', '.', '#554422', bg, true, { structure: true });
          tiles[sy + 1][sx + 4] = tile('CHECKPOINT_GATE', '.', '#554422', bg, true, { structure: true });
          // Barrier
          tiles[sy + 1][sx + 5] = tile('CHECKPOINT_BARRIER', '|', '#AA6633', bg, false, { structure: true });
          tiles[sy + 1][sx + 6] = tile('CHECKPOINT_BARRIER', '|', '#AA6633', bg, false, { structure: true });
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 3, y: oy + sy + 1, radius: 5, r: 0.8, g: 0.7, b: 0.3, intensity: 0.5 }];
        },
      },
    ];
  }

  _placeStructures(cx, cy, tiles) {
    const rng = this._chunkRng(cx, cy);
    // Use a separate roll so we don't disturb location placement RNG
    const structRng = new SeededRNG(rng.nextInt(0, 999999));

    if (structRng.next() > 0.15) return []; // 15% chance per chunk

    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;

    // Tally biomes in this chunk to weight structure selection
    const biomeCounts = {};
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const b = tiles[ly][lx].biome;
        if (b) biomeCounts[b] = (biomeCounts[b] || 0) + 1;
      }
    }

    const defs = this._structureDefs();
    // Filter to structures that fit this chunk's biomes
    const candidates = defs.filter(d => {
      if (!d.biomes) return true; // universal
      return d.biomes.some(b => (biomeCounts[b] || 0) > 10);
    });
    if (candidates.length === 0) return [];

    const def = structRng.random(candidates);
    const structures = [];

    // Try to place structure
    for (let attempt = 0; attempt < 40; attempt++) {
      const sx = structRng.nextInt(2, CHUNK_SIZE - def.w - 2);
      const sy = structRng.nextInt(2, CHUNK_SIZE - def.h - 2);

      // Check area is walkable
      let ok = true;
      for (let dy = 0; dy < def.h && ok; dy++) {
        for (let dx = 0; dx < def.w && ok; dx++) {
          const t = tiles[sy + dy][sx + dx];
          if (t.type === 'LOCATION' || t.structure) ok = false;
        }
      }
      if (!ok) continue;

      def.build(tiles, sx, sy);
      const lights = def.lights(sx, sy, ox, oy);
      structures.push({ type: def.type, x: ox + sx, y: oy + sy, w: def.w, h: def.h, lights });
      break;
    }

    // Mega-structure pass (rarer, larger mechanical features)
    if (structRng.next() < 0.05) {
      const megaDefs = this._structureDefs().filter(d => d.mega);
      const megaCandidates = megaDefs.filter(d => {
        if (!d.biomes) return true;
        return d.biomes.some(b => (biomeCounts[b] || 0) > 10);
      });
      if (megaCandidates.length > 0) {
        const megaDef = structRng.random(megaCandidates);
        for (let attempt = 0; attempt < 60; attempt++) {
          const msx = structRng.nextInt(2, CHUNK_SIZE - megaDef.w - 2);
          const msy = structRng.nextInt(2, CHUNK_SIZE - megaDef.h - 2);
          let ok = true;
          for (let dy = 0; dy < megaDef.h && ok; dy++) {
            for (let dx = 0; dx < megaDef.w && ok; dx++) {
              const t = tiles[msy + dy][msx + dx];
              if (t.type === 'LOCATION' || t.structure) ok = false;
            }
          }
          if (!ok) continue;

          megaDef.build(tiles, msx, msy);
          const megaLights = megaDef.lights(msx, msy, ox, oy);
          structures.push({ type: megaDef.type, x: ox + msx, y: oy + msy, w: megaDef.w, h: megaDef.h, lights: megaLights });

          // Register explorable location at entrance
          if (megaDef.entrance && megaDef.locationType) {
            const ex = msx + megaDef.entrance.dx;
            const ey = msy + megaDef.entrance.dy;
            const wx = ox + ex;
            const wy = oy + ey;
            const id = (cx + 50000) * 100000 + (cy + 50000) * 10 + 9;
            const loc = {
              id,
              name: this._generateName(structRng, megaDef.locationType),
              type: megaDef.locationType,
              x: wx, y: wy,
              population: 0,
              difficulty: megaDef.difficulty || 5,
            };
            this.locationMap.set(`${wx},${wy}`, loc);
            // Mark the entrance tile as a location
            tiles[ey][ex] = tile('LOCATION', '\u2699', '#FFCC44', '#221100', true,
              { biome: tiles[ey][ex]?.biome || 'mechanical', locationId: id, structure: true });
          }
          break;
        }
      }
    }

    return structures;
  }

  _generateChunk(cx, cy) {
    const key = this._chunkKey(cx, cy);
    if (this.chunks.has(key)) return this.chunks.get(key);

    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;
    const tiles = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      tiles[ly] = [];
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        tiles[ly][lx] = this._generateTile(ox + lx, oy + ly);
      }
    }

    // Apply historical map scars — overwrite terrain in scar zones
    this._applyMapScarsToChunk(cx, cy, tiles);

    // Remove small isolated non-walkable clusters (< 25 tiles) to prevent movement frustration
    this._removeSmallBlockers(tiles);

    const structures = this._placeStructures(cx, cy, tiles);
    const locations = this._placeChunkLocations(cx, cy, tiles);
    const chunk = { tiles, locations, structures, cx, cy };
    this.chunks.set(key, chunk);
    return chunk;
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
    // Water biomes are exempt — ponds and lakes are fine
    const WATER_TYPES = new Set(['OCEAN', 'SHALLOWS']);
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
        if (t.walkable || t.structure || t.locationId || WATER_TYPES.has(t.type)) {
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
            if (nt.walkable || nt.structure || nt.locationId || WATER_TYPES.has(nt.type)) {
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

  _placeChunkLocations(cx, cy, tiles) {
    const rng = this._chunkRng(cx, cy);
    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;

    // 0-2 locations per chunk
    const roll = rng.next();
    const count = roll < 0.45 ? 0 : roll < 0.82 ? 1 : 2;

    const locations = [];
    const minDist = 6;

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
        if (t.type === 'SHALLOWS' || t.type === 'OCEAN' || t.type === 'MOUNTAIN' || t.type === 'MOUNTAIN_BASE') continue;

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
    const cy = Math.floor(wy / CHUNK_SIZE);
    const chunk = this._generateChunk(cx, cy);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
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

  ensureChunksAround(wx, wy) {
    const pcx = Math.floor(wx / CHUNK_SIZE);
    const pcy = Math.floor(wy / CHUNK_SIZE);
    const radius = 2; // 5x5 ring

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const chunk = this._generateChunk(pcx + dx, pcy + dy);
        this.exploredChunks.add(this._chunkKey(pcx + dx, pcy + dy));
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
    const maxRoadDist = 40;
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
          if (t.type === 'GRASSLAND' || t.type === 'FOREST' || t.type === 'DEEP_FOREST') {
            chunk.tiles[ly][lx] = tile('ROAD', '=', '#aa8844', '#332211', true, { biome: t.biome });
          } else if (t.type === 'SHALLOWS') {
            chunk.tiles[ly][lx] = tile('BRIDGE', '=', '#aa6622', '#000066', true, { biome: t.biome });
          }
        }
      }
    }
  }

  _findPath(sx, sy, ex, ey) {
    const self = this;
    const isWalkable = (x, y) => {
      const t = self.getTile(x, y);
      if (t.type === 'OCEAN' || t.type === 'MOUNTAIN') return false;
      return true;
    };
    return AStar.findPath(sx, sy, ex, ey, isWalkable, 5000);
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
          // Add quarantine-themed tiles around edges
          for (let y = coreOffset.y; y < coreOffset.y + coreH; y++) {
            for (let x = coreOffset.x; x < coreOffset.x + coreW; x++) {
              if (tiles[y] && tiles[y][x] && rng.chance(0.05 * scar.severity)) {
                tiles[y][x] = tile('QUARANTINE', 'X', '#FF4444', '#220000', false, {
                  historicalScar: scar.description,
                });
              }
            }
          }
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
      town: { house: 6, tavern: 1, shop: 2, blacksmith: 1, temple: 1 },
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

    // Towns are just buildings and grass — no extra decorations
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

    // Anvil in center - better character
    const ax = Math.floor(w / 2);
    const ay = Math.floor(h / 2);
    this._place(tiles, ax, ay, 'ANVIL', '\u22A4', '#aaaaaa'); // ⊤
    npcPositions.push({ x: ax + 1, y: ay, role: 'blacksmith' });

    // Horseshoe on wall
    this._place(tiles, w - 2, 1, 'HORSESHOE', '\u2229', '#AA8844'); // ∩

    // Barrels along the bottom wall
    for (let x = 1; x < w - 1; x += 2) {
      this._place(tiles, x, h - 2, 'BARREL', '\u25CB', '#886644'); // ○
    }

    // Weapon rack on side wall
    for (let y = 3; y < Math.min(h - 2, 6); y++) {
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
