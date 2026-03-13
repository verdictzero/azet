import { WAVES } from './config.js';
import { spawnEnemy, getAliveEnemies } from './enemy.js';

let currentWave = -1;
let spawnQueue = [];
let spawnTimer = 0;
let waveActive = false;
let allSpawned = false;

export function initWaves() {
    currentWave = -1;
    spawnQueue = [];
    spawnTimer = 0;
    waveActive = false;
    allSpawned = false;
}

export function startWave(waveNumber) {
    currentWave = waveNumber - 1; // Convert to 0-indexed
    if (currentWave >= WAVES.length) {
        // Beyond defined waves — generate procedural wave
        generateProceduralWave(currentWave);
    } else {
        const waveDef = WAVES[currentWave];
        buildSpawnQueue(waveDef);
    }
    waveActive = true;
    allSpawned = false;
    spawnTimer = 0;
}

function buildSpawnQueue(waveDef) {
    spawnQueue = [];
    let time = 0;

    for (const group of waveDef.enemies) {
        const startTime = (group.delay || 0);
        for (let i = 0; i < group.count; i++) {
            spawnQueue.push({
                type: group.type,
                time: startTime + i * group.interval,
                spawned: false
            });
        }
    }

    // Sort by spawn time
    spawnQueue.sort((a, b) => a.time - b.time);
}

function generateProceduralWave(waveIndex) {
    // Scale difficulty with wave number
    const difficulty = waveIndex - WAVES.length + 1;
    const types = ['rat', 'raccoon', 'coyote', 'hawk'];
    const waveDef = { enemies: [] };

    // Pick 2-3 enemy types
    const numTypes = Math.min(2 + Math.floor(difficulty / 3), types.length);
    for (let i = 0; i < numTypes; i++) {
        const type = types[Math.min(i + Math.floor(difficulty / 5), types.length - 1)];
        waveDef.enemies.push({
            type: type,
            count: 5 + difficulty * 2,
            interval: Math.max(0.3, 1.5 - difficulty * 0.05),
            delay: i * 5
        });
    }

    // Boss every 5 waves
    if ((waveIndex + 1) % 5 === 0) {
        waveDef.enemies.push({
            type: 'fox',
            count: 1 + Math.floor(difficulty / 5),
            interval: 3,
            delay: 10
        });
    }

    buildSpawnQueue(waveDef);
}

export function updateWaves(dt) {
    if (!waveActive) return;

    spawnTimer += dt;

    // Spawn enemies whose time has come
    let allDone = true;
    for (const entry of spawnQueue) {
        if (!entry.spawned) {
            if (spawnTimer >= entry.time) {
                spawnEnemy(entry.type);
                entry.spawned = true;
            } else {
                allDone = false;
            }
        }
    }

    if (allDone && !allSpawned) {
        allSpawned = true;
    }
}

export function isWaveComplete() {
    if (!waveActive) return false;
    return allSpawned && getAliveEnemies().length === 0;
}

export function endWave() {
    waveActive = false;
    spawnQueue = [];
}

export function isWaveActive() { return waveActive; }
export function getCurrentWave() { return currentWave; }
