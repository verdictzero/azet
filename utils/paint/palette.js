// palette.js — Color and character palette UI

import { CGA, CGA_NAMES, CGA_VALUES, CHAR_CATEGORIES, EXTENDED_PALETTE } from './state.js';

export class PaletteUI {
  constructor(state) {
    this.state = state;
    this._activeCharTab = 'Common';
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

    for (const ch of chars) {
      const cell = document.createElement('div');
      cell.className = 'char-cell' + (ch === this.state.currentChar ? ' active' : '');
      cell.textContent = ch;
      cell.title = `${ch} (U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`;
      cell.addEventListener('click', () => {
        this.state.currentChar = ch;
        this._renderCharGrid(); // re-render to update active
        this._updatePreview();
      });
      gridContainer.appendChild(cell);
    }
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

  // Allow external refresh (e.g. after load)
  refresh() {
    this._syncColorSelection();
    this._renderCharGrid();
    this._updatePreview();
    this._syncQuickSelect();
  }
}
