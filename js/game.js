import * as THREE from 'three';
import { STARTING_GOLD, STARTING_LIVES, TOWERS, TILE } from './config.js';
import { initRenderer, render, getScene, getGroundGroup } from './renderer.js';
import { initLighting, updateLighting } from './lighting.js';
import { initDayCycle, updateDayCycle, triggerNight, endNight, getPhase, getWaveNumber, getTimeRemaining } from './daycycle.js';
import { initMap, isBuildable, setTileTower, clearTileTower, getTileState, updateCoopGlow } from './map.js';
import { initInput, setInputCallbacks, createHoverIndicator, updateHoverIndicator, showRangeIndicator } from './input.js';
import { initEnemies, updateEnemies, hasReachedEnd, removeEnemy, getAliveEnemies, clearEnemies, setOnKillCallback } from './enemy.js';
import { initTowers, placeTower, updateTowers, removeTower, getTowers } from './tower.js';
import { initProjectiles, updateProjectiles, clearProjectiles } from './projectile.js';
import { initWaves, startWave, updateWaves, isWaveComplete, endWave, isWaveActive } from './wave.js';
import { initUI, updateHUD, showStartScreen, hideStartScreen, showGameOver, hideGameOver, getSelectedTowerType, clearSelection } from './ui.js';
import { gridToWorld } from './utils.js';

// Game state
let gameState = {
    gold: STARTING_GOLD,
    eggs: 0,
    lives: STARTING_LIVES,
    phase: 'day',
    wave: 0,
    gameSpeed: 1,
    running: false,
    gameOver: false
};

let lastTime = 0;
let scene;
let hoverIndicator;
let rangeMeshes = [];
let hoveredTile = null;
let currentSelectedType = null;

// Initialize everything
function init() {
    const container = document.getElementById('game-container');
    const { scene: s } = initRenderer(container);
    scene = s;

    initLighting(scene);
    initMap(scene, getGroundGroup());
    initInput(getGroundGroup());
    initEnemies(scene);
    initTowers(scene);
    initProjectiles(scene);
    initWaves();
    initDayCycle(onPhaseChange);

    hoverIndicator = createHoverIndicator(scene);

    // Set up input callbacks
    setInputCallbacks(onTileClick, onTileHover);

    // Set up UI callbacks
    initUI({
        onTowerSelected: (type) => { currentSelectedType = type; clearRangeMeshes(); },
        onStartNight: () => triggerNight(),
        onSpeedChange: (speed) => { gameState.gameSpeed = speed; },
        onRestart: () => restartGame(),
        onPlay: () => startGame()
    });

    // Set initial lighting
    updateLighting('day', 0);

    showStartScreen();

    // Start render loop
    requestAnimationFrame(gameLoop);
}

function startGame() {
    gameState = {
        gold: STARTING_GOLD,
        eggs: 0,
        lives: STARTING_LIVES,
        phase: 'day',
        wave: 0,
        gameSpeed: 1,
        running: true,
        gameOver: false
    };

    hideStartScreen();
    hideGameOver();
    updateLighting('day', 0);
}

function restartGame() {
    // Clean up
    clearEnemies();
    clearProjectiles();
    getTowers().slice().forEach(t => removeTower(t));
    clearRangeMeshes();

    // Re-init systems
    initDayCycle(onPhaseChange);
    initMap(scene, getGroundGroup());

    startGame();
}

function onPhaseChange(newPhase) {
    gameState.phase = newPhase;

    switch (newPhase) {
        case 'dusk':
            // Dusk warning
            break;

        case 'night':
            // Start the wave
            gameState.wave = getWaveNumber();
            startWave(gameState.wave);
            updateCoopGlow('night');

            // Enable coop light
            scene.traverse(obj => {
                if (obj.userData && obj.userData.isCoopLight) {
                    obj.intensity = 2;
                }
            });
            break;

        case 'dawn':
            // End wave if still active
            if (isWaveActive()) {
                endWave();
            }
            clearEnemies();
            clearProjectiles();

            // Dawn bonus: if survived with no losses this night, bonus gold
            gameState.gold += 10;
            break;

        case 'day':
            updateCoopGlow('day');
            // Turn off coop light
            scene.traverse(obj => {
                if (obj.userData && obj.userData.isCoopLight) {
                    obj.intensity = 0;
                }
            });
            break;
    }
}

