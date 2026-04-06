// ─────────────────────────────────────────────
// ASCII Art Generator — converts raster images
// to ultra-high-density colored ASCII art using
// Unicode half-block characters (▀/▄).
//
// Each character cell encodes TWO vertical pixels:
//   foreground color = top pixel
//   background color = bottom pixel
// This doubles effective vertical resolution.
// ─────────────────────────────────────────────

const UPPER_HALF = '\u2580'; // ▀
const LOWER_HALF = '\u2584'; // ▄
const FULL_BLOCK = '\u2588'; // █
const ALPHA_THRESHOLD = 30;  // below this → treat as transparent

/**
 * Alpha-blend a pixel (r,g,b,a) over a solid background color.
 * Returns CSS hex string.
 */
function blendOver(r, g, b, a, bgR, bgG, bgB) {
  const alpha = a / 255;
  const inv = 1 - alpha;
  const oR = Math.round(r * alpha + bgR * inv);
  const oG = Math.round(g * alpha + bgG * inv);
  const oB = Math.round(b * alpha + bgB * inv);
  return '#' + ((1 << 24) | (oR << 16) | (oG << 8) | oB).toString(16).slice(1);
}

/**
 * Parse a CSS hex color (#rgb or #rrggbb) to [r, g, b].
 */
function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export class AsciiArtGenerator {
  constructor() {
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
    this._cache = new Map();
  }

  /**
   * Convert an Image to a grid of colored half-block cells.
   *
   * @param {Image|HTMLCanvasElement} img - Source raster image
   * @param {number} cols - Target width in character columns
   * @param {number} rows - Target height in character rows (each row = 2 vertical pixels)
   * @param {string} [bgColor='#000000'] - Background color for transparent regions
   * @returns {{ cols: number, rows: number, cells: {char:string, fg:string, bg:string}[][] }} or null
   */
  convert(img, cols, rows, bgColor = '#000000') {
    if (!img || cols <= 0 || rows <= 0) return null;

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;

    // Sample at cols × (rows*2) to get two vertical pixels per cell row
    const sampleW = cols;
    const sampleH = rows * 2;

    this._canvas.width = sampleW;
    this._canvas.height = sampleH;
    const ctx = this._ctx;
    ctx.clearRect(0, 0, sampleW, sampleH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(img, 0, 0, sampleW, sampleH);

    const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imageData.data;
    const [bgR, bgG, bgB] = parseHex(bgColor);

    const cells = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        // Top pixel
        const topIdx = ((r * 2) * sampleW + c) * 4;
        const tR = data[topIdx], tG = data[topIdx + 1], tB = data[topIdx + 2], tA = data[topIdx + 3];

        // Bottom pixel
        const botIdx = ((r * 2 + 1) * sampleW + c) * 4;
        const bR = data[botIdx], bG = data[botIdx + 1], bB = data[botIdx + 2], bA = data[botIdx + 3];

        const topTransparent = tA < ALPHA_THRESHOLD;
        const botTransparent = bA < ALPHA_THRESHOLD;

        let char, fg, bg;

        if (topTransparent && botTransparent) {
          // Both transparent — empty cell
          char = ' ';
          fg = bgColor;
          bg = bgColor;
        } else if (topTransparent) {
          // Only bottom visible — use lower half block with bottom color as fg
          char = LOWER_HALF;
          fg = blendOver(bR, bG, bB, bA, bgR, bgG, bgB);
          bg = bgColor;
        } else if (botTransparent) {
          // Only top visible — use upper half block with top color as fg
          char = UPPER_HALF;
          fg = blendOver(tR, tG, tB, tA, bgR, bgG, bgB);
          bg = bgColor;
        } else {
          // Both opaque — upper half block: fg = top color, bg = bottom color
          const topColor = blendOver(tR, tG, tB, tA, bgR, bgG, bgB);
          const botColor = blendOver(bR, bG, bB, bA, bgR, bgG, bgB);
          if (topColor === botColor) {
            char = FULL_BLOCK;
            fg = topColor;
            bg = topColor;
          } else {
            char = UPPER_HALF;
            fg = topColor;
            bg = botColor;
          }
        }

        row.push({ char, fg, bg });
      }
      cells.push(row);
    }

    return { cols, rows, cells };
  }

  /**
   * Cached conversion — returns the same grid for the same image + dimensions.
   */
  convertCached(img, cols, rows, bgColor = '#000000') {
    if (!img) return null;
    const key = (img.src || img._cacheKey || '') + '|' + cols + '|' + rows + '|' + bgColor;
    if (this._cache.has(key)) return this._cache.get(key);
    const result = this.convert(img, cols, rows, bgColor);
    if (result) this._cache.set(key, result);
    return result;
  }

  /**
   * Double-density conversion: each source pixel emits 2 adjacent character
   * columns. Combined with half-block vertical encoding (2 pixels per row),
   * this gives ~4x the character count and visually square pixels since
   * monospace cells are ~2.25x taller than wide.
   *
   * @param {Image|HTMLCanvasElement} img - Source raster image
   * @param {number} cols - Target width in character columns (must be even; each source pixel → 2 cols)
   * @param {number} rows - Target height in character rows (each row = 2 vertical pixels)
   * @param {string} [bgColor='#000000'] - Background color for transparent regions
   * @returns {{ cols: number, rows: number, cells: {char:string, fg:string, bg:string}[][] }} or null
   */
  convertDoubled(img, cols, rows, bgColor = '#000000') {
    if (!img || cols <= 0 || rows <= 0) return null;

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;

    // Sample at half the column count since each pixel becomes 2 chars
    const sampleW = Math.ceil(cols / 2);
    const sampleH = rows * 2;

    this._canvas.width = sampleW;
    this._canvas.height = sampleH;
    const ctx = this._ctx;
    ctx.clearRect(0, 0, sampleW, sampleH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(img, 0, 0, sampleW, sampleH);

    const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imageData.data;
    const [bgR, bgG, bgB] = parseHex(bgColor);

    const cells = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < sampleW; c++) {
        // Top pixel
        const topIdx = ((r * 2) * sampleW + c) * 4;
        const tR = data[topIdx], tG = data[topIdx + 1], tB = data[topIdx + 2], tA = data[topIdx + 3];

        // Bottom pixel
        const botIdx = ((r * 2 + 1) * sampleW + c) * 4;
        const bR = data[botIdx], bG = data[botIdx + 1], bB = data[botIdx + 2], bA = data[botIdx + 3];

        const topTransparent = tA < ALPHA_THRESHOLD;
        const botTransparent = bA < ALPHA_THRESHOLD;

        let char, fg, bg;

        if (topTransparent && botTransparent) {
          char = ' ';
          fg = bgColor;
          bg = bgColor;
        } else if (topTransparent) {
          char = LOWER_HALF;
          fg = blendOver(bR, bG, bB, bA, bgR, bgG, bgB);
          bg = bgColor;
        } else if (botTransparent) {
          char = UPPER_HALF;
          fg = blendOver(tR, tG, tB, tA, bgR, bgG, bgB);
          bg = bgColor;
        } else {
          const topColor = blendOver(tR, tG, tB, tA, bgR, bgG, bgB);
          const botColor = blendOver(bR, bG, bB, bA, bgR, bgG, bgB);
          if (topColor === botColor) {
            char = FULL_BLOCK;
            fg = topColor;
            bg = topColor;
          } else {
            char = UPPER_HALF;
            fg = topColor;
            bg = botColor;
          }
        }

        // Emit each pixel as 2 adjacent identical cells
        const cell = { char, fg, bg };
        row.push(cell);
        row.push({ char, fg, bg });
      }
      cells.push(row);
    }

    const outCols = sampleW * 2;
    return { cols: outCols, rows, cells };
  }

  /**
   * Cached double-density conversion.
   */
  convertDoubledCached(img, cols, rows, bgColor = '#000000') {
    if (!img) return null;
    const key = (img.src || img._cacheKey || '') + '|D|' + cols + '|' + rows + '|' + bgColor;
    if (this._cache.has(key)) return this._cache.get(key);
    const result = this.convertDoubled(img, cols, rows, bgColor);
    if (result) this._cache.set(key, result);
    return result;
  }

  /**
   * Create a brightened copy of an ASCII grid (for hit flash effect).
   * Blends all colors toward white by the given amount (0-1).
   */
  brighten(grid, amount = 0.5) {
    if (!grid) return null;
    const cells = [];
    for (let r = 0; r < grid.rows; r++) {
      const row = [];
      for (let c = 0; c < grid.cols; c++) {
        const cell = grid.cells[r][c];
        if (cell.char === ' ') {
          row.push(cell);
          continue;
        }
        row.push({
          char: cell.char,
          fg: this._brightenColor(cell.fg, amount),
          bg: cell.bg === cell.fg ? this._brightenColor(cell.bg, amount) : cell.bg,
        });
      }
      cells.push(row);
    }
    return { cols: grid.cols, rows: grid.rows, cells };
  }

  /**
   * Create a dissolving copy of an ASCII grid for death animation.
   * `progress` is 0..1 where 1 = fully dissolved.
   * Uses a seeded pattern so dissolution is deterministic per frame.
   */
  dissolve(grid, progress, bgColor = '#000000') {
    if (!grid) return null;
    const cells = [];
    const threshold = progress * progress; // ease-in curve for dramatic effect
    for (let r = 0; r < grid.rows; r++) {
      const row = [];
      for (let c = 0; c < grid.cols; c++) {
        const cell = grid.cells[r][c];
        // Deterministic pseudo-random per cell using golden ratio hash
        const hash = ((r * 137 + c * 251 + 7919) * 2654435761) >>> 0;
        const norm = hash / 0xFFFFFFFF;
        if (norm < threshold || cell.char === ' ') {
          row.push({ char: ' ', fg: bgColor, bg: bgColor });
        } else {
          row.push(cell);
        }
      }
      cells.push(row);
    }
    return { cols: grid.cols, rows: grid.rows, cells };
  }

  _brightenColor(hex, amount) {
    const [r, g, b] = parseHex(hex);
    const br = Math.min(255, Math.round(r + (255 - r) * amount));
    const bg = Math.min(255, Math.round(g + (255 - g) * amount));
    const bb = Math.min(255, Math.round(b + (255 - b) * amount));
    return '#' + ((1 << 24) | (br << 16) | (bg << 8) | bb).toString(16).slice(1);
  }

  clearCache() {
    this._cache.clear();
  }
}
