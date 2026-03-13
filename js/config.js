// Grid and map
export const GRID_SIZE = 12;
export const CELL_SIZE = 2;

// Day/Night timing (seconds)
export const DAY_DURATION = 90;
export const DUSK_DURATION = 10;
export const DAWN_DURATION = 5;
// Night duration scales with wave — base + wave * scale
export const NIGHT_BASE_DURATION = 30;
export const NIGHT_SCALE_PER_WAVE = 3;

// Starting resources
export const STARTING_GOLD = 100;
export const STARTING_LIVES = 20;

// Tile types
export const TILE = {
    GRASS: 0,
    PATH: 1,
    BUILDABLE: 2,
    COOP: 3,
    WATER: 4,
    SPAWN: 5
};

// Map layout: 12x12 grid
// 0 = grass (decoration), 1 = path, 2 = buildable, 3 = coop, 4 = water, 5 = spawn point
export const MAP_DATA = [
    [0, 0, 5, 0, 0, 5, 0, 0, 5, 0, 0, 0],
    [0, 2, 1, 2, 2, 1, 2, 2, 1, 2, 0, 0],
    [0, 2, 1, 2, 2, 1, 2, 2, 1, 2, 0, 0],
    [0, 2, 1, 2, 2, 1, 2, 2, 1, 2, 0, 0],
    [0, 2, 1, 1, 2, 1, 2, 1, 1, 2, 0, 0],
    [0, 2, 2, 1, 2, 1, 2, 1, 2, 2, 0, 0],
    [0, 2, 2, 1, 1, 1, 1, 1, 2, 2, 0, 0],
    [0, 2, 2, 2, 2, 1, 2, 2, 2, 2, 0, 0],
    [0, 0, 2, 2, 2, 3, 2, 2, 2, 0, 0, 0],
    [0, 0, 0, 2, 3, 3, 3, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 3, 3, 3, 0, 0, 4, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0],
];

// Paths: arrays of [gridX, gridZ] waypoints from spawn to coop
export const PATHS = [
    // Left path
    [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 4], [3, 5], [3, 6], [4, 6], [5, 6], [5, 7], [5, 8]],
    // Center path
    [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]],
    // Right path
    [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [7, 4], [7, 5], [7, 6], [6, 6], [5, 6], [5, 7], [5, 8]],
];

// Tower definitions
export const TOWERS = {
    scarecrow: {
        name: 'Scarecrow',
        cost: 25,
        range: 3.5,
        damage: 0,
        fireRate: 0,
        slowAmount: 0.4,
        slowDuration: 2,
        color: 0x8B7355,
        description: 'Slows enemies in range',
        sellValue: 12
    },
    rooster: {
        name: 'Rooster Tower',
        cost: 40,
        range: 4,
        damage: 8,
        fireRate: 1.2,
        color: 0xCC3333,
        description: 'Ranged attacker',
        sellValue: 20
    },
    eggcatapult: {
        name: 'Egg Catapult',
        cost: 60,
        range: 5,
        damage: 15,
        fireRate: 2.5,
        splashRadius: 1.5,
        color: 0x8B6914,
        description: 'AoE splash damage',
        sellValue: 30
    },
    lantern: {
        name: 'Lantern Post',
        cost: 30,
        range: 3,
        damage: 2,
        fireRate: 0.8,
        lightRadius: 4,
        accuracyBoost: 0.2,
        color: 0xFFD700,
        description: 'Illuminates area at night',
        sellValue: 15
    }
};

// Enemy definitions
export const ENEMIES = {
    rat: {
        name: 'Rat',
        health: 20,
        speed: 3.5,
        reward: 5,
        color: 0x666666,
        scale: 0.3
    },
    raccoon: {
        name: 'Raccoon',
        health: 40,
        speed: 2,
        reward: 10,
        color: 0x888888,
        scale: 0.45
    },
    fox: {
        name: 'Fox',
        health: 120,
        speed: 3,
        reward: 50,
        color: 0xDD6622,
        scale: 0.6,
        isBoss: true
    },
    hawk: {
        name: 'Hawk',
        health: 25,
        speed: 4,
        reward: 8,
        color: 0x8B4513,
        scale: 0.35,
        flying: true
    },
    coyote: {
        name: 'Coyote',
        health: 80,
        speed: 2.5,
        reward: 15,
        color: 0xAA9966,
        scale: 0.55
    },
    snake: {
        name: 'Snake',
        health: 200,
        speed: 1.5,
        reward: 75,
        color: 0x336633,
        scale: 0.5,
        isBoss: true
    }
};

// Wave definitions — what spawns each night
export const WAVES = [
    { enemies: [{ type: 'rat', count: 5, interval: 1.5 }] },
    { enemies: [{ type: 'rat', count: 8, interval: 1.2 }] },
    { enemies: [{ type: 'rat', count: 5, interval: 1.5 }, { type: 'raccoon', count: 3, interval: 2 }] },
    { enemies: [{ type: 'raccoon', count: 6, interval: 1.5 }] },
    { enemies: [{ type: 'rat', count: 8, interval: 0.8 }, { type: 'fox', count: 1, interval: 0, delay: 8 }] },
    { enemies: [{ type: 'hawk', count: 5, interval: 2 }] },
    { enemies: [{ type: 'hawk', count: 4, interval: 2 }, { type: 'raccoon', count: 5, interval: 1.5 }] },
    { enemies: [{ type: 'coyote', count: 4, interval: 2.5 }] },
    { enemies: [{ type: 'coyote', count: 3, interval: 2 }, { type: 'rat', count: 10, interval: 0.6 }] },
    { enemies: [{ type: 'raccoon', count: 8, interval: 1 }, { type: 'snake', count: 1, interval: 0, delay: 10 }] },
];
