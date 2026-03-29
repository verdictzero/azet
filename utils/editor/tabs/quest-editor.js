// quest-editor.js — Quest Chain editor tab for the ASCIIQUEST structure editor

import { QUEST_TYPES, FACTION_IDS } from '../data-constants.js';
import { createDropdown, createTextInput, createNumberInput, createTextarea, createListEditor } from '../components/form-fields.js';

const TEMPLATE_HINTS = {
  FETCH:       '{NPC}, {N}, {ITEM}',
  KILL:        '{NPC}, {MONSTER}, {LOCATION}',
  ESCORT:      '{NPC}, {LOCATION}',
  INVESTIGATE: '{NPC}, {SUBJECT}, {LOCATION}',
  DELIVER:     '{NPC}, {ITEM}, {LOCATION}',
  BOUNTY:      '{NPC}, {CRIMINAL}',
  CLEAR:       '{LOCATION}',
  SURVEY:      '{NPC}',
};

const LORE_CATEGORIES = ['forbidden', 'history', 'artifacts'];

function makeDefaultChain() {
  return {
    id: null,
    name: 'New Quest Chain',
    faction: null,
    requiredRank: 0,
    minLevel: 1,
    stages: [
      {
        stageIndex: 0,
        questType: 'INVESTIGATE',
        titleTemplate: '',
        descTemplate: '',
        rewardMultiplier: 1.0,
      },
    ],
    finalReward: {
      uniqueItemId: null,
      factionRep: 10,
      loreReward: { category: 'history', hint: '' },
    },
    factionConsequences: {},
  };
}

let _autoId = 1;

function generateId() {
  const id = `chain_custom_${String(_autoId).padStart(3, '0')}`;
  _autoId++;
  return id;
}

export class QuestEditor {
  constructor(state, container) {
    this.state = state;
    this.container = container;
    this.currentEntity = null;
    this.visible = false;
  }

  show() {
    this.visible = true;
    this.container.style.display = '';
    this.render();
  }

  hide() {
    this.visible = false;
    this.container.style.display = 'none';
  }

  editEntity(id) {
    const chains = this.state.questChains || [];
    const chain = chains.find(c => c.id === id);
    if (chain) {
      this.currentEntity = JSON.parse(JSON.stringify(chain));
      if (this.visible) this.render();
    }
  }

  createNew() {
    const chain = makeDefaultChain();
    chain.id = generateId();
    this.currentEntity = chain;
    if (this.visible) this.render();
  }

  // ── Render ───────────────────────────────────────────────────

  render() {
    this.container.innerHTML = '';

    if (!this.currentEntity) {
      const placeholder = document.createElement('p');
      placeholder.className = 'editor-placeholder';
      placeholder.textContent = 'Select a quest chain to edit or create a new one.';
      this.container.appendChild(placeholder);
      return;
    }

    const entity = this.currentEntity;

    // ── Chain Metadata ─────────────────────────────────────────
    const metaSection = this._createSection('Chain Metadata');

    // ID (read-only)
    const idField = createTextInput({
      label: 'ID',
      value: entity.id || '',
      readOnly: true,
    });
    metaSection.appendChild(idField);

    // Name
    const nameField = createTextInput({
      label: 'Name',
      value: entity.name,
      placeholder: 'The Buried Signal',
      onChange: (val) => { entity.name = val; this._emitChange(); },
    });
    metaSection.appendChild(nameField);

    // Faction dropdown: None + all FACTION_IDS
    const factionOptions = [
      { value: '', label: 'None' },
      ...FACTION_IDS.map(fid => ({ value: fid, label: fid })),
    ];
    const factionField = createDropdown({
      label: 'Faction',
      value: entity.faction || '',
      options: factionOptions,
      onChange: (val) => { entity.faction = val || null; this._emitChange(); },
    });
    metaSection.appendChild(factionField);

    // Required Rank
    const rankField = createNumberInput({
      label: 'Required Rank',
      value: entity.requiredRank,
      min: 0,
      max: 5,
      step: 1,
      onChange: (val) => { entity.requiredRank = val; this._emitChange(); },
    });
    metaSection.appendChild(rankField);

    // Min Level
    const levelField = createNumberInput({
      label: 'Min Level',
      value: entity.minLevel,
      min: 1,
      max: 20,
      step: 1,
      onChange: (val) => { entity.minLevel = val; this._emitChange(); },
    });
    metaSection.appendChild(levelField);

    this.container.appendChild(metaSection);

    // ── Stages ─────────────────────────────────────────────────
    const stagesSection = this._createSection('Stages');
    const stagesList = document.createElement('div');
    stagesList.className = 'quest-stages-list';

    entity.stages.forEach((stage, idx) => {
      const card = this._renderStageCard(entity, stage, idx);
      stagesList.appendChild(card);
    });

    stagesSection.appendChild(stagesList);

    // Add Stage button
    const addStageBtn = document.createElement('button');
    addStageBtn.className = 'editor-btn editor-btn-add';
    addStageBtn.textContent = '+ Add Stage';
    addStageBtn.addEventListener('click', () => {
      entity.stages.push({
        stageIndex: entity.stages.length,
        questType: 'INVESTIGATE',
        titleTemplate: '',
        descTemplate: '',
        rewardMultiplier: 1.0,
      });
      this.render();
      this._emitChange();
    });
    stagesSection.appendChild(addStageBtn);

    this.container.appendChild(stagesSection);

    // ── Final Reward ───────────────────────────────────────────
    const rewardSection = this._createSection('Final Reward');
    this._renderFinalReward(rewardSection, entity);
    this.container.appendChild(rewardSection);

    // ── Faction Consequences ───────────────────────────────────
    const consequencesSection = this._createSection('Faction Consequences');
    this._renderFactionConsequences(consequencesSection, entity);
    this.container.appendChild(consequencesSection);
  }

