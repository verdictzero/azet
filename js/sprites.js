// ─────────────────────────────────────────────
// Sprite Manager — loads, caches, and renders
// low-res pixel art sprites for NPC portraits
// and enemy battle sprites.
// ─────────────────────────────────────────────

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
  drone:       'sprites/enemies/drone.png',
  fungal:      'sprites/enemies/fungal.png',
  default:     'sprites/enemies/default.png',
};

// ── Procedural placeholder generator ─────────
// Generates simple 128x128 pixel art placeholders
// so the system works before hand-crafted art exists.

function generatePlaceholderPortrait(role) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  // Deterministic seed from role string
  let seed = 0;
  for (let i = 0; i < role.length; i++) seed = ((seed << 5) - seed + role.charCodeAt(i)) | 0;
  const rng = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

  // Color palette derived from role
  const hue = (Math.abs(seed) % 360);
  const skinHue = 25 + rng(20);
  const skinSat = 30 + rng(30);
  const skinLit = 45 + rng(20);
  const hairHue = rng(360);
  const hairLit = 20 + rng(30);
  const eyeHue = hue;
  const clothHue = (hue + 120) % 360;

  const skin = `hsl(${skinHue}, ${skinSat}%, ${skinLit}%)`;
  const skinShadow = `hsl(${skinHue}, ${skinSat}%, ${skinLit - 12}%)`;
  const hair = `hsl(${hairHue}, 40%, ${hairLit}%)`;
  const hairHi = `hsl(${hairHue}, 35%, ${hairLit + 15}%)`;
  const eye = `hsl(${eyeHue}, 70%, 55%)`;
  const cloth = `hsl(${clothHue}, 50%, 35%)`;
  const clothHi = `hsl(${clothHue}, 45%, 50%)`;
  const bg = '#0e0e14';

  ctx.imageSmoothingEnabled = false;
  const px = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const P = 4; // pixel size (128 / 32 = 4px per art-pixel, giving us 32x32 art resolution)

  // Fill background
  px(0, 0, size, size, bg);

  // Head (oval) — centered, rows 4-18, cols 9-22 (in 32x32 grid)
  for (let y = 4; y <= 18; y++) {
    for (let x = 9; x <= 22; x++) {
      const cx = 15.5, cy = 11;
      const dx = (x - cx) / 7, dy = (y - cy) / 7.5;
      if (dx * dx + dy * dy <= 1) {
        const shade = dy > 0.3 ? skinShadow : skin;
        px(x * P, y * P, P, P, shade);
      }
    }
  }

  // Hair — top of head
  const hairStyle = rng(3);
  for (let y = 2; y <= 8; y++) {
    for (let x = 8; x <= 23; x++) {
      const cx = 15.5, cy = 6;
      const dx = (x - cx) / 8, dy = (y - cy) / 5;
      if (dx * dx + dy * dy <= 1) {
        const hi = (x + y) % 3 === 0 ? hairHi : hair;
        px(x * P, y * P, P, P, hi);
      }
      // Side hair
      if (hairStyle >= 1 && y >= 6 && y <= 14 && (x <= 9 || x >= 22)) {
        const cx2 = x <= 9 ? 9 : 22;
        if (Math.abs(x - cx2) <= 1) px(x * P, y * P, P, P, hair);
      }
    }
  }

  // Eyes — row 10-11, symmetric
  const eyeL = 13, eyeR = 18;
  px(eyeL * P, 10 * P, P * 2, P * 2, '#ffffff');
  px(eyeR * P, 10 * P, P * 2, P * 2, '#ffffff');
  // Pupils
  px((eyeL + 1) * P, 11 * P, P, P, eye);
  px((eyeR + 1) * P, 11 * P, P, P, eye);
  // Eyebrow accents
  px(eyeL * P, 9 * P, P * 2, P, hair);
  px(eyeR * P, 9 * P, P * 2, P, hair);

  // Nose — small, centered
  px(15 * P, 13 * P, P * 2, P, skinShadow);

  // Mouth
  px(14 * P, 15 * P, P * 4, P, `hsl(${skinHue}, ${skinSat + 10}%, ${skinLit - 8}%)`);

  // Shoulders / clothing — rows 19-28
  for (let y = 19; y <= 28; y++) {
    for (let x = 6; x <= 25; x++) {
      const cx = 15.5;
      const dx = (x - cx) / 10;
      const dy = (y - 19) / 10;
      if (dx * dx + dy * dy * 0.3 <= 1) {
        const hi = (x + y) % 4 === 0 ? clothHi : cloth;
        px(x * P, y * P, P, P, hi);
      }
    }
  }

  // Neck
  for (let y = 17; y <= 19; y++) {
    px(14 * P, y * P, P * 4, P, skinShadow);
  }

  return c;
}

