// ─────────────────────────────────────────────
// Animated crystal ASCII frames (50 x 34)
// Derived from rotating crystal sprite sheet.
// 16 keyframes for smooth looping rotation.
// Characters: █ ▓ ▒ ░ ▀ ▄ ▌ ▐ (block elements)
// ─────────────────────────────────────────────

export const CRYSTAL_WIDTH = 50;
export const CRYSTAL_HEIGHT = 34;

// Color palette keys (compact encoding)
const B = '#10106e';   // BLUE - darkest crystal
const b = '#4848d8';   // BRIGHT_BLUE - mid tone
const C = '#60d0e8';   // BRIGHT_CYAN - bright
const W = '#f8f0ff';   // BRIGHT_WHITE - highlight
const D = '#080840';   // very dark edge
const S = '#2828a0';   // steel mid-dark

function makeFrame(charRows, colorRows) {
  const chars = charRows.map(r => r.padEnd(CRYSTAL_WIDTH, ' '));
  const colors = colorRows.map((row, ri) => {
    const out = [];
    for (let c = 0; c < CRYSTAL_WIDTH; c++) {
      if (chars[ri][c] === ' ') { out.push(''); continue; }
      out.push(row[c] || B);
    }
    return out;
  });
  return { chars, colors };
}

// ── Frame generation ──
// The crystal is a diamond/octahedron shape rotating around its vertical axis.
// As it rotates, the lit face shifts from left to right and back.
// We model 16 frames: front-facing → right-turn → side → left-turn → back to front.

function generateFrames() {
  const frames = [];

  // We'll generate frames procedurally based on rotation angle
  for (let f = 0; f < 16; f++) {
    const angle = (f / 16) * Math.PI * 2;
    const charRows = [];
    const colorRows = [];

    // Crystal shape: diamond centered in 50x34 grid
    // Midpoint: col 25, row 17
    const midX = 25;
    const midY = 17;
    const halfH = 15; // half height in rows
    const maxHalfW = 12; // max half width at equator

    // Light direction based on rotation
    const lightX = Math.cos(angle);  // -1 to 1: left lit vs right lit
    const lightY = -0.3; // slightly from above

    for (let row = 0; row < CRYSTAL_HEIGHT; row++) {
      let charStr = '';
      const cRow = {};

      for (let col = 0; col < CRYSTAL_WIDTH; col++) {
        const dy = row - midY;
        const dx = col - midX;

        // Diamond shape test: |dy|/halfH + |dx|/halfW(at this y) <= 1
        // Width varies: widest at equator, zero at tips
        const yFrac = Math.abs(dy) / halfH;
        if (yFrac > 1) {
          charStr += ' ';
          continue;
        }

        // Width at this row
        const widthHere = maxHalfW * (1 - yFrac);
        if (widthHere < 0.5) {
          // At the very tips, only the center column is filled
          if (Math.abs(dx) < 1) { charStr += dy < 0 ? '▀' : '▄'; cRow[col] = D; } else { charStr += ' '; }
          continue;
        }

        // Horizontal fraction
        const xFrac = Math.abs(dx) / widthHere;

        if (xFrac > 1.05) {
          charStr += ' ';
          continue;
        }

        // We're inside or at edge of diamond
        // Compute surface normal approximation for lighting
        // Upper half: normal points up-outward; lower half: down-outward
        const ny = dy < 0 ? -0.7 : 0.7;
        const nx = dx / (widthHere + 0.01);

        // Facet effect: crystal has angular facets
        // Create 4 major facets based on quadrant
        const facetAngle = Math.atan2(ny, nx * Math.cos(angle));
        const facetShift = Math.sin(facetAngle * 3 + angle * 2) * 0.3;

        // Lighting intensity
        let intensity = (nx * lightX + ny * lightY) * 0.5 + 0.5 + facetShift;

        // Edge darkening
        if (xFrac > 0.9) {
          intensity *= (1.05 - xFrac) / 0.15;
        }

        // Specular highlight at the reflection angle
        const reflX = 2 * nx * (nx * lightX + ny * lightY) - lightX;
        const specular = Math.max(0, reflX) ** 8 * 0.5;
        intensity += specular;

        // Vertical gradient: brighter near equator
        intensity *= 0.7 + 0.3 * (1 - yFrac);

        // Rotating highlight band
        const bandPhase = dx * Math.cos(angle) * 0.15;
        const band = Math.exp(-bandPhase * bandPhase) * 0.2;
        intensity += band;

        intensity = Math.max(0, Math.min(1, intensity));

        // Map to character and color
        let ch, color;

        // Edge cells get half-block treatment
        if (xFrac > 0.85 && xFrac <= 1.05) {
          // Silhouette edge
          if (dx > 0) {
            ch = '▐';
          } else {
            ch = '▌';
          }
          color = D;
        } else if (yFrac > 0.85 && Math.abs(dy) === Math.round(halfH * yFrac)) {
          // Top/bottom edge
          ch = dy < 0 ? '▀' : '▄';
          color = intensity > 0.5 ? b : D;
        } else {
          // Interior
          if (intensity > 0.85) {
            ch = '█'; color = W;
          } else if (intensity > 0.65) {
            ch = '█'; color = C;
          } else if (intensity > 0.5) {
            ch = '▓'; color = b;
          } else if (intensity > 0.35) {
            ch = '▒'; color = b;
          } else if (intensity > 0.2) {
            ch = '░'; color = S;
          } else {
            ch = '░'; color = D;
          }
        }

        charStr += ch;
        cRow[col] = color;
      }

      charRows.push(charStr);
      colorRows.push(cRow);
    }

    frames.push(makeFrame(charRows, colorRows));
  }

  return frames;
}

export const CRYSTAL_FRAMES = generateFrames();
