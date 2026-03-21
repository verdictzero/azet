// engine.js - Retro ASCII roguelike rendering engine
// ES module: exports COLORS, LAYOUT, wordWrap, Renderer, Camera, InputManager

import { PerlinNoise, SeededRNG } from './utils.js';

// ─────────────────────────────────────────────
// Layout Constants
// ─────────────────────────────────────────────

export const LAYOUT = {
  TOP_BORDER: 1,
  TOP_BAR: 1,
  SEPARATOR: 1,
  STATS_BAR: 1,
  MSG_SEPARATOR: 1,
  MSG_LOG: 5,
  BOTTOM_BORDER: 1,
  get VIEWPORT_TOP() { return this.TOP_BORDER + this.TOP_BAR + this.SEPARATOR; },          // 3
  get HUD_BOTTOM() { return this.SEPARATOR + this.STATS_BAR + this.MSG_SEPARATOR + this.MSG_LOG + this.BOTTOM_BORDER; }, // 9
  get HUD_TOTAL() { return this.VIEWPORT_TOP + this.HUD_BOTTOM; },                         // 12
};

// ─────────────────────────────────────────────
// Word Wrap Utility
// ─────────────────────────────────────────────

export function wordWrap(text, maxWidth) {
  if (!text || maxWidth <= 0) return [''];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxWidth) {
      if (current) { lines.push(current); current = ''; }
      for (let i = 0; i < word.length; i += maxWidth) {
        lines.push(word.slice(i, i + maxWidth));
      }
    } else if (current.length + word.length + 1 <= maxWidth) {
      current += (current ? ' ' : '') + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

// ─────────────────────────────────────────────
// Color Constants (CGA-style palette)
// ─────────────────────────────────────────────

export const COLORS = Object.freeze({
  BLACK:          '#000000',
  BLUE:           '#10106e',
  GREEN:          '#18a040',
  CYAN:           '#40a0b8',
  RED:            '#a82020',
  MAGENTA:        '#8848a0',
  YELLOW:         '#c09820',
  WHITE:          '#b0a8c0',
  BRIGHT_BLACK:   '#586078',
  BRIGHT_BLUE:    '#4848d8',
  BRIGHT_GREEN:   '#40d870',
  BRIGHT_CYAN:    '#60d0e8',
  BRIGHT_RED:     '#e04848',
  BRIGHT_MAGENTA: '#c060d0',
  BRIGHT_YELLOW:  '#f8e060',
  BRIGHT_WHITE:   '#f8f0ff',
  // FF-style UI colors
  FF_BLUE_BG:     '#1a1a2a',
  FF_BLUE_DARK:   '#0e0e14',
  FF_BORDER:      '#b0b0b8',
  FF_CURSOR:      '#f8f0ff',
});

// ─────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });

    this.fontSize = 16;
    this.fontFamily = "'Noto Sans Mono', 'DejaVu Sans Mono', 'Courier New', Courier, monospace";
    this.cellWidth = 0;
    this.cellHeight = 0;
    this.cols = 0;
    this.rows = 0;

    // Double-buffer: current and previous frame cell data
    this.buffer = [];      // current frame being built
    this.prevBuffer = [];  // last rendered frame

    // Cache measured widths for non-ASCII characters to detect overly wide glyphs
    this._charWidthCache = {};

    this.effectsEnabled = false; // visual FX disabled for now (toggle with settings)
    this.zoomLevel = 1;       // legacy compat
    this.densityLevel = 1;    // density zoom: 1, 2, or 3
    this._baseFontSize = null; // stored when zoom is applied

    // Noise for grass wind animation & god rays
    this._grassNoise = new PerlinNoise(new SeededRNG(42));
    this._grassNoise2 = new PerlinNoise(new SeededRNG(137));
    this._godRayNoise = new PerlinNoise(new SeededRNG(256));

    // Perform initial sizing
    this.resize();
  }

  // ── Sizing ──────────────────────────────────

  /**
   * Recalculate font size, cell metrics, canvas dimensions, and
   * allocate fresh cell buffers.
   */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isPortrait = h > w;
    const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    // Fluid font size: lerp between 10px (320px wide) and 18px (2560px wide)
    if (!this._userFontSize) {
      const minW = 320, maxW = 2560, minFont = 10, maxFont = 18;
      const t = Math.max(0, Math.min(1, (w - minW) / (maxW - minW)));
      this.fontSize = Math.round(minFont + t * (maxFont - minFont));
      if (isPortrait) this.fontSize = Math.max(10, this.fontSize - 1);
    }
    // Store base font size (no longer modified by zoom — density zoom is character-based)
    this._baseFontSize = this.fontSize;

    // Measure a representative character to derive cell size
    this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    const metrics = this.ctx.measureText('M');
    this.cellWidth = Math.ceil(metrics.width);
    this.cellHeight = Math.ceil(this.fontSize * 1.35);

    // Reserve space for touch controls on mobile so they don't overlap the game
    const touchReserve = isMobile ? (isPortrait ? 180 : 120) : 0;
    const availH = h - touchReserve;

    // Compute grid to fill available area
    this.cols = Math.floor(w / this.cellWidth);
    this.rows = Math.floor(availH / this.cellHeight);

    // Ultra-wide cap, portrait minimum
    if (this.cols > 160) this.cols = 160;
    if (this.cols < 30) this.cols = 30;
    // Ensure enough rows for HUD
    if (this.rows < LAYOUT.HUD_TOTAL + 5) this.rows = LAYOUT.HUD_TOTAL + 5;

    this.canvas.width = this.cols * this.cellWidth;
    this.canvas.height = this.rows * this.cellHeight;

    // Re-set font after canvas resize (canvas resize clears state)
    this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    this.ctx.textBaseline = 'top';

    // Allocate buffers
    this._allocateBuffers();

    // Force full redraw next frame
    this.prevBuffer = [];
  }

  setFontSize(size) {
    this._userFontSize = true;
    this.fontSize = size;
    this.resize();
  }

  setZoom(level) {
    this.densityLevel = Math.max(1, Math.min(3, Math.round(level)));
    this.zoomLevel = this.densityLevel; // keep in sync for compat
    this.invalidate();
  }

  set enableCRT(val) {
    this.effectsEnabled = !!val;
  }
  get enableCRT() {
    return this.effectsEnabled;
  }

  /**
   * Create empty buffer grids.
   */
  _allocateBuffers() {
    this.buffer = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push({ char: ' ', fg: COLORS.WHITE, bg: COLORS.BLACK, safety: false });
      }
      this.buffer.push(row);
    }
  }

  // ── Frame lifecycle ─────────────────────────

  /**
   * Start a new frame: clear the working buffer.
   */
  beginFrame() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.buffer[r][c];
        cell.char = ' ';
        cell.fg = COLORS.WHITE;
        cell.bg = COLORS.BLACK;
        cell.safety = false;
      }
    }
  }

  /**
   * Force a full redraw on the next endFrame call.
   * Call this after scene transitions, state changes, or anything that
   * modifies the canvas outside the normal buffer pipeline.
   */
  invalidate() {
    this.prevBuffer = [];
  }

  /**
   * Finish the frame: render only cells that changed since last frame.
   * When forceFullRedraw is true, skip dirty checking (needed when
   * post-processing effects or overlays modify the canvas after
   * prevBuffer is snapshotted).
   */
  endFrame(forceFullRedraw = false) {
    const ctx = this.ctx;
    const cw = this.cellWidth;
    const ch = this.cellHeight;
    const hasPrev = !forceFullRedraw && this.prevBuffer.length === this.rows;

    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    ctx.textBaseline = 'top';

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.buffer[r][c];

        // Skip unchanged cells (only when dirty tracking is valid)
        if (hasPrev) {
          const prev = this.prevBuffer[r][c];
          if (
            prev.char === cell.char &&
            prev.fg === cell.fg &&
            prev.bg === cell.bg
          ) {
            continue;
          }
        }

        const x = c * cw;
        const y = r * ch;

        // Background
        ctx.fillStyle = cell.bg;
        ctx.fillRect(x, y, cw, ch);

        // Foreground character
        if (cell.char !== ' ') {
          ctx.fillStyle = cell.fg;
          // Safety: check if non-ASCII char is wider than cell (enemy art only)
          if (cell.safety && cell.char.charCodeAt(0) > 127) {
            const w = this._charWidthCache[cell.char];
            if (w === undefined) {
              this._charWidthCache[cell.char] = ctx.measureText(cell.char).width;
            }
            if ((this._charWidthCache[cell.char] || 0) > cw * 1.3) {
              ctx.fillText('?', x, y); // replace overly wide chars
              continue;
            }
          }
          ctx.fillText(cell.char, x, y);
        }
      }
    }

    // Snapshot current buffer into prevBuffer
    // (skip snapshot when force-redrawing with effects, since canvas
    //  will be modified after this call and dirty tracking would be wrong)
    if (forceFullRedraw) {
      this.prevBuffer = [];
    } else {
      this.prevBuffer = [];
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) {
          const s = this.buffer[r][c];
          row.push({ char: s.char, fg: s.fg, bg: s.bg });
        }
        this.prevBuffer.push(row);
      }
    }
  }

  // ── Drawing primitives ──────────────────────

  /**
   * Fill the entire canvas with black.
   */
  clear() {
    this.ctx.fillStyle = COLORS.BLACK;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.prevBuffer = []; // force full redraw next endFrame
  }

  /**
   * Set a single cell in the buffer.
   */
  drawChar(col, row, char, fg = COLORS.WHITE, bg = COLORS.BLACK, safety = false) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    const cell = this.buffer[row][col];
    cell.char = char;
    cell.fg = fg;
    cell.bg = bg;
    cell.safety = safety;
  }

  /**
   * Write a horizontal string into the buffer.
   */
  drawString(col, row, str, fg = COLORS.WHITE, bg = COLORS.BLACK, maxWidth = 0) {
    // Clip to screen right edge to prevent any horizontal overflow
    const screenLimit = this.cols - col;
    if (screenLimit <= 0) return;
    let len = maxWidth > 0 ? Math.min(str.length, maxWidth) : str.length;
    len = Math.min(len, screenLimit);
    for (let i = 0; i < len; i++) {
      this.drawChar(col + i, row, str[i], fg, bg);
    }
  }

  /**
   * Draw a horizontal separator spanning a box: ├───────┤
   */
  drawSeparator(col, row, w, fg = COLORS.FF_BORDER, bg = COLORS.FF_BLUE_DARK) {
    this.drawChar(col, row, '\u251C', fg, bg);         // ├
    for (let x = 1; x < w - 1; x++) {
      this.drawChar(col + x, row, '\u2500', fg, bg);   // ─
    }
    this.drawChar(col + w - 1, row, '\u2524', fg, bg); // ┤
  }

  /**
   * Write a word-wrapped string into the buffer, returning the number of rows used.
   */
  drawStringWrapped(col, row, str, maxWidth, fg = COLORS.WHITE, bg = COLORS.BLACK) {
    const lines = wordWrap(str, maxWidth);
    for (let i = 0; i < lines.length; i++) {
      this.drawString(col, row + i, lines[i], fg, bg);
    }
    return lines.length;
  }

  /**
   * Draw a Final Fantasy-style window with rounded corners and dark blue bg.
   * ╭─────────╮
   * │         │
   * ╰─────────╯
   * Optional title is centered in the top border.
   */
  drawBox(col, row, w, h, fg = COLORS.FF_BORDER, bg = COLORS.FF_BLUE_DARK, title = null) {
    if (w < 2 || h < 2) return;

    const borderFg = COLORS.FF_BORDER;

    // Corners — rounded FF style
    this.drawChar(col, row, '\u256D', borderFg, bg);             // ╭
    this.drawChar(col + w - 1, row, '\u256E', borderFg, bg);     // ╮
    this.drawChar(col, row + h - 1, '\u2570', borderFg, bg);     // ╰
    this.drawChar(col + w - 1, row + h - 1, '\u256F', borderFg, bg); // ╯

    // Top and bottom edges
    for (let x = 1; x < w - 1; x++) {
      this.drawChar(col + x, row, '\u2500', borderFg, bg);           // ─
      this.drawChar(col + x, row + h - 1, '\u2500', borderFg, bg);   // ─
    }

    // Left and right edges
    for (let y = 1; y < h - 1; y++) {
      this.drawChar(col, row + y, '\u2502', borderFg, bg);           // │
      this.drawChar(col + w - 1, row + y, '\u2502', borderFg, bg);   // │
    }

    // Fill interior with dark blue bg
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        this.drawChar(col + x, row + y, ' ', fg, bg);
      }
    }

    // Optional title centered in top border
    if (title) {
      const maxLen = w - 4;
      const truncated = title.length > maxLen ? title.slice(0, maxLen) : title;
      const tx = col + Math.floor((w - truncated.length) / 2);
      this.drawString(tx, row, truncated, COLORS.BRIGHT_WHITE, bg);
    }
  }

  /**
   * Draw a box with text lines rendered inside.
   * @param {string[]} lines - array of text strings
   */
  drawPanel(col, row, w, h, fg = COLORS.WHITE, bg = COLORS.BLACK, lines = []) {
    this.drawBox(col, row, w, h, fg, bg);

    const maxLen = w - 2;
    let lineY = 0;
    for (let i = 0; i < lines.length && lineY < h - 2; i++) {
      const wrapped = wordWrap(lines[i], maxLen);
      for (const wl of wrapped) {
        if (lineY >= h - 2) break;
        this.drawString(col + 1, row + 1 + lineY, wl, fg, bg);
        lineY++;
      }
    }
  }

  /**
   * Fill a rectangular region with a single character.
   */
  fillRect(col, row, w, h, char = ' ', fg = COLORS.WHITE, bg = COLORS.BLACK) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.drawChar(col + x, row + y, char, fg, bg);
      }
    }
  }

  // ── Day/night tint overlay ─────────────────

  /**
   * Apply a color tint overlay to the entire canvas.
   * @param {string} color - CSS color (e.g. 'rgba(0,0,50,0.3)')
   * @param {number} alpha - opacity 0-1
   */
  tintOverlay(color, alpha) {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  /**
   * Apply day/night tint based on time-of-day phase string. (Legacy)
   */
  applyDayNightTint(timeOfDay) {
    switch (timeOfDay) {
      case 'night':
        this.tintOverlay('#000033', 0.35);
        break;
      case 'dawn':
        this.tintOverlay('#332200', 0.15);
        break;
      case 'evening':
        this.tintOverlay('#331100', 0.2);
        break;
    }
  }

  /**
   * Apply a tint overlay only within the gameplay viewport rectangle.
   * Does NOT affect HUD, stats bar, or message log.
   */
  tintViewport(color, alpha, viewLeft, viewTop, viewW, viewH) {
    if (alpha <= 0.005) return;
    const ctx = this.ctx;
    const x = viewLeft * this.cellWidth;
    const y = viewTop * this.cellHeight;
    const w = viewW * this.cellWidth;
    const h = viewH * this.cellHeight;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * Darken a specific cell by blending with a color.
   * Used for shadows.
   */
  darkenCell(col, row, alpha) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    if (alpha <= 0) return;
    const ctx = this.ctx;
    const x = col * this.cellWidth;
    const y = row * this.cellHeight;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
    ctx.restore();
  }

  /**
   * Brighten a specific cell with a warm tint (for god rays).
   */
  brightenCell(col, row, alpha, tintColor) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    if (alpha <= 0) return;
    const ctx = this.ctx;
    const x = col * this.cellWidth;
    const y = row * this.cellHeight;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = tintColor || '#FFEEAA';
    ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
    ctx.restore();
  }

  /**
   * Apply light color tinting to a cell (for colored light sources).
   */
  tintCell(col, row, color, alpha) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    if (alpha <= 0) return;
    const ctx = this.ctx;
    const x = col * this.cellWidth;
    const y = row * this.cellHeight;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
    ctx.restore();
  }

  // ── Animated color cycling ────────────────

  /**
   * Return an animated color for special tile types.
   * @param {string} baseColor - the tile's static fg color
   * @param {string} tileType - SHALLOWS, DEEP_LAKE, LAVA, FIREPLACE, etc.
   * @returns {string} the current animated color
   */
  getAnimatedColor(baseColor, tileType) {
    const t = Date.now() / 500;
    const phase = Math.sin(t) * 0.5 + 0.5; // 0-1

    switch (tileType) {
      // ── Water types ──
      case 'ABYSS': {
        const abyssColors = ['#000033', '#000022', '#000044'];
        return abyssColors[Math.floor(t * 0.5) % abyssColors.length];
      }
      case 'DEEP_OCEAN':
      case 'DEEP_LAKE': {
        const deeps = ['#000088', '#000066', '#001199'];
        return deeps[Math.floor(t) % deeps.length];
      }
      case 'OCEAN': {
        const oceans = ['#0044AA', '#0055BB', '#003399'];
        return oceans[Math.floor(t) % oceans.length];
      }
      case 'SHALLOWS':
      case 'WATER': {
        const blues = ['#0055AA', '#0066BB', '#0044AA'];
        return blues[Math.floor(t) % blues.length];
      }
      case 'TIDAL_POOL': {
        const tides = ['#66AADD', '#5599CC', '#77BBEE'];
        return tides[Math.floor(t * 1.5) % tides.length];
      }
      case 'TOXIC_SUMP': {
        const toxics = ['#44FF00', '#33DD00', '#55FF22'];
        return toxics[Math.floor(t) % toxics.length];
      }
      // ── Wetland types ──
      case 'MIRE':
      case 'BOG': {
        const bogs = ['#228844', '#1A7733', '#2A9955'];
        return bogs[Math.floor(t * 0.7) % bogs.length];
      }
      case 'MARSH_REEDS': {
        const reeds = ['#55AA44', '#4D9940', '#5DBB48'];
        return reeds[Math.floor(t * 0.8) % reeds.length];
      }
      // ── Fire/heat types ──
      case 'LAVA': {
        const r = Math.floor(200 + phase * 55);
        const g = Math.floor(50 + phase * 80);
        return `rgb(${r},${g},0)`;
      }
      case 'FIREPLACE':
      case 'CAMPFIRE': {
        const r = Math.floor(220 + phase * 35);
        const g = Math.floor(80 + phase * 100);
        return `rgb(${r},${g},0)`;
      }
      case 'THERMAL_VENT': {
        const r = Math.floor(220 + phase * 35);
        const g = Math.floor(100 + phase * 50);
        return `rgb(${r},${g},20)`;
      }
      case 'REACTOR_SLAG': {
        const r = Math.floor(200 + phase * 55);
        const g = Math.floor(60 + phase * 50);
        return `rgb(${r},${g},0)`;
      }
      // ── Anomaly types ──
      case 'FUNGAL_NET': {
        const fungi = ['#CC88FF', '#BB77EE', '#DD99FF'];
        return fungi[Math.floor(t * 0.6) % fungi.length];
      }
      case 'GLITCH_ZONE': {
        const glitches = ['#FF0088', '#EE0077', '#FF2299', '#DD0066'];
        return glitches[Math.floor(t * 2) % glitches.length];
      }
      case 'CRYSTAL_ZONE': {
        const crystals = ['#44FFFF', '#33EEFF', '#55FFEE'];
        return crystals[Math.floor(t * 0.9) % crystals.length];
      }
      case 'VOID_RIFT': {
        const voids = ['#220044', '#110033', '#330055'];
        return voids[Math.floor(t * 0.4) % voids.length];
      }
      // ── Mechanical structure types ──
      case 'MANUFACTORY_FURNACE': {
        const r = Math.floor(200 + phase * 55);
        const g = Math.floor(70 + phase * 50);
        return `rgb(${r},${g},10)`;
      }
      case 'MANUFACTORY_GEAR':
      case 'CLOCKWORK_GEAR':
      case 'BORE_GEAR':
      case 'MECH_GEAR': {
        const gears = ['#CCAA44', '#BB9933', '#DDBB55'];
        return gears[Math.floor(t * 0.4) % gears.length];
      }
      case 'CLOCKWORK_FLYWHEEL': {
        const r = Math.floor(220 + phase * 35);
        const g = Math.floor(180 + phase * 40);
        return `rgb(${r},${g},40)`;
      }
      case 'BORE_SLAG': {
        const r = Math.floor(180 + phase * 50);
        const g = Math.floor(40 + phase * 30);
        return `rgb(${r},${g},0)`;
      }
      case 'BORE_DRILL': {
        const drills = ['#AABBCC', '#BBCCDD', '#99AABB', '#CCDDEE'];
        return drills[Math.floor(t * 3) % drills.length];
      }
      case 'PIPE_VALVE':
      case 'MECH_VALVE': {
        const valves = ['#FF4444', '#EE3333', '#FF5555', '#DD2222'];
        return valves[Math.floor(t * 1.5) % valves.length];
      }
      case 'TURBINE_NACELLE': {
        const nacelles = ['#EEDDAA', '#DDCC99', '#FFEEBB'];
        return nacelles[Math.floor(t * 2) % nacelles.length];
      }
      case 'TURBINE_BLADE': {
        const blades = ['#BBDDFF', '#AACCEE', '#CCEEFF', '#99BBDD'];
        return blades[Math.floor(t * 4) % blades.length];
      }
      case 'CRANE_BASIN': {
        const basin = ['#224466', '#1A3355', '#2A5577'];
        return basin[Math.floor(t * 0.7) % basin.length];
      }
      case 'MECH_CONDUIT': {
        const conduits = ['#44AAFF', '#3399EE', '#55BBFF'];
        return conduits[Math.floor(t * 2) % conduits.length];
      }
      default:
        return baseColor;
    }
  }

  /**
   * Return an animated character for foliage/decorative tiles.
   * @param {string} baseChar - the tile's static character
   * @param {string} tileType - optional tile type hint
   * @param {number} [worldX] - world x coordinate for position-based animation
   * @param {number} [worldY] - world y coordinate for position-based animation
   * @returns {string} the current animated character
   */
  getAnimatedChar(baseChar, tileType, worldX, worldY) {
    const t = Date.now();
    switch (baseChar) {
      // Trees: fast fluid sway
      case '\u2663': // ♣
      case '\u2660': // ♠
      case 'T': {
        const cycle = Math.floor(t / 800) % 4;
        const trees = ['\u2663', '\u2663', '\u2660', '\u2660'];
        return trees[cycle];
      }
      // Flowers: lively cycling
      case '\u273F': // ✿
      case '\u2740': // ❀
      case '\u273B': { // ✻
        const cycle = Math.floor(t / 900) % 3;
        const flowers = ['\u273F', '\u2740', '\u273B'];
        return flowers[(flowers.indexOf(baseChar) + cycle) % 3];
      }
      // Grass/low vegetation: noise-based wind waves
      case ',':
      case '`':
      case '.': {
        if (worldX !== undefined && worldY !== undefined) {
          const ts = t / 1000;
          // Wind direction ~17° from east with slight south component
          const windAngle = 0.3;
          const cosW = Math.cos(windAngle), sinW = Math.sin(windAngle);
          const along = worldX * cosW + worldY * sinW;
          const perp = -worldX * sinW + worldY * cosW;
          // Primary traveling wave
          const n = this._grassNoise.noise2D(along * 0.15 - ts * 0.5, perp * 0.08);
          // Secondary chaos noise
          const n2 = this._grassNoise2.noise2D(worldX * 0.25 + ts * 0.2, worldY * 0.25 - ts * 0.12);
          const combined = n * 0.7 + n2 * 0.3;
          if (combined > 0.35) return '/';
          if (combined > 0.1) return '`';
          if (combined < -0.35) return '\\';
          if (combined < -0.1) return '.';
          return ',';
        }
        // Fallback: original uniform animation
        const cycle = Math.floor(t / 1400) % 4;
        return [',', '`', '.', ','][cycle];
      }
      // Water features
      case '~': {
        const cycle = Math.floor(t / 400) % 3;
        const water = ['~', '\u2248', '~']; // ~ ≈ ~
        return water[cycle];
      }
      default:
        return baseChar;
    }
  }

  /**
   * Return an animated color for grass tiles based on wind noise.
   * @param {string} baseColor
   * @param {string} tileType
   * @param {number} [worldX]
   * @param {number} [worldY]
   * @returns {string}
   */
  getAnimatedColorWithPos(baseColor, tileType, worldX, worldY) {
    if (tileType === 'GRASSLAND' && worldX !== undefined && worldY !== undefined) {
      const ts = Date.now() / 1000;
      const windAngle = 0.3;
      const cosW = Math.cos(windAngle), sinW = Math.sin(windAngle);
      const along = worldX * cosW + worldY * sinW;
      const perp = -worldX * sinW + worldY * cosW;
      const n = this._grassNoise.noise2D(along * 0.15 - ts * 0.5, perp * 0.08);
      // Brighten on wind gusts, darken in calm
      const boost = n * 0.15; // -0.15 to +0.15
      return this._adjustBrightness(baseColor, boost);
    }
    return this.getAnimatedColor(baseColor, tileType);
  }

  _adjustBrightness(hex, amount) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return hex;
    const val = parseInt(hex.slice(1), 16);
    let r = (val >> 16) & 0xff, g = (val >> 8) & 0xff, b = val & 0xff;
    const shift = Math.round(amount * 255);
    r = Math.max(0, Math.min(255, r + shift));
    g = Math.max(0, Math.min(255, g + shift));
    b = Math.max(0, Math.min(255, b + shift));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // ── CRT Post-processing ────────────────────

  /**
   * Run all enabled post-processing effects.
   */
  postProcess() {
    if (!this.effectsEnabled) return;
    const opts = this.crtOptions || {};
    if (opts.crtGlow !== false) this.applyPhosphorGlow();
    if (opts.crtScanlines !== false) this.applyScanlines();
    if (opts.crtAberration !== false) this.applyChromaAberration();
    this.applyFlicker();
    this.applyVignette();
    this.applyGlitch();
  }

  /**
   * Phosphor glow: bloom effect using offscreen canvas with blur.
   */
  applyPhosphorGlow() {
    this._glowFrame = (this._glowFrame || 0) + 1;
    if (this._glowFrame % 2 !== 0) return; // only every 2nd frame

    const w = this.canvas.width;
    const h = this.canvas.height;
    const scale = 0.25;
    const sw = Math.floor(w * scale);
    const sh = Math.floor(h * scale);

    if (!this._glowCanvas) {
      this._glowCanvas = document.createElement('canvas');
    }
    this._glowCanvas.width = sw;
    this._glowCanvas.height = sh;

    const gCtx = this._glowCanvas.getContext('2d');
    gCtx.filter = 'blur(3px)';
    gCtx.drawImage(this.canvas, 0, 0, sw, sh);

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.10;
    ctx.drawImage(this._glowCanvas, 0, 0, w, h);
    ctx.restore();

    // Subtle blue phosphor tint (FF-style)
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 30, 0.015)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * Scanlines proportional to cell height.
   */
  applyScanlines() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const spacing = Math.max(2, Math.floor(this.cellHeight / 3));
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let y = 0; y < h; y += spacing) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  /**
   * Subtle chromatic aberration: shift R left, B right by 1px.
   */
  applyChromaAberration() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;
    const shifted = ctx.createImageData(w, h);
    const dst = shifted.data;
    const offset = 1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const rSrc = (y * w + Math.max(0, x - offset)) * 4;
        const bSrc = (y * w + Math.min(w - 1, x + offset)) * 4;
        dst[i] = src[rSrc];         // R from left
        dst[i + 1] = src[i + 1];    // G stays
        dst[i + 2] = src[bSrc + 2]; // B from right
        dst[i + 3] = 255;
      }
    }
    ctx.putImageData(shifted, 0, 0);
  }

  /**
   * Random subtle flicker by modulating global alpha.
   */
  applyFlicker() {
    const ctx = this.ctx;
    const variance = Math.random() * 0.012;
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${variance})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  /**
   * Radial vignette: darkened corners.
   */
  applyVignette() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(cx, cy);

    const grad = ctx.createRadialGradient(cx, cy, radius * 0.45, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');

    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * Rare glitch: horizontal row shift triggered by damage or random chance.
   */
  applyGlitch() {
    if (!this._glitchActive && Math.random() > 0.002) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const ch = this.cellHeight;
    const rows = this.rows;

    const glitchRows = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < glitchRows; i++) {
      const row = Math.floor(Math.random() * rows);
      const shift = (Math.random() * 6 - 3) | 0;
      const y = row * ch;
      const imgData = ctx.getImageData(0, y, w, ch);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, y, w, ch);
      ctx.putImageData(imgData, shift, y);
    }
    this._glitchActive = false;
  }

  /**
   * Trigger a glitch effect (call from combat hits, damage, etc.)
   */
  triggerGlitch() {
    this._glitchActive = true;
  }

  /**
   * Screen flash effect for critical hits, level-ups, etc.
   * @param {string} color - flash color
   * @param {number} alpha - flash intensity 0-1
   */
  flash(color, alpha) {
    this._flashColor = color;
    this._flashAlpha = alpha;
  }

  /**
   * Apply and decay the flash overlay.
   */
  applyFlash() {
    if (!this._flashAlpha || this._flashAlpha <= 0) return;
    this.tintOverlay(this._flashColor || '#ffffff', this._flashAlpha);
    this._flashAlpha -= 0.05;
    if (this._flashAlpha <= 0) {
      this._flashAlpha = 0;
      this._flashColor = null;
    }
  }
}

