import {
  NAME_POOLS, NICKNAMES, PERSONALITY_TRAITS, ARCHETYPES,
  ROLE_CHARS, ROLE_COLORS, ROLE_TITLES, SECRET_TEMPLATES,
  ROLE_SCHEDULES, NPC_FACTIONS, NPC_CATEGORIES, RACES, MOODS,
} from '../data-constants.js';

import {
  createDropdown, createTextInput, createNumberInput, createTextarea,
  createCheckbox, createColorPicker, createCharInput, createTagPicker,
  createStatBlock, createListEditor, createKeyValueEditor,
} from '../components/form-fields.js';

const ALL_ROLES = Object.keys(ROLE_CHARS);
const SHOP_ROLES = ['merchant', 'blacksmith', 'barkeep'];
const SHOP_SPECIALIZATIONS = [
  'general', 'potions', 'scrolls', 'food', 'weapons', 'armor', 'tools', 'tavern',
];

function getNpcCategory(role) {
  for (const [cat, roles] of Object.entries(NPC_CATEGORIES)) {
    if (roles.includes(role)) return cat;
  }
  return 'ambient';
}

function defaultStatsForRole(role) {
  const isCombat = role === 'guard' || role === 'knight';
  return {
    hp: isCombat ? 40 : 20,
    maxHp: isCombat ? 40 : 20,
    attack: isCombat ? 8 : 3,
    defense: isCombat ? 6 : 2,
    level: 1,
  };
}

function makeDefaultNpc() {
  return {
    id: null,
    name: { first: '', last: '', full: '', nickname: '' },
    race: 'human',
    role: 'farmer',
    title: '',
    char: 'N',
    color: '#cccccc',
    stats: { hp: 20, maxHp: 20, attack: 3, defense: 2, level: 1 },
    personality: { traits: [], mood: 'neutral', archetype: 'neutral' },
    schedule: [],
    faction: 'None',
    secrets: [],
    shop: null,
    dialogueTreeId: null,
    placementHint: '',
    category: 'ambient',
  };
}

function makeDefaultShop(role) {
  return {
    buyMultiplier: 0.5,
    sellMultiplier: 1.0,
    restockInterval: 100,
    specialization: role === 'blacksmith'
      ? 'weapons'
      : role === 'barkeep'
        ? 'tavern'
        : 'general',
  };
}

export class NpcEditor {
  constructor(state, container) {
    this.state = state;
    this.container = container;
    this.currentId = null;
    this.entity = null;
  }

  show() {
    this.container.style.display = '';
    this.render();
  }

  hide() {
    this.container.style.display = 'none';
  }

  editEntity(id) {
    const npc = this.state.get('npcs', id);
    if (!npc) return;
    this.currentId = id;
    this.entity = structuredClone(npc);
    this.render();
  }

