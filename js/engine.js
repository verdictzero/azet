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

    // Responsive breakpoints
    if (w < 600) {
      this.fontSize = 12;
    } else if (w < 1024) {
      this.fontSize = 14;
    } else {
      this.fontSize = 16;
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

  // ── CRT Post-processing ────────────────────

  /**
   * Run all enabled post-processing effects.
   */
  postProcess() {
    if (!this.effectsEnabled) return;
    this.applyScanlines();
    this.applyFlicker();
    this.applyVignette();
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
    this.targetX = entity.x - Math.floor(this.viewportCols / 2);
    this.targetY = entity.y - Math.floor(this.viewportRows / 2);
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

    // D-pad direction buttons
    const dirButtons = document.querySelectorAll('[data-dir]');
    dirButtons.forEach((btn) => {
      const dir = btn.getAttribute('data-dir');

      const activate = (e) => {
        e.preventDefault();
        switch (dir) {
          case 'up':    this._keysDown.add('ArrowUp');    break;
          case 'down':  this._keysDown.add('ArrowDown');  break;
          case 'left':  this._keysDown.add('ArrowLeft');  break;
          case 'right': this._keysDown.add('ArrowRight'); break;
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

    // Action buttons
    const actionButtons = document.querySelectorAll('[data-action]');
    actionButtons.forEach((btn) => {
      const action = btn.getAttribute('data-action');

      const fire = (e) => {
        e.preventDefault();
        this.lastAction = action;
      };

      btn.addEventListener('touchstart', fire, { passive: false });
      btn.addEventListener('mousedown', fire);
    });
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
