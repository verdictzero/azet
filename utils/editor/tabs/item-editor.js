// item-editor.js — Item/Weapon editor tab for the ASCIIQUEST structure editor

import {
  WEAPON_SUBTYPES, ARMOR_SUBTYPES, ITEM_PREFIXES, ITEM_SUFFIXES,
  RARITY_COLORS, RARITY_MULTIPLIERS, POTION_BASES, SCROLL_BASES,
  FOOD_BASES, MATERIAL_BASES, ARTIFACT_BASES, ITEM_TYPES, RARITIES, STAT_KEYS
} from '../data-constants.js';

import {
  createDropdown, createTextInput, createNumberInput, createTextarea,
  createCheckbox, createColorPicker, createCharInput, createKeyValueEditor
} from '../components/form-fields.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultItem() {
  return {
    id: null,
    name: 'New Item',
    type: 'weapon',
    subtype: 'sword',
    rarity: 'common',
    char: '/',
    color: '#aaaaaa',
    value: 10,
    stats: { attack: 5 },
    description: '',
    isUnique: false,
    effect: null,
    acquireCondition: '',
  };
}

/** Return the subtype options appropriate for the given item type. */
function subtypeOptionsForType(type) {
  switch (type) {
    case 'weapon':
      return Object.keys(WEAPON_SUBTYPES).map(k => ({ value: k, label: WEAPON_SUBTYPES[k].name }));
    case 'armor':
      return Object.keys(ARMOR_SUBTYPES).map(k => ({ value: k, label: ARMOR_SUBTYPES[k].name }));
    case 'potion':
      return POTION_BASES.map(b => ({ value: b.subtype, label: b.subtype }));
    case 'scroll':
      return SCROLL_BASES.map(b => ({ value: b.effect, label: b.effect }));
    case 'ring':
    case 'amulet':
      return [{ value: type, label: type }];
    case 'food':
    case 'material':
    case 'artifact':
    case 'light':
    default:
      return [];
  }
}

/** Derive the default display char for a type + subtype combination. */
function charForTypeSubtype(type, subtype) {
  if (type === 'weapon' && WEAPON_SUBTYPES[subtype]) return WEAPON_SUBTYPES[subtype].char;
  if (type === 'armor' && ARMOR_SUBTYPES[subtype]) return ARMOR_SUBTYPES[subtype].char;
  if (type === 'potion') return '!';
  if (type === 'scroll') return '?';
  if (type === 'food') return '%';
  if (type === 'ring') return 'o';
  if (type === 'amulet') return '"';
  if (type === 'material') return '*';
  if (type === 'artifact') return '&';
  if (type === 'light') return '*';
  return '?';
}

/** Derive the base name string from the type + subtype. */
function baseNameForTypeSubtype(type, subtype) {
  if (type === 'weapon' && WEAPON_SUBTYPES[subtype]) return WEAPON_SUBTYPES[subtype].name;
  if (type === 'armor' && ARMOR_SUBTYPES[subtype]) return ARMOR_SUBTYPES[subtype].name;
  if (type === 'potion') {
    const base = POTION_BASES.find(b => b.subtype === subtype);
    return base ? base.name : 'Potion';
  }
  if (type === 'scroll') {
    const base = SCROLL_BASES.find(b => b.effect === subtype);
    return base ? base.name : 'Scroll';
  }
  if (type === 'food') return 'Ration';
  if (type === 'ring') return 'Ring';
  if (type === 'amulet') return 'Amulet';
  if (type === 'material') return 'Material';
  if (type === 'artifact') return 'Artifact';
  if (type === 'light') return 'Light';
  return 'Item';
}

/** Calculate base stats for the given type/subtype/rarity. */
function calcBaseStats(type, subtype, rarity) {
  const mul = (RARITY_MULTIPLIERS[rarity] || RARITY_MULTIPLIERS.common).stat;
  const stats = {};

  if (type === 'weapon' && WEAPON_SUBTYPES[subtype]) {
    stats.attack = Math.round(WEAPON_SUBTYPES[subtype].baseDmg * mul);
  } else if (type === 'armor' && ARMOR_SUBTYPES[subtype]) {
    stats.defense = Math.round(ARMOR_SUBTYPES[subtype].baseDef * mul);
  } else if (type === 'ring' || type === 'amulet') {
    // Rings/amulets get a small stat bonus scaled by rarity
    stats.defense = Math.round(1 * mul);
  }
  return stats;
}

