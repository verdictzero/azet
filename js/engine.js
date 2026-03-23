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
    this.ctx = canvas.getContext('2d');

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
    this.zoomLevel = 3;       // legacy compat
    this.densityLevel = 3;    // density zoom: 1, 2, or 3
    this._baseFontSize = null; // stored when zoom is applied

    // CRT post-processing resolution scaling
    this.crtScale = 0.5;      // render CRT effects at this fraction of full res (0.25–1.0)
    this._crtCanvas = null;    // offscreen canvas for downscaled CRT effects
    this._crtCtx = null;

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

  setCrtScale(scale) {
    this.crtScale = Math.max(0.25, Math.min(1.0, scale));
    this._updateCrtCanvas();
  }

  _updateCrtCanvas() {
    const w = Math.max(1, Math.floor(this.canvas.width * this.crtScale));
    const h = Math.max(1, Math.floor(this.canvas.height * this.crtScale));
    if (!this._crtCanvas) {
      this._crtCanvas = document.createElement('canvas');
      this._crtCtx = this._crtCanvas.getContext('2d');
    }
    if (this._crtCanvas.width !== w || this._crtCanvas.height !== h) {
      this._crtCanvas.width = w;
      this._crtCanvas.height = h;
      this._crtCtx.imageSmoothingEnabled = false;
    }
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
   * Start a new frame: clear the working buffer and cache frame time.
   */
  beginFrame() {
    // Cache time once per frame — avoid Date.now() per tile
    this._frameTime = Date.now();
    this._frameTimeSec = this._frameTime / 1000;

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

    // Batch background fills: merge horizontal runs of same bg color
    let lastBg = null;
    let runStartC = 0;
    let runRow = 0;

    const flushBgRun = () => {
      if (lastBg !== null) {
        ctx.fillStyle = lastBg;
        ctx.fillRect(runStartC * cw, runRow * ch, (this._runEndC - runStartC) * cw, ch);
      }
    };

    for (let r = 0; r < this.rows; r++) {
      lastBg = null;
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
            if (lastBg !== null) { flushBgRun(); lastBg = null; }
            continue;
          }
        }

        // Extend or start bg run
        if (cell.bg === lastBg && r === runRow) {
          this._runEndC = c + 1;
        } else {
          if (lastBg !== null) flushBgRun();
          lastBg = cell.bg;
          runStartC = c;
          runRow = r;
          this._runEndC = c + 1;
        }
      }
      if (lastBg !== null) { flushBgRun(); lastBg = null; }
    }

    // Draw foreground characters
    let lastFg = null;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.buffer[r][c];

        if (hasPrev) {
          const prev = this.prevBuffer[r][c];
          if (prev.char === cell.char && prev.fg === cell.fg && prev.bg === cell.bg) continue;
        }

        if (cell.char !== ' ') {
          if (cell.fg !== lastFg) {
            ctx.fillStyle = cell.fg;
            lastFg = cell.fg;
          }
          const x = c * cw;
          const y = r * ch;
          // Safety: check if non-ASCII char is wider than cell (enemy art only)
          if (cell.safety && cell.char.charCodeAt(0) > 127) {
            const w = this._charWidthCache[cell.char];
            if (w === undefined) {
              this._charWidthCache[cell.char] = ctx.measureText(cell.char).width;
            }
            if ((this._charWidthCache[cell.char] || 0) > cw * 1.3) {
              ctx.fillText('?', x, y);
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
      if (!this.prevBuffer.length) {
        // Allocate prevBuffer once, reuse
        this.prevBuffer = [];
        for (let r = 0; r < this.rows; r++) {
          const row = [];
          for (let c = 0; c < this.cols; c++) {
            const s = this.buffer[r][c];
            row.push({ char: s.char, fg: s.fg, bg: s.bg });
          }
          this.prevBuffer.push(row);
        }
      } else {
        // Reuse existing objects to avoid GC pressure
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            const s = this.buffer[r][c];
            const p = this.prevBuffer[r][c];
            p.char = s.char;
            p.fg = s.fg;
            p.bg = s.bg;
          }
        }
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
   * Used for shadows. Queues to batch for efficient rendering.
   */
  darkenCell(col, row, alpha) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    if (alpha <= 0) return;
    if (!this._darkenBatch) this._darkenBatch = [];
    this._darkenBatch.push(col, row, alpha);
  }

  /**
   * Brighten a specific cell with a warm tint (for god rays).
   * Queues to batch for efficient rendering.
   */
  brightenCell(col, row, alpha, tintColor) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    if (alpha <= 0) return;
    if (!this._brightenBatch) this._brightenBatch = [];
    this._brightenBatch.push(col, row, alpha, tintColor || '#FFEEAA');
  }

  /**
   * Apply light color tinting to a cell (for colored light sources).
   * Queues to batch for efficient rendering.
   */
  tintCell(col, row, color, alpha) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    if (alpha <= 0) return;
    if (!this._tintBatch) this._tintBatch = [];
    this._tintBatch.push(col, row, color, alpha);
  }

  /**
   * Flush all queued darken/brighten/tint operations in batched canvas calls.
   * Call this once after all overlay operations are done for the frame.
   */
  flushOverlayBatches() {
    const ctx = this.ctx;
    const cw = this.cellWidth;
    const ch = this.cellHeight;

    // Flush darken batch (all same color #000, varying alpha)
    if (this._darkenBatch && this._darkenBatch.length > 0) {
      const batch = this._darkenBatch;
      ctx.fillStyle = '#000000';
      // Group by quantized alpha to reduce state changes
      // Sort by alpha for fewer globalAlpha switches
      for (let i = 0; i < batch.length; i += 3) {
        ctx.globalAlpha = batch[i + 2];
        ctx.fillRect(batch[i] * cw, batch[i + 1] * ch, cw, ch);
      }
      this._darkenBatch.length = 0;
    }

    // Flush brighten batch (screen composite, varying color+alpha)
    if (this._brightenBatch && this._brightenBatch.length > 0) {
      const batch = this._brightenBatch;
      ctx.globalCompositeOperation = 'screen';
      let lastColor = null;
      for (let i = 0; i < batch.length; i += 4) {
        const color = batch[i + 3];
        if (color !== lastColor) {
          ctx.fillStyle = color;
          lastColor = color;
        }
        ctx.globalAlpha = batch[i + 2];
        ctx.fillRect(batch[i] * cw, batch[i + 1] * ch, cw, ch);
      }
      ctx.globalCompositeOperation = 'source-over';
      this._brightenBatch.length = 0;
    }

    // Flush tint batch (normal composite, varying color+alpha)
    if (this._tintBatch && this._tintBatch.length > 0) {
      const batch = this._tintBatch;
      let lastColor = null;
      for (let i = 0; i < batch.length; i += 4) {
        const color = batch[i + 2];
        if (color !== lastColor) {
          ctx.fillStyle = color;
          lastColor = color;
        }
        ctx.globalAlpha = batch[i + 3];
        ctx.fillRect(batch[i] * cw, batch[i + 1] * ch, cw, ch);
      }
      this._tintBatch.length = 0;
    }

    // Restore default state
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── Animated color cycling ────────────────

  /**
   * Return an animated color for special tile types.
   * @param {string} baseColor - the tile's static fg color
   * @param {string} tileType - RIVER_WATER, LAVA, FIREPLACE, etc.
   * @returns {string} the current animated color
   */
  getAnimatedColor(baseColor, tileType) {
    const t = (this._frameTime || Date.now()) / 500;
    const phase = Math.sin(t) * 0.5 + 0.5; // 0-1

    switch (tileType) {
      // ── Water types ──
      case 'RIVER_WATER':
      case 'WATER': {
        const blues = ['#4488FF', '#4D90FF', '#3B80EE'];
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
    const t = this._frameTime || Date.now();
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
      // Grass/low vegetation: 45° wind wave using Perlin noise
      case ',':
      case '`':
      case '.': {
        if (worldX !== undefined && worldY !== undefined) {
          const ts = t / 1000;
          // Wind direction at 45° diagonal
          const COS45 = 0.7071, SIN45 = 0.7071;
          const along = worldX * COS45 + worldY * SIN45;
          const perp = -worldX * SIN45 + worldY * COS45;
          // Traveling wave along the 45° diagonal
          const n = this._grassNoise.noise2D(along * 0.15 - ts * 0.5, perp * 0.08);
          if (n > 0.2) return '`';
          if (n < -0.2) return '.';
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
      case '\u223D': { // ∽ deep water wave
        const cycle = Math.floor(t / 600) % 3;
        const deep = ['\u223D', '\u2248', '\u223D']; // ∽ ≈ ∽
        return deep[cycle];
      }
      case '\u2248': { // ≈ very deep water
        const cycle = Math.floor(t / 700) % 3;
        const vdeep = ['\u2248', '\u223D', '\u2248']; // ≈ ∽ ≈
        return vdeep[cycle];
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
      const ts = this._frameTimeSec || Date.now() / 1000;
      // Match 45° wind angle from character animation
      const cosW = 0.7071, sinW = 0.7071;
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
    const scale = this.crtScale;

    if (scale < 1) {
      // Route expensive pixel-manipulation effects through a smaller offscreen canvas
      this._updateCrtCanvas();
      const crtCtx = this._crtCtx;
      const cw = this._crtCanvas.width;
      const ch = this._crtCanvas.height;

      // Downscale main canvas → CRT canvas
      crtCtx.drawImage(this.canvas, 0, 0, cw, ch);

      // Expensive effects on smaller canvas
      if (opts.crtGlow !== false) this._applyPhosphorGlowOn(crtCtx, cw, ch);
      if (opts.crtAberration !== false) this._applyChromaAberrationOn(crtCtx, cw, ch);

      // Upscale CRT canvas back to main canvas
      const ctx = this.ctx;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this._crtCanvas, 0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    } else {
      // Full-res path (original behavior)
      if (opts.crtGlow !== false) this.applyPhosphorGlow();
      if (opts.crtAberration !== false) this.applyChromaAberration();
    }

    // Cheap overlay effects always run on main canvas (just fillRect / gradient calls)
    if (opts.crtScanlines !== false) this.applyScanlines();
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
   * GPU-accelerated via canvas composite operations (no getImageData).
   */
  applyChromaAberration() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    // Snapshot the current frame
    if (!this._aberrationSrc) {
      this._aberrationSrc = document.createElement('canvas');
      this._aberrationSrcCtx = this._aberrationSrc.getContext('2d');
    }
    if (this._aberrationSrc.width !== w || this._aberrationSrc.height !== h) {
      this._aberrationSrc.width = w;
      this._aberrationSrc.height = h;
    }
    this._aberrationSrcCtx.clearRect(0, 0, w, h);
    this._aberrationSrcCtx.drawImage(this.canvas, 0, 0);

    ctx.clearRect(0, 0, w, h);
    this._applyChromaPass(ctx, this._aberrationSrc, w, h);
  }

  /**
   * 3-pass GPU chromatic aberration: R(-1px), G(center), B(+1px)
   */
  _applyChromaPass(ctx, src, w, h) {
    // We need 3 temp canvases for each color channel
    if (!this._chrR) {
      this._chrR = document.createElement('canvas');
      this._chrG = document.createElement('canvas');
      this._chrB = document.createElement('canvas');
    }
    for (const c of [this._chrR, this._chrG, this._chrB]) {
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }

    // Red: shift left 1px, multiply with red
    const rCtx = this._chrR.getContext('2d');
    rCtx.clearRect(0, 0, w, h);
    rCtx.drawImage(src, -1, 0);
    rCtx.globalCompositeOperation = 'multiply';
    rCtx.fillStyle = '#ff0000';
    rCtx.fillRect(0, 0, w, h);
    rCtx.globalCompositeOperation = 'source-over';

    // Green: center, multiply with green
    const gCtx = this._chrG.getContext('2d');
    gCtx.clearRect(0, 0, w, h);
    gCtx.drawImage(src, 0, 0);
    gCtx.globalCompositeOperation = 'multiply';
    gCtx.fillStyle = '#00ff00';
    gCtx.fillRect(0, 0, w, h);
    gCtx.globalCompositeOperation = 'source-over';

    // Blue: shift right 1px, multiply with blue
    const bCtx = this._chrB.getContext('2d');
    bCtx.clearRect(0, 0, w, h);
    bCtx.drawImage(src, 1, 0);
    bCtx.globalCompositeOperation = 'multiply';
    bCtx.fillStyle = '#0000ff';
    bCtx.fillRect(0, 0, w, h);
    bCtx.globalCompositeOperation = 'source-over';

    // Combine: additive blend all 3 channels
    ctx.drawImage(this._chrR, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this._chrG, 0, 0);
    ctx.drawImage(this._chrB, 0, 0);
    ctx.restore();
  }

  /**
   * Phosphor glow on an arbitrary canvas context (for downscaled CRT path).
   */
  _applyPhosphorGlowOn(ctx, w, h) {
    this._glowFrame = (this._glowFrame || 0) + 1;
    if (this._glowFrame % 2 !== 0) return;

    const scale = 0.25;
    const sw = Math.max(1, Math.floor(w * scale));
    const sh = Math.max(1, Math.floor(h * scale));

    if (!this._glowCanvas) {
      this._glowCanvas = document.createElement('canvas');
    }
    this._glowCanvas.width = sw;
    this._glowCanvas.height = sh;

    const gCtx = this._glowCanvas.getContext('2d');
    gCtx.filter = 'blur(3px)';
    gCtx.drawImage(this._crtCanvas, 0, 0, sw, sh);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.10;
    ctx.drawImage(this._glowCanvas, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 30, 0.015)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * Chromatic aberration on an arbitrary canvas context (for downscaled CRT path).
   * GPU-accelerated via canvas composite operations.
   */
  _applyChromaAberrationOn(ctx, w, h) {
    if (w === 0 || h === 0) return;

    // Snapshot current content of the target canvas
    if (!this._crtAberSrc) {
      this._crtAberSrc = document.createElement('canvas');
      this._crtAberSrcCtx = this._crtAberSrc.getContext('2d');
    }
    if (this._crtAberSrc.width !== w || this._crtAberSrc.height !== h) {
      this._crtAberSrc.width = w;
      this._crtAberSrc.height = h;
    }
    this._crtAberSrcCtx.clearRect(0, 0, w, h);
    this._crtAberSrcCtx.drawImage(ctx.canvas, 0, 0);

    ctx.clearRect(0, 0, w, h);
    this._applyChromaPass(ctx, this._crtAberSrc, w, h);
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
   * GPU-accelerated via drawImage clipping (no getImageData).
   */
  applyGlitch() {
    if (!this._glitchActive && Math.random() > 0.002) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const ch = this.cellHeight;
    const rows = this.rows;

    // Snapshot current frame for self-draw
    if (!this._glitchCanvas) {
      this._glitchCanvas = document.createElement('canvas');
      this._glitchCtx = this._glitchCanvas.getContext('2d');
    }
    if (this._glitchCanvas.width !== w || this._glitchCanvas.height !== this.canvas.height) {
      this._glitchCanvas.width = w;
      this._glitchCanvas.height = this.canvas.height;
    }
    this._glitchCtx.drawImage(this.canvas, 0, 0);

    const glitchRows = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < glitchRows; i++) {
      const row = Math.floor(Math.random() * rows);
      const shift = (Math.random() * 6 - 3) | 0;
      const y = row * ch;
      // Clear the row, then draw shifted slice from snapshot
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, y, w, ch);
      ctx.drawImage(this._glitchCanvas, 0, y, w, ch, shift, y, w, ch);
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

    // Game state provider callback (set by Game to query current state)
    this._gameStateProvider = null;

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
    // Use slower repeat on overworld (50% speed)
    const state = this._gameStateProvider ? this._gameStateProvider() : null;
    const interval = state === 'OVERWORLD' ? this._repeatInterval * 2 : this._repeatInterval;
    // After initial delay, start firing repeats at interval
    this._repeatTimer = setTimeout(() => {
      this._repeatIntervalTimer = setInterval(() => {
        if (this._keysDown.has(key)) {
          this.lastAction = key;
        } else {
          this._stopRepeat();
        }
      }, interval);
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

  // ── Virtual Gamepad ──────────────────────────

  // Abstract gamepad button → key action mapping per game state.
  // State-specific entries override _default. Only list overrides.
  static GAMEPAD_ACTIONS = {
    _default: {
      UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
      UL: '7', UR: '9', DL: '1', DR: '3',
      A: 'Enter',           // Confirm / Act
      B: 'Escape',          // Cancel / Back
      X: 't',               // Context: talk
      Y: 'e',               // Context: enter
      START: 'gamepad:menu', // FF-style menu
      SELECT: 'wait',       // Wait / skip turn
      L1: 'ArrowLeft', R1: 'ArrowRight',
      L2: '-', R2: '+',
    },
    COMBAT: {
      A: 'Enter', B: 'Escape',
      X: 'a',     // Attack
      Y: 'f',     // Flee
      L1: '1', R1: '2',
      L2: '3', R2: 'i',
      START: null, // no menu in combat
    },
    BATTLE_RESULTS: { A: 'Enter' },
    DIALOGUE: {
      A: 'Enter', B: 'Escape',
      X: 'a', Y: 'b',
      L1: 'c', R1: 'd',
    },
    SHOP: {
      A: 'Enter', B: 'Escape',
      X: 'b', Y: 's',
    },
    INVENTORY: {
      A: 'Enter', B: 'Escape',
      X: 'e',     // Equip
      Y: 'd',     // Drop
    },
    CHARACTER: { A: 'Enter', B: 'Escape' },
    QUEST_LOG: {
      A: 'Enter', B: 'Escape',
      X: 'n',     // Nav toggle
    },
    MAP: {
      A: 'Enter', B: 'Escape',
      L2: '-', R2: '+',
    },
    HELP: { B: 'Escape' },
    SETTINGS: {
      A: 'Enter', B: 'Escape',
    },
    GAME_OVER: { A: 'Enter' },
    MENU: { A: 'Enter', B: 'Escape' },
    CHAR_CREATE: { A: 'Enter', B: 'Escape' },
    DEBUG_MENU: { A: 'Enter', B: 'Escape' },
    DUNGEON: {
      X: 'g',     // Pick up
      Y: '>',     // Stairs
    },
    LOCATION: {
      X: 't',     // Talk
      Y: 'e',     // Enter
    },
    FACTION: { B: 'Escape' },
    QUEST_COMPASS: { B: 'Escape' },
    ALMANAC: { B: 'Escape' },
    CONSOLE_LOG: { B: 'Escape' },
    GAMEPAD_MENU: {
      A: 'Enter',
      B: 'Escape',
      START: 'Escape', // close menu
    },
  };

  /**
   * Resolve a virtual gamepad button to the key action for the current state.
   */
  resolveGamepadButton(button) {
    const state = this._gameStateProvider ? this._gameStateProvider() : '_default';
    const stateMap = InputManager.GAMEPAD_ACTIONS[state];
    // Check state-specific, then default
    if (stateMap && button in stateMap) return stateMap[button];
    return InputManager.GAMEPAD_ACTIONS._default[button] || null;
  }

  _initTouchControls() {
    const touchDiv = document.getElementById('touch-controls');
    if (touchDiv && this.isMobile) {
      touchDiv.classList.remove('hidden');
    }
    this._touchDiv = touchDiv;

    // Restore gamepad layout mode
    this._gamepadMode = localStorage.getItem('gamepadMode') || 'compact';
    this._applyGamepadMode();

    // Bind all static gamepad buttons
    this._bindGamepadButtons();
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

  get touchMode() { return this._touchMode; }

  /**
   * Bind touch/mouse events to all static gamepad buttons.
   * The DOM is never rebuilt — the same buttons persist across all states.
   */
  _bindGamepadButtons() {
    if (!this._touchDiv) return;
    const buttons = this._touchDiv.querySelectorAll('[data-btn]');

    // D-pad buttons that support held-key repeat
    const dpadBtns = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT', 'UL', 'UR', 'DL', 'DR']);

    for (const btn of buttons) {
      const btnId = btn.dataset.btn;

      if (dpadBtns.has(btnId)) {
        // D-pad: fire resolved key and support repeat
        const activate = (e) => {
          e.preventDefault();
          btn.classList.add('pressed');
          if (navigator.vibrate) navigator.vibrate(12);
          const key = this.resolveGamepadButton(btnId);
          if (!key) return;
          this._keysDown.add(key);
          this.lastAction = key;
          // Store which resolved key this button activated (for deactivation)
          btn._activeKey = key;
          this._startRepeat(key);
        };
        const deactivate = (e) => {
          e.preventDefault();
          btn.classList.remove('pressed');
          const key = btn._activeKey;
          if (key) {
            this._keysDown.delete(key);
            if (this._repeatKey === key) this._stopRepeat();
            btn._activeKey = null;
          }
        };
        btn.addEventListener('touchstart', activate, { passive: false });
        btn.addEventListener('touchend', deactivate, { passive: false });
        btn.addEventListener('touchcancel', deactivate, { passive: false });
        btn.addEventListener('mousedown', activate);
        btn.addEventListener('mouseup', deactivate);
      } else if (btnId === 'WAIT') {
        // Wait/center — single fire, sends 'wait'
        const fire = (e) => {
          e.preventDefault();
          btn.classList.add('pressed');
          if (navigator.vibrate) navigator.vibrate(12);
          this.lastAction = 'wait';
        };
        const release = () => btn.classList.remove('pressed');
        btn.addEventListener('touchstart', fire, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
        btn.addEventListener('mousedown', fire);
        btn.addEventListener('mouseup', release);
      } else {
        // Face / shoulder / meta: single fire, resolved per state
        const fire = (e) => {
          e.preventDefault();
          btn.classList.add('pressed');
          if (navigator.vibrate) navigator.vibrate(12);
          const key = this.resolveGamepadButton(btnId);
          if (key) this.lastAction = key;
        };
        const release = () => btn.classList.remove('pressed');
        btn.addEventListener('touchstart', fire, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
        btn.addEventListener('mousedown', fire);
        btn.addEventListener('mouseup', release);
      }
    }
  }

  /**
   * Apply the current gamepad layout mode (compact or wide).
   */
  _applyGamepadMode() {
    if (!this._touchDiv) return;
    const wrap = this._touchDiv.querySelector('.gamepad-wrap');
    if (!wrap) return;
    if (this._gamepadMode === 'wide') {
      wrap.classList.remove('compact');
      this._touchDiv.classList.add('wide-mode');
    } else {
      wrap.classList.add('compact');
      this._touchDiv.classList.remove('wide-mode');
    }
  }

  /**
   * Toggle between compact (one-handed) and wide (two-handed) gamepad layout.
   */
  setGamepadLayout(mode) {
    this._gamepadMode = mode;
    localStorage.setItem('gamepadMode', mode);
    this._applyGamepadMode();
  }

  /**
   * Update touch control layout. With the virtual gamepad the DOM never
   * changes — this is kept as a no-op so existing callers don't break.
   */
  updateTouchLayout(_state) {
    // No-op: the gamepad layout is static.
    // Gamepad button actions are resolved dynamically via GAMEPAD_ACTIONS.
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
    this._lastCacheTime = 0;
  }

  update(dt) {
    this.time += dt;
    // Only invalidate cache every 0.1s — glow colors change slowly
    if (this.time - this._lastCacheTime > 0.1) {
      this._cache = {};
      this._lastCacheTime = this.time;
    }
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
