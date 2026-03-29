// chain-editor.js — Cause & Effect node graph editor

import { NodeCanvas } from '../components/node-canvas.js';
import { createDropdown, createTextInput, createNumberInput } from '../components/form-fields.js';
import { FACTION_IDS } from '../data-constants.js';

const TRIGGER_TYPES = {
  quest_complete:    { label: 'Quest Complete', params: ['questChainId', 'stage'] },
  quest_stage:       { label: 'Quest Stage Reached', params: ['questChainId', 'stage'] },
  npc_killed:        { label: 'NPC Killed', params: ['npcId'] },
  npc_talked:        { label: 'NPC Talked To', params: ['npcId', 'dialogueNodeId'] },
  item_acquired:     { label: 'Item Acquired', params: ['itemId'] },
  faction_rep_above: { label: 'Faction Rep Above', params: ['faction', 'threshold'] },
  faction_rep_below: { label: 'Faction Rep Below', params: ['faction', 'threshold'] },
  flag_set:          { label: 'Flag Set', params: ['flag', 'value'] },
  area_entered:      { label: 'Area Entered', params: ['areaId'] },
  time_passed:       { label: 'Time Passed', params: ['hours'] },
};

const EFFECT_TYPES = {
  unlock_area:         { label: 'Unlock Area', params: ['areaId'] },
  lock_area:           { label: 'Lock Area', params: ['areaId'] },
  spawn_npc:           { label: 'Spawn NPC', params: ['npcId', 'location'] },
  remove_npc:          { label: 'Remove NPC', params: ['npcId'] },
  spawn_creature:      { label: 'Spawn Creature', params: ['creatureId', 'location'] },
  change_faction_rep:  { label: 'Change Faction Rep', params: ['faction', 'amount'] },
  give_item:           { label: 'Give Item', params: ['itemId'] },
  start_quest:         { label: 'Start Quest', params: ['questChainId'] },
  set_flag:            { label: 'Set Flag', params: ['flag', 'value'] },
  show_message:        { label: 'Show Message', params: ['text'] },
  change_npc_dialogue: { label: 'Change NPC Dialogue', params: ['npcId', 'dialogueTreeId'] },
};

export class ChainEditor {
  constructor(state, container) {
    this.state = state;
    this.container = container;
    this._nodeCanvas = null;
    this._contextMenu = null;
  }

  show() { this.container.style.display = ''; if (this._nodeCanvas) this._nodeCanvas.render(); }
  hide() { this.container.style.display = 'none'; this._hideContextMenu(); }

  createNew() {
    return {
      id: null,
      name: 'New Chain',
      nodes: [],
    };
  }

  editEntity(id) { this.render(); }

  render() {
    const chain = this.state.selectedId ? this.state.get('causeEffectChains', this.state.selectedId) : null;
    this.container.innerHTML = '';

    if (!chain) {
      this.container.innerHTML = '<div class="empty-state">Select or create a cause & effect chain</div>';
      return;
    }

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'chain-toolbar';

    toolbar.appendChild(createTextInput('Chain Name', chain.name, (val) => {
      this.state.update('causeEffectChains', chain.id, { name: val });
    }));

    const addTriggerBtn = document.createElement('button');
    addTriggerBtn.textContent = '+ Trigger';
    addTriggerBtn.addEventListener('click', () => this._addNode(chain, 'trigger'));
    toolbar.appendChild(addTriggerBtn);

    const addEffectBtn = document.createElement('button');
    addEffectBtn.textContent = '+ Effect';
    addEffectBtn.addEventListener('click', () => this._addNode(chain, 'effect'));
    toolbar.appendChild(addEffectBtn);

    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    zoomInBtn.title = 'Zoom In';
    zoomInBtn.addEventListener('click', () => this._nodeCanvas?.zoomIn());
    toolbar.appendChild(zoomInBtn);

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '−';
    zoomOutBtn.title = 'Zoom Out';
    zoomOutBtn.addEventListener('click', () => this._nodeCanvas?.zoomOut());
    toolbar.appendChild(zoomOutBtn);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => this._nodeCanvas?.resetView());
    toolbar.appendChild(resetBtn);

    this.container.appendChild(toolbar);

    // Layout
    const layout = document.createElement('div');
    layout.className = 'chain-editor-layout';

    // Canvas panel
    const canvasPanel = document.createElement('div');
    canvasPanel.className = 'chain-canvas-panel';
    const canvas = document.createElement('canvas');
    canvasPanel.appendChild(canvas);
    layout.appendChild(canvasPanel);