function onTileClick(tileData, button) {
    if (!gameState.running || gameState.gameOver) return;

    if (button === 'right') {
        // Right click: deselect tower
        currentSelectedType = null;
        clearSelection();
        clearRangeMeshes();
        return;
    }

    if (!tileData) return;

    const { gridX, gridZ, tileType } = tileData;

    // If we have a tower selected and the tile is buildable, place it
    if (currentSelectedType && tileType === TILE.BUILDABLE) {
        const def = TOWERS[currentSelectedType];
        if (!def) return;

        if (gameState.gold < def.cost) return;
        if (!isBuildable(gridX, gridZ)) return;

        // Place the tower
        const tower = placeTower(currentSelectedType, gridX, gridZ);
        if (tower) {
            gameState.gold -= def.cost;
            setTileTower(gridX, gridZ, tower);
            clearRangeMeshes();
        }
    } else if (tileType === TILE.BUILDABLE) {
        // Clicking a tile with a tower on it — show info / sell
        const tile = getTileState(gridX, gridZ);
        if (tile && tile.tower) {
            // Sell the tower
            gameState.gold += tile.tower.sellValue;
            removeTower(tile.tower);
            clearTileTower(gridX, gridZ);
        }
    }
}

function onTileHover(tileData) {
    hoveredTile = tileData;

    if (!tileData || !currentSelectedType) {
        updateHoverIndicator(null, false);
        clearRangeMeshes();
        return;
    }

    const pos = gridToWorld(tileData.gridX, tileData.gridZ);
    const canBuild = isBuildable(tileData.gridX, tileData.gridZ) && gameState.gold >= (TOWERS[currentSelectedType]?.cost || 0);

    updateHoverIndicator(pos, canBuild);

    // Show range preview
    clearRangeMeshes();
    if (canBuild && currentSelectedType) {
        const def = TOWERS[currentSelectedType];
        if (def && def.range) {
            const rm = showRangeIndicator(scene, pos, def.range);
            rangeMeshes.push(rm);
        }
    }
}

function clearRangeMeshes() {
    rangeMeshes.forEach(m => {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
    });
    rangeMeshes = [];
}

function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    const dt = Math.min((timestamp - lastTime) / 1000, 0.1) * gameState.gameSpeed;
    lastTime = timestamp;

    if (!gameState.running || gameState.gameOver) {
        render();
        return;
    }

    // Update day/night cycle
    updateDayCycle(dt);

    // Update based on phase
    const phase = getPhase();

    if (phase === 'night') {
        // Update combat systems
        updateWaves(dt);
        updateEnemies(dt);
        updateTowers(dt, phase);
        updateProjectiles(dt);

        // Check for enemies reaching the coop
        const alive = getAliveEnemies();
        for (const enemy of alive) {
            if (hasReachedEnd(enemy)) {
                gameState.lives -= enemy.isBoss ? 5 : 1;
                gameState.gold += Math.floor(enemy.reward * 0.3); // Partial reward even if they reach coop
                removeEnemy(enemy);
            }
        }

        // Check wave complete
        if (isWaveComplete()) {
            endNight();
        }

        // Check game over
        if (gameState.lives <= 0) {
            gameState.lives = 0;
            gameState.gameOver = true;
            showGameOver(gameState.wave);
        }
    } else if (phase === 'day') {
        // Daytime — towers still visible but don't fire
        // Passive gold income
        gameState.gold += 0.5 * dt;
    }

    // Update towers (for lantern light management in all phases)
    if (phase !== 'night') {
        updateTowers(dt, phase);
    }

    // Update HUD
    updateHUD({
        gold: gameState.gold,
        eggs: gameState.eggs,
        lives: gameState.lives,
        wave: gameState.wave,
        phase: getPhase(),
        timeRemaining: getTimeRemaining()
    });

    // Render
    render();
}

// Set up kill reward callback
function onEnemyKilled(enemy) {
    gameState.gold += enemy.reward;
}

// Start
init();
setOnKillCallback(onEnemyKilled);
