import * as THREE from "https://cdn.skypack.dev/three@0.133.1/build/three.module";
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/controls/OrbitControls'
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/loaders/GLTFLoader.js';

// DOM selectors
const containerEl = document.querySelector('.container');
const textInputEl = document.querySelector('#text-input');

// Settings
const fontName = 'system-ui';
const textureFontSize = 50;
const fontScaleFactor = .15;

// We need to keep the style of editable <div> (hidden inout field) and canvas
textInputEl.style.fontSize = textureFontSize + 'px';
textInputEl.style.font = '100 ' + textureFontSize + 'px ' + fontName;
textInputEl.style.lineHeight = 1.1 * textureFontSize + 'px';
textInputEl.style.fontWeight = 100;

// 3D scene related globals
let scene, camera, renderer, textCanvas, textCtx, particleGeometry, particleMaterial, instancedMesh, dummy, clock, cursorMesh;
let rayCaster, mouse, trackingPlane;
let intersect = new THREE.Vector3(10, 3, 7);
let intersectTarget = intersect.clone();

// String to show
let string = "Gaze";

// Coordinates data per 2D canvas and 3D scene
let textureCoordinates = [];

// 1d-array of data objects to store and change params of each instance
let particles = [];

// Parameters of whole string per 2D canvas and 3D scene
let stringBox = {
    wTexture: 0,
    wScene: 0,
    hTexture: 0,
    hScene: 0,
    caretPosScene: []
};

// ---------------------------------------------------------------

init();
createEvents();

// ---------------------------------------------------------------

function init() {
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, .1, 1000);
    camera.position.z = 20;

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({
        alpha: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerEl.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enablePan = false;

    textCanvas = document.createElement('canvas');
    textCanvas.width = textCanvas.height = 0;
    textCtx = textCanvas.getContext('2d');

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1.2);
    pointLight.position.set(-20, 10, 20);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.width = pointLight.shadow.mapSize.height = 2048;
    scene.add(pointLight);

    const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
    const trackingPlaneMaterial = new THREE.MeshBasicMaterial({ visible: false });
    trackingPlane = new THREE.Mesh(planeGeometry, trackingPlaneMaterial);
    trackingPlane.position.z = 6;
    scene.add(trackingPlane);

    const shadowPlaneMaterial = new THREE.ShadowMaterial({
        opacity: .2
    });
    const shadowPlaneMesh = new THREE.Mesh(planeGeometry, shadowPlaneMaterial);
    shadowPlaneMesh.position.z = -.2;
    shadowPlaneMesh.receiveShadow = true;
    scene.add(shadowPlaneMesh);

    dummy = new THREE.Object3D();
    clock = new THREE.Clock();

    const cursorGeometry = new THREE.BoxGeometry(.09, 6, .03);
    cursorGeometry.translate(0, -4.3, 0)
    const cursorMaterial = new THREE.MeshBasicMaterial({
        color: 0x111123,
        transparent: true,
    });
    cursorMesh = new THREE.Mesh(cursorGeometry, cursorMaterial);
    scene.add(cursorMesh);

    rayCaster = new THREE.Raycaster();
    mouse = new THREE.Vector2(0);

    const modalLoader = new GLTFLoader();
    modalLoader.load( './models/eye-realistic.glb', gltf => {
        particleGeometry = gltf.scene.children[2].geometry;
        particleMaterial = gltf.scene.children[2].material;
        textInputEl.innerHTML = string;
        textInputEl.focus();
        setCaretToEndOfInput();
        handleInput();
        refreshText();
        render();
    });
}


// ---------------------------------------------------------------