  // ── Stage Card ───────────────────────────────────────────────

  _renderStageCard(entity, stage, idx) {
    const card = document.createElement('div');
    card.className = 'quest-stage-card';

    // Header with stage number and controls
    const header = document.createElement('div');
    header.className = 'quest-stage-header';

    const title = document.createElement('span');
    title.className = 'quest-stage-title';
    title.textContent = `Stage ${idx + 1}`;
    header.appendChild(title);

    const controls = document.createElement('div');
    controls.className = 'quest-stage-controls';

    // Move Up
    if (idx > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'editor-btn editor-btn-sm';
      upBtn.textContent = '\u2191';
      upBtn.title = 'Move Up';
      upBtn.addEventListener('click', () => {
        this._swapStages(entity, idx, idx - 1);
      });
      controls.appendChild(upBtn);
    }

    // Move Down
    if (idx < entity.stages.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'editor-btn editor-btn-sm';
      downBtn.textContent = '\u2193';
      downBtn.title = 'Move Down';
      downBtn.addEventListener('click', () => {
        this._swapStages(entity, idx, idx + 1);
      });
      controls.appendChild(downBtn);
    }

    // Remove
    if (entity.stages.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'editor-btn editor-btn-sm editor-btn-danger';
      removeBtn.textContent = '\u00D7';
      removeBtn.title = 'Remove Stage';
      removeBtn.addEventListener('click', () => {
        entity.stages.splice(idx, 1);
        this._reindexStages(entity);
        this.render();
        this._emitChange();
      });
      controls.appendChild(removeBtn);
    }

    header.appendChild(controls);
    card.appendChild(header);

    // Quest Type dropdown
    const typeOptions = QUEST_TYPES.map(qt => ({ value: qt, label: qt }));
    const typeField = createDropdown({
      label: 'Quest Type',
      value: stage.questType,
      options: typeOptions,
      onChange: (val) => {
        stage.questType = val;
        // Re-render to update placeholder hints
        this.render();
        this._emitChange();
      },
    });
    card.appendChild(typeField);

    // Title Template
    const hint = TEMPLATE_HINTS[stage.questType] || '';
    const titleField = createTextInput({
      label: 'Title Template',
      value: stage.titleTemplate,
      placeholder: hint ? `Available: ${hint}` : '',
      onChange: (val) => { stage.titleTemplate = val; this._emitChange(); },
    });
    card.appendChild(titleField);

    // Description Template
    const descField = createTextarea({
      label: 'Description Template',
      value: stage.descTemplate,
      placeholder: hint ? `Available: ${hint}` : '',
      onChange: (val) => { stage.descTemplate = val; this._emitChange(); },
    });
    card.appendChild(descField);

    // Reward Multiplier
    const multiplierField = createNumberInput({
      label: 'Reward Multiplier',
      value: stage.rewardMultiplier,
      min: 0.5,
      max: 5.0,
      step: 0.1,
      onChange: (val) => { stage.rewardMultiplier = val; this._emitChange(); },
    });
    card.appendChild(multiplierField);

    return card;
  }

  // ── Final Reward ─────────────────────────────────────────────