    // Props panel
    const propsPanel = document.createElement('div');
    propsPanel.className = 'chain-props-panel';
    propsPanel.id = 'chainPropsPanel';
    layout.appendChild(propsPanel);

    this.container.appendChild(layout);

    // Init canvas
    this._nodeCanvas = new NodeCanvas(canvas);
    this._nodeCanvas.setNodes(chain.nodes);

    this._nodeCanvas.on('nodeSelect', ({ id }) => {
      this._renderProps(propsPanel, chain, id);
    });

    this._nodeCanvas.on('nodeMove', ({ id }) => {
      this.state.update('causeEffectChains', chain.id, { nodes: [...chain.nodes] });
    });

    this._nodeCanvas.on('connectionAdd', ({ fromId, toId }) => {
      const fromNode = chain.nodes.find(n => n.id === fromId);
      if (fromNode) {
        if (!fromNode.outputs) fromNode.outputs = [];
        if (!fromNode.outputs.includes(toId)) {
          fromNode.outputs.push(toId);
          this.state.update('causeEffectChains', chain.id, { nodes: [...chain.nodes] });
          this._nodeCanvas.render();
        }
      }
    });

    this._nodeCanvas.on('contextMenu', ({ x, y, screenX, screenY }) => {
      this._showContextMenu(screenX, screenY, chain, x, y);
    });

