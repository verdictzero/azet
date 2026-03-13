import { CELL_SIZE, GRID_SIZE } from './config.js';

// Convert grid coordinates to world (3D) position
export function gridToWorld(gridX, gridZ) {
    const offset = (GRID_SIZE * CELL_SIZE) / 2;
    return {
        x: gridX * CELL_SIZE - offset + CELL_SIZE / 2,
        y: 0,
        z: gridZ * CELL_SIZE - offset + CELL_SIZE / 2
    };
}

// Convert world position back to grid coords
export function worldToGrid(worldX, worldZ) {
    const offset = (GRID_SIZE * CELL_SIZE) / 2;
    return {
        x: Math.floor((worldX + offset) / CELL_SIZE),
        z: Math.floor((worldZ + offset) / CELL_SIZE)
    };
}

// Distance between two 3D points (xz plane)
export function distance2D(a, b) {
    const dx = a.x - b.x;
    const dz = (a.z !== undefined ? a.z : a.y) - (b.z !== undefined ? b.z : b.y);
    return Math.sqrt(dx * dx + dz * dz);
}

// Distance 3D
export function distance3D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Lerp
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Clamp
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// Random float in range
export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

// Random integer in range (inclusive)
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Ease in-out for smooth transitions
export function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Normalize direction vector on xz plane
export function normalizeXZ(dx, dz) {
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len === 0) return { x: 0, z: 0 };
    return { x: dx / len, z: dz / len };
}
