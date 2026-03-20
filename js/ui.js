import { COLORS, LAYOUT, wordWrap } from './engine.js';
import { CRYSTAL_WIDTH, CRYSTAL_HEIGHT, CRYSTAL_FRAMES } from './crystal-frames.js';
import { expandTile } from './tileExpansion.js';

// ─── Color conversion helpers for hue-shifting effects ───
function hexToHsl(hex) {
  const val = parseInt(hex.slice(1), 16);
  const r = ((val >> 16) & 0xff) / 255;
  const g = ((val >> 8) & 0xff) / 255;
  const b = (val & 0xff) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  h = ((h % 1) + 1) % 1; // normalize
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = v => {
    const hex = Math.round(v * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function shiftHue(hex, amount) {
  if (!hex || hex === '') return hex;
  const hsl = hexToHsl(hex);
  return hslToHex(hsl.h + amount, hsl.s, hsl.l);
}

// ─── FF-style Unicode Icon Constants ───
const ICONS = {
  hp: '\u2665',         // ♥
  mp: '\u2726',         // ✦
  level: '\u2605',      // ★
  gold: '\u00A7',       // § Shard currency symbol
  sword: '\u2694',      // ⚔
  shield: '\u26E8',     // ⛨
  skull: '\u2620',      // ☠
  check: '\u2713',      // ✓
  cross: '\u2717',      // ✗
  diamond: '\u25C6',    // ◆
  circle: '\u25CF',     // ●
  cursor: '\u25BA',     // ► FF hand cursor
  uncursor: ' ',        // empty space for unselected
  selected: '\u25BA',   // ► FF-style pointer
  unselected: ' ',      //   blank for unselected
};

export class UIManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.activePanel = null;
    this.messageLog = [];
    this.maxMessages = 500;
    this.visibleMessages = 5;
    this.messageScroll = 0;
    this.dialogueState = null;
    this.versionString = '';
    this.shopState = null;
    this.menuState = null;
    this.selectedIndex = 0;
    this.confirmCallback = null;
    this.confirmMessage = null;

    // Debug menu state
    this.debugTab = 0;        // 0=cheats, 1=world, 2=visual, 3=info
    this.debugScroll = 0;
    this.debugCursor = 0;

    // Console log viewer state
    this.consoleLogScroll = 0;

    // Almanac state
    this.almanacTab = 0;    // 0-5: Preamble, Timeline, Civs, Figures, Artifacts, Log
    this.almanacScroll = 0;
  }

  addMessage(text, color = COLORS.WHITE) {
    this.messageLog.unshift({ text, color, turn: Date.now() });
    if (this.messageLog.length > this.maxMessages) this.messageLog.pop();
    this.messageScroll = 0;
  }

  // ─── HUD (FF-style) ───

  drawHUD(player, timeSystem, gameState, statusEffects = [], weatherSystem = null) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bc = COLORS.FF_BORDER;
    const bg = COLORS.FF_BLUE_DARK;

    // ── Outer frame (FF rounded corners) ──
    r.drawChar(0, 0, '\u256D', bc, bg);                    // ╭
    r.drawChar(cols - 1, 0, '\u256E', bc, bg);              // ╮
    for (let x = 1; x < cols - 1; x++) r.drawChar(x, 0, '\u2500', bc, bg); // ─
    r.drawChar(0, rows - 1, '\u2570', bc, bg);              // ╰
    r.drawChar(cols - 1, rows - 1, '\u256F', bc, bg);       // ╯
    for (let x = 1; x < cols - 1; x++) r.drawChar(x, rows - 1, '\u2500', bc, bg);
    for (let y = 1; y < rows - 1; y++) {
      r.drawChar(0, y, '\u2502', bc, bg);                   // │
      r.drawChar(cols - 1, y, '\u2502', bc, bg);
    }

    // ── Top info bar (row 1, inside border) ──
    const topY = 1;
    r.fillRect(1, topY, cols - 2, 1, ' ', COLORS.BRIGHT_WHITE, bg);

    // Clock + solar/lunar cycle (draw first to calculate reserved space)
    let rightReserved = 0;
    if (timeSystem) {
      const h = timeSystem.hour;
      const hh = String(Math.floor(h)).padStart(2, '0');
      const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
      const clock = `Day${timeSystem.day} ${hh}:${mm}`;
      const lunarPhase = (timeSystem.day % 30) / 30;
      const lunarChars = ['O', ')', 'D', '(', 'O', ')', 'D', '('];
      const moonChar = lunarChars[Math.floor(lunarPhase * 8) % 8];

      const rightStr = `${moonChar} ${clock}`;
      rightReserved = rightStr.length + 3;
      const rightX = cols - rightStr.length - 2;
      r.drawString(rightX, topY, rightStr,
        h >= 20 || h < 5 ? COLORS.BRIGHT_CYAN : COLORS.BRIGHT_YELLOW, bg);
    }

    // Location name — truncate to avoid overlapping clock
    const loc = gameState.currentLocationName || 'Uncharted Wilds';
    const locMaxW = cols - 4 - rightReserved;
    r.drawString(2, topY, loc, COLORS.BRIGHT_WHITE, bg, Math.max(0, locMaxW));

    // Weather indicator — only if it fits
    if (weatherSystem && weatherSystem.current !== 'clear') {
      const weatherIcons = { rain: '~', snow: '*', storm: '!', fog: '=', sandstorm: '=', cloudy: '-', acid_rain: '~', coolant_mist: '.', spore_fall: '*', ember_rain: ',', data_storm: '#', nano_haze: '.', ion_storm: '/', blood_rain: '~' };
      const wIcon = weatherIcons[weatherSystem.current] || '';
      const wPos = Math.min(loc.length, locMaxW) + 4;
      if (wPos < cols - rightReserved - 2) {
        r.drawString(wPos, topY, wIcon, COLORS.BRIGHT_CYAN, bg);
      }
    }

    // ── Separator after top bar ──
    r.drawSeparator(0, LAYOUT.VIEWPORT_TOP - 1, cols, bc, bg);

    // ── Separator before stats bar ──
    const statsY = rows - LAYOUT.HUD_BOTTOM;
    r.drawSeparator(0, statsY, cols, bc, bg);

    // ── Stats bar (FF-style compact status) ──
    const statRow = statsY + 1;
    r.fillRect(1, statRow, cols - 2, 1, ' ', COLORS.BRIGHT_WHITE, bg);

    const hp = `HP ${player.stats.hp}/${player.stats.maxHp}`;
    const mp = `MP ${player.stats.mana}/${player.stats.maxMana}`;
    const lv = `Lv ${player.stats.level}`;
    const gold = `${player.gold} Shards`;

    // HP with color-coded bar
    const hpColor = player.stats.hp < player.stats.maxHp * 0.25 ? COLORS.BRIGHT_RED :
                    player.stats.hp < player.stats.maxHp * 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.BRIGHT_WHITE;
    r.drawString(2, statRow, hp, hpColor, bg);
    let sx = hp.length + 3;

    // HP gauge
    const gaugeW = Math.min(12, Math.floor((cols - 40) / 3));
    if (gaugeW > 3) {
      const hpFrac = player.stats.hp / player.stats.maxHp;
      const filled = Math.round(hpFrac * gaugeW);
      for (let i = 0; i < gaugeW; i++) {
        const gChar = i < filled ? '\u2588' : '\u2591'; // █ or ░
        const gColor = hpFrac < 0.25 ? COLORS.BRIGHT_RED :
                       hpFrac < 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.BRIGHT_GREEN;
        r.drawChar(sx + i, statRow, gChar, gColor, bg);
      }
      sx += gaugeW + 1;
    }

    const statLimit = cols - 2;
    if (sx + mp.length < statLimit) {
      r.drawString(sx, statRow, mp, COLORS.BRIGHT_CYAN, bg, statLimit - sx);
      sx += mp.length + 2;
    }
    if (sx + lv.length < statLimit) {
      r.drawString(sx, statRow, lv, COLORS.BRIGHT_YELLOW, bg, statLimit - sx);
      sx += lv.length + 2;
    }
    if (sx + gold.length < statLimit) {
      r.drawString(sx, statRow, gold, COLORS.BRIGHT_YELLOW, bg, statLimit - sx);
      sx += gold.length + 2;
    }

    // Status effects (FF-style abbreviated)
    if (statusEffects && statusEffects.length > 0) {
      for (const effect of statusEffects) {
        const effectColors = {
          poisoned: COLORS.BRIGHT_GREEN, weakened: COLORS.BRIGHT_YELLOW, exposed: COLORS.BRIGHT_RED,
          rooted: COLORS.BRIGHT_GREEN, shielded: COLORS.BRIGHT_CYAN,
        };
        const color = effectColors[effect.name] || COLORS.BRIGHT_BLACK;
        const abbrev = effect.name.substring(0, 3).toUpperCase();
        const tag = `${abbrev}${effect.duration}`;
        if (sx + tag.length < statLimit) {
          r.drawString(sx, statRow, tag, color, bg);
          sx += tag.length + 1;
        }
      }
    }

    // ── Separator between stats and message log ──
    r.drawSeparator(0, statRow + 1, cols, bc, bg);

    // ── Message log ──
    this.drawMessageLog(rows);
  }

  // ─── QUEST NAV INDICATOR (compact HUD compass) ───

  drawQuestNavIndicator(questTitle, playerPos, targetPos, time) {
    if (!targetPos) return;
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;

    const dx = targetPos.x - playerPos.x;
    const dy = targetPos.y - playerPos.y;
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    const angle = Math.atan2(dy, dx);

    // Direction arrow based on angle
    const arrows = ['\u2192', '\u2198', '\u2193', '\u2199', '\u2190', '\u2196', '\u2191', '\u2197']; // →↘↓↙←↖↑↗
    const idx = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 8) % 8;
    const arrow = arrows[idx];
    const dirNames = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    const dir = dirNames[idx];

    // Truncate quest title to fit
    const maxTitleLen = Math.min(20, cols - 30);
    const title = questTitle.length > maxTitleLen ? questTitle.substring(0, maxTitleLen - 1) + '\u2026' : questTitle;

    // Draw on the separator row just above the message log
    const indicatorY = rows - LAYOUT.HUD_BOTTOM + 2;
    const pulse = Math.sin(time / 350) * 0.5 + 0.5;
    const arrowColor = pulse > 0.5 ? COLORS.BRIGHT_CYAN : COLORS.CYAN;

    const label = `\u25CE ${title} ${arrow} ${dir} ${dist}t`;
    const startX = Math.floor((cols - label.length) / 2);
    if (startX < 1) return;

    // Draw indicator centered below the stats bar
    r.drawChar(startX, indicatorY, '\u25CE', COLORS.BRIGHT_CYAN, bg);
    r.drawString(startX + 2, indicatorY, title, COLORS.WHITE, bg, maxTitleLen);
    const arrowX = startX + 2 + title.length + 1;
    r.drawChar(arrowX, indicatorY, arrow, arrowColor, bg);
    r.drawString(arrowX + 2, indicatorY, `${dir} ${dist}t`, COLORS.BRIGHT_YELLOW, bg);
  }

  /**
   * Draw a minimap in the top-right corner during sealed zone exploration.
   */
  drawMinimap(renderer, dungeon, player, enemies = []) {
    if (!dungeon || !dungeon.tiles) return;

    const r = renderer;
    const mapW = 14;
    const mapH = 10;
    const startX = r.cols - mapW - 3;
    const startY = LAYOUT.VIEWPORT_TOP;

    r.drawBox(startX, startY, mapW + 2, mapH + 2, COLORS.FF_BORDER, COLORS.FF_BLUE_DARK, ' Map ');

    const scaleX = dungeon.tiles[0].length / mapW;
    const scaleY = dungeon.tiles.length / mapH;

    for (let my = 0; my < mapH; my++) {
      for (let mx = 0; mx < mapW; mx++) {
        const wx = Math.floor(mx * scaleX);
        const wy = Math.floor(my * scaleY);
        if (wy < dungeon.tiles.length && wx < dungeon.tiles[0].length) {
          const tile = dungeon.tiles[wy][wx];
          if (tile.walkable) {
            r.drawChar(startX + 1 + mx, startY + 1 + my, '.', COLORS.BRIGHT_BLACK);
          } else if (tile.type === 'WALL') {
            r.drawChar(startX + 1 + mx, startY + 1 + my, '#', COLORS.WHITE);
          }
        }
      }
    }

    // Draw enemies on minimap
    for (const enemy of enemies) {
      const mx = Math.floor(enemy.position.x / scaleX);
      const my = Math.floor(enemy.position.y / scaleY);
      if (mx >= 0 && mx < mapW && my >= 0 && my < mapH) {
        r.drawChar(startX + 1 + mx, startY + 1 + my, '!', COLORS.BRIGHT_RED);
      }
    }

    // Draw player
    const pmx = Math.floor(player.position.x / scaleX);
    const pmy = Math.floor(player.position.y / scaleY);
    if (pmx >= 0 && pmx < mapW && pmy >= 0 && pmy < mapH) {
      r.drawChar(startX + 1 + pmx, startY + 1 + pmy, '@', COLORS.BRIGHT_YELLOW);
    }
  }

  drawMessageLog(rows) {
    const r = this.renderer;
    const cols = r.cols;
    const bg = COLORS.FF_BLUE_DARK;
    const logH = LAYOUT.MSG_LOG;
    const logY = rows - LAYOUT.MSG_LOG - LAYOUT.BOTTOM_BORDER;
    const maxWidth = cols - 4;

    r.fillRect(1, logY, cols - 2, logH, ' ', COLORS.BRIGHT_WHITE, bg);

    let lineY = logY;
    const start = this.messageScroll;
    for (let i = start; i < this.messageLog.length; i++) {
      if (lineY >= logY + logH) break;
      const msg = this.messageLog[i];
      const wrapped = wordWrap(msg.text, maxWidth);
      const color = i === 0 ? msg.color : (i < 3 ? msg.color : COLORS.BRIGHT_BLACK);
      for (const line of wrapped) {
        if (lineY >= logY + logH) break;
        r.drawString(2, lineY, line, color, bg);
        lineY++;
      }
    }
  }

  // ─── MAIN MENU (FF-style) ───

  drawMainMenu(cols, rows) {
    const r = this.renderer;
    r.clear();

    const t = Date.now() / 1000;

    // ── Layer 0: Animated Voronoi cellular automata background ──
    const numSeeds = 10;
    const bgChars = [' ', '.', '·', ':', '∙', '░', '▒'];
    // Brighter base colors with inverse hue shift (different rate from crystal)
    const voronoiHueShift = t * (-13 / 360); // inverse direction, ~28s full cycle
    const bgColorsBase = ['#2a2a30', '#303038', '#383840', '#2a3038', '#403040', '#302a34'];
    const bgColors = bgColorsBase.map(c => shiftHue(c, voronoiHueShift));
    const bgBg = shiftHue('#0c0c10', voronoiHueShift);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let minDist = Infinity;
        let secondDist = Infinity;
        for (let s = 0; s < numSeeds; s++) {
          const sx = (cols / 2) + Math.sin(t * 0.3 + s * 2.09) * (cols * 0.4) + Math.sin(t * 0.17 + s * 1.3) * (cols * 0.15);
          const sy = (rows / 2) + Math.cos(t * 0.25 + s * 1.88) * (rows * 0.4) + Math.cos(t * 0.13 + s * 0.9) * (rows * 0.15);
          const dx = col - sx;
          const dy = (row - sy) * 2;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < minDist) { secondDist = minDist; minDist = d; }
          else if (d < secondDist) { secondDist = d; }
        }
        const edge = secondDist - minDist;
        const pulse = Math.sin(minDist * 0.15 - t * 1.2) * 0.5 + 0.5;
        const edgePulse = Math.sin(edge * 0.5 - t * 0.8) * 0.5 + 0.5;
        const val = pulse * 0.6 + edgePulse * 0.4;
        const ci = Math.min(Math.floor(val * bgChars.length), bgChars.length - 1);
        const fi = Math.min(Math.floor((val * 0.7 + edge * 0.02) * bgColors.length), bgColors.length - 1);
        r.drawChar(col, row, bgChars[ci], bgColors[fi], bgBg);
      }
    }

    const title = [
      ' ██████  ███████  █████ ██ ██  █████  ██  ██ ██████ ███████ ██████',
      '██   ██ ██      ██     ██ ██ ██   ██ ██  ██ ██     ██         ██',
      '███████  █████  ██     ██ ██ ██   ██ ██  ██ ████    █████     ██',
      '██   ██      ██ ██     ██ ██ ██  ██  ██  ██ ██         ██    ██',
      '██   ██ ███████  █████ ██ ██  ████    ████  ██████ ███████   ██',
    ];

    const titleWidth = 65;
    const startY = Math.max(2, Math.floor(rows / 2) - 10);
    const compact = cols < titleWidth + 6;

    const artStartX = Math.floor((cols - titleWidth) / 2);
    const artStartY = startY;
    const waveColors = [COLORS.BLUE, COLORS.BRIGHT_BLUE, COLORS.BRIGHT_CYAN, COLORS.BRIGHT_WHITE, COLORS.BRIGHT_CYAN, COLORS.BRIGHT_BLUE];

    // ── Layer 0.5: Animated spinning crystal behind title card ──
    if (!compact && CRYSTAL_FRAMES.length > 0) {
      const frameIndex = Math.floor(t / 0.12) % CRYSTAL_FRAMES.length;
      const frame = CRYSTAL_FRAMES[frameIndex];
      const cx = Math.floor((cols - CRYSTAL_WIDTH) / 2);
      const cy = startY + Math.floor(title.length / 2) - Math.floor(CRYSTAL_HEIGHT / 2);
      for (let row = 0; row < CRYSTAL_HEIGHT; row++) {
        const y = cy + row;
        if (y < 0 || y >= rows) continue;
        for (let col = 0; col < CRYSTAL_WIDTH; col++) {
          const x = cx + col;
          if (x < 0 || x >= cols) continue;
          const ch = frame.chars[row][col];
          if (ch === ' ') continue;
          const crystalHueShift = t * (20 / 360); // slow rainbow: full cycle ~18s
          r.drawChar(x, y, ch, shiftHue(frame.colors[row][col], crystalHueShift), '#020204');
        }
      }
    }

    // ── Layer 1: Title block with animated gold sheen border on black bg ──
    if (!compact) {
      const boxW = titleWidth + 4;
      const boxH = title.length + 2;
      const boxX = artStartX - 2;
      const boxY = artStartY - 1;

      // Animated gold sheen border
      const perim = 2 * (boxW - 1) + 2 * (boxH - 1); // total perimeter length
      const sheenPos = ((t * 1.2) % 1.0 + 1.0) % 1.0; // sheen position 0-1 traveling around
      const sheenWidth = 0.08;
      const goldSheen = (frac) => {
        // Distance along perimeter (wrapping)
        let dist = Math.abs(frac - sheenPos);
        if (dist > 0.5) dist = 1.0 - dist;
        const brightness = Math.exp(-(dist * dist) / (sheenWidth * sheenWidth));
        const r = Math.floor(160 + brightness * 95);   // 160-255
        const g = Math.floor(120 + brightness * 115);  // 120-235
        const b = Math.floor(30 + brightness * 100);   // 30-130
        return `rgb(${r},${g},${b})`;
      };
      const perimFrac = (idx) => idx / perim; // convert perimeter index to 0-1

      // Fill interior with black
      r.fillRect(boxX, boxY, boxW, boxH, ' ', COLORS.WHITE, COLORS.BLACK);

      // Draw double-line border with gold sheen
      // Top edge: left to right (perimeter indices 0 to boxW-1)
      r.drawChar(boxX, boxY, '\u2554', goldSheen(perimFrac(0)), COLORS.BLACK);
      for (let x = 1; x < boxW - 1; x++) {
        r.drawChar(boxX + x, boxY, '\u2550', goldSheen(perimFrac(x)), COLORS.BLACK);
      }
      r.drawChar(boxX + boxW - 1, boxY, '\u2557', goldSheen(perimFrac(boxW - 1)), COLORS.BLACK);
      // Right edge: top to bottom (perimeter indices boxW-1 to boxW-1+boxH-1)
      for (let y = 1; y < boxH - 1; y++) {
        r.drawChar(boxX + boxW - 1, boxY + y, '\u2551', goldSheen(perimFrac(boxW - 1 + y)), COLORS.BLACK);
      }
      // Bottom-right corner
      r.drawChar(boxX + boxW - 1, boxY + boxH - 1, '\u255D', goldSheen(perimFrac(boxW - 1 + boxH - 1)), COLORS.BLACK);
      // Bottom edge: right to left (perimeter indices boxW-1+boxH-1 to 2*(boxW-1)+boxH-1)
      for (let x = boxW - 2; x >= 1; x--) {
        r.drawChar(boxX + x, boxY + boxH - 1, '\u2550', goldSheen(perimFrac(boxW - 1 + boxH - 1 + (boxW - 1 - x))), COLORS.BLACK);
      }
      // Bottom-left corner
      r.drawChar(boxX, boxY + boxH - 1, '\u255A', goldSheen(perimFrac(2 * (boxW - 1) + boxH - 1)), COLORS.BLACK);
      // Left edge: bottom to top (perimeter indices 2*(boxW-1)+boxH-1 to perim)
      for (let y = boxH - 2; y >= 1; y--) {
        r.drawChar(boxX, boxY + y, '\u2551', goldSheen(perimFrac(2 * (boxW - 1) + boxH - 1 + (boxH - 1 - y))), COLORS.BLACK);
      }

      // Draw title text with wave animation on black bg
      for (let i = 0; i < title.length; i++) {
        for (let j = 0; j < title[i].length; j++) {
          const ch = title[i][j];
          if (ch === ' ') continue;
          const phase = (j + i * 3) * 0.1 - t * 1.8;
          const wave = (Math.sin(phase) + 1) / 2;
          const ci = Math.min(Math.floor(wave * waveColors.length), waveColors.length - 1);
          r.drawChar(artStartX + j, artStartY + i, ch, waveColors[ci], COLORS.BLACK);
        }
      }
    } else {
      const shortTitle = 'A S C I I Q U E S T';
      const stx = Math.floor((cols - shortTitle.length) / 2);
      const boxW = shortTitle.length + 4;
      const boxH = 3;
      const boxX = stx - 2;
      const boxY = artStartY;

      // Animated gold sheen border (compact mode)
      const cPerim = 2 * (boxW - 1) + 2 * (boxH - 1);
      const cSheenPos = ((t * 1.2) % 1.0 + 1.0) % 1.0;
      const cSheenW = 0.08;
      const cGoldSheen = (frac) => {
        let dist = Math.abs(frac - cSheenPos);
        if (dist > 0.5) dist = 1.0 - dist;
        const brightness = Math.exp(-(dist * dist) / (cSheenW * cSheenW));
        const rv = Math.floor(160 + brightness * 95);
        const gv = Math.floor(120 + brightness * 115);
        const bv = Math.floor(30 + brightness * 100);
        return `rgb(${rv},${gv},${bv})`;
      };
      const cPF = (idx) => idx / cPerim;

      r.fillRect(boxX, boxY, boxW, boxH, ' ', COLORS.WHITE, COLORS.BLACK);
      r.drawChar(boxX, boxY, '\u2554', cGoldSheen(cPF(0)), COLORS.BLACK);
      for (let x = 1; x < boxW - 1; x++) {
        r.drawChar(boxX + x, boxY, '\u2550', cGoldSheen(cPF(x)), COLORS.BLACK);
      }
      r.drawChar(boxX + boxW - 1, boxY, '\u2557', cGoldSheen(cPF(boxW - 1)), COLORS.BLACK);
      for (let y = 1; y < boxH - 1; y++) {
        r.drawChar(boxX + boxW - 1, boxY + y, '\u2551', cGoldSheen(cPF(boxW - 1 + y)), COLORS.BLACK);
      }
      r.drawChar(boxX + boxW - 1, boxY + boxH - 1, '\u255D', cGoldSheen(cPF(boxW - 1 + boxH - 1)), COLORS.BLACK);
      for (let x = boxW - 2; x >= 1; x--) {
        r.drawChar(boxX + x, boxY + boxH - 1, '\u2550', cGoldSheen(cPF(boxW - 1 + boxH - 1 + (boxW - 1 - x))), COLORS.BLACK);
      }
      r.drawChar(boxX, boxY + boxH - 1, '\u255A', cGoldSheen(cPF(2 * (boxW - 1) + boxH - 1)), COLORS.BLACK);
      for (let y = boxH - 2; y >= 1; y--) {
        r.drawChar(boxX, boxY + y, '\u2551', cGoldSheen(cPF(2 * (boxW - 1) + boxH - 1 + (boxH - 1 - y))), COLORS.BLACK);
      }

      for (let j = 0; j < shortTitle.length; j++) {
        const ch = shortTitle[j];
        if (ch === ' ') continue;
        const phase = j * 0.3 - t * 1.8;
        const wave = (Math.sin(phase) + 1) / 2;
        const ci = Math.min(Math.floor(wave * waveColors.length), waveColors.length - 1);
        r.drawChar(stx + j, artStartY + 1, ch, waveColors[ci], COLORS.BLACK);
      }
    }

    const titleBlockEnd = compact ? artStartY + 3 : artStartY + title.length;

    if (this.versionString) {
      const vLabel = `[${this.versionString}]`;
      r.drawString(Math.floor((cols - vLabel.length) / 2), rows - 1,
        vLabel, COLORS.BRIGHT_BLACK, COLORS.BLACK);
    }

    // FF-style menu box (draws on top of background)
    const menuItems = ['New Game', 'Quick Start', 'Continue', 'Export Save', 'Import Save', 'Settings', 'Help'];
    const menuW = 22;
    const menuH = menuItems.length * 2 + 3;
    const menuX = Math.floor((cols - menuW) / 2);
    const menuY = titleBlockEnd + 3;

    r.drawBox(menuX, menuY, menuW, menuH);

    for (let i = 0; i < menuItems.length; i++) {
      const sel = i === this.selectedIndex;
      const cursor = sel ? ICONS.cursor : ' ';
      const color = sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE;
      r.drawString(menuX + 2, menuY + 1 + i * 2, cursor + ' ' + menuItems[i], color, COLORS.FF_BLUE_DARK);
    }

    const footer = 'Select with arrows, confirm with Enter';
    r.drawString(Math.floor((cols - footer.length) / 2), rows - 2, footer, COLORS.BRIGHT_BLACK, COLORS.BLACK);
  }

  // ─── CHARACTER CREATION (FF-style) ───

  drawCharCreation(charGenState) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    r.clear();

    const panelW = Math.min(cols - 4, 56);
    const panelH = Math.min(rows - 4, 24);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' New Character ');

    const step = charGenState.step;
    // Step indicator at top
    const steps = ['Race', 'Class', 'Name', 'History', 'Confirm'];
    const stepIdx = step === 'race' ? 0 : step === 'class' ? 1 : step === 'name' ? 2 : step === 'history_depth' ? 3 : 4;
    let stx = px + 2;
    for (let i = 0; i < steps.length; i++) {
      const active = i === stepIdx;
      const done = i < stepIdx;
      const label = done ? `${ICONS.check} ${steps[i]}` : steps[i];
      r.drawString(stx, py + 2, label,
        active ? COLORS.BRIGHT_WHITE : done ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_BLACK, bg);
      stx += label.length + 3;
    }
    r.drawString(px + 1, py + 3, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);

    if (step === 'race') {
      r.drawString(px + 2, py + 5, 'Choose your origin:', COLORS.BRIGHT_CYAN, bg);
      const races = ['Human', 'Enhanced', 'Cyborg'];
      const descs = [
        'Baseline colonists, adaptable and resourceful',
        'Genetically modified humans with heightened abilities',
        'Partially mechanical beings fused with salvaged tech'
      ];
      for (let i = 0; i < races.length; i++) {
        const sel = i === this.selectedIndex;
        const cursor = sel ? ICONS.cursor : ' ';
        r.drawString(px + 3, py + 7 + i * 3, cursor + ' ' + races[i],
          sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE, bg, panelW - 4);
        r.drawString(px + 7, py + 8 + i * 3, descs[i], COLORS.BRIGHT_BLACK, bg, panelW - 8);
      }
    } else if (step === 'class') {
      r.drawString(px + 2, py + 5, 'Choose your job:', COLORS.BRIGHT_CYAN, bg);
      const classes = ['Junk Collector', 'Scavenger', 'Mercenary', 'Engineer'];
      const descs = [
        'Tank/salvager who fights with scrap weapons',
        'Ranged tech specialist who explores deep ruins',
        'Combat specialist, a hired gun for dangerous jobs',
        'Support role who repairs tech and heals allies'
      ];
      for (let i = 0; i < classes.length; i++) {
        const sel = i === this.selectedIndex;
        const cursor = sel ? ICONS.cursor : ' ';
        r.drawString(px + 3, py + 7 + i * 3, cursor + ' ' + classes[i],
          sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE, bg, panelW - 4);
        r.drawString(px + 7, py + 8 + i * 3, descs[i], COLORS.BRIGHT_BLACK, bg, panelW - 8);
      }
    } else if (step === 'name') {
      r.drawString(px + 2, py + 5, 'Enter your name:', COLORS.BRIGHT_CYAN, bg);
      const nameBox = (charGenState.name || '') + '_';
      r.drawString(px + 4, py + 7, nameBox, COLORS.BRIGHT_WHITE, bg, panelW - 6);
      r.drawString(px + 4, py + 9, 'Type your name, press Enter', COLORS.BRIGHT_BLACK, bg, panelW - 6);
      r.drawString(px + 4, py + 10, 'Press R for a random name', COLORS.BRIGHT_BLACK, bg, panelW - 6);
    } else if (step === 'history_depth') {
      r.drawString(px + 2, py + 5, 'How deep should the world\'s history be?', COLORS.BRIGHT_CYAN, bg);
      const depths = ['Short', 'Medium', 'Long', 'Epic'];
      const descs = [
        'A young colony, barely settled (~200 years)',
        'Generations of growth and conflict (~500 years)',
        'Deep roots, ancient grudges (~1000 years)',
        'Eons of rise and ruin (~2000+ years)',
      ];
      const flavors = [
        'Quick start. Fewer factions and events.',
        'Balanced depth. Wars, plagues, and legends.',
        'Rich tapestry. Tech rises and falls, schisms tear nations apart.',
        'Maximum depth. Countless civilizations, invasions, and cataclysms.',
      ];
      for (let i = 0; i < depths.length; i++) {
        const sel = i === this.selectedIndex;
        const cursor = sel ? ICONS.cursor : ' ';
        r.drawString(px + 3, py + 7 + i * 4, cursor + ' ' + depths[i],
          sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE, bg, panelW - 4);
        r.drawString(px + 7, py + 8 + i * 4, descs[i], COLORS.BRIGHT_BLACK, bg, panelW - 8);
        r.drawString(px + 7, py + 9 + i * 4, flavors[i], COLORS.BRIGHT_BLACK, bg, panelW - 8);
      }
    } else if (step === 'confirm') {
      r.drawString(px + 2, py + 5, 'Your adventurer:', COLORS.BRIGHT_CYAN, bg);
      r.drawString(px + 4, py + 7, `Name   ${charGenState.name}`, COLORS.BRIGHT_WHITE, bg, panelW - 6);
      r.drawString(px + 4, py + 8, `Origin ${charGenState.race}`, COLORS.BRIGHT_WHITE, bg, panelW - 6);
      r.drawString(px + 4, py + 9, `Job    ${charGenState.playerClass}`, COLORS.BRIGHT_WHITE, bg, panelW - 6);
      const depthLabel = charGenState.historyDepth || 'medium';
      r.drawString(px + 4, py + 10, `World  ${depthLabel.charAt(0).toUpperCase() + depthLabel.slice(1)} history`, COLORS.BRIGHT_WHITE, bg, panelW - 6);
      r.drawString(px + 4, py + 13, 'Enter: Begin    Esc: Start Over', COLORS.BRIGHT_YELLOW, bg, panelW - 6);
    }
  }

  // ─── DIALOGUE (FF-style centered text box with animated background) ───

  drawDialogueBackground() {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const now = Date.now();

    // Slow-drifting digital rain / comm-static background
    const glyphs = '.:;|!¦╎╏┆┇·∙°⁘⁙';
    const baseBg = '#06060e';

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Layered sine waves for gentle movement
        const drift = Math.sin((x * 0.12) + (now * 0.0004)) * 0.5
                    + Math.cos((y * 0.18) + (now * 0.0003)) * 0.5;
        const col = Math.sin((x * 0.08) + (y * 0.15) + (now * 0.0006));

        // Sparse character rain — only ~15% of cells get a glyph
        const hash = ((x * 2654435761) ^ (y * 2246822519)) >>> 0;
        const phase = ((hash % 3000) / 3000) + drift * 0.3;
        const cycle = Math.sin(phase * Math.PI * 2 + now * 0.001);

        if (cycle > 0.65) {
          const gi = (hash + Math.floor(now * 0.002 + y * 0.5)) % glyphs.length;
          const brightness = Math.floor(25 + 20 * col);
          const g = Math.floor(brightness * 0.7);
          const b = Math.floor(brightness * 1.2);
          const fg = `rgb(${Math.floor(brightness * 0.4)},${g},${Math.max(b, brightness)})`;
          r.drawChar(x, y, glyphs[gi], fg, baseBg);
        } else {
          // Dark background with subtle variation
          const v = 6 + Math.floor(4 * Math.sin(x * 0.3 + y * 0.2 + now * 0.0002));
          r.drawChar(x, y, ' ', baseBg, `rgb(${v},${v},${v + 4})`);
        }
      }
    }
  }

  drawDialogue(dialogueState) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;

    // FF dialogue: wide centered panel
    const panelW = Math.min(cols - 4, 64);
    const px = Math.floor((cols - panelW) / 2);

    // Calculate total height to center vertically
    const textH = 6;
    const dialogH = textH + 2;
    const nameH = 3;
    const options = dialogueState.options;
    const optH = options.length > 0 ? options.length + 2 : 0;
    const totalH = nameH + dialogH + optH;
    const startY = Math.max(1, Math.floor((rows - totalH) / 2));

    // Name plate box (small box above the dialogue)
    const nameStr = dialogueState.npcName;
    const nameBoxW = Math.min(nameStr.length + 4, panelW - 8);
    const nameBoxX = px;
    const nameBoxY = startY;
    r.drawBox(nameBoxX, nameBoxY, nameBoxW, nameH, COLORS.FF_BORDER, bg);
    r.drawString(nameBoxX + 2, nameBoxY + 1, nameStr, COLORS.BRIGHT_WHITE, bg, nameBoxW - 4);

    // Rep indicator next to name — only if it fits within panel
    const repStr = `${dialogueState.reputation >= 0 ? '+' : ''}${dialogueState.reputation}`;
    const repColor = dialogueState.reputation >= 0 ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED;
    if (nameBoxX + nameBoxW + 1 + repStr.length < px + panelW) {
      r.drawString(nameBoxX + nameBoxW + 1, nameBoxY + 1, repStr, repColor, bg);
    }

    // Main dialogue box centered
    const dialogY = nameBoxY + nameH;
    r.drawBox(px, dialogY, panelW, dialogH, COLORS.FF_BORDER, bg);

    // Dialogue text with word wrap
    const textLines = wordWrap(dialogueState.text, panelW - 4);
    for (let i = 0; i < textLines.length && i < textH; i++) {
      r.drawString(px + 2, dialogY + 1 + i, textLines[i], COLORS.BRIGHT_WHITE, bg);
    }

    // Blinking prompt triangle at bottom-right of text box
    const t = Date.now() / 500;
    if (Math.sin(t) > 0) {
      r.drawChar(px + panelW - 3, dialogY + dialogH - 2, '\u25BC', COLORS.BRIGHT_WHITE, bg); // ▼
    }

    // Options box below dialogue
    if (options.length > 0) {
      const optBoxH = options.length + 2;
      const optW = Math.min(panelW, 40);
      const optX = px + panelW - optW;
      const optY = dialogY + dialogH;

      // Clamp to screen bounds
      const clampedOptY = Math.min(optY, rows - optBoxH);
      r.drawBox(optX, clampedOptY, optW, optBoxH, COLORS.FF_BORDER, bg);

      for (let i = 0; i < options.length; i++) {
        const sel = i === this.selectedIndex;
        const cursor = sel ? ICONS.cursor : ' ';
        const text = options[i].text;
        const truncated = text.length > optW - 6 ? text.substring(0, optW - 7) + '\u2026' : text;
        r.drawString(optX + 2, clampedOptY + 1 + i, cursor + ' ' + truncated,
          sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE, bg);
      }
    }
  }

  // ─── SHOP (FF-style) ───

  drawShop(shopState, player = null) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 4, 65);
    const panelH = Math.min(rows - 4, 28);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    // Shard display box (top-right, FF-style)
    const gilStr = `${shopState.playerGold}§`;
    const gilBoxW = gilStr.length + 4;
    r.drawBox(px + panelW - gilBoxW, py, gilBoxW, 3, COLORS.FF_BORDER, bg);
    r.drawString(px + panelW - gilBoxW + 2, py + 1, gilStr, COLORS.BRIGHT_YELLOW, bg);

    // Shop name box (top-left)
    const nameW = Math.min(shopState.shopName.length + 4, panelW - gilBoxW - 1);
    r.drawBox(px, py, nameW, 3, COLORS.FF_BORDER, bg);
    r.drawString(px + 2, py + 1, shopState.shopName, COLORS.BRIGHT_WHITE, bg, nameW - 4);

    // Tab selector
    const tab = shopState.tab;
    const tabBoxW = 20;
    r.drawBox(px, py + 3, tabBoxW, 3, COLORS.FF_BORDER, bg);
    const buyLabel = tab === 'buy' ? `${ICONS.cursor} Buy` : '  Buy';
    const sellLabel = tab === 'sell' ? `${ICONS.cursor} Sell` : '  Sell';
    r.drawString(px + 2, py + 4, buyLabel, tab === 'buy' ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK, bg);
    r.drawString(px + 10, py + 4, sellLabel, tab === 'sell' ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK, bg);

    // Item list box
    const listBoxY = py + 6;
    const listBoxH = panelH - 12;
    r.drawBox(px, listBoxY, panelW, listBoxH, COLORS.FF_BORDER, bg);

    const items = tab === 'buy' ? shopState.shopItems : shopState.playerItems;
    const maxVisible = listBoxH - 2;

    for (let i = 0; i < Math.min(items.length, maxVisible); i++) {
      const item = items[i];
      const sel = i === this.selectedIndex;
      const price = tab === 'buy' ? item.buyPrice : item.sellPrice;
      const priceStr = `${price}§`;
      const cursor = sel ? ICONS.cursor : ' ';

      r.drawString(px + 2, listBoxY + 1 + i, cursor + ' ' + item.name,
        sel ? COLORS.BRIGHT_WHITE : item.color || COLORS.WHITE, bg, panelW - priceStr.length - 4);
      r.drawString(px + panelW - priceStr.length - 2, listBoxY + 1 + i,
        priceStr, COLORS.BRIGHT_YELLOW, bg);
    }

    if (items.length === 0) {
      r.drawString(px + 4, listBoxY + 2, 'Nothing available.', COLORS.BRIGHT_BLACK, bg);
    }

    // Item detail box (bottom)
    const detBoxY = listBoxY + listBoxH;
    const detBoxH = 6;
    r.drawBox(px, detBoxY, panelW, detBoxH, COLORS.FF_BORDER, bg);

    if (items.length > 0 && this.selectedIndex < items.length) {
      const item = items[this.selectedIndex];

      if (item.stats && Object.keys(item.stats).length > 0) {
        const statStr = Object.entries(item.stats)
          .map(([k, v]) => `${k}:${v > 0 ? '+' : ''}${v}`).join('  ');
        r.drawString(px + 2, detBoxY + 1, statStr, COLORS.BRIGHT_CYAN, bg, panelW - 4);
      }
      if (item.description) {
        r.drawString(px + 2, detBoxY + 2, item.description, COLORS.WHITE, bg, panelW - 4);
      }

      // Equipment comparison
      if (player && player.equipment && tab === 'buy' && item.stats) {
        const slot = item.type === 'weapon' ? 'weapon' : item.type === 'armor' ? 'armor' : item.type;
        const equipped = player.equipment[slot];
        if (equipped && equipped.stats) {
          r.drawString(px + 2, detBoxY + 3, 'Equipped:', COLORS.BRIGHT_BLACK, bg);
          let cx = px + 12;
          const allKeys = new Set([...Object.keys(item.stats), ...Object.keys(equipped.stats)]);
          for (const k of allKeys) {
            const diff = (item.stats[k] || 0) - (equipped.stats[k] || 0);
            if (diff !== 0) {
              const color = diff > 0 ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED;
              const sign = diff > 0 ? '+' : '';
              const seg = `${k}:${sign}${diff} `;
              if (cx + seg.length < px + panelW - 2) {
                r.drawString(cx, detBoxY + 3, seg, color, bg);
                cx += seg.length;
              }
            }
          }
        } else if (!equipped) {
          r.drawString(px + 2, detBoxY + 3, '(nothing equipped)', COLORS.BRIGHT_BLACK, bg);
        }
      }
    }

    // Command help at bottom
    r.drawString(px + 2, detBoxY + detBoxH - 1,
      'Enter:Confirm  H:Haggle  Esc:Leave', COLORS.BRIGHT_BLACK, bg, panelW - 4);

  }

  // ─── INVENTORY (FF-style Items menu) ───

  drawInventory(player) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 4, 60);
    const panelH = Math.min(rows - 4, 30);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    // Title box
    r.drawBox(px, py, panelW, 3, COLORS.FF_BORDER, bg);
    r.drawString(px + 2, py + 1, 'Items', COLORS.BRIGHT_WHITE, bg);

    // Item count
    const countStr = `${player.inventory.length} items`;
    r.drawString(px + panelW - countStr.length - 2, py + 1, countStr, COLORS.BRIGHT_BLACK, bg);

    // Item list box
    const listY = py + 3;
    const listH = panelH - 9;
    r.drawBox(px, listY, panelW, listH, COLORS.FF_BORDER, bg);

    const items = player.inventory;
    const maxVisible = listH - 2;

    for (let i = 0; i < Math.min(items.length, maxVisible); i++) {
      const item = items[i];
      const sel = i === this.selectedIndex;
      const equipped = (player.equipment && Object.values(player.equipment).some(e => e && e.id === item.id));
      const eqTag = equipped ? ' E' : '  ';
      const cursor = sel ? ICONS.cursor : ' ';

      r.drawString(px + 2, listY + 1 + i,
        cursor + ' ' + item.char + ' ' + item.name.substring(0, panelW - 14) + eqTag,
        sel ? COLORS.BRIGHT_WHITE : (item.color || COLORS.WHITE), bg, panelW - 4);
    }

    if (items.length === 0) {
      r.drawString(px + 4, listY + 2, 'No items.', COLORS.BRIGHT_BLACK, bg);
    }

    // Detail box (bottom)
    const detY = listY + listH;
    const detH = 6;
    r.drawBox(px, detY, panelW, detH, COLORS.FF_BORDER, bg);

    if (items.length > 0 && this.selectedIndex < items.length) {
      const item = items[this.selectedIndex];
      r.drawString(px + 2, detY + 1, item.name, COLORS.BRIGHT_WHITE, bg, panelW - 4);
      if (item.description) {
        r.drawString(px + 2, detY + 2, item.description, COLORS.WHITE, bg, panelW - 4);
      }
      if (item.stats) {
        const statStr = Object.entries(item.stats)
          .map(([k, v]) => `${k}:${v > 0 ? '+' : ''}${v}`).join('  ');
        r.drawString(px + 2, detY + 3, statStr, COLORS.BRIGHT_CYAN, bg, panelW - 4);
      }
    }

    r.drawString(px + 2, detY + detH - 1,
      'E:Equip  D:Drop  U:Use  Esc:Close', COLORS.BRIGHT_BLACK, bg, panelW - 4);
  }

  // ─── CHARACTER SHEET (FF Status screen) ───

  drawCharacterSheet(player, factionSystem = null) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 4, 58);
    const panelH = Math.min(rows - 4, 28);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);
    const halfW = Math.floor(panelW / 2);

    // Name/Level header box
    r.drawBox(px, py, panelW, 4, COLORS.FF_BORDER, bg);
    r.drawString(px + 2, py + 1, player.name, COLORS.BRIGHT_WHITE, bg, halfW - 4);
    r.drawString(px + halfW, py + 1, `Lv ${player.stats.level}`, COLORS.BRIGHT_YELLOW, bg, halfW - 2);
    r.drawString(px + 2, py + 2, `${player.race} ${player.playerClass}`, COLORS.BRIGHT_CYAN, bg, halfW - 4);

    const s = player.stats;
    const xpStr = `EXP ${s.xp}/${s.xpToNext}`;
    const gilStr = `${player.gold}§`;
    r.drawString(px + halfW, py + 2, xpStr, COLORS.BRIGHT_GREEN, bg, halfW - 2);

    // HP/MP box
    const hpmpY = py + 4;
    r.drawBox(px, hpmpY, panelW, 4, COLORS.FF_BORDER, bg);

    const hpColor = s.hp < s.maxHp * 0.25 ? COLORS.BRIGHT_RED :
                    s.hp < s.maxHp * 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.BRIGHT_WHITE;
    r.drawString(px + 2, hpmpY + 1, `HP`, COLORS.BRIGHT_WHITE, bg);
    r.drawString(px + 6, hpmpY + 1, `${s.hp}`, hpColor, bg);
    r.drawString(px + 6 + String(s.hp).length, hpmpY + 1, `/ ${s.maxHp}`, COLORS.WHITE, bg);

    // HP gauge
    const gaugeW = 12;
    const gaugeX = px + halfW;
    const hpFrac = s.hp / s.maxHp;
    for (let i = 0; i < gaugeW; i++) {
      const gColor = hpFrac < 0.25 ? COLORS.BRIGHT_RED : hpFrac < 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.BRIGHT_GREEN;
      r.drawChar(gaugeX + i, hpmpY + 1, i < Math.round(hpFrac * gaugeW) ? '\u2588' : '\u2591', gColor, bg);
    }

    r.drawString(px + 2, hpmpY + 2, `MP`, COLORS.BRIGHT_WHITE, bg);
    r.drawString(px + 6, hpmpY + 2, `${s.mana}`, COLORS.BRIGHT_CYAN, bg);
    r.drawString(px + 6 + String(s.mana).length, hpmpY + 2, `/ ${s.maxMana}`, COLORS.WHITE, bg);

    const mpFrac = s.maxMana > 0 ? s.mana / s.maxMana : 0;
    for (let i = 0; i < gaugeW; i++) {
      r.drawChar(gaugeX + i, hpmpY + 2, i < Math.round(mpFrac * gaugeW) ? '\u2588' : '\u2591', COLORS.BRIGHT_CYAN, bg);
    }

    // Stats + Equipment side-by-side boxes
    const statsY = hpmpY + 4;
    const statsH = 9;
    r.drawBox(px, statsY, halfW, statsH, COLORS.FF_BORDER, bg);
    r.drawString(px + 2, statsY, ' Stats ', COLORS.BRIGHT_WHITE, bg);

    const stats = [
      ['Str', s.str], ['Dex', s.dex], ['Con', s.con],
      ['Int', s.int], ['Wis', s.wis], ['Cha', s.cha]
    ];
    for (let i = 0; i < stats.length; i++) {
      const [name, val] = stats[i];
      r.drawString(px + 2, statsY + 1 + i, `${name}`, COLORS.BRIGHT_BLACK, bg);
      r.drawString(px + 7, statsY + 1 + i, `${val}`, COLORS.BRIGHT_WHITE, bg);
    }

    // Attack/Defense
    const atk = player.getAttackPower ? player.getAttackPower() : s.str;
    const def = player.getDefense ? player.getDefense() : s.con;
    r.drawString(px + 2, statsY + 7, `Atk ${atk}`, COLORS.BRIGHT_YELLOW, bg);
    r.drawString(px + 12, statsY + 7, `Def ${def}`, COLORS.BRIGHT_YELLOW, bg);

    // Equipment box
    r.drawBox(px + halfW, statsY, halfW, statsH, COLORS.FF_BORDER, bg);
    r.drawString(px + halfW + 2, statsY, ' Equip ', COLORS.BRIGHT_WHITE, bg);

    const slotNames = ['head', 'chest', 'hands', 'legs', 'feet', 'mainHand', 'offHand'];
    const slotLabels = ['Head', 'Body', 'Arms', 'Legs', 'Feet', 'R.Hand', 'L.Hand'];
    for (let i = 0; i < slotNames.length; i++) {
      const equip = player.equipment[slotNames[i]];
      const eqName = equip ? equip.name : '---';
      r.drawString(px + halfW + 2, statsY + 1 + i, slotLabels[i], COLORS.BRIGHT_BLACK, bg);
      r.drawString(px + halfW + 10, statsY + 1 + i, eqName,
        equip ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK, bg, halfW - 12);
    }

    // Shard display
    r.drawString(px + panelW - gilStr.length - 2, statsY, gilStr, COLORS.BRIGHT_YELLOW, bg);

    // Abilities box
    const abY = statsY + statsH;
    const abH = Math.max(3, panelH - (abY - py) - 1);
    if (player.abilities && player.abilities.length > 0 && abH > 2) {
      r.drawBox(px, abY, panelW, abH, COLORS.FF_BORDER, bg);
      r.drawString(px + 2, abY, ' Abilities ', COLORS.BRIGHT_WHITE, bg);
      for (let i = 0; i < player.abilities.length && i < abH - 2; i++) {
        const ab = player.abilities[i];
        r.drawString(px + 2, abY + 1 + i,
          `${ab.name}`, COLORS.BRIGHT_MAGENTA, bg, halfW - 4);
        r.drawString(px + halfW, abY + 1 + i,
          `${ab.manaCost} MP`, COLORS.BRIGHT_CYAN, bg);
      }
    }

    r.drawString(px + 2, py + panelH - 1, 'Esc:Close  F:Factions', COLORS.BRIGHT_BLACK, bg);
  }

  // ─── FACTION PANEL (FF-style) ───

  drawFactionPanel(factionSystem) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 4, 55);
    const panelH = Math.min(rows - 4, 28);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Factions ');

    const factionIds = ['COLONY_GUARD', 'SALVAGE_GUILD', 'ARCHIVE_KEEPERS', 'COLONY_COUNCIL',
      'SYNDICATE', 'RUST_RAIDERS', 'MALFUNCTIONING', 'MUTANT', 'ALIEN', 'ASSIMILATED'];

    // Filter to valid factions
    const validFactions = factionIds.filter(id => factionSystem._factions.get(id));

    // Scrolling
    const contentH = panelH - 6; // space for header, footer
    const maxVisible = Math.floor(contentH / 2); // each faction takes 2 rows
    const scroll = this.factionScroll = Math.max(0, Math.min(this.factionScroll || 0, Math.max(0, validFactions.length - maxVisible)));
    const visibleFactions = validFactions.slice(scroll, scroll + maxVisible);

    let y = py + 2;

    // Scroll-up indicator
    if (scroll > 0) {
      r.drawString(px + panelW - 4, py + 1, '\u25B2', COLORS.BRIGHT_WHITE, bg);
    }

    for (const id of visibleFactions) {
      const faction = factionSystem._factions.get(id);
      const standing = factionSystem.getPlayerStanding(id);

      const barW = Math.min(16, panelW - 32);
      const normalized = Math.round(((standing + 100) / 200) * barW);
      const bar = '\u2588'.repeat(Math.max(0, normalized)) + '\u2591'.repeat(Math.max(0, barW - normalized));

      const standingLabel = standing > 50 ? 'Allied' : standing > 20 ? 'Friendly' :
        standing > -20 ? 'Neutral' : standing > -50 ? 'Unfriendly' : 'Hostile';
      const labelColor = standing > 50 ? COLORS.BRIGHT_GREEN : standing > 20 ? COLORS.GREEN :
        standing > -20 ? COLORS.WHITE : standing > -50 ? COLORS.BRIGHT_YELLOW : COLORS.BRIGHT_RED;

      const nameMaxW = Math.min(16, panelW - 4);
      r.drawString(px + 2, y, faction.name.substring(0, nameMaxW).padEnd(nameMaxW), COLORS.BRIGHT_WHITE, bg);
      const barX = px + nameMaxW + 3;
      r.drawString(barX, y, bar, labelColor, bg, panelW - nameMaxW - 5);
      const labelX = barX + barW + 1;
      if (labelX < px + panelW - 2) {
        r.drawString(labelX, y, standingLabel, labelColor, bg, px + panelW - 2 - labelX);
      }
      y += 2;
    }

    // Scroll-down indicator
    if (scroll + maxVisible < validFactions.length) {
      r.drawString(px + panelW - 4, py + panelH - 3, '\u25BC', COLORS.BRIGHT_WHITE, bg);
    }

    r.drawString(px + 2, py + panelH - 2, 'Defeat enemies to raise standing.', COLORS.BRIGHT_BLACK, bg, panelW - 4);
    r.drawString(px + 2, py + panelH - 1, 'Esc:Close  \u2191\u2193:Scroll', COLORS.BRIGHT_BLACK, bg, panelW - 4);
  }

  // ─── QUEST LOG (FF-style Quests menu) ───

  drawQuestLog(questSystem, trackedQuestId) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 4, 60);
    const panelH = Math.min(rows - 4, 25);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Quests ');

    const active = questSystem.getActiveQuests();
    const completed = questSystem.getCompletedQuests();

    // Build all content lines with metadata
    const lines = [];
    lines.push({ type: 'header', text: 'Active' });
    lines.push({ type: 'separator' });

    if (active.length === 0) {
      lines.push({ type: 'text', text: '  No active quests.', color: COLORS.BRIGHT_BLACK });
    }
    for (let i = 0; i < active.length; i++) {
      const q = active[i];
      const sel = i === this.selectedIndex;
      const tracked = q.id === trackedQuestId;
      const cursor = sel ? ICONS.cursor : ' ';
      const trackIcon = tracked ? ' \u25CE' : '';
      const titleColor = tracked ? COLORS.BRIGHT_CYAN : (sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE);
      lines.push({ type: 'quest', text: cursor + ' ' + q.title + trackIcon, color: titleColor, questIdx: i });
      for (const obj of q.objectives) {
        const progress = `${obj.current}/${obj.required}`;
        const objMaxW = panelW - 8;
        const descMax = objMaxW - progress.length - 2;
        const desc = obj.description.length > descMax ? obj.description.substring(0, descMax) : obj.description;
        lines.push({ type: 'objective', text: '    ' + desc + '  ' + progress, color: COLORS.BRIGHT_BLACK });
      }
    }

    lines.push({ type: 'blank' });
    lines.push({ type: 'header', text: 'Completed' });
    lines.push({ type: 'separator' });

    for (let i = 0; i < completed.length; i++) {
      lines.push({ type: 'completed', text: '  ' + ICONS.check + ' ' + completed[i].title, color: COLORS.BRIGHT_GREEN });
    }
    if (completed.length === 0) {
      lines.push({ type: 'text', text: '  None yet.', color: COLORS.BRIGHT_BLACK });
    }

    // Auto-scroll to keep selected quest visible
    const contentH = panelH - 4; // 2 top border + 1 footer + 1 bottom border
    let selectedLineIdx = lines.findIndex(l => l.type === 'quest' && l.questIdx === this.selectedIndex);
    if (selectedLineIdx < 0) selectedLineIdx = 0;

    if (!this.questLogScroll) this.questLogScroll = 0;
    if (selectedLineIdx < this.questLogScroll) {
      this.questLogScroll = selectedLineIdx;
    } else if (selectedLineIdx >= this.questLogScroll + contentH) {
      this.questLogScroll = selectedLineIdx - contentH + 1;
    }
    this.questLogScroll = Math.max(0, Math.min(this.questLogScroll, Math.max(0, lines.length - contentH)));

    // Render visible lines
    const visibleLines = lines.slice(this.questLogScroll, this.questLogScroll + contentH);
    let y = py + 2;

    // Scroll-up indicator
    if (this.questLogScroll > 0) {
      r.drawString(px + panelW - 4, py + 1, '\u25B2', COLORS.BRIGHT_WHITE, bg);
    }

    for (const line of visibleLines) {
      if (line.type === 'header') {
        r.drawString(px + 2, y, line.text, COLORS.BRIGHT_WHITE, bg);
      } else if (line.type === 'separator') {
        r.drawString(px + 1, y, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);
      } else if (line.type === 'blank') {
        // empty line
      } else {
        r.drawString(px + 2, y, line.text, line.color, bg, panelW - 4);
      }
      y++;
    }

    // Scroll-down indicator
    if (this.questLogScroll + contentH < lines.length) {
      r.drawString(px + panelW - 4, py + panelH - 2, '\u25BC', COLORS.BRIGHT_WHITE, bg);
    }

    r.drawString(px + 2, py + panelH - 1, 'Esc:Close  Enter:Track  \u2191\u2193:Select', COLORS.BRIGHT_BLACK, bg);
  }

  // ─── MAP VIEW (FF-style) ───

  drawMapView(overworld, player, knownLocations) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;

    r.drawBox(0, 0, cols, rows, COLORS.FF_BORDER, COLORS.FF_BLUE_DARK, ' World Map ');

    if (!overworld) return;

    const mapW = cols - 4;
    const mapH = rows - 4;
    const CHUNK_SIZE = 32;

    // Chunk-based overworld: compute bounding box from explored chunks
    if (overworld.exploredChunks && overworld.exploredChunks.size > 0) {
      let minCx = Infinity, maxCx = -Infinity, minCy = Infinity, maxCy = -Infinity;
      for (const key of overworld.exploredChunks) {
        const [cx, cy] = key.split(',').map(Number);
        if (cx < minCx) minCx = cx;
        if (cx > maxCx) maxCx = cx;
        if (cy < minCy) minCy = cy;
        if (cy > maxCy) maxCy = cy;
      }

      // World-coordinate bounding box (with 1-chunk padding)
      const worldMinX = (minCx - 1) * CHUNK_SIZE;
      const worldMaxX = (maxCx + 2) * CHUNK_SIZE;
      const worldMinY = (minCy - 1) * CHUNK_SIZE;
      const worldMaxY = (maxCy + 2) * CHUNK_SIZE;

      const worldW = worldMaxX - worldMinX;
      const worldH = worldMaxY - worldMinY;
      const scaleX = worldW / mapW;
      const scaleY = worldH / mapH;

      for (let sy = 0; sy < mapH; sy++) {
        for (let sx = 0; sx < mapW; sx++) {
          const wx = worldMinX + Math.floor(sx * scaleX);
          const wy = worldMinY + Math.floor(sy * scaleY);
          const cx = Math.floor(wx / CHUNK_SIZE);
          const cy = Math.floor(wy / CHUNK_SIZE);
          const chunkKey = `${cx},${cy}`;

          if (overworld.exploredChunks.has(chunkKey)) {
            const tile = overworld.getTile(wx, wy);
            r.drawChar(sx + 2, sy + 2, tile.char, tile.fg, tile.bg || COLORS.BLACK);
          } else {
            r.drawChar(sx + 2, sy + 2, ' ', COLORS.BLACK, COLORS.BLACK);
          }
        }
      }

      // Draw locations with street grids for cities/towns
      const locations = overworld.getLoadedLocations ? overworld.getLoadedLocations() : [];
      for (const loc of locations) {
        const sx = Math.floor((loc.x - worldMinX) / scaleX) + 2;
        const sy = Math.floor((loc.y - worldMinY) / scaleY) + 2;
        if (sx >= 2 && sx < cols - 2 && sy >= 2 && sy < rows - 2) {
          const known = !knownLocations || knownLocations.has(loc.id);
          const ch = loc.type === 'city' ? '▣' : loc.type === 'town' ? '□' :
            loc.type === 'village' ? '○' : loc.type === 'dungeon' ? '▼' :
              loc.type === 'castle' ? '♦' : loc.type === 'temple' ? '†' :
                loc.type === 'ruins' ? '▪' : loc.type === 'tower' ? '▲' : '◦';

          // Draw street grid around cities and towns
          if (known && (loc.type === 'city' || loc.type === 'town')) {
            const gridColor = COLORS.BRIGHT_BLACK;
            const gridSize = loc.type === 'city' ? 2 : 1;
            for (let gy = -gridSize; gy <= gridSize; gy++) {
              for (let gx = -gridSize; gx <= gridSize; gx++) {
                if (gx === 0 && gy === 0) continue; // center is the icon
                const gsx = sx + gx;
                const gsy = sy + gy;
                if (gsx >= 2 && gsx < cols - 2 && gsy >= 2 && gsy < rows - 2) {
                  // Grid pattern: streets on axis lines, buildings in between
                  if (gx === 0 || gy === 0) {
                    r.drawChar(gsx, gsy, gx === 0 ? '║' : '═', gridColor);
                  } else {
                    r.drawChar(gsx, gsy, '·', gridColor);
                  }
                }
              }
            }
          }

          if (known && this.glow) {
            const isDng = loc.type === 'dungeon' || loc.type === 'tower' || loc.type === 'ruins';
            const glowCat = isDng ? 'DUNGEON_ENTRANCE' : 'SETTLEMENT';
            r.drawChar(sx, sy, ch, this.glow.getGlowColor(glowCat, COLORS.BRIGHT_WHITE));
          } else {
            r.drawChar(sx, sy, ch, known ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK);
          }
        }
      }

      // Player position
      if (player && player.position) {
        const px = Math.floor((player.position.x - worldMinX) / scaleX) + 2;
        const py2 = Math.floor((player.position.y - worldMinY) / scaleY) + 2;
        if (px >= 2 && px < cols - 2 && py2 >= 2 && py2 < rows - 2) {
          const pColor = this.glow ? this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW) : COLORS.BRIGHT_YELLOW;
          r.drawChar(px, py2, '@', pColor);
        }
      }
    } else if (overworld.tiles) {
      // Legacy fallback for fixed-size overworld
      const scaleX = overworld.tiles[0].length / mapW;
      const scaleY = overworld.tiles.length / mapH;
      for (let sy = 0; sy < mapH; sy++) {
        for (let sx = 0; sx < mapW; sx++) {
          const wx = Math.floor(sx * scaleX);
          const wy = Math.floor(sy * scaleY);
          if (wy < overworld.tiles.length && wx < overworld.tiles[0].length) {
            const tile = overworld.tiles[wy][wx];
            r.drawChar(sx + 2, sy + 2, tile.char, tile.fg, tile.bg || COLORS.BLACK);
          }
        }
      }
      if (overworld.locations) {
        const scaleX2 = overworld.tiles[0].length / mapW;
        const scaleY2 = overworld.tiles.length / mapH;
        for (const loc of overworld.locations) {
          const sx = Math.floor(loc.x / scaleX2) + 2;
          const sy = Math.floor(loc.y / scaleY2) + 2;
          if (sx >= 2 && sx < cols - 2 && sy >= 2 && sy < rows - 2) {
            const known = !knownLocations || knownLocations.has(loc.id);
            const ch = loc.type === 'city' ? '▣' : loc.type === 'town' ? '□' :
              loc.type === 'village' ? '○' : loc.type === 'dungeon' ? '▼' :
                loc.type === 'castle' ? '♦' : loc.type === 'temple' ? '†' :
                  loc.type === 'ruins' ? '▪' : loc.type === 'tower' ? '▲' : '◦';
            // Street grid for cities/towns
            if (known && (loc.type === 'city' || loc.type === 'town')) {
              const gridColor = COLORS.BRIGHT_BLACK;
              const gridSize = loc.type === 'city' ? 2 : 1;
              for (let gy = -gridSize; gy <= gridSize; gy++) {
                for (let gx = -gridSize; gx <= gridSize; gx++) {
                  if (gx === 0 && gy === 0) continue;
                  const gsx = sx + gx;
                  const gsy = sy + gy;
                  if (gsx >= 2 && gsx < cols - 2 && gsy >= 2 && gsy < rows - 2) {
                    if (gx === 0 || gy === 0) r.drawChar(gsx, gsy, gx === 0 ? '║' : '═', gridColor);
                    else r.drawChar(gsx, gsy, '·', gridColor);
                  }
                }
              }
            }
            if (known && this.glow) {
              const isDng = loc.type === 'dungeon' || loc.type === 'tower' || loc.type === 'ruins';
              const glowCat = isDng ? 'DUNGEON_ENTRANCE' : 'SETTLEMENT';
              r.drawChar(sx, sy, ch, this.glow.getGlowColor(glowCat, COLORS.BRIGHT_WHITE));
            } else {
              r.drawChar(sx, sy, ch, known ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK);
            }
          }
        }
      }
      if (player && player.position) {
        const scaleX3 = overworld.tiles[0].length / mapW;
        const scaleY3 = overworld.tiles.length / mapH;
        const px = Math.floor(player.position.x / scaleX3) + 2;
        const py2 = Math.floor(player.position.y / scaleY3) + 2;
        if (px >= 2 && px < cols - 2 && py2 >= 2 && py2 < rows - 2) {
          const pColor = this.glow ? this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW) : COLORS.BRIGHT_YELLOW;
          r.drawChar(px, py2, '@', pColor);
        }
      }
    }

    r.drawString(2, rows - 1, 'Esc:Close  -/=:Zoom  O:Outpost  H:Habitat  *:Hub  +:Garrison  v:Sealed  ^:Spire', COLORS.BRIGHT_BLACK, COLORS.FF_BLUE_DARK);
  }

  // ─── GAME OVER (FF-style) ───

  drawGameOver(player, causeOfDeath) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.BLACK;
    r.clear();

    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);

    // FF-style game over with somber presentation
    const boxW = 36;
    const boxH = 14;
    const bx = cx - Math.floor(boxW / 2);
    const by = cy - Math.floor(boxH / 2);

    r.drawBox(bx, by, boxW, boxH, COLORS.FF_BORDER, COLORS.FF_BLUE_DARK);

    // Fallen character art
    const fallen = [
      '  _   ',
      ' / \\  ',
      '|   | ',
      ' \\_/  ',
      '  |   ',
      ' /|\\  ',
      '  |   ',
    ];
    const artX = cx - 3;
    for (let i = 0; i < fallen.length; i++) {
      r.drawString(artX, by + 1 + i, fallen[i], COLORS.BRIGHT_RED, COLORS.FF_BLUE_DARK);
    }

    const goText = 'Annihilated...';
    r.drawString(cx - Math.floor(goText.length / 2), by + 9, goText, COLORS.BRIGHT_RED, COLORS.FF_BLUE_DARK);

    if (player) {
      const pStr = `${player.name}  Lv ${player.stats.level}`;
      r.drawString(cx - Math.floor(pStr.length / 2), by + 10, pStr, COLORS.WHITE, COLORS.FF_BLUE_DARK);
    }
    if (causeOfDeath) {
      r.drawString(cx - Math.floor(Math.min(causeOfDeath.length, boxW - 4) / 2), by + 11, causeOfDeath, COLORS.BRIGHT_BLACK, COLORS.FF_BLUE_DARK, boxW - 4);
    }

    const t = Date.now() / 600;
    if (Math.sin(t) > 0) {
      r.drawString(cx - 6, by + boxH - 1, 'Press Enter', COLORS.BRIGHT_WHITE, COLORS.FF_BLUE_DARK);
    }
  }

  // ─── LOCATION VIEW ───

  drawLocationOverview(settlement, npcs, player, camera, sunDir) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const viewLeft = 1;
    const viewTop = LAYOUT.VIEWPORT_TOP;
    const viewW = cols - 2;
    const viewH = rows - LAYOUT.HUD_TOTAL;

    // Tile height lookup for settlement shadow casting
    const SETTLEMENT_HEIGHTS = {
      WALL: 3, BUILDING_WALL: 3, FENCE: 1, COLUMN: 2,
    };
    // Character-based heights for decorations
    const CHAR_HEIGHTS = {
      '\u2663': 2, '\u2660': 2, 'T': 2, // trees: ♣ ♠ T
      '\u263C': 1, // lamp ☼
      '\u03A9': 2, // statue Ω
      '\u25D9': 3, // castle corner ◙
      '\u2565': 2, // battlement ╥
    };

    // Draw settlement map tiles with camera
    if (settlement.tiles) {
      const density = r.densityLevel;
      const worldW = Math.ceil(viewW / density);
      const worldH = Math.ceil(viewH / density);
      const entityOff = Math.floor(density / 2);

      const camX = camera ? Math.floor(camera.x) : Math.max(0, Math.floor((settlement.tiles[0].length - worldW) / 2));
      const camY = camera ? Math.floor(camera.y) : Math.max(0, Math.floor((settlement.tiles.length - worldH) / 2));

      // Collect shadows (in screen coords)
      const shadowCells = new Map();
      if (sunDir && sunDir.isDay) {
        for (let wy_off = 0; wy_off < worldH; wy_off++) {
          for (let wx_off = 0; wx_off < worldW; wx_off++) {
            const wx = camX + wx_off;
            const wy = camY + wy_off;
            if (wy < 0 || wy >= settlement.tiles.length || wx < 0 || wx >= settlement.tiles[0].length) continue;
            const t = settlement.tiles[wy][wx];
            const height = SETTLEMENT_HEIGHTS[t.type] || CHAR_HEIGHTS[t.char] || (!t.walkable && t.char !== '.' ? 1 : 0);
            if (height > 0) {
              const len = Math.min(height, Math.round(sunDir.shadowLength * height * 0.5));
              for (let i = 1; i <= len; i++) {
                const shBaseX = wx_off * density + sunDir.dx * i * density;
                const shBaseY = wy_off * density + Math.round(sunDir.dy) * i * density;
                for (let sdy = 0; sdy < density; sdy++) {
                  for (let sdx = 0; sdx < density; sdx++) {
                    const shx = Math.floor(shBaseX) + sdx;
                    const shy = Math.floor(shBaseY) + sdy;
                    if (shx >= 0 && shx < viewW && shy >= 0 && shy < viewH) {
                      const key = `${shx},${shy}`;
                      const existing = shadowCells.get(key) || 0;
                      shadowCells.set(key, Math.min(0.6, existing + 0.3));
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Render tiles with density expansion
      for (let wy_off = 0; wy_off < worldH; wy_off++) {
        for (let wx_off = 0; wx_off < worldW; wx_off++) {
          const wx = camX + wx_off;
          const wy = camY + wy_off;
          if (wy >= 0 && wy < settlement.tiles.length && wx >= 0 && wx < settlement.tiles[0].length) {
            const tile = settlement.tiles[wy][wx];

            if (density === 1) {
              const ch = r.getAnimatedChar(tile.char, tile.type);
              const fg = r.getAnimatedColor(tile.fg, tile.type);
              r.drawChar(viewLeft + wx_off, viewTop + wy_off, ch, fg, tile.bg || COLORS.BLACK);
            } else {
              const expanded = expandTile(tile, density, wx, wy);
              for (let dy = 0; dy < density; dy++) {
                for (let dx = 0; dx < density; dx++) {
                  const screenX = viewLeft + wx_off * density + dx;
                  const screenY = viewTop + wy_off * density + dy;
                  if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                    const ch = r.getAnimatedChar(expanded.chars[dy][dx], tile.type);
                    const fg = r.getAnimatedColor(expanded.fgs[dy][dx], tile.type);
                    r.drawChar(screenX, screenY, ch, fg, expanded.bgs[dy][dx]);
                  }
                }
              }
            }
          }
        }
      }

      // Apply shadows after rendering tiles
      for (const [key, alpha] of shadowCells) {
        const [sx, sy] = key.split(',').map(Number);
        r.darkenCell(viewLeft + sx, viewTop + sy, alpha);
      }

      // Draw NPCs
      if (npcs) {
        for (const npc of npcs) {
          const wx_off = npc.position.x - camX;
          const wy_off = npc.position.y - camY;
          if (wx_off >= 0 && wx_off < worldW && wy_off >= 0 && wy_off < worldH) {
            const npcColor = this.glow ? this.glow.getGlowColor('NPC', npc.color || COLORS.BRIGHT_CYAN) : (npc.color || COLORS.BRIGHT_CYAN);
            r.drawChar(viewLeft + wx_off * density + entityOff, viewTop + wy_off * density + entityOff, npc.char, npcColor);
          }
        }
      }

      // Draw player
      if (player) {
        const px = player.position.x - camX;
        const py = player.position.y - camY;
        if (px >= 0 && px < worldW && py >= 0 && py < worldH) {
          const playerColor = this.glow ? this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW) : COLORS.BRIGHT_YELLOW;
          r.drawChar(viewLeft + px * density + entityOff, viewTop + py * density + entityOff, '@', playerColor);
        }
      }
    }
  }

  // ─── HELP SCREEN ───

  drawHelp() {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 76);
    const panelH = Math.min(rows - 2, 40);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    const tabs = ['Keys', 'Inventory', 'Explore', 'Dungeons', 'Combat', 'NPCs', 'Systems', 'Tips'];
    const tab = this.helpTab || 0;

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, COLORS.FF_BLUE_DARK, ' Help ');

    // Tab bar — wrap to multiple rows, center each row
    const bg = COLORS.FF_BLUE_DARK;
    const usableW = panelW - 4;
    const tabLabels = tabs.map((t, i) => `[${i + 1}]${t}`);

    const tabRows = [];
    let currentRow = [];
    let currentRowLen = 0;
    for (let i = 0; i < tabLabels.length; i++) {
      const labelLen = tabLabels[i].length;
      const needed = currentRow.length > 0 ? labelLen + 1 : labelLen;
      if (currentRowLen + needed > usableW && currentRow.length > 0) {
        tabRows.push(currentRow);
        currentRow = [i];
        currentRowLen = labelLen;
      } else {
        currentRow.push(i);
        currentRowLen += needed;
      }
    }
    if (currentRow.length > 0) tabRows.push(currentRow);

    for (let rowIdx = 0; rowIdx < tabRows.length; rowIdx++) {
      const rowIndices = tabRows[rowIdx];
      const totalLen = rowIndices.reduce((sum, i) => sum + tabLabels[i].length, 0) + (rowIndices.length - 1);
      const startX = px + 2 + Math.floor((usableW - totalLen) / 2);
      let tx = startX;
      for (const i of rowIndices) {
        const label = tabLabels[i];
        const color = i === tab ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
        r.drawString(tx, py + 1 + rowIdx, label, color, bg);
        tx += label.length + 1;
      }
    }
    const tabBarHeight = tabRows.length;
    r.drawString(px + 1, py + 1 + tabBarHeight, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);

    const contentY = py + 2 + tabBarHeight;
    const contentH = panelH - 4 - tabBarHeight;
    const w = panelW - 4;

    const pages = [
      // 0: Keys (all keybindings)
      [
        { h: 'MOVEMENT', c: COLORS.BRIGHT_YELLOW },
        { t: 'Arrow Keys / WASD    Move in 4 directions' },
        { t: 'Numpad (1-9)         Move in 8 directions (diagonals)' },
        { t: '' },
        { h: 'INTERACTION', c: COLORS.BRIGHT_YELLOW },
        { t: 'Enter / Space        Confirm selection / interact' },
        { t: 'E                    Enter dungeon, ruins, or building' },
        { t: 'T                    Talk to nearby person' },
        { t: 'G / ,                Pick up item on the ground' },
        { t: 'R                    Rest for 8 hours (overworld)' },
        { t: '< / >                Use stairs up/down (dungeons)' },
        { t: '' },
        { h: 'MENUS & PANELS', c: COLORS.BRIGHT_YELLOW },
        { t: 'I                    Open inventory' },
        { t: 'C                    Character sheet & stats' },
        { t: 'Q                    Quest log' },
        { t: 'J                    Quest compass / guidance' },
        { t: 'M                    World map (explored areas)' },
        { t: 'F                    Faction standings' },
        { t: 'O                    Settings / config' },
        { t: 'L                    Almanac / world history' },
        { t: 'P                    Quick save' },
        { t: '?                    This help screen' },
        { t: 'Escape               Close current menu / go back' },
        { t: '`                    Toggle debug panel' },
      ],
      // 1: Inventory & Shop
      [
        { h: 'INVENTORY CONTROLS', c: COLORS.BRIGHT_CYAN },
        { t: 'I                    Open inventory from any screen' },
        { t: 'Up/Down or W/S       Browse items' },
        { t: 'Enter or E           Use / equip selected item' },
        { t: 'D                    Drop selected item' },
        { t: 'Escape               Close inventory' },
        { t: '' },
        { h: 'ITEM TYPES', c: COLORS.BRIGHT_YELLOW },
        { t: 'Weapons & Armor      Press E or Enter to equip' },
        { t: 'Potions & Food       Press Enter to consume' },
        { t: 'Scrolls              Press Enter to use' },
        { t: '' },
        { t: 'Your inventory holds up to 20 items.' },
        { t: 'Equipped items show in your character sheet (C).' },
        { t: '' },
        { h: 'SHOPPING', c: COLORS.BRIGHT_YELLOW },
        { t: 'Talk to a merchant and choose "Trade" to open' },
        { t: 'the shop screen.' },
        { t: '' },
        { t: 'B                    Switch to Buy tab' },
        { t: 'S                    Switch to Sell tab' },
        { t: 'Up/Down              Browse shop items' },
        { t: 'Enter                Buy or sell selected item' },
        { t: 'Escape               Leave shop (back to dialogue)' },
        { t: '' },
        { t: 'High CHA gives better prices at merchants.' },
      ],
      // 2: Explore (Overworld + Locations)
      [
        { h: 'THE WORLD', c: COLORS.BRIGHT_CYAN },
        { t: 'The realm is vast, built upon the ruins of a' },
        { t: 'fallen civilization left by the Makers. New' },
        { t: 'lands generate as you explore the unknown wilds.' },
        { t: '' },
        { h: 'TERRAIN TYPES', c: COLORS.BRIGHT_YELLOW },
        { t: '. Grassland   Open fields and meadows' },
        { t: 't Forest      Wooded area, higher encounter rate' },
        { t: 'T Deep Forest Thick woodland, harder to traverse' },
        { t: '. Barren Waste Scorched wasteland, few resources' },
        { t: '~ Mire        Marshy ground, dangerous footing' },
        { t: '~ Shallows    Shallow water, passable but slow' },
        { t: '\u2248 Deep Lake   Impassable deep water' },
        { t: '^ Mountain    Impassable rocky peaks' },
        { t: '\u25b2 High Peak   Impassable mountain summit' },
        { t: '= Road        Connects settlements' },
        { t: '' },
        { h: 'LOCATION TYPES', c: COLORS.BRIGHT_YELLOW },
        { t: '\u00b7 Village     Small hamlet with basic traders' },
        { t: 'o Town        Larger settlement, more services' },
        { t: '* City        Major center with guilds & markets' },
        { t: '\u00a4 Castle      Fortified stronghold with garrison' },
        { t: '\u2020 Temple      Healing shrine, blessings, cures' },
        { t: '\u2126 Dungeon     Dangerous, multi-room underground' },
        { t: '! Tower       Vertical dungeon with many levels' },
        { t: '\u00a7 Ruins       Crumbling ancient remains, treasure & lore' },
        { t: '\u00b0 Camp        Temporary wayfarer outpost' },
        { t: '' },
        { h: 'NAVIGATION', c: COLORS.BRIGHT_YELLOW },
        { t: 'Walk in any direction — the world has no edge.' },
        { t: 'New lands generate seamlessly as you move.' },
        { t: 'Press M to view your explored map at any time.' },
        { t: 'Roads connect nearby towns and outposts.' },
        { t: 'R rests for 8 hours, recovering HP and Mana.' },
      ],
      // 3: Dungeons & Towers
      [
        { h: 'DUNGEON CONTROLS', c: COLORS.BRIGHT_RED },
        { t: 'Arrow Keys / WASD    Move through chambers' },
        { t: 'G / ,                Pick up item on the ground' },
        { t: '< or >               Use stairs (ascend/descend)' },
        { t: 'Escape               Flee dungeon to overworld' },
        { t: '' },
        { h: 'AVAILABLE MENUS', c: COLORS.BRIGHT_YELLOW },
        { t: 'I                    Inventory' },
        { t: 'C                    Character sheet' },
        { t: 'Q                    Quest log' },
        { t: 'J                    Quest compass' },
        { t: 'O                    Settings' },
        { t: '?                    Help' },
        { t: '' },
        { h: 'DUNGEONS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Explore chambers, fight monsters, find treasure.' },
        { t: 'Step on > to descend deeper. Step on < to ascend.' },
        { t: 'Each floor gets progressively harder.' },
        { t: 'Enemies are placed in rooms — approach with care.' },
        { t: '' },
        { h: 'TOWERS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Towers have multiple pre-generated floors.' },
        { t: 'Climb via stairs to reach the summit.' },
        { t: 'Higher floors have stronger enemies and better' },
        { t: 'loot.' },
        { t: '' },
        { h: 'RUINS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Ruins hold ancient lore and hidden vaults.' },
        { t: 'Enter from the overworld with E when standing' },
        { t: 'on the ruin marker (\u00a7).' },
      ],
      // 4: Combat
      [
        { h: 'COMBAT SYSTEM', c: COLORS.BRIGHT_RED },
        { t: 'Combat is turn-based. You and the enemy take' },
        { t: 'turns choosing actions.' },
        { t: '' },
        { h: 'COMBAT CONTROLS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Up/Down or W/S       Navigate action menu' },
        { t: 'Enter / Space        Confirm selected action' },
        { t: 'A                    Attack (direct shortcut)' },
        { t: 'F                    Flee (direct shortcut)' },
        { t: '1, 2, 3              Use ability in slot 1/2/3' },
        { t: '' },
        { h: 'ACTIONS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Attack         Basic melee/ranged strike' },
        { t: 'Abilities 1-3  Special skills (cost MP)' },
        { t: 'Flee           Attempt to disengage (50% chance)' },
        { t: '' },
        { h: 'STATS & DAMAGE', c: COLORS.BRIGHT_YELLOW },
        { t: 'STR  Melee damage and carry capacity' },
        { t: 'DEX  Hit chance, dodge, flee success' },
        { t: 'CON  Max HP and poison resistance' },
        { t: 'INT  Arcane power and max MP' },
        { t: 'WIS  Magic resistance and perception' },
        { t: 'CHA  Merchant prices, dialogue options, persuasion' },
        { t: '' },
        { t: 'Damage = Attack Power - Target Defense' },
        { t: 'Critical hits deal double damage (DEX-based).' },
        { t: '' },
        { h: 'ENCOUNTERS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Hostile encounters occur while exploring.' },
        { t: 'Rate increases at night and in dangerous areas.' },
        { t: 'Dungeons have fixed enemy placements.' },
        { t: 'Failed flee = enemy gets a free attack.' },
      ],
      // 5: NPCs & Dialogue
      [
        { h: 'TALKING TO NPCS', c: COLORS.BRIGHT_CYAN },
        { t: 'Walk adjacent to an NPC and press T or Enter' },
        { t: 'to start a conversation.' },
        { t: '' },
        { h: 'DIALOGUE CONTROLS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Up/Down              Browse dialogue options' },
        { t: 'Enter                Select highlighted option' },
        { t: 'A, B, C, D           Quick-select option by letter' },
        { t: 'Escape               End conversation' },
        { t: '' },
        { h: 'NPC ROLES', c: COLORS.BRIGHT_YELLOW },
        { t: 'Merchants     Buy/sell gear (opens shop)' },
        { t: 'Innkeepers    Rest, heal, hear rumors' },
        { t: 'Guards        Bounty quests, faction info' },
        { t: 'Priests       Healing, blessings, cures' },
        { t: 'Scholars      Lore, teaching (+XP)' },
        { t: 'Townsfolk     Quests, rumors, gossip' },
        { t: '' },
        { h: 'DIALOGUE OPTIONS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Trade         Opens shop interface' },
        { t: 'Accept Quest  Takes on a new quest' },
        { t: 'Turn In Quest Completes a finished quest' },
        { t: 'Ask Rumor     Hear local gossip' },
        { t: 'Ask Lore      Learn about the location' },
        { t: 'Ask History   World history & lore' },
        { t: 'Rest at Inn   Full heal + clear ailments' },
        { t: '' },
        { h: 'SETTLEMENTS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Enter buildings with E at the door (+).' },
        { t: 'Press Escape to leave a settlement.' },
      ],
      // 6: Systems
      [
        { h: 'DAY & NIGHT', c: COLORS.BRIGHT_CYAN },
        { t: 'Time advances as you move (0.5h per step) and' },
        { t: 'when you rest (R = 8 hours). The HUD shows the' },
        { t: 'time of day and sun/moon cycle.' },
        { t: 'Night: higher encounter rate, shops close.' },
        { t: 'Night travel without a light source may cause' },
        { t: 'you to stumble in a random direction.' },
        { t: '' },
        { h: 'WEATHER', c: COLORS.BRIGHT_CYAN },
        { t: 'Conditions change by region: rain, snow, storms,' },
        { t: 'fog, sandstorms. Affects visibility in dungeons' },
        { t: 'and encounter rates.' },
        { t: '' },
        { h: 'FACTIONS (F)', c: COLORS.BRIGHT_CYAN },
        { t: 'Eight factions track your reputation. Clearing' },
        { t: 'monsters improves guard and merchant standing.' },
        { t: 'Standings: Hostile < Unfriendly < Neutral' },
        { t: '           < Friendly < Allied' },
        { t: '' },
        { h: 'QUESTS (Q)', c: COLORS.BRIGHT_CYAN },
        { t: 'Accept quests from townsfolk. Track objectives' },
        { t: 'and rewards in the quest log. Some quests are' },
        { t: 'generated from world events (treasure maps, etc).' },
        { t: 'Use J to open the quest compass for navigation.' },
        { t: '' },
        { h: 'WORLD EVENTS', c: COLORS.BRIGHT_CYAN },
        { t: 'Festivals, plagues, monster incursions, magical' },
        { t: 'darkness, caravans, and bandit raids occur over' },
        { t: 'time. Events affect prices and more.' },
        { t: '' },
        { h: 'SETTINGS (O)', c: COLORS.BRIGHT_CYAN },
        { t: '1  Toggle CRT effects on/off' },
        { t: '2  Cycle font size (12-20)' },
        { t: '3  Toggle touch controls' },
        { t: '4  Cycle auto-save interval (50/100/200/500)' },
        { t: '5  Toggle CRT glow (when CRT on)' },
        { t: '6  Toggle CRT scanlines (when CRT on)' },
        { t: '7  Toggle CRT aberration (when CRT on)' },
      ],
      // 7: Tips / About
      [
        { h: 'GETTING STARTED', c: COLORS.BRIGHT_GREEN },
        { t: 'You begin in a village. Talk to the townsfolk for' },
        { t: 'quests and visit merchants to gear up before' },
        { t: 'venturing into the uncharted wilds.' },
        { t: '' },
        { h: 'SURVIVAL TIPS', c: COLORS.BRIGHT_GREEN },
        { t: '- Save often with P. There is no resurrection.' },
        { t: '- Rest (R) to recover HP and MP between fights.' },
        { t: '- Carry healing potions for emergencies.' },
        { t: '- Check your character sheet (C) after leveling.' },
        { t: '- Equip better gear from your inventory (I, E).' },
        { t: '- Drop (D) items you don\'t need to free space.' },
        { t: '' },
        { h: 'EXPLORATION', c: COLORS.BRIGHT_GREEN },
        { t: '- Follow roads to find nearby settlements.' },
        { t: '- The world is vast — explore in any direction.' },
        { t: '- Discovered locations are marked on the map (M).' },
        { t: '- Dungeons and towers have the best treasure.' },
        { t: '- Ruins contain ancient lore and hidden vaults.' },
        { t: '- Carry a light source for safer night travel.' },
        { t: '' },
        { h: 'ECONOMY', c: COLORS.BRIGHT_GREEN },
        { t: '- Festival events reduce merchant prices.' },
        { t: '- High CHA gives better deals and more options.' },
        { t: '- Sell loot you don\'t need to fund upgrades.' },
        { t: '- Switch tabs with B/S in shops to buy or sell.' },
        { t: '' },
        { h: 'THE WORLD', c: COLORS.BRIGHT_GREEN },
        { t: 'Generations ago, the Makers vanished, leaving' },
        { t: 'behind vast ruins and forgotten knowledge. You' },
        { t: 'are a wanderer in a world built upon the bones' },
        { t: 'of a civilization no one remembers, seeking' },
        { t: 'fortune in the ruins of the old world.' },
      ],
    ];

    const page = pages[tab] || pages[0];
    const scroll = this.helpScroll || 0;
    const visibleLines = page.slice(scroll, scroll + contentH);

    for (let i = 0; i < visibleLines.length; i++) {
      const line = visibleLines[i];
      if (line.h) {
        r.drawString(px + 2, contentY + i, line.h, line.c || COLORS.BRIGHT_WHITE, bg, w);
      } else if (line.t !== undefined) {
        r.drawString(px + 2, contentY + i, line.t, COLORS.WHITE, bg, w);
      }
    }

    // Scroll indicators
    if (scroll > 0) {
      r.drawString(px + panelW - 4, contentY, ' \u25b2 ', COLORS.BRIGHT_WHITE, bg);
    }
    if (scroll + contentH < page.length) {
      r.drawString(px + panelW - 4, contentY + contentH - 1, ' \u25bc ', COLORS.BRIGHT_WHITE, bg);
    }

    r.drawString(px + 2, py + panelH - 1,
      '1-8:Tab  Arrows:Scroll  Esc:Close', COLORS.BRIGHT_BLACK, bg, panelW - 4);
  }

  // ─── SETTINGS (FF-style Config) ───

  drawSettings(settings) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 4, 50);
    const panelH = settings.crtEffects ? 28 : 20;
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Config ');

    const items = [
      { key: '1', label: 'CRT Effects', value: settings.crtEffects ? 'ON' : 'OFF', color: settings.crtEffects ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
      { key: '2', label: 'Font Size', value: `${settings.fontSize}px`, color: COLORS.BRIGHT_YELLOW },
      { key: '3', label: 'Touch Controls', value: settings.touchControls ? 'ON' : 'OFF', color: settings.touchControls ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
      { key: '4', label: 'Auto-Save', value: `${settings.autoSaveInterval} turns`, color: COLORS.BRIGHT_YELLOW },
      { key: '5', label: 'Quest Nav', value: settings.showQuestNav !== false ? 'ON' : 'OFF', color: settings.showQuestNav !== false ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
    ];

    let curY = py + 2;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      r.drawString(px + 3, curY, `[${item.key}]`, COLORS.BRIGHT_WHITE, bg);
      r.drawString(px + 7, curY, item.label, COLORS.WHITE, bg);
      r.drawString(px + panelW - item.value.length - 3, curY, item.value, item.color, bg);
      curY += 2;
    }

    // Export/Import separator
    r.drawString(px + 1, curY, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);
    curY += 1;
    const exportItems = [
      { key: '9', label: 'Export Save', value: '', color: COLORS.BRIGHT_CYAN },
      { key: '0', label: 'Import Save', value: '', color: COLORS.BRIGHT_CYAN },
    ];
    for (const item of exportItems) {
      r.drawString(px + 3, curY, `[${item.key}]`, COLORS.BRIGHT_WHITE, bg);
      r.drawString(px + 7, curY, item.label, COLORS.WHITE, bg);
      curY += 2;
    }

    if (settings.crtEffects) {
      r.drawString(px + 1, curY, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);
      curY += 1;
      r.drawString(px + 3, curY, 'CRT Options', COLORS.BRIGHT_CYAN, bg);
      curY += 1;

      const subItems = [
        { key: '6', label: 'Phosphor Glow', value: settings.crtGlow !== false ? 'ON' : 'OFF', color: settings.crtGlow !== false ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
        { key: '7', label: 'Scanlines', value: settings.crtScanlines !== false ? 'ON' : 'OFF', color: settings.crtScanlines !== false ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
        { key: '8', label: 'Chroma Aberr.', value: settings.crtAberration !== false ? 'ON' : 'OFF', color: settings.crtAberration !== false ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
      ];

      for (const item of subItems) {
        r.drawString(px + 5, curY, `[${item.key}]`, COLORS.WHITE, bg);
        r.drawString(px + 9, curY, item.label, COLORS.BRIGHT_BLACK, bg);
        r.drawString(px + panelW - item.value.length - 3, curY, item.value, item.color, bg);
        curY += 1;
      }
    }

    r.drawString(px + 2, py + panelH - 2, 'Press key to toggle  Esc:Close', COLORS.BRIGHT_BLACK, bg, panelW - 4);
  }

  // ─── CONFIRM DIALOG (FF-style) ───

  drawConfirmDialog(message, options) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 8, 40);
    const panelH = 8;
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg);
    const lines = wordWrap(message, panelW - 4);
    for (let i = 0; i < lines.length; i++) {
      r.drawString(px + 2, py + 2 + i, lines[i], COLORS.BRIGHT_WHITE, bg);
    }

    const optStr = options || 'Yes / No';
    r.drawString(px + Math.floor((panelW - optStr.length) / 2), py + panelH - 2,
      optStr, COLORS.BRIGHT_WHITE, bg);
  }

  // ─── WORLD GEN VERBOSE DISPLAY ───

  drawWorldGen(events, stats, currentEra, phase) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.BLACK;
    r.clear();

    const t = Date.now();

    // ─ Top bar: Title + current era ─
    r.drawString(1, 0, '╔' + '═'.repeat(cols - 2) + '╗', COLORS.FF_BORDER, bg);
    const title = ' WORLD GENESIS ';
    r.drawString(Math.floor((cols - title.length) / 2), 0, title, COLORS.BRIGHT_YELLOW, bg);
    r.drawString(1, 1, '║', COLORS.FF_BORDER, bg);
    r.drawString(cols - 1, 1, '║', COLORS.FF_BORDER, bg);

    if (currentEra) {
      const eraText = currentEra;
      r.drawString(3, 1, eraText, COLORS.BRIGHT_CYAN, bg, cols - 6);
    } else if (phase) {
      r.drawString(3, 1, phase, COLORS.BRIGHT_CYAN, bg, cols - 6);
    }

    r.drawString(1, 2, '╠' + '═'.repeat(cols - 2) + '╣', COLORS.FF_BORDER, bg);

    // ─ Layout: left = events timeline, right = stats sidebar ─
    const sidebarW = Math.min(28, Math.floor(cols * 0.3));
    const timelineW = cols - sidebarW - 4;
    const contentTop = 3;
    const contentBottom = rows - 2;
    const contentH = contentBottom - contentTop;

    // Category → color mapping
    const catColor = (cat) => {
      switch (cat) {
        case 'war': return COLORS.BRIGHT_RED;
        case 'catastrophe': return COLORS.BRIGHT_YELLOW;
        case 'figure': return COLORS.BRIGHT_CYAN;
        case 'artifact': return COLORS.BRIGHT_MAGENTA;
        case 'treaty': return COLORS.BRIGHT_GREEN;
        case 'religion': return COLORS.WHITE;
        case 'civ': return COLORS.BRIGHT_WHITE;
        case 'tech': return COLORS.BRIGHT_BLUE;
        case 'era': return COLORS.BRIGHT_YELLOW;
        case 'territory': return COLORS.GREEN;
        default: return COLORS.BRIGHT_BLACK;
      }
    };

    // ─ Events timeline (left panel) ─
    const maxVisible = contentH;
    const startIdx = Math.max(0, events.length - maxVisible);
    for (let i = startIdx; i < events.length; i++) {
      const ev = events[i];
      const y = contentTop + (i - startIdx);
      if (y >= contentBottom) break;

      // Year column
      const yearStr = ev.year !== undefined ? String(ev.year).padStart(5, ' ') : '     ';
      r.drawString(2, y, yearStr, COLORS.BRIGHT_BLACK, bg);
      r.drawString(7, y, '│', COLORS.FF_BORDER, bg);

      // Event text with category color
      const maxTextW = timelineW - 8;
      const text = ev.description.substring(0, maxTextW);
      const color = catColor(ev.category);
      // Fade older events
      const age = events.length - i;
      const finalColor = age <= 1 ? color : (age <= 3 ? color : COLORS.BRIGHT_BLACK);
      r.drawString(9, y, text, finalColor, bg, maxTextW);
    }

    // ─ Sidebar separator ─
    const sideX = cols - sidebarW - 1;
    for (let y = contentTop; y < contentBottom; y++) {
      r.drawString(sideX, y, '│', COLORS.FF_BORDER, bg);
    }

    // ─ Stats sidebar (right panel) ─
    const sx = sideX + 2;
    let sy = contentTop;
    const statLine = (label, value, color = COLORS.BRIGHT_WHITE) => {
      if (sy < contentBottom) {
        r.drawString(sx, sy, label, COLORS.BRIGHT_BLACK, bg, sidebarW - 3);
        r.drawString(sx, sy + 1, String(value), color, bg, sidebarW - 3);
        sy += 3;
      }
    };

    // Animated year counter
    const yearDisplay = stats.currentYear || 0;
    r.drawString(sx, sy, 'YEAR', COLORS.BRIGHT_BLACK, bg);
    sy++;
    r.drawString(sx, sy, String(yearDisplay), COLORS.BRIGHT_YELLOW, bg, sidebarW - 3);
    sy += 2;

    r.drawString(sx, sy, '─'.repeat(sidebarW - 3), COLORS.FF_BORDER, bg); sy++;

    statLine('Civilizations', `${stats.activeCivs || 0} alive / ${stats.fallenCivs || 0} fallen`, COLORS.BRIGHT_GREEN);
    statLine('Wars', String(stats.wars || 0), COLORS.BRIGHT_RED);
    statLine('Figures', String(stats.figures || 0), COLORS.BRIGHT_CYAN);
    statLine('Artifacts', String(stats.artifacts || 0), COLORS.BRIGHT_MAGENTA);
    statLine('Catastrophes', String(stats.catastrophes || 0), COLORS.BRIGHT_YELLOW);
    statLine('Treaties', String(stats.treaties || 0), COLORS.BRIGHT_GREEN);

    if (stats.totalPop > 0) {
      statLine('Population', stats.totalPop.toLocaleString(), COLORS.BRIGHT_WHITE);
    }

    // ─ Bottom bar ─
    r.drawString(1, rows - 1, '╚' + '═'.repeat(cols - 2) + '╝', COLORS.FF_BORDER, bg);

    // Animated loading dots
    const dots = '.'.repeat(Math.floor(t / 400) % 4);
    const phaseText = phase || 'Generating';
    r.drawString(3, rows - 1, ` ${phaseText}${dots} `, COLORS.BRIGHT_CYAN, bg);
  }

  // ─── QUEST COMPASS / GUIDANCE SCREEN ───

  drawQuestCompass(quest, playerPos, targetPos, activeQuests, selectedQuestIdx, time) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    r.clear();

    const panelW = Math.min(cols - 2, 70);
    const panelH = Math.min(rows - 2, 35);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Quest Compass ');

    if (!quest || !targetPos) {
      r.drawString(px + 4, py + 4, 'No active quest with a known location.', COLORS.BRIGHT_BLACK, bg);
      r.drawString(px + 2, py + panelH - 1, 'Esc:Close', COLORS.BRIGHT_BLACK, bg);
      return;
    }

    // ─ Quest info header ─
    let y = py + 2;
    r.drawString(px + 2, y, quest.title, COLORS.BRIGHT_WHITE, bg, panelW - 4); y++;
    if (quest.objectives && quest.objectives.length > 0) {
      const obj = quest.objectives[0];
      r.drawString(px + 4, y, obj.description, COLORS.BRIGHT_BLACK, bg, panelW - 6); y++;
    }

    // ─ Direction calculation ─
    const dx = targetPos.x - playerPos.x;
    const dy = targetPos.y - playerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx); // radians, 0=east, PI/2=south

    y++;
    r.drawString(px + 1, y, '─'.repeat(panelW - 2), COLORS.FF_BORDER, bg); y++;

    // ─ Distance display ─
    const distText = dist < 10 ? 'Very Close' : dist < 30 ? 'Nearby' : dist < 80 ? 'Moderate Distance' : dist < 200 ? 'Far Away' : 'Very Distant';
    r.drawString(px + 2, y, `Distance: ${Math.round(dist)} tiles (${distText})`, COLORS.BRIGHT_YELLOW, bg, panelW - 4); y++;
    y++;

    // ─ Animated compass ─
    const compassSize = 13;
    const compassCX = px + Math.floor(panelW / 2);
    const compassCY = y + Math.floor(compassSize / 2);

    // Floating offset (pseudo-3D bob)
    const bobOffset = Math.sin(time / 800) * 0.8;
    const floatY = Math.round(bobOffset);

    // Compass ring using gradient characters for pseudo-3D
    const ringRadius = 5;
    const ringChars = ['░', '▒', '▓', '█', '▓', '▒', '░'];

    // Draw outer ring
    for (let a = 0; a < 32; a++) {
      const ra = (a / 32) * Math.PI * 2 - Math.PI / 2;
      const rx = Math.round(Math.cos(ra) * ringRadius);
      const ry = Math.round(Math.sin(ra) * (ringRadius * 0.6)); // squash for perspective
      const depthIdx = Math.floor(((Math.sin(ra) + 1) / 2) * (ringChars.length - 1));
      const ch = ringChars[depthIdx];
      const cCol = compassCX + rx;
      const cRow = compassCY + ry + floatY;
      if (cCol > px && cCol < px + panelW - 1 && cRow > py && cRow < py + panelH - 2) {
        // Pulse color
        const pulse = Math.sin(time / 300 + a * 0.2) * 0.5 + 0.5;
        const ringColor = pulse > 0.6 ? COLORS.BRIGHT_CYAN : COLORS.CYAN;
        r.drawChar(cCol, cRow, ch, ringColor, bg);
      }
    }

    // Cardinal direction labels
    const cardinals = [
      { label: 'N', angle: -Math.PI / 2, offX: 0, offY: -ringRadius - 1 },
      { label: 'S', angle: Math.PI / 2, offX: 0, offY: Math.round(ringRadius * 0.6) + 1 },
      { label: 'E', angle: 0, offX: ringRadius + 2, offY: 0 },
      { label: 'W', angle: Math.PI, offX: -ringRadius - 2, offY: 0 },
    ];
    for (const c of cardinals) {
      const lx = compassCX + c.offX;
      const ly = compassCY + c.offY + floatY;
      if (lx > px && lx < px + panelW - 1 && ly > py && ly < py + panelH - 2) {
        r.drawChar(lx, ly, c.label, COLORS.BRIGHT_WHITE, bg);
      }
    }

    // Center jewel
    const jewelChars = ['◆', '◇', '◆', '◈'];
    const jewel = jewelChars[Math.floor(time / 500) % jewelChars.length];
    r.drawChar(compassCX, compassCY + floatY, jewel, COLORS.BRIGHT_CYAN, bg);

    // ─ Needle pointing toward target ─
    // Gentle oscillation on the needle
    const needleAngle = angle + Math.sin(time / 600) * 0.05;
    const needleLen = ringRadius - 1;

    // Arrow head characters based on direction
    const arrowHeads = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const headIdx = Math.round(((needleAngle + Math.PI) / (Math.PI * 2)) * 8) % 8;
    // Remap: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
    const arrowHead = arrowHeads[headIdx];

    // Draw needle line from center outward
    const steps = needleLen;
    for (let s = 1; s <= steps; s++) {
      const frac = s / steps;
      const nx = Math.round(Math.cos(needleAngle) * s);
      const ny = Math.round(Math.sin(needleAngle) * (s * 0.6)); // perspective squash
      const ncx = compassCX + nx;
      const ncy = compassCY + ny + floatY;
      if (ncx > px && ncx < px + panelW - 1 && ncy > py && ncy < py + panelH - 2) {
        // Needle color pulses
        const nPulse = Math.sin(time / 200 + frac * 3) * 0.5 + 0.5;
        const needleColor = nPulse > 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.YELLOW;
        const ch = s === steps ? arrowHead : (Math.abs(nx) > Math.abs(ny) ? '─' : '│');
        r.drawChar(ncx, ncy, ch, needleColor, bg);
      }
    }

    // ─ Floating star particles for space effect ─
    for (let i = 0; i < 12; i++) {
      const starPhase = (time / 1000 + i * 1.7) % 3;
      if (starPhase < 0.3) {
        const sx = px + 3 + Math.floor(Math.abs(Math.sin(i * 7.3)) * (panelW - 6));
        const sy2 = py + 3 + Math.floor(Math.abs(Math.cos(i * 5.1)) * (panelH - 8));
        if (sx > px && sx < px + panelW - 1 && sy2 > py && sy2 < py + panelH - 2) {
          const starChar = Math.floor(time / 300 + i) % 2 === 0 ? '·' : '∙';
          r.drawChar(sx, sy2, starChar, COLORS.BRIGHT_BLACK, bg);
        }
      }
    }

    // ─ Direction text below compass ─
    const dirY = compassCY + Math.round(ringRadius * 0.6) + 3 + floatY;
    const dirNames = ['East', 'South-East', 'South', 'South-West', 'West', 'North-West', 'North', 'North-East'];
    const dirName = dirNames[headIdx];
    if (dirY < py + panelH - 3) {
      const dirText = `Heading: ${dirName}`;
      r.drawString(px + Math.floor((panelW - dirText.length) / 2), dirY, dirText, COLORS.BRIGHT_WHITE, bg);
    }

    // ─ Quest list at bottom (cycle with Up/Down) ─
    const listY = py + panelH - 4;
    if (activeQuests && activeQuests.length > 1) {
      r.drawString(px + 1, listY - 1, '─'.repeat(panelW - 2), COLORS.FF_BORDER, bg);
      r.drawString(px + 2, listY, `Quest ${selectedQuestIdx + 1}/${activeQuests.length} (↑↓ to cycle)`,
        COLORS.BRIGHT_BLACK, bg, panelW - 4);
    }

    // ─ Controls ─
    r.drawString(px + 2, py + panelH - 1, 'Esc:Close', COLORS.BRIGHT_BLACK, bg);
    if (activeQuests && activeQuests.length > 1) {
      r.drawString(px + panelW - 16, py + panelH - 1, '↑↓:Switch Quest', COLORS.BRIGHT_BLACK, bg);
    }
  }

  // ─── LOADING SCREEN (FF-style) ───

  drawLoading(message, logLines = []) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    r.clear();

    const t = Date.now() / 300;
    // FF-style spinning crystal loading
    const crystalFrames = ['\u25C6', '\u25C7', '\u25C6', '\u25C7']; // ◆ ◇
    const crystal = crystalFrames[Math.floor(t) % crystalFrames.length];

    const title = 'ASCIIQUEST';
    r.drawString(Math.floor((cols - title.length) / 2), 2, title, COLORS.BRIGHT_WHITE);

    // Loading indicator
    const barY = 4;
    r.drawString(Math.floor((cols - message.length) / 2) - 2, barY,
      crystal + ' ' + message + ' ' + crystal, COLORS.BRIGHT_CYAN);

    // Progress dots animation
    const dots = '.'.repeat(Math.floor(t) % 4);
    r.drawString(Math.floor((cols - message.length) / 2) + message.length + 2, barY,
      dots, COLORS.BRIGHT_WHITE);

    // Log lines — show as many as the screen can fit, auto-scrolling
    const logStartY = 6;
    const maxLines = Math.min(logLines.length, rows - logStartY - 1);
    const startIdx = Math.max(0, logLines.length - maxLines);
    for (let i = startIdx; i < logLines.length; i++) {
      const line = logLines[i];
      const y = logStartY + (i - startIdx);
      if (y >= rows - 1) break;
      const color = line.color || (i === logLines.length - 1 ? COLORS.BRIGHT_CYAN : COLORS.BRIGHT_BLACK);
      r.drawString(2, y, line.text, color, COLORS.BLACK, cols - 4);
    }
  }

  // ─── UTILITIES ───

  handleMenuInput(key, itemCount) {
    if (key === 'ArrowUp' || key === 'w') {
      this.selectedIndex = (this.selectedIndex - 1 + itemCount) % itemCount;
      return 'move';
    }
    if (key === 'ArrowDown' || key === 's') {
      this.selectedIndex = (this.selectedIndex + 1) % itemCount;
      return 'move';
    }
    if (key === 'Enter' || key === ' ') {
      return 'select';
    }
    if (key === 'Escape') {
      return 'back';
    }
    return null;
  }

  scrollMessages(delta) {
    this.messageScroll = Math.max(0,
      Math.min(this.messageScroll + delta, this.messageLog.length - this.visibleMessages));
  }

  resetSelection() {
    this.selectedIndex = 0;
  }

  // ─── DEBUG MENU (in-game, canvas-rendered) ───

  drawDebugMenu(debug, player, timeSystem, weatherSystem, gameState, turnCount) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 72);
    const panelH = Math.min(rows - 2, 38);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);
    const bg = COLORS.FF_BLUE_DARK;
    const w = panelW - 4;

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Debug Menu ');

    // Tab bar
    const tabs = ['Cheats', 'World', 'Visual', 'Info'];
    const tab = this.debugTab || 0;
    const tabLabels = tabs.map((t, i) => `[${i + 1}]${t}`);
    const totalTabLen = tabLabels.reduce((s, l) => s + l.length, 0) + tabLabels.length - 1;
    let tx = px + 2 + Math.floor((w - totalTabLen) / 2);
    for (let i = 0; i < tabLabels.length; i++) {
      const color = i === tab ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
      r.drawString(tx, py + 1, tabLabels[i], color, bg);
      tx += tabLabels[i].length + 1;
    }
    r.drawString(px + 1, py + 2, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);

    const contentY = py + 3;
    const contentH = panelH - 5;
    const cursor = this.debugCursor || 0;

    // Build entries for current tab
    let entries = [];
    if (tab === 0) {
      // Cheats tab
      entries = [
        { type: 'toggle', label: 'Invincible', key: 'invincible', value: debug.invincible },
        { type: 'toggle', label: 'No Encounters', key: 'noEncounters', value: debug.noEncounters },
        { type: 'toggle', label: 'Infinite Attack', key: 'infiniteAttack', value: debug.infiniteAttack },
        { type: 'toggle', label: 'Infinite Mana', key: 'infiniteMana', value: debug.infiniteMana },
        { type: 'toggle', label: 'No Clip', key: 'noClip', value: debug.noClip },
        { type: 'sep' },
        { type: 'action', label: 'Full Heal', key: 'fullHeal' },
        { type: 'action', label: '+100 XP', key: 'giveXP' },
        { type: 'action', label: '+100 Gold', key: 'giveGold' },
        { type: 'action', label: 'Level Up', key: 'levelUp' },
        { type: 'sep' },
        { type: 'action', label: 'Give Torch', key: 'giveTorch' },
        { type: 'action', label: 'Give Lantern', key: 'giveLantern' },
        { type: 'action', label: 'Give Weapon', key: 'giveWeapon' },
        { type: 'action', label: 'Give Potion', key: 'givePotion' },
        { type: 'action', label: 'Give Scroll', key: 'giveScroll' },
        { type: 'action', label: 'Give Food', key: 'giveFood' },
        { type: 'action', label: 'Give Helmet', key: 'giveHelmet' },
        { type: 'action', label: 'Give Chestplate', key: 'giveChest' },
        { type: 'action', label: 'Give Gloves', key: 'giveGloves' },
        { type: 'action', label: 'Give Leggings', key: 'giveLegs' },
        { type: 'action', label: 'Give Boots', key: 'giveBoots' },
        { type: 'action', label: 'Give Shield', key: 'giveShield' },
        { type: 'action', label: 'Give Ring', key: 'giveRing' },
        { type: 'action', label: 'Give Amulet', key: 'giveAmulet' },
        { type: 'action', label: 'Give Artifact', key: 'giveArtifact' },
        { type: 'action', label: 'Clear Inventory', key: 'clearInv' },
      ];
    } else if (tab === 1) {
      // World tab
      entries = [
        { type: 'action', label: 'Reveal Map', key: 'revealMap' },
        { type: 'action', label: 'Advance Day (+24h)', key: 'advanceDay' },
        { type: 'sep' },
        { type: 'slider', label: 'Hour', key: 'hour', value: timeSystem ? timeSystem.hour : 0, min: 0, max: 23 },
        { type: 'sep' },
        { type: 'select', label: 'Weather', key: 'weather', value: weatherSystem ? weatherSystem.current : 'clear',
          options: ['auto','clear','rain','storm','fog','snow','sandstorm','acid_rain','coolant_mist','spore_fall','ember_rain','data_storm','nano_haze','ion_storm','blood_rain'] },
        { type: 'sep' },
        { type: 'action', label: 'Teleport to 50,30', key: 'teleport' },
      ];
    } else if (tab === 2) {
      // Visual tab
      entries = [
        { type: 'toggle', label: 'Disable Shadows', key: 'disableShadows', value: debug.disableShadows },
        { type: 'toggle', label: 'Disable Lighting', key: 'disableLighting', value: debug.disableLighting },
        { type: 'toggle', label: 'Disable Clouds', key: 'disableClouds', value: debug.disableClouds },
        { type: 'toggle', label: 'CRT Effects', key: 'crtEffects', value: r.effectsEnabled },
      ];
    } else if (tab === 3) {
      // Info tab
      const lines = [
        `State: ${gameState}`,
        `Turn: ${turnCount}`,
      ];
      if (timeSystem) {
        lines.push(`Time: ${timeSystem.getTimeString()} (${timeSystem.getTimeOfDay()})`);
      }
      if (weatherSystem) {
        lines.push(`Weather: ${weatherSystem.current}`);
      }
      if (player) {
        lines.push(`Pos: (${player.position.x}, ${player.position.y})`);
        lines.push(`HP: ${player.stats.hp}/${player.stats.maxHp}  MP: ${player.stats.mana}/${player.stats.maxMana}`);
        lines.push(`Lv: ${player.stats.level}  XP: ${player.stats.xp}/${player.stats.xpToNext}`);
        lines.push(`Gold: ${player.gold}  Items: ${player.inventory.length}/20`);
        const lightInfo = player.hasLightSource();
        lines.push(`Light: ${lightInfo.hasLight ? lightInfo.type : 'none'}`);
      }
      lines.push('');
      lines.push(`Invincible: ${debug.invincible}`);
      lines.push(`No Encounters: ${debug.noEncounters}`);
      lines.push(`Inf Attack: ${debug.infiniteAttack}`);
      lines.push(`Inf Mana: ${debug.infiniteMana}`);
      lines.push('');
      lines.push(`Messages: ${this.messageLog.length}`);
      lines.push(`FPS: ${(1000 / 16.67).toFixed(0)}`);

      for (let i = 0; i < lines.length && i < contentH; i++) {
        r.drawString(px + 2, contentY + i, lines[i], COLORS.BRIGHT_GREEN, bg, w);
      }
      // Footer
      r.drawString(px + 2, py + panelH - 2,
        'L:Console Log  1-4:Tab  Esc:Close', COLORS.BRIGHT_BLACK, bg, w);
      return;
    }

    // Auto-scroll: find the row index in the full entries array for the current cursor
    // Cursor is in terms of selectables only; map it to full-array index
    let cursorFullIdx = 0;
    {
      let selCount = 0;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].type !== 'sep') {
          if (selCount === cursor) { cursorFullIdx = i; break; }
          selCount++;
        }
      }
    }
    // Adjust scroll to keep cursor visible
    let scroll = this.debugScroll || 0;
    if (cursorFullIdx < scroll) scroll = cursorFullIdx;
    if (cursorFullIdx >= scroll + contentH) scroll = cursorFullIdx - contentH + 1;
    scroll = Math.max(0, Math.min(scroll, entries.length - contentH));
    this.debugScroll = scroll;

    // Render selectable entries
    let drawY = contentY;
    // Count selectables before scroll to compute cursor offset
    let selectablesBefore = 0;
    for (let i = 0; i < scroll; i++) {
      if (entries[i].type !== 'sep') selectablesBefore++;
    }

    for (let ei = scroll; ei < entries.length && drawY < contentY + contentH; ei++) {
      const entry = entries[ei];
      if (entry.type === 'sep') {
        r.drawString(px + 2, drawY, '\u2500'.repeat(w), COLORS.BRIGHT_BLACK, bg);
        drawY++;
        continue;
      }

      const itemIdx = selectablesBefore;
      selectablesBefore++;
      const isCursor = itemIdx === cursor;
      const ptr = isCursor ? '\u25BA ' : '  ';
      const fg = isCursor ? COLORS.BRIGHT_WHITE : COLORS.WHITE;

      if (entry.type === 'toggle') {
        const state = entry.value ? '[ON]' : '[OFF]';
        const stateColor = entry.value ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED;
        r.drawString(px + 2, drawY, ptr + entry.label, fg, bg, w - 6);
        r.drawString(px + panelW - 7, drawY, state, stateColor, bg);
      } else if (entry.type === 'action') {
        r.drawString(px + 2, drawY, ptr + entry.label, fg, bg, w);
      } else if (entry.type === 'slider') {
        const valStr = `<${entry.value}>`;
        r.drawString(px + 2, drawY, ptr + entry.label, fg, bg, w - valStr.length - 2);
        r.drawString(px + panelW - valStr.length - 3, drawY, valStr, COLORS.BRIGHT_YELLOW, bg);
      } else if (entry.type === 'select') {
        const valStr = `<${entry.value}>`;
        r.drawString(px + 2, drawY, ptr + entry.label, fg, bg, w - valStr.length - 2);
        r.drawString(px + panelW - valStr.length - 3, drawY, valStr, COLORS.BRIGHT_CYAN, bg);
      }
      drawY++;
    }

    // Scroll indicators
    if (scroll > 0) {
      r.drawString(px + panelW - 4, contentY, ' \u25b2 ', COLORS.BRIGHT_WHITE, bg);
    }
    if (scroll + contentH < entries.length) {
      r.drawString(px + panelW - 4, contentY + contentH - 1, ' \u25bc ', COLORS.BRIGHT_WHITE, bg);
    }

    // Footer
    r.drawString(px + 2, py + panelH - 2,
      'L:Console Log  1-4:Tab  Enter:Toggle  Esc:Close', COLORS.BRIGHT_BLACK, bg, w);
  }

  /**
   * Get the current debug tab entries (for input handling).
   */
  getDebugEntries(debug, timeSystem, weatherSystem, renderer) {
    const tab = this.debugTab || 0;
    if (tab === 0) {
      return [
        { type: 'toggle', key: 'invincible' },
        { type: 'toggle', key: 'noEncounters' },
        { type: 'toggle', key: 'infiniteAttack' },
        { type: 'toggle', key: 'infiniteMana' },
        { type: 'toggle', key: 'noClip' },
        { type: 'action', key: 'fullHeal' },
        { type: 'action', key: 'giveXP' },
        { type: 'action', key: 'giveGold' },
        { type: 'action', key: 'levelUp' },
        { type: 'action', key: 'giveTorch' },
        { type: 'action', key: 'giveLantern' },
        { type: 'action', key: 'giveWeapon' },
        { type: 'action', key: 'givePotion' },
        { type: 'action', key: 'giveScroll' },
        { type: 'action', key: 'giveFood' },
        { type: 'action', key: 'giveHelmet' },
        { type: 'action', key: 'giveChest' },
        { type: 'action', key: 'giveGloves' },
        { type: 'action', key: 'giveLegs' },
        { type: 'action', key: 'giveBoots' },
        { type: 'action', key: 'giveShield' },
        { type: 'action', key: 'giveRing' },
        { type: 'action', key: 'giveAmulet' },
        { type: 'action', key: 'giveArtifact' },
        { type: 'action', key: 'clearInv' },
      ];
    } else if (tab === 1) {
      return [
        { type: 'action', key: 'revealMap' },
        { type: 'action', key: 'advanceDay' },
        { type: 'slider', key: 'hour', value: timeSystem ? timeSystem.hour : 0, min: 0, max: 23 },
        { type: 'select', key: 'weather', value: weatherSystem ? weatherSystem.current : 'clear',
          options: ['auto','clear','rain','storm','fog','snow','sandstorm','acid_rain','coolant_mist','spore_fall','ember_rain','data_storm','nano_haze','ion_storm','blood_rain'] },
        { type: 'action', key: 'teleport' },
      ];
    } else if (tab === 2) {
      return [
        { type: 'toggle', key: 'disableShadows' },
        { type: 'toggle', key: 'disableLighting' },
        { type: 'toggle', key: 'disableClouds' },
        { type: 'toggle', key: 'crtEffects' },
      ];
    }
    return [];
  }

  // ─── ALMANAC (World History Viewer) ───

  drawAlmanac(worldHistoryGen, messageLog) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 80);
    const panelH = Math.min(rows - 2, 42);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);
    const bg = COLORS.FF_BLUE_DARK;

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Almanac ');

    // Tab bar (same pattern as drawHelp)
    const tabs = ['Preamble', 'Timeline', 'Civs', 'Figures', 'Artifacts', 'Log'];
    const tab = this.almanacTab || 0;
    const usableW = panelW - 4;
    const tabLabels = tabs.map((t, i) => `[${i + 1}]${t}`);

    const tabRows = [];
    let currentRow = [];
    let currentRowLen = 0;
    for (let i = 0; i < tabLabels.length; i++) {
      const labelLen = tabLabels[i].length;
      const needed = currentRow.length > 0 ? labelLen + 1 : labelLen;
      if (currentRowLen + needed > usableW && currentRow.length > 0) {
        tabRows.push(currentRow);
        currentRow = [i];
        currentRowLen = labelLen;
      } else {
        currentRow.push(i);
        currentRowLen += needed;
      }
    }
    if (currentRow.length > 0) tabRows.push(currentRow);

    for (let rowIdx = 0; rowIdx < tabRows.length; rowIdx++) {
      const rowIndices = tabRows[rowIdx];
      const totalLen = rowIndices.reduce((sum, i) => sum + tabLabels[i].length, 0) + (rowIndices.length - 1);
      const startX = px + 2 + Math.floor((usableW - totalLen) / 2);
      let tx = startX;
      for (const i of rowIndices) {
        const label = tabLabels[i];
        const color = i === tab ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
        r.drawString(tx, py + 1 + rowIdx, label, color, bg);
        tx += label.length + 1;
      }
    }
    const tabBarHeight = tabRows.length;
    r.drawString(px + 1, py + 1 + tabBarHeight, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);

    const contentY = py + 2 + tabBarHeight;
    const contentH = panelH - 4 - tabBarHeight;
    const w = panelW - 4;

    // Build content lines: array of { t: string, c: color }
    const lines = [];
    const addLine = (text, color) => lines.push({ t: text || '', c: color || COLORS.WHITE });
    const addHeader = (text, color) => lines.push({ t: text, c: color || COLORS.BRIGHT_YELLOW });
    const addBlank = () => lines.push({ t: '', c: COLORS.WHITE });

    const summary = worldHistoryGen ? worldHistoryGen.getSummary() : null;

    if (!summary) {
      addLine('No world history available.', COLORS.BRIGHT_BLACK);
      addLine('Start a new game to generate history.', COLORS.BRIGHT_BLACK);
    } else if (tab === 0) {
      // Preamble / Pre-History
      const pre = summary.preHistory;
      if (pre && pre.vessel) {
        addHeader('THE VESSEL', COLORS.BRIGHT_CYAN);
        addLine(`  Name: ${pre.vessel.fullName || pre.vessel.name}`);
        addLine(`  Class: ${pre.vessel.class || 'Colony Ship'}`);
        addLine(`  Dimensions: ${pre.vessel.dimensions || 'Unknown'}`);
        addLine(`  Crew: ${pre.vessel.crew ? pre.vessel.crew.toLocaleString() : 'Unknown'}`);
        addLine(`  Destination: ${pre.vessel.destinationName || pre.vessel.destination || 'Unknown'}`);
        addLine(`  Launch Year: ${pre.vessel.launchYear || 'Unknown'}`);
        addBlank();

        if (pre.builders) {
          addHeader('THE BUILDERS', COLORS.BRIGHT_CYAN);
          addLine(`  ${pre.builders.name || 'Unknown Organization'}`);
          if (pre.builders.description) {
            const desc = wordWrap(pre.builders.description, w - 4);
            for (const line of desc) addLine(`  ${line}`, COLORS.BRIGHT_BLACK);
          }
          if (pre.builders.keyFigures) {
            addBlank();
            for (const fig of pre.builders.keyFigures) {
              addLine(`  ${fig.name} - ${fig.title || fig.role}`, COLORS.BRIGHT_WHITE);
            }
          }
          addBlank();
        }

        if (pre.mission) {
          addHeader('THE MISSION', COLORS.BRIGHT_CYAN);
          if (pre.mission.purpose) addLine(`  ${pre.mission.purpose}`);
          if (pre.mission.method) addLine(`  Method: ${pre.mission.method}`, COLORS.BRIGHT_BLACK);
          if (pre.mission.estimatedDuration) addLine(`  Duration: ${pre.mission.estimatedDuration} years`, COLORS.BRIGHT_BLACK);
          addBlank();
        }

        if (pre.preHistoryEras) {
          addHeader('PRE-HISTORY ERAS', COLORS.BRIGHT_CYAN);
          for (const era of pre.preHistoryEras) {
            addBlank();
            const range = era.yearRange ? `[${era.yearRange[0]} to ${era.yearRange[1]}]` : '';
            addLine(`  ${era.name} ${range}`, COLORS.BRIGHT_WHITE);
            if (era.description) {
              const desc = wordWrap(era.description, w - 4);
              for (const line of desc) addLine(`  ${line}`, COLORS.BRIGHT_BLACK);
            }
            if (era.keyEvents) {
              for (const ev of era.keyEvents) addLine(`    - ${ev}`, COLORS.WHITE);
            }
          }
          addBlank();
        }

        if (pre.theForgetting) {
          addHeader('THE FORGETTING', COLORS.BRIGHT_RED);
          if (pre.theForgetting.causes) {
            for (const cause of pre.theForgetting.causes) {
              addLine(`  - ${cause}`, COLORS.WHITE);
            }
          }
          if (pre.theForgetting.fragmentedMemories) {
            addBlank();
            addLine('  Fragmented Memories:', COLORS.BRIGHT_BLACK);
            for (const mem of pre.theForgetting.fragmentedMemories) {
              addLine(`    "${mem}"`, COLORS.BRIGHT_BLACK);
            }
          }
        }
      } else {
        addLine('Pre-history data not available.', COLORS.BRIGHT_BLACK);
      }
    } else if (tab === 1) {
      // Timeline
      addHeader('WORLD TIMELINE', COLORS.BRIGHT_CYAN);
      addBlank();
      const timeline = summary.timeline || [];
      for (const ev of timeline) {
        const yearStr = `[Year ${ev.year}]`;
        const color = ev.isPreHistory ? COLORS.BRIGHT_YELLOW
          : (ev.importance === 'major' || ev.type === 'era_start') ? COLORS.BRIGHT_CYAN
          : COLORS.WHITE;
        const desc = wordWrap(`${yearStr} ${ev.description}`, w);
        for (let i = 0; i < desc.length; i++) {
          addLine(desc[i], i === 0 ? color : COLORS.BRIGHT_BLACK);
        }
      }
    } else if (tab === 2) {
      // Civilizations
      addHeader('CIVILIZATIONS', COLORS.BRIGHT_CYAN);
      const civs = summary.civilizations || [];
      for (const civ of civs) {
        addBlank();
        const status = civ.isActive ? '[Active]' : '[Fallen]';
        const statusColor = civ.isActive ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED;
        addLine(`  ${civ.name} ${status}`, statusColor);
        if (civ.government) addLine(`    Government: ${civ.government}`, COLORS.WHITE);
        if (civ.culturalValues && civ.culturalValues.length) addLine(`    Values: ${civ.culturalValues.join(', ')}`, COLORS.BRIGHT_BLACK);
        if (civ.population) addLine(`    Population: ${civ.population.toLocaleString()}`, COLORS.WHITE);
        if (civ.militaryStrength) addLine(`    Military: ${civ.militaryStrength}`, COLORS.WHITE);
        if (civ.religion) addLine(`    Religion: ${civ.religion}`, COLORS.BRIGHT_BLACK);
        if (civ.homeRegion) addLine(`    Home: ${civ.homeRegion}`, COLORS.BRIGHT_BLACK);
        if (civ.controlledRegions && civ.controlledRegions.length) {
          addLine(`    Regions: ${civ.controlledRegions.join(', ')}`, COLORS.BRIGHT_BLACK);
        }
      }
    } else if (tab === 3) {
      // Historical Figures
      addHeader('HISTORICAL FIGURES', COLORS.BRIGHT_CYAN);
      const figures = summary.historicalFigures || [];
      for (const fig of figures) {
        addBlank();
        const name = fig.fullName || (fig.name && fig.name.full) || fig.name || 'Unknown';
        const status = fig.isAlive ? '[Alive]' : '[Dead]';
        const statusColor = fig.isAlive ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED;
        addLine(`  ${name} ${status}`, statusColor);
        if (fig.title) addLine(`    Title: ${fig.title}`, COLORS.WHITE);
        if (fig.bornYear) {
          const lifespan = fig.deathYear ? `${fig.bornYear} - ${fig.deathYear}` : `Born ${fig.bornYear}`;
          addLine(`    Years: ${lifespan}`, COLORS.BRIGHT_BLACK);
        }
        if (fig.deeds && fig.deeds.length) {
          for (const deed of fig.deeds.slice(0, 3)) {
            const deedText = typeof deed === 'string' ? deed : deed.description || deed.deed || JSON.stringify(deed);
            const wrapped = wordWrap(`    - ${deedText}`, w);
            for (const line of wrapped) addLine(line, COLORS.WHITE);
          }
        }
      }
    } else if (tab === 4) {
      // Artifacts & Religions
      const artifacts = summary.artifacts || [];
      const religions = summary.religions || [];

      if (artifacts.length > 0) {
        addHeader('ARTIFACTS', COLORS.BRIGHT_CYAN);
        for (const art of artifacts) {
          addBlank();
          const lost = art.isLost ? ' [Lost]' : '';
          const cursed = art.cursed ? ' [Cursed]' : '';
          addLine(`  ${art.name}${cursed}${lost}`, art.cursed ? COLORS.BRIGHT_RED : COLORS.BRIGHT_WHITE);
          if (art.description) {
            const desc = wordWrap(art.description, w - 4);
            for (const line of desc) addLine(`    ${line}`, COLORS.BRIGHT_BLACK);
          }
          if (art.type) addLine(`    Type: ${art.type}`, COLORS.WHITE);
          if (art.creatorName) addLine(`    Creator: ${art.creatorName}`, COLORS.WHITE);
          if (art.material) addLine(`    Material: ${art.material}`, COLORS.WHITE);
        }
      }

      if (religions.length > 0) {
        addBlank();
        addHeader('RELIGIONS', COLORS.BRIGHT_CYAN);
        for (const rel of religions) {
          addBlank();
          addLine(`  ${rel.name}`, COLORS.BRIGHT_WHITE);
          if (rel.deity) {
            const deity = typeof rel.deity === 'string' ? rel.deity : rel.deity.fullName || rel.deity.name || 'Unknown';
            const domain = (rel.deity && rel.deity.domain) ? ` (${rel.deity.domain})` : '';
            addLine(`    Deity: ${deity}${domain}`, COLORS.WHITE);
          }
          if (rel.followers) addLine(`    Followers: ${rel.followers.toLocaleString()}`, COLORS.BRIGHT_BLACK);
          if (rel.tenets && rel.tenets.length) {
            addLine(`    Tenets: ${rel.tenets.slice(0, 3).join(', ')}`, COLORS.BRIGHT_BLACK);
          }
        }
      }

      if (artifacts.length === 0 && religions.length === 0) {
        addLine('No artifacts or religions recorded.', COLORS.BRIGHT_BLACK);
      }
    } else if (tab === 5) {
      // Message Log (reuse console log logic)
      addHeader('MESSAGE LOG', COLORS.BRIGHT_CYAN);
      addBlank();
      const log = messageLog || [];
      const total = log.length;
      if (total === 0) {
        addLine('No messages yet.', COLORS.BRIGHT_BLACK);
      } else {
        // Oldest first
        for (let i = total - 1; i >= 0; i--) {
          const msg = log[i];
          lines.push({ t: msg.text, c: msg.color || COLORS.WHITE });
        }
      }
    }

    // Clamp scroll
    const maxScroll = Math.max(0, lines.length - contentH);
    this.almanacScroll = Math.min(this.almanacScroll || 0, maxScroll);
    const scroll = this.almanacScroll;

    // Render visible lines
    for (let i = 0; i < contentH; i++) {
      const idx = scroll + i;
      if (idx >= lines.length) break;
      const line = lines[idx];
      r.drawString(px + 2, contentY + i, line.t, line.c, bg, w);
    }

    // Scroll indicators
    if (scroll > 0) {
      r.drawString(px + panelW - 4, contentY, ' \u25b2 ', COLORS.BRIGHT_WHITE, bg);
    }
    if (scroll < maxScroll) {
      r.drawString(px + panelW - 4, contentY + contentH - 1, ' \u25bc ', COLORS.BRIGHT_WHITE, bg);
    }

    // Footer
    r.drawString(px + 2, py + panelH - 1,
      'Left/Right:Tab  Up/Down:Scroll  1-6:Tab  Esc:Close', COLORS.BRIGHT_BLACK, bg, w);
  }

  // ─── CONSOLE LOG VIEWER ───

  drawConsoleLog() {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 2, 80);
    const panelH = Math.min(rows - 2, 40);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);
    const bg = COLORS.FF_BLUE_DARK;
    const w = panelW - 4;

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Console Log ');

    const contentY = py + 1;
    const contentH = panelH - 3;
    const scroll = this.consoleLogScroll || 0;

    // Messages are stored newest-first; display oldest-first (reversed)
    const total = this.messageLog.length;
    // scrollable range: user can scroll from 0 (oldest at top) to total - contentH
    const maxScroll = Math.max(0, total - contentH);

    // Render lines from the reversed log
    let drawY = contentY;
    for (let i = 0; i < contentH; i++) {
      // index into reversed array (oldest first)
      const logIdx = total - 1 - (scroll + i);
      if (logIdx < 0 || logIdx >= total) {
        drawY++;
        continue;
      }
      const msg = this.messageLog[logIdx];
      // Truncate to fit
      const text = msg.text.length > w ? msg.text.slice(0, w) : msg.text;
      r.drawString(px + 2, drawY, text, msg.color, bg, w);
      drawY++;
    }

    // Scroll indicators
    if (scroll > 0) {
      r.drawString(px + panelW - 4, contentY, ' \u25b2 ', COLORS.BRIGHT_WHITE, bg);
    }
    if (scroll < maxScroll) {
      r.drawString(px + panelW - 4, contentY + contentH - 1, ' \u25bc ', COLORS.BRIGHT_WHITE, bg);
    }

    // Status bar
    const shown = Math.min(contentH, total);
    const fromLine = scroll + 1;
    const toLine = Math.min(scroll + contentH, total);
    const status = `${fromLine}-${toLine} of ${total}`;
    r.drawString(px + 2, py + panelH - 2,
      `Up/Down:Scroll  PgUp/PgDn:Page  Home/End  Esc:Back`, COLORS.BRIGHT_BLACK, bg, w);
    r.drawString(px + panelW - status.length - 3, py + panelH - 2, status, COLORS.BRIGHT_BLACK, bg);
  }
}
