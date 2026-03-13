import * as THREE from 'three';

let scene, camera, renderer;
let groundGroup;

export function initRenderer(container) {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.015);

    // Isometric orthographic camera
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 16;
    camera = new THREE.OrthographicCamera(
        -viewSize * aspect, viewSize * aspect,
        viewSize, -viewSize,
        0.1, 200
    );

    // Position camera for isometric view
    const isoAngle = Math.PI / 6; // 30 degrees from horizontal
    const isoRotation = Math.PI / 4; // 45 degree rotation
    const camDist = 50;
    camera.position.set(
        camDist * Math.cos(isoAngle) * Math.sin(isoRotation),
        camDist * Math.sin(isoAngle),
        camDist * Math.cos(isoAngle) * Math.cos(isoRotation)
    );
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    container.insertBefore(renderer.domElement, container.firstChild);

    // Ground group for raycast targeting
    groundGroup = new THREE.Group();
    groundGroup.name = 'ground';
    scene.add(groundGroup);

    // Handle resize
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer };
}

function onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 16;
    camera.left = -viewSize * aspect;
    camera.right = viewSize * aspect;
    camera.top = viewSize;
    camera.bottom = -viewSize;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export function render() {
    renderer.render(scene, camera);
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getGroundGroup() { return groundGroup; }