    this._renderProps(propsPanel, chain, null);
  }

  _addNode(chain, type, position) {
    const existingIds = chain.nodes.map(n => n.id);
    let idx = chain.nodes.length;
    let prefix = type === 'trigger' ? 'trigger' : 'effect';
    let newId = `${prefix}_${idx}`;
    while (existingIds.includes(newId)) { idx++; newId = `${prefix}_${idx}`; }

    const node = {
      id: newId,
      type,
      event: type === 'trigger' ? 'quest_complete' : undefined,
      action: type === 'effect' ? 'set_flag' : undefined,
      params: {},
      position: position || { x: 50 + Math.random() * 300, y: 50 + Math.random() * 200 },
      outputs: [],
    };
    chain.nodes.push(node);
    this.state.update('causeEffectChains', chain.id, { nodes: [...chain.nodes] });
    if (this._nodeCanvas) {
      this._nodeCanvas.setNodes(chain.nodes);
      this._nodeCanvas.selectNode(newId);
    }
  }

  _renderProps(panel, chain, nodeId) {
    panel.innerHTML = '';
    const node = chain.nodes.find(n => n.id === nodeId);

    if (!node) {
      panel.innerHTML = '<div class="empty-state" style="height:200px">Select a node or right-click to add</div>';
      return;
    }

    const section = document.createElement('div');
    section.className = 'section';

    // Node ID
    section.appendChild(createTextInput('Node ID', node.id, () => {}, { readOnly: true }));

    // Type label
    const typeLabel = document.createElement('div');
    typeLabel.className = 'section-title';
    typeLabel.textContent = node.type === 'trigger' ? '▸ TRIGGER' : '▸ EFFECT';
    typeLabel.style.color = node.type === 'trigger' ? '#55FF55' : '#FFAA00';
    section.appendChild(typeLabel);

    // Event/Action type dropdown
    const types = node.type === 'trigger' ? TRIGGER_TYPES : EFFECT_TYPES;
    const typeOptions = Object.entries(types).map(([k, v]) => ({ value: k, label: v.label }));
    const currentType = node.event || node.action || '';

    section.appendChild(createDropdown('Type', typeOptions, currentType, (val) => {
      if (node.type === 'trigger') node.event = val;
      else node.action = val;
      node.params = {};
      this.state.update('causeEffectChains', chain.id, { nodes: [...chain.nodes] });
      this._nodeCanvas.setNodes(chain.nodes);
      this._renderProps(panel, chain, nodeId);
    }));

    // Dynamic params
    const typeDef = types[currentType];
    if (typeDef) {
      const paramsTitle = document.createElement('div');
      paramsTitle.className = 'section-title';
      paramsTitle.textContent = '▸ Parameters';
      section.appendChild(paramsTitle);

      for (const param of typeDef.params) {
        const currentVal = node.params?.[param] || '';

        // Choose input type based on param name
        if (param === 'faction') {
          section.appendChild(createDropdown(param, ['', ...FACTION_IDS], currentVal, (val) => {
            if (!node.params) node.params = {};
            node.params[param] = val;
            this._saveChain(chain);
          }));
        } else if (param.endsWith('Id') && param !== 'areaId') {
          // Dropdown from state collections
          const collection = param === 'npcId' ? 'npcs' :
                           param === 'itemId' ? 'items' :
                           param === 'creatureId' ? 'creatures' :
                           param === 'questChainId' ? 'questChains' :
                           param === 'dialogueTreeId' ? 'dialogueTrees' : null;

          if (collection) {
            const items = this.state.getAll(collection);
            const options = [{ value: '', label: '(none)' }, ...items.map(i => ({
              value: i.id,
              label: i.name?.full || i.name || i.id,
            }))];
            section.appendChild(createDropdown(param, options, currentVal, (val) => {
              if (!node.params) node.params = {};
              node.params[param] = val;
              this._saveChain(chain);
            }));
          } else {
            section.appendChild(createTextInput(param, currentVal, (val) => {
              if (!node.params) node.params = {};
              node.params[param] = val;
              this._saveChain(chain);
            }));
          }
        } else if (['threshold', 'amount', 'hours', 'stage'].includes(param)) {
          section.appendChild(createNumberInput(param, parseFloat(currentVal) || 0, (val) => {
            if (!node.params) node.params = {};
            node.params[param] = val;
            this._saveChain(chain);
          }));
        } else {
          section.appendChild(createTextInput(param, currentVal, (val) => {
            if (!node.params) node.params = {};
            node.params[param] = val;
            this._saveChain(chain);
          }));
        }
      }
    }

    panel.appendChild(section);

    // Connections
    const connSection = document.createElement('div');
    connSection.className = 'section';
    const connTitle = document.createElement('div');
    connTitle.className = 'section-title';
    connTitle.textContent = '▸ Connections';
    connSection.appendChild(connTitle);

    if (node.outputs && node.outputs.length > 0) {
      for (let i = 0; i < node.outputs.length; i++) {
        const row = document.createElement('div');
        row.className = 'kv-row';
        row.appendChild(document.createTextNode('→ ' + node.outputs[i]));
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-small btn-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
          node.outputs.splice(i, 1);
          this._saveChain(chain);
          this._nodeCanvas.setNodes(chain.nodes);
          this._renderProps(panel, chain, nodeId);
        });
        row.appendChild(removeBtn);
        connSection.appendChild(row);
      }
    } else {
      connSection.appendChild(document.createTextNode('No connections. Drag from output port to connect.'));
    }
    panel.appendChild(connSection);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-small btn-remove';
    delBtn.textContent = 'Delete Node';
    delBtn.style.marginTop = '12px';
    delBtn.addEventListener('click', () => {
      if (!confirm(`Delete node ${node.id}?`)) return;
      chain.nodes = chain.nodes.filter(n => n.id !== nodeId);
      // Remove references
      for (const n of chain.nodes) {
        if (n.outputs) n.outputs = n.outputs.filter(o => o !== nodeId);
      }
      this._saveChain(chain);
      this._nodeCanvas.setNodes(chain.nodes);
      this._nodeCanvas.selectNode(null);
      this._renderProps(panel, chain, null);
    });
    panel.appendChild(delBtn);
  }

  _saveChain(chain) {
    this.state.update('causeEffectChains', chain.id, { nodes: [...chain.nodes], name: chain.name });
    if (this._nodeCanvas) this._nodeCanvas.render();
  }

  _showContextMenu(x, y, chain, worldX, worldY) {
    this._hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'save-dropdown-menu show';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:1000;`;

    const addTrigger = document.createElement('button');
    addTrigger.textContent = 'Add Trigger';
    addTrigger.addEventListener('click', () => {
      this._addNode(chain, 'trigger', { x: worldX, y: worldY });
      this._hideContextMenu();
    });
    menu.appendChild(addTrigger);

    const addEffect = document.createElement('button');
    addEffect.textContent = 'Add Effect';
    addEffect.addEventListener('click', () => {
      this._addNode(chain, 'effect', { x: worldX, y: worldY });
      this._hideContextMenu();
    });
    menu.appendChild(addEffect);

    document.body.appendChild(menu);
    this._contextMenu = menu;

    setTimeout(() => {
      document.addEventListener('click', () => this._hideContextMenu(), { once: true });
    }, 0);
  }

  _hideContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }
}
