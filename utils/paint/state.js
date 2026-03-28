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

export const EXTENDED_PALETTE = [
  { name: 'Grays', colors: [
    '#000000', '#141414', '#282828', '#3c3c3c', '#505050', '#646464',
    '#787878', '#8c8c8c', '#a0a0a0', '#b4b4b4', '#c8c8c8', '#dcdcdc', '#f0f0f0', '#ffffff',
  ]},
  { name: 'Reds', colors: [
    '#1a0000', '#330000', '#4d0000', '#660000', '#800000', '#990000',
    '#b30000', '#cc0000', '#e60000', '#ff0000', '#ff3333', '#ff6666', '#ff9999', '#ffcccc',
  ]},
  { name: 'Oranges', colors: [
    '#1a0d00', '#331a00', '#4d2600', '#663300', '#804000', '#994d00',
    '#b35900', '#cc6600', '#e67300', '#ff8000', '#ff9933', '#ffb366', '#ffcc99', '#ffe6cc',
  ]},
  { name: 'Yellows', colors: [
    '#1a1a00', '#333300', '#4d4d00', '#666600', '#808000', '#999900',
    '#b3b300', '#cccc00', '#e6e600', '#ffff00', '#ffff33', '#ffff66', '#ffff99', '#ffffcc',
  ]},
  { name: 'Greens', colors: [
    '#001a00', '#003300', '#004d00', '#006600', '#008000', '#009900',
    '#00b300', '#00cc00', '#00e600', '#00ff00', '#33ff33', '#66ff66', '#99ff99', '#ccffcc',
  ]},
  { name: 'Teals', colors: [
    '#001a1a', '#003333', '#004d4d', '#006666', '#008080', '#009999',
    '#00b3b3', '#00cccc', '#00e6e6', '#00ffff', '#33ffff', '#66ffff', '#99ffff', '#ccffff',
  ]},
  { name: 'Blues', colors: [
    '#00001a', '#000033', '#00004d', '#000066', '#000080', '#000099',
    '#0000b3', '#0000cc', '#0000e6', '#0000ff', '#3333ff', '#6666ff', '#9999ff', '#ccccff',
  ]},
  { name: 'Purples', colors: [
    '#1a001a', '#330033', '#4d004d', '#660066', '#800080', '#990099',
    '#b300b3', '#cc00cc', '#e600e6', '#ff00ff', '#ff33ff', '#ff66ff', '#ff99ff', '#ffccff',
  ]},
  { name: 'Browns', colors: [
    '#1a0f00', '#332000', '#4d3000', '#664000', '#805020', '#996633',
    '#b38040', '#cc9966', '#d4a76a', '#dfb880', '#eacc99', '#f5e0b3',
  ]},
  { name: 'Pastels', colors: [
    '#ffb3b3', '#ffc9a3', '#ffe0a3', '#ffffb3', '#b3ffb3', '#b3ffe0',
    '#b3ffff', '#b3d9ff', '#b3b3ff', '#d9b3ff', '#ffb3ff', '#ffb3d9',
  ]},
  { name: 'CGA Classic', colors: CGA_VALUES },
];

export const CHAR_CATEGORIES = {
  'Common':     ' @#$%&*+-=~^.,:;\'"!?/\\|_<>(){}[]0123456789',
  'Blocks':     '█▓▒░▀▄▌▐■▪▫▬▮▯▰▱▂▃▅▆▇▉▊▋▍▎▏',
  'Box Light':  '─│┌┐└┘├┤┬┴┼╌╎┄┆┈┊',
  'Box Heavy':  '━┃┏┓┗┛┣┫┳┻╋╍╏┅┇┉┋',
  'Box Double': '═║╔╗╚╝╠╣╦╩╬',
  'Box Round':  '╭╮╯╰',
  'Box Mixed':  '╒╓╕╖╘╙╛╜╞╟╡╢╤╥╧╨╪╫',
  'Braille':    null, // generated dynamically
  'Geometric':  '◆◇◈○●◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡◢◣◤◥◦◧◨◩◪◫◬◭◮',
  'Symbols':    '♥♦♣♠★☆●○◆◇△▽§¶†‡©®™°±×÷≈≠≤≥∞µ∑∏∫√∂∇',
  'Arrows':     '←→↑↓↔↕◄►▲▼↖↗↘↙⇐⇒⇑⇓⇔⇕↩↪↰↱↲↳↴↵↶↷',
  'Math':       '∀∃∄∅∆∈∉∊∋∌∍∎∏∐∑−∓∔∕∖∗∘∙√∛∜∝∞∟∠∡∢∣∤∥∦',
  'Dingbats':   '✁✂✃✄✆✇✈✉✌✍✎✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝✞✟✠✡✢✣✤✥✦✧',
  'Stars':      '✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❇❈❉❊❋',
  'Enclosed':   '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳',
  'Game':       '⚔⛨✦☠♥☀☁☂♪♫✿❖◈⌂⚑⚐⚒⚓⚕⚖⚗⚘⚙⚛⚜⛏⛰⛵⛺',
  'Faces':      '☺☻☹🙂🙃😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏',
  'Weather':    '☀☁☂☃☄★☆☇☈☉☊☋☌☍☼☽☾',
  'Music':      '♩♪♫♬♭♮♯',
  'Currency':   '$¢£¤¥€₹₽₿₩₪₫₭₮₱₲₳₴₵₸₺₻₼₾',
  'Latin':      'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ',
  'Greek':      'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω',
  'ASCII':      null, // generated dynamically
};

// Build Braille block (U+2800 - U+283F)
CHAR_CATEGORIES['Braille'] = '';
for (let i = 0x2800; i <= 0x283F; i++) CHAR_CATEGORIES['Braille'] += String.fromCharCode(i);

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
    this.clipboardHistory = []; // Array of {w, h, cells, timestamp}
    this.activeClipboardIndex = 0;

    // Quick-select palette (keys 1-9, 0)
    this.quickSlots = [
      { char: '@', fg: CGA.BRIGHT_GREEN, bg: CGA.BLACK },
      { char: '#', fg: CGA.BRIGHT_WHITE, bg: CGA.BLACK },
      { char: '█', fg: CGA.BRIGHT_BLUE, bg: CGA.BLACK },
      { char: '▓', fg: CGA.BRIGHT_CYAN, bg: CGA.BLACK },
      { char: '░', fg: CGA.WHITE, bg: CGA.BLACK },
      { char: '─', fg: CGA.BRIGHT_WHITE, bg: CGA.BLACK },
      { char: '│', fg: CGA.BRIGHT_WHITE, bg: CGA.BLACK },
      { char: '★', fg: CGA.BRIGHT_YELLOW, bg: CGA.BLACK },
      { char: '●', fg: CGA.BRIGHT_RED, bg: CGA.BLACK },
      { char: ' ', fg: CGA.BRIGHT_WHITE, bg: CGA.BLACK },
    ];

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
