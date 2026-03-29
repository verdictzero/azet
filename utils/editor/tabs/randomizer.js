// randomizer.js — Random generation tool tab for the ASCIIQUEST structure editor

import {
  NAME_POOLS, NICKNAMES, PERSONALITY_TRAITS, ARCHETYPES,
  ROLE_CHARS, ROLE_COLORS, ROLE_TITLES, SECRET_TEMPLATES,
  ROLE_SCHEDULES, NPC_FACTIONS, NPC_CATEGORIES, RACES, MOODS,
  WEAPON_SUBTYPES, ARMOR_SUBTYPES, ITEM_PREFIXES, ITEM_SUFFIXES,
  RARITY_COLORS, RARITY_MULTIPLIERS, POTION_BASES, SCROLL_BASES,
  FOOD_BASES, ITEM_TYPES, RARITIES,
  CREATURE_TABLES, ABILITY_EFFECTS, BEHAVIORS, CREATURE_FACTIONS,
} from '../data-constants.js';

import { createDropdown, createNumberInput } from '../components/form-fields.js';

// ── Utilities ─────────────────────────────────────────────────────────────────

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── NPC Generation ────────────────────────────────────────────────────────────

function generateNpc(race, role) {
  const pool = NAME_POOLS[race] || NAME_POOLS.human;
  const isMale = Math.random() < 0.5;
  const first = randomFrom(isMale ? pool.male : pool.female);
  const last = randomFrom(pool.last);
  let nickname = null;
  let full = `${first} ${last}`;
  if (Math.random() < 0.3) {
    nickname = randomFrom(NICKNAMES);
    full = `${first} "${nickname}" ${last}`;
  }

  const title = randomFrom(ROLE_TITLES[role] || ROLE_TITLES.farmer);
  const isCombat = role === 'guard' || role === 'knight';
  const level = randomInt(1, 5);
  const baseHp = isCombat ? 40 : 20;
  const hp = baseHp + level * 5 + randomInt(-3, 3);

  const traits = shuffle(PERSONALITY_TRAITS).slice(0, 3);
  const mood = randomFrom(MOODS);
  const archetype = randomFrom(ARCHETYPES);

  let faction = randomFrom(NPC_FACTIONS);
  if (role === 'merchant' || role === 'blacksmith') faction = 'The Salvage Guild';
  if (role === 'guard' || role === 'knight') faction = 'The Colony Guard';
  if (role === 'priest') faction = 'The Archive Keepers';

  const secrets = shuffle(SECRET_TEMPLATES).slice(0, randomInt(1, 2));
  const schedule = (ROLE_SCHEDULES[role] || ROLE_SCHEDULES.farmer).map(s => ({ ...s }));

  // Determine category
  let category = 'ambient';
  for (const [cat, roles] of Object.entries(NPC_CATEGORIES)) {
    if (roles.includes(role)) { category = cat; break; }
  }

  return {
    name: { first, last, full, nickname: nickname || '' },
    race, role, title,
    char: ROLE_CHARS[role] || 'N',
    color: ROLE_COLORS[role] || '#cccccc',
    stats: {
      hp, maxHp: hp,
      attack: (isCombat ? 8 : 3) + level + randomInt(0, 2),
      defense: (isCombat ? 6 : 2) + Math.floor(level / 2) + randomInt(0, 2),
      level,
    },
    personality: { traits, mood, archetype },
    schedule,
    faction,
    secrets,
    shop: (role === 'merchant' || role === 'blacksmith' || role === 'barkeep') ? {
      inventory: [],
      buyMultiplier: +(0.5 + Math.random() * 0.3).toFixed(2),
      sellMultiplier: +(1.0 + Math.random() * 0.5).toFixed(2),
      restockInterval: randomInt(50, 150),
      lastRestock: 0,
      specialization: role === 'blacksmith'
        ? randomFrom(['weapons', 'armor', 'tools'])
        : role === 'barkeep'
          ? 'tavern'
          : randomFrom(['general', 'potions', 'scrolls', 'food']),
    } : null,
    dialogueTreeId: null,
    placementHint: '',
    category,
  };
}

