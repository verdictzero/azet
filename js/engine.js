// engine.js - Retro ASCII roguelike rendering engine
// ES module: exports COLORS, Renderer, Camera, InputManager

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
    this.ctx = canvas.getContext('2d');

    this.fontSize = 16;
    this.fontFamily = "'Courier New', Courier, monospace";
    this.cellWidth = 0;
    this.cellHeight = 0;
    this.cols = 0;
    this.rows = 0;

    // Double-buffer: current and previous frame cell data
    this.buffer = [];      // current frame being built
    this.prevBuffer = [];  // last rendered frame

    this.effectsEnabled = true;

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

    // Responsive breakpoints (only if no user override)
    if (!this._userFontSize) {
      if (w < 600) {
        this.fontSize = 12;
      } else if (w < 1024) {
        this.fontSize = 14;
      } else {
        this.fontSize = 16;
      }
    }

    // Measure a representative character to derive cell size
    this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    const metrics = this.ctx.measureText('M');
    this.cellWidth = Math.ceil(metrics.width);
    this.cellHeight = Math.ceil(this.fontSize * 1.35);

    // Size canvas to fill container / window, then compute grid dims
    const targetWidth = window.innerWidth;
    const targetHeight = window.innerHeight;

    // Clamp columns to the responsive target
    let targetCols;
    if (w < 600) {
      targetCols = 40;
    } else if (w < 1024) {
      targetCols = 60;
    } else {
      targetCols = 100;
    }

    this.cols = Math.min(targetCols, Math.floor(targetWidth / this.cellWidth));
    this.rows = Math.floor(targetHeight / this.cellHeight);

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
   * Finish the frame: render only cells that changed since last frame.
   */
  endFrame() {
    const ctx = this.ctx;
    const cw = this.cellWidth;
    const ch = this.cellHeight;
    const hasPrev = this.prevBuffer.length === this.rows;

    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    ctx.textBaseline = 'top';

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.buffer[r][c];

        // Skip unchanged cells
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
    for (let i = 0; i < lines.length && i < h - 2; i++) {
      const line = lines[i].length > maxLen
        ? lines[i].slice(0, maxLen)
        : lines[i];
      this.drawString(col + 1, row + 1 + i, line, fg, bg);
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
   * @param {string} tileType - WATER, DEEP_WATER, LAVA, FIREPLACE, etc.
   * @returns {string} the current animated color
   */
  getAnimatedColor(baseColor, tileType) {
    const t = Date.now() / 500;
    const phase = Math.sin(t) * 0.5 + 0.5; // 0-1

    switch (tileType) {
      case 'WATER':
      case 'SHALLOW_WATER': {
        const blues = ['#0055AA', '#0066BB', '#0044AA'];
        return blues[Math.floor(t) % blues.length];
      }
      case 'DEEP_WATER': {
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
    this.applyScanlines();
    this.applyFlicker();
    this.applyVignette();
    this.applyPhosphorDecay();
    this.applyGlitch();
  }

  /**
   * Subtle horizontal scanlines every 2 pixels.
   */
  applyScanlines() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let y = 0; y < h; y += 2) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  /**
   * Random subtle flicker by modulating global alpha.
   */
  applyFlicker() {
    const ctx = this.ctx;
    const variance = Math.random() * 0.015; // 0 – 1.5%
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
   * Phosphor decay: subtle ghosting from previous frame.
   */
  applyPhosphorDecay() {
    // Implemented via slight blend — the double-buffer already handles this
    // by only redrawing changed cells, creating a natural persistence effect.
    // Add a very subtle green phosphor glow:
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 20, 0, 0.02)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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

    // Shift 1-3 random rows by a few pixels
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
    for (const p of this.particles) {
      const sx = Math.round(p.x - cameraX);
      const sy = Math.round(p.y - cameraY);
      if (sx >= 0 && sx < renderer.cols && sy >= 0 && sy < renderer.rows - 7) {
        // Fade alpha by remaining life
        const fade = p.life / p.maxLife;
        if (fade > 0.3) {
          renderer.drawChar(sx, sy, p.char, p.fg);
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

    // D-pad direction buttons
    const dirButtons = document.querySelectorAll('[data-dir]');
    dirButtons.forEach((btn) => {
      const dir = btn.getAttribute('data-dir');

      const activate = (e) => {
        e.preventDefault();
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
        switch (dir) {
          case 'up':    this._keysDown.delete('ArrowUp');    break;
          case 'down':  this._keysDown.delete('ArrowDown');  break;
          case 'left':  this._keysDown.delete('ArrowLeft');  break;
          case 'right': this._keysDown.delete('ArrowRight'); break;
        }
      };

      btn.addEventListener('touchstart', activate, { passive: false });
      btn.addEventListener('touchend', deactivate, { passive: false });
      btn.addEventListener('mousedown', activate);
      btn.addEventListener('mouseup', deactivate);
    });

    // Action buttons — map to the key values that handleInput expects
    const actionKeyMap = {
      interact: 'Enter',
      inventory: 'i',
      map: 'm',
      menu: 'Escape',
    };

    const actionButtons = document.querySelectorAll('[data-action]');
    actionButtons.forEach((btn) => {
      const action = btn.getAttribute('data-action');

      const fire = (e) => {
        e.preventDefault();
        this.lastAction = actionKeyMap[action] || action;
      };

      btn.addEventListener('touchstart', fire, { passive: false });
      btn.addEventListener('mousedown', fire);
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
