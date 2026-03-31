// ─────────────────────────────────────────────
// ASCII Cutscene Player — Hi-Res fullscreen ASCII animations
// Double-character density: each logical pixel = 2 adjacent chars
// ─────────────────────────────────────────────

export class AsciiCutscenePlayer {
  constructor() {
    this.active = false;
    this.mode = null;
    this.startTime = 0;
    // Matrix rain state
    this._drops = null;
  }

  start(name) {
    this.active = true;
    this.mode = name;
    this.startTime = performance.now();
    this._drops = null;
  }

  stop() {
    this.active = false;
    this.mode = null;
    this._drops = null;
  }

  update(timestamp) {
    // State updates happen inline in render for these procedural demos
  }

  render(renderer) {
    if (!this.active) return;
    const t = (performance.now() - this.startTime) / 1000; // seconds elapsed
    switch (this.mode) {
      case 'plasma': this._renderPlasma(renderer, t); break;
      case 'matrix': this._renderMatrix(renderer, t); break;
      case 'noise':  this._renderNoise(renderer, t); break;
    }
    // Draw exit hint
    const hint = ' [ESC] Exit ';
    renderer.drawString(renderer.cols - hint.length - 1, renderer.rows - 1, hint, '#586078', '#000000');
  }

  // ─── Plasma Demo ───────────────────────────────────
  _renderPlasma(r, t) {
    const cols = r.cols;
    const rows = r.rows;
    const pw = Math.floor(cols / 2); // logical pixel width (double density)
    const ph = rows;

    const BLOCK = '\u2588\u2588'; // ██
    const CHARS = ['\u2591\u2591', '\u2592\u2592', '\u2593\u2593', '\u2588\u2588']; // ░░ ▒▒ ▓▓ ██

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const x = px / pw;
        const y = py / ph;

        // Classic plasma: sum of several sine waves
        let v = 0;
        v += Math.sin(x * 10 + t * 1.3);
        v += Math.sin(y * 8 + t * 0.7);
        v += Math.sin((x + y) * 6 + t * 1.1);
        v += Math.sin(Math.sqrt((x - 0.5) * (x - 0.5) * 100 + (y - 0.5) * (y - 0.5) * 64) + t * 0.9);
        v += Math.sin(x * 14 - t * 0.5) * 0.5;
        v += Math.sin(y * 12 + t * 1.5) * 0.5;
        v = (v + 5) / 10; // normalize to ~0..1

        // Character based on intensity
        const ci = Math.min(3, Math.floor(v * 4));
        const ch = CHARS[ci];

        // HSL color — hue cycles with value + time
        const hue = ((v * 360) + t * 40) % 360;
        const sat = 80 + v * 20;
        const lit = 25 + v * 45;
        const color = _hsl(hue, sat, lit);

        r.drawString(px * 2, py, ch, color, '#000000');
      }
    }

    // Title overlay
    const title = ' \u2588 PLASMA DEMO \u2588 ';
    const tx = Math.floor((cols - title.length) / 2);
    r.drawString(tx, 1, title, '#f8f0ff', '#10106e');
  }

  // ─── Matrix Rain ───────────────────────────────────
  _renderMatrix(r, t) {
    const cols = r.cols;
    const rows = r.rows;
    const pw = Math.floor(cols / 2);

    // Initialize drops
    if (!this._drops) {
      this._drops = [];
      for (let x = 0; x < pw; x++) {
        this._drops.push({
          y: Math.random() * rows * 2 - rows,
          speed: 0.3 + Math.random() * 0.7,
          len: 5 + Math.floor(Math.random() * 20),
          chars: _randomMatrixChars(30),
          phase: Math.random() * 1000,
        });
      }
    }

    // Clear to black
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < pw; x++) {
        r.drawString(x * 2, y, '  ', '#000000', '#000000');
      }
    }

    // Advance and render drops
    for (let x = 0; x < pw; x++) {
      const drop = this._drops[x];
      drop.y += drop.speed;

      // Reset if fully off screen
      if (drop.y - drop.len > rows) {
        drop.y = -Math.floor(Math.random() * 10);
        drop.speed = 0.3 + Math.random() * 0.7;
        drop.len = 5 + Math.floor(Math.random() * 20);
        drop.chars = _randomMatrixChars(30);
      }

      const headY = Math.floor(drop.y);

      for (let i = 0; i < drop.len; i++) {
        const cy = headY - i;
        if (cy < 0 || cy >= rows) continue;

        // Character — cycle through the random set
        const charIdx = (i + Math.floor(t * 8 + drop.phase)) % drop.chars.length;
        const ch = drop.chars[charIdx] + drop.chars[(charIdx + 7) % drop.chars.length];

        if (i === 0) {
          // Head: bright white
          r.drawString(x * 2, cy, ch, '#f8f0ff', '#000000');
        } else if (i === 1) {
          r.drawString(x * 2, cy, ch, '#80ff80', '#000000');
        } else {
          // Trail: fade green to dark
          const fade = 1 - (i / drop.len);
          const g = Math.floor(40 + fade * 180);
          const rb = Math.floor(fade * 20);
          const color = `rgb(${rb},${g},${rb})`;
          r.drawString(x * 2, cy, ch, color, '#000000');
        }
      }
    }

    // Title overlay
    const title = ' \u2588 MATRIX RAIN \u2588 ';
    const tx = Math.floor((cols - title.length) / 2);
    r.drawString(tx, 1, title, '#40d870', '#000000');
  }

  // ─── Noise Storm ───────────────────────────────────
  _renderNoise(r, t) {
    const cols = r.cols;
    const rows = r.rows;
    const pw = Math.floor(cols / 2);
    const ph = rows;

    // Simple value noise using sin-based pseudo-noise
    // (avoids needing Perlin import — looks great for a storm demo)
    const CHARS = '  \u2591\u2591\u2592\u2592\u2593\u2593\u2588\u2588'; // pairs: "  ░░▒▒▓▓██"
    const STORM_COLORS = [
      '#000000', '#080820', '#101040', '#182060',
      '#2040a0', '#3060d0', '#60a0e0', '#a0d0f8',
      '#f0f0ff', '#ffffffff',
    ];

    // Lightning flash
    const lightning = Math.sin(t * 47.3) > 0.97;
    const flashColor = lightning ? '#e0e8ff' : null;

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const x = px * 0.08;
        const y = py * 0.12;

        // Multi-octave sin noise
        let n = 0;
        n += Math.sin(x * 3.7 + y * 2.3 + t * 1.1) * 0.5;
        n += Math.sin(x * 7.1 - y * 5.3 + t * 2.3) * 0.25;
        n += Math.sin(x * 13.7 + y * 11.1 - t * 3.7) * 0.125;
        n += Math.sin((x + y) * 5 + t * 0.7) * 0.3;
        // Swirling vortex
        const cx = px / pw - 0.5, cy = py / ph - 0.5;
        const dist = Math.sqrt(cx * cx + cy * cy);
        const angle = Math.atan2(cy, cx);
        n += Math.sin(angle * 3 + dist * 10 - t * 2) * 0.3;
        n += Math.sin(dist * 20 - t * 4) * 0.15;

        n = (n + 1.5) / 3; // normalize ~0..1
        n = Math.max(0, Math.min(1, n));

        // Character
        const ci = Math.floor(n * 4);
        const ch = CHARS.substring(ci * 2, ci * 2 + 2) || '\u2588\u2588';

        // Color
        let color;
        if (flashColor && lightning) {
          // Lightning: bright flash mixed in
          const fl = Math.random() > 0.3 ? flashColor : STORM_COLORS[Math.min(9, Math.floor(n * 10))];
          color = fl;
        } else {
          color = STORM_COLORS[Math.min(9, Math.floor(n * 10))];
        }

        const bg = lightning && Math.random() > 0.7 ? '#101030' : '#000000';
        r.drawString(px * 2, py, ch, color, bg);
      }
    }

    // Occasional lightning bolt — draw a jagged vertical line
    if (lightning) {
      let boltX = Math.floor(pw * (0.3 + Math.sin(t * 13) * 0.4));
      for (let by = 2; by < Math.floor(ph * 0.7); by++) {
        boltX += Math.floor(Math.random() * 3) - 1;
        boltX = Math.max(0, Math.min(pw - 1, boltX));
        r.drawString(boltX * 2, by, '\u2588\u2588', '#f8f0ff', '#8080ff');
      }
    }

    // Title overlay
    const title = ' \u2588 NOISE STORM \u2588 ';
    const tx = Math.floor((cols - title.length) / 2);
    r.drawString(tx, 1, title, '#60d0e8', '#101040');
  }
}

// ─── Helpers ─────────────────────────────────────────

function _hsl(h, s, l) {
  // Convert HSL to hex color string
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function _randomMatrixChars(count) {
  // Mix of half-width katakana-like chars and ASCII symbols
  const pool = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789@#$%&*+=<>~';
  const chars = [];
  for (let i = 0; i < count; i++) {
    chars.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return chars;
}
