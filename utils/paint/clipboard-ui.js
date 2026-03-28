// clipboard-ui.js — Clipboard history sidebar UI

export class ClipboardHistoryUI {
  constructor(state) {
    this.state = state;
    this.fontFamily = "'Noto Sans Mono', 'DejaVu Sans Mono', 'Courier New', Courier, monospace";
    this.container = document.getElementById('clipboardItems');

    state.on('clipboardchange', () => this._render());
  }

  _render() {
    const s = this.state;
    this.container.innerHTML = '';

    for (let i = 0; i < s.clipboardHistory.length; i++) {
      const item = s.clipboardHistory[i];
      const el = document.createElement('div');
      el.className = 'clipboard-item' + (i === s.activeClipboardIndex ? ' active' : '');

      // Mini canvas preview
      const preview = this._renderPreview(item);
      el.appendChild(preview);

      // Info label
      const info = document.createElement('div');
      info.className = 'clipboard-item-info';
      info.textContent = `${item.w}x${item.h}`;
      el.appendChild(info);

      const idx = i;
      el.addEventListener('click', () => {
        s.activeClipboardIndex = idx;
        // Set as active clipboard for paste
        s.clipboard = {
          w: item.w,
          h: item.h,
          cells: item.cells.map(row => row.map(c => ({ ...c }))),
        };
        this._render();
      });

      this.container.appendChild(el);
    }
  }

  _renderPreview(item) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Calculate cell size to fit within ~180px wide preview
    const maxW = 176;
    const maxH = 100;
    const baseCellW = 10;
    const baseCellH = 14;
    const scale = Math.min(1, maxW / (item.w * baseCellW), maxH / (item.h * baseCellH));
    const cellW = Math.max(2, Math.floor(baseCellW * scale));
    const cellH = Math.max(3, Math.floor(baseCellH * scale));

    canvas.width = item.w * cellW;
    canvas.height = item.h * cellH;

    const fontSize = Math.max(6, Math.floor(cellH * 0.85));
    ctx.font = `${fontSize}px ${this.fontFamily}`;
    ctx.textBaseline = 'top';

    for (let r = 0; r < item.h; r++) {
      for (let c = 0; c < item.w; c++) {
        const cell = item.cells[r][c];
        const x = c * cellW;
        const y = r * cellH;

        ctx.fillStyle = cell.bg;
        ctx.fillRect(x, y, cellW, cellH);

        if (cell.char && cell.char !== ' ') {
          ctx.fillStyle = cell.fg;
          ctx.fillText(cell.char, x, y);
        }
      }
    }

    return canvas;
  }
}
