// tools.js — Drawing tool implementations

import { bresenhamLine, rectCells, ellipseCells } from './renderer.js';

export class ToolManager {
  constructor(state) {
    this.state = state;
    // Track cells painted during a single drag so pencil/eraser don't repeat
    this._paintedThisStroke = new Set();
  }

  onMouseDown(col, row, button) {
    const s = this.state;
    s.mouseDown = true;
    s.mouseButton = button;
    s.dragStart = { col, row };
    s.dragEnd = { col, row };
    this._paintedThisStroke.clear();

    switch (s.tool) {
      case 'pencil':
        if (button === 0) this._paint(col, row);
        else if (button === 2) this._erase(col, row);
        break;
      case 'eraser':
        this._erase(col, row);
        break;
      case 'fill':
        if (button === 0) this._floodFill(col, row);
        break;
      case 'pick':
        this._pick(col, row);
        break;
      case 'text':
        s.textCursor = { col, row };
        break;
      case 'select':
        s.selection = null;
        break;
      // line, rect, ellipse: handled on mouseUp via dragStart/dragEnd
    }
  }

  onMouseMove(col, row) {
    const s = this.state;
    s.hoverCell = { col, row };
    if (!s.mouseDown) return;

    s.dragEnd = { col, row };

    switch (s.tool) {
      case 'pencil':
        if (s.mouseButton === 0) this._paintLine(s.dragStart, { col, row });
        else if (s.mouseButton === 2) this._eraseLine(s.dragStart, { col, row });
        // Update dragStart for continuous strokes
        s.dragStart = { col, row };
        break;
      case 'eraser':
        this._eraseLine(s.dragStart, { col, row });
        s.dragStart = { col, row };
        break;
      // line, rect, ellipse: renderer shows preview
    }
  }

  onMouseUp(col, row) {
    const s = this.state;
    if (!s.mouseDown) return;
    s.mouseDown = false;
    s.dragEnd = { col, row };

    const start = s.dragStart;
    if (!start) return;

    switch (s.tool) {
      case 'line':
        this._applyShapeCells(bresenhamLine(start.col, start.row, col, row));
        s.pushHistory();
        break;
      case 'rect':
        this._applyShapeCells(rectCells(start.col, start.row, col, row, s.filled));
        s.pushHistory();
        break;
      case 'ellipse':
        this._applyShapeCells(ellipseCells(start.col, start.row, col, row, s.filled));
        s.pushHistory();
        break;
      case 'pencil':
      case 'eraser':
        s.pushHistory();
        break;
      case 'select':
        this._finalizeSelection(start, { col, row });
        break;
    }

    this._paintedThisStroke.clear();
    s.dragStart = null;
    s.dragEnd = null;
  }

  onKeyPress(key) {
    const s = this.state;
    if (s.tool !== 'text' || !s.textCursor) return false;
    if (key.length !== 1) return false;

    s.setCell(s.textCursor.col, s.textCursor.row, key, s.fgColor, s.bgColor);
    s.textCursor.col++;
    if (s.textCursor.col >= s.cols) {
      s.textCursor.col = 0;
      s.textCursor.row++;
      if (s.textCursor.row >= s.rows) s.textCursor.row = 0;
    }
    s.pushHistory();
    s.emit('change');
    return true;
  }

  onTextBackspace() {
    const s = this.state;
    if (s.tool !== 'text' || !s.textCursor) return false;
    s.textCursor.col--;
    if (s.textCursor.col < 0) {
      s.textCursor.col = s.cols - 1;
      s.textCursor.row--;
      if (s.textCursor.row < 0) s.textCursor.row = s.rows - 1;
    }
    s.setCell(s.textCursor.col, s.textCursor.row, ' ', s.fgColor, s.bgColor);
    s.pushHistory();
    s.emit('change');
    return true;
  }

  // ── Private ──

  _paint(col, row) {
    const key = `${col},${row}`;
    if (this._paintedThisStroke.has(key)) return;
    this._paintedThisStroke.add(key);
    this.state.setCell(col, row, this.state.currentChar, this.state.fgColor, this.state.bgColor);
    this.state.emit('change');
  }

