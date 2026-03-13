import { DAY_DURATION, DUSK_DURATION, DAWN_DURATION, NIGHT_BASE_DURATION, NIGHT_SCALE_PER_WAVE } from './config.js';
import { updateLighting } from './lighting.js';

// Phases: 'day', 'dusk', 'night', 'dawn'
let currentPhase = 'day';
let phaseTimer = 0;
let phaseDuration = DAY_DURATION;
let waveNumber = 0;
let onPhaseChange = null;
let manualNightTrigger = false;

export function initDayCycle(phaseChangeCallback) {
    currentPhase = 'day';
    phaseTimer = 0;
    phaseDuration = DAY_DURATION;
    waveNumber = 0;
    onPhaseChange = phaseChangeCallback;
    manualNightTrigger = false;
}

export function updateDayCycle(dt) {
    phaseTimer += dt;
    const progress = Math.min(phaseTimer / phaseDuration, 1);

    // Update lighting transitions for dusk and dawn
    if (currentPhase === 'dusk' || currentPhase === 'dawn') {
        updateLighting(currentPhase, progress);
    }

    // Check for phase transition
    if (phaseTimer >= phaseDuration) {
        advancePhase();
    }
}

export function triggerNight() {
    if (currentPhase === 'day') {
        manualNightTrigger = true;
        // Jump to dusk immediately
        currentPhase = 'dusk';
        phaseTimer = 0;
        phaseDuration = DUSK_DURATION;
        updateLighting('dusk', 0);
        if (onPhaseChange) onPhaseChange('dusk');
    }
}

function advancePhase() {
    phaseTimer = 0;

    switch (currentPhase) {
        case 'day':
            // Day ends, transition to dusk (only via manual trigger or timer)
            if (!manualNightTrigger) {
                // Auto-advance to dusk when day timer runs out
                currentPhase = 'dusk';
                phaseDuration = DUSK_DURATION;
                if (onPhaseChange) onPhaseChange('dusk');
            }
            break;

        case 'dusk':
            // Dusk ends, night begins
            currentPhase = 'night';
            waveNumber++;
            phaseDuration = NIGHT_BASE_DURATION + waveNumber * NIGHT_SCALE_PER_WAVE;
            updateLighting('night', 1);
            manualNightTrigger = false;
            if (onPhaseChange) onPhaseChange('night');
            break;

        case 'night':
            // Night ends, dawn begins
            currentPhase = 'dawn';
            phaseDuration = DAWN_DURATION;
            if (onPhaseChange) onPhaseChange('dawn');
            break;

        case 'dawn':
            // Dawn ends, new day
            currentPhase = 'day';
            phaseDuration = Math.max(DAY_DURATION - waveNumber * 3, 30); // Days get shorter
            updateLighting('day', 1);
            if (onPhaseChange) onPhaseChange('day');
            break;
    }
}

// Force end night (when all enemies are dead)
export function endNight() {
    if (currentPhase === 'night') {
        currentPhase = 'dawn';
        phaseTimer = 0;
        phaseDuration = DAWN_DURATION;
        if (onPhaseChange) onPhaseChange('dawn');
    }
}

export function getPhase() { return currentPhase; }
export function getPhaseTimer() { return phaseTimer; }
export function getPhaseDuration() { return phaseDuration; }
export function getWaveNumber() { return waveNumber; }
export function getTimeRemaining() { return Math.max(0, phaseDuration - phaseTimer); }