  createNew() {
    const data = makeDefaultNpc();
    const id = this.state.add('npcs', data);
    this.editEntity(id);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _patch(patch) {
    if (this.currentId == null) return;
    Object.assign(this.entity, patch);
    this.state.update('npcs', this.currentId, patch);
  }

  _patchNested(key, subPatch) {
    if (this.currentId == null) return;
    const merged = { ...this.entity[key], ...subPatch };
    this.entity[key] = merged;
    this.state.update('npcs', this.currentId, { [key]: merged });
  }

  _recomposeName() {
    const { first, last, nickname } = this.entity.name;
    const full = nickname
      ? `${first} "${nickname}" ${last}`.trim()
      : `${first} ${last}`.trim();
    this._patchNested('name', { full });
  }

  _onRoleChange(role) {
    const char = ROLE_CHARS[role] || 'N';
    const color = ROLE_COLORS[role] || '#cccccc';
    const schedule = (ROLE_SCHEDULES[role] || ROLE_SCHEDULES.farmer).map(s => ({ ...s }));
    const stats = defaultStatsForRole(role);
    const category = getNpcCategory(role);
    const shop = SHOP_ROLES.includes(role) ? makeDefaultShop(role) : null;

    this._patch({ role, char, color, schedule, stats, category, shop });
    this.render();
  }

  _onRaceChange(race) {
    this._patchNested('name', {});
    this._patch({ race });
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  render() {
    this.container.innerHTML = '';

    if (!this.entity) {
      this.container.textContent = 'No NPC selected. Click "New" to create one.';
      return;
    }

    const npc = this.entity;

    // ---- Basic Info ----
    this._renderSection('Basic Info', section => {
      // ID (read-only)
      section.appendChild(createTextInput('ID', npc.id ?? '(unsaved)', {
        readonly: true,
      }));

      // Name — first
      section.appendChild(createTextInput('First Name', npc.name.first, {
        onchange: v => { this._patchNested('name', { first: v }); this._recomposeName(); },
      }));

      // Name — last
      section.appendChild(createTextInput('Last Name', npc.name.last, {
        onchange: v => { this._patchNested('name', { last: v }); this._recomposeName(); },
      }));

      // Name — full (auto-composed but editable)
      section.appendChild(createTextInput('Full Name', npc.name.full, {
        onchange: v => this._patchNested('name', { full: v }),
      }));

      // Nickname
      section.appendChild(createTextInput('Nickname', npc.name.nickname || '', {
        onchange: v => { this._patchNested('name', { nickname: v }); this._recomposeName(); },
      }));

      // Race dropdown
      const raceOptions = ['human', 'enhanced', 'cyborg'];
      section.appendChild(createDropdown('Race', raceOptions, npc.race, {
        onchange: v => this._onRaceChange(v),
      }));

      // Name suggestions from NAME_POOLS for current race
      this._renderNameSuggestions(section, npc.race);

      // Role
      section.appendChild(createDropdown('Role', ALL_ROLES, npc.role, {
        onchange: v => this._onRoleChange(v),
      }));

      // Title with Suggest button
      const titleRow = document.createElement('div');
      titleRow.style.display = 'flex';
      titleRow.style.alignItems = 'flex-end';
      titleRow.style.gap = '4px';

      const titleInput = createTextInput('Title', npc.title, {
        onchange: v => this._patch({ title: v }),
      });
      titleRow.appendChild(titleInput);

      const suggestBtn = document.createElement('button');
      suggestBtn.textContent = 'Suggest';
      suggestBtn.type = 'button';
      suggestBtn.addEventListener('click', () => {
        const pool = ROLE_TITLES[npc.role] || ROLE_TITLES.farmer;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        this._patch({ title: pick });
        this.render();
      });
      titleRow.appendChild(suggestBtn);
      section.appendChild(titleRow);

      // Char
      section.appendChild(createCharInput('Char', npc.char, {
        onchange: v => this._patch({ char: v }),
      }));

      // Color
      section.appendChild(createColorPicker('Color', npc.color, {
        onchange: v => this._patch({ color: v }),
      }));
    });

    // ---- Stats ----
    this._renderSection('Stats', section => {
      section.appendChild(createStatBlock(
        { hp: npc.stats.hp, maxHp: npc.stats.maxHp, attack: npc.stats.attack, defense: npc.stats.defense, level: npc.stats.level },
        {
          onchange: (key, value) => this._patchNested('stats', { [key]: value }),
        },
      ));
    });

    // ---- Personality ----
    this._renderSection('Personality', section => {
      section.appendChild(createTagPicker('Traits', PERSONALITY_TRAITS, npc.personality.traits, {
        max: 3,
        onchange: tags => this._patchNested('personality', { traits: tags }),
      }));

      const moodOptions = ['neutral', 'happy', 'angry', 'suspicious'];
      section.appendChild(createDropdown('Mood', moodOptions, npc.personality.mood, {
        onchange: v => this._patchNested('personality', { mood: v }),
      }));

      section.appendChild(createDropdown('Archetype', ARCHETYPES, npc.personality.archetype, {
        onchange: v => this._patchNested('personality', { archetype: v }),
      }));
    });

    // ---- Faction & Category ----
    this._renderSection('Faction & Category', section => {
      const uniqueFactions = [...new Set(NPC_FACTIONS)];
      section.appendChild(createDropdown('Faction', uniqueFactions, npc.faction, {
        onchange: v => this._patch({ faction: v }),
      }));

      const categoryOptions = Object.keys(NPC_CATEGORIES);
      section.appendChild(createDropdown('Category', categoryOptions, npc.category, {
        onchange: v => this._patch({ category: v }),
      }));
    });

    // ---- Schedule ----
    this._renderSection('Schedule', section => {
      const scheduleData = npc.schedule || [];

      section.appendChild(createListEditor(
        scheduleData,
        {
          columns: [
            { key: 'hour', label: 'Hour', type: 'number', min: 0, max: 24, width: '60px' },
            { key: 'location', label: 'Location', type: 'text' },
            { key: 'action', label: 'Action', type: 'text' },
          ],
          onchange: rows => this._patch({ schedule: rows }),
          newRow: () => ({ hour: 0, location: '', action: '' }),
        },
      ));
    });

    // ---- Secrets ----
    this._renderSection('Secrets', section => {
      const secrets = npc.secrets || [];

      const listWrap = document.createElement('div');

      secrets.forEach((secret, i) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '4px';
        row.style.marginBottom = '4px';

        const input = createTextInput('', secret, {
          onchange: v => {
            const updated = [...this.entity.secrets];
            updated[i] = v;
            this._patch({ secrets: updated });
          },
        });
        row.appendChild(input);

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '\u00D7';
        removeBtn.type = 'button';
        removeBtn.addEventListener('click', () => {
          const updated = this.entity.secrets.filter((_, idx) => idx !== i);
          this._patch({ secrets: updated });
          this.render();
        });
        row.appendChild(removeBtn);

        listWrap.appendChild(row);
      });

      section.appendChild(listWrap);

      // Add button
      const addBtn = document.createElement('button');
      addBtn.textContent = 'Add Secret';
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        const updated = [...(this.entity.secrets || []), ''];
        this._patch({ secrets: updated });
        this.render();
      });
      section.appendChild(addBtn);

      // Pick from Templates button
      const templateBtn = document.createElement('button');
      templateBtn.textContent = 'Pick from Templates';
      templateBtn.type = 'button';
      templateBtn.style.marginLeft = '8px';
      templateBtn.addEventListener('click', () => {
        this._showSecretTemplatePicker(section);
      });
      section.appendChild(templateBtn);
    });

