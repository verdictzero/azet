// palette.js — Color and character palette UI

import { CGA, CGA_NAMES, CGA_VALUES, CHAR_CATEGORIES, EXTENDED_PALETTE } from './state.js';

export class PaletteUI {
  constructor(state) {
    this.state = state;
    this._activeCharTab = 'Common';
    this._gridCursorIndex = 0;
    this._buildColorPalettes();
    this._buildCharPalette();
    this._buildQuickSelect();
    this._setupCustomCharInput();
    this._updatePreview();

    state.on('pick', () => {
      this._syncColorSelection();
      this._updatePreview();
      this._syncQuickSelect();
    });
    state.on('change', () => this._updatePreview());
  }

  _buildColorPalettes() {
    const fgContainer = document.getElementById('fgPalette');
    const bgContainer = document.getElementById('bgPalette');

    for (const group of EXTENDED_PALETTE) {
      // FG group
      const fgGroup = document.createElement('div');
      fgGroup.className = 'palette-group';
      const fgHeader = document.createElement('div');
      fgHeader.className = 'palette-group-header';
      fgHeader.textContent = group.name;
      fgHeader.addEventListener('click', () => {
        fgGrid.classList.toggle('collapsed');
        fgHeader.classList.toggle('collapsed');
      });
      fgGroup.appendChild(fgHeader);
      const fgGrid = document.createElement('div');
      fgGrid.className = 'palette-group-grid';
      for (const hex of group.colors) {
        const sw = document.createElement('div');
        sw.className = 'palette-swatch';
        sw.style.backgroundColor = hex;
        sw.title = hex;
        sw.dataset.color = hex;
        if (hex === this.state.fgColor) sw.classList.add('active');
        sw.addEventListener('click', () => {
          this.state.fgColor = hex;
          this._syncColorSelection();
          this._updatePreview();
        });
        fgGrid.appendChild(sw);
      }
      fgGroup.appendChild(fgGrid);
      fgContainer.appendChild(fgGroup);

      // BG group
      const bgGroup = document.createElement('div');
      bgGroup.className = 'palette-group';
      const bgHeader = document.createElement('div');
      bgHeader.className = 'palette-group-header';
      bgHeader.textContent = group.name;
      bgHeader.addEventListener('click', () => {
        bgGrid.classList.toggle('collapsed');
        bgHeader.classList.toggle('collapsed');
      });
      bgGroup.appendChild(bgHeader);
      const bgGrid = document.createElement('div');
      bgGrid.className = 'palette-group-grid';
      for (const hex of group.colors) {
        const sw = document.createElement('div');
        sw.className = 'palette-swatch';
        sw.style.backgroundColor = hex;
        sw.title = hex;
        sw.dataset.color = hex;
        if (hex === this.state.bgColor) sw.classList.add('active');
        sw.addEventListener('click', () => {
          this.state.bgColor = hex;
          this._syncColorSelection();
          this._updatePreview();
        });
        bgGrid.appendChild(sw);
      }
      bgGroup.appendChild(bgGrid);
      bgContainer.appendChild(bgGroup);
    }
  }

  _syncColorSelection() {
    // Update FG swatches
    const fgSwatches = document.getElementById('fgPalette').querySelectorAll('.palette-swatch');
    for (const sw of fgSwatches) {
      sw.classList.toggle('active', sw.dataset.color === this.state.fgColor);
    }
    // Update BG swatches
    const bgSwatches = document.getElementById('bgPalette').querySelectorAll('.palette-swatch');
    for (const sw of bgSwatches) {
      sw.classList.toggle('active', sw.dataset.color === this.state.bgColor);
    }
  }

  _buildCharPalette() {
    const tabContainer = document.getElementById('charTabs');
    const gridContainer = document.getElementById('charGrid');

    tabContainer.innerHTML = '';
    const categories = Object.keys(CHAR_CATEGORIES);

    for (const cat of categories) {
      const tab = document.createElement('button');
      tab.className = 'char-tab' + (cat === this._activeCharTab ? ' active' : '');
      tab.textContent = cat;
      tab.addEventListener('click', () => {
        this._activeCharTab = cat;
        this._renderCharGrid();
        // Update tab active state
        for (const t of tabContainer.children) {
          t.classList.toggle('active', t.textContent === cat);
        }
      });
      tabContainer.appendChild(tab);
    }

    this._renderCharGrid();
  }

  _renderCharGrid() {
    const gridContainer = document.getElementById('charGrid');
    gridContainer.innerHTML = '';
    const chars = CHAR_CATEGORIES[this._activeCharTab] || '';

    let i = 0;
    for (const ch of chars) {
      const cell = document.createElement('div');
      let cls = 'char-cell';
      if (ch === this.state.currentChar) cls += ' active';
      if (i === this._gridCursorIndex) cls += ' char-cursor';
      cell.className = cls;
      cell.textContent = ch;
      cell.title = `${ch} (U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`;
      gridContainer.appendChild(cell);
      i++;
    }

    // Scroll cursor into view
    const cursorCell = gridContainer.querySelector('.char-cursor');
    if (cursorCell) cursorCell.scrollIntoView({ block: 'nearest' });
  }

  _setupCustomCharInput() {
    const input = document.getElementById('customChar');
    input.addEventListener('input', () => {
      if (input.value.length > 0) {
        this.state.currentChar = input.value[input.value.length - 1];
        input.value = this.state.currentChar;
        this._renderCharGrid();
        this._updatePreview();
      }
    });
  }