// ── Item Generation ───────────────────────────────────────────────────────────

function subtypeForType(type) {
  switch (type) {
    case 'weapon': return randomFrom(Object.keys(WEAPON_SUBTYPES));
    case 'armor':  return randomFrom(Object.keys(ARMOR_SUBTYPES));
    case 'potion': return randomFrom(POTION_BASES).subtype;
    case 'scroll': return randomFrom(SCROLL_BASES).effect;
    case 'food':   return randomFrom(FOOD_BASES).subtype || 'ration';
    default:       return type;
  }
}

function baseNameForItem(type, subtype) {
  if (type === 'weapon' && WEAPON_SUBTYPES[subtype]) return WEAPON_SUBTYPES[subtype].name;
  if (type === 'armor' && ARMOR_SUBTYPES[subtype]) return ARMOR_SUBTYPES[subtype].name;
  if (type === 'potion') {
    const b = POTION_BASES.find(p => p.subtype === subtype);
    return b ? b.name : 'Potion';
  }
  if (type === 'scroll') {
    const b = SCROLL_BASES.find(s => s.effect === subtype);
    return b ? b.name : 'Scroll';
  }
  if (type === 'food') {
    const b = (FOOD_BASES || []).find(f => f.subtype === subtype);
    return b ? b.name : 'Ration';
  }
  if (type === 'ring') return 'Ring';
  if (type === 'amulet') return 'Amulet';
  if (type === 'material') return 'Material';
  if (type === 'artifact') return 'Artifact';
  return 'Item';
}

function charForItem(type, subtype) {
  if (type === 'weapon' && WEAPON_SUBTYPES[subtype]) return WEAPON_SUBTYPES[subtype].char;
  if (type === 'armor' && ARMOR_SUBTYPES[subtype]) return ARMOR_SUBTYPES[subtype].char;
  if (type === 'potion') return '!';
  if (type === 'scroll') return '?';
  if (type === 'food') return '%';
  if (type === 'ring') return 'o';
  if (type === 'amulet') return '"';
  if (type === 'material') return '*';
  if (type === 'artifact') return '&';
  return '?';
}

function generateItem(type, rarity) {
  // Resolve random rarity
  const allRarities = RARITIES || Object.keys(RARITY_COLORS);
  if (!rarity || rarity === 'random') {
    rarity = randomFrom(allRarities);
  }

  const subtype = subtypeForType(type);
  const baseName = baseNameForItem(type, subtype);

  // Prefix / suffix for non-common items
  let prefix = null;
  let suffix = null;
  let nameParts = [baseName];

  if (rarity !== 'common' && ITEM_PREFIXES && ITEM_PREFIXES.length > 0) {
    if (Math.random() < 0.7) {
      prefix = randomFrom(ITEM_PREFIXES);
      nameParts.unshift(prefix.name);
    }
  }
  if (rarity !== 'common' && ITEM_SUFFIXES && ITEM_SUFFIXES.length > 0) {
    if (Math.random() < 0.5) {
      suffix = randomFrom(ITEM_SUFFIXES);
      nameParts.push(suffix.name);
    }
  }

  const name = nameParts.join(' ');

  // Stats from rarity multiplier
  const mul = (RARITY_MULTIPLIERS[rarity] || RARITY_MULTIPLIERS.common || { stat: 1, value: 1 });
  const statMul = mul.stat || 1;
  const valueMul = mul.value || 1;

  let stats = {};
  if (type === 'weapon' && WEAPON_SUBTYPES[subtype]) {
    stats.attack = Math.round((WEAPON_SUBTYPES[subtype].baseDmg || 5) * statMul);
  } else if (type === 'armor' && ARMOR_SUBTYPES[subtype]) {
    stats.defense = Math.round((ARMOR_SUBTYPES[subtype].baseDef || 3) * statMul);
  } else if (type === 'ring' || type === 'amulet') {
    stats.defense = Math.round(1 * statMul);
  }

  // Apply prefix stat multiplier
  if (prefix && prefix.statMul) {
    for (const key of Object.keys(stats)) {
      stats[key] = Math.round(stats[key] * prefix.statMul);
    }
  }

  // Apply suffix bonus stats
  if (suffix && suffix.bonus) {
    for (const [key, val] of Object.entries(suffix.bonus)) {
      stats[key] = (stats[key] || 0) + val;
    }
  }

  const baseValue = type === 'weapon' || type === 'armor' ? 15 : 8;
  const value = Math.round(baseValue * valueMul + randomInt(0, 5));
  const color = RARITY_COLORS[rarity] || '#aaaaaa';
  const char = charForItem(type, subtype);

  // Effect for consumables
  let effect = null;
  if (type === 'potion') {
    const b = POTION_BASES.find(p => p.subtype === subtype);
    effect = b ? { ...b.effect } : null;
  } else if (type === 'scroll') {
    const b = SCROLL_BASES.find(s => s.effect === subtype);
    effect = b ? { damage: b.damage } : null;
  }

  // Simple description
  const rarityLabel = rarity.charAt(0).toUpperCase() + rarity.slice(1);
  const description = `A ${rarityLabel.toLowerCase()} ${type}.`;

  return {
    name, type, subtype, rarity, char, color,
    value, stats, description,
    isUnique: rarity === 'legendary' || rarity === 'artifact',
    effect,
    acquireCondition: '',
  };
}