    // ---- Shop (conditional) ----
    if (SHOP_ROLES.includes(npc.role)) {
      this._renderSection('Shop', section => {
        const shop = npc.shop || makeDefaultShop(npc.role);
        if (!npc.shop) {
          this._patch({ shop });
        }

        section.appendChild(createNumberInput('Buy Multiplier', shop.buyMultiplier, {
          min: 0.1, max: 1.0, step: 0.05,
          onchange: v => {
            this.entity.shop = { ...this.entity.shop, buyMultiplier: v };
            this.state.update('npcs', this.currentId, { shop: this.entity.shop });
          },
        }));

        section.appendChild(createNumberInput('Sell Multiplier', shop.sellMultiplier, {
          min: 0.5, max: 2.0, step: 0.05,
          onchange: v => {
            this.entity.shop = { ...this.entity.shop, sellMultiplier: v };
            this.state.update('npcs', this.currentId, { shop: this.entity.shop });
          },
        }));

        section.appendChild(createNumberInput('Restock Interval', shop.restockInterval, {
          min: 1, step: 1,
          onchange: v => {
            this.entity.shop = { ...this.entity.shop, restockInterval: v };
            this.state.update('npcs', this.currentId, { shop: this.entity.shop });
          },
        }));

        section.appendChild(createDropdown('Specialization', SHOP_SPECIALIZATIONS, shop.specialization, {
          onchange: v => {
            this.entity.shop = { ...this.entity.shop, specialization: v };
            this.state.update('npcs', this.currentId, { shop: this.entity.shop });
          },
        }));
      });
    }

