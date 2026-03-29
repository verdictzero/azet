// state.js — Central state store for the Structure Editor

const COLLECTIONS = ['npcs', 'items', 'creatures', 'questChains', 'dialogueTrees', 'causeEffectChains'];

const COLLECTION_PREFIXES = {
  npcs: 'npc',
  items: 'item',
  creatures: 'creature',
  questChains: 'chain',
  dialogueTrees: 'dialogue',
  causeEffectChains: 'effect_chain',
};

export class State {
  constructor() {
    this._listeners = {};
    this._idCounters = {};
    this.dirty = false;
    this.activeTab = 'npcs';
    this.selectedId = null;

    // Initialize collections
    for (const c of COLLECTIONS) {
      this[c] = new Map();
      this._idCounters[c] = 0;
    }

    // Undo/redo
    this._undoStack = [];
    this._redoStack = [];
    this._maxUndo = 50;
  }

  // ── Event emitter ──

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  emit(event, data) {
    if (this._listeners[event]) {
      for (const fn of this._listeners[event]) fn(data);
    }
    // Always emit 'change' for any mutation
    if (event !== 'change' && ['add', 'update', 'remove', 'load'].includes(event)) {
      if (this._listeners.change) {
        for (const fn of this._listeners.change) fn(data);
      }
    }
  }

  // ── CRUD ──

  _nextId(collection) {
    const prefix = COLLECTION_PREFIXES[collection] || 'entity';
    this._idCounters[collection] = (this._idCounters[collection] || 0) + 1;
    return `${prefix}_custom_${String(this._idCounters[collection]).padStart(3, '0')}`;
  }

  add(collection, data) {
    if (!this[collection]) return null;
    this.pushUndo();
    if (!data.id) data.id = this._nextId(collection);
    this[collection].set(data.id, { ...data });
    this.dirty = true;
    this.emit('add', { collection, id: data.id, data });
    return data.id;
  }

  update(collection, id, patch) {
    if (!this[collection] || !this[collection].has(id)) return;
    this.pushUndo();
    const current = this[collection].get(id);
    const updated = deepMerge(current, patch);
    updated.id = id; // preserve id
    this[collection].set(id, updated);
    this.dirty = true;
    this.emit('update', { collection, id, data: updated });
  }

  remove(collection, id) {
    if (!this[collection] || !this[collection].has(id)) return;
    this.pushUndo();
    this[collection].delete(id);
    this.dirty = true;
    if (this.selectedId === id) {
      this.selectedId = null;
      this.emit('selectionChange', { id: null });
    }
    this.emit('remove', { collection, id });
  }

  get(collection, id) {
    if (!this[collection]) return null;
    const item = this[collection].get(id);
    return item ? { ...item } : null;
  }

  getAll(collection) {
    if (!this[collection]) return [];
    return Array.from(this[collection].values());
  }

  // ── Tab & Selection ──

  setTab(tab) {
    this.activeTab = tab;
    this.selectedId = null;
    this.emit('tabChange', { tab });
    this.emit('selectionChange', { id: null });
  }

  select(id) {
    this.selectedId = id;
    this.emit('selectionChange', { id });
  }

  // ── Collection for current tab ──

  getCollectionForTab(tab) {
    const map = {
      npcs: 'npcs', items: 'items', creatures: 'creatures',
      quests: 'questChains', dialogue: 'dialogueTrees',
      chains: 'causeEffectChains', randomizer: null,
    };
    return map[tab || this.activeTab] || null;
  }

  // ── Undo / Redo ──

  pushUndo() {
    const snapshot = this._snapshot();
    this._undoStack.push(snapshot);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack = [];
  }

  undo() {
    if (this._undoStack.length === 0) return;
    this._redoStack.push(this._snapshot());
    const snapshot = this._undoStack.pop();
    this._restore(snapshot);
    this.dirty = true;
    this.emit('load', {});
  }

  redo() {
    if (this._redoStack.length === 0) return;
    this._undoStack.push(this._snapshot());
    const snapshot = this._redoStack.pop();
    this._restore(snapshot);
    this.dirty = true;
    this.emit('load', {});
  }

  _snapshot() {
    const snap = {};
    for (const c of COLLECTIONS) {
      snap[c] = new Map(this[c]);
    }
    snap._idCounters = { ...this._idCounters };
    return snap;
  }

  _restore(snap) {
    for (const c of COLLECTIONS) {
      this[c] = new Map(snap[c]);
    }
    this._idCounters = { ...snap._idCounters };
  }

  // ── Serialization ──

  toJSON() {
    const result = {
      version: '1.0',
      meta: { author: '', lastModified: new Date().toISOString() },
    };
    for (const c of COLLECTIONS) {
      result[c] = Array.from(this[c].values());
    }
    return result;
  }

  toSectionJSON(collection) {
    return Array.from(this[collection].values());
  }

  fromJSON(data) {
    if (!data) return;
    this.pushUndo();

    for (const c of COLLECTIONS) {
      this[c].clear();
      const items = data[c] || [];
      for (const item of items) {
        if (item.id) {
          this[c].set(item.id, item);
          // Update id counter to avoid collisions
          const match = item.id.match(/_(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= (this._idCounters[c] || 0)) {
              this._idCounters[c] = num + 1;
            }
          }
        }
      }
    }

    this.dirty = false;
    this.selectedId = null;
    this.emit('load', {});
    this.emit('selectionChange', { id: null });
  }

  importSection(collection, items) {
    if (!this[collection]) return;
    this.pushUndo();
    for (const item of items) {
      if (item.id) {
        this[collection].set(item.id, item);
        const match = item.id.match(/_(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= (this._idCounters[collection] || 0)) {
            this._idCounters[collection] = num + 1;
          }
        }
      }
    }
    this.dirty = true;
    this.emit('load', {});
  }

  clear() {
    this.pushUndo();
    for (const c of COLLECTIONS) {
      this[c].clear();
      this._idCounters[c] = 0;
    }
    this.dirty = false;
    this.selectedId = null;
    this.emit('load', {});
    this.emit('selectionChange', { id: null });
  }
}

// Deep merge utility — merges patch into target (one level deep for objects)
function deepMerge(target, patch) {
  const result = { ...target };
  for (const [key, val] of Object.entries(patch)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val) &&
        result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = { ...result[key], ...val };
    } else {
      result[key] = val;
    }
  }
  return result;
}
