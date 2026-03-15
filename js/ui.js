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
    const time = timeSystem ? timeSystem.getTimeString() : '';
    const loc = gameState.currentLocationName || 'Wilderness';

    // Time-of-day indicator
    const tod = timeSystem ? timeSystem.getTimeOfDay() : '';
    const todIcons = { dawn: '☀', morning: '☀', afternoon: '☀', evening: '☾', night: '☾' };
    const todStr = todIcons[tod] || '';

    r.drawString(1, 0, loc, COLORS.BRIGHT_WHITE, COLORS.BLUE);

    // Weather indicator on top bar
    if (weatherSystem && weatherSystem.current !== 'clear') {
      const weatherIcons = { rain: '♒', snow: '❄', storm: '⚡', fog: '≈', sandstorm: '≈', cloudy: '☁' };
      const wIcon = weatherIcons[weatherSystem.current] || '';
      r.drawString(loc.length + 3, 0, wIcon, COLORS.BRIGHT_CYAN, COLORS.BLUE);
    }

    r.drawString(cols - time.length - todStr.length - 2, 0, todStr + ' ' + time,
      tod === 'night' || tod === 'evening' ? COLORS.BRIGHT_BLUE : COLORS.BRIGHT_YELLOW, COLORS.BLUE);

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
   * Draw a minimap in the top-right corner during dungeon exploration.
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
      '╔═══════════════════════════════════════════╗',
      '║     █████╗ ███████╗ ██████╗██╗██╗        ║',
      '║    ██╔══██╗██╔════╝██╔════╝██║██║        ║',
      '║    ███████║███████╗██║     ██║██║        ║',
      '║    ██╔══██║╚════██║██║     ██║██║        ║',
      '║    ██║  ██║███████║╚██████╗██║██║        ║',
      '║    ╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝╚═╝        ║',
      '║            Q U E S T                      ║',
      '╚═══════════════════════════════════════════╝'
    ];

    const startY = Math.floor(rows / 2) - 10;
    const startX = Math.floor((cols - 45) / 2);

    for (let i = 0; i < title.length; i++) {
      const colors = [COLORS.BRIGHT_RED, COLORS.BRIGHT_YELLOW, COLORS.BRIGHT_GREEN,
        COLORS.BRIGHT_CYAN, COLORS.BRIGHT_BLUE, COLORS.BRIGHT_MAGENTA];
      r.drawString(startX, startY + i, title[i], colors[i % colors.length]);
    }

    const subtitle = '~ A Retro Demoscene Roguelike ~';
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
    const t = Date.now() / 1000;
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
        'Balanced stats, versatile. +1 to all stats.',
        'High DEX and INT, low CON. Attuned to magic.',
        'High CON and STR, low DEX. Master crafters.',
        'High STR, low INT and CHA. Fierce warriors.',
        'High DEX and CHA, low STR. Lucky and nimble.'
      ];
      for (let i = 0; i < races.length; i++) {
        const sel = i === this.selectedIndex;
        r.drawString(6, 5 + i * 3, (sel ? '> ' : '  ') + races[i],
          sel ? COLORS.BRIGHT_YELLOW : COLORS.WHITE);
        r.drawString(8, 6 + i * 3, descs[i], COLORS.BRIGHT_BLACK);
      }
    } else if (step === 'class') {
      r.drawString(4, 3, 'Choose your class:', COLORS.BRIGHT_WHITE);
      const classes = ['Warrior', 'Mage', 'Rogue', 'Ranger'];
      const descs = [
        'Heavy armor, high HP. Melee combat specialist.',
        'Powerful spells, low HP. Arcane knowledge.',
        'Stealth and daggers. Critical hit specialist.',
        'Bow and survival skills. Balanced fighter.'
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
    const factionIds = ['TOWN_GUARD', 'MERCHANTS_GUILD', 'TEMPLE_ORDER', 'THIEVES_GUILD',
      'NOBILITY', 'BANDITS', 'MONSTER_HORDE', 'UNDEAD'];

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
    r.drawString(px + 2, y, 'Kill monsters to improve standing', COLORS.BRIGHT_BLACK);
    r.drawString(px + 2, y + 1, 'with guards and merchants.', COLORS.BRIGHT_BLACK);

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

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_MAGENTA, COLORS.BLACK, ' QUEST LOG ');

    let y = py + 2;
    const active = questSystem.getActiveQuests();
    const completed = questSystem.getCompletedQuests();

    r.drawString(px + 2, y, 'ACTIVE QUESTS:', COLORS.BRIGHT_WHITE); y++;

    if (active.length === 0) {
      r.drawString(px + 4, y, 'No active quests.', COLORS.BRIGHT_BLACK); y++;
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

    r.drawBox(0, 0, cols, rows, COLORS.BRIGHT_BLACK, COLORS.BLACK, ' WORLD MAP ');

    if (!overworld || !overworld.tiles) return;

    const mapW = cols - 4;
    const mapH = rows - 4;
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

    // Draw locations
    if (overworld.locations) {
      for (const loc of overworld.locations) {
        const sx = Math.floor(loc.x / scaleX) + 2;
        const sy = Math.floor(loc.y / scaleY) + 2;
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

    // Player position
    if (player && player.position) {
      const px = Math.floor(player.position.x / scaleX) + 2;
      const py2 = Math.floor(player.position.y / scaleY) + 2;
      if (px >= 2 && px < cols - 2 && py2 >= 2 && py2 < rows - 2) {
        r.drawChar(px, py2, '@', COLORS.BRIGHT_YELLOW);
      }
    }

    r.drawString(2, rows - 1, '[Esc] Close ○Village □Town ▣City ♦Castle ▼Dungeon ▲Tower ▪Ruins', COLORS.BRIGHT_BLACK);
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
    const panelW = Math.min(cols - 4, 50);
    const panelH = Math.min(rows - 4, 22);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_GREEN, COLORS.BLACK, ' CONTROLS ');

    const lines = [
      ['Arrow/WASD', 'Move'],
      ['Numpad', 'Move (8-dir)'],
      ['Enter/Space', 'Interact / Confirm'],
      ['E', 'Enter building / Use'],
      ['I', 'Inventory'],
      ['C', 'Character sheet'],
      ['Q', 'Quest log'],
      ['M', 'World map'],
      ['F', 'Faction standings'],
      ['T', 'Talk to NPC'],
      ['G', 'Pick up item'],
      ['R', 'Rest / Wait'],
      ['P', 'Quick save'],
      ['O', 'Settings'],
      ['1-3', 'Use abilities (combat)'],
      ['Escape', 'Back / Close menu'],
      ['?', 'This help screen']
    ];

    for (let i = 0; i < lines.length; i++) {
      r.drawString(px + 3, py + 2 + i, lines[i][0].padEnd(15) + lines[i][1], COLORS.WHITE);
    }

    r.drawString(px + 2, py + panelH - 1, '[Esc] Close', COLORS.BRIGHT_BLACK);
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

  drawLoading(message) {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    r.clear();

    const t = Date.now() / 200;
    const spinner = ['|', '/', '-', '\\'][Math.floor(t) % 4];

    r.drawString(Math.floor((cols - message.length) / 2) - 1, Math.floor(rows / 2),
      spinner + ' ' + message + ' ' + spinner, COLORS.BRIGHT_GREEN);
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