  _renderFinalReward(section, entity) {
    const reward = entity.finalReward;

    // Unique Item dropdown — filtered to isUnique from state items
    const items = this.state.items || [];
    const uniqueItems = items.filter(item => item.isUnique);
    const itemOptions = [
      { value: '', label: 'None' },
      ...uniqueItems.map(item => ({
        value: item.id,
        label: item.name || item.id,
      })),
    ];
    const itemField = createDropdown({
      label: 'Unique Item',
      value: reward.uniqueItemId || '',
      options: itemOptions,
      onChange: (val) => { reward.uniqueItemId = val || null; this._emitChange(); },
    });
    section.appendChild(itemField);

    // Faction Rep reward
    const repField = createNumberInput({
      label: 'Faction Rep Reward',
      value: reward.factionRep,
      min: 0,
      max: 999,
      step: 1,
      onChange: (val) => { reward.factionRep = val; this._emitChange(); },
    });
    section.appendChild(repField);

    // Lore Reward sub-section
    const loreGroup = document.createElement('div');
    loreGroup.className = 'editor-field-group';

    const loreLabel = document.createElement('h4');
    loreLabel.className = 'editor-sub-heading';
    loreLabel.textContent = 'Lore Reward';
    loreGroup.appendChild(loreLabel);

    const lore = reward.loreReward || { category: 'history', hint: '' };
    reward.loreReward = lore;

    // Category dropdown
    const catOptions = LORE_CATEGORIES.map(c => ({ value: c, label: c }));
    const catField = createDropdown({
      label: 'Category',
      value: lore.category,
      options: catOptions,
      onChange: (val) => { lore.category = val; this._emitChange(); },
    });
    loreGroup.appendChild(catField);

    // Hint textarea
    const hintField = createTextarea({
      label: 'Hint',
      value: lore.hint,
      placeholder: 'A lore hint revealed upon chain completion...',
      onChange: (val) => { lore.hint = val; this._emitChange(); },
    });
    loreGroup.appendChild(hintField);

    section.appendChild(loreGroup);
  }

  // ── Faction Consequences ─────────────────────────────────────

  _renderFactionConsequences(section, entity) {
    const consequences = entity.factionConsequences;

    const list = document.createElement('div');
    list.className = 'faction-consequences-list';

    // Render existing entries
    const keys = Object.keys(consequences);
    keys.forEach(factionKey => {
      const row = this._renderConsequenceRow(entity, factionKey, consequences[factionKey]);
      list.appendChild(row);
    });

    section.appendChild(list);

    // Add new consequence row
    const addRow = document.createElement('div');
    addRow.className = 'faction-consequences-add';

    // Faction key dropdown — exclude already-used factions
    const usedFactions = new Set(keys);
    const availableFactions = FACTION_IDS.filter(f => !usedFactions.has(f));

    if (availableFactions.length > 0) {
      const addBtn = document.createElement('button');
      addBtn.className = 'editor-btn editor-btn-add';
      addBtn.textContent = '+ Add Faction Consequence';
      addBtn.addEventListener('click', () => {
        const factionId = availableFactions[0];
        consequences[factionId] = 0;
        this.render();
        this._emitChange();
      });
      addRow.appendChild(addBtn);
    }

    section.appendChild(addRow);
  }

  _renderConsequenceRow(entity, factionKey, value) {
    const row = document.createElement('div');
    row.className = 'faction-consequence-row';

    // Faction dropdown (allows changing which faction this entry targets)
    const usedFactions = new Set(
      Object.keys(entity.factionConsequences).filter(k => k !== factionKey)
    );
    const factionOptions = FACTION_IDS
      .filter(f => !usedFactions.has(f))
      .map(f => ({ value: f, label: f }));

    const factionField = createDropdown({
      label: 'Faction',
      value: factionKey,
      options: factionOptions,
      onChange: (newKey) => {
        if (newKey !== factionKey) {
          const val = entity.factionConsequences[factionKey];
          delete entity.factionConsequences[factionKey];
          entity.factionConsequences[newKey] = val;
          this.render();
          this._emitChange();
        }
      },
    });
    row.appendChild(factionField);

    // Rep change number input
    const repField = createNumberInput({
      label: 'Rep Change',
      value: value,
      min: -100,
      max: 100,
      step: 1,
      onChange: (val) => {
        entity.factionConsequences[factionKey] = val;
        this._emitChange();
      },
    });
    row.appendChild(repField);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'editor-btn editor-btn-sm editor-btn-danger';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', () => {
      delete entity.factionConsequences[factionKey];
      this.render();
      this._emitChange();
    });
    row.appendChild(removeBtn);

    return row;
  }

  // ── Helpers ──────────────────────────────────────────────────

  _createSection(title) {
    const section = document.createElement('fieldset');
    section.className = 'editor-section';
    const legend = document.createElement('legend');
    legend.textContent = title;
    section.appendChild(legend);
    return section;
  }

  _swapStages(entity, fromIdx, toIdx) {
    const temp = entity.stages[fromIdx];
    entity.stages[fromIdx] = entity.stages[toIdx];
    entity.stages[toIdx] = temp;
    this._reindexStages(entity);
    this.render();
    this._emitChange();
  }

  _reindexStages(entity) {
    entity.stages.forEach((stage, i) => {
      stage.stageIndex = i;
    });
  }

  _emitChange() {
    if (this.state.onEntityChange) {
      this.state.onEntityChange('questChain', this.currentEntity);
    }
  }
}
