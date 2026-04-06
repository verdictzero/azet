// ─────────────────────────────────────────────
// Sprite Manager — loads, caches, and renders
// low-res pixel art sprites for NPC portraits
// and enemy battle sprites.
// ─────────────────────────────────────────────

import { AsciiArtGenerator } from './ascii-art-gen.js';
import { PORTRAIT_PALETTE, PORTRAIT_CHARS, PORTRAIT_ASCII } from './portrait-data.js';

// ── Sprite manifest ──────────────────────────
// Maps logical names to PNG paths under sprites/

const PORTRAIT_MANIFEST = {
  // NPC role-based portraits
  merchant:    'sprites/portraits/merchant.png',
  guard:       'sprites/portraits/guard.png',
  scholar:     'sprites/portraits/scholar.png',
  priest:      'sprites/portraits/priest.png',
  blacksmith:  'sprites/portraits/blacksmith.png',
  innkeeper:   'sprites/portraits/innkeeper.png',
  alchemist:   'sprites/portraits/alchemist.png',
  farmer:      'sprites/portraits/farmer.png',
  noble:       'sprites/portraits/noble.png',
  thief:       'sprites/portraits/thief.png',
  elder:       'sprites/portraits/elder.png',
  miner:       'sprites/portraits/miner.png',
  sailor:      'sprites/portraits/sailor.png',
  hunter:      'sprites/portraits/hunter.png',
  healer:      'sprites/portraits/healer.png',
  bard:        'sprites/portraits/bard.png',
  engineer:    'sprites/portraits/engineer.png',
  mystic:      'sprites/portraits/mystic.png',
  default:     'sprites/portraits/default.png',
};

const ENEMY_MANIFEST = {
  // Creature archetype-based battle sprites
  slime:       'sprites/enemies/slime.png',
  skeleton:    'sprites/enemies/skeleton.png',
  spider:      'sprites/enemies/spider.png',
  wolf:        'sprites/enemies/wolf.png',
  bat:         'sprites/enemies/bat.png',
  golem:       'sprites/enemies/golem.png',
  ghost:       'sprites/enemies/ghost.png',
  serpent:     'sprites/enemies/serpent.png',
  driller:     'sprites/enemies/ag_drone_driller_normal.png',
  grabber:     'sprites/enemies/ag_drone_grabber_normal.png',
  sprayer:     'sprites/enemies/ag_drone_sprayer_normal.png',
  pogo:        'sprites/enemies/pogo_drone.png',
  fungal:      'sprites/enemies/fungal.png',
  default:     'sprites/enemies/default.png',
};

export const EXPLOSION_MANIFEST = {
  large_A:  { frames: 9,  path: 'sprites/explosions/explosion_large_A_' },
  large_B:  { frames: 9,  path: 'sprites/explosions/explosion_large_B_' },
  medium_A: { frames: 10, path: 'sprites/explosions/explosion_medium_A_' },
  medium_B: { frames: 8,  path: 'sprites/explosions/explosion_medium_B_' },
  small_A:  { frames: 6,  path: 'sprites/explosions/explosion_small_A_' },
  small_B:  { frames: 6,  path: 'sprites/explosions/explosion_small_B_' },
};

// ── Actual portrait files on disk ─────────────
// Keyed by path to match npc.portrait assigned by NPCGenerator
const PORTRAIT_FILES = [
  'sprites/portraits/npc_female_1.png',
  'sprites/portraits/npc_female_2.png',
  'sprites/portraits/npc_female_3.png',
  'sprites/portraits/npc_female_4.png',
  'sprites/portraits/npc_female_5.png',
  'sprites/portraits/npc_male_1.png',
  'sprites/portraits/npc_male_2.png',
  'sprites/portraits/npc_female_child_1.png',
  'sprites/portraits/npc_male_child_1.png',
];

// (Procedural placeholder generators removed — pixel sprites only)

// ── SpriteManager ────────────────────────────

export class SpriteManager {
  constructor() {
    this._cache = new Map();       // name → Image or Canvas
    this._loading = new Map();     // name → Promise
    this.asciiGen = new AsciiArtGenerator();
  }

