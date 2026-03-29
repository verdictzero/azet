// dialogue-editor.js — Branching dialogue tree editor

import { createDropdown, createTextInput, createTextarea, createConditionBuilder, createConsequenceBuilder } from '../components/form-fields.js';

export class DialogueEditor {
  constructor(state, container) {
    this.state = state;
    this.container = container;
    this._selectedNodeId = null;
    this._dragNode = null;
    this._dragOffset = { x: 0, y: 0 };
  }

  show() { this.container.style.display = ''; }
  hide() { this.container.style.display = 'none'; }

  createNew() {
    return {
      id: null,
      npcId: null,
      entryNodeId: 'node_0',
      nodes: [
        {
          id: 'node_0',
          type: 'npc_line',
          text: 'Greeting text here...',
          position: { x: 200, y: 50 },
          condition: null,
          consequence: null,
          options: [
            { text: 'Goodbye.', nextNodeId: null, condition: null }
          ],
        },
      ],
    };
  }

  editEntity(id) {
    this._selectedNodeId = null;
    this.render();
  }

  render() {
    const tree = this.state.selectedId ? this.state.get('dialogueTrees', this.state.selectedId) : null;
    this.container.innerHTML = '';

    if (!tree) {
      this.container.innerHTML = '<div class="empty-state">Select or create a dialogue tree</div>';
      return;
    }

    // Top toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'chain-toolbar';

    // NPC link
    const npcOptions = [{ value: '', label: '(No NPC)' }, ...this.state.getAll('npcs').map(n => ({ value: n.id, label: n.name?.full || n.id }))];
    const npcDD = createDropdown('Link NPC', npcOptions, tree.npcId || '', (val) => {
      this.state.update('dialogueTrees', tree.id, { npcId: val || null });
    });
    npcDD.style.display = 'inline-flex';
    npcDD.style.gap = '6px';
    npcDD.style.alignItems = 'center';
    toolbar.appendChild(npcDD);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Node';
    addBtn.addEventListener('click', () => this._addNode(tree));
    toolbar.appendChild(addBtn);

    const layoutBtn = document.createElement('button');
    layoutBtn.textContent = 'Auto Layout';
    layoutBtn.addEventListener('click', () => this._autoLayout(tree));
    toolbar.appendChild(layoutBtn);

    this.container.appendChild(toolbar);

    // Split layout
    const layout = document.createElement('div');
    layout.className = 'dialogue-editor-layout';

    // Tree panel
    const treePanel = document.createElement('div');
    treePanel.className = 'dialogue-tree-panel';
    const treeContainer = document.createElement('div');
    treeContainer.className = 'dialogue-tree-container';

    // SVG for connections
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'dialogue-tree-canvas');
    svg.style.width = '2000px';
    svg.style.height = '2000px';
    treeContainer.appendChild(svg);

    // Render nodes
    for (const node of tree.nodes) {
      const nodeEl = this._renderTreeNode(node, tree);
      treeContainer.appendChild(nodeEl);
    }

    // Draw connections
    this._drawConnections(svg, tree);

    treePanel.appendChild(treeContainer);
    layout.appendChild(treePanel);

    // Node editor panel
    const nodePanel = document.createElement('div');
    nodePanel.className = 'dialogue-node-panel';
    this._renderNodeEditor(nodePanel, tree);
    layout.appendChild(nodePanel);

