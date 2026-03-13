import * as THREE from 'three';
import { lerp, clamp, easeInOut } from './utils.js';

let sunLight, moonLight, ambientLight, hemisphereLight;
let scene;

// Colors for different phases
const COLORS = {
    day: {
        sun: new THREE.Color(0xFFF5E6),
        ambient: new THREE.Color(0x8899AA),
        sky: new THREE.Color(0x87CEEB),
        fog: new THREE.Color(0x87CEEB),
        sunIntensity: 2.0,
        ambientIntensity: 0.6,
    },
    dusk: {
        sun: new THREE.Color(0xFF7733),
        ambient: new THREE.Color(0x664433),
        sky: new THREE.Color(0xDD6633),
        fog: new THREE.Color(0xCC5522),
        sunIntensity: 1.5,
        ambientIntensity: 0.3,
    },
    night: {
        sun: new THREE.Color(0x4466AA),
        ambient: new THREE.Color(0x112244),
        sky: new THREE.Color(0x0A0E1A),
        fog: new THREE.Color(0x0A0E1A),
        sunIntensity: 0.3,
        ambientIntensity: 0.15,
    },
    dawn: {
        sun: new THREE.Color(0xFFCC88),
        ambient: new THREE.Color(0x886655),
        sky: new THREE.Color(0xFFAA77),
        fog: new THREE.Color(0xEE9966),
        sunIntensity: 1.8,
        ambientIntensity: 0.4,
    }
};

export function initLighting(sceneRef) {
    scene = sceneRef;

    // Sun / directional light
    sunLight = new THREE.DirectionalLight(COLORS.day.sun, COLORS.day.sunIntensity);
    sunLight.position.set(15, 25, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 80;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    sunLight.shadow.bias = -0.001;
    scene.add(sunLight);

    // Moon light (dim directional from opposite side)
    moonLight = new THREE.DirectionalLight(0x4466AA, 0);
    moonLight.position.set(-10, 20, -8);
    scene.add(moonLight);

    // Ambient light
    ambientLight = new THREE.AmbientLight(COLORS.day.ambient, COLORS.day.ambientIntensity);
    scene.add(ambientLight);

    // Hemisphere light for natural sky/ground color blending
    hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x3D5C3A, 0.3);
    scene.add(hemisphereLight);
}

// Update lighting based on phase and transition progress (0-1)
export function updateLighting(phase, progress) {
    let fromColors, toColors;

    switch (phase) {
        case 'day':
            setLightingState(COLORS.day);
            return;
        case 'dusk':
            fromColors = COLORS.day;
            toColors = COLORS.night;
            break;
        case 'night':
            setLightingState(COLORS.night);
            // Moon brightness varies
            moonLight.intensity = 0.4;
            return;
        case 'dawn':
            fromColors = COLORS.night;
            toColors = COLORS.day;
            break;
        default:
            return;
    }

    const t = easeInOut(progress);
    lerpLighting(fromColors, toColors, t);
}

function setLightingState(colors) {
    sunLight.color.copy(colors.sun);
    sunLight.intensity = colors.sunIntensity;
    ambientLight.color.copy(colors.ambient);
    ambientLight.intensity = colors.ambientIntensity;
    scene.background.copy(colors.sky);
    if (scene.fog) scene.fog.color.copy(colors.fog);
    moonLight.intensity = 0;
}

function lerpLighting(from, to, t) {
    sunLight.color.lerpColors(from.sun, to.sun, t);
    sunLight.intensity = lerp(from.sunIntensity, to.sunIntensity, t);
    ambientLight.color.lerpColors(from.ambient, to.ambient, t);
    ambientLight.intensity = lerp(from.ambientIntensity, to.ambientIntensity, t);
    scene.background.lerpColors(from.sky, to.sky, t);
    if (scene.fog) scene.fog.color.lerpColors(from.fog, to.fog, t);

    // Sun position moves down during dusk, up during dawn
    const sunHeight = lerp(25, 2, t);
    sunLight.position.y = sunHeight;

    // Moon rises as sun sets
    moonLight.intensity = lerp(0, 0.4, t);
}

export function getSunLight() { return sunLight; }
export function getMoonLight() { return moonLight; }
