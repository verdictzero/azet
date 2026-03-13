import * as THREE from 'three';
import { distance3D } from './utils.js';
import { damageEnemy, getAliveEnemies } from './enemy.js';

let projectiles = [];
let scene;

const PROJECTILE_SPEED = 15;

export function initProjectiles(sceneRef) {
    scene = sceneRef;
    projectiles = [];
}

export function fireProjectile(fromPos, targetEnemy, damage, splashRadius, towerType) {
    let color, size;
    switch (towerType) {
        case 'rooster':
            color = 0xFF4444;
            size = 0.08;
            break;
        case 'eggcatapult':
            color = 0xFFF8E1;
            size = 0.15;
            break;
        case 'lantern':
            color = 0xFFAA44;
            size = 0.06;
            break;
        default:
            color = 0xFFFFFF;
            size = 0.08;
    }

    const geo = new THREE.SphereGeometry(size, 6, 6);
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.8
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Egg shape for catapult
    if (towerType === 'eggcatapult') {
        mesh.scale.y = 1.3;
    }

    mesh.position.set(fromPos.x, 2, fromPos.z);
    scene.add(mesh);

    projectiles.push({
        mesh: mesh,
        target: targetEnemy,
        damage: damage,
        splashRadius: splashRadius || 0,
        speed: PROJECTILE_SPEED,
        alive: true,
        towerType: towerType
    });
}

export function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        if (!proj.alive) continue;

        // If target is dead, remove projectile
        if (!proj.target.alive) {
            removeProjectile(proj, i);
            continue;
        }

        // Move toward target
        const targetPos = proj.target.mesh.position;
        const dx = targetPos.x - proj.mesh.position.x;
        const dy = (targetPos.y + 0.5) - proj.mesh.position.y;
        const dz = targetPos.z - proj.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 0.3) {
            // Hit!
            if (proj.splashRadius > 0) {
                // AoE damage
                const aliveEnemies = getAliveEnemies();
                for (const enemy of aliveEnemies) {
                    const splashDist = distance3D(proj.mesh.position, enemy.mesh.position);
                    if (splashDist <= proj.splashRadius) {
                        const falloff = 1 - (splashDist / proj.splashRadius) * 0.5;
                        damageEnemy(enemy, proj.damage * falloff);
                    }
                }
            } else {
                damageEnemy(proj.target, proj.damage);
            }

            removeProjectile(proj, i);
        } else {
            const moveSpeed = proj.speed * dt;
            proj.mesh.position.x += (dx / dist) * moveSpeed;
            proj.mesh.position.y += (dy / dist) * moveSpeed;
            proj.mesh.position.z += (dz / dist) * moveSpeed;

            // Arc for catapult projectiles
            if (proj.towerType === 'eggcatapult') {
                proj.mesh.position.y += Math.sin((1 - dist / 10) * Math.PI) * 0.1;
            }
        }
    }
}

function removeProjectile(proj, index) {
    proj.alive = false;
    scene.remove(proj.mesh);
    proj.mesh.geometry.dispose();
    proj.mesh.material.dispose();
    projectiles.splice(index, 1);
}

export function clearProjectiles() {
    for (const proj of projectiles) {
        scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        proj.mesh.material.dispose();
    }
    projectiles = [];
}

export function getProjectiles() { return projectiles; }