    // ---- Dialogue & Placement ----
    this._renderSection('Dialogue & Placement', section => {
      // Populate dialogue tree IDs from state
      const trees = this.state.getAll('dialogueTrees') || [];
      const treeIds = trees.map(t => t.id);
      const treeOptions = [null, ...treeIds];
      const treeLabels = ['(none)', ...treeIds.map(id => {
        const tree = trees.find(t => t.id === id);
        return tree && tree.label ? `${id} - ${tree.label}` : id;
      })];

      section.appendChild(createDropdown('Dialogue Tree', treeOptions, npc.dialogueTreeId, {
        labels: treeLabels,
        onchange: v => this._patch({ dialogueTreeId: v || null }),
      }));

      section.appendChild(createTextInput('Placement Hint', npc.placementHint || '', {
        onchange: v => this._patch({ placementHint: v }),
        placeholder: 'e.g. settlement_market, landmark_shrine',
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Section helper
  // ---------------------------------------------------------------------------

  _renderSection(title, buildFn) {
    const fieldset = document.createElement('fieldset');
    fieldset.style.marginBottom = '12px';

    const legend = document.createElement('legend');
    legend.textContent = title;
    fieldset.appendChild(legend);

    buildFn(fieldset);
    this.container.appendChild(fieldset);
  }

  // ---------------------------------------------------------------------------
  // Name suggestions based on race
  // ---------------------------------------------------------------------------

  _renderNameSuggestions(parent, race) {
    const pool = NAME_POOLS[race] || NAME_POOLS.human;
    const allFirst = [...(pool.male || []), ...(pool.female || [])];
    const allLast = pool.last || [];

    const wrap = document.createElement('div');
    wrap.style.fontSize = '0.85em';
    wrap.style.color = '#888';
    wrap.style.marginBottom = '6px';

    const label = document.createElement('span');
    label.textContent = 'Suggestions: ';
    wrap.appendChild(label);

    // Show 3 random first + last combos
    for (let i = 0; i < 3; i++) {
      const first = allFirst[Math.floor(Math.random() * allFirst.length)];
      const last = allLast[Math.floor(Math.random() * allLast.length)];

      const link = document.createElement('a');
      link.href = '#';
      link.textContent = `${first} ${last}`;
      link.style.marginRight = '8px';
      link.addEventListener('click', e => {
        e.preventDefault();
        this._patchNested('name', { first, last });
        this._recomposeName();
        this.render();
      });
      wrap.appendChild(link);
    }

    parent.appendChild(wrap);
  }

  // ---------------------------------------------------------------------------
  // Secret template picker overlay
  // ---------------------------------------------------------------------------

  _showSecretTemplatePicker(parentSection) {
    // Remove any existing picker
    const existing = parentSection.querySelector('.secret-template-picker');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.className = 'secret-template-picker';
    picker.style.border = '1px solid #555';
    picker.style.padding = '8px';
    picker.style.marginTop = '8px';
    picker.style.maxHeight = '200px';
    picker.style.overflowY = 'auto';
    picker.style.background = '#1a1a1a';

    SECRET_TEMPLATES.forEach(template => {
      const row = document.createElement('div');
      row.style.cursor = 'pointer';
      row.style.padding = '2px 4px';
      row.style.marginBottom = '2px';
      row.textContent = template;

      row.addEventListener('mouseenter', () => { row.style.background = '#333'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });

      row.addEventListener('click', () => {
        const updated = [...(this.entity.secrets || []), template];
        this._patch({ secrets: updated });
        picker.remove();
        this.render();
      });

      picker.appendChild(row);
    });

    parentSection.appendChild(picker);
  }
}
