// ============================================================================
// utils.js — Utility module for a retro ASCII roguelike game
// ============================================================================

// ----------------------------------------------------------------------------
// SeededRNG — Deterministic random number generator (mulberry32)
// ----------------------------------------------------------------------------

export class SeededRNG {
  constructor(seed) {
    this._state = seed | 0;
  }

  next() {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  random(array) {
    return array[Math.floor(this.next() * array.length)];
  }

  shuffle(array) {
    const result = array.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
    return result;
  }

  weighted(options) {
    let total = 0;
    for (let i = 0; i < options.length; i++) {
      total += options[i].weight;
    }
    let roll = this.next() * total;
    for (let i = 0; i < options.length; i++) {
      roll -= options[i].weight;
      if (roll <= 0) {
        return options[i].value;
      }
    }
    return options[options.length - 1].value;
  }

  chance(probability) {
    return this.next() < probability;
  }

  gaussian(mean = 0, stddev = 1) {
    // Box-Muller transform
    let u, v, s;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    return mean + stddev * u * mul;
  }
}

// ----------------------------------------------------------------------------
// PerlinNoise — Classic 2D Perlin noise with fBm support
// ----------------------------------------------------------------------------

export class PerlinNoise {
  constructor(rng) {
    // Build permutation table from the seeded RNG
    const perm = new Array(256);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }
    // Fisher-Yates shuffle using the provided RNG
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    // Double the table so we can avoid index wrapping
    this._perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this._perm[i] = perm[i & 255];
    }
  }

  // 2D gradient vectors (12 directions from the classic Perlin set)
  static _grad2 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];

  _dot2(hash, x, y) {
    const g = PerlinNoise._grad2[hash & 11];
    return g[0] * x + g[1] * y;
  }

  static _fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  noise2D(x, y) {
    const p = this._perm;

    // Grid cell coordinates
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;

    // Relative position within cell
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    // Fade curves
    const u = PerlinNoise._fade(xf);
    const v = PerlinNoise._fade(yf);

    // Hash coordinates of the 4 corners
    const aa = p[p[xi] + yi];
    const ab = p[p[xi] + yi + 1];
    const ba = p[p[xi + 1] + yi];
    const bb = p[p[xi + 1] + yi + 1];

    // Gradient dot products at each corner, then bilinear interpolation
    const x1 = lerp(this._dot2(aa, xf, yf), this._dot2(ba, xf - 1, yf), u);
    const x2 = lerp(this._dot2(ab, xf, yf - 1), this._dot2(bb, xf - 1, yf - 1), u);

    return lerp(x1, x2, v);
  }

  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      sum += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return sum / maxAmplitude;
  }
}

// ----------------------------------------------------------------------------
// CellularNoise — Worley/Voronoi noise for smooth contiguous regions
// ----------------------------------------------------------------------------

export class CellularNoise {
  constructor(rng, density = 1.0) {
    // Pre-generate feature points for a grid of cells
    // Each grid cell gets one random feature point
    this._points = new Map();
    this._rng = rng;
    this._density = density;
    // Cache seeds for deterministic per-cell point generation
    this._seedX = Math.floor(rng.next() * 2147483647);
    this._seedY = Math.floor(rng.next() * 2147483647);
    this._seedId = Math.floor(rng.next() * 2147483647);
  }

  // Deterministic hash for grid cell -> feature point
  _hash(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return ((h >>> 0) / 4294967296);
  }

  // Returns { f1, f2, cellId, cellX, cellY } where:
  //   f1 = distance to nearest feature point (0..~1)
  //   f2 = distance to second nearest
  //   cellId = unique ID for the nearest cell region
  //   cellX/cellY = grid coords of nearest cell
  noise2D(x, y) {
    const sx = x * this._density;
    const sy = y * this._density;
    const ix = Math.floor(sx);
    const iy = Math.floor(sy);

    let minDist1 = 999, minDist2 = 999;
    let nearestCellX = 0, nearestCellY = 0;

    // Check 3x3 neighborhood
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        // Deterministic feature point within this cell
        const px = cx + this._hash(cx, cy, this._seedX);
        const py = cy + this._hash(cx, cy, this._seedY);
        const ddx = sx - px;
        const ddy = sy - py;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < minDist1) {
          minDist2 = minDist1;
          minDist1 = dist;
          nearestCellX = cx;
          nearestCellY = cy;
        } else if (dist < minDist2) {
          minDist2 = dist;
        }
      }
    }

    // cellId: deterministic unique identifier per Voronoi cell
    const cellId = this._hash(nearestCellX, nearestCellY, this._seedId);

    return {
      f1: minDist1,
      f2: minDist2,
      edge: minDist2 - minDist1, // 0 at edges, larger inside cells
      cellId,
      cellX: nearestCellX,
      cellY: nearestCellY,
    };
  }

  // Multi-scale cellular noise - returns smoother, blended regions
  // scale controls the size of cells, octaves adds detail
  fbm(x, y, scale = 1.0, octaves = 2) {
    let result = this.noise2D(x * scale, y * scale);
    if (octaves <= 1) return result;
    // For multi-octave, blend in finer detail but keep primary cell assignment
    let detailEdge = 0;
    let amp = 0.5;
    for (let i = 1; i < octaves; i++) {
      const s = scale * Math.pow(2, i);
      const detail = this.noise2D(x * s, y * s);
      detailEdge += detail.edge * amp;
      amp *= 0.5;
    }
    result.edge = result.edge * 0.7 + detailEdge * 0.3;
    return result;
  }
}

