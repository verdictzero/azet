// ─────────────────────────────────────────────
// Cutscene Loader — loads .azcut frame sequence files
// Format: { version, meta, palette, frames[] }
// ─────────────────────────────────────────────

export class CutsceneLoader {
  /**
   * Load and decompress a .azcut cutscene file from a URL.
   * @param {string} url - Path to the .azcut JSON file
   * @returns {Promise<CutsceneData>} Ready-to-play cutscene data
   */
  static async load(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load cutscene: ${url} (${resp.status})`);
    const raw = await resp.json();
    return CutsceneLoader.decompress(raw);
  }

  /**
   * Decompress raw .azcut JSON into playback-ready frame data.
   * Expands palette indices to hex color strings so the player
   * doesn't need per-cell lookups during rendering.
   * @param {Object} raw - Raw .azcut JSON object
   * @returns {CutsceneData}
   */
  static decompress(raw) {
    if (!raw || raw.version !== 1) {
      throw new Error('Unsupported cutscene format version');
    }

    const { meta, palette, frames } = raw;
    const cellCount = meta.width * meta.height;

    const expanded = new Array(frames.length);
    for (let f = 0; f < frames.length; f++) {
      const frame = frames[f];
      const fgHex = new Array(cellCount);
      const bgHex = new Array(cellCount);

      for (let i = 0; i < cellCount; i++) {
        fgHex[i] = palette[frame.fg[i]] || '#ffffff';
        bgHex[i] = palette[frame.bg[i]] || '#000000';
      }

      expanded[f] = {
        chars: frame.chars,
        fg: fgHex,
        bg: bgHex,
      };
    }

    return {
      meta: { ...meta },
      frames: expanded,
    };
  }
}