    this.container.appendChild(layout);
  }

  _renderTreeNode(node, tree) {
    const el = document.createElement('div');
    el.className = 'dialogue-node';
    if (node.id === this._selectedNodeId) el.classList.add('selected');
    if (node.id === tree.entryNodeId) el.classList.add('entry');
    if (node.type === 'action') el.classList.add('action');

    el.style.left = (node.position?.x || 0) + 'px';
    el.style.top = (node.position?.y || 0) + 'px';
    el.dataset.nodeId = node.id;

    const typeIcon = node.type === 'npc_line' ? '💬' : node.type === 'action' ? '⚙' : '👤';
    el.innerHTML = `
      <div class="dialogue-node-type">${typeIcon} ${node.type} — ${node.id}</div>
      <div class="dialogue-node-text">${(node.text || '').slice(0, 50) || '(empty)'}${(node.text || '').length > 50 ? '...' : ''}</div>
      <div class="dialogue-node-options">${(node.options || []).length} option(s)</div>
    `;

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._selectedNodeId = node.id;
      this._dragNode = node;
      this._dragOffset = { x: e.clientX - (node.position?.x || 0), y: e.clientY - (node.position?.y || 0) };

      const onMove = (me) => {
        node.position = {
          x: Math.max(0, me.clientX - this._dragOffset.x),
          y: Math.max(0, me.clientY - this._dragOffset.y),
        };
        el.style.left = node.position.x + 'px';
        el.style.top = node.position.y + 'px';
        // Update SVG connections
        const svg = this.container.querySelector('.dialogue-tree-canvas');
        if (svg) this._drawConnections(svg, tree);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this._dragNode = null;
        // Save positions
        this.state.update('dialogueTrees', tree.id, { nodes: [...tree.nodes] });
        this.render();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    return el;
  }

  _drawConnections(svg, tree) {
    svg.innerHTML = '';
    const nodeMap = new Map(tree.nodes.map(n => [n.id, n]));

    for (const node of tree.nodes) {
      if (!node.options) continue;
      for (const opt of node.options) {
        if (!opt.nextNodeId) continue;
        const target = nodeMap.get(opt.nextNodeId);
        if (!target) continue;

        const x1 = (node.position?.x || 0) + 100;
        const y1 = (node.position?.y || 0) + 40;
        const x2 = (target.position?.x || 0);
        const y2 = (target.position?.y || 0) + 20;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cx = Math.abs(x2 - x1) * 0.4;
        path.setAttribute('d', `M${x1},${y1} C${x1 + cx},${y1} ${x2 - cx},${y2} ${x2},${y2}`);
        path.setAttribute('stroke', '#55FF5588');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
      }
    }
  }

  _renderNodeEditor(panel, tree) {
    panel.innerHTML = '';
    const node = tree.nodes.find(n => n.id === this._selectedNodeId);

    if (!node) {
      panel.innerHTML = '<div class="empty-state" style="height:200px">Click a node to edit</div>';
      return;
    }

    const section = document.createElement('div');
    section.className = 'section';

    // Node ID
    section.appendChild(createTextInput('Node ID', node.id, () => {}, { readOnly: true }));

    // Type
    section.appendChild(createDropdown('Type', ['npc_line', 'player_choice', 'action'], node.type, (val) => {
      node.type = val;
      this._saveNodes(tree);
    }));

    // Text
    section.appendChild(createTextarea('Text', node.text, (val) => {
      node.text = val;
      this._saveNodes(tree);
    }, { rows: 4, placeholder: 'NPC dialogue or action description...' }));

    // Entry node toggle
    if (node.id !== tree.entryNodeId) {
      const entryBtn = document.createElement('button');
      entryBtn.textContent = 'Set as Entry Node';
      entryBtn.className = 'btn-small';
      entryBtn.addEventListener('click', () => {
        this.state.update('dialogueTrees', tree.id, { entryNodeId: node.id });
        this.render();
      });
      section.appendChild(entryBtn);
    }

    panel.appendChild(section);

    // Condition
    const condSection = document.createElement('div');
    condSection.className = 'section';
    const condTitle = document.createElement('div');
    condTitle.className = 'section-title';
    condTitle.textContent = '▸ Conditions (when to show this node)';
    condSection.appendChild(condTitle);
    condSection.appendChild(createConditionBuilder(node.condition, (val) => {
      node.condition = val;
      this._saveNodes(tree);
    }));
    panel.appendChild(condSection);

    // Consequence
    const consSection = document.createElement('div');
    consSection.className = 'section';
    const consTitle = document.createElement('div');
    consTitle.className = 'section-title';
    consTitle.textContent = '▸ Consequence (when this node is visited)';
    consSection.appendChild(consTitle);
    consSection.appendChild(createConsequenceBuilder(node.consequence, (val) => {
      node.consequence = val;
      this._saveNodes(tree);
    }));
    panel.appendChild(consSection);

    // Options
    const optSection = document.createElement('div');
    optSection.className = 'section';
    const optTitle = document.createElement('div');
    optTitle.className = 'section-title';
    optTitle.textContent = '▸ Dialogue Options (branches)';
    optSection.appendChild(optTitle);

    const nodeIds = [{ value: '', label: '(End dialogue)' }, ...tree.nodes.map(n => ({ value: n.id, label: n.id + ': ' + (n.text || '').slice(0, 30) }))];

    for (let i = 0; i < (node.options || []).length; i++) {
      const opt = node.options[i];
      const optDiv = document.createElement('div');
      optDiv.className = 'list-item';
      optDiv.style.flexDirection = 'column';
      optDiv.style.gap = '4px';

      optDiv.appendChild(createTextInput(`Option ${i + 1} text`, opt.text, (val) => {
        opt.text = val;
        this._saveNodes(tree);
      }, { placeholder: 'Player response...' }));

      optDiv.appendChild(createDropdown('Goes to', nodeIds, opt.nextNodeId || '', (val) => {
        if (val === '__new__') {
          const newNode = this._createNode(tree);
          opt.nextNodeId = newNode.id;
        } else {
          opt.nextNodeId = val || null;
        }
        this._saveNodes(tree);
        this.render();
      }));

      const removeOptBtn = document.createElement('button');
      removeOptBtn.textContent = 'Remove option';
      removeOptBtn.className = 'btn-small btn-remove';
      removeOptBtn.addEventListener('click', () => {
        node.options.splice(i, 1);
        this._saveNodes(tree);
        this.render();
      });
      optDiv.appendChild(removeOptBtn);

      optSection.appendChild(optDiv);
    }

    const addOptBtn = document.createElement('button');
    addOptBtn.textContent = '+ Add Option';
    addOptBtn.className = 'btn-small';
    addOptBtn.addEventListener('click', () => {
      if (!node.options) node.options = [];
      node.options.push({ text: '', nextNodeId: null, condition: null });
      this._saveNodes(tree);
      this.render();
    });
    optSection.appendChild(addOptBtn);

    panel.appendChild(optSection);

    // Delete node
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete Node';
    delBtn.className = 'btn-small btn-remove';
    delBtn.style.marginTop = '12px';
    delBtn.addEventListener('click', () => {
      if (!confirm(`Delete node ${node.id}?`)) return;
      tree.nodes = tree.nodes.filter(n => n.id !== node.id);
      // Remove references
      for (const n of tree.nodes) {
        if (n.options) {
          for (const o of n.options) {
            if (o.nextNodeId === node.id) o.nextNodeId = null;
          }
        }
      }
      this._selectedNodeId = null;
      this._saveNodes(tree);
      this.render();
    });
    panel.appendChild(delBtn);
  }

  _createNode(tree) {
    const existingIds = tree.nodes.map(n => n.id);
    let idx = tree.nodes.length;
    let newId = `node_${idx}`;
    while (existingIds.includes(newId)) { idx++; newId = `node_${idx}`; }

    const newNode = {
      id: newId,
      type: 'npc_line',
      text: '',
      position: { x: 50 + Math.random() * 400, y: 50 + Math.random() * 300 },
      condition: null,
      consequence: null,
      options: [{ text: 'Continue...', nextNodeId: null, condition: null }],
    };
    tree.nodes.push(newNode);
    return newNode;
  }

  _addNode(tree) {
    this._createNode(tree);
    this._saveNodes(tree);
    this.render();
  }

  _saveNodes(tree) {
    this.state.update('dialogueTrees', tree.id, {
      nodes: tree.nodes,
      npcId: tree.npcId,
      entryNodeId: tree.entryNodeId,
    });
  }

  _autoLayout(tree) {
    if (!tree.nodes.length) return;
    const nodeMap = new Map(tree.nodes.map(n => [n.id, n]));
    const visited = new Set();
    const levels = new Map();

    function bfs(startId) {
      const queue = [{ id: startId, level: 0 }];
      while (queue.length) {
        const { id, level } = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        if (!levels.has(level)) levels.set(level, []);
        levels.get(level).push(id);
        const node = nodeMap.get(id);
        if (node?.options) {
          for (const opt of node.options) {
            if (opt.nextNodeId && !visited.has(opt.nextNodeId)) {
              queue.push({ id: opt.nextNodeId, level: level + 1 });
            }
          }
        }
      }
    }

    bfs(tree.entryNodeId);
    // Add any unvisited nodes
    for (const node of tree.nodes) {
      if (!visited.has(node.id)) {
        bfs(node.id);
      }
    }

    for (const [level, ids] of levels) {
      for (let i = 0; i < ids.length; i++) {
        const node = nodeMap.get(ids[i]);
        if (node) {
          node.position = { x: 50 + level * 280, y: 50 + i * 120 };
        }
      }
    }

    this._saveNodes(tree);
    this.render();
  }
}
