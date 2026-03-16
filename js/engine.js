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
  BLUE:           '#0000AA',
  GREEN:          '#00AA00',
  CYAN:           '#00AAAA',
  RED:            '#AA0000',
  MAGENTA:        '#AA00AA',
  YELLOW:         '#AAAA00',
  WHITE:          '#AAAAAA',
  BRIGHT_BLACK:   '#555555',
  BRIGHT_BLUE:    '#5555FF',
  BRIGHT_GREEN:   '#55FF55',
  BRIGHT_CYAN:    '#55FFFF',
  BRIGHT_RED:     '#FF5555',
  BRIGHT_MAGENTA: '#FF55FF',
  BRIGHT_YELLOW:  '#FFFF55',
  BRIGHT_WHITE:   '#FFFFFF',
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
  drawString(col, row, str, fg = COLORS.WHITE, bg = COLORS.BLACK) {
    for (let i = 0; i < str.length; i++) {
      this.drawChar(col + i, row, str[i], fg, bg);
    }
  }

  /**
   * Draw a horizontal separator spanning a box: ╠═══════╣
   */
  drawSeparator(col, row, w, fg = COLORS.WHITE, bg = COLORS.BLACK) {
    this.drawChar(col, row, '\u2560', fg, bg);         // ╠
    for (let x = 1; x < w - 1; x++) {
      this.drawChar(col + x, row, '\u2550', fg, bg);   // ═
    }
    this.drawChar(col + w - 1, row, '\u2563', fg, bg); // ╣
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
   * Draw a box border using box-drawing characters.
   * ╔═══════╗
   * ║       ║
   * ╚═══════╝
   * Optional title is placed inside the top border.
   */
  drawBox(col, row, w, h, fg = COLORS.WHITE, bg = COLORS.BLACK, title = null) {
    if (w < 2 || h < 2) return;

    // Corners
    this.drawChar(col, row, '\u2554', fg, bg);             // ╔
    this.drawChar(col + w - 1, row, '\u2557', fg, bg);     // ╗
    this.drawChar(col, row + h - 1, '\u255A', fg, bg);     // ╚
    this.drawChar(col + w - 1, row + h - 1, '\u255D', fg, bg); // ╝

    // Top and bottom edges
    for (let x = 1; x < w - 1; x++) {
      this.drawChar(col + x, row, '\u2550', fg, bg);           // ═
      this.drawChar(col + x, row + h - 1, '\u2550', fg, bg);   // ═
    }

    // Left and right edges
    for (let y = 1; y < h - 1; y++) {
      this.drawChar(col, row + y, '\u2551', fg, bg);           // ║
      this.drawChar(col + w - 1, row + y, '\u2551', fg, bg);   // ║
    }

    // Fill interior with bg
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        this.drawChar(col + x, row + y, ' ', fg, bg);
      }
    }

    // Optional title in top border
    if (title) {
      const maxLen = w - 4;
      const truncated = title.length > maxLen ? title.slice(0, maxLen) : title;
      const tx = col + 2;
      this.drawChar(col + 1, row, ' ', fg, bg);
      this.drawString(tx, row, truncated, fg, bg);
      this.drawChar(tx + truncated.length, row, ' ', fg, bg);
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
   * Apply day/night tint based on time-of-day phase string.
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
      // morning/afternoon: no tint
    }
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
      case 'SHALLOWS':
      case 'WATER': {
        const blues = ['#0055AA', '#0066BB', '#0044AA'];
        return blues[Math.floor(t) % blues.length];
      }
      case 'DEEP_LAKE': {
        const deeps = ['#000088', '#000066', '#001199'];
        return deeps[Math.floor(t) % deeps.length];
      }
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

    // Subtle green phosphor tint
    ctx.save();
    ctx.fillStyle = 'rgba(0, 20, 0, 0.015)';
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
  }

  _onKeyUp(e) {
    this._keysDown.delete(e.key);
  }

  // ── Touch / d-pad ──────────────────────────

  _initTouchControls() {
    // Show touch controls on mobile
    const touchDiv = document.getElementById('touch-controls');
    if (touchDiv && this.isMobile) {
      touchDiv.classList.remove('hidden');
    }

    this._touchDiv = touchDiv;
    this._dpad = touchDiv ? touchDiv.querySelector('.dpad') : null;
    this._actionArea = document.getElementById('touch-action-area');
    this._currentLayout = null;

    // Haptic helper — short vibration on button press
    this._haptic = () => {
      if (navigator.vibrate) navigator.vibrate(12);
    };

    // D-pad direction buttons
    this._initDpad();

    // Set default exploration layout
    this.setTouchLayout('MENU');
  }

  _initDpad() {
    const dirButtons = document.querySelectorAll('[data-dir]');
    dirButtons.forEach((btn) => {
      const dir = btn.getAttribute('data-dir');

      const activate = (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        this._haptic();
        switch (dir) {
          case 'up':    this._keysDown.add('ArrowUp');    this.lastAction = 'ArrowUp';    break;
          case 'down':  this._keysDown.add('ArrowDown');  this.lastAction = 'ArrowDown';  break;
          case 'left':  this._keysDown.add('ArrowLeft');  this.lastAction = 'ArrowLeft';  break;
          case 'right': this._keysDown.add('ArrowRight'); this.lastAction = 'ArrowRight'; break;
          case 'wait':  this.lastAction = 'wait';         break;
        }
      };

      const deactivate = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        switch (dir) {
          case 'up':    this._keysDown.delete('ArrowUp');    break;
          case 'down':  this._keysDown.delete('ArrowDown');  break;
          case 'left':  this._keysDown.delete('ArrowLeft');  break;
          case 'right': this._keysDown.delete('ArrowRight'); break;
        }
      };

      btn.addEventListener('touchstart', activate, { passive: false });
      btn.addEventListener('touchend', deactivate, { passive: false });
      btn.addEventListener('touchcancel', deactivate, { passive: false });
      btn.addEventListener('mousedown', activate);
      btn.addEventListener('mouseup', deactivate);
    });
  }

  /**
   * Build a touch action button element and wire its events.
   */
  _createActionBtn(label, keyValue, cssClass) {
    const btn = document.createElement('button');
    btn.className = 'action-btn' + (cssClass ? ' ' + cssClass : '');
    btn.textContent = label;

    const fire = (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      this._haptic();
      this.lastAction = keyValue;
    };
    const release = () => {
      btn.classList.remove('pressed');
    };

    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    btn.addEventListener('mousedown', fire);
    btn.addEventListener('mouseup', release);
    return btn;
  }

  /**
   * Context-sensitive button layout definitions per game state.
   * Each entry: { label, key, css? }
   *   css: 'act' (yellow primary), 'ability' (magenta), 'danger' (red), 'back' (dim green), or '' (default cyan)
   */
  static TOUCH_LAYOUTS = {
    // ── Exploration states ──
    MENU:        { showDpad: true, gridClass: '',
      buttons: [
        { label: 'SEL',  key: 'Enter', css: 'act' },
      ] },
    CHAR_CREATE: { showDpad: true, gridClass: '',
      buttons: [
        { label: 'SEL',  key: 'Enter', css: 'act' },
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    OVERWORLD:   { showDpad: true, gridClass: '',
      buttons: [
        { label: 'ACT',  key: 'Enter', css: 'act' },
        { label: 'INV',  key: 'i',     css: '' },
        { label: 'MAP',  key: 'm',     css: '' },
        { label: 'CHR',  key: 'c',     css: '' },
        { label: 'QST',  key: 'q',     css: '' },
        { label: 'REST', key: 'r',     css: 'back' },
      ] },
    LOCATION:    { showDpad: true, gridClass: '',
      buttons: [
        { label: 'ACT',  key: 'Enter', css: 'act' },
        { label: 'INV',  key: 'i',     css: '' },
        { label: 'MAP',  key: 'm',     css: '' },
        { label: 'CHR',  key: 'c',     css: '' },
        { label: 'QST',  key: 'q',     css: '' },
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    DUNGEON:     { showDpad: true, gridClass: '',
      buttons: [
        { label: 'GET',  key: 'g',     css: 'act' },
        { label: 'INV',  key: 'i',     css: '' },
        { label: 'STR\u2193', key: '>', css: '' },
        { label: 'CHR',  key: 'c',     css: '' },
        { label: 'QST',  key: 'q',     css: '' },
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },

    // ── Combat ──
    COMBAT:      { showDpad: false, gridClass: 'layout-2x3',
      buttons: [
        { label: 'ATK',  key: 'a',     css: 'act' },
        { label: 'FLEE', key: 'f',     css: 'danger' },
        { label: 'AB1',  key: '1',     css: 'ability' },
        { label: 'AB2',  key: '2',     css: 'ability' },
        { label: 'AB3',  key: '3',     css: 'ability' },
      ] },

    // ── Menus / overlays ──
    DIALOGUE:    { showDpad: true, gridClass: '',
      buttons: [
        { label: 'SEL',  key: 'Enter', css: 'act' },
        { label: 'A',    key: 'a',     css: '' },
        { label: 'B',    key: 'b',     css: '' },
        { label: 'C',    key: 'c',     css: '' },
        { label: 'D',    key: 'd',     css: '' },
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    SHOP:        { showDpad: true, gridClass: '',
      buttons: [
        { label: 'SEL',  key: 'Enter', css: 'act' },
        { label: 'BUY',  key: 'b',     css: '' },
        { label: 'SELL', key: 's',     css: '' },
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    INVENTORY:   { showDpad: true, gridClass: '',
      buttons: [
        { label: 'USE',  key: 'Enter', css: 'act' },
        { label: 'DROP', key: 'd',     css: 'danger' },
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    CHARACTER:   { showDpad: false, gridClass: 'layout-1col',
      buttons: [
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    QUEST_LOG:   { showDpad: false, gridClass: 'layout-1col',
      buttons: [
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    MAP:         { showDpad: false, gridClass: 'layout-1col',
      buttons: [
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    FACTION:     { showDpad: false, gridClass: 'layout-1col',
      buttons: [
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    HELP:        { showDpad: true, gridClass: '',
      buttons: [
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    SETTINGS:    { showDpad: false, gridClass: 'layout-2x3',
      buttons: [
        { label: '1',    key: '1',     css: '' },
        { label: '2',    key: '2',     css: '' },
        { label: '3',    key: '3',     css: '' },
        { label: '4',    key: '4',     css: '' },
        { label: 'ESC',  key: 'Escape', css: 'back' },
      ] },
    GAME_OVER:   { showDpad: false, gridClass: 'layout-1col',
      buttons: [
        { label: 'OK',   key: 'Enter', css: 'act' },
      ] },
  };

  /**
   * Switch the touch action buttons to match the current game state.
   * @param {string} state - the game state name (e.g. 'COMBAT', 'OVERWORLD')
   */
  setTouchLayout(state) {
    if (!this._actionArea) return;
    if (state === this._currentLayout) return;
    this._currentLayout = state;

    const layout = InputManager.TOUCH_LAYOUTS[state] || InputManager.TOUCH_LAYOUTS.OVERWORLD;

    // Show/hide D-pad
    if (this._dpad) {
      if (layout.showDpad) {
        this._dpad.classList.remove('hidden');
      } else {
        this._dpad.classList.add('hidden');
      }
    }

    // Clear old buttons
    this._actionArea.innerHTML = '';

    // Set grid class
    this._actionArea.className = 'action-buttons' + (layout.gridClass ? ' ' + layout.gridClass : '');

    // Create new buttons
    for (const def of layout.buttons) {
      this._actionArea.appendChild(this._createActionBtn(def.label, def.key, def.css));
    }
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