  // Load a single sprite PNG. Returns a Promise<Image>.
  loadSprite(name, path) {
    if (this._cache.has(name)) return Promise.resolve(this._cache.get(name));
    if (this._loading.has(name)) return this._loading.get(name);

    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this._cache.set(name, img);
        this._loading.delete(name);
        resolve(img);
      };
      img.onerror = () => {
        // Silently fail — sprite will be null
        this._loading.delete(name);
        resolve(null);
      };
      img.src = path;
    });
    this._loading.set(name, p);
    return p;
  }

  // Preload all sprites from manifests. Non-blocking; missing files silently fallback.
  async preloadAll() {
    const promises = [];
    for (const path of PORTRAIT_FILES) {
      promises.push(this.loadSprite(path, path));
    }
    for (const [name, path] of Object.entries(ENEMY_MANIFEST)) {
      promises.push(this.loadSprite(`enemy_${name}`, path));
    }
    for (const [seqName, seq] of Object.entries(EXPLOSION_MANIFEST)) {
      for (let i = 1; i <= seq.frames; i++) {
        const frameStr = String(i).padStart(2, '0');
        const key = `explosion_${seqName}_${frameStr}`;
        promises.push(this.loadSprite(key, `${seq.path}${frameStr}.png`));
      }
    }
    await Promise.all(promises);
  }

  // Get an ordered array of Image objects for an explosion animation sequence.
  getExplosionSequence(seqName) {
    const seq = EXPLOSION_MANIFEST[seqName];
    if (!seq) return null;
    const frames = [];
    for (let i = 1; i <= seq.frames; i++) {
      const key = `explosion_${seqName}_${String(i).padStart(2, '0')}`;
      const img = this._cache.get(key);
      if (img) frames.push(img);
    }
    return frames.length > 0 ? frames : null;
  }

  // Get a portrait for an NPC. Uses npc.portrait path assigned by NPCGenerator.
  getPortrait(npc) {
    if (npc.portrait) {
      const sprite = this._cache.get(npc.portrait);
      if (sprite) return sprite;
    }
    return null;
  }

  // Get a battle sprite for an enemy. Tries archetype keywords, then default.
  getEnemySprite(creature) {
    const name = (creature.name || '').toLowerCase();
    for (const archetype of Object.keys(ENEMY_MANIFEST)) {
      if (archetype === 'default') continue;
      if (name.includes(archetype)) {
        const sprite = this._cache.get(`enemy_${archetype}`);
        if (sprite) return sprite;
      }
    }
    return this._cache.get('enemy_default') || null;
  }

  // Get any cached sprite by exact name.
  getSprite(name) {
    return this._cache.get(name) || null;
  }

  /**
   * Unpack a pre-generated portrait from palette-indexed data.
   * Returns the standard { cols, rows, cells } grid format, or null.
   */
  _unpackPregenPortrait(path) {
    const entry = PORTRAIT_ASCII[path];
    if (!entry) return null;
    const cacheKey = '_pregen_' + path;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const { cols, rows, data } = entry;
    const cells = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const charIdx = data[idx++];
        const fgIdx = data[idx++];
        const bgIdx = data[idx++];
        row.push({
          char: PORTRAIT_CHARS[charIdx],
          fg: PORTRAIT_PALETTE[fgIdx],
          bg: PORTRAIT_PALETTE[bgIdx],
        });
      }
      cells.push(row);
    }
    const grid = { cols, rows, cells };
    this._cache.set(cacheKey, grid);
    return grid;
  }

  /**
   * Get an ASCII art grid for an NPC portrait.
   * Tries pre-generated 3x density data first, falls back to runtime conversion.
   * @param {object} npc - NPC with .portrait field
   * @param {number} cols - target width in character columns
   * @param {number} rows - target height in character rows
   * @param {string} [bgColor='#0e0e14'] - background color for transparent areas
   * @returns {{ cols, rows, cells }|null}
   */
  getPortraitAscii(npc, cols, rows, bgColor = '#0e0e14') {
    // Try pre-generated portrait if dimensions match
    if (npc.portrait) {
      const pregen = this._unpackPregenPortrait(npc.portrait);
      if (pregen && pregen.cols === cols && pregen.rows === rows) {
        return pregen;
      }
    }
    // Fall back to runtime conversion
    const img = this.getPortrait(npc);
    if (!img) return null;
    return this.asciiGen.convertDoubledCached(img, cols, rows, bgColor);
  }

  /**
   * Get an ASCII art grid for an enemy battle sprite.
   * @param {object} creature - creature object with .name
   * @param {number} cols - target width in character columns
   * @param {number} rows - target height in character rows
   * @param {string} [bgColor='#000000'] - background color for transparent areas
   * @returns {{ cols, rows, cells }|null}
   */
  getEnemySpriteAscii(creature, cols, rows, bgColor = '#000000') {
    const img = this.getEnemySprite(creature);
    if (!img) return null;
    return this.asciiGen.convertCached(img, cols, rows, bgColor);
  }
}
