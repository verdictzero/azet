// renderer.js — Canvas rendering for the ASCII paint grid

export class Renderer {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;
    this.fontFamily = "'Noto Sans Mono', 'DejaVu Sans Mono', 'Courier New', Courier, monospace";
    this.baseFontSize = 16;
    this.cellW = 0;
    this.cellH = 0;
    this._dirty = true;
    this._rafId = null;

    this._measure();
    this._loop();
  }

  _measure() {
    const fontSize = this.baseFontSize * this.state.zoom;
    this.ctx.font = `${fontSize}px ${this.fontFamily}`;
    this.cellW = Math.ceil(this.ctx.measureText('M').width);
    this.cellH = Math.ceil(fontSize * 1.35);
  }

  resize() {
    this._measure();
    const { cols, rows } = this.state;
    this.canvas.width = cols * this.cellW;
    this.canvas.height = rows * this.cellH;
    this._dirty = true;
  }

  markDirty() { this._dirty = true; }

  _loop() {
    this._rafId = requestAnimationFrame(() => this._loop());
    if (!this._dirty) return;
    this._dirty = false;
    this._render();
  }

  _render() {
    const { ctx, cellW, cellH, state } = this;
    const { cols, rows, grid, showGrid } = state;
    const fontSize = this.baseFontSize * state.zoom;

    // Resize canvas if needed
    const needW = cols * cellW;
    const needH = rows * cellH;
    if (this.canvas.width !== needW || this.canvas.height !== needH) {
      this.canvas.width = needW;
      this.canvas.height = needH;
    }

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw cells
    ctx.font = `${fontSize}px ${this.fontFamily}`;
    ctx.textBaseline = 'top';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        const x = c * cellW;
        const y = r * cellH;

        // Background
        ctx.fillStyle = cell.bg;
        ctx.fillRect(x, y, cellW, cellH);

        // Character
        if (cell.char && cell.char !== ' ') {
          ctx.fillStyle = cell.fg;
          ctx.fillText(cell.char, x, y + 1);
        }
      }
    }

    // Grid lines
    if (showGrid && state.zoom >= 1) {
      ctx.strokeStyle = '#ffffff18';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const x = c * cellW;
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, rows * cellH);
      }
      for (let r = 0; r <= rows; r++) {
        const y = r * cellH;
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(cols * cellW, y + 0.5);
      }
      ctx.stroke();
    }

    // Draw tool preview overlay (line, rect, ellipse while dragging)
    this._drawToolPreview(ctx);

    // Selection overlay
    this._drawSelection(ctx);

    // Floating content overlay
    this._drawFloatingContent(ctx);

    // Hover cursor
    this._drawCursor(ctx);

    // Text cursor
    this._drawTextCursor(ctx);
  }

  _drawToolPreview(ctx) {
    const { state, cellW, cellH } = this;
    if (!state.mouseDown || !state.dragStart || !state.dragEnd) return;

    const tool = state.tool;
    if (tool !== 'line' && tool !== 'rect' && tool !== 'ellipse') return;

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = state.fgColor;
    ctx.font = `${this.baseFontSize * state.zoom}px ${this.fontFamily}`;
    ctx.textBaseline = 'top';

    const cells = this._getToolPreviewCells(state.dragStart, state.dragEnd, tool, state.filled);
    for (const [c, r] of cells) {
      if (c >= 0 && c < state.cols && r >= 0 && r < state.rows) {
        // Preview BG
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
        // Preview char
        if (state.currentChar !== ' ') {
          ctx.fillStyle = state.fgColor;
          ctx.fillText(state.currentChar, c * cellW, r * cellH + 1);
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }

  _getToolPreviewCells(start, end, tool, filled) {
    if (tool === 'line') return bresenhamLine(start.col, start.row, end.col, end.row);
    if (tool === 'rect') return rectCells(start.col, start.row, end.col, end.row, filled);
    if (tool === 'ellipse') return ellipseCells(start.col, start.row, end.col, end.row, filled);
    return [];
  }

  _drawSelection(ctx) {
    const sel = this.state.selection;
    if (!sel) return;
    const { cellW, cellH } = this;
    const x = sel.x * cellW;
    const y = sel.y * cellH;
    const w = sel.w * cellW;
    const h = sel.h * cellH;

    // Light fill
    ctx.fillStyle = '#55FF5515';
    ctx.fillRect(x, y, w, h);

    // Marching ants: animate dash offset
    const offset = Math.floor(Date.now() / 100) % 8;
    ctx.strokeStyle = '#55FF55';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -offset;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    this._dirty = true; // Keep animating
  }

  _drawFloatingContent(ctx) {
    const { state, cellW, cellH } = this;
    if (!state.floatingContent || !state.floatingPos) return;

    const { w, h, cells } = state.floatingContent;
    const { col, row } = state.floatingPos;
    const fontSize = this.baseFontSize * state.zoom;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.font = `${fontSize}px ${this.fontFamily}`;
    ctx.textBaseline = 'top';

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const cell = cells[r][c];
        const x = (col + c) * cellW;
        const y = (row + r) * cellH;

        ctx.fillStyle = cell.bg;
        ctx.fillRect(x, y, cellW, cellH);

        if (cell.char && cell.char !== ' ') {
          ctx.fillStyle = cell.fg;
          ctx.fillText(cell.char, x, y + 1);
        }
      }
    }

    // Yellow dashed border around floating content
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#FFFF55';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(col * cellW, row * cellH, w * cellW, h * cellH);
    ctx.setLineDash([]);
    ctx.restore();

    this._dirty = true; // Keep redrawing while floating for smooth tracking
  }

  _drawCursor(ctx) {
    const hover = this.state.hoverCell;
    if (!hover) return;
    if (this.state.floatingContent) return; // Floating content has its own visual
    const { cellW, cellH, state } = this;
    const tool = state.tool;
    const size = state.brushSize;

    ctx.strokeStyle = '#55FF55aa';
    ctx.lineWidth = 1.5;

    if ((tool === 'pencil' || tool === 'eraser') && size > 1) {
      const half = Math.floor(size / 2);
      ctx.strokeRect(
        (hover.col - half) * cellW + 0.5,
        (hover.row - half) * cellH + 0.5,
        size * cellW - 1,
        size * cellH - 1
      );
    } else {
      ctx.strokeRect(hover.col * cellW + 0.5, hover.row * cellH + 0.5, cellW - 1, cellH - 1);
    }
  }

  _drawTextCursor(ctx) {
    const tc = this.state.textCursor;
    if (!tc || this.state.tool !== 'text') return;
    const { cellW, cellH } = this;
    // Blinking cursor (uses time)
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = '#55FF55cc';
      ctx.fillRect(tc.col * cellW, tc.row * cellH + cellH - 2, cellW, 2);
    }
    this._dirty = true; // Keep animating for blink
  }

  // Convert pixel coordinates (relative to canvas) to grid col, row
  pixelToCell(px, py) {
    return {
      col: Math.floor(px / this.cellW),
      row: Math.floor(py / this.cellH),
    };
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }
}

// ── Geometry helpers ──

export function bresenhamLine(x0, y0, x1, y1) {
  const cells = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (true) {
    cells.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return cells;
}

export function rectCells(x0, y0, x1, y1, filled) {
  const cells = [];
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (filled || x === minX || x === maxX || y === minY || y === maxY) {
        cells.push([x, y]);
      }
    }
  }
  return cells;
}

export function ellipseCells(x0, y0, x1, y1, filled) {
  const cells = [];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
  if (rx < 0.5 || ry < 0.5) {
    cells.push([Math.round(cx), Math.round(cy)]);
    return cells;
  }
  const set = new Set();
  const add = (x, y) => {
    const key = `${x},${y}`;
    if (!set.has(key)) { set.add(key); cells.push([x, y]); }
  };

  if (filled) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) add(x, y);
      }
    }
  } else {
    // Outline: walk angle
    const steps = Math.max(60, Math.ceil(2 * Math.PI * Math.max(rx, ry)));
    for (let i = 0; i < steps; i++) {
      const a = (2 * Math.PI * i) / steps;
      add(Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)));
    }
  }
  return cells;
}