// ── Creature Generation ───────────────────────────────────────────────────────

function generateCreature(biome) {
  const table = CREATURE_TABLES[biome];
  if (!table || table.length === 0) return null;

  const template = randomFrom(table);
  const depthScale = 1 + Math.random() * 0.4;  // 1.0 - 1.4 random scaling

  const hp = Math.round((template.hp || 20) * depthScale);
  const attack = Math.round((template.attack || 5) * depthScale);
  const defense = Math.round((template.defense || 3) * depthScale);
  const level = Math.max(1, Math.round((template.level || 1) * depthScale));

  // Pick ability if template has one, or small chance of random
  let ability = template.ability ? { ...template.ability } : null;
  if (!ability && Math.random() < 0.15 && ABILITY_EFFECTS) {
    const abilityKeys = Object.keys(ABILITY_EFFECTS);
    if (abilityKeys.length > 0) {
      const key = randomFrom(abilityKeys);
      ability = { ...ABILITY_EFFECTS[key], _key: key };
    }
  }

  const behavior = template.behavior || randomFrom(BEHAVIORS || ['aggressive']);
  const faction = template.faction || randomFrom(CREATURE_FACTIONS || ['MALFUNCTIONING']);

  return {
    name: template.name || 'Unknown Creature',
    char: template.char || 'x',
    color: template.color || '#AA0000',
    behavior,
    stats: { hp, maxHp: hp, attack, defense, level },
    faction,
    isBoss: template.isBoss || false,
    isElite: template.isElite || false,
    xpBase: Math.round((template.xpBase || 15) * depthScale),
    ability,
    biomes: [biome],
    spawnCondition: '',
  };
}

// ── Randomizer Tab ────────────────────────────────────────────────────────────

const ALL_ROLES = [
  'farmer', 'merchant', 'blacksmith', 'barkeep', 'guard', 'knight',
  'priest', 'scholar', 'beggar', 'noble', 'thief', 'hunter', 'healer',
];

const RACE_OPTIONS = ['human', 'enhanced', 'cyborg'];

const ITEM_TYPE_OPTIONS = (ITEM_TYPES || [
  'weapon', 'armor', 'potion', 'scroll', 'food', 'ring', 'amulet', 'material', 'artifact',
]);

const BIOME_KEYS = Object.keys(CREATURE_TABLES || {});

export class Randomizer {
  constructor(state, container) {
    this.state = state;
    this.container = container;

    // Generated preview data
    this._npc = null;
    this._item = null;
    this._creature = null;

    // Dropdown selections
    this._npcRace = 'human';
    this._npcRole = 'farmer';
    this._itemType = 'weapon';
    this._itemRarity = 'random';
    this._creatureBiome = BIOME_KEYS[0] || 'ruins';
  }

