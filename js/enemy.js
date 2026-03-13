import * as THREE from 'three';
import { ENEMIES, PATHS, CELL_SIZE } from './config.js';
import { gridToWorld, distance2D } from './utils.js';

let enemies = [];
let scene;
let onKillCallback = null;

export function setOnKillCallback(cb) {
    onKillCallback = cb;
}

export function initEnemies(sceneRef) {
    scene = sceneRef;
    enemies = [];
}

export function spawnEnemy(type, pathIndex = null) {
    const def = ENEMIES[type];
    if (!def) return null;

    // Pick a random path if not specified
    if (pathIndex === null) {
        pathIndex = Math.floor(Math.random() * PATHS.length);
    }

    const path = PATHS[pathIndex];
    const startPos = gridToWorld(path[0][0], path[0][1]);

    // Create enemy mesh
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.SphereGeometry(def.scale * CELL_SIZE * 0.4, 8, 6);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.6,
        metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = def.scale * CELL_SIZE * 0.4;
    body.castShadow = true;
    group.add(body);

    // Snout/nose (cone pointing forward)
    const noseGeo = new THREE.ConeGeometry(def.scale * 0.15, def.scale * 0.4, 5);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, def.scale * CELL_SIZE * 0.4, def.scale * CELL_SIZE * 0.45);
    group.add(nose);

    // Eyes (small spheres)
    const eyeGeo = new THREE.SphereGeometry(0.06, 4, 4);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.5 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, def.scale * CELL_SIZE * 0.55, def.scale * CELL_SIZE * 0.3);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone());
    eyeR.position.set(0.1, def.scale * CELL_SIZE * 0.55, def.scale * CELL_SIZE * 0.3);
    group.add(eyeR);

    // Health bar
    const healthBarBg = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x333333 })
    );
    healthBarBg.position.y = def.scale * CELL_SIZE * 0.9;
    healthBarBg.rotation.x = -Math.PI / 4;
    group.add(healthBarBg);

    const healthBar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x44CC44 })
    );
    healthBar.position.y = def.scale * CELL_SIZE * 0.9 + 0.001;
    healthBar.rotation.x = -Math.PI / 4;
    group.add(healthBar);

    group.position.set(startPos.x, def.flying ? 3 : 0, startPos.z);
    scene.add(group);

    const enemy = {
        mesh: group,
        healthBar: healthBar,
        type: type,
        health: def.health,
        maxHealth: def.health,
        speed: def.speed,
        reward: def.reward,
        isBoss: def.isBoss || false,
        flying: def.flying || false,
        path: path,
        pathIndex: 0,
        alive: true,
        slowTimer: 0,
        slowAmount: 1,
    };

    enemies.push(enemy);
    return enemy;
}

export function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (!enemy.alive) continue;

        // Update slow effect
        if (enemy.slowTimer > 0) {
            enemy.slowTimer -= dt;
            if (enemy.slowTimer <= 0) {
                enemy.slowAmount = 1;
            }
        }

        // Move along path
        if (enemy.pathIndex < enemy.path.length - 1) {
            const nextWaypoint = enemy.path[enemy.pathIndex + 1];
            const target = gridToWorld(nextWaypoint[0], nextWaypoint[1]);
            const pos = enemy.mesh.position;

            const dx = target.x - pos.x;
            const dz = target.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < 0.15) {
                enemy.pathIndex++;
            } else {
                const speed = enemy.speed * enemy.slowAmount * dt;
                pos.x += (dx / dist) * speed;
                pos.z += (dz / dist) * speed;

                // Face movement direction
                enemy.mesh.rotation.y = Math.atan2(dx, dz);
            }

            // Bobbing animation
            const bodyMesh = enemy.mesh.children[0];
            if (bodyMesh) {
                const bob = Math.sin(Date.now() * 0.008 * enemy.speed) * 0.05;
                bodyMesh.position.y = ENEMIES[enemy.type].scale * CELL_SIZE * 0.4 + bob;
            }
        }

        // Update health bar
        const healthPct = enemy.health / enemy.maxHealth;
        enemy.healthBar.scale.x = Math.max(0.01, healthPct);
        enemy.healthBar.position.x = -(1 - healthPct) * 0.4;
        if (healthPct < 0.3) {
            enemy.healthBar.material.color.setHex(0xCC4444);
        } else if (healthPct < 0.6) {
            enemy.healthBar.material.color.setHex(0xCCAA22);
        }
    }
}

export function damageEnemy(enemy, damage) {
    enemy.health -= damage;
    if (enemy.health <= 0) {
        enemy.alive = false;
        scene.remove(enemy.mesh);
        // Dispose geometry
        enemy.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        if (onKillCallback) onKillCallback(enemy);
        return true; // killed
    }
    return false;
}

export function applySlowToEnemy(enemy, amount, duration) {
    enemy.slowAmount = Math.min(enemy.slowAmount, 1 - amount);
    enemy.slowTimer = Math.max(enemy.slowTimer, duration);
}

export function hasReachedEnd(enemy) {
    return enemy.alive && enemy.pathIndex >= enemy.path.length - 1;
}

export function removeEnemy(enemy) {
    enemy.alive = false;
    scene.remove(enemy.mesh);
    enemy.mesh.traverse(child => {
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

export function getEnemies() { return enemies; }

export function getAliveEnemies() {
    return enemies.filter(e => e.alive);
}

export function clearEnemies() {
    enemies.forEach(e => {
        scene.remove(e.mesh);
        e.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    });
    enemies = [];
}
