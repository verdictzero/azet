// app.js — Main application wiring for ASCII Paint

import { State, CGA, CHAR_CATEGORIES } from './state.js';
import { Renderer } from './renderer.js';
import { ToolManager } from './tools.js';
import { PaletteUI } from './palette.js';
import { ClipboardHistoryUI } from './clipboard-ui.js';
import { InputManager } from './input.js';

export class App {
  constructor() {
    this.state = new State();
    this.canvas = document.getElementById('paintCanvas');
    this.renderer = new Renderer(this.canvas, this.state);
    this.tools = new ToolManager(this.state);
    this.palette = new PaletteUI(this.state);
    this.clipboardUI = new ClipboardHistoryUI(this.state, this.tools);

    this.renderer.resize();

    // Unified input (pointer events: mouse, touch, S Pen)
    const canvasArea = this.canvas.closest('.canvas-area');
    this.input = new InputManager(this.canvas, canvasArea, this.state, this.tools, this.renderer, {
      markDirty: () => this.renderer.markDirty(),
      updateStatus: () => this._updateStatus(),
      updateCursor: () => this._updateCursor(),
      setStatus: (msg) => this._setStatus(msg),
    });

    this._setupToolbar();
    this._setupMobileUI();
    this._setupKeyboard();
    this._setupStatusBar();

    this.state.on('change', () => {
      this.renderer.markDirty();
      this._updateStatus();
      this._updateCursor();
    });

    // Sync toolbar when tool changes programmatically (e.g. eraser→pencil)
    this.state.on('toolchange', () => {
      document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === this.state.tool);
      });
      this._updateStatus();
      this._updateCursor();
    });

    this._updateStatus();
    this._setStatus('Ready — start painting!');
  }

  // ── Toolbar ──

  _setupToolbar() {
    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectTool(btn.dataset.tool);
      });
    });

    // Grid toggle
    document.getElementById('chkGrid').addEventListener('change', e => {
      this.state.showGrid = e.target.checked;
      this.renderer.markDirty();
    });

    // Brush size
    document.getElementById('selBrushSize').addEventListener('change', e => {
      this.state.brushSize = parseInt(e.target.value);
      this._setStatus(`Brush size: ${this.state.brushSize}x${this.state.brushSize}`);
    });

    // Filled toggle
    document.getElementById('chkFilled').addEventListener('change', e => {
      this.state.filled = e.target.checked;
    });

    // Resize
    document.getElementById('btnResize').addEventListener('click', () => {
      const cols = parseInt(document.getElementById('numCols').value) || 40;
      const rows = parseInt(document.getElementById('numRows').value) || 24;
      this.state.resizeGrid(
        Math.max(4, Math.min(200, cols)),
        Math.max(4, Math.min(200, rows))
      );
      document.getElementById('numCols').value = this.state.cols;
      document.getElementById('numRows').value = this.state.rows;
      this.renderer.resize();
      this.renderer.markDirty();
      this._setStatus(`Resized to ${this.state.cols} x ${this.state.rows}`);
    });

    // File operations
    document.getElementById('btnNew').addEventListener('click', () => this._newFile());
    document.getElementById('btnSave').addEventListener('click', () => this._saveJSON());
    document.getElementById('btnLoad').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', e => this._loadJSON(e));
    document.getElementById('btnExportPNG').addEventListener('click', () => this._exportPNG());
    document.getElementById('btnExportTxt').addEventListener('click', () => this._exportText());

    // Undo / Redo
    document.getElementById('btnUndo').addEventListener('click', () => {
      if (this.state.undo()) this._setStatus('Undo');
      this.renderer.markDirty();
    });
    document.getElementById('btnRedo').addEventListener('click', () => {
      if (this.state.redo()) this._setStatus('Redo');
      this.renderer.markDirty();
    });
  }

  _selectTool(tool) {
    this.state.tool = tool;
    if (tool !== 'text') this.state.textCursor = null;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    this._updateStatus();
  }

  // ── Keyboard ──

  _setupKeyboard() {
    document.addEventListener('keydown', e => {
      // Don't capture when typing in inputs
      if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl shortcuts
      if (ctrl) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (this.state.undo()) this._setStatus('Undo');
            this.renderer.markDirty();
            return;
          case 'y':
            e.preventDefault();
            if (this.state.redo()) this._setStatus('Redo');
            this.renderer.markDirty();
            return;
          case 'c':
            e.preventDefault();
            this.tools.copySelection();
            if (this.state.clipboard) {
              const n = this.state.clipboardHistory.length;
              this._setStatus(`Copied selection (${n} in history)`);
            }
            return;
          case 'x':
            e.preventDefault();
            if (this.state.selection) {
              const sel = this.state.selection;
              const origin = { col: sel.x, row: sel.y };
              this.tools.copySelection();
              const content = {
                w: this.state.clipboard.w,
                h: this.state.clipboard.h,
                cells: this.state.clipboard.cells.map(row => row.map(c => ({ ...c }))),
              };
              // Store original cells before deleting for cancel-restore
              const originalCells = content.cells.map(row => row.map(c => ({ ...c })));
              this.tools.deleteSelection();
              this.tools.enterFloatingMode(content, origin, originalCells);
              this._setStatus('Cut — click to place, Escape to cancel');
              this.renderer.markDirty();
            }
            return;
          case 'v':
            e.preventDefault();
            if (this.state.clipboard) {
              this.tools.enterFloatingMode(this.state.clipboard);
              this._setStatus('Floating paste — click to place, Escape to cancel');
              this.renderer.markDirty();
            }
            return;
          case 'a':
            e.preventDefault();
            this.tools.selectAll();
            this._setStatus('Selected all');
            this.renderer.markDirty();
            return;
          case 's':
            e.preventDefault();
            this._saveJSON();
            return;
          case 'o':
            e.preventDefault();
            document.getElementById('fileInput').click();
            return;
          case 'n':
            e.preventDefault();
            this._newFile();
            return;
        }
        return;
      }

      // Floating content controls
      if (this.state.floatingContent) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.tools.cancelFloating();
          this._setStatus('Paste cancelled');
          this.renderer.markDirty();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          this.tools.placeFloatingContent();
          this._setStatus('Placed');
          this.renderer.markDirty();
          return;
        }
        const nudgeMap = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
        if (nudgeMap[e.key]) {
          e.preventDefault();
          this.tools.nudgeFloating(...nudgeMap[e.key]);
          this.renderer.markDirty();
          return;
        }
      }

      // Escape to deselect
      if (e.key === 'Escape' && this.state.selection && !this.state.floatingContent) {
        e.preventDefault();
        this.state.selection = null;
        this.renderer.markDirty();
        this._setStatus('Deselected');
        return;
      }

      // Text tool typing
      if (this.state.tool === 'text' && this.state.textCursor) {
        if (e.key === 'Backspace') {
          e.preventDefault();
          this.tools.onTextBackspace();
          this.renderer.markDirty();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          this.state.textCursor.col = 0;
          this.state.textCursor.row++;
          if (this.state.textCursor.row >= this.state.rows) this.state.textCursor.row = 0;
          this.renderer.markDirty();
          return;
        }
        if (e.key === 'Escape') {
          this.state.textCursor = null;
          this.renderer.markDirty();
          return;
        }
        if (e.key.length === 1 && !ctrl) {
          e.preventDefault();
          this.tools.onKeyPress(e.key);
          this.renderer.markDirty();
          return;
        }
      }

      // Quick-select palette: 1-9, 0 (Shift+number to assign)
      if (!ctrl && e.key >= '0' && e.key <= '9') {
        const index = e.key === '0' ? 9 : parseInt(e.key) - 1;
        if (e.shiftKey) {
          this.palette.assignQuickSlot(index);
          this._setStatus(`Assigned to quick slot ${e.key}`);
        } else {
          this.palette.selectQuickSlot(index);
          this._setStatus(`Quick slot ${e.key}`);
        }
        this.renderer.markDirty();
        return;
      }

      // Tool hotkeys (single letter, not in text mode)
      if (!ctrl && e.key.length === 1) {
        const hotkeys = {
          'p': 'pencil', 'e': 'eraser', 'f': 'fill', 'l': 'line',
          'r': 'rect', 'o': 'ellipse', 't': 'text', 'i': 'pick', 's': 'select', 'm': 'move',
        };
        const tool = hotkeys[e.key.toLowerCase()];
        if (tool) {
          this._selectTool(tool);
          return;
        }
        if (e.key === 'g') {
          this.state.showGrid = !this.state.showGrid;
          document.getElementById('chkGrid').checked = this.state.showGrid;
          this.renderer.markDirty();
          return;
        }
      }

      // Delete selection
      if (e.key === 'Delete' && this.state.selection) {
        e.preventDefault();
        this.tools.deleteSelection();
        this._setStatus('Deleted selection');
        this.renderer.markDirty();
      }

      // Bracket keys: cycle chars
      if (e.key === '[' || e.key === ']') {
        const allChars = Object.values(CHAR_CATEGORIES).join('');
        const idx = allChars.indexOf(this.state.currentChar);
        if (idx >= 0) {
          const newIdx = e.key === ']'
            ? (idx + 1) % allChars.length
            : (idx - 1 + allChars.length) % allChars.length;
          this.state.currentChar = allChars[newIdx];
          this.state.emit('pick');
          this.state.emit('change');
          this.palette.refresh();
        }
      }
    });
  }

  // ── File Operations ──

  _newFile() {
    const cols = parseInt(document.getElementById('numCols').value) || 40;
    const rows = parseInt(document.getElementById('numRows').value) || 24;
    this.state.cols = Math.max(4, Math.min(200, cols));
    this.state.rows = Math.max(4, Math.min(200, rows));
    this.state.initGrid();
    this.state.history = [];
    this.state.historyIndex = -1;
    this.state.pushHistory();
    this.state.selection = null;
    this.renderer.resize();
    this.renderer.markDirty();
    this._setStatus('New canvas created');
  }

  _saveJSON() {
    const data = this.state.toJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ascii-art.json';
    a.click();
    URL.revokeObjectURL(a.href);
    this._setStatus('Saved JSON');
  }

  _loadJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (this.state.fromJSON(data)) {
          document.getElementById('numCols').value = this.state.cols;
          document.getElementById('numRows').value = this.state.rows;
          this.renderer.resize();
          this.renderer.markDirty();
          this.palette.refresh();
          this._setStatus(`Loaded: ${file.name}`);
        } else {
          this._setStatus('Invalid JSON format');
        }
      } catch (err) {
        this._setStatus('Error loading file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be reloaded
  }

  _exportPNG() {
    // Render at 1x zoom to a temp canvas for clean export
    const tmpCanvas = document.createElement('canvas');
    const tmpCtx = tmpCanvas.getContext('2d');
    const fontSize = 16;
    const font = `${fontSize}px ${this.renderer.fontFamily}`;
    tmpCtx.font = font;
    const cellW = Math.ceil(tmpCtx.measureText('M').width);
    const cellH = Math.ceil(fontSize * 1.35);
    tmpCanvas.width = this.state.cols * cellW;
    tmpCanvas.height = this.state.rows * cellH;

    tmpCtx.font = font;
    tmpCtx.textBaseline = 'top';

    for (let r = 0; r < this.state.rows; r++) {
      for (let c = 0; c < this.state.cols; c++) {
        const cell = this.state.grid[r][c];
        tmpCtx.fillStyle = cell.bg;
        tmpCtx.fillRect(c * cellW, r * cellH, cellW, cellH);
        if (cell.char && cell.char !== ' ') {
          tmpCtx.fillStyle = cell.fg;
          tmpCtx.fillText(cell.char, c * cellW, r * cellH + 1);
        }
      }
    }

    const a = document.createElement('a');
    a.href = tmpCanvas.toDataURL('image/png');
    a.download = 'ascii-art.png';
    a.click();
    this._setStatus('Exported PNG');
  }

  _exportText() {
    const lines = this.state.grid.map(row => row.map(c => c.char).join(''));
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ascii-art.txt';
    a.click();
    URL.revokeObjectURL(a.href);
    this._setStatus('Exported text');
  }

  // ── Cursor ──

  _updateCursor() {
    const s = this.state;
    const canvas = this.canvas;

    if (this.input.isPanning()) {
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (s.floatingContent) {
      canvas.style.cursor = s.mouseDown ? 'grabbing' : 'grab';
      return;
    }

    const hover = s.hoverCell;
    const sel = s.selection;

    if (s.tool === 'move' && sel && hover &&
        hover.col >= sel.x && hover.col < sel.x + sel.w &&
        hover.row >= sel.y && hover.row < sel.y + sel.h) {
      canvas.style.cursor = 'grab';
      return;
    }

    const cursorMap = {
      pencil: 'crosshair', eraser: 'crosshair', fill: 'crosshair',
      line: 'crosshair', rect: 'crosshair', ellipse: 'crosshair',
      text: 'text', pick: 'crosshair', select: 'crosshair',
      move: 'default',
    };
    canvas.style.cursor = cursorMap[s.tool] || 'crosshair';
  }

  // ── Status Bar ──

  _setupStatusBar() {
    // Initial sync
    this._updateStatus();
  }

  _updateStatus() {
    const s = this.state;
    const hover = s.hoverCell;
    document.getElementById('statusPos').textContent = hover
      ? `${hover.col}, ${hover.row}` : '-, -';
    document.getElementById('statusSize').textContent = `${s.cols} x ${s.rows}`;
    const toolText = s.tool.charAt(0).toUpperCase() + s.tool.slice(1);
    let toolStatus = s.floatingContent ? `${toolText} [FLOATING]` : toolText;
    if (s.penPressureBrush !== null) {
      toolStatus += ` | Pen ${s.penPressureBrush}x${s.penPressureBrush}`;
    }
    document.getElementById('statusTool').textContent = toolStatus;
    document.getElementById('statusZoom').textContent = `${s.zoom}x`;
  }

  // ── Mobile UI ──

  _setupMobileUI() {
    const hamburger = document.getElementById('btnHamburger');
    const toolbar = document.querySelector('.toolbar');
    const leftSidebar = document.querySelector('.sidebar');
    const rightSidebar = document.querySelector('.sidebar-right');
    const backdrop = document.getElementById('sidebarBackdrop');

    hamburger?.addEventListener('click', () => {
      toolbar.classList.toggle('expanded');
    });

    document.getElementById('btnToggleLeft')?.addEventListener('click', () => {
      rightSidebar.classList.remove('open');
      leftSidebar.classList.toggle('open');
      backdrop.classList.toggle('active', leftSidebar.classList.contains('open'));
    });

    document.getElementById('btnToggleRight')?.addEventListener('click', () => {
      leftSidebar.classList.remove('open');
      rightSidebar.classList.toggle('open');
      backdrop.classList.toggle('active', rightSidebar.classList.contains('open'));
    });

    backdrop?.addEventListener('click', () => {
      leftSidebar.classList.remove('open');
      rightSidebar.classList.remove('open');
      backdrop.classList.remove('active');
    });
  }

  _setStatus(msg) {
    document.getElementById('statusMsg').textContent = msg;
  }
}