function createEvents() {
    document.addEventListener('keyup', () => {
        handleInput();
        refreshText();
    });

    textInputEl.addEventListener('focus', () => {
        clock.elapsedTime = 0;
    });

    window.addEventListener('mousemove', e => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        rayCaster.setFromCamera(mouse, camera);
        intersectTarget = rayCaster.intersectObject(trackingPlane)[0].point;
        intersectTarget.x += .5 * stringBox.wScene;
        intersectTarget.y += .5 * stringBox.hScene;
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function setCaretToEndOfInput() {
    document.execCommand('selectAll', false, null);
    document.getSelection().collapseToEnd();
}

function handleInput() {
    if (isNewLine(textInputEl.firstChild)) {
        textInputEl.firstChild.remove();
    }
    if (isNewLine(textInputEl.lastChild)) {
        if (isNewLine(textInputEl.lastChild.previousSibling)) {
            textInputEl.lastChild.remove();
        }
    }

    string = textInputEl.innerHTML
        .replaceAll("<p>", "\n")
        .replaceAll("</p>", "")
        .replaceAll("<div>", "\n")
        .replaceAll("</div>", "")
        .replaceAll("<br>", "")
        .replaceAll("<br/>", "")
        .replaceAll("&nbsp;", " ");

    stringBox.wTexture = textInputEl.clientWidth;
    stringBox.wScene = stringBox.wTexture * fontScaleFactor
    stringBox.hTexture = textInputEl.clientHeight;
    stringBox.hScene = stringBox.hTexture * fontScaleFactor
    stringBox.caretPosScene = getCaretCoordinates().map(c => c * fontScaleFactor);

    function isNewLine(el) {
        if (el) {
            if (el.tagName) {
                if (el.tagName.toUpperCase() === 'DIV' || el.tagName.toUpperCase() === 'P') {
                    if (el.innerHTML === '<br>' || el.innerHTML === '</br>') {
                        return true;
                    }
                }
            }
        }
        return false
    }

    function getCaretCoordinates() {
        const range = window.getSelection().getRangeAt(0);
        const needsToWorkAroundNewlineBug = (range.startContainer.nodeName.toLowerCase() === 'div' && range.startOffset === 0);
        if (needsToWorkAroundNewlineBug) {
            return [
                range.startContainer.offsetLeft,
                range.startContainer.offsetTop
            ]
        } else {
            const rects = range.getClientRects();
            if (rects[0]) {
                return [rects[0].left, rects[0].top]
            } else {
                document.execCommand('selectAll', false, null);
                return [
                    0, 0
                ]
            }
        }
    }
}

// ---------------------------------------------------------------

function render() {
    requestAnimationFrame(render);
    updateParticlesMatrices();
    updateCursorOpacity();

    let lerp = (start, end, amt) => (1 - amt) * start + amt * end;
    intersect.x = lerp(intersect.x, intersectTarget.x, .1);
    intersect.y = lerp(intersect.y, intersectTarget.y, .1);

    renderer.render(scene, camera);
}

// ---------------------------------------------------------------

function refreshText() {
    sampleCoordinates();

    particles = textureCoordinates.map((c, cIdx) => {
        const x = c.x * fontScaleFactor;
        const y = c.y * fontScaleFactor;
        let p = (c.old && particles[cIdx]) ? particles[cIdx] : new Particle([x, y]);
        if (c.toDelete) {
            p.toDelete = true;
            p.scale = p.maxScale;
        }
        return p;
    });

    recreateInstancedMesh();
    makeTextFitScreen();
    updateCursorPosition();
}

// ---------------------------------------------------------------
// Input string to textureCoordinates

function sampleCoordinates() {

    // Draw text
    const lines = string.split(`\n`);
    const linesNumber = lines.length;
    textCanvas.width = stringBox.wTexture;
    textCanvas.height = stringBox.hTexture;
    textCtx.font = '100 ' + textureFontSize + 'px ' + fontName;
    textCtx.fillStyle = '#2a9d8f';
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    for (let i = 0; i < linesNumber; i++) {
        textCtx.fillText(lines[i], 0, (i + .8) * stringBox.hTexture / linesNumber);
    }

    // Sample coordinates
    if (stringBox.wTexture > 0) {

        // Image data to 2d array
        const imageData = textCtx.getImageData(0, 0, textCanvas.width, textCanvas.height);
        const imageMask = Array.from(Array(textCanvas.height), () => new Array(textCanvas.width));
        for (let i = 0; i < textCanvas.height; i++) {
            for (let j = 0; j < textCanvas.width; j++) {
                imageMask[i][j] = imageData.data[(j + i * textCanvas.width) * 4] > 0;
            }
        }

        if (textureCoordinates.length !== 0) {

            // Clean up: delete coordinates and particles which disappeared on the prev step
            // We need to keep same indexes for coordinates and particles to reuse old particles properly
            textureCoordinates = textureCoordinates.filter(c => !c.toDelete);
            particles = particles.filter(c => !c.toDelete);

            // Go through existing coordinates (old to keep, toDelete for fade-out animation)
            textureCoordinates.forEach(c => {
                if (imageMask[c.y]) {
                    if (imageMask[c.y][c.x]) {
                        c.old = true;
                        if (!c.toDelete) {
                            imageMask[c.y][c.x] = false;
                        }
                    } else {
                        c.toDelete = true;
                    }
                } else {
                    c.toDelete = true;
                }
            });
        }

        // Add new coordinates
        for (let i = 0; i < textCanvas.height; i++) {
            for (let j = 0; j < textCanvas.width; j++) {
                if (imageMask[i][j]) {
                    textureCoordinates.push({
                        x: j,
                        y: i,
                        old: false,
                        toDelete: false
                    })
                }
            }
        }

    } else {
        textureCoordinates = [];
    }
}


// ---------------------------------------------------------------
// Handling params of each particle

function Particle([x, y]) {
    this.x = x + .1 * (Math.random() - .5);
    this.y = y + .1 * (Math.random() - .5);
    this.z = 0;

    this.isGrowing = true;
    this.toDelete = false;

    this.scale = 0;
    this.maxScale = 20 * (.2 + Math.pow(Math.random(), 5));
    this.deltaScale = 1;

    this.grow = function () {
        if (this.isGrowing) {
            this.deltaScale *= .99;
            this.scale += this.deltaScale;
            if (this.scale >= this.maxScale) {
                this.isGrowing = false;
            }
        }
        if (this.toDelete) {
            this.deltaScale *= 1.1;
            this.scale -= this.deltaScale;
            if (this.scale <= 0) {
                this.scale = 0;
            }
        }
    }
}

// ---------------------------------------------------------------
// Handle instances

function recreateInstancedMesh() {
    scene.remove(instancedMesh);
    instancedMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, particles.length);
    scene.add(instancedMesh);

    instancedMesh.position.x = -.5 * stringBox.wScene;
    instancedMesh.position.y = -.6 * stringBox.hScene;

    instancedMesh.castShadow = true;
}

function updateParticlesMatrices() {
    let idx = 0;
    particles.forEach(p => {
        p.grow();
        dummy.position.set(p.x, stringBox.hScene - p.y, p.z);
        dummy.lookAt(intersect);
        dummy.rotation.y = Math.max(dummy.rotation.y, -1)
        dummy.rotation.y = Math.min(dummy.rotation.y, 1)
        dummy.scale.set(p.scale, p.scale, p.scale);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(idx, dummy.matrix);
        idx ++;
    })
    instancedMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------
// Move camera so the text is always visible

function makeTextFitScreen() {
    const fov = camera.fov * (Math.PI / 180);
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
    const dx = Math.abs(.7 * stringBox.wScene / Math.tan(.5 * fovH));
    const dy = Math.abs(.6 * stringBox.hScene / Math.tan(.5 * fov));
    const factor = Math.max(dx, dy) / camera.position.length();
    if (factor > 1) {
        camera.position.x *= factor;
        camera.position.y *= factor;
        camera.position.z *= factor;
    }
}

// ---------------------------------------------------------------
// Cursor related

function updateCursorPosition() {
    cursorMesh.position.x = -.5 * stringBox.wScene + stringBox.caretPosScene[0];
    cursorMesh.position.y = .4 * stringBox.hScene - stringBox.caretPosScene[1];
}

function updateCursorOpacity() {
    let roundPulse = (t) => Math.sign(Math.sin(t * Math.PI)) * Math.pow(Math.sin((t % 1) * 3.14), .2);

    if (document.hasFocus() && document.activeElement === textInputEl) {
        cursorMesh.material.opacity = roundPulse(2 * clock.getElapsedTime());
    } else {
        cursorMesh.material.opacity = 0;
    }
}