/** Apply suffix bonus stats on top of a stats object (returns new object). */
function applySuffixStats(stats, suffixIndex) {
  if (suffixIndex < 0 || suffixIndex >= ITEM_SUFFIXES.length) return { ...stats };
  const bonus = ITEM_SUFFIXES[suffixIndex].bonus;
  const merged = { ...stats };
  for (const key of Object.keys(bonus)) {
    merged[key] = (merged[key] || 0) + bonus[key];
  }
  return merged;
}

/** Apply prefix multiplier to numeric stat values. */
function applyPrefixMultiplier(stats, prefixIndex) {
  if (prefixIndex < 0 || prefixIndex >= ITEM_PREFIXES.length) return { ...stats };
  const mul = ITEM_PREFIXES[prefixIndex].statMul;
  const result = {};
  for (const key of Object.keys(stats)) {
    result[key] = Math.round(stats[key] * mul);
  }
  return result;
}

/** Compose the full display name from prefix, baseName, and suffix. */
function composeName(prefixIndex, baseName, suffixIndex) {
  const parts = [];
  if (prefixIndex >= 0 && prefixIndex < ITEM_PREFIXES.length) {
    parts.push(ITEM_PREFIXES[prefixIndex].name);
  }
  parts.push(baseName);
  if (suffixIndex >= 0 && suffixIndex < ITEM_SUFFIXES.length) {
    parts.push(ITEM_SUFFIXES[suffixIndex].name);
  }
  return parts.join(' ');
}

// ── ItemEditor ─────────────────────────────────────────────────────────────

export class ItemEditor {
  constructor(state, container) {
    this.state = state;
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'item-editor-tab';
    this.container.appendChild(this.el);

    // Internal editing state
    this._item = defaultItem();
    this._prefixIndex = -1;
    this._suffixIndex = -1;
    this._customName = false;
    this._baseName = 'Sword';

    this.el.style.display = 'none';
  }

  // ── Visibility ──────────────────────────────────────────────────────────

  show() {
    this.el.style.display = '';
    this.render();
  }

  hide() {
    this.el.style.display = 'none';
  }

  // ── Entity management ───────────────────────────────────────────────────

  editEntity(id) {
    const items = this.state.data && this.state.data.items;
    if (!items) return;
    const found = Array.isArray(items)
      ? items.find(i => i.id === id)
      : items[id];
    if (!found) return;

    this._item = JSON.parse(JSON.stringify(found));

    // Try to reconstruct prefix/suffix indices from the name
    this._prefixIndex = -1;
    this._suffixIndex = -1;
    this._customName = false;
    this._baseName = baseNameForTypeSubtype(this._item.type, this._item.subtype);

    // Check if name matches a composed pattern
    const name = this._item.name || '';
    for (let i = 0; i < ITEM_PREFIXES.length; i++) {
      if (name.startsWith(ITEM_PREFIXES[i].name + ' ')) {
        this._prefixIndex = i;
        break;
      }
    }
    for (let i = 0; i < ITEM_SUFFIXES.length; i++) {
      if (name.endsWith(ITEM_SUFFIXES[i].name)) {
        this._suffixIndex = i;
        break;
      }
    }
    const composed = composeName(this._prefixIndex, this._baseName, this._suffixIndex);
    if (composed !== name) {
      this._customName = true;
    }

    this.render();
  }

  createNew() {
    this._item = defaultItem();
    this._prefixIndex = -1;
    this._suffixIndex = -1;
    this._customName = false;
    this._baseName = 'Sword';

    if (this.state.data) {
      const items = this.state.data.items;
      if (Array.isArray(items)) {
        // Generate a unique numeric id
        const maxId = items.reduce((m, i) => Math.max(m, typeof i.id === 'number' ? i.id : 0), 0);
        this._item.id = maxId + 1;
      }
    }

    this.render();
  }

  // ── Render ──────────────────────────────────────────────────────────────