// ─────────────────────────────────────────────
// ParticleSystem — Lightweight character-based particle effects
// ─────────────────────────────────────────────

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  /**
   * Emit particles at a world position.
   * @param {number} x - world x
   * @param {number} y - world y
   * @param {string} char - particle character
   * @param {string} fg - particle color
   * @param {number} count - number of particles
   * @param {number} spread - max distance from origin
   * @param {number} lifetime - frames until particle dies
   */
  emit(x, y, char, fg, count = 5, spread = 3, lifetime = 15) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * spread * 0.15,
        vy: (Math.random() - 0.5) * spread * 0.15 - 0.05,
        char,
        fg,
        life: lifetime,
        maxLife: lifetime,
      });
    }
  }

  /**
   * Update all particles, removing dead ones.
   */
  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.01; // slight gravity
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * Render particles to the renderer relative to camera.
   */
  render(renderer, cameraX, cameraY) {
    const viewLeft = 1;
    const viewTop = LAYOUT.VIEWPORT_TOP;
    const viewW = renderer.cols - 2;
    const viewH = renderer.rows - LAYOUT.HUD_TOTAL;
    const density = renderer.densityLevel;
    const entityOff = Math.floor(density / 2);
    for (const p of this.particles) {
      const wx_off = Math.round(p.x - cameraX);
      const wy_off = Math.round(p.y - cameraY);
      const screenX = wx_off * density + entityOff;
      const screenY = wy_off * density + entityOff;
      if (screenX >= 0 && screenX < viewW && screenY >= 0 && screenY < viewH) {
        const fade = p.life / p.maxLife;
        if (fade > 0.3) {
          renderer.drawChar(viewLeft + screenX, viewTop + screenY, p.char, p.fg);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────
// Camera
// ─────────────────────────────────────────────

export class Camera {
  /**
   * @param {number} viewportCols - number of visible columns
   * @param {number} viewportRows - number of visible rows
   */
  constructor(viewportCols, viewportRows) {
    this.viewportCols = viewportCols;
    this.viewportRows = viewportRows;

    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;

    this.lerpSpeed = 0.2;
  }

  /**
   * Center the camera target on the given entity's position.
   * Entity must have numeric x and y properties.
   */
  follow(entity) {
    const ex = entity.position ? entity.position.x : entity.x;
    const ey = entity.position ? entity.position.y : entity.y;
    this.targetX = ex - Math.floor(this.viewportCols / 2);
    this.targetY = ey - Math.floor(this.viewportRows / 2);
  }

  /**
   * Smoothly interpolate toward the target position.
   */
  update() {
    this.x += (this.targetX - this.x) * this.lerpSpeed;
    this.y += (this.targetY - this.y) * this.lerpSpeed;

    // Snap when very close to avoid sub-pixel jitter
    if (Math.abs(this.targetX - this.x) < 0.01) this.x = this.targetX;
    if (Math.abs(this.targetY - this.y) < 0.01) this.y = this.targetY;
  }

  /**
   * Convert world coordinates to screen column/row.
   */
  worldToScreen(wx, wy) {
    return {
      col: Math.round(wx - this.x),
      row: Math.round(wy - this.y),
    };
  }

  /**
   * Convert screen column/row to world coordinates.
   */
  screenToWorld(col, row) {
    return {
      wx: Math.round(col + this.x),
      wy: Math.round(row + this.y),
    };
  }

  /**
   * Check whether a world position falls inside the current viewport.
   */
  isVisible(wx, wy) {
    const sc = wx - this.x;
    const sr = wy - this.y;
    return sc >= 0 && sc < this.viewportCols && sr >= 0 && sr < this.viewportRows;
  }
}

// ─────────────────────────────────────────────
// InputManager
// ─────────────────────────────────────────────

export class InputManager {
  constructor() {
    // Keyboard state
    this._keysDown = new Set();       // currently held
    this._keysPressed = new Set();    // newly pressed this frame
    this._keysDownPrev = new Set();   // held last frame

    // Action queue (one action at a time)
    this.lastAction = null;

    // Key repeat system — fires repeated actions when direction keys are held
    this._repeatKey = null;           // which key is being repeated
    this._repeatDelay = 220;          // ms before first repeat fires
    this._repeatInterval = 90;        // ms between subsequent repeats
    this._repeatTimer = null;         // setTimeout handle
    this._repeatIntervalTimer = null; // setInterval handle

    // Direction keys eligible for repeat
    this._repeatableKeys = new Set([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
      '1', '2', '3', '4', '6', '7', '8', '9',
    ]);

    // Mobile detection
    this.isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this._enableTouch = true;

    // Touch handedness mode: 'dual', 'left', 'right'
    this._touchMode = localStorage.getItem('touchMode') || 'dual';
    // Current action tab index (for tabbed button sets)
    this._actionTab = 0;
    // Debug state provider callback (set by Game to query toggle states)
    this._debugStateProvider = null;

    // Text input mode (for mobile keyboard)
    this._textInputMode = false;
    this._textInput = document.getElementById('mobile-text-input');
    this._textInputPrevValue = '';
    this._onTextInput = this._onTextInput.bind(this);
    this._onTextInputKeyDown = this._onTextInputKeyDown.bind(this);

    // Bind event listeners
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    // Touch / dpad setup
    this._initTouchControls();
  }

  // ── Keyboard events ────────────────────────

  _onKeyDown(e) {
    // In text input mode, let the hidden input handle character keys
    if (this._textInputMode && e.key.length === 1) return;

    // Prevent default for game keys so the page doesn't scroll
    const gameKeys = [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      ' ', 'Enter', 'Tab',
    ];
    if (gameKeys.includes(e.key)) {
      e.preventDefault();
    }
    this._keysDown.add(e.key);
    // Queue the key as a game action so the game loop can process it
    this.lastAction = e.key;

    // Start key repeat for direction keys
    if (this._repeatableKeys.has(e.key) && this._repeatKey !== e.key) {
      this._startRepeat(e.key);
    }
  }

  _onKeyUp(e) {
    this._keysDown.delete(e.key);
    // Stop key repeat if this was the repeating key
    if (this._repeatKey === e.key) {
      this._stopRepeat();
    }
  }

  // ── Key repeat helpers ──────────────────────

  _startRepeat(key) {
    this._stopRepeat();
    this._repeatKey = key;
    // After initial delay, start firing repeats at interval
    this._repeatTimer = setTimeout(() => {
      this._repeatIntervalTimer = setInterval(() => {
        if (this._keysDown.has(key)) {
          this.lastAction = key;
        } else {
          this._stopRepeat();
        }
      }, this._repeatInterval);
    }, this._repeatDelay);
  }

  _stopRepeat() {
    this._repeatKey = null;
    if (this._repeatTimer) {
      clearTimeout(this._repeatTimer);
      this._repeatTimer = null;
    }
    if (this._repeatIntervalTimer) {
      clearInterval(this._repeatIntervalTimer);
      this._repeatIntervalTimer = null;
    }
  }

  // ── Touch / d-pad ──────────────────────────

  _initTouchControls() {
    // Show touch controls on mobile
    const touchDiv = document.getElementById('touch-controls');
    if (touchDiv && this.isMobile) {
      touchDiv.classList.remove('hidden');
    }

    this._touchDiv = touchDiv;
    // All buttons are created dynamically by updateTouchLayout()
  }

  set enableTouch(val) {
    this._enableTouch = !!val;
    if (this._touchDiv) {
      if (val && this.isMobile) {
        this._touchDiv.classList.remove('hidden');
      } else if (!val) {
        this._touchDiv.classList.add('hidden');
      }
    }
  }
  get enableTouch() { return this._enableTouch; }

  // ── Context-adaptive touch layout ──────────

  /**
   * Touch button layout configurations per game state.
   */
  // Grid-based touch layouts: each page is an array of rows, each row has 3 cells
  // Cell types: 'dpad', 'dpad-center', 'action', 'action-primary', 'debug', 'debug-cmd', 'empty'
  // null = empty spacer cell
  // pageNames: optional array of labels shown on the tab button
  static _E = null; // shorthand for empty cell
  static TOUCH_LAYOUTS = {
    // ── Title / Main Menu ──
    MENU: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: 'SEL', key: 'Enter', type: 'action-primary' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'HELP', key: '?', type: 'action' }, { label: 'SET', key: 'o', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
    ]]},
    // ── Character Creation ──
    CHAR_CREATE: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: 'SEL', key: 'Enter', type: 'action-primary' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'HELP', key: '?', type: 'action' }, null, { label: 'BACK', key: 'Escape', type: 'action' }],
    ]]},
    // ── Loading ──
    LOADING: { pages: [[[null, null, null]]] },
    // ── Gameplay (Overworld / Location / Dungeon) — 8 thematic pages ──
    GAMEPLAY: {
      pageNames: ['Explore', 'Actions', 'Combat', 'Dungeon', 'Town', 'Items', 'Dbg World', 'Dbg Player'],
      pages: [
      // Page 1: Explore (Overworld)
      [
        [{ label: 'ACT', key: 'Enter', type: 'action-primary' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'ENTR', key: 'e', type: 'action' }],
        [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: '\u25CF', key: 'wait', type: 'dpad-center' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
        [{ label: 'TALK', key: 't', type: 'action' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: 'REST', key: 'r', type: 'action' }],
        [{ label: 'MAP', key: 'm', type: 'action' }, { label: 'CHR', key: 'c', type: 'action' }, { label: 'INV', key: 'i', type: 'action' }],
        [{ label: 'QST', key: 'q', type: 'action' }, { label: 'SAVE', key: 'p', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
      // Page 2: Actions (Secondary)
      [
        [{ label: 'NAV', key: 'n', type: 'action' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'CMP', key: 'j', type: 'action' }],
        [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: '\u25CF', key: 'wait', type: 'dpad-center' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
        [{ label: 'FCTN', key: 'f', type: 'action' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: 'ALM', key: 'l', type: 'action' }],
        [{ label: 'SET', key: 'o', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }, { label: 'LOG', key: 'F2', type: 'action' }],
        [{ label: 'ZM+', key: '+', type: 'action' }, { label: 'ZM-', key: '-', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
      // Page 3: Combat
      [
        [{ label: 'ATK', key: 'a', type: 'action-primary' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'FLEE', key: 'f', type: 'action' }],
        [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: 'SEL', key: 'Enter', type: 'action-primary' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
        [{ label: 'AB1', key: '1', type: 'action' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: 'AB2', key: '2', type: 'action' }],
        [{ label: 'AB3', key: '3', type: 'action' }, { label: 'WAIT', key: 'wait', type: 'dpad-center' }, { label: 'INV', key: 'i', type: 'action' }],
        [{ label: 'CHR', key: 'c', type: 'action' }, { label: 'MAP', key: 'm', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
      // Page 4: Dungeon
      [
        [{ label: 'GET', key: 'g', type: 'action' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'STR', key: '>', type: 'action' }],
        [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: '\u25CF', key: 'wait', type: 'dpad-center' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
        [{ label: 'ACT', key: 'Enter', type: 'action-primary' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: 'TALK', key: 't', type: 'action' }],
        [{ label: 'AB1', key: '1', type: 'action' }, { label: 'AB2', key: '2', type: 'action' }, { label: 'AB3', key: '3', type: 'action' }],
        [{ label: 'MAP', key: 'm', type: 'action' }, { label: 'INV', key: 'i', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
      // Page 5: Town
      [
        [{ label: 'TALK', key: 't', type: 'action' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'ACT', key: 'Enter', type: 'action-primary' }],
        [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: '\u25CF', key: 'wait', type: 'dpad-center' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
        [{ label: 'REST', key: 'r', type: 'action' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: 'ENTR', key: 'e', type: 'action' }],
        [{ label: 'SHOP', key: 's', type: 'action' }, { label: 'INV', key: 'i', type: 'action' }, { label: 'CHR', key: 'c', type: 'action' }],
        [{ label: 'SAVE', key: 'p', type: 'action' }, { label: 'MAP', key: 'm', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
      // Page 6: Items & Inventory
      [
        [{ label: 'USE', key: 'Enter', type: 'action-primary' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'EQP', key: 'e', type: 'action' }],
        [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: '\u25CF', key: 'wait', type: 'dpad-center' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
        [{ label: 'DROP', key: 'd', type: 'action' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: 'SELL', key: 's', type: 'action' }],
        [{ label: 'ZM+', key: '+', type: 'action' }, { label: 'ZM-', key: '-', type: 'action' }, { label: 'CHR', key: 'c', type: 'action' }],
        [{ label: 'QST', key: 'q', type: 'action' }, { label: 'DBG', key: '`', type: 'debug' }, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
      // Page 7: Debug — World / Visual
      [
        [{ label: 'H+', key: 'debug:hourInc', type: 'debug-cmd' }, { label: 'H-', key: 'debug:hourDec', type: 'debug-cmd' }, { label: 'ADV', key: 'debug:advanceDay', type: 'debug-cmd' }],
        [{ label: 'W>', key: 'debug:weatherNext', type: 'debug-cmd' }, { label: 'W<', key: 'debug:weatherPrev', type: 'debug-cmd' }, { label: 'CRT', key: 'debug:crtEffects', type: 'debug-cmd' }],
        [{ label: 'SHD', key: 'debug:disableShadows', type: 'debug-cmd' }, { label: 'LIT', key: 'debug:disableLighting', type: 'debug-cmd' }, { label: 'CLD', key: 'debug:disableClouds', type: 'debug-cmd' }],
        [{ label: 'RMAP', key: 'debug:revealMap', type: 'debug-cmd' }, { label: 'DBG', key: '`', type: 'debug' }, { label: 'LOG', key: 'F2', type: 'action' }],
        [null, null, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
      // Page 8: Debug — Player / Cheats
      [
        [{ label: 'GOD', key: 'debug:invincible', type: 'debug-cmd' }, { label: 'ENC', key: 'debug:noEncounters', type: 'debug-cmd' }, { label: 'NCP', key: 'debug:noClip', type: 'debug-cmd' }],
        [{ label: '\u221EATK', key: 'debug:infiniteAttack', type: 'debug-cmd' }, { label: '\u221EMP', key: 'debug:infiniteMana', type: 'debug-cmd' }, { label: 'HEAL', key: 'debug:fullHeal', type: 'debug-cmd' }],
        [{ label: '+XP', key: 'debug:giveXP', type: 'debug-cmd' }, { label: '+GP', key: 'debug:giveGold', type: 'debug-cmd' }, { label: 'LVL', key: 'debug:levelUp', type: 'debug-cmd' }],
        [{ label: 'TELE', key: 'debug:teleport', type: 'debug-cmd' }, { label: 'DBG', key: '`', type: 'debug' }, { label: 'LOG', key: 'F2', type: 'action' }],
        [null, null, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
    ]},
    // ── Combat ──
    COMBAT: {
      pageNames: ['Fight', 'Debug'],
      pages: [
      // Page 1: Combat Actions
      [
        [{ label: 'ATK', key: 'a', type: 'action-primary' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'FLEE', key: 'f', type: 'action' }],
        [{ label: 'HELP', key: '?', type: 'action' }, { label: 'SEL', key: 'Enter', type: 'action-primary' }, null],
        [{ label: 'AB1', key: '1', type: 'action' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: 'AB2', key: '2', type: 'action' }],
        [{ label: 'AB3', key: '3', type: 'action' }, { label: 'INV', key: 'i', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
      // Page 2: Combat Debug
      [
        [{ label: 'GOD', key: 'debug:invincible', type: 'debug-cmd' }, { label: '\u221EATK', key: 'debug:infiniteAttack', type: 'debug-cmd' }, { label: '\u221EMP', key: 'debug:infiniteMana', type: 'debug-cmd' }],
        [{ label: 'ENC', key: 'debug:noEncounters', type: 'debug-cmd' }, { label: 'HEAL', key: 'debug:fullHeal', type: 'debug-cmd' }, { label: '+XP', key: 'debug:giveXP', type: 'debug-cmd' }],
        [{ label: '+GP', key: 'debug:giveGold', type: 'debug-cmd' }, { label: 'LVL', key: 'debug:levelUp', type: 'debug-cmd' }, { label: 'LOG', key: 'F2', type: 'action' }],
        [{ label: 'DBG', key: '`', type: 'debug' }, null, { label: 'ESC', key: 'Escape', type: 'action' }],
      ],
    ]},
    // ── Dialogue ──
    DIALOGUE: { pages: [[
      [{ label: 'A', key: 'a', type: 'action' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'B', key: 'b', type: 'action' }],
      [{ label: 'C', key: 'c', type: 'action' }, { label: 'SEL', key: 'Enter', type: 'action-primary' }, { label: 'D', key: 'd', type: 'action' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'HELP', key: '?', type: 'action' }, null, { label: 'ESC', key: 'Escape', type: 'action' }],
    ]]},
    // ── Shop ──
    SHOP: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: 'SEL', key: 'Enter', type: 'action-primary' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'HELP', key: '?', type: 'action' }, { label: 'SELL', key: 's', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
    ]]},
    // ── Inventory ──
    INVENTORY: { pages: [[
      [{ label: 'USE', key: 'Enter', type: 'action-primary' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: 'EQP', key: 'e', type: 'action' }],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, null, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [{ label: 'DROP', key: 'd', type: 'action' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: 'SELL', key: 's', type: 'action' }],
      [{ label: 'BACK', key: 'Escape', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }, null],
    ]]},
    // ── Character Sheet ──
    CHARACTER: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [null, null, null],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'BACK', key: 'Escape', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }, null],
    ]]},
    // ── Quest Log ──
    QUEST_LOG: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: 'TRK', key: 'Enter', type: 'action-primary' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'NAV', key: 'n', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
    ]]},
    // ── Map ──
    MAP: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, null, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'ZM+', key: '+', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }, { label: 'ZM-', key: '-', type: 'action' }],
      [null, { label: 'ESC', key: 'Escape', type: 'action' }, null],
    ]]},
    // ── Help ──
    HELP: { pages: [[
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [{ label: '1', key: '1', type: 'tab' }, { label: '2', key: '2', type: 'tab' }, { label: '3', key: '3', type: 'tab' }],
      [{ label: '4', key: '4', type: 'tab' }, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, { label: '5', key: '5', type: 'tab' }],
      [{ label: '6', key: '6', type: 'tab' }, { label: '7', key: '7', type: 'tab' }, { label: '8', key: '8', type: 'tab' }],
      [{ label: 'BACK', key: 'Escape', type: 'action' }, null, null],
    ]]},
    // ── Settings ──
    SETTINGS: { pages: [[
      [{ label: '1', key: '1', type: 'action' }, { label: '2', key: '2', type: 'action' }, { label: '3', key: '3', type: 'action' }],
      [{ label: '4', key: '4', type: 'action' }, { label: '5', key: '5', type: 'action' }, { label: '6', key: '6', type: 'action' }],
      [{ label: '7', key: '7', type: 'action' }, { label: '8', key: '8', type: 'action' }, { label: 'EXP', key: '9', type: 'action' }],
      [{ label: 'IMP', key: '0', type: 'action' }, { label: 'BACK', key: 'Escape', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }],
    ]]},
    // ── Game Over ──
    GAME_OVER: { pages: [[
      [null, null, null],
      [null, { label: 'MENU', key: 'Enter', type: 'action-primary' }, null],
    ]]},
    // ── Battle Results ──
    BATTLE_RESULTS: { pages: [[
      [null, null, null],
      [null, { label: 'OK', key: 'Enter', type: 'action-primary' }, null],
      [null, null, null],
    ]]},
    // ── Debug Menu ──
    DEBUG_MENU: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: 'SEL', key: 'Enter', type: 'action-primary' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'LOG', key: 'l', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
    ]]},
    // ── Console Log ──
    CONSOLE_LOG: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [null, { label: 'HELP', key: '?', type: 'action' }, null],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'HOME', key: 'Home', type: 'action' }, { label: 'END', key: 'End', type: 'action' }, { label: 'ESC', key: 'Escape', type: 'action' }],
    ]]},
    // ── Faction ──
    FACTION: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, null, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'BACK', key: 'Escape', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }, null],
    ]]},
    // ── Quest Compass ──
    QUEST_COMPASS: { pages: [[
      [null, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, null],
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, null, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'BACK', key: 'Escape', type: 'action' }, { label: 'HELP', key: '?', type: 'action' }, null],
    ]]},
    // ── Almanac ──
    ALMANAC: { pages: [[
      [{ label: '\u25C4', key: 'ArrowLeft', type: 'dpad' }, { label: '\u25B2', key: 'ArrowUp', type: 'dpad' }, { label: '\u25BA', key: 'ArrowRight', type: 'dpad' }],
      [null, null, null],
      [null, { label: '\u25BC', key: 'ArrowDown', type: 'dpad' }, null],
      [{ label: 'BACK', key: 'Escape', type: 'action' }, null, null],
    ]]},
  };

  get touchMode() { return this._touchMode; }

  /**
   * Update touch control layout based on current game state.
   * Renders a 3-wide grid with d-pad + action buttons.
   */
  updateTouchLayout(state) {
    if (!this._touchDiv) return;
    // Reset tab to page 1 when entering a different state
    if (state !== this._lastTouchState) {
      this._actionTab = 0;
    }
    this._lastTouchState = state;
    const layout = InputManager.TOUCH_LAYOUTS[state] || InputManager.TOUCH_LAYOUTS.GAMEPLAY;
    const pages = layout.pages;

    // Clamp tab index
    if (this._actionTab >= pages.length) this._actionTab = 0;

    const gridContainer = this._touchDiv.querySelector('.touch-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';
    const currentPage = pages[this._actionTab] || [[]];
    const dirToKey = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };

    // Render each row of the grid
    for (const row of currentPage) {
      for (const cell of row) {
        if (!cell) {
          // Empty spacer
          const spacer = document.createElement('div');
          spacer.className = 'grid-btn empty';
          gridContainer.appendChild(spacer);
          continue;
        }

        const btn = document.createElement('button');
        btn.className = 'grid-btn ' + (cell.type || 'action');
        btn.textContent = cell.label;

        // Apply active indicator for debug toggle buttons
        if (cell.key && cell.key.startsWith('debug:') && this._debugStateProvider) {
          const debugState = this._debugStateProvider();
          const action = cell.key.slice(6);
          if (debugState[action]) {
            btn.classList.add('active');
          }
        }

        const isDpad = cell.type === 'dpad' || cell.type === 'dpad-center';
        const key = cell.key;

        if (isDpad && key !== 'wait') {
          // D-pad: support key repeat for held directions
          const activate = (e) => {
            e.preventDefault();
            btn.classList.add('pressed');
            if (navigator.vibrate) navigator.vibrate(12);
            this._keysDown.add(key);
            this.lastAction = key;
            this._startRepeat(key);
          };
          const deactivate = (e) => {
            e.preventDefault();
            btn.classList.remove('pressed');
            this._keysDown.delete(key);
            if (this._repeatKey === key) this._stopRepeat();
          };
          btn.addEventListener('touchstart', activate, { passive: false });
          btn.addEventListener('touchend', deactivate, { passive: false });
          btn.addEventListener('touchcancel', deactivate, { passive: false });
          btn.addEventListener('mousedown', activate);
          btn.addEventListener('mouseup', deactivate);
        } else {
          // Action button or wait: single fire
          const fire = (e) => {
            e.preventDefault();
            btn.classList.add('pressed');
            if (navigator.vibrate) navigator.vibrate(12);
            this.lastAction = key;
          };
          const release = () => btn.classList.remove('pressed');
          btn.addEventListener('touchstart', fire, { passive: false });
          btn.addEventListener('touchend', release, { passive: false });
          btn.addEventListener('touchcancel', release, { passive: false });
          btn.addEventListener('mousedown', fire);
          btn.addEventListener('mouseup', release);
        }

        gridContainer.appendChild(btn);
      }
    }

    // Add tab-switch button if multiple pages
    if (pages.length > 1) {
      const tabBtn = document.createElement('button');
      tabBtn.className = 'grid-btn tab';
      const pageName = layout.pageNames?.[this._actionTab] || '';
      tabBtn.textContent = `${this._actionTab + 1}/${pages.length}${pageName ? ' ' + pageName : ''}`;
      const switchTab = (e) => {
        e.preventDefault();
        if (navigator.vibrate) navigator.vibrate(12);
        this._actionTab = (this._actionTab + 1) % pages.length;
        this.updateTouchLayout(state);
      };
      tabBtn.addEventListener('touchstart', switchTab, { passive: false });
      tabBtn.addEventListener('mousedown', switchTab);
      gridContainer.appendChild(tabBtn);
    }
  }

  // ── Text input mode (mobile keyboard) ─────

  enterTextInputMode() {
    this._textInputMode = true;
    if (this._textInput) {
      this._textInput.value = '';
      this._textInputPrevValue = '';
      this._textInput.addEventListener('input', this._onTextInput);
      this._textInput.addEventListener('keydown', this._onTextInputKeyDown);
      // Delay focus slightly for Android compatibility
      setTimeout(() => { if (this._textInput) this._textInput.focus(); }, 100);
    }
  }

  exitTextInputMode() {
    this._textInputMode = false;
    if (this._textInput) {
      this._textInput.removeEventListener('input', this._onTextInput);
      this._textInput.removeEventListener('keydown', this._onTextInputKeyDown);
      this._textInput.blur();
      this._textInput.value = '';
    }
  }

  _onTextInput() {
    if (!this._textInput) return;
    const cur = this._textInput.value;
    const prev = this._textInputPrevValue;
    if (cur.length > prev.length) {
      // New character(s) typed
      const newChar = cur.charAt(cur.length - 1);
      this.lastAction = newChar;
    } else if (cur.length < prev.length) {
      // Deletion (backspace)
      this.lastAction = 'Backspace';
    }
    this._textInputPrevValue = cur;
  }

  _onTextInputKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      this.lastAction = e.key;
    }
  }

  // ── Per-frame queries ──────────────────────

  /**
   * Is the key currently held down?
   */
  isKeyDown(key) {
    return this._keysDown.has(key);
  }

  /**
   * Was the key newly pressed this frame (not held from previous)?
   */
  isKeyPressed(key) {
    return this._keysPressed.has(key);
  }

  /**
   * Derive a movement direction vector from currently-pressed
   * arrow keys, WASD, or numpad.
   * @returns {{dx: number, dy: number}}
   */
  getMovementDir() {
    let dx = 0;
    let dy = 0;

    // Numpad (including diagonals)
    if (this.isKeyPressed('7') || this.isKeyPressed('Home'))       { dx = -1; dy = -1; }
    else if (this.isKeyPressed('9') || this.isKeyPressed('PageUp'))    { dx =  1; dy = -1; }
    else if (this.isKeyPressed('1') || this.isKeyPressed('End'))       { dx = -1; dy =  1; }
    else if (this.isKeyPressed('3') || this.isKeyPressed('PageDown'))  { dx =  1; dy =  1; }
    else {
      // Cardinal directions: arrow keys, WASD, numpad 2/4/6/8
      const up    = this.isKeyPressed('ArrowUp')    || this.isKeyPressed('w') || this.isKeyPressed('W') || this.isKeyPressed('8');
      const down  = this.isKeyPressed('ArrowDown')  || this.isKeyPressed('s') || this.isKeyPressed('S') || this.isKeyPressed('2');
      const left  = this.isKeyPressed('ArrowLeft')  || this.isKeyPressed('a') || this.isKeyPressed('A') || this.isKeyPressed('4');
      const right = this.isKeyPressed('ArrowRight') || this.isKeyPressed('d') || this.isKeyPressed('D') || this.isKeyPressed('6');

      if (up)    dy -= 1;
      if (down)  dy += 1;
      if (left)  dx -= 1;
      if (right) dx += 1;
    }

    return { dx, dy };
  }

  /**
   * Return and clear the last queued action.
   */
  consumeAction() {
    const action = this.lastAction;
    this.lastAction = null;
    return action;
  }

  /**
   * Call once per frame AFTER reading input.
   * Transitions pressed keys from "new" to "held".
   */
  update() {
    // Determine newly-pressed keys this frame
    this._keysPressed.clear();
    for (const key of this._keysDown) {
      if (!this._keysDownPrev.has(key)) {
        this._keysPressed.add(key);
      }
    }

    // Snapshot current state for next frame comparison
    this._keysDownPrev = new Set(this._keysDown);
  }

  /**
   * Clean up event listeners.
   */
  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}

