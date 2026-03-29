// node-canvas.js — Canvas-based node graph renderer for cause/effect chains

export class NodeCanvas {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this._nodes = [];
    this._listeners = {};

    // View state
    this.offset = { x: 0, y: 0 };
    this.zoom = 1.0;

    // Interaction state
    this._selectedNodeId = null;
    this._dragging = null;     // { nodeId, startX, startY }
    this._connecting = null;   // { fromId, mouseX, mouseY }
    this._panning = false;
    this._panStart = { x: 0, y: 0 };
    this._spaceDown = false;

    this._NODE_W = 180;
    this._NODE_H = 70;
    this._PORT_R = 6;

    this._setupEvents();
    this._resizeCanvas();
  }

  // ── Data ──

  setNodes(nodes) {
    this._nodes = nodes || [];
    this.render();
  }

  getNodes() { return this._nodes; }

  getSelectedNodeId() { return this._selectedNodeId; }

  selectNode(id) {
    this._selectedNodeId = id;
    this.render();
    this._emit('nodeSelect', { id });
  }

  // ── Events ──

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  _emit(event, data) {
    if (this._listeners[event]) {
      for (const fn of this._listeners[event]) fn(data);
    }
  }

  // ── View ──

  zoomIn() { this.zoom = Math.min(3, this.zoom * 1.2); this.render(); }
  zoomOut() { this.zoom = Math.max(0.25, this.zoom / 1.2); this.render(); }
  resetView() { this.zoom = 1; this.offset = { x: 0, y: 0 }; this.render(); }

  // ── Rendering ──

  _resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = rect.height * (window.devicePixelRatio || 1);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  }

  render() {
    this._resizeCanvas();
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.offset.x, this.offset.y);
    ctx.scale(this.zoom, this.zoom);

    // Draw grid
    this._drawGrid(ctx, w, h);

    // Draw connections
    for (const node of this._nodes) {
      if (!node.outputs) continue;
      for (const outId of node.outputs) {
        const target = this._nodes.find(n => n.id === outId);
        if (!target) continue;
        this._drawConnection(ctx, node, target);
      }
    }

    // Draw connecting line
    if (this._connecting) {
      const from = this._nodes.find(n => n.id === this._connecting.fromId);
      if (from) {
        const sx = (from.position?.x || 0) + this._NODE_W;
        const sy = (from.position?.y || 0) + this._NODE_H / 2;
        const mx = (this._connecting.mouseX - this.offset.x) / this.zoom;
        const my = (this._connecting.mouseY - this.offset.y) / this.zoom;
        ctx.beginPath();
        ctx.strokeStyle = '#55FF55';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        const cx = Math.abs(mx - sx) * 0.4;
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + cx, sy, mx - cx, my, mx, my);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw nodes
    for (const node of this._nodes) {
      this._drawNode(ctx, node);
    }

    ctx.restore();
  }

  _drawGrid(ctx, w, h) {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    const gridSize = 40;
    const startX = Math.floor(-this.offset.x / this.zoom / gridSize) * gridSize;
    const startY = Math.floor(-this.offset.y / this.zoom / gridSize) * gridSize;
    const endX = startX + w / this.zoom + gridSize * 2;
    const endY = startY + h / this.zoom + gridSize * 2;

    ctx.beginPath();
    for (let x = startX; x < endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  }

  _drawConnection(ctx, from, to) {
    const sx = (from.position?.x || 0) + this._NODE_W;
    const sy = (from.position?.y || 0) + this._NODE_H / 2;
    const ex = (to.position?.x || 0);
    const ey = (to.position?.y || 0) + this._NODE_H / 2;

    const cx = Math.max(40, Math.abs(ex - sx) * 0.4);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + cx, sy, ex - cx, ey, ex, ey);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrow
    const angle = Math.atan2(ey - (ey - 10), ex - (ex - 10));
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 8, ey - 4);
    ctx.lineTo(ex - 8, ey + 4);
    ctx.fillStyle = '#666';
    ctx.fill();
  }

  _drawNode(ctx, node) {
    const x = node.position?.x || 0;
    const y = node.position?.y || 0;
    const w = this._NODE_W;
    const h = this._NODE_H;
    const isTrigger = node.type === 'trigger';
    const isSelected = node.id === this._selectedNodeId;

    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();

    // Border
    ctx.strokeStyle = isSelected ? '#ffffff' : (isTrigger ? '#55FF55' : '#FFAA00');
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.stroke();

    // Glow for selected
    if (isSelected) {
      ctx.shadowColor = '#55FF5566';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Title bar
    ctx.fillStyle = isTrigger ? '#55FF5522' : '#FFAA0022';
    ctx.fillRect(x, y, w, 22);

    // Title text
    ctx.fillStyle = isTrigger ? '#55FF55' : '#FFAA00';
    ctx.font = '11px monospace';
    const typeLabel = node.event || node.action || node.type;
    ctx.fillText(typeLabel, x + 8, y + 15);

    // Type badge
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.fillText(isTrigger ? 'TRIGGER' : 'EFFECT', x + w - 55, y + 15);

    // Param preview
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    if (node.params) {
      const entries = Object.entries(node.params).filter(([, v]) => v !== '' && v !== null);
      const preview = entries.map(([k, v]) => `${k}: ${v}`).join(', ').slice(0, 28);
      ctx.fillText(preview || '(no params)', x + 8, y + 42);
    }

    // ID
    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    ctx.fillText(node.id, x + 8, y + 60);

    // Input port (left)
    ctx.beginPath();
    ctx.arc(x, y + h / 2, this._PORT_R, 0, Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Output port (right)
    ctx.beginPath();
    ctx.arc(x + w, y + h / 2, this._PORT_R, 0, Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.fill();
    ctx.strokeStyle = isTrigger ? '#55FF55' : '#FFAA00';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ── Input handling ──

  _setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { if (e.code === 'Space') this._spaceDown = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this._spaceDown = false; });

    const ro = new ResizeObserver(() => this.render());
    ro.observe(this.canvas.parentElement);
  }

  _screenToWorld(sx, sy) {
    return {
      x: (sx - this.offset.x) / this.zoom,
      y: (sy - this.offset.y) / this.zoom,
    };
  }

  _hitTest(wx, wy) {
    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const n = this._nodes[i];
      const nx = n.position?.x || 0;
      const ny = n.position?.y || 0;
      if (wx >= nx && wx <= nx + this._NODE_W && wy >= ny && wy <= ny + this._NODE_H) {
        return n;
      }
    }
    return null;
  }

  _hitOutputPort(wx, wy) {
    for (const n of this._nodes) {
      const px = (n.position?.x || 0) + this._NODE_W;
      const py = (n.position?.y || 0) + this._NODE_H / 2;
      if (Math.hypot(wx - px, wy - py) < this._PORT_R * 2) return n;
    }
    return null;
  }

  _hitInputPort(wx, wy) {
    for (const n of this._nodes) {
      const px = n.position?.x || 0;
      const py = (n.position?.y || 0) + this._NODE_H / 2;
      if (Math.hypot(wx - px, wy - py) < this._PORT_R * 2) return n;
    }
    return null;
  }

  _onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = this._screenToWorld(sx, sy);

    // Middle mouse or space+left = pan
    if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
      this._panning = true;
      this._panStart = { x: e.clientX - this.offset.x, y: e.clientY - this.offset.y };
      return;
    }

    if (e.button === 0) {
      // Check output port first (start connection)
      const outputNode = this._hitOutputPort(wx, wy);
      if (outputNode) {
        this._connecting = { fromId: outputNode.id, mouseX: sx, mouseY: sy };
        return;
      }

      // Check node body (select/drag)
      const node = this._hitTest(wx, wy);
      if (node) {
        this._selectedNodeId = node.id;
        this._dragging = {
          nodeId: node.id,
          offsetX: wx - (node.position?.x || 0),
          offsetY: wy - (node.position?.y || 0),
        };
        this.render();
        this._emit('nodeSelect', { id: node.id });
        return;
      }

      // Click empty space = deselect
      this._selectedNodeId = null;
      this.render();
      this._emit('nodeSelect', { id: null });
    }

    // Right click = context menu
    if (e.button === 2) {
      this._emit('contextMenu', { x: wx, y: wy, screenX: e.clientX, screenY: e.clientY });
    }
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this._panning) {
      this.offset.x = e.clientX - this._panStart.x;
      this.offset.y = e.clientY - this._panStart.y;
      this.render();
      return;
    }

    if (this._dragging) {
      const { x: wx, y: wy } = this._screenToWorld(sx, sy);
      const node = this._nodes.find(n => n.id === this._dragging.nodeId);
      if (node) {
        node.position = {
          x: Math.round((wx - this._dragging.offsetX) / 10) * 10,
          y: Math.round((wy - this._dragging.offsetY) / 10) * 10,
        };
        this.render();
      }
      return;
    }

    if (this._connecting) {
      this._connecting.mouseX = sx;
      this._connecting.mouseY = sy;
      this.render();
    }
  }

  _onMouseUp(e) {
    if (this._panning) {
      this._panning = false;
      return;
    }

    if (this._dragging) {
      this._emit('nodeMove', { id: this._dragging.nodeId });
      this._dragging = null;
      return;
    }

    if (this._connecting) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x: wx, y: wy } = this._screenToWorld(sx, sy);

      const targetNode = this._hitInputPort(wx, wy);
      if (targetNode && targetNode.id !== this._connecting.fromId) {
        this._emit('connectionAdd', { fromId: this._connecting.fromId, toId: targetNode.id });
      }
      this._connecting = null;
      this.render();
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.25, Math.min(3, this.zoom * delta));

    // Zoom toward cursor
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    this.offset.x = mx - (mx - this.offset.x) * (newZoom / this.zoom);
    this.offset.y = my - (my - this.offset.y) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.render();
  }
}
