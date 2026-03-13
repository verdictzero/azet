import * as THREE from 'three';
import { GRID_SIZE, CELL_SIZE, MAP_DATA, TILE, PATHS } from './config.js';
import { gridToWorld } from './utils.js';

let gridMeshes = [];
let tileStates = []; // Track what's built on each tile
let coopMesh;

const TILE_COLORS = {
    [TILE.GRASS]: 0x4CAF50,
    [TILE.PATH]: 0xA0826D,
    [TILE.BUILDABLE]: 0x66BB6A,
    [TILE.COOP]: 0x8D6E63,
    [TILE.WATER]: 0x42A5F5,
    [TILE.SPAWN]: 0x333333
};

export function initMap(scene, groundGroup) {
    gridMeshes = [];
    tileStates = [];

    for (let z = 0; z < GRID_SIZE; z++) {
        tileStates[z] = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            const tileType = MAP_DATA[z][x];
            tileStates[z][x] = { type: tileType, tower: null };

            const pos = gridToWorld(x, z);
            const color = TILE_COLORS[tileType] || 0x4CAF50;

            // Ground tile
            const geo = new THREE.BoxGeometry(CELL_SIZE - 0.05, 0.2, CELL_SIZE - 0.05);
            const mat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.8,
                metalness: 0.1
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pos.x, -0.1, pos.z);
            mesh.receiveShadow = true;

            // Store grid coords on mesh for raycasting
            mesh.userData = { gridX: x, gridZ: z, tileType: tileType };

            scene.add(mesh);
            groundGroup.add(mesh);
            gridMeshes.push(mesh);

            // Add path borders/details
            if (tileType === TILE.PATH) {
                mesh.position.y = -0.15; // Paths slightly lower
            }

            // Water tiles get slight animation marker
            if (tileType === TILE.WATER) {
                mesh.userData.isWater = true;
                mesh.position.y = -0.2;
            }
        }
    }

    // Build the chicken coop structure
    buildCoop(scene);

    // Add some decorative trees at edges
    addTrees(scene);
}

function buildCoop(scene) {
    const coopGroup = new THREE.Group();

    // Main barn body
    const barnGeo = new THREE.BoxGeometry(5.5, 2.5, 4);
    const barnMat = new THREE.MeshStandardMaterial({ color: 0xCC4444, roughness: 0.7 });
    const barn = new THREE.Mesh(barnGeo, barnMat);
    barn.position.set(0, 1.25, 0);
    barn.castShadow = true;
    barn.receiveShadow = true;
    coopGroup.add(barn);

    // Roof (triangular prism approximation using a scaled box rotated)
    const roofGeo = new THREE.ConeGeometry(3.5, 1.5, 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.6 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, 3.25, 0);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.65);
    roof.castShadow = true;
    coopGroup.add(roof);

    // Door
    const doorGeo = new THREE.BoxGeometry(0.8, 1.5, 0.1);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3E2723 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 0.75, 2.01);
    coopGroup.add(door);

    // Windows (will glow at night)
    const winGeo = new THREE.BoxGeometry(0.6, 0.6, 0.1);
    const winMat = new THREE.MeshStandardMaterial({
        color: 0xFFE082,
        emissive: 0xFFE082,
        emissiveIntensity: 0
    });
    const win1 = new THREE.Mesh(winGeo, winMat);
    win1.position.set(-1.5, 1.5, 2.01);
    coopGroup.add(win1);

    const win2 = new THREE.Mesh(winGeo, winMat.clone());
    win2.position.set(1.5, 1.5, 2.01);
    coopGroup.add(win2);

    // Position coop at the coop tiles center
    const coopCenter = gridToWorld(5, 9);
    coopGroup.position.set(coopCenter.x, 0, coopCenter.z);

    scene.add(coopGroup);
    coopMesh = coopGroup;

    // Add warm point light inside coop (for night glow)
    const coopLight = new THREE.PointLight(0xFFE082, 0, 8);
    coopLight.position.set(coopCenter.x, 2, coopCenter.z);
    coopLight.userData.isCoopLight = true;
    scene.add(coopLight);
}

function addTrees(scene) {
    const treePositions = [
        [-10, 0, -8], [-8, 0, -10], [-12, 0, -4],
        [10, 0, -8], [12, 0, -6], [8, 0, -10],
        [-10, 0, 2], [10, 0, 4],
    ];

    treePositions.forEach(([x, y, z]) => {
        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, 1, z);
        trunk.castShadow = true;
        scene.add(trunk);

        // Canopy
        const canopyGeo = new THREE.SphereGeometry(1.2, 6, 5);
        const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.9 });
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.set(x, 2.8, z);
        canopy.castShadow = true;
        scene.add(canopy);
    });
}

export function getTileState(gridX, gridZ) {
    if (gridX < 0 || gridX >= GRID_SIZE || gridZ < 0 || gridZ >= GRID_SIZE) return null;
    return tileStates[gridZ][gridX];
}

export function setTileTower(gridX, gridZ, tower) {
    if (gridX >= 0 && gridX < GRID_SIZE && gridZ >= 0 && gridZ < GRID_SIZE) {
        tileStates[gridZ][gridX].tower = tower;
    }
}

export function clearTileTower(gridX, gridZ) {
    if (gridX >= 0 && gridX < GRID_SIZE && gridZ >= 0 && gridZ < GRID_SIZE) {
        tileStates[gridZ][gridX].tower = null;
    }
}

export function isBuildable(gridX, gridZ) {
    const tile = getTileState(gridX, gridZ);
    return tile && tile.type === TILE.BUILDABLE && tile.tower === null;
}

// Update coop window glow based on phase
export function updateCoopGlow(phase) {
    if (!coopMesh) return;
    coopMesh.traverse(child => {
        if (child.material && child.material.emissiveIntensity !== undefined) {
            child.material.emissiveIntensity = (phase === 'night' || phase === 'dusk') ? 0.8 : 0;
        }
    });
}

export function getGridMeshes() { return gridMeshes; }