  show() {
    this.container.style.display = '';
    this.render();
  }

  hide() {
    this.container.style.display = 'none';
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  render() {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'randomizer-tab';
    wrapper.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;';

    // Three generator sections
    wrapper.appendChild(this._renderNpcSection());
    wrapper.appendChild(this._renderItemSection());
    wrapper.appendChild(this._renderCreatureSection());

    this.container.appendChild(wrapper);

    // Batch generate section
    this.container.appendChild(this._renderBatchSection());
  }

  // ── Section: Random NPC ─────────────────────────────────────────────────────

  _renderNpcSection() {
    const section = this._section('Random NPC');
    section.style.cssText += 'flex:1 1 280px;min-width:260px;';

    // Race dropdown
    section.appendChild(createDropdown('Race', RACE_OPTIONS, this._npcRace, {
      onchange: v => { this._npcRace = v; },
    }));

    // Role dropdown
    section.appendChild(createDropdown('Role', ALL_ROLES, this._npcRole, {
      onchange: v => { this._npcRole = v; },
    }));

    // Generate button
    const genBtn = this._button('Generate', () => {
      this._npc = generateNpc(this._npcRace, this._npcRole);
      this.render();
    });
    section.appendChild(genBtn);

    // Preview
    if (this._npc) {
      section.appendChild(this._renderNpcPreview(this._npc));

      const sendBtn = this._button('Send to NPC Editor', () => {
        this._sendNpc(this._npc);
      });
      sendBtn.style.marginTop = '8px';
      section.appendChild(sendBtn);
    }

    return section;
  }

  _renderNpcPreview(npc) {
    const card = document.createElement('div');
    card.className = 'randomizer-preview';
    card.style.cssText = 'border:1px solid #444;padding:10px;margin-top:8px;background:#111;font-family:monospace;font-size:0.85em;line-height:1.5;';

    const nameLine = document.createElement('div');
    nameLine.style.cssText = 'font-size:1.1em;font-weight:bold;margin-bottom:4px;';
    const charSpan = document.createElement('span');
    charSpan.textContent = npc.char;
    charSpan.style.cssText = `color:${npc.color};margin-right:6px;font-size:1.3em;`;
    nameLine.appendChild(charSpan);
    nameLine.appendChild(document.createTextNode(npc.name.full));
    card.appendChild(nameLine);

    const lines = [
      `Title: ${npc.title}`,
      `Race: ${npc.race} | Role: ${npc.role}`,
      `HP: ${npc.stats.hp}/${npc.stats.maxHp} | ATK: ${npc.stats.attack} | DEF: ${npc.stats.defense} | LVL: ${npc.stats.level}`,
      `Traits: ${npc.personality.traits.join(', ')}`,
      `Mood: ${npc.personality.mood} | Archetype: ${npc.personality.archetype}`,
      `Faction: ${npc.faction}`,
    ];

    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      card.appendChild(div);
    }

    // Secrets
    if (npc.secrets && npc.secrets.length > 0) {
      const secretsDiv = document.createElement('div');
      secretsDiv.style.marginTop = '4px';
      secretsDiv.style.color = '#c97';
      secretsDiv.textContent = 'Secrets:';
      card.appendChild(secretsDiv);
      for (const secret of npc.secrets) {
        const sDiv = document.createElement('div');
        sDiv.style.paddingLeft = '8px';
        sDiv.textContent = `- ${secret}`;
        card.appendChild(sDiv);
      }
    }

    return card;
  }

  _sendNpc(npc) {
    const data = structuredClone(npc);
    this.state.add('npcs', data);
    this._showStatus('NPC added to state. Switch to NPC tab to edit.');
    document.dispatchEvent(new CustomEvent('randomizer:switch-tab', { detail: { tab: 'npcs' } }));
  }

  // ── Section: Random Item ────────────────────────────────────────────────────

