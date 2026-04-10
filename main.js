import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#bg'),
  antialias: true,
});

renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

camera.position.set(0, 5, 25);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- Enhanced Lighting Setup ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(10, 20, 15);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0x00BFFF, 0.4);
fillLight.position.set(-10, -5, -10);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xffffff, 0.7);
backLight.position.set(0, 10, -15);
scene.add(backLight);

// Ground plane
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();

let model;
const meshes = [];
const propellerMeshes = [];
const originalPositions = new Map();
const fallenPositions = new Map();
const activeAnimations = [];

let isAssembled = true;

// --- Animation Functions ---
function animateTo(object, targetPosition, duration, delay, path) {
    const startPosition = object.position.clone();
    const startTime = performance.now() + delay;

    const animation = {
        update: () => {
            const now = performance.now();
            if (now < startTime) return true; // Not started yet

            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = 0.5 * (1 - Math.cos(progress * Math.PI));

            if (path) {
                path.getPoint(easedProgress, object.position);
            } else {
                object.position.lerpVectors(startPosition, targetPosition, easedProgress);
            }

            return progress < 1;
        }
    };
    activeAnimations.push(animation);
}

function disassemble() {
    meshes.forEach(mesh => {
        const fallenPos = fallenPositions.get(mesh);
        if (fallenPos) {
            animateTo(mesh, fallenPos, 1500, Math.random() * 500);
        }
    });
}

function assemble() {
    const totalDuration = 30000; // Total time for all animations
    const animationDuration = 6000; // Each part takes 6 seconds to animate
    const stagger = (totalDuration - animationDuration) / meshes.length;

    // A control point base to the right of the drone to direct the animation path
    const controlPointBase = new THREE.Vector3(10, 5, 0);

    meshes.forEach((mesh, index) => {
        const originalPos = originalPositions.get(mesh);
        const fallenPos = fallenPositions.get(mesh);

        if (originalPos && fallenPos) {
            // The control point for the curve will be offset from the base control point
            // This adds a bit of variation to the wave, while keeping the direction consistent.
            const controlPoint = controlPointBase.clone();
            controlPoint.x += (Math.random() - 0.5) * 5;
            controlPoint.y += (Math.random() - 0.5) * 2;
            controlPoint.z += (Math.random() - 0.5) * 5;

            const curve = new THREE.QuadraticBezierCurve3(
                fallenPos,
                controlPoint,
                originalPos
            );

            animateTo(mesh, originalPos, animationDuration, index * stagger, curve);
        }
    });
}

renderer.domElement.addEventListener('dblclick', () => {
    isAssembled = !isAssembled;
    activeAnimations.length = 0;
    if (isAssembled) {
        assemble();
    } else {
        disassemble();
    }
});

const propellerNames = ['Body_1_1', 'Body_1_21', 'Body_1_41', 'Body_1_61'];

loader.load(
    'drone.glb',
    function ( gltf ) {
        model = gltf.scene;
        model.scale.set(10, 10, 10);
        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());

        controls.target.copy(center);
        controls.update();
        
        model.updateMatrixWorld(true);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material.isMeshStandardMaterial) {
                    child.material.metalness = 0.4;
                    child.material.roughness = 0.6;
                }

                meshes.push(child);
                
                originalPositions.set(child, child.position.clone());
                
                const worldPosition = new THREE.Vector3();
                child.getWorldPosition(worldPosition);

                const fallenWorldPos = new THREE.Vector3(worldPosition.x, ground.position.y + 0.1, worldPosition.z);

                const parentInverseWorldMatrix = new THREE.Matrix4();
                if (child.parent) {
                    parentInverseWorldMatrix.copy(child.parent.matrixWorld).invert();
                }
                
                const fallenLocalPos = fallenWorldPos.clone().applyMatrix4(parentInverseWorldMatrix);
                fallenPositions.set(child, fallenLocalPos);

                if (propellerNames.includes(child.name)) {
                    propellerMeshes.push(child);
                }
            }
        });
    },
    undefined,
    function ( error ) {
        console.error( error );
    }
);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let rotationSpeed = 0.3;

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('mousemove', onMouseMove, false);

function animate() {
    requestAnimationFrame( animate );

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
        rotationSpeed = 0.05;
    } else {
        rotationSpeed = 0.3;
    }

    if (isAssembled) {
        propellerMeshes.forEach(propeller => {
            propeller.rotation.y += rotationSpeed;
        });
    }
    
    for (let i = activeAnimations.length - 1; i >= 0; i--) {
        if (!activeAnimations[i].update()) {
            activeAnimations.splice(i, 1);
        }
    }

    controls.update();

    renderer.render( scene, camera );
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