  _updatePreview() {
    const s = this.state;
    const previewCell = document.getElementById('previewCell');
    const previewChar = document.getElementById('previewChar');
    const infoChar = document.getElementById('infoChar');
    const infoCode = document.getElementById('infoCode');
    const infoFG = document.getElementById('infoFG');
    const infoBG = document.getElementById('infoBG');

    previewCell.style.backgroundColor = s.bgColor;
    previewChar.style.color = s.fgColor;
    previewChar.textContent = s.currentChar;

    infoChar.textContent = s.currentChar === ' ' ? '(space)' : s.currentChar;
    infoCode.textContent = 'U+' + s.currentChar.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
    infoFG.style.backgroundColor = s.fgColor;
    infoBG.style.backgroundColor = s.bgColor;
  }

  _buildQuickSelect() {
    const container = document.getElementById('quickSelect');
    container.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'quick-select-label';
    label.textContent = 'Quick:';
    container.appendChild(label);

    const keys = ['1','2','3','4','5','6','7','8','9','0'];
    for (let i = 0; i < 10; i++) {
      const slot = document.createElement('div');
      slot.className = 'quick-slot';
      slot.dataset.index = i;

      const s = this.state.quickSlots[i];
      slot.style.backgroundColor = s.bg;
      slot.style.color = s.fg;
      slot.textContent = s.char;

      const keyLabel = document.createElement('span');
      keyLabel.className = 'quick-slot-key';
      keyLabel.textContent = keys[i];
      slot.appendChild(keyLabel);

      // Left-click: select this slot
      slot.addEventListener('click', () => this.selectQuickSlot(i));

      // Right-click: assign current char+colors to this slot
      slot.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.assignQuickSlot(i);
      });

      slot.title = `Click: select | Right-click: assign current (${keys[i]})`;
      container.appendChild(slot);
    }
  }

  _syncQuickSelect() {
    const container = document.getElementById('quickSelect');
    const slots = container.querySelectorAll('.quick-slot');
    for (let i = 0; i < slots.length; i++) {
      const s = this.state.quickSlots[i];
      const slot = slots[i];
      slot.style.backgroundColor = s.bg;
      slot.style.color = s.fg;
      // Preserve the key label span
      const keySpan = slot.querySelector('.quick-slot-key');
      slot.textContent = s.char;
      slot.appendChild(keySpan);
      slot.classList.toggle('active',
        s.char === this.state.currentChar &&
        s.fg === this.state.fgColor &&
        s.bg === this.state.bgColor);
    }
  }

  selectQuickSlot(index) {
    const s = this.state.quickSlots[index];
    this.state.currentChar = s.char;
    this.state.fgColor = s.fg;
    this.state.bgColor = s.bg;
    this._syncColorSelection();
    this._renderCharGrid();
    this._updatePreview();
    this._syncQuickSelect();
  }

  assignQuickSlot(index) {
    this.state.quickSlots[index] = {
      char: this.state.currentChar,
      fg: this.state.fgColor,
      bg: this.state.bgColor,
    };
    this._syncQuickSelect();
  }

  moveCursor(direction) {
    const chars = CHAR_CATEGORIES[this._activeCharTab] || '';
    if (chars.length === 0) return;

    const container = document.getElementById('charGrid');
    const colCount = Math.max(1, Math.floor(container.clientWidth / 30));
    const rowCount = Math.ceil(chars.length / colCount);

    let col = this._gridCursorIndex % colCount;
    let row = Math.floor(this._gridCursorIndex / colCount);

    switch (direction) {
      case 'left':  col = (col - 1 + colCount) % colCount; break;
      case 'right': col = (col + 1) % colCount; break;
      case 'up':    row = (row - 1 + rowCount) % rowCount; break;
      case 'down':  row = (row + 1) % rowCount; break;
    }

    let idx = row * colCount + col;
    if (idx >= chars.length) idx = chars.length - 1;
    this._gridCursorIndex = Math.max(0, idx);
    this._renderCharGrid();
  }

  confirmCursor() {
    const chars = CHAR_CATEGORIES[this._activeCharTab] || '';
    if (chars.length === 0) return;
    const idx = Math.min(this._gridCursorIndex, chars.length - 1);
    this.state.currentChar = chars[idx];
    this.state.emit('pick');
    this.state.emit('change');
    this._renderCharGrid();
    this._updatePreview();
    this._syncQuickSelect();
  }

  cycleCategory(delta) {
    const categories = Object.keys(CHAR_CATEGORIES);
    const curIdx = categories.indexOf(this._activeCharTab);
    const newIdx = (curIdx + delta + categories.length) % categories.length;
    this._activeCharTab = categories[newIdx];
    this._gridCursorIndex = 0;
    this._renderCharGrid();

    // Update tab active states
    const tabContainer = document.getElementById('charTabs');
    for (const t of tabContainer.children) {
      t.classList.toggle('active', t.textContent === this._activeCharTab);
    }
  }

  syncCursorToCurrentChar() {
    const chars = CHAR_CATEGORIES[this._activeCharTab] || '';
    const idx = [...chars].indexOf(this.state.currentChar);
    if (idx >= 0) this._gridCursorIndex = idx;
  }

  // Allow external refresh (e.g. after load)
  refresh() {
    this.syncCursorToCurrentChar();
    this._syncColorSelection();
    this._renderCharGrid();
    this._updatePreview();
    this._syncQuickSelect();
  }
}
