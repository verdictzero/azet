// app.js — Main application controller for the Terminal Gradient Structure Editor

import { State } from './state.js';
import { JsonPreview } from './components/json-preview.js';
import { NpcEditor } from './tabs/npc-editor.js';
import { ItemEditor } from './tabs/item-editor.js';
import { CreatureEditor } from './tabs/creature-editor.js';
import { QuestEditor } from './tabs/quest-editor.js';
import { DialogueEditor } from './tabs/dialogue-editor.js';
import { ChainEditor } from './tabs/chain-editor.js';
import { Randomizer } from './tabs/randomizer.js';

const TAB_CONFIG = {
  npcs:       { EditorClass: NpcEditor,      collection: 'npcs',              label: 'NPCs' },
  items:      { EditorClass: ItemEditor,     collection: 'items',             label: 'Items' },
  creatures:  { EditorClass: CreatureEditor,  collection: 'creatures',         label: 'Creatures' },
  quests:     { EditorClass: QuestEditor,     collection: 'questChains',       label: 'Quest Chains' },
  dialogue:   { EditorClass: DialogueEditor,  collection: 'dialogueTrees',     label: 'Dialogue Trees' },
  chains:     { EditorClass: ChainEditor,     collection: 'causeEffectChains', label: 'Cause & Effect' },
  randomizer: { EditorClass: Randomizer,      collection: null,                label: 'Randomizer' },
};

class App {
  constructor() {
    this.state = new State();
    this.editors = {};
    this.editorContainers = {};

    // DOM refs
    this.editorContent = document.getElementById('editorContent');
    this.entityListItems = document.getElementById('entityListItems');
    this.previewContent = document.getElementById('previewContent');
    this.statusEl = document.getElementById('status');
    this.entityCountEl = document.getElementById('entityCount');
    this.saveStatusEl = document.getElementById('saveStatus');

    // JSON Preview
    this.jsonPreview = new JsonPreview(this.previewContent);

    this._initTabs();
    this._initToolbar();
    this._initEntityList();
    this._initKeyboard();
    this._initUnloadGuard();

    // Listen to state
    this.state.on('change', () => this._onStateChange());
    this.state.on('load', () => this._onLoad());
    this.state.on('selectionChange', ({ id }) => this._onSelectionChange(id));
    this.state.on('tabChange', () => {
      this._activateTab(this.state.activeTab);
    });

    // Start on NPCs tab
    this._activateTab('npcs');
  }

  // ── Tabs ──

