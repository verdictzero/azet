// input.js — Unified pointer/touch/pen input handler for ASCII Paint
// Replaces mouse-only events with Pointer Events API for mouse, touch, and S Pen support.

export class InputManager {
  constructor(canvas, canvasArea, state, tools, renderer, callbacks) {
    this.canvas = canvas;
    this.canvasArea = canvasArea;
    this.state = state;
    this.tools = tools;
    this.renderer = renderer;
    this.callbacks = callbacks; // { markDirty, updateStatus, updateCursor, setStatus }

    // Active pointer tracking
    this._activePointers = new Map(); // pointerId → {type, startX, startY, lastCol, lastRow}

    // S Pen hover / palm rejection
    this._penHovering = false;

    // Gesture state machine
    this._gestureState = 'none'; // 'none' | 'drawing' | 'panning' | 'pinching'

    // Pinch-zoom state
    this._pinchStartDist = 0;
    this._pinchStartZoom = 1;
    this._panStartCenter = { x: 0, y: 0 };
    this._panStartScroll = { left: 0, top: 0 };

    // Middle-click pan state
    this._panStart = { x: 0, y: 0 };
    this._panScrollStart = { left: 0, top: 0 };

    // Drawing started flag (for undo on gesture transition)
    this._drawingStarted = false;

    this._setupPointerEvents();
    this._setupTouchDefaults();
    this._setupWheelZoom();
  }

  isPanning() {
    return this._gestureState === 'panning';
  }

  // ── Pointer Events ──

  _setupPointerEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', e => this._onPointerDown(e));
    canvas.addEventListener('pointermove', e => this._onPointerMove(e));
    canvas.addEventListener('pointerup', e => this._onPointerUp(e));
    canvas.addEventListener('pointercancel', e => this._onPointerUp(e));
    canvas.addEventListener('pointerleave', e => this._onPointerLeave(e));
    canvas.addEventListener('pointerenter', e => this._onPointerEnter(e));

