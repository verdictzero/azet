import { COLORS } from './engine.js';

export class UIManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.activePanel = null;
    this.messageLog = [];
    this.maxMessages = 50;
    this.visibleMessages = 5;
    this.messageScroll = 0;
    this.dialogueState = null;
    this.shopState = null;
    this.menuState = null;
    this.selectedIndex = 0;
    this.confirmCallback = null;
    this.confirmMessage = null;
  }

  addMessage(text, color = COLORS.WHITE) {
    this.messageLog.unshift({ text, color, turn: Date.now() });
    if (this.messageLog.length > this.maxMessages) this.messageLog.pop();
    this.messageScroll = 0;
  }

  // ─── HUD ───

  drawHUD(player, timeSystem, gameState, statusEffects = [], weatherSystem = null) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;

    // Top bar
    r.fillRect(0, 0, cols, 1, ' ', COLORS.BLACK, COLORS.BLUE);
    const hp = `HP:${player.stats.hp}/${player.stats.maxHp}`;
    const mp = `MP:${player.stats.mana}/${player.stats.maxMana}`;
    const lv = `Lv:${player.stats.level}`;
    const gold = `$${player.gold}`;
    const loc = gameState.currentLocationName || 'Uncharted Wilds';

    r.drawString(1, 0, loc, COLORS.BRIGHT_WHITE, COLORS.BLUE);

    // Weather indicator on top bar
    if (weatherSystem && weatherSystem.current !== 'clear') {
      const weatherIcons = { rain: '♒', snow: '❄', storm: '⚡', fog: '≈', sandstorm: '≈', cloudy: '☁' };
      const wIcon = weatherIcons[weatherSystem.current] || '';
      r.drawString(loc.length + 3, 0, wIcon, COLORS.BRIGHT_CYAN, COLORS.BLUE);
    }

    // Clock + solar/lunar cycle indicator
    if (timeSystem) {
      const h = timeSystem.hour;
      const hh = String(Math.floor(h)).padStart(2, '0');
      const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
      const clock = `D${timeSystem.day} ${hh}:${mm}`;

      // Lunar phase from day (29.5-day cycle)
      const lunarPhase = (timeSystem.day % 30) / 30;
      const lunarChars = ['●', '◗', '◑', '◖', '○', '◗', '◑', '◖'];
      const moonChar = lunarChars[Math.floor(lunarPhase * 8) % 8];

      // Solar cycle bar: 6 chars showing sun position through the day
      // Sun rises ~6, sets ~20. Map hour to a position in the bar.
      const barW = 8;
      const sunPos = Math.floor((h / 24) * barW);
      let cycleBar = '';
      let cycleColors = [];
      for (let i = 0; i < barW; i++) {
        if (i === sunPos && h >= 5 && h < 20) {
          cycleBar += '☀';
          cycleColors.push(COLORS.BRIGHT_YELLOW);
        } else if (i === sunPos && (h < 5 || h >= 20)) {
          cycleBar += '☾';
          cycleColors.push(COLORS.BRIGHT_CYAN);
        } else if (i >= Math.floor((5 / 24) * barW) && i <= Math.floor((20 / 24) * barW)) {
          cycleBar += '─';
          cycleColors.push(COLORS.BRIGHT_BLACK);
        } else {
          cycleBar += '─';
          cycleColors.push(COLORS.BLUE);
        }
      }

      // Draw from right: [moon] [cycle bar] [clock]
      const rightStr = `${moonChar} ${clock}`;
      const rightX = cols - rightStr.length - 1;
      r.drawString(rightX, 0, rightStr,
        h >= 20 || h < 5 ? COLORS.BRIGHT_CYAN : COLORS.BRIGHT_YELLOW, COLORS.BLUE);

      // Draw cycle bar character by character for individual colors
      const barX = rightX - barW - 1;
      for (let i = 0; i < barW; i++) {
        r.drawChar(barX + i, 0, cycleBar[i], cycleColors[i], COLORS.BLUE);
      }
    }

    // Bottom stats bar
    const barY = rows - 7;
    r.fillRect(0, barY, cols, 1, ' ', COLORS.BLACK, COLORS.BLACK);
    r.drawString(1, barY, hp, player.stats.hp < player.stats.maxHp * 0.3 ? COLORS.BRIGHT_RED : COLORS.BRIGHT_GREEN);
    r.drawString(hp.length + 2, barY, mp, COLORS.BRIGHT_CYAN);
    r.drawString(hp.length + mp.length + 3, barY, lv, COLORS.BRIGHT_YELLOW);
    r.drawString(hp.length + mp.length + lv.length + 4, barY, gold, COLORS.BRIGHT_YELLOW);

    // Status effects bar
    if (statusEffects && statusEffects.length > 0) {
      let sx = hp.length + mp.length + lv.length + gold.length + 6;
      for (const effect of statusEffects) {
        const effectColors = {
          poisoned: COLORS.GREEN,
          weakened: COLORS.YELLOW,
          exposed: COLORS.RED,
          rooted: COLORS.GREEN,
          shielded: COLORS.BRIGHT_CYAN,
        };
        const color = effectColors[effect.name] || COLORS.BRIGHT_BLACK;
        const tag = `[${effect.name.toUpperCase()}:${effect.duration}]`;
        if (sx + tag.length < cols - 25) {
          r.drawString(sx, barY, tag, color);
          sx += tag.length + 1;
        }
      }
    }

    // HP bar
    const barWidth = 20;
    const hpFill = Math.round((player.stats.hp / player.stats.maxHp) * barWidth);
    const hpBar = '█'.repeat(hpFill) + '░'.repeat(barWidth - hpFill);
    r.drawString(cols - barWidth - 2, barY, '[' + hpBar + ']',
      player.stats.hp < player.stats.maxHp * 0.3 ? COLORS.RED : COLORS.GREEN);

    // Message log
    this.drawMessageLog(rows);
  }

  /**
   * Draw a minimap in the top-right corner during sealed zone exploration.
   */
  drawMinimap(renderer, dungeon, player, enemies = []) {
    if (!dungeon || !dungeon.tiles) return;

    const r = renderer;
    const mapW = 14;
    const mapH = 10;
    const startX = r.cols - mapW - 2;
    const startY = 1;

    r.drawBox(startX, startY, mapW + 2, mapH + 2, COLORS.BRIGHT_BLACK, COLORS.BLACK, ' MAP ');

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
    const logY = rows - 6;
    const logH = 6;

    r.fillRect(0, logY, cols, logH, ' ', COLORS.BLACK, COLORS.BLACK);

    const start = this.messageScroll;
    const end = Math.min(start + logH, this.messageLog.length);

    for (let i = start; i < end; i++) {
      const msg = this.messageLog[i];
      const y = logY + (i - start);
      const text = msg.text.length > cols - 2 ? msg.text.substring(0, cols - 3) + '…' : msg.text;
      const alpha = i === 0 ? COLORS.BRIGHT_WHITE : (i < 3 ? msg.color : COLORS.BRIGHT_BLACK);
      r.drawString(1, y, text, i === 0 ? msg.color : alpha);
    }
  }

  // ─── MAIN MENU ───

  drawMainMenu(cols, rows) {
    const r = this.renderer;
    r.clear();

    const title = [
      '    .  *  .    *    .  *    .     *  .    * ',
      ' *    _____              _ _ _____                _   ',
      '  .  /  _  | ___  ___  |_|_|  _  | _  _ _  ___ | |_ ',
      '    |  _  ||_ -||  _| | | |  _  || || | -_||_ -||  _|',
      '  * |_| |_||___||___| |_|_|__  _||___|_|___|___||_|  ',
      '    .    *    .    *   |_____|  .    *    .    *   ',
      '  ╔═╦═══════════════════════════════════════╦═╗',
      '  ║~║  .:*~*:.  REALM OF RUNES  .:*~*:.   ║~║',
      '  ╚═╩═══════════════════════════════════════╩═╝',
      '       /\\    /\\        /\\    /\\        /\\     ',
      '      /  \\  /  \\  ^^  /  \\  /  \\  ^^  /  \\   ',
      '     /    \\/    \\/||\\/    \\/    \\/||\\/    \\  ',
      '    ~~~  ~~~~~~  ~~~~  ~~~~~~  ~~~~  ~~~~~~  ~~~',
    ];

    const startY = Math.floor(rows / 2) - 12;
    const titleWidth = 56;
    const startX = Math.floor((cols - titleWidth) / 2);

    const t = Date.now() / 1000;
    for (let i = 0; i < title.length; i++) {
      let color;
      if (i <= 5) {
        // Title text: shimmer through warm colors
        const shift = Math.floor(t * 2 + i) % 6;
        const titleColors = [COLORS.BRIGHT_MAGENTA, COLORS.BRIGHT_RED, COLORS.BRIGHT_YELLOW,
          COLORS.BRIGHT_GREEN, COLORS.BRIGHT_CYAN, COLORS.BRIGHT_BLUE];
        color = titleColors[shift];
      } else if (i <= 8) {
        // Banner: golden glow
        color = Math.sin(t * 2) > 0 ? COLORS.BRIGHT_YELLOW : COLORS.YELLOW;
      } else {
        // Scenery: green forest
        color = COLORS.BRIGHT_GREEN;
      }
      r.drawString(startX, startY + i, title[i], color);
    }

    // Draw twinkling stars
    const starPositions = [[4,0],[14,0],[24,0],[34,0],[44,0],[1,5],[11,5],[21,5],[31,5],[41,5]];
    for (const [sx, sy] of starPositions) {
      const twinkle = Math.sin(t * 3 + sx + sy * 7) > 0.3;
      if (twinkle && startX + sx < cols) {
        r.drawString(startX + sx, startY + sy, '*', COLORS.BRIGHT_WHITE);
      }
    }

    const subtitle = '~ A Whimsical Dungeon Crawl in Pure ASCII ~';
    r.drawString(Math.floor((cols - subtitle.length) / 2), startY + title.length + 1,
      subtitle, COLORS.BRIGHT_BLACK);

    const menuItems = ['[N] New Game', '[C] Continue', '[S] Settings', '[H] Help'];
    const menuY = startY + title.length + 4;

    for (let i = 0; i < menuItems.length; i++) {
      const color = i === this.selectedIndex ? COLORS.BRIGHT_WHITE : COLORS.WHITE;
      const prefix = i === this.selectedIndex ? '> ' : '  ';
      r.drawString(Math.floor((cols - 20) / 2), menuY + i * 2, prefix + menuItems[i], color);
    }

    const footer = 'Use arrow keys to select, Enter to confirm';
    r.drawString(Math.floor((cols - footer.length) / 2), rows - 3, footer, COLORS.BRIGHT_BLACK);

    // Animated scanline effect text
    const flicker = Math.sin(t * 3) > 0.5 ? COLORS.BRIGHT_GREEN : COLORS.GREEN;
    r.drawString(Math.floor((cols - 10) / 2), rows - 5, '>> PLAY <<', flicker);
  }

  // ─── CHARACTER CREATION ───

  drawCharCreation(charGenState) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    r.clear();

    r.drawBox(2, 1, cols - 4, rows - 2, COLORS.CYAN, COLORS.BLACK, ' CHARACTER CREATION ');

    const step = charGenState.step;

    if (step === 'race') {
      r.drawString(4, 3, 'Choose your race:', COLORS.BRIGHT_WHITE);
      const races = ['Human', 'Elf', 'Dwarf', 'Orc', 'Halfling'];
      const descs = [
        'Adaptable and resilient folk of the settled lands',
        'Long-lived keepers of old knowledge from the high places',
        'Stout miners and craftsmen of the deep halls',
        'Hardy outcasts from the blighted wastes, marked by old corruption',
        'Nimble tunnel-folk who know every hidden passage'
      ];
      for (let i = 0; i < races.length; i++) {
        const sel = i === this.selectedIndex;
        r.drawString(6, 5 + i * 3, (sel ? '> ' : '  ') + races[i],
          sel ? COLORS.BRIGHT_YELLOW : COLORS.WHITE);
        r.drawString(8, 6 + i * 3, descs[i], COLORS.BRIGHT_BLACK);
      }
    } else if (step === 'class') {
      r.drawString(4, 3, 'Choose your class:', COLORS.BRIGHT_WHITE);
      const classes = ['Warden', 'Arcanist', 'Rogue', 'Ranger'];
      const descs = [
        'Armored protectors of the settled roads',
        'Wielders of recovered ancient magic',
        'Cunning survivors who pick the old ruins clean',
        'Scouts who map the wilderness beyond the walls'
      ];
      for (let i = 0; i < classes.length; i++) {
        const sel = i === this.selectedIndex;
        r.drawString(6, 5 + i * 3, (sel ? '> ' : '  ') + classes[i],
          sel ? COLORS.BRIGHT_YELLOW : COLORS.WHITE);
        r.drawString(8, 6 + i * 3, descs[i], COLORS.BRIGHT_BLACK);
      }
    } else if (step === 'name') {
      r.drawString(4, 3, 'Enter your name:', COLORS.BRIGHT_WHITE);
      r.drawString(6, 5, '> ' + (charGenState.name || '') + '_', COLORS.BRIGHT_GREEN);
      r.drawString(6, 7, '(Type your name and press Enter)', COLORS.BRIGHT_BLACK);
      r.drawString(6, 8, '(Press R for a random name)', COLORS.BRIGHT_BLACK);
    } else if (step === 'confirm') {
      r.drawString(4, 3, 'Confirm your character:', COLORS.BRIGHT_WHITE);
      r.drawString(6, 5, `Name:  ${charGenState.name}`, COLORS.BRIGHT_CYAN);
      r.drawString(6, 6, `Race:  ${charGenState.race}`, COLORS.BRIGHT_CYAN);
      r.drawString(6, 7, `Class: ${charGenState.playerClass}`, COLORS.BRIGHT_CYAN);
      r.drawString(6, 9, '[Enter] Begin Adventure    [Esc] Start Over', COLORS.BRIGHT_YELLOW);
    }
  }

  // ─── DIALOGUE ───

  drawDialogue(dialogueState) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 60);
    const panelH = Math.min(rows - 4, 22);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.CYAN, COLORS.BLACK);

    // NPC name and title
    const nameStr = dialogueState.npcName;
    const repStr = `Rep: ${dialogueState.reputation >= 0 ? '+' : ''}${dialogueState.reputation}`;
    r.drawString(px + 2, py, ' ' + nameStr + ' ', COLORS.BRIGHT_YELLOW, COLORS.BLACK);
    r.drawString(px + panelW - repStr.length - 2, py, repStr,
      dialogueState.reputation >= 0 ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED);

    // Dialogue text with word wrap
    const textLines = this.wordWrap(dialogueState.text, panelW - 4);
    for (let i = 0; i < textLines.length && i < 6; i++) {
      r.drawString(px + 2, py + 2 + i, '"' + textLines[i] + '"', COLORS.BRIGHT_WHITE);
    }

    // Separator
    const sepY = py + 2 + Math.min(textLines.length, 6) + 1;
    r.drawString(px + 1, sepY, '─'.repeat(panelW - 2), COLORS.BRIGHT_BLACK);

    // Options
    const options = dialogueState.options;
    const optStartY = sepY + 1;
    for (let i = 0; i < options.length; i++) {
      const sel = i === this.selectedIndex;
      const letter = String.fromCharCode(65 + i);
      const text = `[${letter}] ${options[i].text}`;
      const truncated = text.length > panelW - 6 ? text.substring(0, panelW - 7) + '…' : text;
      r.drawString(px + 2, optStartY + i * 2, truncated,
        sel ? COLORS.BRIGHT_YELLOW : COLORS.WHITE);
      if (options[i].hint) {
        r.drawString(px + 6, optStartY + i * 2 + 1,
          '→ ' + options[i].hint, COLORS.BRIGHT_BLACK);
      }
    }
  }

  // ─── SHOP ───

  drawShop(shopState, player = null) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 65);
    const panelH = Math.min(rows - 4, 28);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.YELLOW, COLORS.BLACK);
    r.drawString(px + 2, py, ' ' + shopState.shopName + ' ', COLORS.BRIGHT_YELLOW, COLORS.BLACK);

    const goldStr = `Gold: ${shopState.playerGold}`;
    r.drawString(px + panelW - goldStr.length - 2, py, goldStr, COLORS.BRIGHT_YELLOW);

    const tab = shopState.tab; // 'buy' or 'sell'
    const buyColor = tab === 'buy' ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
    const sellColor = tab === 'sell' ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
    r.drawString(px + 2, py + 2, '[B]UY', buyColor);
    r.drawString(px + 10, py + 2, '[S]ELL', sellColor);

    const items = tab === 'buy' ? shopState.shopItems : shopState.playerItems;
    const listY = py + 4;
    const maxVisible = panelH - 8;

    for (let i = 0; i < Math.min(items.length, maxVisible); i++) {
      const item = items[i];
      const sel = i === this.selectedIndex;
      const price = tab === 'buy' ? item.buyPrice : item.sellPrice;
      const nameStr = item.name.substring(0, panelW - 20);
      const priceStr = `${price}g`;

      r.drawString(px + 2, listY + i,
        (sel ? '> ' : '  ') + nameStr,
        sel ? COLORS.BRIGHT_WHITE : item.color || COLORS.WHITE);
      r.drawString(px + panelW - priceStr.length - 3, listY + i,
        priceStr, COLORS.BRIGHT_YELLOW);
    }

    if (items.length === 0) {
      r.drawString(px + 4, listY + 1, 'Nothing available.', COLORS.BRIGHT_BLACK);
    }

    // Selected item details with equipment comparison
    if (items.length > 0 && this.selectedIndex < items.length) {
      const item = items[this.selectedIndex];
      const detY = py + panelH - 5;
      r.drawString(px + 1, detY, '─'.repeat(panelW - 2), COLORS.BRIGHT_BLACK);

      // Show item stats
      if (item.stats && Object.keys(item.stats).length > 0) {
        const statStr = Object.entries(item.stats)
          .map(([k, v]) => `${k}:${v > 0 ? '+' : ''}${v}`).join(' ');
        r.drawString(px + 2, detY + 1, statStr, COLORS.BRIGHT_CYAN);
      }
      if (item.description) {
        r.drawString(px + 2, detY + 2, item.description.substring(0, panelW - 4), COLORS.BRIGHT_BLACK);
      }

      // Equipment comparison — show stat diff vs currently equipped item (green=better, red=worse)
      if (player && player.equipment && tab === 'buy' && item.stats) {
        const slot = item.type === 'weapon' ? 'weapon' : item.type === 'armor' ? 'armor' : item.type;
        const equipped = player.equipment[slot];
        if (equipped && equipped.stats) {
          r.drawString(px + 2, detY + 3, 'vs equipped:', COLORS.BRIGHT_BLACK);
          let cx = px + 15;
          const allKeys = new Set([...Object.keys(item.stats), ...Object.keys(equipped.stats)]);
          for (const k of allKeys) {
            const diff = (item.stats[k] || 0) - (equipped.stats[k] || 0);
            if (diff !== 0) {
              const color = diff > 0 ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED;
              const sign = diff > 0 ? '+' : '';
              const seg = `${k}:${sign}${diff} `;
              if (cx + seg.length < px + panelW - 2) {
                r.drawString(cx, detY + 3, seg, color);
                cx += seg.length;
              }
            }
          }
        } else if (!equipped) {
          r.drawString(px + 2, detY + 3, '(no item equipped in slot)', COLORS.BRIGHT_BLACK);
        }
      }
    }

    // Footer
    r.drawString(px + 2, py + panelH - 1,
      '[Enter] Buy/Sell  [H]aggle  [Esc] Leave', COLORS.BRIGHT_BLACK);
  }

  // ─── INVENTORY ───

  drawInventory(player) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 60);
    const panelH = Math.min(rows - 4, 30);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.GREEN, COLORS.BLACK, ' INVENTORY ');

    const items = player.inventory;
    const listY = py + 2;
    const maxVisible = panelH - 6;

    for (let i = 0; i < Math.min(items.length, maxVisible); i++) {
      const item = items[i];
      const sel = i === this.selectedIndex;
      const equipped = (player.equipment && Object.values(player.equipment).some(e => e && e.id === item.id)) ? '[E]' : '   ';

      r.drawString(px + 2, listY + i,
        (sel ? '> ' : '  ') + item.char + ' ' + item.name.substring(0, panelW - 16) + ' ' + equipped,
        sel ? COLORS.BRIGHT_WHITE : (item.color || COLORS.WHITE));
    }

    if (items.length === 0) {
      r.drawString(px + 4, listY + 1, 'Your inventory is empty.', COLORS.BRIGHT_BLACK);
    }

    // Selected item details
    if (items.length > 0 && this.selectedIndex < items.length) {
      const item = items[this.selectedIndex];
      const detY = py + panelH - 4;
      r.drawString(px + 1, detY, '─'.repeat(panelW - 2), COLORS.BRIGHT_BLACK);
      r.drawString(px + 2, detY + 1, item.description || item.name, COLORS.BRIGHT_CYAN);
      if (item.stats) {
        const statStr = Object.entries(item.stats)
          .map(([k, v]) => `${k}:${v > 0 ? '+' : ''}${v}`).join(' ');
        r.drawString(px + 2, detY + 2, statStr, COLORS.BRIGHT_GREEN);
      }
    }

    r.drawString(px + 2, py + panelH - 1,
      '[E]quip [D]rop [U]se [Esc]Close', COLORS.BRIGHT_BLACK);
  }

  // ─── CHARACTER SHEET ───

  drawCharacterSheet(player, factionSystem = null) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 58);
    const panelH = Math.min(rows - 4, 26);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_CYAN, COLORS.BLACK, ' CHARACTER SHEET ');

    const s = player.stats;
    let y = py + 2;

    r.drawString(px + 2, y, `Name: ${player.name}`, COLORS.BRIGHT_WHITE);
    r.drawString(px + panelW / 2, y, `Level: ${s.level}`, COLORS.BRIGHT_YELLOW);
    y++;
    r.drawString(px + 2, y, `Race: ${player.race}`, COLORS.BRIGHT_CYAN);
    r.drawString(px + panelW / 2, y, `Class: ${player.playerClass}`, COLORS.BRIGHT_CYAN);
    y++;
    r.drawString(px + 2, y, `XP: ${s.xp}/${s.xpToNext}`, COLORS.BRIGHT_GREEN);
    r.drawString(px + panelW / 2, y, `Gold: ${player.gold}`, COLORS.BRIGHT_YELLOW);
    y += 2;

    // Stats
    r.drawString(px + 2, y, 'STATS:', COLORS.BRIGHT_WHITE);
    r.drawString(px + panelW / 2, y, 'EQUIPMENT:', COLORS.BRIGHT_WHITE);
    y++;

    const stats = [
      ['STR', s.str], ['DEX', s.dex], ['CON', s.con],
      ['INT', s.int], ['WIS', s.wis], ['CHA', s.cha]
    ];
    const slotNames = ['head', 'chest', 'hands', 'legs', 'feet', 'mainHand', 'offHand'];
    const slotLabels = ['Head', 'Chest', 'Hands', 'Legs', 'Feet', 'Weapon', 'Off-Hand'];

    for (let i = 0; i < stats.length; i++) {
      const [name, val] = stats[i];
      const mod = Math.floor((val - 10) / 2);
      const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
      r.drawString(px + 4, y + i, `${name}: ${val.toString().padStart(2)} (${modStr})`, COLORS.WHITE);
    }

    for (let i = 0; i < slotNames.length && i < stats.length + 1; i++) {
      const equip = player.equipment[slotNames[i]];
      const name = equip ? equip.name.substring(0, panelW / 2 - 12) : '(empty)';
      r.drawString(px + panelW / 2 + 2, y + i, `${slotLabels[i]}: ${name}`,
        equip ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_BLACK);
    }

    y += stats.length + 1;

    // Combat stats
    r.drawString(px + 2, y, 'COMBAT:', COLORS.BRIGHT_WHITE); y++;
    r.drawString(px + 4, y, `HP: ${s.hp}/${s.maxHp}`, COLORS.BRIGHT_RED);
    r.drawString(px + 20, y, `MP: ${s.mana}/${s.maxMana}`, COLORS.BRIGHT_BLUE); y++;
    const atk = player.getAttackPower ? player.getAttackPower() : s.str;
    const def = player.getDefense ? player.getDefense() : s.con;
    r.drawString(px + 4, y, `Attack: ${atk}`, COLORS.BRIGHT_YELLOW);
    r.drawString(px + 20, y, `Defense: ${def}`, COLORS.BRIGHT_YELLOW);

    // Abilities section
    y += 2;
    if (player.abilities && player.abilities.length > 0) {
      r.drawString(px + 2, y, 'ABILITIES:', COLORS.BRIGHT_WHITE); y++;
      for (const ab of player.abilities) {
        if (y < py + panelH - 2) {
          r.drawString(px + 4, y, `${ab.name} (${ab.manaCost}mp) - ${ab.description || ''}`.substring(0, panelW - 6), COLORS.BRIGHT_MAGENTA);
          y++;
        }
      }
    }

    r.drawString(px + 2, py + panelH - 1, '[Esc] Close  [F] Factions', COLORS.BRIGHT_BLACK);
  }

  // ─── FACTION PANEL ───

  drawFactionPanel(factionSystem) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 55);
    const panelH = Math.min(rows - 4, 22);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_YELLOW, COLORS.BLACK, ' FACTION STANDINGS ');

    let y = py + 2;
    const factionIds = ['COLONY_MILITIA', 'SALVAGE_GUILD', 'ORDER_OF_BUILDERS', 'TUNNEL_RUNNERS',
      'THE_COUNCIL', 'SCRAP_RAIDERS', 'FERAL_SWARM', 'CORRUPTED'];

    for (const id of factionIds) {
      if (y >= py + panelH - 2) break;
      const faction = factionSystem._factions.get(id);
      if (!faction) continue;
      const standing = factionSystem.getPlayerStanding(id);

      // Standing bar
      const barW = 20;
      const normalized = Math.round(((standing + 100) / 200) * barW);
      const bar = '█'.repeat(Math.max(0, normalized)) + '░'.repeat(Math.max(0, barW - normalized));

      const standingLabel = standing > 50 ? 'Allied' : standing > 20 ? 'Friendly' :
        standing > -20 ? 'Neutral' : standing > -50 ? 'Unfriendly' : 'Hostile';
      const labelColor = standing > 50 ? COLORS.BRIGHT_GREEN : standing > 20 ? COLORS.GREEN :
        standing > -20 ? COLORS.WHITE : standing > -50 ? COLORS.YELLOW : COLORS.BRIGHT_RED;

      r.drawString(px + 2, y, faction.name.padEnd(18), COLORS.BRIGHT_WHITE);
      r.drawString(px + 20, y, bar, labelColor);
      r.drawString(px + 42, y, standingLabel, labelColor);
      y++;
    }

    y += 2;
    r.drawString(px + 2, y, 'Clear hostiles to improve standing', COLORS.BRIGHT_BLACK);
    r.drawString(px + 2, y + 1, 'with security and traders.', COLORS.BRIGHT_BLACK);

    r.drawString(px + 2, py + panelH - 1, '[Esc] Close', COLORS.BRIGHT_BLACK);
  }

  // ─── QUEST LOG ───

  drawQuestLog(questSystem) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 60);
    const panelH = Math.min(rows - 4, 25);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_MAGENTA, COLORS.BLACK, ' MISSION LOG ');

    let y = py + 2;
    const active = questSystem.getActiveQuests();
    const completed = questSystem.getCompletedQuests();

    r.drawString(px + 2, y, 'ACTIVE MISSIONS:', COLORS.BRIGHT_WHITE); y++;

    if (active.length === 0) {
      r.drawString(px + 4, y, 'No active missions.', COLORS.BRIGHT_BLACK); y++;
    }
    for (let i = 0; i < active.length && y < py + panelH - 8; i++) {
      const q = active[i];
      const sel = i === this.selectedIndex;
      r.drawString(px + 2, y, (sel ? '> ' : '  ') + '• ' + q.title.substring(0, panelW - 8),
        sel ? COLORS.BRIGHT_YELLOW : COLORS.WHITE);
      y++;
      for (const obj of q.objectives) {
        const progress = `[${obj.current}/${obj.required}]`;
        r.drawString(px + 6, y, obj.description.substring(0, panelW - 16) + ' ' + progress,
          COLORS.BRIGHT_BLACK);
        y++;
      }
    }

    y++;
    r.drawString(px + 2, y, 'COMPLETED:', COLORS.BRIGHT_WHITE); y++;

    for (let i = 0; i < Math.min(completed.length, 3); i++) {
      r.drawString(px + 4, y, '✓ ' + completed[i].title.substring(0, panelW - 10), COLORS.GREEN);
      y++;
    }

    r.drawString(px + 2, py + panelH - 1, '[Esc] Close', COLORS.BRIGHT_BLACK);
  }

  // ─── MAP VIEW ───

  drawMapView(overworld, player, knownLocations) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;

    r.drawBox(0, 0, cols, rows, COLORS.BRIGHT_BLACK, COLORS.BLACK, ' COLONY MAP ');

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

      // Draw locations
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
          r.drawChar(sx, sy, ch, known ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK);
        }
      }

      // Player position
      if (player && player.position) {
        const px = Math.floor((player.position.x - worldMinX) / scaleX) + 2;
        const py2 = Math.floor((player.position.y - worldMinY) / scaleY) + 2;
        if (px >= 2 && px < cols - 2 && py2 >= 2 && py2 < rows - 2) {
          r.drawChar(px, py2, '@', COLORS.BRIGHT_YELLOW);
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
            r.drawChar(sx, sy, ch, known ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK);
          }
        }
      }
      if (player && player.position) {
        const scaleX3 = overworld.tiles[0].length / mapW;
        const scaleY3 = overworld.tiles.length / mapH;
        const px = Math.floor(player.position.x / scaleX3) + 2;
        const py2 = Math.floor(player.position.y / scaleY3) + 2;
        if (px >= 2 && px < cols - 2 && py2 >= 2 && py2 < rows - 2) {
          r.drawChar(px, py2, '@', COLORS.BRIGHT_YELLOW);
        }
      }
    }

    r.drawString(2, rows - 1, '[Esc] Close ○Outpost □Habitat ▣Hub ♦Garrison ▼Sealed ▲Spire ▪Wreckage', COLORS.BRIGHT_BLACK);
  }

  // ─── GAME OVER ───

  drawGameOver(player, causeOfDeath) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    r.clear();

    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);

    const skull = [
      '   ___   ',
      '  /   \\  ',
      ' | x x | ',
      ' |  ^  | ',
      '  \\___/  ',
      '   |||   '
    ];

    for (let i = 0; i < skull.length; i++) {
      r.drawString(cx - 5, cy - 8 + i, skull[i], COLORS.BRIGHT_RED);
    }

    r.drawString(cx - 6, cy - 1, 'YOU HAVE DIED', COLORS.BRIGHT_RED);
    if (player) {
      r.drawString(cx - 10, cy + 1, `${player.name} - Level ${player.stats.level}`, COLORS.WHITE);
    }
    if (causeOfDeath) {
      r.drawString(cx - Math.floor(causeOfDeath.length / 2), cy + 3,
        causeOfDeath, COLORS.BRIGHT_BLACK);
    }

    r.drawString(cx - 12, cy + 6, '[Enter] Return to Menu', COLORS.BRIGHT_YELLOW);
  }

  // ─── LOCATION VIEW ───

  drawLocationOverview(settlement, npcs, player) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;

    r.drawBox(0, 0, cols, 2, COLORS.BRIGHT_BLACK, COLORS.BLACK);
    r.drawString(2, 0, ' ' + (settlement.name || 'Settlement') + ' ', COLORS.BRIGHT_YELLOW);

    // Draw settlement map tiles
    if (settlement.tiles) {
      const offsetX = Math.max(0, Math.floor((cols - settlement.tiles[0].length) / 2));
      const offsetY = 2;
      for (let y = 0; y < settlement.tiles.length && y + offsetY < rows - 7; y++) {
        for (let x = 0; x < settlement.tiles[0].length && x + offsetX < cols; x++) {
          const tile = settlement.tiles[y][x];
          r.drawChar(x + offsetX, y + offsetY, tile.char, tile.fg, tile.bg || COLORS.BLACK);
        }
      }

      // Draw NPCs
      if (npcs) {
        for (const npc of npcs) {
          const sx = npc.position.x + offsetX;
          const sy = npc.position.y + offsetY;
          if (sx >= 0 && sx < cols && sy >= 2 && sy < rows - 7) {
            r.drawChar(sx, sy, npc.char, npc.color || COLORS.BRIGHT_CYAN);
          }
        }
      }

      // Draw player
      if (player) {
        const px = player.position.x + offsetX;
        const py = player.position.y + offsetY;
        if (px >= 0 && px < cols && py >= 2 && py < rows - 7) {
          r.drawChar(px, py, '@', COLORS.BRIGHT_YELLOW);
        }
      }
    }
  }

  // ─── HELP SCREEN ───

  drawHelp() {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 62);
    const panelH = Math.min(rows - 2, 40);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    const tabs = ['Controls', 'Overworld', 'Locations', 'Combat', 'Systems', 'Tips'];
    const tab = this.helpTab || 0;

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_GREEN, COLORS.BLACK, ' HELP ');

    // Tab bar
    let tx = px + 2;
    for (let i = 0; i < tabs.length; i++) {
      const label = `[${i + 1}]${tabs[i]}`;
      const color = i === tab ? COLORS.BRIGHT_WHITE : COLORS.BRIGHT_BLACK;
      r.drawString(tx, py + 1, label, color, COLORS.BLACK);
      tx += label.length + 1;
    }
    r.drawString(px + 1, py + 2, '─'.repeat(panelW - 2), COLORS.BRIGHT_BLACK);

    const contentY = py + 3;
    const contentH = panelH - 5;
    const w = panelW - 4;

    const pages = [
      // 0: Controls
      [
        { h: 'MOVEMENT', c: COLORS.BRIGHT_YELLOW },
        { t: 'Arrow Keys / WASD    Move in 4 directions' },
        { t: 'Numpad (1-9)         Move in 8 directions (diagonals)' },
        { t: '' },
        { h: 'INTERACTION', c: COLORS.BRIGHT_YELLOW },
        { t: 'Enter / Space        Confirm selection / interact' },
        { t: 'E                    Enter dungeon, ruins, or building' },
        { t: 'T                    Talk to nearby person' },
        { t: 'G                    Pick up item on the ground' },
        { t: '' },
        { h: 'MENUS', c: COLORS.BRIGHT_YELLOW },
        { t: 'I                    Open inventory' },
        { t: 'C                    Character sheet & stats' },
        { t: 'Q                    Quest log' },
        { t: 'M                    World map (explored areas)' },
        { t: 'F                    Faction standings' },
        { t: 'O                    Settings' },
        { t: 'P                    Quick save' },
        { t: '?                    This help screen' },
        { t: 'Escape               Close current menu / go back' },
        { t: '' },
        { h: 'COMBAT', c: COLORS.BRIGHT_YELLOW },
        { t: '1, 2, 3              Use ability in slot 1/2/3' },
        { t: 'Arrow Keys           Select target or action' },
        { t: 'Enter                Confirm attack / action' },
      ],
      // 1: Overworld
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
        { h: 'NAVIGATION', c: COLORS.BRIGHT_YELLOW },
        { t: 'Walk in any direction — the world has no edge.' },
        { t: 'New lands generate seamlessly as you move.' },
        { t: 'Press M to view your explored map at any time.' },
        { t: 'Settlements appear as special symbols on the map.' },
        { t: 'Roads connect nearby towns and outposts.' },
      ],
      // 2: Locations
      [
        { h: 'LOCATION TYPES', c: COLORS.BRIGHT_CYAN },
        { t: '' },
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
        { h: 'INSIDE SETTLEMENTS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Walk up to a person and press T to talk.' },
        { t: 'Enter buildings with E at the door (+).' },
        { t: 'Merchants: buy/sell gear, haggle for prices.' },
        { t: 'Taverns: rest, hear rumors, find companions.' },
        { t: 'Temples: heal, cure ailments, receive blessings.' },
        { t: 'Press Escape to leave a settlement.' },
        { t: '' },
        { h: 'DUNGEONS & TOWERS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Explore chambers, fight monsters, find treasure.' },
        { t: 'Towers have multiple levels — find the stairs.' },
        { t: 'Ruins hold ancient lore and hidden vaults.' },
      ],
      // 3: Combat
      [
        { h: 'COMBAT SYSTEM', c: COLORS.BRIGHT_RED },
        { t: 'Combat is turn-based. You and the enemy take' },
        { t: 'turns choosing actions.' },
        { t: '' },
        { h: 'ACTIONS', c: COLORS.BRIGHT_YELLOW },
        { t: 'Attack         Basic melee/ranged strike' },
        { t: 'Abilities 1-3  Special skills (cost MP)' },
        { t: 'Use Item       Consume a potion or scroll' },
        { t: 'Flee           Attempt to disengage (DEX check)' },
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
        { t: 'Hostile encounters occur while exploring the wilds.' },
        { t: 'Rate increases at night and in dangerous areas.' },
        { t: 'Dungeons have fixed enemy placements.' },
      ],
      // 4: Systems
      [
        { h: 'DAY & NIGHT', c: COLORS.BRIGHT_CYAN },
        { t: 'Time advances as you move (0.5h per step) and' },
        { t: 'when you rest (R = 8 hours). The HUD shows the' },
        { t: 'time of day and sun/moon cycle.' },
        { t: 'Night: higher encounter rate, shops close.' },
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
        { t: '' },
        { h: 'WORLD EVENTS', c: COLORS.BRIGHT_CYAN },
        { t: 'Festivals, plagues, monster incursions, magical' },
        { t: 'darkness, caravans, and bandit raids occur over' },
        { t: 'time. Events affect prices and more.' },
      ],
      // 5: Tips / About
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
        { t: '' },
        { h: 'EXPLORATION', c: COLORS.BRIGHT_GREEN },
        { t: '- Follow roads to find nearby settlements.' },
        { t: '- The world is vast — explore in any direction.' },
        { t: '- Discovered locations are marked on the map (M).' },
        { t: '- Dungeons and towers have the best treasure.' },
        { t: '- Ruins contain ancient lore and hidden vaults.' },
        { t: '' },
        { h: 'ECONOMY', c: COLORS.BRIGHT_GREEN },
        { t: '- Haggle (H) at merchants for better prices.' },
        { t: '- Festival events reduce merchant prices.' },
        { t: '- High CHA gives better deals and more options.' },
        { t: '- Sell loot you don\'t need to fund upgrades.' },
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
        r.drawString(px + 2, contentY + i, line.h, line.c || COLORS.BRIGHT_WHITE);
      } else if (line.t !== undefined) {
        r.drawString(px + 2, contentY + i, line.t.substring(0, w), COLORS.WHITE);
      }
    }

    // Scroll indicators
    if (scroll > 0) {
      r.drawString(px + panelW - 4, contentY, ' \u25b2 ', COLORS.BRIGHT_YELLOW);
    }
    if (scroll + contentH < page.length) {
      r.drawString(px + panelW - 4, contentY + contentH - 1, ' \u25bc ', COLORS.BRIGHT_YELLOW);
    }

    r.drawString(px + 2, py + panelH - 1,
      '[1-6] Tab  [\u2190\u2192] Tab  [\u2191\u2193] Scroll  [Esc] Close', COLORS.BRIGHT_BLACK);
  }

  // ─── SETTINGS ───

  drawSettings(settings) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 4, 45);
    const panelH = 14;
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_CYAN, COLORS.BLACK, ' SETTINGS ');

    const items = [
      { key: '1', label: 'CRT Effects', value: settings.crtEffects ? 'ON' : 'OFF', color: settings.crtEffects ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
      { key: '2', label: 'Font Size', value: `${settings.fontSize}px`, color: COLORS.BRIGHT_YELLOW },
      { key: '3', label: 'Touch Controls', value: settings.touchControls ? 'ON' : 'OFF', color: settings.touchControls ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED },
      { key: '4', label: 'Auto-Save Interval', value: `${settings.autoSaveInterval} turns`, color: COLORS.BRIGHT_YELLOW },
    ];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const y = py + 3 + i * 2;
      r.drawString(px + 3, y, `[${item.key}]`, COLORS.BRIGHT_WHITE);
      r.drawString(px + 7, y, item.label, COLORS.WHITE);
      r.drawString(px + panelW - item.value.length - 3, y, item.value, item.color);
    }

    r.drawString(px + 2, py + panelH - 2, 'Press key to toggle  [Esc] Close', COLORS.BRIGHT_BLACK);
  }

  // ─── CONFIRM DIALOG ───

  drawConfirmDialog(message, options) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const panelW = Math.min(cols - 8, 40);
    const panelH = 8;
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_RED, COLORS.BLACK);
    const lines = this.wordWrap(message, panelW - 4);
    for (let i = 0; i < lines.length; i++) {
      r.drawString(px + 2, py + 2 + i, lines[i], COLORS.BRIGHT_WHITE);
    }

    const optStr = options || '[Y]es  [N]o';
    r.drawString(px + Math.floor((panelW - optStr.length) / 2), py + panelH - 2,
      optStr, COLORS.BRIGHT_YELLOW);
  }

  // ─── LOADING SCREEN ───

  drawLoading(message, logLines = []) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    r.clear();

    const t = Date.now() / 200;
    const spinner = ['|', '/', '-', '\\'][Math.floor(t) % 4];

    // Title
    const title = '═══ ASCIIQUEST ═══';
    r.drawString(Math.floor((cols - title.length) / 2), 2, title, COLORS.BRIGHT_YELLOW);

    // Progress bar area
    const barY = 4;
    r.drawString(Math.floor((cols - message.length) / 2) - 1, barY,
      spinner + ' ' + message + ' ' + spinner, COLORS.BRIGHT_GREEN);

    // Verbose log lines — show terminal-style output
    const logStartY = 6;
    const maxLines = Math.min(logLines.length, rows - 10);
    const startIdx = Math.max(0, logLines.length - maxLines);
    for (let i = startIdx; i < logLines.length; i++) {
      const line = logLines[i];
      const y = logStartY + (i - startIdx);
      if (y >= rows - 2) break;
      const prefix = i === logLines.length - 1 ? '> ' : '  ';
      const color = line.color || (i === logLines.length - 1 ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_BLACK);
      r.drawString(2, y, prefix + line.text.substring(0, cols - 6), color);
    }

    // Footer
    r.drawString(2, rows - 2, 'Awakening the world...', COLORS.BRIGHT_BLACK);
  }

  // ─── UTILITIES ───

  wordWrap(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '';

    for (const word of words) {
      if (current.length + word.length + 1 <= maxWidth) {
        current += (current ? ' ' : '') + word;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

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
}
