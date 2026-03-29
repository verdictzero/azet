// creature-editor.js — Creature/Enemy editor tab for the ASCIIQUEST structure editor

import { CREATURE_TABLES, ABILITY_EFFECTS, BEHAVIORS, CREATURE_FACTIONS, STAT_KEYS } from '../data-constants.js';
import { createDropdown, createTextInput, createNumberInput, createCheckbox, createColorPicker, createCharInput, createStatBlock, createTextarea } from '../components/form-fields.js';

const DEFAULT_CREATURE = () => ({
  id: null,
  name: 'New Creature',
  char: 'x',
  color: '#AA0000',
  behavior: 'aggressive',
  stats: { hp: 20, maxHp: 20, attack: 5, defense: 3, level: 1 },
  faction: 'MALFUNCTIONING',
  isBoss: false,
  isElite: false,
  xpBase: 15,
  ability: null,
  biomes: ['ruins'],
  spawnCondition: ''
});

const BIOME_KEYS = Object.keys(CREATURE_TABLES);

const ABILITY_TYPES = ['magic', 'debuff', 'dot', 'control', 'heal', 'drain', 'utility'];

export class CreatureEditor {
  constructor(state, container) {
    this.state = state;
    this.container = container;
    this.entity = null;
    this.el = document.createElement('div');
    this.el.className = 'creature-editor tab-panel';
    this.container.appendChild(this.el);
    this.hide();
  }

  show() {
    this.el.style.display = '';
  }

  hide() {
    this.el.style.display = 'none';
  }

  editEntity(id) {
    const creature = this.state.get('creatures', id);
    if (!creature) return;
    this.entity = creature;
    this.render();
    this.show();
  }

  createNew() {
    const creature = DEFAULT_CREATURE();
    const id = this.state.add('creatures', creature);
    this.entity = this.state.get('creatures', id);
    this.render();
    this.show();
  }