  _renderItemSection() {
    const section = this._section('Random Item');
    section.style.cssText += 'flex:1 1 280px;min-width:260px;';

    // Type dropdown
    section.appendChild(createDropdown('Type', ITEM_TYPE_OPTIONS, this._itemType, {
      onchange: v => { this._itemType = v; },
    }));

    // Rarity dropdown (with "Random" option)
    const allRarities = RARITIES || Object.keys(RARITY_COLORS);
    const rarityOptions = ['random', ...allRarities];
    section.appendChild(createDropdown('Rarity', rarityOptions, this._itemRarity, {
      onchange: v => { this._itemRarity = v; },
    }));

    // Generate button
    const genBtn = this._button('Generate', () => {
      this._item = generateItem(this._itemType, this._itemRarity);
      this.render();
    });
    section.appendChild(genBtn);

    // Preview
    if (this._item) {
      section.appendChild(this._renderItemPreview(this._item));

      const sendBtn = this._button('Send to Item Editor', () => {
        this._sendItem(this._item);
      });
      sendBtn.style.marginTop = '8px';
      section.appendChild(sendBtn);
    }

    return section;
  }

  _renderItemPreview(item) {
    const card = document.createElement('div');
    card.className = 'randomizer-preview';
    card.style.cssText = 'border:1px solid #444;padding:10px;margin-top:8px;background:#111;font-family:monospace;font-size:0.85em;line-height:1.5;';

    // Name with rarity color
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = `font-size:1.1em;font-weight:bold;margin-bottom:4px;color:${item.color};`;
    nameDiv.textContent = `[${item.char}] ${item.name}`;
    card.appendChild(nameDiv);

    // Rarity badge
    const rarityDiv = document.createElement('div');
    const badge = document.createElement('span');
    badge.textContent = item.rarity.toUpperCase();
    badge.style.cssText = `color:${item.color};font-weight:bold;`;
    rarityDiv.appendChild(document.createTextNode('Rarity: '));
    rarityDiv.appendChild(badge);
    card.appendChild(rarityDiv);

    const lines = [
      `Type: ${item.type} | Subtype: ${item.subtype}`,
    ];

    // Stats
    const statEntries = Object.entries(item.stats || {});
    if (statEntries.length > 0) {
      lines.push('Stats: ' + statEntries.map(([k, v]) => `${k}: ${v}`).join(', '));
    }

    lines.push(`Value: ${item.value} gold`);
    lines.push(item.description);

    // Effect
    if (item.effect) {
      const effectStr = Object.entries(item.effect).map(([k, v]) => `${k}: ${v}`).join(', ');
      lines.push(`Effect: ${effectStr}`);
    }

    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      card.appendChild(div);
    }

