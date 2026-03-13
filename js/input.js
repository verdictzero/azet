import * as THREE from 'three';
import { getCamera } from './renderer.js';
import { worldToGrid } from './utils.js';

let raycaster;
let mouse;
let groundGroup;
let onTileClick = null;
let onTileHover = null;
let hoverMesh = null;
let enabled = true;

export function initInput(groundGroupRef) {
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    groundGroup = groundGroupRef;

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);
    window.addEventListener('contextmenu', onRightClick);
}

export function setInputCallbacks(clickCallback, hoverCallback) {
    onTileClick = clickCallback;
    onTileHover = hoverCallback;
}

export function setInputEnabled(state) {
    enabled = state;
}

function onMouseMove(event) {
    if (!enabled) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Check if mouse is over UI elements
    if (event.target.closest('#hud') && event.target.closest('#hud') !== document.getElementById('hud')) {
        if (onTileHover) onTileHover(null);
        return;
    }

    const camera = getCamera();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(groundGroup.children, false);
    if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData && hit.userData.gridX !== undefined) {
            if (onTileHover) onTileHover(hit.userData);
        }
    } else {
        if (onTileHover) onTileHover(null);
    }
}

function onClick(event) {
    if (!enabled) return;

    // Ignore clicks on UI elements
    if (event.target.closest('#hud') && event.target !== document.querySelector('canvas')) {
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const camera = getCamera();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(groundGroup.children, false);
    if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData && hit.userData.gridX !== undefined) {
            if (onTileClick) onTileClick(hit.userData, 'left');
        }
    }
}

function onRightClick(event) {
    event.preventDefault();
    if (!enabled) return;

    if (onTileClick) onTileClick(null, 'right');
}

export function createHoverIndicator(scene) {
    const geo = new THREE.RingGeometry(0.7, 0.85, 4);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x44FF44,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    hoverMesh = new THREE.Mesh(geo, mat);
    hoverMesh.rotation.x = -Math.PI / 2;
    hoverMesh.rotation.z = Math.PI / 4;
    hoverMesh.position.y = 0.05;
    hoverMesh.visible = false;
    scene.add(hoverMesh);
    return hoverMesh;
}

export function updateHoverIndicator(pos, canBuild) {
    if (!hoverMesh) return;
    if (!pos) {
        hoverMesh.visible = false;
        return;
    }
    hoverMesh.visible = true;
    hoverMesh.position.x = pos.x;
    hoverMesh.position.z = pos.z;
    hoverMesh.material.color.setHex(canBuild ? 0x44FF44 : 0xFF4444);

    // Gentle pulse
    const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.2;
    hoverMesh.material.opacity = pulse;
}

export function showRangeIndicator(scene, pos, range) {
    // Create a temporary range circle
    const geo = new THREE.RingGeometry(range - 0.05, range, 32);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
    });
    const rangeMesh = new THREE.Mesh(geo, mat);
    rangeMesh.rotation.x = -Math.PI / 2;
    rangeMesh.position.set(pos.x, 0.06, pos.z);
    scene.add(rangeMesh);
    return rangeMesh;
}