  _erase(col, row) {
    const key = `${col},${row}`;
    if (this._paintedThisStroke.has(key)) return;
    this._paintedThisStroke.add(key);
    this.state.setCell(col, row, ' ', this.state.fgColor, this.state.bgColor);
    this.state.emit('change');
  }

  _paintLine(from, to) {
    const cells = bresenhamLine(from.col, from.row, to.col, to.row);
    for (const [c, r] of cells) this._paint(c, r);
  }

  _eraseLine(from, to) {
    const cells = bresenhamLine(from.col, from.row, to.col, to.row);
    for (const [c, r] of cells) this._erase(c, r);
  }

  _applyShapeCells(cells) {
    const s = this.state;
    for (const [c, r] of cells) {
      if (c >= 0 && c < s.cols && r >= 0 && r < s.rows) {
        s.setCell(c, r, s.currentChar, s.fgColor, s.bgColor);
      }
    }
    s.emit('change');
  }

  _floodFill(startCol, startRow) {
    const s = this.state;
    const target = s.getCell(startCol, startRow);
    if (!target) return;
    const tChar = target.char, tFG = target.fg, tBG = target.bg;

    // Don't fill if target matches current brush
    if (tChar === s.currentChar && tFG === s.fgColor && tBG === s.bgColor) return;

    const visited = new Set();
    const queue = [[startCol, startRow]];
    const maxCells = s.cols * s.rows;
    let count = 0;

    while (queue.length > 0 && count < maxCells) {
      const [c, r] = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      if (c < 0 || c >= s.cols || r < 0 || r >= s.rows) continue;
      const cell = s.grid[r][c];
      if (cell.char !== tChar || cell.fg !== tFG || cell.bg !== tBG) continue;

      visited.add(key);
      s.setCell(c, r, s.currentChar, s.fgColor, s.bgColor);
      count++;

      queue.push([c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]);
    }

    s.pushHistory();
    s.emit('change');
  }

  _pick(col, row) {
    const cell = this.state.getCell(col, row);
    if (!cell) return;
    this.state.currentChar = cell.char === ' ' ? this.state.currentChar : cell.char;
    this.state.fgColor = cell.fg;
    this.state.bgColor = cell.bg;
    this.state.emit('pick');
    this.state.emit('change');
  }

  _finalizeSelection(start, end) {
    const x = Math.min(start.col, end.col);
    const y = Math.min(start.row, end.row);
    const w = Math.abs(end.col - start.col) + 1;
    const h = Math.abs(end.row - start.row) + 1;
    if (w > 0 && h > 0) {
      this.state.selection = { x, y, w, h };
    }
    this.state.emit('change');
  }

  // ── Selection operations ──

  copySelection() {
    const s = this.state;
    const sel = s.selection;
    if (!sel) return;

    const cells = [];
    for (let r = 0; r < sel.h; r++) {
      cells[r] = [];
      for (let c = 0; c < sel.w; c++) {
        const cell = s.getCell(sel.x + c, sel.y + r);
        cells[r][c] = cell ? { ...cell } : { char: ' ', fg: '#f8f0ff', bg: '#000000' };
      }
    }
    s.clipboard = { w: sel.w, h: sel.h, cells };
  }

  cutSelection() {
    this.copySelection();
    this.deleteSelection();
  }

  pasteAt(col, row) {
    const s = this.state;
    if (!s.clipboard) return;
    const { w, h, cells } = s.clipboard;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const cell = cells[r][c];
        s.setCell(col + c, row + r, cell.char, cell.fg, cell.bg);
      }
    }
    s.selection = { x: col, y: row, w, h };
    s.pushHistory();
    s.emit('change');
  }

  deleteSelection() {
    const s = this.state;
    const sel = s.selection;
    if (!sel) return;
    for (let r = 0; r < sel.h; r++) {
      for (let c = 0; c < sel.w; c++) {
        s.setCell(sel.x + c, sel.y + r, ' ', s.fgColor, s.bgColor);
      }
    }
    s.pushHistory();
    s.emit('change');
  }

  selectAll() {
    this.state.selection = { x: 0, y: 0, w: this.state.cols, h: this.state.rows };
    this.state.emit('change');
  }
}