// ----------------------------------------------------------------------------
// BinaryHeap — Min-heap used internally by A* pathfinding
// ----------------------------------------------------------------------------

class BinaryHeap {
  constructor(scoreFunc) {
    this._data = [];
    this._scoreFunc = scoreFunc;
  }

  get size() {
    return this._data.length;
  }

  push(element) {
    this._data.push(element);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const data = this._data;
    const top = data[0];
    const last = data.pop();
    if (data.length > 0) {
      data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(idx) {
    const data = this._data;
    const score = this._scoreFunc;
    const element = data[idx];
    const elementScore = score(element);

    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = data[parentIdx];
      if (elementScore >= score(parent)) break;
      data[idx] = parent;
      idx = parentIdx;
    }
    data[idx] = element;
  }

  _sinkDown(idx) {
    const data = this._data;
    const score = this._scoreFunc;
    const length = data.length;
    const element = data[idx];
    const elementScore = score(element);

    for (;;) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      let swapIdx = -1;
      let swapScore = elementScore;

      if (left < length) {
        const leftScore = score(data[left]);
        if (leftScore < swapScore) {
          swapIdx = left;
          swapScore = leftScore;
        }
      }
      if (right < length) {
        const rightScore = score(data[right]);
        if (rightScore < swapScore) {
          swapIdx = right;
        }
      }
      if (swapIdx === -1) break;
      data[idx] = data[swapIdx];
      data[swapIdx] = element;
      idx = swapIdx;
    }
  }
}

// ----------------------------------------------------------------------------
// AStar — A* pathfinding with 8-directional movement and binary heap
// ----------------------------------------------------------------------------

export class AStar {
  static findPath(startX, startY, endX, endY, isWalkable, maxSteps = 1000) {
    const SQRT2 = Math.SQRT2;

    // 8 movement directions: cardinals then diagonals
    const dirs = [
      { dx: 0, dy: -1, cost: 1 },
      { dx: 1, dy: 0, cost: 1 },
      { dx: 0, dy: 1, cost: 1 },
      { dx: -1, dy: 0, cost: 1 },
      { dx: 1, dy: -1, cost: SQRT2 },
      { dx: 1, dy: 1, cost: SQRT2 },
      { dx: -1, dy: 1, cost: SQRT2 },
      { dx: -1, dy: -1, cost: SQRT2 },
    ];

    const key = (x, y) => `${x},${y}`;

    const startKey = key(startX, startY);
    const endKey = key(endX, endY);

    // g-scores and bookkeeping
    const gScore = new Map();
    gScore.set(startKey, 0);

    const cameFrom = new Map();
    const closed = new Set();

    // Heuristic: octile distance (consistent for 8-dir with sqrt(2) diagonals)
    const heuristic = (x, y) => {
      const dx = Math.abs(x - endX);
      const dy = Math.abs(y - endY);
      return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
    };

    const openHeap = new BinaryHeap((node) => node.f);
    openHeap.push({
      x: startX,
      y: startY,
      f: heuristic(startX, startY),
    });

    let steps = 0;

    while (openHeap.size > 0 && steps < maxSteps) {
      steps++;
      const current = openHeap.pop();
      const curKey = key(current.x, current.y);

      if (curKey === endKey) {
        // Reconstruct path
        const path = [];
        let k = endKey;
        while (k !== undefined) {
          const parts = k.split(",");
          path.push({ x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) });
          k = cameFrom.get(k);
        }
        path.reverse();
        return path;
      }

      if (closed.has(curKey)) continue;
      closed.add(curKey);

      const currentG = gScore.get(curKey);

      for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nKey = key(nx, ny);

        if (closed.has(nKey)) continue;
        if (!isWalkable(nx, ny)) continue;

        const tentativeG = currentG + dir.cost;
        const prevG = gScore.get(nKey);

        if (prevG === undefined || tentativeG < prevG) {
          gScore.set(nKey, tentativeG);
          cameFrom.set(nKey, curKey);
          openHeap.push({
            x: nx,
            y: ny,
            f: tentativeG + heuristic(nx, ny),
          });
        }
      }
    }

    return null;
  }
}

// ----------------------------------------------------------------------------
// Helper functions
// ----------------------------------------------------------------------------

export function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function manhattanDist(x1, y1, x2, y2) {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

export function bresenhamLine(x1, y1, x2, y2) {
  const points = [];
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1;
  let y = y1;

  for (;;) {
    points.push({ x, y });
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return points;
}

export function floodFill(startX, startY, isValid, maxSize = 1000) {
  const result = [];
  const visited = new Set();
  const key = (x, y) => `${x},${y}`;
  const stack = [{ x: startX, y: startY }];

  while (stack.length > 0 && result.length < maxSize) {
    const { x, y } = stack.pop();
    const k = key(x, y);
    if (visited.has(k)) continue;
    if (!isValid(x, y)) continue;
    visited.add(k);
    result.push({ x, y });

    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }

  return result;
}

export function rectIntersects(r1, r2) {
  return (
    r1.x < r2.x + r2.w &&
    r1.x + r1.w > r2.x &&
    r1.y < r2.y + r2.h &&
    r1.y + r1.h > r2.y
  );
}