    return card;
  }

  _sendItem(item) {
    const data = structuredClone(item);
    this.state.add('items', data);
    this._showStatus('Item added to state. Switch to Items tab to edit.');
    document.dispatchEvent(new CustomEvent('randomizer:switch-tab', { detail: { tab: 'items' } }));
  }

  // ── Section: Random Creature ────────────────────────────────────────────────

  _renderCreatureSection() {
    const section = this._section('Random Creature');
    section.style.cssText += 'flex:1 1 280px;min-width:260px;';

    // Biome dropdown
    if (BIOME_KEYS.length > 0) {
      section.appendChild(createDropdown('Biome', BIOME_KEYS, this._creatureBiome, {
        onchange: v => { this._creatureBiome = v; },
      }));
    }

    // Generate button
    const genBtn = this._button('Generate', () => {
      this._creature = generateCreature(this._creatureBiome);
      this.render();
    });
    section.appendChild(genBtn);

    // Preview
    if (this._creature) {
      section.appendChild(this._renderCreaturePreview(this._creature));

      const sendBtn = this._button('Send to Creature Editor', () => {
        this._sendCreature(this._creature);
      });
      sendBtn.style.marginTop = '8px';
      section.appendChild(sendBtn);
    }

    return section;
  }

  _renderCreaturePreview(creature) {
    const card = document.createElement('div');
    card.className = 'randomizer-preview';
    card.style.cssText = 'border:1px solid #444;padding:10px;margin-top:8px;background:#111;font-family:monospace;font-size:0.85em;line-height:1.5;';

    // Name with char
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size:1.1em;font-weight:bold;margin-bottom:4px;';
    const charSpan = document.createElement('span');
    charSpan.textContent = creature.char;
    charSpan.style.cssText = `color:${creature.color};margin-right:6px;font-size:1.3em;`;
    nameDiv.appendChild(charSpan);
    nameDiv.appendChild(document.createTextNode(creature.name));
    card.appendChild(nameDiv);

    const s = creature.stats;
    const lines = [
      `HP: ${s.hp}/${s.maxHp} | ATK: ${s.attack} | DEF: ${s.defense} | LVL: ${s.level}`,
      `Behavior: ${creature.behavior}`,
      `Faction: ${creature.faction}`,
      `XP: ${creature.xpBase}`,
    ];

    if (creature.isBoss) lines.push('** BOSS **');
    if (creature.isElite) lines.push('* ELITE *');

    if (creature.ability) {
      const a = creature.ability;
      lines.push(`Ability: ${a.name || '(unnamed)'} [${a.type || '?'}]${a.damage ? ' dmg:' + a.damage : ''}`);
    }

    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      card.appendChild(div);
    }

    return card;
  }

  _sendCreature(creature) {
    const data = structuredClone(creature);
    if (!this.state.creatures) this.state.creatures = [];
    this.state.creatures.push(data);
    if (this.state.add) {
      this.state.add('creatures', data);
    }
    this._showStatus('Creature added to state. Switch to Creatures tab to edit.');
    document.dispatchEvent(new CustomEvent('randomizer:switch-tab', { detail: { tab: 'creatures' } }));
  }

  // ── Section: Batch Generate ─────────────────────────────────────────────────

  _renderBatchSection() {
    const section = this._section('Batch Generate');
    section.style.cssText += 'width:100%;margin-top:8px;';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';

    // 5 Random NPCs
    row.appendChild(this._button('Generate 5 Random NPCs', () => {
      let count = 0;
      for (let i = 0; i < 5; i++) {
        const race = randomFrom(RACE_OPTIONS);
        const role = randomFrom(ALL_ROLES);
        const npc = generateNpc(race, role);
        this.state.add('npcs', npc);
        count++;
      }
      this._showStatus(`Added ${count} random NPCs to state.`);
    }));

    // 5 Random Items
    row.appendChild(this._button('Generate 5 Random Items', () => {
      let count = 0;
      for (let i = 0; i < 5; i++) {
        const type = randomFrom(ITEM_TYPE_OPTIONS);
        const item = generateItem(type, 'random');
        this.state.add('items', item);
        count++;
      }
      this._showStatus(`Added ${count} random items to state.`);
    }));

    // 5 Random Creatures
    row.appendChild(this._button('Generate 5 Random Creatures', () => {
      if (BIOME_KEYS.length === 0) {
        this._showStatus('No biomes available in CREATURE_TABLES.');
        return;
      }
      let count = 0;
      for (let i = 0; i < 5; i++) {
        const biome = randomFrom(BIOME_KEYS);
        const creature = generateCreature(biome);
        if (creature) {
          this.state.add('creatures', creature);
          count++;
        }
      }
      this._showStatus(`Added ${count} random creatures to state.`);
    }));

    section.appendChild(row);

    // Status line
    const statusEl = document.createElement('div');
    statusEl.className = 'randomizer-status';
    statusEl.style.cssText = 'margin-top:8px;color:#8f8;font-size:0.85em;min-height:1.2em;';
    section.appendChild(statusEl);
    this._statusEl = statusEl;

    return section;
  }

  // ── DOM helpers ─────────────────────────────────────────────────────────────

  _section(title) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'randomizer-section';
    fieldset.style.cssText = 'margin-bottom:12px;padding:10px;';
    const legend = document.createElement('legend');
    legend.textContent = title;
    fieldset.appendChild(legend);
    return fieldset;
  }

  _button(label, onclick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', onclick);
    return btn;
  }

  _showStatus(message) {
    if (this._statusEl) {
      this._statusEl.textContent = message;
    }
  }
}