  _initTabs() {
    for (const [tabId, config] of Object.entries(TAB_CONFIG)) {
      // Create container
      const container = document.createElement('div');
      container.className = 'tab-content';
      container.style.display = 'none';
      this.editorContent.appendChild(container);
      this.editorContainers[tabId] = container;

      // Create editor
      this.editors[tabId] = new config.EditorClass(this.state, container);
    }

    // Tab bar clicks
    document.querySelectorAll('.tab-bar .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.setTab(btn.dataset.tab);
      });
    });
  }

  _activateTab(tabId) {
    // Hide all
    for (const [id, container] of Object.entries(this.editorContainers)) {
      container.style.display = 'none';
      if (this.editors[id]?.hide) this.editors[id].hide();
    }

    // Show active
    if (this.editorContainers[tabId]) {
      this.editorContainers[tabId].style.display = '';
      if (this.editors[tabId]?.show) this.editors[tabId].show();
    }

    // Update tab buttons
    document.querySelectorAll('.tab-bar .tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Refresh entity list and preview
    this._renderEntityList();
    this._updatePreview();
    this._updateStatus();

    // Hide sidebar for randomizer tab
    const sidebar = document.getElementById('entityList');
    if (sidebar) {
      sidebar.style.display = tabId === 'randomizer' ? 'none' : '';
    }
  }

  // ── Toolbar ──

  _initToolbar() {
    // New
    document.getElementById('btnNew')?.addEventListener('click', () => {
      if (this.state.dirty && !confirm('Discard unsaved changes?')) return;
      this.state.clear();
      this.statusEl.textContent = 'New project created';
    });

    // Load
    const fileInput = document.getElementById('fileInput');
    document.getElementById('btnLoad')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => this._handleLoad(e));

    // Save All
    document.getElementById('btnSave')?.addEventListener('click', () => this._handleSaveAll());

    // Save Section dropdown
    const saveSectionBtn = document.getElementById('btnSaveSection');
    const saveSectionMenu = document.getElementById('saveSectionMenu');
    if (saveSectionBtn && saveSectionMenu) {
      saveSectionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveSectionMenu.classList.toggle('show');
      });
      document.addEventListener('click', () => saveSectionMenu.classList.remove('show'));

      saveSectionMenu.querySelectorAll('button[data-section]').forEach(btn => {
        btn.addEventListener('click', () => {
          this._handleSaveSection(btn.dataset.section);
          saveSectionMenu.classList.remove('show');
        });
      });
    }

    // Undo / Redo
    document.getElementById('btnUndo')?.addEventListener('click', () => {
      this.state.undo();
      this.statusEl.textContent = 'Undone';
    });
    document.getElementById('btnRedo')?.addEventListener('click', () => {
      this.state.redo();
      this.statusEl.textContent = 'Redone';
    });

    // Copy JSON
    document.getElementById('btnCopyJson')?.addEventListener('click', () => {
      this.jsonPreview.copyToClipboard();
      this.statusEl.textContent = 'Copied JSON!';
    });
  }

  _handleSaveAll() {
    const data = this.state.toJSON();
    const json = JSON.stringify(data, null, 2);
    this._downloadFile(json, 'game-content.json');
    this.state.dirty = false;
    this.statusEl.textContent = 'Saved game-content.json';
    this._updateStatus();
  }

  _handleSaveSection(section) {
    const data = this.state.toSectionJSON(section);
    const json = JSON.stringify(data, null, 2);
    this._downloadFile(json, `${section}.json`);
    this.statusEl.textContent = `Saved ${section}.json`;
  }

  _downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  _handleLoad(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);

        // Detect full file vs section file
        if (data.version && data.meta) {
          // Full file
          this.state.fromJSON(data);
          this.statusEl.textContent = `Loaded ${file.name}`;
        } else if (Array.isArray(data)) {
          // Section file — detect which section by current tab
          const collection = this.state.getCollectionForTab(this.state.activeTab);
          if (collection) {
            this.state.importSection(collection, data);
            this.statusEl.textContent = `Imported ${data.length} items into ${collection}`;
          }
        } else {
          // Try section keys
          for (const key of Object.keys(data)) {
            if (this.state[key] instanceof Map) {
              this.state.importSection(key, Array.isArray(data[key]) ? data[key] : []);
            }
          }
          this.statusEl.textContent = `Loaded ${file.name}`;
        }
      } catch (err) {
        alert(`Failed to load file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Entity List ──

  _initEntityList() {
    document.getElementById('entitySearch')?.addEventListener('input', () => this._renderEntityList());
    document.getElementById('btnAddEntity')?.addEventListener('click', () => this._addNewEntity());
  }

  _addNewEntity() {
    const tabId = this.state.activeTab;
    const editor = this.editors[tabId];
    if (!editor?.createNew) return;

    const collection = TAB_CONFIG[tabId]?.collection;
    if (!collection) return;

    const data = editor.createNew();
    const id = this.state.add(collection, data);
    this.state.select(id);

    if (editor.editEntity) editor.editEntity(id);
    if (editor.render) editor.render();
    this._renderEntityList();
  }

  _renderEntityList() {
    const container = this.entityListItems;
    if (!container) return;
    container.innerHTML = '';

    const tabId = this.state.activeTab;
    const collection = TAB_CONFIG[tabId]?.collection;
    if (!collection) return;

    const entities = this.state.getAll(collection);
    const search = (document.getElementById('entitySearch')?.value || '').toLowerCase();

    for (const entity of entities) {
      const name = entity.name?.full || entity.name || entity.id || '(unnamed)';
      if (search && !name.toLowerCase().includes(search) && !entity.id.toLowerCase().includes(search)) continue;

      const item = document.createElement('div');
      item.className = 'entity-list-item';
      if (entity.id === this.state.selectedId) item.classList.add('selected');

      const charSpan = document.createElement('span');
      charSpan.className = 'entity-char';
      charSpan.textContent = entity.char || '?';
      if (entity.color) charSpan.style.color = entity.color;
      item.appendChild(charSpan);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'entity-name';
      nameSpan.textContent = name;
      item.appendChild(nameSpan);

      const typeSpan = document.createElement('span');
      typeSpan.className = 'entity-type';
      typeSpan.textContent = entity.type || entity.role || entity.questType || '';
      item.appendChild(typeSpan);

      item.addEventListener('click', () => {
        this.state.select(entity.id);
        const editor = this.editors[tabId];
        if (editor?.editEntity) editor.editEntity(entity.id);
        if (editor?.render) editor.render();
        this._renderEntityList();
      });

      // Right-click to delete
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (confirm(`Delete "${name}"?`)) {
          this.state.remove(collection, entity.id);
          this._renderEntityList();
          const editor = this.editors[tabId];
          if (editor?.render) editor.render();
        }
      });

      container.appendChild(item);
    }
  }

  // ── Keyboard Shortcuts ──

  _initKeyboard() {
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') { e.preventDefault(); this._handleSaveAll(); }
      else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); this.state.redo(); }
      else if (ctrl && e.key === 'z') { e.preventDefault(); this.state.undo(); }
      else if (ctrl && e.key === 'n') {
        e.preventDefault();
        if (this.state.dirty && !confirm('Discard unsaved changes?')) return;
        this.state.clear();
      }
    });
  }

  // ── Unload Guard ──

  _initUnloadGuard() {
    window.addEventListener('beforeunload', (e) => {
      if (this.state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ── Reactive Updates ──

  _onStateChange() {
    this._updatePreview();
    this._updateStatus();
    this._renderEntityList();
  }

  _onLoad() {
    this._activateTab(this.state.activeTab);
    this._renderEntityList();
    this._updatePreview();
    this._updateStatus();
  }

  _onSelectionChange(id) {
    const tabId = this.state.activeTab;
    const editor = this.editors[tabId];
    if (id && editor?.editEntity) {
      editor.editEntity(id);
      if (editor.render) editor.render();
    }
    this._renderEntityList();
    this._updatePreview();
  }

  _updatePreview() {
    const tabId = this.state.activeTab;
    const collection = TAB_CONFIG[tabId]?.collection;

    if (this.state.selectedId && collection) {
      const entity = this.state.get(collection, this.state.selectedId);
      this.jsonPreview.update(entity || {});
    } else if (collection) {
      this.jsonPreview.update(this.state.getAll(collection));
    } else {
      this.jsonPreview.update(this.state.toJSON());
    }
  }

  _updateStatus() {
    const tabId = this.state.activeTab;
    const collection = TAB_CONFIG[tabId]?.collection;
    const count = collection ? this.state.getAll(collection).length : 0;

    if (this.entityCountEl) {
      const label = TAB_CONFIG[tabId]?.label || '';
      this.entityCountEl.textContent = collection ? `${count} ${label}` : '';
    }
    if (this.saveStatusEl) {
      this.saveStatusEl.textContent = this.state.dirty ? 'Unsaved changes' : 'All saved';
    }
  }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => new App());