  render() {
    this.el.innerHTML = '';
    const item = this._item;

    // ── Section: Basic Info ───────────────────────────────────────────────

    const basicSection = this._section('Basic Info');

    // ID (read-only)
    basicSection.appendChild(createTextInput('ID', item.id != null ? String(item.id) : '(auto)', {
      readonly: true,
    }));

    // Type dropdown
    const typeOptions = (ITEM_TYPES || ['weapon', 'armor', 'potion', 'scroll', 'food', 'ring', 'amulet', 'material', 'artifact', 'light'])
      .map(t => ({ value: t, label: t }));
    basicSection.appendChild(createDropdown('Type', typeOptions, item.type, (val) => {
      item.type = val;
      this._onTypeChange();
    }));

    // Subtype dropdown (dynamic)
    const subOpts = subtypeOptionsForType(item.type);
    if (subOpts.length > 0) {
      basicSection.appendChild(createDropdown('Subtype', subOpts, item.subtype || '', (val) => {
        item.subtype = val;
        this._onSubtypeChange();
      }));
    }

    this.el.appendChild(basicSection);

    // ── Section: Name Builder ─────────────────────────────────────────────

    const nameSection = this._section('Name Builder');

    // Prefix dropdown
    const prefixOpts = [{ value: '-1', label: '(none)' }].concat(
      ITEM_PREFIXES.map((p, i) => ({ value: String(i), label: `${p.name} (x${p.statMul})` }))
    );
    nameSection.appendChild(createDropdown('Prefix', prefixOpts, String(this._prefixIndex), (val) => {
      this._prefixIndex = parseInt(val, 10);
      this._updateNameAndStats();
      this.render();
    }));

    // Base name
    nameSection.appendChild(createTextInput('Base Name', this._baseName, {
      onChange: (val) => {
        this._baseName = val;
        this._updateNameAndStats();
        this._refreshNamePreview();
      },
    }));

    // Suffix dropdown
    const suffixOpts = [{ value: '-1', label: '(none)' }].concat(
      ITEM_SUFFIXES.map((s, i) => {
        const bonusStr = Object.entries(s.bonus).map(([k, v]) => `${k}+${v}`).join(', ');
        return { value: String(i), label: `${s.name} (${bonusStr})` };
      })
    );
    nameSection.appendChild(createDropdown('Suffix', suffixOpts, String(this._suffixIndex), (val) => {
      this._suffixIndex = parseInt(val, 10);
      this._updateNameAndStats();
      this.render();
    }));

    // Full name preview
    const namePreview = document.createElement('div');
    namePreview.className = 'item-editor-name-preview';
    const previewLabel = document.createElement('span');
    previewLabel.className = 'item-editor-label';
    previewLabel.textContent = 'Full Name: ';
    const previewValue = document.createElement('span');
    previewValue.className = 'item-editor-name-value';
    previewValue.style.color = item.color || '#aaaaaa';
    previewValue.textContent = item.name || '';
    namePreview.appendChild(previewLabel);
    namePreview.appendChild(previewValue);
    nameSection.appendChild(namePreview);

    // Custom name override
    nameSection.appendChild(createCheckbox('Custom name', this._customName, (checked) => {
      this._customName = checked;
      this.render();
    }));

    if (this._customName) {
      nameSection.appendChild(createTextInput('Custom Name', item.name, {
        onChange: (val) => { item.name = val; this._refreshNamePreview(); },
      }));
    }

    this.el.appendChild(nameSection);

    // ── Section: Appearance ───────────────────────────────────────────────

    const appearanceSection = this._section('Appearance');

    // Rarity dropdown with color swatch
    const rarityList = RARITIES || Object.keys(RARITY_COLORS);
    const rarityOpts = rarityList.map(r => ({
      value: r,
      label: r,
      swatch: RARITY_COLORS[r],
    }));
    appearanceSection.appendChild(createDropdown('Rarity', rarityOpts, item.rarity, (val) => {
      item.rarity = val;
      this._onRarityChange();
    }));

    // Char input
    appearanceSection.appendChild(createCharInput('Char', item.char, (val) => {
      item.char = val;
    }));

    // Color picker
    appearanceSection.appendChild(createColorPicker('Color', item.color, (val) => {
      item.color = val;
      this._refreshNamePreview();
    }));

    this.el.appendChild(appearanceSection);

    // ── Section: Stats ────────────────────────────────────────────────────

    const statsSection = this._section('Stats');
    const statKeys = STAT_KEYS || ['hp', 'attack', 'defense', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'mana', 'coldResist', 'heatResist'];
    statsSection.appendChild(createKeyValueEditor('Stats', statKeys, item.stats || {}, (newStats) => {
      item.stats = newStats;
    }));

    this.el.appendChild(statsSection);

    // ── Section: Value & Description ──────────────────────────────────────

    const valDescSection = this._section('Value & Description');

    valDescSection.appendChild(createNumberInput('Value', item.value, {
      min: 0,
      onChange: (val) => { item.value = val; },
    }));

    valDescSection.appendChild(createTextarea('Description', item.description, {
      onChange: (val) => { item.description = val; },
    }));

    valDescSection.appendChild(createCheckbox('isUnique', item.isUnique, (checked) => {
      item.isUnique = checked;
    }));

    this.el.appendChild(valDescSection);

    // ── Section: Effect (potions/scrolls only) ────────────────────────────

    if (item.type === 'potion' || item.type === 'scroll') {
      const effectSection = this._section('Effect');
      const effectKeys = ['heal', 'mana', 'damage', 'str', 'dex', 'con', 'int', 'wis', 'duration'];
      effectSection.appendChild(createKeyValueEditor('Effect', effectKeys, item.effect || {}, (newEffect) => {
        item.effect = Object.keys(newEffect).length > 0 ? newEffect : null;
      }));
      this.el.appendChild(effectSection);
    }

    // ── Section: Acquire Condition ────────────────────────────────────────

    const acquireSection = this._section('Acquire Condition');
    acquireSection.appendChild(createTextInput('Condition', item.acquireCondition || '', {
      placeholder: 'e.g. quest_complete:chain_guard_01',
      onChange: (val) => { item.acquireCondition = val; },
    }));
    this.el.appendChild(acquireSection);
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  /** Create a collapsible section wrapper. */
  _section(title) {
    const section = document.createElement('fieldset');
    section.className = 'item-editor-section';
    const legend = document.createElement('legend');
    legend.textContent = title;
    section.appendChild(legend);
    return section;
  }

  /** Called when the type dropdown changes. Resets subtype, char, base stats. */
  _onTypeChange() {
    const item = this._item;
    const subOpts = subtypeOptionsForType(item.type);

    // Reset subtype to the first available option, or clear it
    if (subOpts.length > 0) {
      item.subtype = subOpts[0].value;
    } else {
      item.subtype = '';
    }

    // Reset char based on new type/subtype
    item.char = charForTypeSubtype(item.type, item.subtype);

    // Reset base name
    this._baseName = baseNameForTypeSubtype(item.type, item.subtype);

    // Recalculate stats
    this._recalcStats();

    // Update name
    this._updateNameAndStats();

    // Auto-fill effect for potions/scrolls, clear for others
    if (item.type === 'potion') {
      const base = POTION_BASES.find(b => b.subtype === item.subtype);
      item.effect = base ? { ...base.effect } : {};
    } else if (item.type === 'scroll') {
      const base = SCROLL_BASES.find(b => b.effect === item.subtype);
      item.effect = base ? { damage: base.damage } : {};
    } else {
      item.effect = null;
    }

    this.render();
  }

  /** Called when the subtype dropdown changes. */
  _onSubtypeChange() {
    const item = this._item;
    item.char = charForTypeSubtype(item.type, item.subtype);
    this._baseName = baseNameForTypeSubtype(item.type, item.subtype);

    // Recalculate stats
    this._recalcStats();
    this._updateNameAndStats();

    // Update effect for potions/scrolls
    if (item.type === 'potion') {
      const base = POTION_BASES.find(b => b.subtype === item.subtype);
      item.effect = base ? { ...base.effect } : {};
    } else if (item.type === 'scroll') {
      const base = SCROLL_BASES.find(b => b.effect === item.subtype);
      item.effect = base ? { damage: base.damage } : {};
    }

    this.render();
  }

  /** Called when the rarity dropdown changes. Updates color and recalculates stats. */
  _onRarityChange() {
    const item = this._item;
    item.color = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
    this._recalcStats();
    this._updateNameAndStats();
    this.render();
  }

  /** Recalculate base stats from type/subtype/rarity, then apply prefix/suffix. */
  _recalcStats() {
    const item = this._item;
    let stats = calcBaseStats(item.type, item.subtype, item.rarity);
    stats = applyPrefixMultiplier(stats, this._prefixIndex);
    stats = applySuffixStats(stats, this._suffixIndex);
    item.stats = stats;
  }

  /** Update the item's name from prefix/baseName/suffix (unless custom). */
  _updateNameAndStats() {
    const item = this._item;
    if (!this._customName) {
      item.name = composeName(this._prefixIndex, this._baseName, this._suffixIndex);
    }
    this._recalcStats();
  }

  /** Refresh only the name preview element without a full re-render. */
  _refreshNamePreview() {
    const previewEl = this.el.querySelector('.item-editor-name-value');
    if (previewEl) {
      previewEl.textContent = this._item.name || '';
      previewEl.style.color = this._item.color || '#aaaaaa';
    }
  }
}
