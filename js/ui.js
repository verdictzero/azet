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

// ─── Circuit Line Background Effect (mirrored from main.js for loading screen) ───
function _circuitHash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function _hasTrace(x, y) {
  return _circuitHash(x, y) < 0.35;
}

const _CIRCUIT_CONN = [
  '·', '─', '─', '─', '│', '┌', '┐', '┬',
  '│', '└', '┘', '┴', '│', '├', '┤', '○',
];

const _circuitResult = { char: ' ', fg: '#000000', bg: '#000000' };

function _getCircuitryCell(wx, wy) {
  if (!_hasTrace(wx, wy)) {
    _circuitResult.char = ' ';
    _circuitResult.fg = '#000000';
    _circuitResult.bg = '#000000';
    return _circuitResult;
  }
  const conn = (_hasTrace(wx, wy - 1) ? 8 : 0)
             | (_hasTrace(wx, wy + 1) ? 4 : 0)
             | (_hasTrace(wx - 1, wy) ? 2 : 0)
             | (_hasTrace(wx + 1, wy) ? 1 : 0);
  _circuitResult.char = _CIRCUIT_CONN[conn];
  const t = Date.now() / 1000;
  const wave = Math.sin((wx * 0.3 + wy * 0.2) - t * 1.5) * 0.5 + 0.5;
  const pulse2 = Math.sin((wx * 0.1 - wy * 0.15) + t * 0.7) * 0.5 + 0.5;
  const energy = wave * 0.7 + pulse2 * 0.3;
  const cr = Math.floor(6 + energy * 10);
  const cg = Math.floor(6 + energy * 50);
  const cb = Math.floor(18 + energy * 62);
  _circuitResult.fg = `rgb(${cr},${cg},${cb})`;
  _circuitResult.bg = '#000000';
  return _circuitResult;
}

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
    this.menuScrollOffset = 0;
    this.confirmCallback = null;
    this.confirmMessage = null;

    // Debug menu state
    this.debugTab = 0;        // 0=cheats, 1=world, 2=visual, 3=info
    this.debugScroll = 0;
    this.debugCursor = 0;

    // Console log viewer state
    this.consoleLogScroll = 0;

    // Almanac state
    this.almanacTab = 0;    // 0-6: Preamble, Timeline, Civs, Figures, Artifacts, Scars, Log
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
      const weatherIcons = { rain: '~', snow: '*', storm: '!', fog: '=', sandstorm: '=', cloudy: '-', acid_rain: '~', coolant_mist: '.', ember_rain: ',', data_storm: '#', nano_haze: '.', ion_storm: '/', blood_rain: '~' };
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

  // ─── PREAMBLE SCREEN ───

  drawPreamble(cols, rows) {
    const r = this.renderer;
    r.clear();

    const t = Date.now() / 1000;

    // ── Animated Voronoi cellular automata background (same as title screen) ──
    const numSeeds = 10;
    const bgChars = [' ', '.', '·', ':', '∙', '░', '▒'];
    const voronoiHueShift = t * (-13 / 360);
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

    // ── Center container box ──
    const buttonText = '[ Press Here to Start ]';
    const versionText = this.versionString ? this.versionString : '';
    const contentWidth = Math.max(buttonText.length, versionText.length);
    const boxW = contentWidth + 6;
    const boxH = versionText ? 7 : 5;
    const boxX = Math.floor((cols - boxW) / 2);
    const boxY = Math.floor((rows - boxH) / 2);
    const boxBg = '#1a1a2a';
    const borderColor = '#808090';

    // Fill interior
    r.fillRect(boxX, boxY, boxW, boxH, ' ', COLORS.WHITE, boxBg);

    // Single-line border
    r.drawChar(boxX, boxY, '┌', borderColor, boxBg);
    r.drawChar(boxX + boxW - 1, boxY, '┐', borderColor, boxBg);
    r.drawChar(boxX, boxY + boxH - 1, '└', borderColor, boxBg);
    r.drawChar(boxX + boxW - 1, boxY + boxH - 1, '┘', borderColor, boxBg);
    for (let x = 1; x < boxW - 1; x++) {
      r.drawChar(boxX + x, boxY, '─', borderColor, boxBg);
      r.drawChar(boxX + x, boxY + boxH - 1, '─', borderColor, boxBg);
    }
    for (let y = 1; y < boxH - 1; y++) {
      r.drawChar(boxX, boxY + y, '│', borderColor, boxBg);
      r.drawChar(boxX + boxW - 1, boxY + y, '│', borderColor, boxBg);
    }

    // ── Rainbow hue-shifting "Press Here to Start" button ──
    const btnX = Math.floor((cols - buttonText.length) / 2);
    const btnY = boxY + 2;
    const hueShift = t * (60 / 360); // full rainbow cycle ~6s
    for (let i = 0; i < buttonText.length; i++) {
      const ch = buttonText[i];
      if (ch === ' ') {
        r.drawChar(btnX + i, btnY, ' ', COLORS.WHITE, boxBg);
        continue;
      }
      // Per-character hue offset for rainbow wave effect
      const charHue = hueShift + (i / buttonText.length) * 1.0;
      const color = shiftHue('#e04040', charHue); // start from red
      r.drawChar(btnX + i, btnY, ch, color, boxBg);
    }

    // ── Version string ──
    if (versionText) {
      const vx = Math.floor((cols - versionText.length) / 2);
      const vy = boxY + boxH - 2;
      r.drawString(vx, vy, versionText, COLORS.BRIGHT_BLACK, boxBg);
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
    const compact = cols < titleWidth + 6;

    // Center the entire content group vertically on screen
    // Non-compact: crystal(34) with title centered inside, then version(1) + gap(1) + menu(1)
    // Compact: title box(3) + version(1) + gap(1) + menu(1) + gap(1) + footer(1)
    const contentHeight = compact ? 8 : (CRYSTAL_HEIGHT + 1 + 1 + 1); // crystal + version + gap + menu
    const blockTop = Math.max(0, Math.floor((rows - contentHeight) / 2));

    // In non-compact mode, title is centered within the crystal; in compact, it starts at blockTop
    const artStartY = compact ? blockTop : blockTop + Math.floor(CRYSTAL_HEIGHT / 2) - Math.floor(title.length / 2);
    const artStartX = Math.floor((cols - titleWidth) / 2);
    const waveColors = [COLORS.BLUE, COLORS.BRIGHT_BLUE, COLORS.BRIGHT_CYAN, COLORS.BRIGHT_WHITE, COLORS.BRIGHT_CYAN, COLORS.BRIGHT_BLUE];

    // ── Layer 0.5: Animated crystal behind title card ──
    if (!compact && CRYSTAL_FRAMES.length > 0) {
      const frameIndex = Math.floor(t / 0.12) % CRYSTAL_FRAMES.length;
      const frame = CRYSTAL_FRAMES[frameIndex];
      const cx = Math.floor((cols - CRYSTAL_WIDTH) / 2);
      const cy = blockTop;
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

    const titleBlockEnd = compact ? artStartY + 3 : blockTop + CRYSTAL_HEIGHT;

    if (this.versionString) {
      const vLabel = `[${this.versionString}]`;
      r.drawString(Math.floor((cols - vLabel.length) / 2), titleBlockEnd,
        vLabel, COLORS.BRIGHT_BLACK, COLORS.BLACK);
    }

    // Horizontal linear menu below title
    const menuItems = ['New Game', 'Quick Start', 'Continue', 'Import Save', 'Settings', 'Help'];
    const menuY = titleBlockEnd + 2;
    const sep = '   ';
    const sepLen = sep.length;

    // Calculate total width needed for all items (selected item gets [ ] brackets = +2 chars)
    const totalMenuWidth = menuItems.reduce((sum, item, i) => {
      return sum + item.length + 2 + (i < menuItems.length - 1 ? sepLen : 0);
    }, 0);

    if (totalMenuWidth <= cols - 2) {
      // === All items fit: render centered on one line ===
      let curX = Math.floor((cols - totalMenuWidth) / 2);
      for (let i = 0; i < menuItems.length; i++) {
        const sel = i === this.selectedIndex;
        const label = sel ? `[${menuItems[i]}]` : ` ${menuItems[i]} `;
        const color = sel ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
        const bg = sel ? COLORS.FF_BLUE_DARK : COLORS.BLACK;
        r.drawString(curX, menuY, label, color, bg);
        curX += label.length + sepLen;
      }
    } else {
      // === Narrow mode: scrollable subset with arrow indicators ===
      const arrowW = 3; // "◄  " or "  ►"
      const availWidth = cols - 2 - arrowW * 2;

      // Ensure selectedIndex is visible by adjusting menuScrollOffset
      if (this.selectedIndex < this.menuScrollOffset) {
        this.menuScrollOffset = this.selectedIndex;
      }

      // Calculate visible items from menuScrollOffset
      let visibleItems = [];
      let widthUsed = 0;
      for (let i = this.menuScrollOffset; i < menuItems.length; i++) {
        const itemW = menuItems[i].length + 2 + (visibleItems.length > 0 ? sepLen : 0);
        if (widthUsed + itemW > availWidth && visibleItems.length > 0) break;
        visibleItems.push(i);
        widthUsed += itemW;
      }

      // If selected is past visible range, shift offset forward
      while (!visibleItems.includes(this.selectedIndex) && this.menuScrollOffset < menuItems.length - 1) {
        this.menuScrollOffset++;
        visibleItems = [];
        widthUsed = 0;
        for (let i = this.menuScrollOffset; i < menuItems.length; i++) {
          const itemW = menuItems[i].length + 2 + (visibleItems.length > 0 ? sepLen : 0);
          if (widthUsed + itemW > availWidth && visibleItems.length > 0) break;
          visibleItems.push(i);
          widthUsed += itemW;
        }
      }

      const showLeftArrow = this.menuScrollOffset > 0;
      const showRightArrow = visibleItems.length > 0 && visibleItems[visibleItems.length - 1] < menuItems.length - 1;

      // Center the visible content within the available space
      const contentW = widthUsed + (showLeftArrow ? arrowW : 0) + (showRightArrow ? arrowW : 0);
      let curX = Math.max(1, Math.floor((cols - contentW) / 2));

      if (showLeftArrow) {
        r.drawString(curX, menuY, '\u25C4 ', COLORS.BRIGHT_YELLOW, COLORS.BLACK);
        curX += arrowW;
      }

      for (let vi = 0; vi < visibleItems.length; vi++) {
        const idx = visibleItems[vi];
        const sel = idx === this.selectedIndex;
        const label = sel ? `[${menuItems[idx]}]` : ` ${menuItems[idx]} `;
        const color = sel ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
        const bg = sel ? COLORS.FF_BLUE_DARK : COLORS.BLACK;
        r.drawString(curX, menuY, label, color, bg);
        curX += label.length + (vi < visibleItems.length - 1 ? sepLen : 0);
      }

      if (showRightArrow) {
        r.drawString(curX + 1, menuY, ' \u25BA', COLORS.BRIGHT_YELLOW, COLORS.BLACK);
      }
    }

    const footer = '\u25C4 \u25BA Select  \u00B7  Enter Confirm';
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
        'Millennia of forgotten wars (~2,000 years)',
        'Ages of rise and fall (~4,000 years)',
        'Deep time. Empires crumble to myth (~8,000 years)',
        'Eons of ruin and rebirth (~20,000 years)',
      ];
      const flavors = [
        '8 eras. Wars, plagues, and legends unfold.',
        '12 eras. Machine cults rise, crusades reshape the map.',
        '16 eras. Ancient mythic ages fade into recent strife.',
        '20 eras. Maximum depth. 20 millennia of history scar the world.',
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
      const optX = px;
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

    // Group identical items by name for stacked display
    const grouped = [];
    const seen = new Map();
    for (const item of player.inventory) {
      if (seen.has(item.name)) {
        grouped[seen.get(item.name)].count++;
      } else {
        seen.set(item.name, grouped.length);
        grouped.push({ item, count: 1 });
      }
    }

    // Title box
    r.drawBox(px, py, panelW, 3, COLORS.FF_BORDER, bg);
    r.drawString(px + 2, py + 1, 'Items', COLORS.BRIGHT_WHITE, bg);

    // Item count
    const countStr = grouped.length !== player.inventory.length
      ? `${grouped.length} types (${player.inventory.length} items)`
      : `${player.inventory.length} items`;
    r.drawString(px + panelW - countStr.length - 2, py + 1, countStr, COLORS.BRIGHT_BLACK, bg);

    // Item list box
    const listY = py + 3;
    const listH = panelH - 9;
    r.drawBox(px, listY, panelW, listH, COLORS.FF_BORDER, bg);

    const maxVisible = listH - 2;

    for (let i = 0; i < Math.min(grouped.length, maxVisible); i++) {
      const { item, count } = grouped[i];
      const sel = i === this.selectedIndex;
      const equipped = (player.equipment && Object.values(player.equipment).some(e => e && e.id === item.id));
      const eqTag = equipped ? ' E' : '  ';
      const cursor = sel ? ICONS.cursor : ' ';
      const countPrefix = count > 1 ? `${count}x ` : '';

      r.drawString(px + 2, listY + 1 + i,
        cursor + ' ' + item.char + ' ' + countPrefix + item.name.substring(0, panelW - 14 - countPrefix.length) + eqTag,
        sel ? COLORS.BRIGHT_WHITE : (item.color || COLORS.WHITE), bg, panelW - 4);
    }

    if (grouped.length === 0) {
      r.drawString(px + 4, listY + 2, 'No items.', COLORS.BRIGHT_BLACK, bg);
    }

    // Detail box (bottom)
    const detY = listY + listH;
    const detH = 6;
    r.drawBox(px, detY, panelW, detH, COLORS.FF_BORDER, bg);

    if (grouped.length > 0 && this.selectedIndex < grouped.length) {
      const { item, count } = grouped[this.selectedIndex];
      const nameStr = count > 1 ? `${item.name} (x${count})` : item.name;
      r.drawString(px + 2, detY + 1, nameStr, COLORS.BRIGHT_WHITE, bg, panelW - 4);
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
      'D:Drop  U:Use  Esc:Close', COLORS.BRIGHT_BLACK, bg, panelW - 4);
  }

  // ─── EQUIPMENT MENU (slot-based) ───

  drawEquipmentMenu(player, menuState) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 4, 60);
    const panelH = Math.min(rows - 4, 30);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    const SLOT_KEYS = ['head', 'chest', 'hands', 'legs', 'feet', 'mainHand', 'offHand', 'ring', 'amulet'];
    const SLOT_LABELS = ['Head', 'Body', 'Arms', 'Legs', 'Feet', 'R.Hand', 'L.Hand', 'Ring', 'Amulet'];
    const SLOT_ITEMS = {
      head: ['helmet'], chest: ['chestplate'], hands: ['gloves'],
      legs: ['leggings'], feet: ['boots'],
      mainHand: ['sword', 'axe', 'mace', 'dagger', 'staff', 'bow'],
      offHand: ['shield'], ring: ['ring'], amulet: ['amulet'],
    };

    if (!menuState) return;

    if (menuState.level === 'slots') {
      // Title
      r.drawBox(px, py, panelW, 3, COLORS.FF_BORDER, bg);
      r.drawString(px + 2, py + 1, 'Equipment', COLORS.BRIGHT_WHITE, bg);

      // Slot list
      const listY = py + 3;
      const listH = SLOT_KEYS.length + 2;
      r.drawBox(px, listY, panelW, listH, COLORS.FF_BORDER, bg);

      for (let i = 0; i < SLOT_KEYS.length; i++) {
        const slot = SLOT_KEYS[i];
        const label = SLOT_LABELS[i];
        const equipped = player.equipment[slot];
        const sel = i === menuState.slotIndex;
        const cursor = sel ? ICONS.cursor : ' ';
        const itemStr = equipped ? equipped.name : '\u2014empty\u2014';
        const itemColor = equipped ? (equipped.color || COLORS.WHITE) : COLORS.BRIGHT_BLACK;

        r.drawString(px + 2, listY + 1 + i,
          cursor + ' ' + label.padEnd(8) + ' ',
          sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE, bg);
        r.drawString(px + 13, listY + 1 + i,
          itemStr.substring(0, panelW - 16),
          sel ? COLORS.BRIGHT_WHITE : itemColor, bg, panelW - 15);
      }

      // Detail box
      const detY = listY + listH;
      const detH = panelH - 3 - listH;
      if (detH > 2) {
        r.drawBox(px, detY, panelW, detH, COLORS.FF_BORDER, bg);
        const slot = SLOT_KEYS[menuState.slotIndex];
        const equipped = player.equipment[slot];
        if (equipped) {
          r.drawString(px + 2, detY + 1, equipped.name, COLORS.BRIGHT_WHITE, bg, panelW - 4);
          if (equipped.description) {
            r.drawString(px + 2, detY + 2, equipped.description, COLORS.WHITE, bg, panelW - 4);
          }
          if (equipped.stats) {
            const statStr = Object.entries(equipped.stats)
              .map(([k, v]) => `${k}:${v > 0 ? '+' : ''}${v}`).join('  ');
            r.drawString(px + 2, detY + 3, statStr, COLORS.BRIGHT_CYAN, bg, panelW - 4);
          }
        }
        r.drawString(px + 2, detY + detH - 1,
          'Enter:Browse  U:Unequip  Esc:Close', COLORS.BRIGHT_BLACK, bg, panelW - 4);
      }
    } else if (menuState.level === 'items') {
      const slot = SLOT_KEYS[menuState.slotIndex];
      const slotLabel = SLOT_LABELS[menuState.slotIndex];
      const compatible = player.inventory.filter(i =>
        SLOT_ITEMS[slot].includes(i.subtype) || SLOT_ITEMS[slot].includes(i.type)
      );

      // Title
      r.drawBox(px, py, panelW, 3, COLORS.FF_BORDER, bg);
      r.drawString(px + 2, py + 1, `Equip: ${slotLabel}`, COLORS.BRIGHT_WHITE, bg);

      // Item list
      const listY = py + 3;
      const listH = panelH - 9;
      r.drawBox(px, listY, panelW, listH, COLORS.FF_BORDER, bg);

      const maxVisible = listH - 2;
      // First entry is [Back]
      const totalItems = compatible.length + 1;

      for (let i = 0; i < Math.min(totalItems, maxVisible); i++) {
        const sel = i === menuState.itemIndex;
        const cursor = sel ? ICONS.cursor : ' ';

        if (i === 0) {
          r.drawString(px + 2, listY + 1 + i,
            cursor + ' \u25C0 Back', sel ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK, bg, panelW - 4);
        } else {
          const item = compatible[i - 1];
          r.drawString(px + 2, listY + 1 + i,
            cursor + ' ' + item.char + ' ' + item.name.substring(0, panelW - 14),
            sel ? COLORS.BRIGHT_WHITE : (item.color || COLORS.WHITE), bg, panelW - 4);
        }
      }

      if (compatible.length === 0) {
        r.drawString(px + 4, listY + 3, 'No compatible items.', COLORS.BRIGHT_BLACK, bg);
      }

      // Detail box
      const detY = listY + listH;
      const detH = 6;
      r.drawBox(px, detY, panelW, detH, COLORS.FF_BORDER, bg);

      if (menuState.itemIndex > 0 && menuState.itemIndex - 1 < compatible.length) {
        const item = compatible[menuState.itemIndex - 1];
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
        'Enter:Equip  Esc:Back', COLORS.BRIGHT_BLACK, bg, panelW - 4);
    }
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

      // Show faction rank name if available
      const rank = factionSystem.getPlayerRank ? factionSystem.getPlayerRank(id) : null;
      const rankLabel = rank ? ` [${rank.name}]` : '';

      const nameMaxW = Math.min(16, panelW - 4);
      r.drawString(px + 2, y, faction.name.substring(0, nameMaxW).padEnd(nameMaxW), COLORS.BRIGHT_WHITE, bg);
      const barX = px + nameMaxW + 3;
      r.drawString(barX, y, bar, labelColor, bg, panelW - nameMaxW - 5);
      const labelX = barX + barW + 1;
      if (labelX < px + panelW - 2) {
        const fullLabel = standingLabel + rankLabel;
        r.drawString(labelX, y, fullLabel, labelColor, bg, px + panelW - 2 - labelX);
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

    // Group chain quests together, then standalone
    const chainQuests = active.filter(q => q.chainId);
    const standaloneQuests = active.filter(q => !q.chainId);
    const sortedActive = [...chainQuests, ...standaloneQuests];

    let lastChainId = null;
    for (let i = 0; i < sortedActive.length; i++) {
      const q = sortedActive[i];
      const origIdx = active.indexOf(q);
      const sel = origIdx === this.selectedIndex;
      const tracked = q.id === trackedQuestId;
      const cursor = sel ? ICONS.cursor : ' ';
      const trackIcon = tracked ? ' \u25CE' : '';

      // Show chain header for grouped chain quests
      if (q.chainId && q.chainId !== lastChainId) {
        const chainLabel = q.chainName || 'Quest Chain';
        lines.push({ type: 'text', text: `  -- ${chainLabel} --`, color: COLORS.BRIGHT_YELLOW });
        lastChainId = q.chainId;
      } else if (!q.chainId && lastChainId !== null) {
        lastChainId = null;
      }

      // Quest type badge
      const badge = q.isLocationQuest ? '[LOC]' : q.isRadiant ? '[RAD]' : q.chainId ? `[${q.chainStage + 1}/${q.chainStage + 1}]` : '';
      const titleColor = tracked ? COLORS.BRIGHT_CYAN : q.chainId ? COLORS.BRIGHT_YELLOW : (sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE);
      const titleText = badge ? `${cursor} ${badge} ${q.title}${trackIcon}` : `${cursor} ${q.title}${trackIcon}`;
      lines.push({ type: 'quest', text: titleText, color: titleColor, questIdx: origIdx });

      for (const obj of q.objectives) {
        const progress = `${obj.current}/${obj.required}`;
        const objMaxW = panelW - 8;
        const descMax = objMaxW - progress.length - 2;
        const desc = obj.description.length > descMax ? obj.description.substring(0, descMax) : obj.description;
        lines.push({ type: 'objective', text: '    ' + desc + '  ' + progress, color: COLORS.BRIGHT_BLACK });
      }
    }

    // Quest leads section
    const leads = questSystem.getQuestLeads ? questSystem.getQuestLeads() : [];
    if (leads.length > 0) {
      lines.push({ type: 'blank' });
      lines.push({ type: 'header', text: 'Leads' });
      lines.push({ type: 'separator' });
      for (const lead of leads) {
        const maxW = panelW - 6;
        const text = lead.text.length > maxW ? lead.text.substring(0, maxW - 3) + '...' : lead.text;
        lines.push({ type: 'text', text: '  * ' + text, color: COLORS.BRIGHT_BLACK });
        if (lead.targetLocation) {
          lines.push({ type: 'text', text: '    -> ' + lead.targetLocation, color: COLORS.BRIGHT_CYAN });
        }
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
    const zoom = r.densityLevel || 1;

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
      let worldMinX = (minCx - 1) * CHUNK_SIZE;
      let worldMaxX = (maxCx + 2) * CHUNK_SIZE;
      let worldMinY = (minCy - 1) * CHUNK_SIZE;
      let worldMaxY = (maxCy + 2) * CHUNK_SIZE;

      // When zoomed in, center on player and show a smaller area
      if (zoom > 1 && player && player.position) {
        const fullW = worldMaxX - worldMinX;
        const fullH = worldMaxY - worldMinY;
        const viewW = fullW / zoom;
        const viewH = fullH / zoom;
        const cx = player.position.x;
        const cy = player.position.y;
        worldMinX = Math.max(worldMinX, Math.floor(cx - viewW / 2));
        worldMaxX = Math.min(worldMaxX, Math.ceil(cx + viewW / 2));
        worldMinY = Math.max(worldMinY, Math.floor(cy - viewH / 2));
        worldMaxY = Math.min(worldMaxY, Math.ceil(cy + viewH / 2));
      }

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

    r.drawString(2, rows - 1, `Esc:Close  -/=:Zoom(${zoom}x)  O:Outpost  H:Habitat  *:Hub  +:Garrison  v:Sealed  ^:Spire`, COLORS.BRIGHT_BLACK, COLORS.FF_BLUE_DARK);
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

  drawLocationOverview(settlement, npcs, player, camera, sunDir, hour, enemies, items) {
    this._locationLighting = null; // clear stale data
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const viewLeft = 1;
    const viewTop = LAYOUT.VIEWPORT_TOP;
    const viewW = cols - 2;
    const viewH = rows - LAYOUT.HUD_TOTAL;

    // Tile height lookup for settlement shadow casting — buildings only
    const SETTLEMENT_HEIGHTS = {
      WALL: 3, BUILDING_WALL: 3,
    };
    // Character-based heights for decorations — buildings only
    const CHAR_HEIGHTS = {
      '\u25D9': 3, // castle corner ◙
      '\u2565': 2, // battlement ╥
    };

    // ── Time-of-day lighting phase ──
    // Subtle, low-contrast lighting — palette shifts rather than warm overlays
    const h = hour || 12;
    const isDay = sunDir && sunDir.isDay;
    const isNight = sunDir && !sunDir.isDay;
    // Low warmth baseline for subtle directional cues without golden-hour saturation
    let sunWarmth = 0.15; // subtle baseline
    let sunTint = '#FFFFFF';
    let shadowTint = '#000000';
    if (isDay) {
      // Gentle time-of-day variation — dawn/dusk slightly warmer, midday neutral
      if (h < 7.5) {
        sunWarmth = Math.max(0.15, 0.35 - Math.abs(h - 6) / 6.0);
      } else if (h > 17) {
        sunWarmth = Math.max(0.15, 0.35 - Math.abs(h - 19) / 6.0);
      }
      // Sun tint: mostly white with very subtle warmth
      const tR = 255;
      const tG = Math.round(255 - sunWarmth * 20);
      const tB = Math.round(255 - sunWarmth * 40);
      sunTint = '#' + [tR, tG, tB].map(v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
      // Shadow tint: very subtle cool blue, not warm
      const sR = 0;
      const sG = 0;
      const sB = Math.round(15 + sunWarmth * 10);
      shadowTint = '#' + [sR, sG, sB].map(v => v.toString(16).padStart(2,'0')).join('');
    } else if (isNight) {
      sunTint = '#AABBDD';
      shadowTint = '#000008';
      sunWarmth = 0.15;
    }

    // Draw settlement map tiles with camera
    if (settlement.tiles) {
      const density = r.densityLevel;
      const worldW = Math.ceil(viewW / density);
      const worldH = Math.ceil(viewH / density);
      const entityOff = Math.floor(density / 2);

      const camX = camera ? Math.floor(camera.x) : Math.max(0, Math.floor((settlement.tiles[0].length - worldW) / 2));
      const camY = camera ? Math.floor(camera.y) : Math.max(0, Math.floor((settlement.tiles.length - worldH) / 2));

      // Collect infinitely linear shadows (in screen coords) — works for both sun and moon
      const shadowCells = new Map();
      if (sunDir) {
        const shadowAlpha = isDay ? 0.20 : 0.125;
        const shadowMax = isDay ? 0.525 : 0.3125;
        // Normalized shadow direction for ray marching
        const sdMag = Math.sqrt(sunDir.dx * sunDir.dx + sunDir.dy * sunDir.dy) || 1;
        const sdxN = sunDir.dx / sdMag;
        const sdyN = sunDir.dy / sdMag;
        const maxRayLen = 6;

        for (let wy_off = 0; wy_off < worldH; wy_off++) {
          for (let wx_off = 0; wx_off < worldW; wx_off++) {
            const wx = camX + wx_off;
            const wy = camY + wy_off;
            if (wy < 0 || wy >= settlement.tiles.length || wx < 0 || wx >= settlement.tiles[0].length) continue;
            const t = settlement.tiles[wy][wx];
            if (!t) continue;
            const height = SETTLEMENT_HEIGHTS[t.type] || CHAR_HEIGHTS[t.char] || (!t.walkable && t.char !== '.' ? 1 : 0);
            if (height > 0) {
              // Cast infinitely linear shadow to viewport edge
              const baseAlpha = shadowAlpha + Math.min(0.125, height * 0.025);
              for (let i = 1; i <= maxRayLen; i++) {
                const shBaseX = wx_off * density + sdxN * i * density;
                const shBaseY = wy_off * density + sdyN * i * density;
                let anyInBounds = false;
                for (let sdy = 0; sdy < density; sdy++) {
                  for (let sdx = 0; sdx < density; sdx++) {
                    const shx = Math.floor(shBaseX) + sdx;
                    const shy = Math.floor(shBaseY) + sdy;
                    if (shx >= 0 && shx < viewW && shy >= 0 && shy < viewH) {
                      anyInBounds = true;
                      const key = `${shx},${shy}`;
                      const existing = shadowCells.get(key) || 0;
                      const dist = i / maxRayLen;
                      const fadedAlpha = baseAlpha * Math.pow(1.0 - dist, 2);
                      shadowCells.set(key, Math.min(shadowMax, existing + fadedAlpha));
                    }
                  }
                }
                if (!anyInBounds) break;
              }
            }
          }
        }
      }

      // Edge highlights disabled — using soft gradient shadows instead
      const sunlitCells = new Map();

      // Render tiles with density expansion
      for (let wy_off = 0; wy_off < worldH; wy_off++) {
        for (let wx_off = 0; wx_off < worldW; wx_off++) {
          const wx = camX + wx_off;
          const wy = camY + wy_off;
          if (wy >= 0 && wy < settlement.tiles.length && wx >= 0 && wx < settlement.tiles[0].length) {
            const tile = settlement.tiles[wy][wx];
            if (!tile) continue;

            if (density === 1) {
              const ch = r.getAnimatedChar(tile.char, tile.type, wx, wy);
              const fg = r.getAnimatedColorWithPos ? r.getAnimatedColorWithPos(tile.fg, tile.type, wx, wy) : r.getAnimatedColor(tile.fg, tile.type);
              r.drawChar(viewLeft + wx_off, viewTop + wy_off, ch, fg, tile.bg || COLORS.BLACK);
            } else {
              const expanded = expandTile(tile, density, wx, wy);
              for (let dy = 0; dy < density; dy++) {
                for (let dx = 0; dx < density; dx++) {
                  const screenX = viewLeft + wx_off * density + dx;
                  const screenY = viewTop + wy_off * density + dy;
                  if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                    const ch = r.getAnimatedChar(expanded.chars[dy][dx], tile.type, wx, wy);
                    const fg = r.getAnimatedColorWithPos ? r.getAnimatedColorWithPos(expanded.fgs[dy][dx], tile.type, wx, wy) : r.getAnimatedColor(expanded.fgs[dy][dx], tile.type);
                    r.drawChar(screenX, screenY, ch, fg, expanded.bgs[dy][dx]);
                  }
                }
              }
            }
          }
        }
      }

      // ── Store lighting data for post-endFrame application ──
      // (Canvas effects applied before endFrame get overwritten, so we defer them)

      // Pre-compute canopy proximity set for dappled light effect
      const canopyNearbyCells = new Set();
      if (sunDir && settlement.tiles) {
        for (let wy_off = 0; wy_off < worldH; wy_off++) {
          for (let wx_off = 0; wx_off < worldW; wx_off++) {
            const wx = camX + wx_off;
            const wy = camY + wy_off;
            if (wy >= 0 && wy < settlement.tiles.length && wx >= 0 && wx < settlement.tiles[0].length) {
              if (settlement.tiles[wy][wx] && settlement.tiles[wy][wx].type === 'TREE_CANOPY') {
                for (let cdy = -2; cdy <= 2; cdy++) {
                  for (let cdx = -2; cdx <= 2; cdx++) {
                    const nsx = wx_off * density + cdx;
                    const nsy = wy_off * density + cdy;
                    if (nsx >= 0 && nsx < viewW && nsy >= 0 && nsy < viewH) {
                      canopyNearbyCells.add(`${nsx},${nsy}`);
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Compute god ray cells
      const godRayCells = []; // flat array: [sx, sy, intensity, tint, ...]
      if (sunDir && r._godRayNoise && shadowCells.size > 0) {
        const perpX = -(sunDir.dy || 0);
        const perpY = sunDir.dx || 0;
        const ts = Date.now() / 1000;
        const alongX = sunDir.dx || 0;
        const alongY = sunDir.dy || 0;
        const ac0 = 0, ac1 = (viewW - 1) * alongX, ac2 = (viewH - 1) * alongY, ac3 = ac1 + ac2;
        const minAlong = Math.min(ac0, ac1, ac2, ac3);
        const maxAlong = Math.max(ac0, ac1, ac2, ac3);
        const alongRange = maxAlong - minAlong || 1;
        let rayIntMul, edgeBoost;
        if (isDay) {
          rayIntMul = 0.34 + sunWarmth * 0.20;
          edgeBoost = 0.014 + sunWarmth * 0.014;
        } else {
          rayIntMul = 0.24;
          edgeBoost = 0.011;
        }
        for (let sy = 0; sy < viewH; sy++) {
          for (let sx = 0; sx < viewW; sx++) {
            const key = `${sx},${sy}`;
            if (shadowCells.has(key)) continue;
            let nearShadow = false;
            for (let nd = 1; nd <= 2; nd++) {
              const checkX = sx + Math.round((sunDir.dx || 0) * nd);
              const checkY = sy + Math.round((sunDir.dy || 0) * nd);
              if (shadowCells.has(`${checkX},${checkY}`)) { nearShadow = true; break; }
            }
            const nearCanopy = canopyNearbyCells.has(key);
            const proj = sx * perpX + sy * perpY;
            const thinNoise = r._godRayNoise.noise2D(proj * 0.25 + ts * 0.03, ts * 0.02);
            const wideNoise = r._godRayNoise.noise2D(proj * 0.08 + ts * 0.02, ts * 0.015 + 50.0);
            const rayNoise = thinNoise * 0.5 + wideNoise * 0.5;
            if (rayNoise > 0.18) {
              const alongProj = sx * alongX + sy * alongY;
              const rayT = (alongProj - minAlong) / alongRange;
              let tint;
              if (isDay) {
                // Neutral white-blue rays — subtle, not golden
                const baseR = 230;
                const baseG = 235;
                const baseB = 242;
                const tR = Math.round(baseR + rayT * (255 - baseR));
                const tG = Math.round(baseG - rayT * 8);
                const tB = Math.round(baseB - rayT * 12);
                if (nearCanopy) {
                  tint = '#' + [Math.round(tR * 0.92), Math.round(Math.min(255, tG * 0.98)), Math.round(tB * 0.95)]
                    .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
                } else {
                  tint = '#' + [tR, tG, tB].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
                }
              } else {
                const tR = Math.round(170 + rayT * 10);
                const tG = Math.round(180 + rayT * 5);
                const tB = Math.round(210 - rayT * 10);
                if (nearCanopy) {
                  tint = '#' + [Math.round(tR * 0.88), Math.round(tG * 0.9), Math.round(tB * 0.92)]
                    .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
                } else {
                  tint = '#' + [tR, tG, tB].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
                }
              }
              let intensity = ((rayNoise - 0.18) / 0.82 * 0.108 + (nearShadow ? edgeBoost : 0)) * rayIntMul;
              const dimFactor = 1.0 - rayT * 0.25;
              intensity *= dimFactor;
              if (nearCanopy) intensity *= 1.15;
              // Temporal fade in/out for sparse sun rays
              const fadeCycle = Math.sin(ts * 0.15 + proj * 0.1) * 0.35 + 0.65;
              intensity *= fadeCycle;
              godRayCells.push(sx, sy, Math.min(0.16, intensity), tint);
            }
          }
        }
      }

      // Compute lamp glow operations
      const lampGlowOps = []; // [{col, row, color, alpha}, ...]
      if (settlement.tiles) {
        const LIGHT_TILES = {
          '\u263C': { r: 1.0, g: 0.85, b: 0.3, rad: 4, int: 0.6, spd: 2.5 },   // ☼ lamp
          'FIREPLACE': { r: 1.0, g: 0.5, b: 0.15, rad: 3, int: 0.7, spd: 3.0 },
          'CAMPFIRE':  { r: 1.0, g: 0.55, b: 0.12, rad: 3, int: 0.7, spd: 3.0 },
          'TORCH_SCONCE': { r: 1.0, g: 0.7, b: 0.3, rad: 4, int: 0.65, spd: 3.2 },
          'TORCH':     { r: 1.0, g: 0.7, b: 0.3, rad: 4, int: 0.65, spd: 3.2 },
        };
        const lt = Date.now() / 1000;
        let lampMul;
        if (isNight) { lampMul = 1.0; }
        else { lampMul = 0.3 + sunWarmth * 0.35; }
        const lampSources = [];
        for (let wy_off = 0; wy_off < worldH; wy_off++) {
          for (let wx_off = 0; wx_off < worldW; wx_off++) {
            const wx = camX + wx_off;
            const wy = camY + wy_off;
            if (wy < 0 || wy >= settlement.tiles.length || wx < 0 || wx >= settlement.tiles[0].length) continue;
            const t = settlement.tiles[wy][wx];
            if (!t) continue;
            const prof = LIGHT_TILES[t.type] || (t.char === '\u263C' ? LIGHT_TILES['\u263C'] : null);
            if (prof) lampSources.push({ wx_off, wy_off, wx, wy, prof });
          }
        }
        for (const ls of lampSources) {
          const { wx_off, wy_off, wx, wy, prof } = ls;
          const ph = (wx * 0.731 + wy * 0.419) % 6.28;
          const flBase = Math.sin(lt * prof.spd + ph) * 0.5 + 0.5;
          const flJit = Math.sin(lt * 7.3 + ph) * 0.12 + Math.sin(lt * 13.1 + ph * 2) * 0.08;
          const flicker = Math.max(0.55, Math.min(1.0, 0.65 + 0.35 * flBase + flJit));
          const baseInt = prof.int * flicker * lampMul;
          const rad = prof.rad;
          const hexR = Math.round(prof.r * 255).toString(16).padStart(2, '0');
          const hexG = Math.round(Math.min(1, prof.g * (0.9 + 0.1 * flBase)) * 255).toString(16).padStart(2, '0');
          const hexB = Math.round(prof.b * 255).toString(16).padStart(2, '0');
          const tintColor = `#${hexR}${hexG}${hexB}`;
          for (let ldy = -rad; ldy <= rad; ldy++) {
            for (let ldx = -rad; ldx <= rad; ldx++) {
              const dist = Math.sqrt(ldx * ldx + ldy * ldy);
              if (dist > rad) continue;
              const tx = wx_off + ldx;
              const ty = wy_off + ldy;
              if (tx < 0 || tx >= worldW || ty < 0 || ty >= worldH) continue;
              const falloff = Math.max(0, 1 - dist / rad);
              const alpha = falloff * falloff * baseInt;
              for (let sdy2 = 0; sdy2 < density; sdy2++) {
                for (let sdx2 = 0; sdx2 < density; sdx2++) {
                  lampGlowOps.push(viewLeft + tx * density + sdx2, viewTop + ty * density + sdy2, tintColor, alpha);
                }
              }
            }
          }
        }

        // Compute door/window warm glow
        if (isNight || sunWarmth > 0.3) {
          const doorMul = isNight ? 1.0 : sunWarmth * 0.8;
          for (let wy_off = 0; wy_off < worldH; wy_off++) {
            for (let wx_off = 0; wx_off < worldW; wx_off++) {
              const wx = camX + wx_off;
              const wy = camY + wy_off;
              if (wy < 0 || wy >= settlement.tiles.length || wx < 0 || wx >= settlement.tiles[0].length) continue;
              const t = settlement.tiles[wy][wx];
              if (!t) continue;
              if (t.type === 'DOOR' || t.type === 'WINDOW') {
                const wRad = 3;
                const wph = (wx * 0.5 + wy * 0.3) % 6.28;
                const wFlicker = 0.8 + 0.2 * Math.sin(lt * 1.5 + wph);
                for (let ldy = -wRad; ldy <= wRad; ldy++) {
                  for (let ldx = -wRad; ldx <= wRad; ldx++) {
                    const dist = Math.sqrt(ldx * ldx + ldy * ldy);
                    if (dist > wRad) continue;
                    const tx = wx_off + ldx;
                    const ty = wy_off + ldy;
                    if (tx < 0 || tx >= worldW || ty < 0 || ty >= worldH) continue;
                    const falloff = Math.max(0, 1 - dist / wRad);
                    const alpha = falloff * falloff * 0.35 * wFlicker * doorMul;
                    for (let sdy2 = 0; sdy2 < density; sdy2++) {
                      for (let sdx2 = 0; sdx2 < density; sdx2++) {
                        lampGlowOps.push(viewLeft + tx * density + sdx2, viewTop + ty * density + sdy2, '#FFCC66', alpha);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Store all lighting data for application after endFrame
      this._locationLighting = {
        shadowCells, shadowTint, sunlitCells, sunTint, sunWarmth,
        isDay, isNight, viewLeft, viewTop, viewW, viewH,
        godRayCells, lampGlowOps,
      };

      // Draw NPCs with targeting reticle and intense color cycling
      if (npcs) {
        const now = Date.now();
        // Reticle animation frames: corners + directional indicators
        const reticleFrames = [
          ['┏','▲','┓','◂','▸','┗','▼','┛'],  // heavy corners + arrows
          ['◤','△','◥','◁','▷','◣','▽','◢'],  // triangle corners + outline arrows
          ['╔','♦','╗','♦','♦','╚','♦','╝'],  // double corners + diamonds
        ];
        // Offsets for 8 surrounding cells: TL, T, TR, L, R, BL, B, BR
        const surroundOffsets = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
        const frame = Math.floor(now / 400) % 3;
        const chars = reticleFrames[frame];

        for (const npc of npcs) {
          const wx_off = npc.position.x - camX;
          const wy_off = npc.position.y - camY;
          if (wx_off >= 0 && wx_off < worldW && wy_off >= 0 && wy_off < worldH) {
            const cx = viewLeft + wx_off * density + entityOff;
            const cy = viewTop + wy_off * density + entityOff;

            // Intense cycling background color (fast hue rotation)
            const bgHue = ((now / 150) * 120) % 360;
            const npcBg = hslToHex(bgHue / 360, 0.80, 0.25);

            // Reticle colors — complementary hue, darker background
            const reticleColor = this.glow ? this.glow.getGlowColor('NPC_RETICLE', '#FFFFFF') : '#FF00FF';
            const reticleBg = hslToHex(((bgHue + 180) % 360) / 360, 0.70, 0.15);

            // Draw surrounding reticle first (so NPC char draws on top)
            for (let i = 0; i < 8; i++) {
              const rx = cx + surroundOffsets[i][0];
              const ry = cy + surroundOffsets[i][1];
              if (rx >= viewLeft && rx < viewLeft + viewW && ry >= viewTop && ry < viewTop + viewH) {
                r.drawChar(rx, ry, chars[i], reticleColor, reticleBg);
              }
            }

            // Draw NPC character with intense rainbow fg + cycling bg
            const npcFg = this.glow ? this.glow.getGlowColor('NPC', npc.color || COLORS.BRIGHT_CYAN) : (npc.color || COLORS.BRIGHT_CYAN);
            r.drawChar(cx, cy, npc.char, npcFg, npcBg);
          }
        }
      }

      // Draw enemies (bridge zones)
      if (enemies) {
        for (const enemy of enemies) {
          if (!enemy.position) continue;
          const wx_off = enemy.position.x - camX;
          const wy_off = enemy.position.y - camY;
          if (wx_off >= 0 && wx_off < worldW && wy_off >= 0 && wy_off < worldH) {
            const enemyColor = this.glow ? this.glow.getGlowColor('ENEMY', COLORS.BRIGHT_RED) : COLORS.BRIGHT_RED;
            r.drawChar(viewLeft + wx_off * density + entityOff, viewTop + wy_off * density + entityOff, enemy.char || 'E', enemyColor);
          }
        }
      }

      // Draw items on ground (bridge zones)
      if (items) {
        for (const item of items) {
          if (!item.position) continue;
          const wx_off = item.position.x - camX;
          const wy_off = item.position.y - camY;
          if (wx_off >= 0 && wx_off < worldW && wy_off >= 0 && wy_off < worldH) {
            const itemColor = this.glow ? this.glow.getGlowColor('ITEM', COLORS.BRIGHT_MAGENTA) : COLORS.BRIGHT_MAGENTA;
            r.drawChar(viewLeft + wx_off * density + entityOff, viewTop + wy_off * density + entityOff, item.char || '!', itemColor);
          }
        }
      }

      // Draw player
      if (player) {
        const px = player.position.x - camX;
        const py = player.position.y - camY;
        if (px >= 0 && px < worldW && py >= 0 && py < worldH) {
          const psx = viewLeft + px * density + entityOff;
          const psy = viewTop + py * density + entityOff;
          const playerColor = this.glow ? this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW) : COLORS.BRIGHT_YELLOW;
          r.drawChar(psx, psy, '@', playerColor);

          // Player targeting reticle (4 corners, pulsing)
          const t = Date.now() % 1000;
          const reticleColor = t < 500 ? COLORS.BRIGHT_CYAN : COLORS.CYAN;
          r.drawChar(psx - 1, psy - 1, '\u250C', reticleColor);
          r.drawChar(psx + 1, psy - 1, '\u2510', reticleColor);
          r.drawChar(psx - 1, psy + 1, '\u2514', reticleColor);
          r.drawChar(psx + 1, psy + 1, '\u2518', reticleColor);
        }
      }
    }
  }

  /**
   * Apply stored location lighting effects to canvas (must be called after endFrame).
   */
  applyLocationLighting(renderer) {
    const L = this._locationLighting;
    if (!L) return;
    const { shadowCells, shadowTint, sunlitCells, sunTint, sunWarmth,
            isDay, isNight, viewLeft, viewTop, viewW, viewH,
            godRayCells, lampGlowOps } = L;

    // Shadow darkening — low contrast, subtle depth
    for (const [key, alpha] of shadowCells) {
      const [sx, sy] = key.split(',').map(Number);
      renderer.darkenCell(viewLeft + sx, viewTop + sy, alpha);
      // Very subtle cool tint in shadows
      if (shadowTint !== '#000000') {
        renderer.tintCell(viewLeft + sx, viewTop + sy, shadowTint, alpha * 0.15);
      }
    }

    // Edge highlights disabled

    // Ambient fill — extremely subtle, barely perceptible directional bias
    if (isDay && sunWarmth > 0.2) {
      const ambientAlpha = sunWarmth * 0.015;
      for (let sy = 0; sy < viewH; sy++) {
        for (let sx = 0; sx < viewW; sx++) {
          const key = `${sx},${sy}`;
          if (shadowCells.has(key)) continue;
          renderer.tintCell(viewLeft + sx, viewTop + sy, sunTint, ambientAlpha);
        }
      }
    }

    // God rays / moonbeams — subtle volumetric hints
    for (let i = 0; i < godRayCells.length; i += 4) {
      renderer.brightenCell(viewLeft + godRayCells[i], viewTop + godRayCells[i + 1], godRayCells[i + 2], godRayCells[i + 3]);
    }

    // Lamp, torch, door, and window glow
    for (let i = 0; i < lampGlowOps.length; i += 4) {
      renderer.tintCell(lampGlowOps[i], lampGlowOps[i + 1], lampGlowOps[i + 2], lampGlowOps[i + 3]);
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

    const tabs = ['Controls', 'Actions', 'Explore', 'Dungeons', 'Combat', 'NPCs', 'Systems', 'Keys+Tips'];
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
      // 0: Controller (virtual gamepad — all input pipes through this)
      [
        { h: 'VIRTUAL CONTROLLER', c: COLORS.BRIGHT_CYAN },
        { t: 'All input routes through a virtual controller.' },
        { t: 'Touch/gamepad buttons map directly. Keyboard' },
        { t: 'keys are mapped to controller buttons below.' },
        { t: '' },
        { h: 'MOVEMENT (D-PAD)', c: COLORS.BRIGHT_YELLOW },
        { t: 'D-Pad / Stick        Move in 4 directions' },
        { t: '  Keyboard: Arrow Keys or WASD' },
        { t: 'D-Pad Diagonals      Move in 8 directions' },
        { t: '  Keyboard: Numpad 7/9/1/3 (UL/UR/DL/DR)' },
        { t: 'ACT (center d-pad)   Context-sensitive interact' },
        { t: '  Keyboard: Enter' },
        { t: '' },
        { h: 'FACE BUTTONS', c: COLORS.BRIGHT_YELLOW },
        { t: '[A] Confirm          Confirm / Act / Select' },
        { t: '  Keyboard: Enter or Space' },
        { t: '[B] Cancel           Back / Close / Cancel' },
        { t: '  Keyboard: Escape' },
        { t: '[X] Context Action   Talk / Attack / Pick up' },
        { t: '  Keyboard: T (talk), A (attack), G (grab)' },
        { t: '[Y] Context Action   Enter / Flee / Drop' },
        { t: '  Keyboard: E (enter), F (flee), D (drop)' },
        { t: '' },
        { h: 'SHOULDER BUTTONS', c: COLORS.BRIGHT_YELLOW },
        { t: '[L1] / [R1]          Cycle / Zoom / Abilities' },
        { t: '  Keyboard: - / +' },
        { t: '[L2] / [R2]          Cycle / Zoom / Abilities' },
        { t: '  Keyboard: - / +' },
        { t: '' },
        { h: 'META BUTTONS', c: COLORS.BRIGHT_YELLOW },
        { t: '[START]              Open game menu (FF-style)' },
        { t: '[SELECT]             Interact / Skip' },
        { t: '  Keyboard: Enter' },
      ],
      // 1: Context Actions (what buttons do per game state)
      [
        { h: 'OVERWORLD / LOCATION', c: COLORS.BRIGHT_CYAN },
        { t: '[A] Confirm          [B] Cancel' },
        { t: '[X] Talk to NPC      [Y] Enter building/dungeon' },
        { t: '[START] Game menu     Keyboard: T, E' },
        { t: '' },
        { h: 'DUNGEON', c: COLORS.BRIGHT_RED },
        { t: '[A] Confirm          [B] Cancel' },
        { t: '[X] Pick up item     [Y] Use stairs' },
        { t: '  Keyboard: G, >' },
        { t: '' },
        { h: 'COMBAT', c: COLORS.BRIGHT_RED },
        { t: '[A] Confirm action   [B] Cancel' },
        { t: '[X] Attack shortcut  [Y] Flee shortcut' },
        { t: '[L1] Ability 1       [R1] Ability 2' },
        { t: '[L2] Ability 3       [R2] Items' },
        { t: '  Keyboard: A, F, 1, 2, 3, I' },
        { t: '' },
        { h: 'DIALOGUE', c: COLORS.BRIGHT_CYAN },
        { t: 'D-Pad Up/Down        Browse options' },
        { t: '[A] Select option    [B] End conversation' },
        { t: '[X] Option A         [Y] Option B' },
        { t: '[L1] Option C        [R1] Option D' },
        { t: '' },
        { h: 'INVENTORY', c: COLORS.BRIGHT_CYAN },
        { t: 'D-Pad Up/Down        Browse items' },
        { t: '[A] Use / Equip      [B] Close' },
        { t: '[X] Equip shortcut   [Y] Drop item' },
        { t: '  Keyboard: E, D' },
        { t: '' },
        { h: 'SHOP', c: COLORS.BRIGHT_CYAN },
        { t: '[A] Buy/Sell item    [B] Leave shop' },
        { t: '[X] Buy tab          [Y] Sell tab' },
        { t: '  Keyboard: B, S' },
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
        { t: '~ River       Flowing water, impassable without bridge' },
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
        { t: 'D-Pad to move — the world has no edge.' },
        { t: 'New lands generate seamlessly as you move.' },
        { t: '[START] menu to view map at any time.' },
        { t: 'Roads connect nearby towns and outposts.' },
      ],
      // 3: Dungeons & Towers
      [
        { h: 'DUNGEON CONTROLS', c: COLORS.BRIGHT_RED },
        { t: 'D-Pad                Move through chambers' },
        { t: '[X]                  Pick up item on the ground' },
        { t: '[Y]                  Use stairs (ascend/descend)' },
        { t: '[B]                  Flee dungeon to overworld' },
        { t: '  Keyboard: G, >, Escape' },
        { t: '' },
        { h: 'MENUS (via START)', c: COLORS.BRIGHT_YELLOW },
        { t: 'Press [START] to open the game menu.' },
        { t: 'From there: Inventory, Character, Quest Log,' },
        { t: 'Quest Compass, Settings, Help.' },
        { t: '  Keyboard shortcuts: I, C, Q, J, O, ?' },
        { t: '' },
        { h: 'DUNGEONS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Explore chambers, fight monsters, find treasure.' },
        { t: 'Stand on > and press [Y] to descend deeper.' },
        { t: 'Stand on < and press [Y] to ascend.' },
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
        { t: 'Enter from the overworld with [Y] when standing' },
        { t: 'on the ruin marker (\u00a7).' },
      ],
      // 4: Combat
      [
        { h: 'COMBAT SYSTEM', c: COLORS.BRIGHT_RED },
        { t: 'Combat is turn-based. You and the enemy take' },
        { t: 'turns choosing actions.' },
        { t: '' },
        { h: 'COMBAT CONTROLS', c: COLORS.BRIGHT_YELLOW },
        { t: 'D-Pad Up/Down        Navigate action menu' },
        { t: '[A]                  Confirm selected action' },
        { t: '[X]                  Attack (direct shortcut)' },
        { t: '[Y]                  Flee (direct shortcut)' },
        { t: '[L1] / [R1]          Ability slot 1 / 2' },
        { t: '[L2]                 Ability slot 3' },
        { t: '[R2]                 Open items' },
        { t: '  Keyboard: A, F, 1, 2, 3, I' },
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
        { t: 'Walk adjacent to an NPC and press [X] or [A]' },
        { t: 'to start a conversation.' },
        { t: '  Keyboard: T or Enter' },
        { t: '' },
        { h: 'DIALOGUE CONTROLS', c: COLORS.BRIGHT_YELLOW },
        { t: 'D-Pad Up/Down        Browse dialogue options' },
        { t: '[A]                  Select highlighted option' },
        { t: '[X] Opt A  [Y] Opt B Quick-select by slot' },
        { t: '[L1] Opt C [R1] Opt D' },
        { t: '[B]                  End conversation' },
        { t: '  Keyboard: A/B/C/D for quick-select, Esc to end' },
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
        { t: 'Enter buildings with [Y] at the door (+).' },
        { t: 'Press [B] to leave a settlement.' },
      ],
      // 6: Systems
      [
        { h: 'DAY & NIGHT', c: COLORS.BRIGHT_CYAN },
        { t: 'Time advances as you move (0.5h per step) and' },
        { t: 'when you rest (8 hours). The HUD shows the' },
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
        { h: 'FACTIONS', c: COLORS.BRIGHT_CYAN },
        { t: 'Eight factions track your reputation. Clearing' },
        { t: 'monsters improves guard and merchant standing.' },
        { t: 'Standings: Hostile < Unfriendly < Neutral' },
        { t: '           < Friendly < Allied' },
        { t: '  Access via [START] menu or keyboard F' },
        { t: '' },
        { h: 'QUESTS', c: COLORS.BRIGHT_CYAN },
        { t: 'Accept quests from townsfolk. Track objectives' },
        { t: 'and rewards in the quest log. Some quests are' },
        { t: 'generated from world events (treasure maps, etc).' },
        { t: '  Access via [START] menu or keyboard Q/J' },
        { t: '' },
        { h: 'WORLD EVENTS', c: COLORS.BRIGHT_CYAN },
        { t: 'Festivals, plagues, monster incursions, magical' },
        { t: 'darkness, caravans, and bandit raids occur over' },
        { t: 'time. Events affect prices and more.' },
        { t: '' },
        { h: 'SETTINGS', c: COLORS.BRIGHT_CYAN },
        { t: 'Access via [START] menu or keyboard O.' },
        { t: '1  Toggle CRT effects on/off' },
        { t: '2  Cycle font size (12-20)' },
        { t: '3  Toggle touch controls' },
        { t: '4  Cycle auto-save interval (50/100/200/500)' },
        { t: '5  Toggle CRT glow (when CRT on)' },
        { t: '6  Toggle CRT scanlines (when CRT on)' },
        { t: '7  Toggle CRT aberration (when CRT on)' },
      ],
      // 7: Keyboard Map & Tips
      [
        { h: 'KEYBOARD → CONTROLLER MAP', c: COLORS.BRIGHT_GREEN },
        { t: 'Keyboard keys map to virtual controller buttons.' },
        { t: 'All input pipes through the same controller.' },
        { t: '' },
        { t: 'Arrows/WASD  → D-Pad        Numpad    → Diagonals' },
        { t: 'Enter/Space  → [A] Confirm   Escape    → [B] Cancel' },
        { t: 'T            → [X] Talk      E         → [Y] Enter' },
        { t: 'G            → [X] Grab      D         → [Y] Drop' },
        { t: '-            → [L1]          +         → [R1]' },
        { t: '' },
        { h: 'KEYBOARD MENU SHORTCUTS', c: COLORS.BRIGHT_GREEN },
        { t: 'These keys open menus directly (same as picking' },
        { t: 'them from the [START] game menu):' },
        { t: '' },
        { t: 'I  Inventory    C  Character    Q  Quest Log' },
        { t: 'J  Compass      M  Map          F  Factions' },
        { t: 'O  Settings     L  Almanac      P  Quick Save' },
        { t: '?  Help         `  Debug        F2 Debug Bar' },
        { t: '' },
        { h: 'TIPS', c: COLORS.BRIGHT_GREEN },
        { t: '- Save often (keyboard P). No resurrection.' },
        { t: '- Rest to recover HP and MP between fights.' },
        { t: '- Carry healing potions for emergencies.' },
        { t: '- Check character sheet after leveling up.' },
        { t: '- Follow roads to find nearby settlements.' },
        { t: '- Dungeons and towers have the best treasure.' },
        { t: '- High CHA gives better prices at merchants.' },
        { t: '- Carry a light source for safer night travel.' },
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
      'L1/R1:Tab  \u25C4\u25BA:Tab  \u25B2\u25BC:Scroll  [B]:Close', COLORS.BRIGHT_BLACK, bg, panelW - 4);
  }

  // ─── FF-STYLE GAMEPAD MENU (Start button overlay) ───

  drawGamepadMenu(renderer, player, menuItems, cursor) {
    const r = renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;

    // Menu panel — left side of screen
    const panelW = Math.min(28, cols - 4);
    const itemCount = menuItems.length;
    const panelH = itemCount * 2 + 7; // 2 lines per item + header + footer
    const px = 2;
    const py = Math.max(2, Math.floor((rows - panelH) / 2));

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Menu ');

    // Player info header
    if (player) {
      const nameStr = player.name || 'Hero';
      const lvlStr = `Lv ${player.stats?.level || 1}`;
      r.drawString(px + 2, py + 2, nameStr, COLORS.BRIGHT_WHITE, bg);
      r.drawString(px + panelW - lvlStr.length - 2, py + 2, lvlStr, COLORS.BRIGHT_YELLOW, bg);

      // HP / MP bar
      const hp = player.stats?.hp || 0;
      const maxHp = player.stats?.maxHp || 1;
      const mp = player.stats?.mana || 0;
      const maxMp = player.stats?.maxMana || 1;
      r.drawString(px + 2, py + 3, `HP ${hp}/${maxHp}`, hp > maxHp * 0.3 ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED, bg);
      r.drawString(px + panelW / 2 + 1, py + 3, `MP ${mp}/${maxMp}`, COLORS.BRIGHT_CYAN, bg);

      // Separator
      r.drawString(px + 1, py + 4, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);
    }

    // Menu items
    const startY = py + 5;
    for (let i = 0; i < itemCount; i++) {
      const item = menuItems[i];
      const y = startY + i * 2;
      const selected = i === cursor;
      const fg = selected ? COLORS.BRIGHT_WHITE : COLORS.WHITE;
      const icon = item.icon || ' ';

      // Cursor indicator
      if (selected) {
        r.drawString(px + 2, y, '\u25BA', COLORS.BRIGHT_YELLOW, bg);
      }
      r.drawString(px + 4, y, icon, COLORS.BRIGHT_CYAN, bg);
      r.drawString(px + 6, y, item.label, fg, bg);
    }

    // Footer hint
    r.drawString(px + 2, py + panelH - 2, '\u25B2\u25BC:Select  A:Open  B:Close', COLORS.BRIGHT_BLACK, bg);
  }

  // ─── REST ITEM SELECTION ───

  drawRestItemSelect(renderer, restItems, cursor) {
    const r = renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;

    const itemCount = restItems.length;
    const panelW = Math.min(36, cols - 4);
    const panelH = itemCount * 2 + 7;
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.max(2, Math.floor((rows - panelH) / 2));

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Use Rest Item ');

    // Header
    r.drawString(px + 2, py + 2, 'Select an item to rest with:', COLORS.BRIGHT_WHITE, bg);

    // Separator
    r.drawString(px + 1, py + 3, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);

    // Item list
    const startY = py + 4;
    for (let i = 0; i < itemCount; i++) {
      const item = restItems[i];
      const y = startY + i * 2;
      const selected = i === cursor;
      const fg = selected ? COLORS.BRIGHT_WHITE : COLORS.WHITE;

      // Cursor
      if (selected) {
        r.drawString(px + 2, y, '\u25BA', COLORS.BRIGHT_YELLOW, bg);
      }

      // Item icon + name
      r.drawString(px + 4, y, item.char || '\u25B2', item.color || COLORS.BRIGHT_CYAN, bg);
      r.drawString(px + 6, y, item.name, fg, bg);

      // Effect description on same line, right-aligned
      let effectStr = '';
      if (item.subtype === 'cottage') {
        effectStr = 'Full HP+MP';
      } else if (item.effect?.heal) {
        effectStr = `+${item.effect.heal} HP`;
      } else {
        effectStr = '+10 HP';
      }
      r.drawString(px + panelW - effectStr.length - 2, y, effectStr, COLORS.BRIGHT_GREEN, bg);
    }

    // Footer
    r.drawString(px + 2, py + panelH - 2, '\u25B2\u25BC:Select  Enter:Use  Esc:Back', COLORS.BRIGHT_BLACK, bg);
  }

  // ─── SETTINGS (FF-style Config) ───

  drawSettings(settings) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const panelW = Math.min(cols - 4, 50);
    const panelH = settings.crtEffects ? 35 : 26;
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Config ');

    const items = [
      { key: '1', label: 'CRT Effects', value: settings.crtEffects ? 'ON' : 'OFF', color: settings.crtEffects ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
      { key: '2', label: 'Font Size', value: `${settings.fontSize}px`, color: COLORS.BRIGHT_YELLOW },
      { key: '3', label: 'Touch Controls', value: settings.touchControls ? 'ON' : 'OFF', color: settings.touchControls ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
      { key: '4', label: 'Auto-Save', value: `${settings.autoSaveInterval} turns`, color: COLORS.BRIGHT_YELLOW },
      { key: '5', label: 'Quest Nav', value: settings.showQuestNav !== false ? 'ON' : 'OFF', color: settings.showQuestNav !== false ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
      { key: 'V', label: 'Music Volume', value: `${Math.round((settings.musicVolume ?? 0.5) * 100)}%`, color: COLORS.BRIGHT_YELLOW },
      { key: 'M', label: 'Music', value: settings.musicMuted ? 'MUTED' : 'ON', color: settings.musicMuted ? COLORS.BRIGHT_RED : COLORS.BRIGHT_GREEN },
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
        { key: '`', label: 'CRT Resolution', value: (settings.crtResolution || 'auto').toUpperCase(), color: COLORS.BRIGHT_YELLOW },
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

  drawLoadingModal(step) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;

    // Fill background with animated circuit line effect
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = _getCircuitryCell(x, y);
        r.drawChar(x, y, cell.char, cell.fg, cell.bg);
      }
    }

    // Centered modal box
    const boxW = Math.min(cols - 4, 48);
    const boxH = 11;
    const bx = Math.floor((cols - boxW) / 2);
    const by = Math.floor((rows - boxH) / 2);

    r.drawBox(bx, by, boxW, boxH, COLORS.FF_BORDER, COLORS.FF_BLUE_DARK, ' Forging the World ');

    // Animated spinner
    const t = Date.now() / 200;
    const spinChars = ['\u25DC', '\u25DD', '\u25DE', '\u25DF']; // ◜ ◝ ◞ ◟
    const spin = spinChars[Math.floor(t) % spinChars.length];
    const spinColor = [COLORS.BRIGHT_CYAN, COLORS.CYAN, COLORS.BRIGHT_BLUE, COLORS.BLUE][Math.floor(t) % 4];

    // Title with spinner
    const title = `${spin} Forging the World ${spin}`;
    r.drawString(bx + Math.floor((boxW - title.length) / 2), by + 2, title, spinColor);

    // Step label
    const label = step.label || 'Loading...';
    r.drawString(bx + Math.floor((boxW - label.length) / 2), by + 4, label, COLORS.BRIGHT_WHITE);

    // Progress bar
    const barW = boxW - 8;
    const filled = Math.floor((step.current / step.total) * barW);
    const empty = barW - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty); // █ and ░
    const pctText = `${step.current}/${step.total}`;
    r.drawString(bx + 3, by + 6, '[', COLORS.BRIGHT_BLACK);
    r.drawString(bx + 4, by + 6, bar, COLORS.BRIGHT_CYAN);
    r.drawString(bx + 4 + barW, by + 6, ']', COLORS.BRIGHT_BLACK);
    r.drawString(bx + Math.floor((boxW - pctText.length) / 2), by + 8, pctText, COLORS.WHITE);

    // Animated dots
    const dots = '.'.repeat(Math.floor(t / 2) % 4);
    r.drawString(bx + Math.floor((boxW - label.length) / 2) + label.length, by + 4, dots, COLORS.BRIGHT_BLACK);
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

  handleHorizontalMenuInput(key, itemCount) {
    if (key === 'ArrowLeft' || key === 'a') {
      this.selectedIndex = (this.selectedIndex - 1 + itemCount) % itemCount;
      return 'move';
    }
    if (key === 'ArrowRight' || key === 'd') {
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
    this.menuScrollOffset = 0;
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
          options: ['auto','clear','rain','storm','fog','snow','sandstorm','acid_rain','coolant_mist','ember_rain','data_storm','nano_haze','ion_storm','blood_rain'] },
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
          options: ['auto','clear','rain','storm','fog','snow','sandstorm','acid_rain','coolant_mist','ember_rain','data_storm','nano_haze','ion_storm','blood_rain'] },
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

  // ─── DEBUG BUTTON BAR ───

  /**
   * Draw a compact debug button bar at the bottom of the viewport.
   * Returns array of {x, y, w, h, action} rects for click hit testing.
   */
  drawDebugButtons(debug, timeSystem, weatherSystem, renderer) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const barY = rows - 2; // one row above bottom border
    const bg = '#1A1A2A';
    const onColor = '#44FF44';
    const offColor = '#FF4444';
    const actionColor = '#AAAAFF';

    const buttons = [
      { label: 'H-', action: 'hourDec', type: 'action' },
      { label: 'H+', action: 'hourInc', type: 'action' },
      { label: 'W<', action: 'weatherPrev', type: 'action' },
      { label: 'W>', action: 'weatherNext', type: 'action' },
      { label: 'Shd', action: 'disableShadows', type: 'toggle', value: debug.disableShadows },
      { label: 'Lit', action: 'disableLighting', type: 'toggle', value: debug.disableLighting },
      { label: 'Cld', action: 'disableClouds', type: 'toggle', value: debug.disableClouds },
      { label: 'CRT', action: 'crtEffects', type: 'toggle', value: renderer.effectsEnabled },
      { label: 'Enc', action: 'noEncounters', type: 'toggle', value: debug.noEncounters },
      { label: 'Clp', action: 'noClip', type: 'toggle', value: debug.noClip },
      { label: 'Inv', action: 'invincible', type: 'toggle', value: debug.invincible },
    ];

    // Background bar
    for (let x = 0; x < cols; x++) {
      r.drawChar(x, barY, ' ', bg, bg);
    }

    const rects = [];
    let cx = 1;
    for (const btn of buttons) {
      const label = `[${btn.label}]`;
      const w = label.length;
      if (cx + w >= cols - 1) break;

      let fg;
      if (btn.type === 'toggle') {
        fg = btn.value ? onColor : offColor;
      } else {
        fg = actionColor;
      }

      r.drawString(cx, barY, label, fg, bg);
      rects.push({ x: cx, y: barY, w, h: 1, action: btn.action });
      cx += w + 1;
    }

    // Show current hour and weather on the bar
    if (timeSystem && cx + 10 < cols) {
      const info = `H:${timeSystem.hour}`;
      r.drawString(cols - 16, barY, info, '#888888', bg);
    }
    if (weatherSystem && cx + 10 < cols) {
      const wInfo = weatherSystem.current.slice(0, 6);
      r.drawString(cols - 8, barY, wInfo, '#888888', bg);
    }

    return rects;
  }

  // ─── ALMANAC (World History Viewer) ───

  drawAlmanac(worldHistoryGen, messageLog, player) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 80);
    const panelH = Math.min(rows - 2, 42);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);
    const bg = COLORS.FF_BLUE_DARK;

    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER, bg, ' Discovery Journal ');

    // New tabs: discovery-based instead of omniscient
    const tabs = ['Journal', 'History', 'People', 'Artifacts', 'Rumors'];
    const tab = this.almanacTab || 0;
    // Clamp tab to valid range for new tab count
    const clampedTab = Math.min(tab, tabs.length - 1);
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
        const color = i === clampedTab ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
        r.drawString(tx, py + 1 + rowIdx, label, color, bg);
        tx += label.length + 1;
      }
    }
    const tabBarHeight = tabRows.length;
    r.drawString(px + 1, py + 1 + tabBarHeight, '\u2500'.repeat(panelW - 2), COLORS.FF_BORDER, bg);

    const contentY = py + 2 + tabBarHeight;
    const contentH = panelH - 4 - tabBarHeight;
    const w = panelW - 4;

    const lines = [];
    const addLine = (text, color) => lines.push({ t: text || '', c: color || COLORS.WHITE });
    const addHeader = (text, color) => lines.push({ t: text, c: color || COLORS.BRIGHT_YELLOW });
    const addBlank = () => lines.push({ t: '', c: COLORS.WHITE });

    const dl = player?.discoveredLore || {};
    const emptyMsg = 'You haven\'t learned anything about this yet.';
    const hintMsg = 'Talk to scholars, explore ruins, and listen carefully.';

    if (clampedTab === 0) {
      // Journal — chronological summary of all discoveries
      addHeader('DISCOVERY JOURNAL', COLORS.BRIGHT_CYAN);
      addBlank();

      // Gather all discovered entries, sorted by discovery time
      const allEntries = [];
      for (const [cat, entries] of Object.entries(dl)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          allEntries.push({ ...entry, category: cat });
        }
      }
      allEntries.sort((a, b) => (a.discoveredAt || 0) - (b.discoveredAt || 0));

      if (allEntries.length === 0) {
        addLine(`  ${emptyMsg}`, COLORS.BRIGHT_BLACK);
        addLine(`  ${hintMsg}`, COLORS.BRIGHT_BLACK);
        addBlank();
        addLine('  Your journey of discovery begins now.', COLORS.BRIGHT_BLACK);
        addLine('  Seek out scholars and priests for knowledge.', COLORS.BRIGHT_BLACK);
        addLine('  Listen to rumors at taverns.', COLORS.BRIGHT_BLACK);
        addLine('  Explore the world to uncover its secrets.', COLORS.BRIGHT_BLACK);
      } else {
        const catLabels = {
          locations: 'Location', history: 'History', figures: 'Figure',
          artifacts: 'Artifact', civilizations: 'Civilization', forbidden: 'Forbidden',
          rumors: 'Rumor', traditions: 'Tradition', religions: 'Religion',
        };
        const catColors = {
          locations: COLORS.BRIGHT_GREEN, history: COLORS.BRIGHT_CYAN,
          figures: COLORS.BRIGHT_WHITE, artifacts: COLORS.BRIGHT_YELLOW,
          civilizations: COLORS.BRIGHT_MAGENTA, forbidden: COLORS.BRIGHT_RED,
          rumors: COLORS.WHITE, traditions: COLORS.BRIGHT_BLUE,
          religions: COLORS.BRIGHT_MAGENTA,
        };

        addLine(`  ${allEntries.length} discoveries recorded`, COLORS.BRIGHT_WHITE);
        addBlank();

        for (const entry of allEntries) {
          const label = catLabels[entry.category] || entry.category;
          const color = catColors[entry.category] || COLORS.WHITE;
          addLine(`  [${label}] from ${entry.source || 'Unknown'}`, color);
          const wrapped = wordWrap(entry.text, w - 4);
          for (const line of wrapped) addLine(`    ${line}`, COLORS.BRIGHT_BLACK);
          addBlank();
        }
      }
    } else if (clampedTab === 1) {
      // History — discovered historical events, wars, traditions, religions
      addHeader('DISCOVERED HISTORY', COLORS.BRIGHT_CYAN);
      addBlank();

      const historyEntries = [
        ...(dl.history || []),
        ...(dl.traditions || []),
        ...(dl.religions || []),
        ...(dl.civilizations || []),
        ...(dl.forbidden || []),
      ];

      if (historyEntries.length === 0) {
        addLine(`  ${emptyMsg}`, COLORS.BRIGHT_BLACK);
        addLine(`  ${hintMsg}`, COLORS.BRIGHT_BLACK);
      } else {
        for (const entry of historyEntries) {
          addLine(`  Learned from ${entry.source || 'Unknown'}:`, COLORS.BRIGHT_YELLOW);
          const wrapped = wordWrap(entry.text, w - 4);
          for (const line of wrapped) addLine(`    ${line}`, COLORS.WHITE);
          addBlank();
        }
      }
    } else if (clampedTab === 2) {
      // People — discovered historical figures and NPC stories
      addHeader('PEOPLE & FIGURES', COLORS.BRIGHT_CYAN);
      addBlank();

      const figureEntries = dl.figures || [];
      if (figureEntries.length === 0) {
        addLine(`  ${emptyMsg}`, COLORS.BRIGHT_BLACK);
        addLine('  Ask scholars about the great figures of history.', COLORS.BRIGHT_BLACK);
      } else {
        for (const entry of figureEntries) {
          addLine(`  Learned from ${entry.source || 'Unknown'}:`, COLORS.BRIGHT_YELLOW);
          const wrapped = wordWrap(entry.text, w - 4);
          for (const line of wrapped) addLine(`    ${line}`, COLORS.WHITE);
          addBlank();
        }
      }
    } else if (clampedTab === 3) {
      // Artifacts — discovered artifacts and relics
      addHeader('ARTIFACTS & RELICS', COLORS.BRIGHT_CYAN);
      addBlank();

      const artifactEntries = dl.artifacts || [];
      if (artifactEntries.length === 0) {
        addLine(`  ${emptyMsg}`, COLORS.BRIGHT_BLACK);
        addLine('  Explore ruins and ask scholars about lost relics.', COLORS.BRIGHT_BLACK);
      } else {
        for (const entry of artifactEntries) {
          addLine(`  Learned from ${entry.source || 'Unknown'}:`, COLORS.BRIGHT_YELLOW);
          const wrapped = wordWrap(entry.text, w - 4);
          for (const line of wrapped) addLine(`    ${line}`, COLORS.WHITE);
          addBlank();
        }
      }
    } else if (clampedTab === 4) {
      // Rumors — collected gossip and hearsay
      addHeader('RUMORS & GOSSIP', COLORS.BRIGHT_CYAN);
      addBlank();

      const rumorEntries = [
        ...(dl.rumors || []),
        ...(dl.locations || []),
      ];

      if (rumorEntries.length === 0) {
        addLine(`  ${emptyMsg}`, COLORS.BRIGHT_BLACK);
        addLine('  Visit taverns and talk to people around town.', COLORS.BRIGHT_BLACK);
      } else {
        for (const entry of rumorEntries) {
          addLine(`  ${entry.source || 'Someone'} said:`, COLORS.BRIGHT_YELLOW);
          const wrapped = wordWrap(`"${entry.text}"`, w - 4);
          for (const line of wrapped) addLine(`    ${line}`, COLORS.WHITE);
          addBlank();
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
      'Left/Right:Tab  Up/Down:Scroll  1-5:Tab  Esc:Close', COLORS.BRIGHT_BLACK, bg, w);
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