  render() {
    this.el.innerHTML = '';
    const e = this.entity;
    if (!e) {
      this.el.textContent = 'No creature selected.';
      return;
    }

    // ── Basic Info ────────────────────────────────────────────

    const basicSection = this._section('Basic Info');

    // ID (read-only)
    const idRow = this._row('ID');
    const idSpan = document.createElement('span');
    idSpan.className = 'creature-editor-id';
    idSpan.textContent = e.id || '(unsaved)';
    idRow.appendChild(idSpan);
    basicSection.appendChild(idRow);

    // Name
    basicSection.appendChild(createTextInput('Name', e.name, val => {
      e.name = val;
      this._notify();
    }));

    // Char (single character with large preview)
    const charRow = document.createElement('div');
    charRow.className = 'form-row creature-editor-char-row';

    const charField = createCharInput('Char', e.char, val => {
      e.char = val;
      preview.textContent = val;
      preview.style.color = e.color;
      this._notify();
    });
    charRow.appendChild(charField);

    const preview = document.createElement('div');
    preview.className = 'creature-editor-char-preview';
    preview.textContent = e.char;
    preview.style.color = e.color;
    preview.style.fontSize = '48px';
    preview.style.fontFamily = 'monospace';
    preview.style.lineHeight = '1';
    preview.style.textAlign = 'center';
    preview.style.minWidth = '60px';
    charRow.appendChild(preview);
    basicSection.appendChild(charRow);

    // Color
    basicSection.appendChild(createColorPicker('Color', e.color, val => {
      e.color = val;
      preview.style.color = val;
      this._notify();
    }));

    // Behavior dropdown
    basicSection.appendChild(createDropdown('Behavior', BEHAVIORS, e.behavior, val => {
      e.behavior = val;
      this._notify();
    }));

    this.el.appendChild(basicSection);

    // ── Stats ─────────────────────────────────────────────────

    const statsSection = this._section('Stats');

    const statFields = [
      { key: 'hp', label: 'HP', min: 1 },
      { key: 'attack', label: 'Attack', min: 0 },
      { key: 'defense', label: 'Defense', min: 0 },
      { key: 'level', label: 'Level', min: 1 }
    ];

    for (const sf of statFields) {
      statsSection.appendChild(createNumberInput(sf.label, e.stats[sf.key], val => {
        e.stats[sf.key] = val;
        // Keep maxHp in sync with hp
        if (sf.key === 'hp') e.stats.maxHp = val;
        this._notify();
      }, { min: sf.min }));
    }

    // xpBase
    statsSection.appendChild(createNumberInput('XP Base', e.xpBase, val => {
      e.xpBase = val;
      this._notify();
    }, { min: 0 }));

    this.el.appendChild(statsSection);

    // ── Classification ────────────────────────────────────────

    const classSection = this._section('Classification');

    classSection.appendChild(createDropdown('Faction', CREATURE_FACTIONS, e.faction, val => {
      e.faction = val;
      this._notify();
    }));

    classSection.appendChild(createCheckbox('Boss', e.isBoss, val => {
      e.isBoss = val;
      this._notify();
    }));

    classSection.appendChild(createCheckbox('Elite', e.isElite, val => {
      e.isElite = val;
      this._notify();
    }));

    this.el.appendChild(classSection);

    // ── Ability ───────────────────────────────────────────────

    const abilitySection = this._section('Ability');

    const abilityKeys = Object.keys(ABILITY_EFFECTS);
    const abilityOptions = ['none', ...abilityKeys, '__custom'];
    const abilityLabels = {
      none: 'None',
      __custom: '-- Custom --'
    };
    for (const k of abilityKeys) {
      abilityLabels[k] = ABILITY_EFFECTS[k].name;
    }

    // Determine current selection
    let currentAbilityKey = 'none';
    if (e.ability) {
      if (e.ability._custom) {
        currentAbilityKey = '__custom';
      } else {
        // Try to match by name against known abilities
        const matchKey = abilityKeys.find(k => k === e.ability._key);
        currentAbilityKey = matchKey || '__custom';
      }
    }

    const abilityPreviewEl = document.createElement('div');
    abilityPreviewEl.className = 'creature-editor-ability-preview';

    const customAbilityEl = document.createElement('div');
    customAbilityEl.className = 'creature-editor-custom-ability';

    const updateAbilityDisplay = (key) => {
      abilityPreviewEl.innerHTML = '';
      customAbilityEl.innerHTML = '';

      if (key === 'none') {
        e.ability = null;
        this._notify();
        return;
      }

      if (key === '__custom') {
        this._renderCustomAbility(customAbilityEl, e);
        return;
      }

      // Known ability selected
      const def = ABILITY_EFFECTS[key];
      if (!def) return;

      e.ability = { ...def, _key: key };
      this._notify();

      const table = document.createElement('table');
      table.className = 'creature-editor-ability-table';

      const rows = [
        ['Name', def.name],
        ['Damage', def.damage != null ? def.damage : '--'],
        ['Type', def.type],
        ['Description', def.description]
      ];

      for (const [label, value] of rows) {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = label;
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(th);
        tr.appendChild(td);
        table.appendChild(tr);
      }

      abilityPreviewEl.appendChild(table);
    };

    abilitySection.appendChild(createDropdown(
      'Ability',
      abilityOptions,
      currentAbilityKey,
      val => updateAbilityDisplay(val),
      abilityLabels
    ));

    abilitySection.appendChild(abilityPreviewEl);
    abilitySection.appendChild(customAbilityEl);

    // Initialize display for current value
    if (currentAbilityKey !== 'none') {
      updateAbilityDisplay(currentAbilityKey);
    }

    this.el.appendChild(abilitySection);

    // ── Biome & Spawning ──────────────────────────────────────

    const biomeSection = this._section('Biome & Spawning');

    const biomeGrid = document.createElement('div');
    biomeGrid.className = 'creature-editor-biome-grid';

    for (const biome of BIOME_KEYS) {
      const checked = e.biomes && e.biomes.includes(biome);
      const cb = createCheckbox(biome, checked, val => {
        if (!e.biomes) e.biomes = [];
        if (val) {
          if (!e.biomes.includes(biome)) e.biomes.push(biome);
        } else {
          e.biomes = e.biomes.filter(b => b !== biome);
        }
        this._notify();
      });
      biomeGrid.appendChild(cb);
    }

    biomeSection.appendChild(biomeGrid);

    // Spawn condition
    biomeSection.appendChild(createTextInput('Spawn Condition', e.spawnCondition || '', val => {
      e.spawnCondition = val;
      this._notify();
    }));

    this.el.appendChild(biomeSection);
  }

  // ── Private helpers ──────────────────────────────────────────

  _section(title) {
    const section = document.createElement('fieldset');
    section.className = 'creature-editor-section';
    const legend = document.createElement('legend');
    legend.textContent = title;
    section.appendChild(legend);
    return section;
  }

  _row(label) {
    const row = document.createElement('div');
    row.className = 'form-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);
    return row;
  }

  _renderCustomAbility(container, e) {
    const custom = (e.ability && e.ability._custom) ? e.ability : {
      _custom: true,
      name: '',
      damage: 0,
      type: 'magic',
      description: ''
    };
    e.ability = custom;

    container.appendChild(createTextInput('Ability Name', custom.name, val => {
      custom.name = val;
      this._notify();
    }));

    container.appendChild(createNumberInput('Damage', custom.damage, val => {
      custom.damage = val;
      this._notify();
    }, { min: 0 }));

    container.appendChild(createDropdown('Type', ABILITY_TYPES, custom.type, val => {
      custom.type = val;
      this._notify();
    }));

    container.appendChild(createTextarea('Description', custom.description, val => {
      custom.description = val;
      this._notify();
    }));
  }

  _notify() {
    if (this.state.onUpdate) {
      this.state.onUpdate();
    }
  }
}
