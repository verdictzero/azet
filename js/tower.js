import * as THREE from 'three';
import { TOWERS, CELL_SIZE } from './config.js';
import { gridToWorld, distance2D } from './utils.js';
import { getAliveEnemies, applySlowToEnemy } from './enemy.js';
import { fireProjectile } from './projectile.js';

let towers = [];
let scene;

export function initTowers(sceneRef) {
    scene = sceneRef;
    towers = [];
}

export function placeTower(type, gridX, gridZ) {
    const def = TOWERS[type];
    if (!def) return null;

    const pos = gridToWorld(gridX, gridZ);
    const group = new THREE.Group();

    switch (type) {
        case 'scarecrow':
            buildScarecrow(group);
            break;
        case 'rooster':
            buildRoosterTower(group);
            break;
        case 'eggcatapult':
            buildEggCatapult(group);
            break;
        case 'lantern':
            buildLantern(group, pos);
            break;
        default:
            // Fallback: simple box
            const boxGeo = new THREE.BoxGeometry(0.8, 1.5, 0.8);
            const boxMat = new THREE.MeshStandardMaterial({ color: def.color });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.y = 0.75;
            box.castShadow = true;
            group.add(box);
    }

    group.position.set(pos.x, 0, pos.z);
    scene.add(group);

    const tower = {
        mesh: group,
        type: type,
        gridX: gridX,
        gridZ: gridZ,
        worldPos: pos,
        range: def.range,
        damage: def.damage,
        fireRate: def.fireRate,
        fireCooldown: 0,
        slowAmount: def.slowAmount || 0,
        slowDuration: def.slowDuration || 0,
        splashRadius: def.splashRadius || 0,
        lightRadius: def.lightRadius || 0,
        sellValue: def.sellValue,
    };

    towers.push(tower);
    return tower;
}

function buildScarecrow(group) {
    // Post
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 1;
    post.castShadow = true;
    group.add(post);

    // Crossbar
    const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6);
    const bar = new THREE.Mesh(barGeo, postMat.clone());
    bar.position.y = 1.7;
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = true;
    group.add(bar);

    // Head
    const headGeo = new THREE.SphereGeometry(0.25, 6, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xD2B48C });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.2;
    head.castShadow = true;
    group.add(head);

    // Hat
    const hatBrimGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 8);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x8B7355 });
    const brim = new THREE.Mesh(hatBrimGeo, hatMat);
    brim.position.y = 2.4;
    group.add(brim);

    const hatTopGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.35, 8);
    const hatTop = new THREE.Mesh(hatTopGeo, hatMat.clone());
    hatTop.position.y = 2.6;
    hatTop.castShadow = true;
    group.add(hatTop);
}

function buildRoosterTower(group) {
    // Tower base
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x795548 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Tower pole
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 2, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.4;
    pole.castShadow = true;
    group.add(pole);

    // Rooster on top
    const bodyGeo = new THREE.SphereGeometry(0.3, 6, 6);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xCC3333 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2.5;
    body.castShadow = true;
    group.add(body);

    // Beak
    const beakGeo = new THREE.ConeGeometry(0.08, 0.2, 4);
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xFF9800 });
    const beak = new THREE.Mesh(beakGeo, beakMat);
    beak.position.set(0, 2.5, 0.35);
    beak.rotation.x = -Math.PI / 2;
    group.add(beak);

    // Comb
    const combGeo = new THREE.BoxGeometry(0.05, 0.2, 0.15);
    const combMat = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
    const comb = new THREE.Mesh(combGeo, combMat);
    comb.position.y = 2.85;
    group.add(comb);
}

function buildEggCatapult(group) {
    // Base platform
    const baseGeo = new THREE.BoxGeometry(1.2, 0.3, 1.2);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x8D6E63 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.15;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Arm
    const armGeo = new THREE.BoxGeometry(0.12, 1.6, 0.12);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0, 1, 0);
    arm.rotation.z = Math.PI / 6;
    arm.castShadow = true;
    group.add(arm);

    // Bucket
    const bucketGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.2, 6);
    const bucketMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41 });
    const bucket = new THREE.Mesh(bucketGeo, bucketMat);
    bucket.position.set(-0.5, 1.7, 0);
    group.add(bucket);

    // Egg in bucket
    const eggGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const eggMat = new THREE.MeshStandardMaterial({ color: 0xFFF8E1 });
    const egg = new THREE.Mesh(eggGeo, eggMat);
    egg.position.set(-0.5, 1.85, 0);
    egg.scale.y = 1.3;
    group.add(egg);
}

function buildLantern(group, worldPos) {
    // Post
    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.8, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 0.9;
    post.castShadow = true;
    group.add(post);

    // Lantern housing
    const housingGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
    const housingMat = new THREE.MeshStandardMaterial({
        color: 0xFFD700,
        emissive: 0xFFAA00,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.y = 2;
    group.add(housing);

    // Top cap
    const capGeo = new THREE.ConeGeometry(0.25, 0.2, 4);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 2.3;
    cap.rotation.y = Math.PI / 4;
    group.add(cap);

    // Point light
    const light = new THREE.PointLight(0xFFAA44, 0, 8, 2);
    light.position.set(0, 2, 0);
    light.userData.isLanternLight = true;
    group.add(light);
}

export function updateTowers(dt, phase) {
    const aliveEnemies = getAliveEnemies();

    for (const tower of towers) {
        // Scarecrows: apply slow to enemies in range
        if (tower.type === 'scarecrow') {
            for (const enemy of aliveEnemies) {
                const dist = distance2D(tower.worldPos, enemy.mesh.position);
                if (dist <= tower.range) {
                    applySlowToEnemy(enemy, tower.slowAmount, tower.slowDuration);
                }
            }
            continue;
        }

        // Lanterns: update light based on phase
        if (tower.type === 'lantern') {
            const light = tower.mesh.children.find(c => c.isLight);
            if (light) {
                light.intensity = (phase === 'night' || phase === 'dusk') ? 2.5 : 0;
            }
            // Lanterns also do minor damage
        }

        // Combat towers: find target and shoot
        if (tower.damage > 0) {
            tower.fireCooldown -= dt;

            if (tower.fireCooldown <= 0) {
                // Find closest enemy in range
                let closestEnemy = null;
                let closestDist = Infinity;

                for (const enemy of aliveEnemies) {
                    const dist = distance2D(tower.worldPos, enemy.mesh.position);
                    if (dist <= tower.range && dist < closestDist) {
                        closestDist = dist;
                        closestEnemy = enemy;
                    }
                }

                if (closestEnemy) {
                    // Fire!
                    fireProjectile(
                        tower.worldPos,
                        closestEnemy,
                        tower.damage,
                        tower.splashRadius,
                        tower.type
                    );
                    tower.fireCooldown = tower.fireRate;

                    // Rotate tower toward target
                    const dx = closestEnemy.mesh.position.x - tower.worldPos.x;
                    const dz = closestEnemy.mesh.position.z - tower.worldPos.z;
                    tower.mesh.rotation.y = Math.atan2(dx, dz);
                }
            }
        }
    }
}

export function removeTower(tower) {
    const idx = towers.indexOf(tower);
    if (idx !== -1) {
        towers.splice(idx, 1);
        scene.remove(tower.mesh);
        tower.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}

export function getTowers() { return towers; }
