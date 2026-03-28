// app.js — Main application wiring for ASCII Paint

import { State, CGA, CHAR_CATEGORIES } from './state.js';
import { Renderer } from './renderer.js';
import { ToolManager } from './tools.js';
import { PaletteUI } from './palette.js';
import { ClipboardHistoryUI } from './clipboard-ui.js';

export class App {
  constructor() {
    this.state = new State();
    this.canvas = document.getElementById('paintCanvas');
    this.renderer = new Renderer(this.canvas, this.state);
    this.tools = new ToolManager(this.state);
    this.palette = new PaletteUI(this.state);
    this.clipboardUI = new ClipboardHistoryUI(this.state, this.tools);

    // Panning state
    this._panning = false;
    this._panStart = { x: 0, y: 0 };
    this._panScrollStart = { left: 0, top: 0 };

    this.renderer.resize();

    this._setupCanvasEvents();
    this._setupToolbar();
    this._setupKeyboard();
    this._setupStatusBar();

    this.state.on('change', () => {
      this.renderer.markDirty();
      this._updateStatus();
    });

    // Sync toolbar when tool changes programmatically (e.g. eraser→pencil)
    this.state.on('toolchange', () => {
      document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === this.state.tool);
      });
      this._updateStatus();
    });

    this._updateStatus();
    this._setStatus('Ready — start painting!');
  }

  // ── Canvas mouse events ──

  _setupCanvasEvents() {
    const canvas = this.canvas;
    const canvasArea = canvas.closest('.canvas-area');

    // Prevent context menu on canvas
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', e => {
      // Middle click = start panning
      if (e.button === 1) {
        e.preventDefault();
        this._panning = true;
        this._panStart = { x: e.clientX, y: e.clientY };
        this._panScrollStart = { left: canvasArea.scrollLeft, top: canvasArea.scrollTop };
        canvas.style.cursor = 'grabbing';
        return;
      }

      const { col, row } = this._eventToCell(e);
      if (col < 0 || col >= this.state.cols || row < 0 || row >= this.state.rows) return;
      this.tools.onMouseDown(col, row, e.button);
      this.renderer.markDirty();
    });

    // Panning mousemove/mouseup on document so dragging outside canvas still works
    document.addEventListener('mousemove', e => {
      if (this._panning) {
        const dx = e.clientX - this._panStart.x;
        const dy = e.clientY - this._panStart.y;
        canvasArea.scrollLeft = this._panScrollStart.left - dx;
        canvasArea.scrollTop = this._panScrollStart.top - dy;
        return;
      }
    });

    document.addEventListener('mouseup', e => {
      if (e.button === 1 && this._panning) {
        this._panning = false;
        canvas.style.cursor = 'crosshair';
        return;
      }
    });

    canvas.addEventListener('mousemove', e => {
      if (this._panning) return;
      const { col, row } = this._eventToCell(e);
      this.state.hoverCell = (col >= 0 && col < this.state.cols && row >= 0 && row < this.state.rows)
        ? { col, row } : null;
      if (this.state.mouseDown) {
        const clampedCol = Math.max(0, Math.min(this.state.cols - 1, col));
        const clampedRow = Math.max(0, Math.min(this.state.rows - 1, row));
        this.tools.onMouseMove(clampedCol, clampedRow);
      }
      this.renderer.markDirty();
      this._updateStatus();
    });

    canvas.addEventListener('mouseup', e => {
      if (this._panning) return;
      const { col, row } = this._eventToCell(e);
      const clampedCol = Math.max(0, Math.min(this.state.cols - 1, col));
      const clampedRow = Math.max(0, Math.min(this.state.rows - 1, row));
      this.tools.onMouseUp(clampedCol, clampedRow);
      this.renderer.markDirty();
    });

    canvas.addEventListener('mouseleave', () => {
      this.state.hoverCell = null;
      this.renderer.markDirty();
    });

    // Scroll wheel = zoom
    canvasArea.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      this.state.zoom = Math.max(0.5, Math.min(4, this.state.zoom + delta));
      this.renderer.resize();
      this.renderer.markDirty();
      this._updateStatus();
    }, { passive: false });

    // Prevent browser-level zoom (Ctrl+wheel / pinch) from scaling the entire page
    document.addEventListener('wheel', e => {
      if (e.ctrlKey) e.preventDefault();
    }, { passive: false });
  }

  _eventToCell(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return this.renderer.pixelToCell(px, py);
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
              this.tools.copySelection();
              const content = {
                w: this.state.clipboard.w,
                h: this.state.clipboard.h,
                cells: this.state.clipboard.cells.map(row => row.map(c => ({ ...c }))),
              };
              this.tools.deleteSelection();
              this.tools.enterFloatingMode(content);
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
    document.getElementById('statusTool').textContent = s.floatingContent ? `${toolText} [FLOATING]` : toolText;
    document.getElementById('statusZoom').textContent = `${s.zoom}x`;
  }

  _setStatus(msg) {
    document.getElementById('statusMsg').textContent = msg;
  }
}