    // Document-level handlers for panning outside canvas
    document.addEventListener('pointermove', e => this._onDocumentPointerMove(e));
    document.addEventListener('pointerup', e => this._onDocumentPointerUp(e));
  }

  _onPointerDown(e) {
    const type = e.pointerType; // 'mouse', 'touch', 'pen'
    this.state.inputType = type;

    // Palm rejection: ignore touch when S Pen is hovering
    if (type === 'touch' && this._penHovering) {
      e.preventDefault();
      return;
    }

    if (type === 'mouse') {
      this._onMousePointerDown(e);
    } else if (type === 'touch') {
      this._onTouchPointerDown(e);
    } else if (type === 'pen') {
      this._onPenPointerDown(e);
    }
  }

  _onMousePointerDown(e) {
    // Middle click = pan
    if (e.button === 1) {
      e.preventDefault();
      this._gestureState = 'panning';
      this._panStart = { x: e.clientX, y: e.clientY };
      this._panScrollStart = { left: this.canvasArea.scrollLeft, top: this.canvasArea.scrollTop };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // Left or right click = draw
    const cell = this._eventToCell(e);
    if (cell.col < 0 || cell.col >= this.state.cols || cell.row < 0 || cell.row >= this.state.rows) return;
    this._gestureState = 'drawing';
    this.tools.onMouseDown(cell.col, cell.row, e.button);
    this.callbacks.markDirty();
  }

  _onTouchPointerDown(e) {
    e.preventDefault();
    this._activePointers.set(e.pointerId, {
      type: 'touch',
      startX: e.clientX,
      startY: e.clientY,
    });

    const touchCount = this._countTouchPointers();

    if (touchCount === 1 && this._gestureState === 'none') {
      // First finger: start drawing
      this._gestureState = 'drawing';
      this._drawingStarted = false;
      this.canvas.setPointerCapture(e.pointerId);
      const cell = this._eventToCell(e);
      if (cell.col >= 0 && cell.col < this.state.cols && cell.row >= 0 && cell.row < this.state.rows) {
        this.tools.onMouseDown(cell.col, cell.row, 0);
        this._drawingStarted = true;
        this.callbacks.markDirty();
      }
    } else if (touchCount === 2 && this._gestureState === 'drawing') {
      // Second finger: transition from drawing to pinch/pan
      if (this._drawingStarted) {
        // Undo the partial stroke and end drawing cleanly
        const cell = this._eventToCell(e);
        const clampedCol = Math.max(0, Math.min(this.state.cols - 1, cell.col));
        const clampedRow = Math.max(0, Math.min(this.state.rows - 1, cell.row));
        this.tools.onMouseUp(clampedCol, clampedRow);
        this.state.undo();
        this.callbacks.markDirty();
        this._drawingStarted = false;
      }
      this._startPinch();
    } else if (touchCount >= 2 && this._gestureState === 'pinching') {
      // Additional finger during pinch — update baseline
      this._startPinch();
    }
  }

  _onPenPointerDown(e) {
    e.preventDefault();
    this._activePointers.set(e.pointerId, {
      type: 'pen',
      startX: e.clientX,
      startY: e.clientY,
    });

    // Compute pressure-based brush size
    this.state.penPressureBrush = this._computePenBrushSize(e.pressure);
    this.state.penTilt = { x: e.tiltX || 0, y: e.tiltY || 0 };

    // Barrel button (bit 5 in buttons bitmask) = erase (right click)
    const button = (e.buttons & 32) ? 2 : 0;

    this._gestureState = 'drawing';
    this.canvas.setPointerCapture(e.pointerId);
    const cell = this._eventToCell(e);
    if (cell.col >= 0 && cell.col < this.state.cols && cell.row >= 0 && cell.row < this.state.rows) {
      this.tools.onMouseDown(cell.col, cell.row, button);
      this.callbacks.markDirty();
    }
  }

  _onPointerMove(e) {
    const type = e.pointerType;
    this.state.inputType = type;

    // Palm rejection
    if (type === 'touch' && this._penHovering) {
      e.preventDefault();
      return;
    }

    // Update hover for all pointer types
    const cell = this._eventToCell(e);
    this.state.hoverCell = (cell.col >= 0 && cell.col < this.state.cols && cell.row >= 0 && cell.row < this.state.rows)
      ? { col: cell.col, row: cell.row } : null;

    if (type === 'touch') {
      // Update stored position
      const ptr = this._activePointers.get(e.pointerId);
      if (ptr) {
        ptr.lastX = e.clientX;
        ptr.lastY = e.clientY;
      }
    }

    if (this._gestureState === 'drawing') {
      // Pen: update pressure continuously
      if (type === 'pen') {
        this.state.penPressureBrush = this._computePenBrushSize(e.pressure);
        this.state.penTilt = { x: e.tiltX || 0, y: e.tiltY || 0 };
      }

      if (this.state.mouseDown || this.state.floatingContent) {
        const clampedCol = Math.max(0, Math.min(this.state.cols - 1, cell.col));
        const clampedRow = Math.max(0, Math.min(this.state.rows - 1, cell.row));
        this.tools.onMouseMove(clampedCol, clampedRow);
      }
      this.callbacks.markDirty();
      this.callbacks.updateStatus();
      this.callbacks.updateCursor();
    } else if (this._gestureState === 'pinching') {
      e.preventDefault();
      this._handlePinchMove();
    } else if (this._gestureState === 'panning') {
      // Middle-click pan (mouse only)
      const dx = e.clientX - this._panStart.x;
      const dy = e.clientY - this._panStart.y;
      this.canvasArea.scrollLeft = this._panScrollStart.left - dx;
      this.canvasArea.scrollTop = this._panScrollStart.top - dy;
    } else {
      // Not drawing — just update hover
      this.callbacks.markDirty();
      this.callbacks.updateStatus();
      this.callbacks.updateCursor();
    }
  }

  _onPointerUp(e) {
    const type = e.pointerType;

    if (type === 'touch') {
      this._activePointers.delete(e.pointerId);
    }

    if (this._gestureState === 'drawing') {
      const cell = this._eventToCell(e);
      const clampedCol = Math.max(0, Math.min(this.state.cols - 1, cell.col));
      const clampedRow = Math.max(0, Math.min(this.state.rows - 1, cell.row));
      this.tools.onMouseUp(clampedCol, clampedRow);
      this.callbacks.markDirty();

      // Clear pen pressure when pen lifts
      if (type === 'pen') {
        this.state.penPressureBrush = null;
        this.state.penTilt = null;
      }
    }

    if (type === 'touch' && this._gestureState === 'pinching') {
      const touchCount = this._countTouchPointers();
      if (touchCount < 2) {
        // Don't resume drawing with remaining finger
        this._gestureState = 'none';
      }
    }

    // Reset gesture when all pointers are released
    if (type === 'mouse' || (type === 'pen') || this._countTouchPointers() === 0) {
      if (this._gestureState === 'panning') {
        this.callbacks.updateCursor();
      }
      this._gestureState = 'none';
      this._drawingStarted = false;
    }
  }

  _onPointerLeave(e) {
    if (e.pointerType === 'pen') {
      this._penHovering = false;
    }
    // Clear hover when pointer leaves canvas (but not during active gestures)
    if (this._gestureState === 'none') {
      this.state.hoverCell = null;
      this.callbacks.markDirty();
    }
  }

  _onPointerEnter(e) {
    if (e.pointerType === 'pen') {
      this._penHovering = true;
    }
  }

  // Document-level handlers for middle-click panning outside canvas
  _onDocumentPointerMove(e) {
    if (this._gestureState === 'panning' && e.pointerType === 'mouse') {
      const dx = e.clientX - this._panStart.x;
      const dy = e.clientY - this._panStart.y;
      this.canvasArea.scrollLeft = this._panScrollStart.left - dx;
      this.canvasArea.scrollTop = this._panScrollStart.top - dy;
    }
  }

  _onDocumentPointerUp(e) {
    if (this._gestureState === 'panning' && e.pointerType === 'mouse' && e.button === 1) {
      this._gestureState = 'none';
      this.callbacks.updateCursor();
    }
  }

  // ── Pinch-Zoom ──

  _startPinch() {
    this._gestureState = 'pinching';
    const points = this._getTouchPoints();
    if (points.length < 2) return;

    this._pinchStartDist = this._distance(points[0], points[1]);
    this._pinchStartZoom = this.state.zoom;
    this._panStartCenter = this._center(points[0], points[1]);
    this._panStartScroll = { left: this.canvasArea.scrollLeft, top: this.canvasArea.scrollTop };
  }

  _handlePinchMove() {
    const points = this._getTouchPoints();
    if (points.length < 2) return;

    const currentDist = this._distance(points[0], points[1]);
    const currentCenter = this._center(points[0], points[1]);

    // Zoom
    const rawZoom = this._pinchStartZoom * (currentDist / this._pinchStartDist);
    const newZoom = Math.round(Math.max(0.5, Math.min(4, rawZoom)) * 4) / 4; // snap to 0.25
    if (newZoom !== this.state.zoom) {
      this.state.zoom = newZoom;
      this.renderer.resize();
      this.callbacks.markDirty();
      this.callbacks.updateStatus();
    }

    // Pan
    const dx = currentCenter.x - this._panStartCenter.x;
    const dy = currentCenter.y - this._panStartCenter.y;
    this.canvasArea.scrollLeft = this._panStartScroll.left - dx;
    this.canvasArea.scrollTop = this._panStartScroll.top - dy;
  }

  // ── Touch Defaults ──

  _setupTouchDefaults() {
    // Prevent browser gestures on canvas only
    this.canvas.style.touchAction = 'none';

    // Prevent double-tap zoom on canvas
    this.canvas.addEventListener('dblclick', e => e.preventDefault());

    // Prevent browser-level pinch zoom (Ctrl+wheel)
    document.addEventListener('wheel', e => {
      if (e.ctrlKey) e.preventDefault();
    }, { passive: false });
  }

  // ── Wheel Zoom ──

  _setupWheelZoom() {
    this.canvasArea.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      this.state.zoom = Math.max(0.5, Math.min(4, this.state.zoom + delta));
      this.renderer.resize();
      this.callbacks.markDirty();
      this.callbacks.updateStatus();
    }, { passive: false });
  }

  // ── Coordinate Conversion ──

  _eventToCell(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return this.renderer.pixelToCell(px, py);
  }

  // ── Pen Pressure ──

  _computePenBrushSize(pressure) {
    if (pressure < 0.15) return 1;
    if (pressure < 0.40) return 3;
    if (pressure < 0.70) return 5;
    return 7;
  }

  // ── Utility ──

  _countTouchPointers() {
    let count = 0;
    for (const [, ptr] of this._activePointers) {
      if (ptr.type === 'touch') count++;
    }
    return count;
  }

  _getTouchPoints() {
    const points = [];
    for (const [id, ptr] of this._activePointers) {
      if (ptr.type === 'touch') {
        points.push({ x: ptr.lastX ?? ptr.startX, y: ptr.lastY ?? ptr.startY });
      }
    }
    return points;
  }

  _distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _center(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
