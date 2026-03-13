import { TOWERS } from './config.js';

let selectedTowerType = null;
let onTowerSelected = null;
let onStartNight = null;
let onSpeedChange = null;
let onRestart = null;
let onPlay = null;

export function initUI(callbacks) {
    onTowerSelected = callbacks.onTowerSelected;
    onStartNight = callbacks.onStartNight;
    onSpeedChange = callbacks.onSpeedChange;
    onRestart = callbacks.onRestart;
    onPlay = callbacks.onPlay;

    // Tower shop click handlers
    document.querySelectorAll('.tower-option').forEach(el => {
        el.addEventListener('click', () => {
            const type = el.dataset.tower;
            selectTower(type);
        });
    });

    // Start night button
    document.getElementById('start-night-btn').addEventListener('click', () => {
        if (onStartNight) onStartNight();
    });

    // Speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (onSpeedChange) onSpeedChange(parseInt(btn.dataset.speed));
        });
    });

    // Restart button
    document.getElementById('restart-btn').addEventListener('click', () => {
        if (onRestart) onRestart();
    });

    // Play button
    document.getElementById('play-btn').addEventListener('click', () => {
        if (onPlay) onPlay();
    });
}

function selectTower(type) {
    if (selectedTowerType === type) {
        // Deselect
        selectedTowerType = null;
        document.querySelectorAll('.tower-option').forEach(el => el.classList.remove('selected'));
    } else {
        selectedTowerType = type;
        document.querySelectorAll('.tower-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.tower === type);
        });
    }
    if (onTowerSelected) onTowerSelected(selectedTowerType);
}

export function updateHUD(state) {
    // Resources
    document.getElementById('gold-amount').textContent = Math.floor(state.gold);
    document.getElementById('egg-amount').textContent = Math.floor(state.eggs);
    document.getElementById('lives-amount').textContent = state.lives;

    // Wave
    document.getElementById('wave-number').textContent = state.wave;

    // Phase
    const phaseIcon = document.getElementById('phase-icon');
    const phaseText = document.getElementById('phase-text');
    const phaseTimer = document.getElementById('phase-timer');

    switch (state.phase) {
        case 'day':
            phaseIcon.textContent = '☀️';
            phaseText.textContent = 'DAY';
            phaseText.style.color = '#FFD700';
            break;
        case 'dusk':
            phaseIcon.textContent = '🌅';
            phaseText.textContent = 'DUSK';
            phaseText.style.color = '#FF7733';
            break;
        case 'night':
            phaseIcon.textContent = '🌙';
            phaseText.textContent = 'NIGHT';
            phaseText.style.color = '#6688CC';
            break;
        case 'dawn':
            phaseIcon.textContent = '🌄';
            phaseText.textContent = 'DAWN';
            phaseText.style.color = '#FFAA66';
            break;
    }

    phaseTimer.textContent = Math.ceil(state.timeRemaining) + 's';

    // Tower affordability
    document.querySelectorAll('.tower-option').forEach(el => {
        const type = el.dataset.tower;
        const def = TOWERS[type];
        if (def) {
            el.classList.toggle('disabled', state.gold < def.cost);
        }
    });

    // Start night button visibility
    const startBtn = document.getElementById('start-night-btn');
    if (state.phase === 'day') {
        startBtn.style.display = '';
        startBtn.disabled = false;
    } else {
        startBtn.style.display = 'none';
    }
}

export function showStartScreen() {
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('hud').style.display = 'none';
}

export function hideStartScreen() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').style.display = '';
}

export function showGameOver(wave) {
    document.getElementById('game-over').classList.remove('hidden');
    document.getElementById('final-wave').textContent = wave;
}

export function hideGameOver() {
    document.getElementById('game-over').classList.add('hidden');
}

export function getSelectedTowerType() {
    return selectedTowerType;
}

export function clearSelection() {
    selectedTowerType = null;
    document.querySelectorAll('.tower-option').forEach(el => el.classList.remove('selected'));
}
