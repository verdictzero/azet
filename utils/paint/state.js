// state.js — Central state for the ASCII paint app

export const CGA = Object.freeze({
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
});

export const CGA_NAMES = Object.keys(CGA);
export const CGA_VALUES = Object.values(CGA);

export const CHAR_CATEGORIES = {
  'Common':   ' @#$%&*+-=~^.,:;\'"!?/\\|_<>(){}[]0123456789',
  'Blocks':   '█▓▒░▀▄▌▐■▪▫▬▮▯',
  'Box':      '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╭╮╯╰',
  'Symbols':  '♥♦♣♠★☆●○◆◇△▽§¶†‡©®™°±×÷≈≠≤≥∞µ',
  'Arrows':   '←→↑↓↔↕◄►▲▼↖↗↘↙',
  'Game':     '⚔⛨✦☠♥☀☁☂♪♫✿❖◈⌂⚑',
  'ASCII':    null, // generated dynamically
};

// Build full printable ASCII range
CHAR_CATEGORIES['ASCII'] = '';
for (let i = 0x20; i <= 0x7E; i++) CHAR_CATEGORIES['ASCII'] += String.fromCharCode(i);

export class State {
  constructor() {
    this.cols = 40;
    this.rows = 24;
    this.grid = [];
    this.tool = 'pencil';
    this.currentChar = '@';
    this.fgColor = CGA.BRIGHT_GREEN;
    this.bgColor = CGA.BLACK;
    this.showGrid = true;
    this.filled = false;
    this.zoom = 1;

    // Mouse / drawing state
    this.mouseDown = false;
    this.mouseButton = 0;
    this.dragStart = null; // {col, row}
    this.dragEnd = null;
    this.hoverCell = null; // {col, row}

    // Selection
    this.selection = null; // {x, y, w, h}
    this.clipboard = null; // {w, h, cells: 2D}

    // Text tool cursor
    this.textCursor = null; // {col, row}

    // History
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;

    // Listeners
    this._listeners = {};

    this.initGrid();
    this.pushHistory();
  }

  initGrid() {
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = { char: ' ', fg: CGA.BRIGHT_WHITE, bg: CGA.BLACK };
      }
    }
  }

  resizeGrid(newCols, newRows) {
    const oldGrid = this.grid;
    const oldRows = this.rows;
    const oldCols = this.cols;
    this.cols = newCols;
    this.rows = newRows;
    this.grid = [];
    for (let r = 0; r < newRows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < newCols; c++) {
        if (r < oldRows && c < oldCols) {
          this.grid[r][c] = { ...oldGrid[r][c] };
        } else {
          this.grid[r][c] = { char: ' ', fg: CGA.BRIGHT_WHITE, bg: CGA.BLACK };
        }
      }
    }
    this.selection = null;
    this.pushHistory();
  }

  getCell(col, row) {
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      return this.grid[row][col];
    }
    return null;
  }

  setCell(col, row, char, fg, bg) {
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      const cell = this.grid[row][col];
      if (char !== undefined) cell.char = char;
      if (fg !== undefined) cell.fg = fg;
      if (bg !== undefined) cell.bg = bg;
    }
  }

  // Deep-copy the grid for undo snapshots
  cloneGrid() {
    return this.grid.map(row => row.map(cell => ({ ...cell })));
  }

  pushHistory() {
    // Truncate any redo states
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.cloneGrid());
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.grid = this.history[this.historyIndex].map(row => row.map(c => ({ ...c })));
      this.emit('change');
      return true;
    }
    return false;
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.grid = this.history[this.historyIndex].map(row => row.map(c => ({ ...c })));
      this.emit('change');
      return true;
    }
    return false;
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  emit(event, data) {
    if (this._listeners[event]) {
      for (const fn of this._listeners[event]) fn(data);
    }
  }

  // Export grid as JSON (compatible with converter format)
  toJSON() {
    return {
      cols: this.cols,
      rows: this.rows,
      cells: this.grid,
    };
  }

  // Load from JSON
  fromJSON(data) {
    if (!data || !data.cells) return false;
    this.cols = data.cols || data.cells[0]?.length || 40;
    this.rows = data.rows || data.cells.length || 24;
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const src = data.cells[r]?.[c];
        this.grid[r][c] = src
          ? { char: src.char || ' ', fg: src.fg || CGA.BRIGHT_WHITE, bg: src.bg || CGA.BLACK }
          : { char: ' ', fg: CGA.BRIGHT_WHITE, bg: CGA.BLACK };
      }
    }
    this.selection = null;
    this.history = [];
    this.historyIndex = -1;
    this.pushHistory();
    this.emit('change');
    return true;
  }
}