function generatePlaceholderEnemy(archetype) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  let seed = 0;
  for (let i = 0; i < archetype.length; i++) seed = ((seed << 5) - seed + archetype.charCodeAt(i)) | 0;
  const rng = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

  const hue = Math.abs(seed) % 360;
  const mainColor = `hsl(${hue}, 60%, 45%)`;
  const hiColor = `hsl(${hue}, 55%, 60%)`;
  const darkColor = `hsl(${hue}, 65%, 25%)`;
  const eyeColor = `hsl(${(hue + 180) % 360}, 80%, 60%)`;

  ctx.imageSmoothingEnabled = false;
  const P = 4;
  const px = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

  // Transparent background (leave as transparent for compositing over fire)
  ctx.clearRect(0, 0, size, size);

  // Simple creature body — blob shape
  const cx = 16, cy = 16;
  const bodyR = 8 + rng(4);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = (x - cx) / bodyR;
      const dy = (y - cy) / (bodyR * 0.8);
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        const shade = d > 0.6 ? darkColor : (d > 0.3 ? mainColor : hiColor);
        px(x * P, y * P, P, P, shade);
      }
    }
  }

  // Eyes
  const eyeSpacing = 3 + rng(2);
  const eyeY = cy - 2 - rng(2);
  const eyeSize = 1 + rng(2);
  // Left eye
  px((cx - eyeSpacing) * P, eyeY * P, P * eyeSize, P * eyeSize, '#ffffff');
  px((cx - eyeSpacing + (eyeSize > 1 ? 1 : 0)) * P, (eyeY + (eyeSize > 1 ? 1 : 0)) * P, P, P, eyeColor);
  // Right eye
  px((cx + eyeSpacing - eyeSize + 1) * P, eyeY * P, P * eyeSize, P * eyeSize, '#ffffff');
  px((cx + eyeSpacing) * P, (eyeY + (eyeSize > 1 ? 1 : 0)) * P, P, P, eyeColor);

  // Mouth
  const mouthW = 2 + rng(4);
  px((cx - Math.floor(mouthW / 2)) * P, (cy + 2) * P, P * mouthW, P, darkColor);

  return c;
}

// ── SpriteManager ────────────────────────────

export class SpriteManager {
  constructor() {
    this._cache = new Map();       // name → Image or Canvas
    this._loading = new Map();     // name → Promise
    this._placeholders = new Map(); // generated fallbacks
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
        // Silently fail — placeholder will be used
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
    for (const [name, path] of Object.entries(PORTRAIT_MANIFEST)) {
      promises.push(this.loadSprite(`portrait_${name}`, path));
    }
    for (const [name, path] of Object.entries(ENEMY_MANIFEST)) {
      promises.push(this.loadSprite(`enemy_${name}`, path));
    }
    await Promise.all(promises);
  }

  // Get a portrait for an NPC. Tries role-specific, then default, then placeholder.
  getPortrait(npc) {
    const role = (npc.role || '').toLowerCase().replace(/\s+/g, '');
    // Try exact role match
    let sprite = this._cache.get(`portrait_${role}`);
    if (sprite) return sprite;
    // Try default
    sprite = this._cache.get('portrait_default');
    if (sprite) return sprite;
    // Generate placeholder
    const key = `placeholder_portrait_${role || 'default'}`;
    if (!this._placeholders.has(key)) {
      this._placeholders.set(key, generatePlaceholderPortrait(role || 'default'));
    }
    return this._placeholders.get(key);
  }

  // Get a battle sprite for an enemy. Tries archetype keywords, then default, then placeholder.
  getEnemySprite(creature) {
    const name = (creature.name || '').toLowerCase();
    // Check each archetype keyword
    for (const archetype of Object.keys(ENEMY_MANIFEST)) {
      if (archetype === 'default') continue;
      if (name.includes(archetype)) {
        const sprite = this._cache.get(`enemy_${archetype}`);
        if (sprite) return sprite;
      }
    }
    // Try default
    const def = this._cache.get('enemy_default');
    if (def) return def;
    // Generate placeholder
    const key = `placeholder_enemy_${name || 'unknown'}`;
    if (!this._placeholders.has(key)) {
      this._placeholders.set(key, generatePlaceholderEnemy(name || 'unknown'));
    }
    return this._placeholders.get(key);
  }

  // Get any cached sprite by exact name.
  getSprite(name) {
    return this._cache.get(name) || null;
  }
}