// ─────────────────────────────────────────────
// Glow System - Color cycling for interactive objects
// ─────────────────────────────────────────────

const GLOW_PROFILES = {
  LOOT:             { hueMin: 40,  hueMax: 60,  speed: 1.5, pattern: 'pulse' },
  SETTLEMENT:       { hueMin: 180, hueMax: 220, speed: 0.8, pattern: 'wave' },
  DUNGEON_ENTRANCE: { hueMin: 0,   hueMax: 30,  speed: 1.2, pattern: 'flicker' },
  NPC:              { hueMin: 90,  hueMax: 130, speed: 1.0, pattern: 'pulse' },
  INTERACTIVE:      { hueMin: 270, hueMax: 310, speed: 1.0, pattern: 'pulse' },
  PLAYER:           { hueMin: 0,   hueMax: 360, speed: 2.0, pattern: 'rainbow' },
};

export class GlowSystem {
  constructor() {
    this.time = 0;
    this._cache = {};
  }

  update(dt) {
    this.time += dt;
    this._cache = {};
  }

  getGlowColor(category, baseColor) {
    const key = category + baseColor;
    if (this._cache[key]) return this._cache[key];

    const profile = GLOW_PROFILES[category];
    if (!profile) return baseColor;

    const t = this.time * profile.speed;
    let hue, saturation, lightness;

    switch (profile.pattern) {
      case 'pulse': {
        const phase = Math.sin(t * 2.5) * 0.5 + 0.5;
        hue = profile.hueMin + (profile.hueMax - profile.hueMin) * 0.5;
        saturation = 80 + phase * 20;
        lightness = 50 + phase * 25;
        break;
      }
      case 'wave': {
        const phase = Math.sin(t * 1.8) * 0.5 + 0.5;
        hue = profile.hueMin + (profile.hueMax - profile.hueMin) * phase;
        saturation = 70 + phase * 20;
        lightness = 55 + Math.sin(t * 2.2) * 15;
        break;
      }
      case 'flicker': {
        const base = Math.sin(t * 3.0) * 0.5 + 0.5;
        const jitter = Math.sin(t * 7.3) * 0.15 + Math.sin(t * 13.1) * 0.1;
        const phase = Math.max(0, Math.min(1, base + jitter));
        hue = profile.hueMin + (profile.hueMax - profile.hueMin) * phase;
        saturation = 85;
        lightness = 45 + phase * 30;
        break;
      }
      case 'rainbow': {
        hue = (t * 60) % 360;
        saturation = 90;
        lightness = 60 + Math.sin(t * 3) * 10;
        break;
      }
      default: {
        hue = profile.hueMin;
        saturation = 80;
        lightness = 60;
      }
    }

    const glowRGB = this._hslToRgb(hue / 360, saturation / 100, lightness / 100);
    const baseRGB = this._hexToRgb(baseColor);

    const blend = 0.4;
    const r = Math.round(baseRGB.r * (1 - blend) + glowRGB.r * blend);
    const g = Math.round(baseRGB.g * (1 - blend) + glowRGB.g * blend);
    const b = Math.round(baseRGB.b * (1 - blend) + glowRGB.b * blend);

    const result = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    this._cache[key] = result;
    return result;
  }

  _hexToRgb(hex) {
    if (!hex || hex.charAt(0) !== '#') return { r: 200, g: 200, b: 200 };
    const val = parseInt(hex.slice(1), 16);
    if (hex.length === 4) {
      const r = ((val >> 8) & 0xf) * 17;
      const g = ((val >> 4) & 0xf) * 17;
      const b = (val & 0xf) * 17;
      return { r, g, b };
    }
    return { r: (val >> 16) & 0xff, g: (val >> 8) & 0xff, b: val & 0xff };
  }

  _hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
}
