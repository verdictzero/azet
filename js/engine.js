// engine.js - Retro ASCII roguelike rendering engine
// ES module: exports COLORS, LAYOUT, wordWrap, Renderer, Camera, InputManager

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
  FF_BLUE_BG:     '#10106e',
  FF_BLUE_DARK:   '#080840',
  FF_BORDER:      '#b8b8e8',
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

    this.effectsEnabled = false; // visual FX disabled for now (toggle with settings)

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
        row.push({ char: ' ', fg: COLORS.WHITE, bg: COLORS.BLACK });
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
  drawChar(col, row, char, fg = COLORS.WHITE, bg = COLORS.BLACK) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    const cell = this.buffer[row][col];
    cell.char = char;
    cell.fg = fg;
    cell.bg = bg;
  }

  /**
   * Write a horizontal string into the buffer.
   */
  drawString(col, row, str, fg = COLORS.WHITE, bg = COLORS.BLACK, maxWidth = 0) {
    const len = maxWidth > 0 ? Math.min(str.length, maxWidth) : str.length;
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
      default:
        return baseColor;
    }
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
    for (const p of this.particles) {
      const sx = Math.round(p.x - cameraX);
      const sy = Math.round(p.y - cameraY);
      if (sx >= 0 && sx < viewW && sy >= 0 && sy < viewH) {
        const fade = p.life / p.maxLife;
        if (fade > 0.3) {
          renderer.drawChar(viewLeft + sx, viewTop + sy, p.char, p.fg);
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

    // Haptic helper — short vibration on button press
    const haptic = () => {
      if (navigator.vibrate) navigator.vibrate(12);
    };

    // D-pad direction buttons
    const dirToKey = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    const dirButtons = document.querySelectorAll('[data-dir]');
    dirButtons.forEach((btn) => {
      const dir = btn.getAttribute('data-dir');

      const activate = (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        haptic();
        const key = dirToKey[dir];
        if (key) {
          this._keysDown.add(key);
          this.lastAction = key;
          // Start touch repeat for held d-pad
          this._startRepeat(key);
        } else if (dir === 'wait') {
          this.lastAction = 'wait';
        }
      };

      const deactivate = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        const key = dirToKey[dir];
        if (key) {
          this._keysDown.delete(key);
          if (this._repeatKey === key) {
            this._stopRepeat();
          }
        }
      };

      btn.addEventListener('touchstart', activate, { passive: false });
      btn.addEventListener('touchend', deactivate, { passive: false });
      btn.addEventListener('touchcancel', deactivate, { passive: false });
      btn.addEventListener('mousedown', activate);
      btn.addEventListener('mouseup', deactivate);
    });

    // Action buttons — map to the key values that handleInput expects
    const actionKeyMap = {
      interact: 'Enter',
      inventory: 'i',
      map: 'm',
      character: 'c',
      quest: 'q',
      menu: 'Escape',
    };

    const actionButtons = document.querySelectorAll('[data-action]');
    actionButtons.forEach((btn) => {
      const action = btn.getAttribute('data-action');

      const fire = (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        haptic();
        this.lastAction = actionKeyMap[action] || action;
      };

      const release = (e) => {
        btn.classList.remove('pressed');
      };

      btn.addEventListener('touchstart', fire, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown', fire);
      btn.addEventListener('mouseup', release);
    });
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
  static TOUCH_LAYOUTS = {
    MENU:        { dpad: ['up', 'down'], actions: [{ label: 'SEL', key: 'Enter', primary: true }, { label: 'ESC', key: 'Escape' }] },
    CHAR_CREATE: { dpad: ['up', 'down'], actions: [{ label: 'SEL', key: 'Enter', primary: true }, { label: 'BACK', key: 'Escape' }] },
    LOADING:     { dpad: [], actions: [] },
    OVERWORLD:   { dpad: ['up', 'down', 'left', 'right', 'wait'], actions: [
      { label: 'ACT', key: 'Enter', primary: true }, { label: 'INV', key: 'i' },
      { label: 'MAP', key: 'm' }, { label: 'CHR', key: 'c' },
      { label: 'QST', key: 'q' }, { label: 'ESC', key: 'Escape' },
      { label: 'DBG', key: '`', debug: true },
    ]},
    LOCATION:    { dpad: ['up', 'down', 'left', 'right', 'wait'], actions: [
      { label: 'ACT', key: 'Enter', primary: true }, { label: 'INV', key: 'i' },
      { label: 'MAP', key: 'm' }, { label: 'CHR', key: 'c' },
      { label: 'QST', key: 'q' }, { label: 'ESC', key: 'Escape' },
      { label: 'DBG', key: '`', debug: true },
    ]},
    DUNGEON:     { dpad: ['up', 'down', 'left', 'right', 'wait'], actions: [
      { label: 'ACT', key: 'Enter', primary: true }, { label: 'INV', key: 'i' },
      { label: 'MAP', key: 'm' }, { label: 'CHR', key: 'c' },
      { label: 'QST', key: 'q' }, { label: 'ESC', key: 'Escape' },
      { label: 'DBG', key: '`', debug: true },
    ]},
    COMBAT:      { dpad: ['up', 'down'], actions: [
      { label: 'ATK', key: 'Enter', primary: true }, { label: 'FLEE', key: 'f' },
      { label: 'INV', key: 'i' }, { label: 'ESC', key: 'Escape' },
      { label: 'DBG', key: '`', debug: true },
    ]},
    DIALOGUE:    { dpad: ['up', 'down'], actions: [{ label: 'SEL', key: 'Enter', primary: true }, { label: 'BACK', key: 'Escape' }] },
    SHOP:        { dpad: ['up', 'down'], actions: [{ label: 'BUY', key: 'Enter', primary: true }, { label: 'BACK', key: 'Escape' }] },
    INVENTORY:   { dpad: ['up', 'down'], actions: [{ label: 'USE', key: 'Enter', primary: true }, { label: 'BACK', key: 'Escape' }] },
    CHARACTER:   { dpad: ['up', 'down'], actions: [{ label: 'BACK', key: 'Escape' }] },
    QUEST_LOG:   { dpad: ['up', 'down'], actions: [{ label: 'BACK', key: 'Escape' }] },
    MAP:         { dpad: ['up', 'down', 'left', 'right'], actions: [{ label: 'BACK', key: 'Escape' }] },
    HELP:        { dpad: ['up', 'down'], actions: [{ label: 'BACK', key: 'Escape' }] },
    SETTINGS:    { dpad: ['up', 'down'], actions: [{ label: 'SEL', key: 'Enter', primary: true }, { label: 'BACK', key: 'Escape' }] },
    GAME_OVER:   { dpad: [], actions: [{ label: 'MENU', key: 'Enter', primary: true }] },
    FACTION:     { dpad: ['up', 'down'], actions: [{ label: 'BACK', key: 'Escape' }] },
  };

  /**
   * Update touch control layout based on current game state.
   */
  updateTouchLayout(state) {
    if (!this._touchDiv) return;
    const layout = InputManager.TOUCH_LAYOUTS[state] || InputManager.TOUCH_LAYOUTS.OVERWORLD;

    // Update D-pad buttons visibility
    const dpadBtns = this._touchDiv.querySelectorAll('[data-dir]');
    dpadBtns.forEach(btn => {
      const dir = btn.getAttribute('data-dir');
      btn.style.visibility = layout.dpad.includes(dir) ? 'visible' : 'hidden';
    });

    // Update action buttons
    const actionContainer = this._touchDiv.querySelector('.action-buttons');
    if (actionContainer) {
      // Clear existing
      actionContainer.innerHTML = '';
      for (const act of layout.actions) {
        const btn = document.createElement('button');
        btn.className = 'action-btn' + (act.primary ? ' act' : '') + (act.debug ? ' dbg' : '');
        btn.setAttribute('data-action', act.key);
        btn.textContent = act.label;

        const fire = (e) => {
          e.preventDefault();
          btn.classList.add('pressed');
          if (navigator.vibrate) navigator.vibrate(12);
          this.lastAction = act.key;
        };
        const release = () => btn.classList.remove('pressed');

        btn.addEventListener('touchstart', fire, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
        btn.addEventListener('mousedown', fire);
        btn.addEventListener('mouseup', release);
        actionContainer.appendChild(btn);
      }
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
