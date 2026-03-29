// json-preview.js — Live JSON preview panel with syntax highlighting

export class JsonPreview {
  constructor(container) {
    this.container = container;
    this.data = null;
    this.filter = null;
    this._debounceTimer = null;

    // Build DOM structure
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'json-preview-toolbar';

    this.copyBtn = document.createElement('button');
    this.copyBtn.className = 'json-preview-copy-btn';
    this.copyBtn.textContent = 'Copy';
    this.copyBtn.addEventListener('click', () => this.copyToClipboard());
    this.toolbar.appendChild(this.copyBtn);

    this.pre = document.createElement('pre');
    this.pre.className = 'json-preview-block';
    this.code = document.createElement('code');
    this.pre.appendChild(this.code);

    this.container.classList.add('json-preview');
    this.container.appendChild(this.toolbar);
    this.container.appendChild(this.pre);
  }

  /**
   * Update the preview with new data. Debounced at 300ms to avoid
   * excessive re-renders on rapid state changes (e.g. typing).
   * @param {*} data - Any JS object to display as JSON
   */
  update(data) {
    this.data = data;
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._render(), 300);
  }

  /**
   * Filter the preview to show only one collection key, or null for all.
   * @param {string|null} collection - e.g. 'npcs', 'items', or null
   */
  setFilter(collection) {
    this.filter = collection;
    // Re-render immediately when filter changes (intentional, not debounced)
    this._render();
  }

  /**
   * Copy the currently displayed JSON text to the clipboard.
   */
  copyToClipboard() {
    const text = this._getDisplayText();
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      const prev = this.copyBtn.textContent;
      this.copyBtn.textContent = 'Copied!';
      setTimeout(() => { this.copyBtn.textContent = prev; }, 1500);
    }).catch(() => {
      // Fallback for older browsers / insecure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);

      const prev = this.copyBtn.textContent;
      this.copyBtn.textContent = 'Copied!';
      setTimeout(() => { this.copyBtn.textContent = prev; }, 1500);
    });
  }

  // ── Internal ──────────────────────────────────────────────

  /**
   * Return the data to display, respecting the current filter.
   */
  _getFilteredData() {
    if (!this.data) return null;
    if (this.filter && typeof this.data === 'object' && this.data !== null) {
      return this.data[this.filter] !== undefined
        ? { [this.filter]: this.data[this.filter] }
        : null;
    }
    return this.data;
  }

  /**
   * Return the plain-text JSON string for the currently filtered data.
   */
  _getDisplayText() {
    const filtered = this._getFilteredData();
    if (filtered == null) return '';
    return JSON.stringify(filtered, null, 2);
  }

  /**
   * Render the syntax-highlighted JSON into the <code> element.
   */
  _render() {
    const filtered = this._getFilteredData();

    if (filtered == null) {
      this.code.textContent = this.filter
        ? `No data for "${this.filter}"`
        : 'No data';
      return;
    }

    const raw = JSON.stringify(filtered, null, 2);
    this.code.innerHTML = this._highlight(raw);
  }

  /**
   * Apply syntax highlighting to a JSON string by wrapping tokens in
   * <span> elements with the appropriate CSS class.
   *
   * Classes used:
   *   .json-key      — object keys
   *   .json-string   — string values
   *   .json-number   — numeric values
   *   .json-boolean  — true / false
   *   .json-null     — null
   *
   * @param {string} json - Pretty-printed JSON string
   * @returns {string} HTML with highlighting spans
   */
  _highlight(json) {
    // Escape HTML entities first
    const escaped = json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Tokenize and wrap with spans.
    // The regex matches JSON tokens in order of priority:
    //   1. Quoted strings (keys or values)
    //   2. Numbers
    //   3. Booleans
    //   4. null
    return escaped.replace(
      /("(?:\\.|[^"\\])*")\s*:/g,    // pass 1: keys
      '<span class="json-key">$1</span>:'
    ).replace(
      /:\s*("(?:\\.|[^"\\])*")/g,    // pass 2: string values (after colon)
      ': <span class="json-string">$1</span>'
    ).replace(
      // String values inside arrays (preceded by [ or , with optional whitespace)
      /([\[,]\s*)("(?:\\.|[^"\\])*")/g,
      '$1<span class="json-string">$2</span>'
    ).replace(
      /\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g,
      '<span class="json-number">$1</span>'
    ).replace(
      /\b(true|false)\b/g,
      '<span class="json-boolean">$1</span>'
    ).replace(
      /\bnull\b/g,
      '<span class="json-null">null</span>'
    );
  }
}
