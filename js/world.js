// ============================================================================
// world.js — World generation for ASCIIQUEST, a colony salvage roguelike
// ============================================================================

import { SeededRNG, PerlinNoise, AStar, distance, floodFill } from './utils.js';

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

    // Generate base terrain
    const tiles = makeTileGrid(width, height, (x, y) => {
      const nx = x / width;
      const ny = y / height;
      const h = (heightNoise.fbm(nx * 4, ny * 4, 6) + 1) / 2;
      const m = (moistureNoise.fbm(nx * 4 + 100, ny * 4 + 100, 5) + 1) / 2;
      const a = (anomalyNoise.fbm(nx * 2, ny * 2, 4) + 1) / 2;
      const d = (detailNoise.fbm(nx * 8, ny * 8, 3) + 1) / 2;
      return this._terrainFromNoise(h, m, a, d);
    });

    // Place locations
    const locations = this._placeLocations(rng, tiles, width, height);

    // Build roads between major locations
    const roads = this._buildRoads(rng, tiles, locations, width, height);

    return { tiles, width, height, locations, roads, getLocation: (x, y) => this._getLocation(locations, x, y) };
  }

  _terrainFromNoise(h, m, a = 0, d = 0.5) {
    // === ANOMALY BIOMES — checked first; high 'a' threshold keeps them rare ===

    // Void Rift: tears in reality (very rare)
    if (a > 0.92 && h < 0.4) return tile('VOID_RIFT', ' ', '#220044', '#000000', true, { biome: 'void_rift' });
    // Alien Crash Site: embedded xeno-vessel wreckage
    if (a > 0.9) return tile('ALIEN_CRASH', '*', '#FF44FF', '#220022', true, { biome: 'alien_crash' });
    // Data Corruption: ship systems haywire
    if (a > 0.85 && m >= 0.3 && m <= 0.6) return tile('GLITCH_ZONE', '?', '#FF0088', '#110011', true, { biome: 'glitch_zone' });
    // Assimilation Front: alien biomass consuming colony structure
    if (a > 0.82 && h > 0.5) return tile('ASSIMILATED', '=', '#AA0044', '#110000', true, { biome: 'assimilated' });
    // Hull Breach: exposed outer hull, vacuum-adjacent sectors
    if (a > 0.8 && h < 0.35) return tile('HULL_BREACH', '%', '#8899AA', '#111122', true, { biome: 'hull_breach' });
    // Nano-Plague Zone: grey goo dissolving everything
    if (a > 0.78 && h >= 0.4 && h <= 0.7) return tile('NANO_PLAGUE', ':', '#888888', '#222222', true, { biome: 'nano_plague' });
    // Reactor Slag: molten areas around failed reactors
    if (a > 0.75 && h > 0.7) return tile('REACTOR_SLAG', '~', '#FF6622', '#331100', true, { biome: 'reactor_slag' });
    // Frozen Deck: cryogenics failure, frost-covered corridors
    if (a > 0.7 && h < 0.5 && m > 0.6) return tile('FROZEN_DECK', '.', '#AADDFF', '#112233', true, { biome: 'frozen_deck' });
    // Crystalline Growth: alien mineral formations
    if (a > 0.7 && h > 0.6 && m < 0.3) return tile('CRYSTAL_ZONE', '#', '#44FFFF', '#002222', false, { biome: 'crystal_zone' });
    // Fungal Network: bioluminescent mycelium
    if (a > 0.65 && h >= 0.3 && h <= 0.6 && m > 0.5) return tile('FUNGAL_NET', '%', '#CC88FF', '#1A0022', true, { biome: 'fungal_net' });
    // Toxic Sump: waste processing overflow
    if (a > 0.6 && h < 0.3) return tile('TOXIC_SUMP', '~', '#44FF00', '#112200', false, { biome: 'toxic_sump' });
    // Hydroponic Jungle: agri-domes gone wild
    if (a > 0.5 && h >= 0.4 && h <= 0.65 && m > 0.75) return tile('HYDRO_JUNGLE', '&', '#00FF66', '#002211', true, { biome: 'hydro_jungle' });

    // === EXPANDED NATURAL BIOMES — finer height/moisture subdivisions ===

    // ── WATER & DEPTH (h < 0.3) ──
    // Abyssal depths: darkest water, near-black
    if (h < 0.08) return tile('ABYSS', '\u2591', '#000044', '#000011', false, { biome: 'ocean' });
    // Deep ocean: dark blue expanse
    if (h < 0.15) return tile('DEEP_OCEAN', '\u2248', '#000088', '#000044', false, { biome: 'ocean' });
    // Open ocean: medium-depth water
    if (h < 0.2) return tile('OCEAN', '\u223D', '#0044AA', '#000055', false, { biome: 'ocean' });
    // Shallows: lighter coastal water
    if (h < 0.27) return tile('SHALLOWS', '~', '#4488ff', '#000066', false, { biome: 'lake' });
    // Tidal pools: very shallow, walkable in wet areas
    if (h < 0.3 && m > 0.6) return tile('TIDAL_POOL', '\u25CC', '#66AADD', '#001133', true, { biome: 'shore' });
    // Shoals: sandy shallows, barely above water
    if (h < 0.3) return tile('SHOAL', '\u00B7', '#88BBCC', '#112233', true, { biome: 'shore' });

    // ── WETLANDS & LOW GROUND (h 0.3 - 0.45) ──
    // Mire: deep swamp, high moisture
    if (h < 0.36 && m > 0.7) return tile('MIRE', '~', '#228844', '#112211', true, { biome: 'swamp' });
    // Bog: waterlogged ground
    if (h < 0.36 && m > 0.55) return tile('BOG', '\u224B', '#336633', '#0a1a0a', true, { biome: 'swamp' });
    // Marsh reeds: tall wetland vegetation
    if (h < 0.40 && m > 0.65) return tile('MARSH_REEDS', '\u2307', '#55AA44', '#112211', true, { biome: 'swamp' });
    // Mudflat: drying ground, low moisture
    if (h < 0.40 && m < 0.35) return tile('MUDFLAT', '\u2234', '#AA8844', '#221100', true, { biome: 'badlands' });
    // Salt flat: arid, cracked earth
    if (h < 0.45 && m < 0.2) return tile('SALT_FLAT', '\u2043', '#CCBB99', '#332211', true, { biome: 'badlands' });
    // Dry riverbed: ancient waterways
    if (h < 0.42 && m >= 0.2 && m < 0.35 && d > 0.75) return tile('DRY_RIVERBED', '\u2240', '#AA9966', '#332211', true, { biome: 'badlands' });

    // ── LOWLANDS & PLAINS (h 0.42 - 0.55) ──
    // Barren waste: arid scrub
    if (h < 0.55 && m < 0.25) return tile('BARREN_WASTE', '.', '#ddcc44', '#332200', true, { biome: 'badlands' });
    // Scrubland: sparse dry bushes
    if (h < 0.55 && m >= 0.25 && m < 0.4) return tile('SCRUBLAND', ';', '#99AA44', '#1a1a0a', true, { biome: 'grassland' });
    // Grassland: open plains
    if (h < 0.5 && m >= 0.4 && m < 0.55) return tile('GRASSLAND', '.', '#44cc44', '#112211', true, { biome: 'grassland' });
    // Meadow: lush flowering fields
    if (h < 0.5 && m >= 0.55 && m < 0.7) return tile('MEADOW', ',', '#66DD66', '#112a11', true, { biome: 'grassland' });
    // Tall grass: dense high vegetation
    if (h < 0.5 && m >= 0.7) return tile('TALL_GRASS', '\u0131', '#33BB33', '#0a1a0a', true, { biome: 'grassland' });
    // Default grassland for remaining plains
    if (h < 0.55) return tile('GRASSLAND', '.', '#44cc44', '#112211', true, { biome: 'grassland' });

    // ── FOREST ZONE (h 0.5 - 0.7) ──
    // Sparse trees: scattered woodland edge
    if (h < 0.58 && m < 0.35) return tile('SPARSE_TREES', '\u03C4', '#338833', '#0a1a0a', true, { biome: 'forest' });
    // Forest: standard deciduous woodland
    if (h < 0.62 && m <= 0.55) return tile('FOREST', '\u2663', '#22AA22', '#0a1a0a', true, { biome: 'forest' });
    // Deep forest: dense canopy, high moisture
    if (h < 0.62 && m > 0.55) return tile('DEEP_FOREST', '\u2660', '#116611', '#060f06', true, { biome: 'forest' });
    // Dense canopy: impenetrable old-growth
    if (h < 0.68 && m > 0.6) return tile('CANOPY', '\u03A8', '#0A8810', '#040d04', false, { biome: 'forest' });
    // Pine stand: coniferous highland forest
    if (h < 0.7 && m <= 0.6) return tile('PINE_STAND', '\u21DF', '#226622', '#0a0f0a', true, { biome: 'forest' });
    // Boulder field: rocky clearings in forest (detail noise driven)
    if (h >= 0.58 && h < 0.7 && d > 0.85) return tile('BOULDER_FIELD', '\u25CF', '#888877', '#222211', false, { biome: 'forest' });
    // Ancient ruins: crumbling structures (rare detail feature)
    if (h >= 0.55 && h < 0.68 && d > 0.92) return tile('ANCIENT_RUINS', '\u03A0', '#887766', '#221111', true, { biome: 'forest' });

    // ── HILLS & FOOTHILLS (h 0.68 - 0.8) ──
    // Foothills: gentle rises
    if (h < 0.72) return tile('FOOTHILL', '\u2229', '#AABB88', '#222211', true, { biome: 'hills' });
    // Rolling hills: undulating terrain
    if (h < 0.76) return tile('ROLLING_HILLS', '\u2312', '#BBAA77', '#2a2a1a', true, { biome: 'hills' });
    // Ridge: exposed ridgeline (detail noise)
    if (h < 0.8 && d > 0.8) return tile('RIDGE', '\u2261', '#BBAA99', '#333322', true, { biome: 'hills' });
    // Rocky slope: dry eroded hillside
    if (h < 0.8 && m < 0.3) return tile('ROCKY_SLOPE', '\u2592', '#998877', '#333322', true, { biome: 'hills' });
    // Highland: elevated green terrain
    if (h < 0.8) return tile('HIGHLAND', '\u2206', '#AABBAA', '#222222', true, { biome: 'hills' });

    // ── MOUNTAIN ZONE (h 0.8+) ──
    // Cave mouth: rare entrance in mountainside
    if (h >= 0.8 && h < 0.86 && d > 0.93) return tile('CAVE_MOUTH', '\u25D7', '#665544', '#221100', true, { biome: 'mountain' });
    // Thermal vent: volcanic fissure (rare)
    if (h >= 0.82 && d > 0.9 && m < 0.3) return tile('THERMAL_VENT', '\u229B', '#FF8844', '#331100', true, { biome: 'mountain' });
    // Mountain base: lower rocky slopes
    if (h < 0.84) return tile('MOUNTAIN_BASE', '\u2593', '#AAAAAA', '#333333', false, { biome: 'mountain' });
    // Mountain: solid rock faces
    if (h < 0.88) return tile('MOUNTAIN', '\u25B3', '#BBBBBB', '#444444', false, { biome: 'mountain' });
    // Crag: jagged upper peaks
    if (h < 0.92) return tile('CRAG', '\u25C7', '#CCCCCC', '#555555', false, { biome: 'mountain' });
    // Snowcap: snow-covered high peaks (high moisture)
    if (h < 0.96 && m > 0.5) return tile('SNOWCAP', '\u2746', '#DDEEFF', '#667799', false, { biome: 'mountain' });
    // High peak: towering summits
    if (h < 0.96) return tile('HIGH_PEAK', '\u25B2', '#ffffff', '#666688', false, { biome: 'mountain' });
    // Summit: the very highest points
    return tile('SUMMIT', '\u25C6', '#EEEEFF', '#8888AA', false, { biome: 'mountain' });
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
          if (t.type === 'SHALLOWS' || t.type === 'DEEP_LAKE' || t.type === 'MOUNTAIN' || t.type === 'HIGH_PEAK') continue;

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
          if (t.type === 'GRASSLAND' || t.type === 'FOREST' || t.type === 'BARREN_WASTE' || t.type === 'DEEP_FOREST') {
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
      if (t.type === 'DEEP_LAKE' || t.type === 'HIGH_PEAK') return false;
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
const TERRAIN_SCALE = 0.04;

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
};

const LOCATION_DEFS = [
  { type: 'village', weight: 40, population: [30, 120], difficulty: 1 },
  { type: 'town', weight: 15, population: [200, 600], difficulty: 2 },
  { type: 'dungeon', weight: 15, population: [0, 0], difficulty: 5 },
  { type: 'temple', weight: 8, population: [10, 50], difficulty: 3 },
  { type: 'ruins', weight: 8, population: [0, 10], difficulty: 4 },
  { type: 'camp', weight: 6, population: [10, 40], difficulty: 2 },
  { type: 'castle', weight: 3, population: [50, 200], difficulty: 4 },
  { type: 'city', weight: 3, population: [800, 2000], difficulty: 1 },
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
    this._terrainGen = new OverworldGenerator(); // reuse _terrainFromNoise

    this.chunks = new Map();       // "cx,cy" -> { tiles: [][], locations: [] }
    this.locationMap = new Map();  // "wx,wy" -> location object
    this.exploredChunks = new Set();
    this._roadCache = new Set();   // "cx1,cy1|cx2,cy2" pairs already connected
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
    return this._terrainGen._terrainFromNoise(h, m, a, d);
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
        type: 'fungal_colossus', w: 6, h: 6, biomes: ['fungal_net', 'hydro_jungle'],
        build(tiles, sx, sy) {
          for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) {
            const dist = Math.abs(dx - 2.5) + Math.abs(dy - 2.5);
            if (dist < 3) tiles[sy + dy][sx + dx] = tile('FUNGAL_MASS', '&', '#AA66DD', '#1A0022', false, { structure: true });
            else if (dist < 4.5 && (dx + dy) % 2 === 0) tiles[sy + dy][sx + dx] = tile('SPORE_FLOOR', '.', '#8844AA', '#1A0022', true, { structure: true });
          }
        },
        lights(sx, sy, ox, oy) {
          return [{ x: ox + sx + 3, y: oy + sy + 3, radius: 8, r: 0.2, g: 1, b: 0.4, intensity: 0.75 }];
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

    const structures = this._placeStructures(cx, cy, tiles);
    const locations = this._placeChunkLocations(cx, cy, tiles);
    const chunk = { tiles, locations, structures, cx, cy };
    this.chunks.set(key, chunk);
    return chunk;
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
        if (t.type === 'SHALLOWS' || t.type === 'DEEP_LAKE' || t.type === 'MOUNTAIN' || t.type === 'HIGH_PEAK') continue;

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
          if (t.type === 'GRASSLAND' || t.type === 'FOREST' || t.type === 'BARREN_WASTE' || t.type === 'DEEP_FOREST') {
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
      if (t.type === 'DEEP_LAKE' || t.type === 'HIGH_PEAK') return false;
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

    if (dist <= 10) {
      // Near outskirts: gardens, fences, fields
      if (r < 0.05) return tile('FENCE', '\u2502', '#aa6622', '#112211', false, { buildingId: null }); // │
      if (r < 0.10) return tile('WELL', '\u25CE', '#4488ff', '#112211', false, { buildingId: null }); // ◎
      if (r < 0.20) return tile('FIELD', '\u2261', '#aaaa22', '#222211', true, { buildingId: null }); // ≡
      if (r < 0.30) return tile('TREE', 't', '#228822', '#112211', false, { buildingId: null });
      return tile('GRASSLAND', ',', '#55bb55', '#112211', true, { buildingId: null });
    }

    if (dist <= 20) {
      // Mid outskirts: sparser, more trees, occasional farm buildings
      if (r < 0.15) return tile('TREE', 't', '#228822', '#0a1a0a', false, { buildingId: null });
      if (r < 0.20) return tile('TREE', 'T', '#116611', '#0a1a0a', false, { buildingId: null });
      if (r < 0.22) return tile('CRATE', '\u25AA', '#886644', '#112211', false, { buildingId: null }); // ▪
      if (r < 0.25) return tile('SIGNPOST', '\u2691', '#aa8866', '#112211', false, { buildingId: null }); // ⚑
      return tile('GRASSLAND', '.', '#44cc44', '#112211', true, { buildingId: null });
    }

    // Far outskirts: wild terrain based on biome
    const biomeTerrains = {
      grassland: () => {
        if (r < 0.10) return tile('DEEP_FOREST', 'T', '#22aa22', '#0a1a0a', false, { buildingId: null });
        if (r < 0.20) return tile('FOREST', 't', '#116611', '#0a1a0a', false, { buildingId: null });
        return tile('GRASSLAND', '.', '#44cc44', '#112211', true, { buildingId: null });
      },
      forest: () => {
        if (r < 0.35) return tile('DEEP_FOREST', 'T', '#22aa22', '#0a1a0a', false, { buildingId: null });
        if (r < 0.55) return tile('FOREST', 't', '#116611', '#0a1a0a', false, { buildingId: null });
        return tile('GRASSLAND', '.', '#44cc44', '#112211', true, { buildingId: null });
      },
      swamp: () => {
        if (r < 0.20) return tile('MIRE', '~', '#228844', '#112211', true, { buildingId: null });
        if (r < 0.30) return tile('TREE', 'T', '#116611', '#0a1a0a', false, { buildingId: null });
        return tile('GRASSLAND', '.', '#33aa44', '#112211', true, { buildingId: null });
      },
      badlands: () => {
        if (r < 0.10) return tile('MOUNTAIN', '^', '#cccccc', '#333333', false, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#ddcc44', '#332200', true, { buildingId: null });
      },
      mountain: () => {
        if (r < 0.15) return tile('MOUNTAIN', '^', '#cccccc', '#333333', false, { buildingId: null });
        if (r < 0.25) return tile('FOREST', 't', '#116611', '#0a1a0a', false, { buildingId: null });
        return tile('GRASSLAND', '.', '#44cc44', '#112211', true, { buildingId: null });
      },
      hull_breach: () => {
        if (r < 0.15) return tile('HULL_BREACH', '%', '#667788', '#111122', true, { buildingId: null });
        if (r < 0.25) return tile('HULL_BREACH', '.', '#556677', '#111122', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#778899', '#111122', true, { buildingId: null });
      },
      reactor_slag: () => {
        if (r < 0.10) return tile('REACTOR_SLAG', '~', '#FF6622', '#331100', true, { buildingId: null });
        if (r < 0.25) return tile('BARREN_WASTE', '.', '#AA6633', '#221100', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#886644', '#221100', true, { buildingId: null });
      },
      frozen_deck: () => {
        if (r < 0.15) return tile('FROZEN_DECK', '.', '#AADDFF', '#112233', true, { buildingId: null });
        if (r < 0.25) return tile('FROZEN_DECK', '*', '#88BBDD', '#112233', false, { buildingId: null });
        return tile('GRASSLAND', '.', '#88BBCC', '#112233', true, { buildingId: null });
      },
      hydro_jungle: () => {
        if (r < 0.30) return tile('HYDRO_JUNGLE', '&', '#00FF66', '#002211', true, { buildingId: null });
        if (r < 0.45) return tile('DEEP_FOREST', 'T', '#00CC44', '#001A0A', false, { buildingId: null });
        return tile('GRASSLAND', '.', '#22AA44', '#001A0A', true, { buildingId: null });
      },
      fungal_net: () => {
        if (r < 0.20) return tile('FUNGAL_NET', '%', '#CC88FF', '#1A0022', true, { buildingId: null });
        if (r < 0.30) return tile('FUNGAL_NET', '.', '#9966CC', '#1A0022', true, { buildingId: null });
        return tile('GRASSLAND', '.', '#886699', '#1A0022', true, { buildingId: null });
      },
      toxic_sump: () => {
        if (r < 0.15) return tile('TOXIC_SUMP', '~', '#44FF00', '#112200', false, { buildingId: null });
        if (r < 0.30) return tile('MIRE', '~', '#338800', '#112200', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#667744', '#112200', true, { buildingId: null });
      },
      alien_crash: () => {
        if (r < 0.15) return tile('ALIEN_CRASH', '*', '#FF44FF', '#220022', true, { buildingId: null });
        if (r < 0.25) return tile('ALIEN_CRASH', '.', '#CC44CC', '#220022', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#886688', '#220022', true, { buildingId: null });
      },
      crystal_zone: () => {
        if (r < 0.20) return tile('CRYSTAL_ZONE', '#', '#44FFFF', '#002222', false, { buildingId: null });
        if (r < 0.30) return tile('CRYSTAL_ZONE', '.', '#22AAAA', '#002222', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#448888', '#002222', true, { buildingId: null });
      },
      void_rift: () => {
        if (r < 0.15) return tile('VOID_RIFT', ' ', '#220044', '#000000', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#332244', '#000011', true, { buildingId: null });
      },
      glitch_zone: () => {
        if (r < 0.20) return tile('GLITCH_ZONE', '?', '#FF0088', '#110011', true, { buildingId: null });
        if (r < 0.30) return tile('GLITCH_ZONE', '.', '#CC0066', '#110011', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#884466', '#110011', true, { buildingId: null });
      },
      nano_plague: () => {
        if (r < 0.25) return tile('NANO_PLAGUE', ':', '#888888', '#222222', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#666666', '#222222', true, { buildingId: null });
      },
      assimilated: () => {
        if (r < 0.20) return tile('ASSIMILATED', '=', '#AA0044', '#110000', true, { buildingId: null });
        if (r < 0.35) return tile('ASSIMILATED', '.', '#882244', '#110000', true, { buildingId: null });
        return tile('BARREN_WASTE', '.', '#664444', '#110000', true, { buildingId: null });
      },
    };

    const gen = biomeTerrains[biome] || biomeTerrains.grassland;
    return gen();
  }

  _generateOutskirtRoads(rng, tiles, pad, coreW, coreH, totalW, totalH) {
    const cx = pad + Math.floor(coreW / 2);
    const cy = pad + Math.floor(coreH / 2);

    // Road going south from settlement
    for (let y = pad + coreH; y < totalH - 2; y++) {
      if (tiles[y][cx].type === 'GRASSLAND' || tiles[y][cx].type === 'FIELD') {
        tiles[y][cx] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }
    // Road going north
    for (let y = pad - 1; y >= 2; y--) {
      if (tiles[y][cx].type === 'GRASSLAND' || tiles[y][cx].type === 'FIELD') {
        tiles[y][cx] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }
    // Road going east
    for (let x = pad + coreW; x < totalW - 2; x++) {
      if (tiles[cy][x].type === 'GRASSLAND' || tiles[cy][x].type === 'FIELD') {
        tiles[cy][x] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }
    // Road going west
    for (let x = pad - 1; x >= 2; x--) {
      if (tiles[cy][x].type === 'GRASSLAND' || tiles[cy][x].type === 'FIELD') {
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

    // Gate at bottom center
    const gateX = Math.floor(w / 2);
    tiles[h - margin - 1][gateX] = tile('DOOR', '+', '#aa6622', '#222222', true, { buildingId: null });
    tiles[h - margin - 1][gateX - 1] = tile('DOOR', '+', '#aa6622', '#222222', true, { buildingId: null });

    // Road from gate inward
    for (let y = h - margin; y < h; y++) {
      tiles[y][gateX] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
    }

    // Inner courtyard road
    const courtY = Math.floor(h / 2);
    for (let x = margin + 2; x < w - margin - 2; x++) {
      tiles[courtY][x] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
    }

    // Place internal buildings
    const internalDefs = [
      { type: 'barracks', name: 'Guard Post', minW: 8, minH: 6 },
      { type: 'tavern', name: 'Great Hall', minW: 10, minH: 8 },
      { type: 'blacksmith', name: 'Smithy', minW: 6, minH: 5 },
      { type: 'temple', name: 'Temple', minW: 6, minH: 6 },
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
    }
  }

  _generateSettlement(rng, tiles, w, h, type, population, buildings, npcSlots, biome) {
    // Central plaza
    const plazaW = type === 'city' ? 8 : type === 'town' ? 6 : 4;
    const plazaH = type === 'city' ? 6 : type === 'town' ? 5 : 3;
    const plazaX = Math.floor((w - plazaW) / 2);
    const plazaY = Math.floor((h - plazaH) / 2);

    for (let y = plazaY; y < plazaY + plazaH; y++) {
      for (let x = plazaX; x < plazaX + plazaW; x++) {
        tiles[y][x] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
    }

    // Place a fountain in center of plaza
    const fcx = plazaX + Math.floor(plazaW / 2);
    const fcy = plazaY + Math.floor(plazaH / 2);
    tiles[fcy][fcx] = tile('FOUNTAIN', '\u00a4', '#4488ff', '#332211', false, { buildingId: null });

    // Determine building count based on type
    const buildingCounts = {
      village: { house: 3, tavern: 1, shop: 1 },
      town: { house: 6, tavern: 1, shop: 2, blacksmith: 1, temple: 1, market_stall: 2 },
      city: { house: 10, tavern: 2, shop: 3, blacksmith: 2, temple: 1, guild_hall: 1, barracks: 1, market_stall: 4 },
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
      const bw = bType === 'market_stall' ? rng.nextInt(3, 4) : rng.nextInt(5, 8);
      const bh = bType === 'market_stall' ? rng.nextInt(3, 3) : rng.nextInt(5, 7);

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
      this._carveBuilding(tiles, bestX, bestY, bw, bh, bid);
      placed.push({ x: bestX - 1, y: bestY - 1, w: bw + 2, h: bh + 2 });

      const nameMap = {
        tavern: 'Tavern', shop: 'General Store', blacksmith: 'Smithy',
        temple: 'Temple', house: 'Dwelling', guild_hall: 'Guild Hall',
        barracks: 'Guard Post', market_stall: 'Market Stall',
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
        barracks: 'guard', market_stall: 'merchant',
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

    // Scatter decorations
    this._scatterDecorations(rng, tiles, w, h, biome, placed);
  }

  _carveBuilding(tiles, bx, by, bw, bh, buildingId) {
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        if (y === by || y === by + bh - 1 || x === bx || x === bx + bw - 1) {
          tiles[y][x] = tile('WALL', '#', '#cccccc', '#333333', false, { solid: true, buildingId });
        } else {
          tiles[y][x] = tile('FLOOR', '.', '#999999', '#222222', true, { solid: false, buildingId });
        }
      }
    }
    // Door at bottom center
    const doorX = bx + Math.floor(bw / 2);
    tiles[by + bh - 1][doorX] = tile('DOOR', '+', '#aa6622', '#222222', true, { solid: false, buildingId });
  }

  _carveRoad(tiles, sx, sy, ex, ey, w, h) {
    // Simple L-shaped road
    const midX = sx;
    // Vertical segment
    const yDir = ey > sy ? 1 : -1;
    let y = sy;
    while (y !== ey && y >= 0 && y < h) {
      const t = tiles[y][midX];
      if (t.type === 'GRASSLAND') {
        tiles[y][midX] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
      y += yDir;
    }
    // Horizontal segment
    const xDir = ex > midX ? 1 : -1;
    let x = midX;
    while (x !== ex && x >= 0 && x < w) {
      const t = tiles[ey][x];
      if (t.type === 'GRASSLAND') {
        tiles[ey][x] = tile('ROAD', '=', '#ccaa44', '#332211', true, { buildingId: null });
      }
      x += xDir;
    }
  }

  _scatterDecorations(rng, tiles, w, h, biome, placed) {
    const decorCount = Math.floor(w * h * 0.02);
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
        tile('TREE', 't', '#228822', '#112211', false, { buildingId: null }),
        tile('TREE', 'T', '#116611', '#112211', false, { buildingId: null }),
        tile('FENCE', '\u2502', '#aa6622', '#112211', false, { buildingId: null }),  // │
        tile('CRATE', '\u25AA', '#886644', '#112211', false, { buildingId: null }),  // ▪
        tile('WELL', '\u25CE', '#4488ff', '#112211', false, { buildingId: null }),   // ◎
        tile('BARREL', '\u25CB', '#886644', '#112211', false, { buildingId: null }), // ○
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

    return { tiles, width, height, npcPositions, itemPositions };
  }

  _place(tiles, x, y, type, char, fg, bg) {
    if (x >= 0 && y >= 0 && x < tiles[0].length && y < tiles.length && tiles[y][x].type === 'FLOOR') {
      tiles[y][x] = tile(type, char, fg, bg || '#222222', false);
      return true;
    }
    return false;
  }

  _furnishTavern(rng, tiles, w, h, npcPositions, itemPositions) {
    // Bar counter along the top wall
    for (let x = 2; x < Math.min(w - 2, 7); x++) {
      this._place(tiles, x, 2, 'COUNTER', '=', '#aa6622');
    }
    // Innkeeper behind bar
    npcPositions.push({ x: 3, y: 1, role: 'innkeeper' });

    // Tables and chairs scattered
    const tablePositions = [];
    for (let ty = 4; ty < h - 3; ty += 3) {
      for (let tx = 2; tx < w - 3; tx += 4) {
        if (rng.chance(0.7)) {
          this._place(tiles, tx, ty, 'TABLE', '\u03c0', '#886644');
          tablePositions.push({ x: tx, y: ty });
          // Chairs around table
          if (tx > 1) this._place(tiles, tx - 1, ty, 'CHAIR', 'h', '#664422');
          if (tx < w - 2) this._place(tiles, tx + 1, ty, 'CHAIR', 'h', '#664422');
          if (ty > 1) this._place(tiles, tx, ty - 1, 'CHAIR', 'h', '#664422');
        }
      }
    }

    // Fireplace on a side wall
    this._place(tiles, w - 2, 1, 'FIREPLACE', '\u2593', '#ff4400');

    // Stairs up
    this._place(tiles, 1, 1, 'STAIRS_UP', '<', '#ffffff');

    // Patrons at some tables
    for (const tp of tablePositions.slice(0, 2)) {
      npcPositions.push({ x: tp.x - 1, y: tp.y, role: 'patron' });
    }
  }

  _furnishShop(rng, tiles, w, h, npcPositions, itemPositions) {
    // Counter near the top
    for (let x = 2; x < Math.min(w - 2, 7); x++) {
      this._place(tiles, x, 2, 'COUNTER', '=', '#aa6622');
    }
    // Shopkeeper behind counter
    npcPositions.push({ x: 3, y: 1, role: 'merchant' });

    // Shelves along walls
    for (let y = 3; y < h - 2; y += 2) {
      this._place(tiles, 1, y, 'SHELF', '%', '#886644');
      this._place(tiles, w - 2, y, 'SHELF', '%', '#886644');
      itemPositions.push({ x: 1, y, type: 'merchandise' });
      itemPositions.push({ x: w - 2, y, type: 'merchandise' });
    }

    // Display cases in the middle
    for (let x = 3; x < w - 3; x += 3) {
      const dy = Math.floor(h / 2);
      this._place(tiles, x, dy, 'DISPLAY_CASE', '\u25a1', '#aaaacc');
      itemPositions.push({ x, y: dy, type: 'valuable' });
    }
  }

  _furnishBlacksmith(rng, tiles, w, h, npcPositions, itemPositions) {
    // Forge in a corner
    this._place(tiles, 1, 1, 'FORGE', '\u2593', '#ff4400');
    this._place(tiles, 2, 1, 'FORGE', '\u2593', '#ff2200');

    // Anvil in center
    const ax = Math.floor(w / 2);
    const ay = Math.floor(h / 2);
    this._place(tiles, ax, ay, 'ANVIL', '\u252c', '#aaaaaa');
    npcPositions.push({ x: ax + 1, y: ay, role: 'blacksmith' });

    // Barrels along the bottom wall
    for (let x = 1; x < w - 1; x += 2) {
      this._place(tiles, x, h - 2, 'BARREL', 'o', '#886644');
    }

    // Weapon rack on side wall
    for (let y = 2; y < Math.min(h - 2, 5); y++) {
      this._place(tiles, w - 2, y, 'WEAPON_RACK', '/', '#aaaaaa');
      itemPositions.push({ x: w - 2, y, type: 'weapon' });
    }
  }

  _furnishTemple(rng, tiles, w, h, npcPositions, itemPositions) {
    // Altar at the top center
    const altarX = Math.floor(w / 2);
    this._place(tiles, altarX, 1, 'ALTAR', '\u2534', '#ddddaa');
    // Holy symbol above altar
    this._place(tiles, altarX, 2, 'HOLY_SYMBOL', '\u2020', '#ffdd44');

    // Pews in rows
    for (let y = 4; y < h - 2; y += 2) {
      for (let x = 2; x < w - 2; x++) {
        if (x === altarX) continue; // Leave center aisle clear
        this._place(tiles, x, y, 'PEW', '\u2261', '#664422');
      }
    }

    // Candles along side walls
    for (let y = 1; y < h - 1; y += 2) {
      this._place(tiles, 1, y, 'CANDLE', '.', '#ffdd44');
      this._place(tiles, w - 2, y, 'CANDLE', '.', '#ffdd44');
    }

    // Priest at the altar
    npcPositions.push({ x: altarX, y: 3, role: 'priest' });
  }

  _furnishHouse(rng, tiles, w, h, npcPositions, itemPositions) {
    // Bed in a corner
    this._place(tiles, 1, 1, 'BED', '~', '#4444aa');
    this._place(tiles, 2, 1, 'BED', '~', '#4444aa');

    // Table and chair
    const tx = Math.floor(w / 2);
    const ty = Math.floor(h / 2);
    this._place(tiles, tx, ty, 'TABLE', '\u03c0', '#886644');
    this._place(tiles, tx + 1, ty, 'CHAIR', 'h', '#664422');

    // Chest
    this._place(tiles, w - 2, 1, 'CHEST', '\u25a1', '#886644');
    itemPositions.push({ x: w - 2, y: 1, type: 'loot' });

    // Fireplace
    this._place(tiles, w - 2, Math.floor(h / 2), 'FIREPLACE', '\u2593', '#ff4400');

    // Resident
    npcPositions.push({ x: tx - 1, y: ty, role: 'resident' });
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

    // Carve rooms into tiles
    for (const room of rooms) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          tiles[y][x] = tile('FLOOR', '.', '#888888', '#222222', true);
        }
      }
    }

    // Carve corridors and place doors
    for (const cor of corridors) {
      for (const p of cor.points) {
        if (p.x >= 0 && p.y >= 0 && p.x < width && p.y < height) {
          tiles[p.y][p.x] = tile('FLOOR', '.', '#888888', '#222222', true);
        }
      }
    }

    // Place doors at room entrances
    this._placeDoors(rng, tiles, rooms, width, height);

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

    // Convert grid to tiles
    const tiles = makeTileGrid(width, height, (x, y) => {
      if (grid[y][x] === 0) {
        return tile('FLOOR', '.', '#aa9977', '#222211', true);
      }
      return tile('WALL', '#', '#666655', '#111100', false);
    });

    // Identify "rooms" as open areas (we pick some representative points)
    const rooms = this._identifyCaveRooms(rng, grid, largestRegion, width, height);
    const corridors = []; // Caves don't have explicit corridors

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
            tiles[y][x] = tile('WALL', '#', '#888888', '#222222', false);
          } else {
            tiles[y][x] = tile('FLOOR', '.', '#999999', '#222222', true);
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

    // Place environmental storytelling
    const storyElements = [];
    const storyCount = rng.nextInt(3, 8);
    for (let i = 0; i < storyCount; i++) {
      const sx = rng.nextInt(1, width - 2);
      const sy = rng.nextInt(1, height - 2);
      if (baseTiles[sy][sx].walkable && baseTiles[sy][sx].type !== 'HOLE') {
        const element = rng.random([
          { type: 'BONES', char: '\u00a5', fg: '#ccccaa', name: 'scattered bones' },
          { type: 'BROKEN_FURNITURE', char: '\u2591', fg: '#886644', name: 'broken furniture' },
          { type: 'INSCRIPTION', char: '\u00a7', fg: '#aaaacc', name: 'faded inscription' },
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
