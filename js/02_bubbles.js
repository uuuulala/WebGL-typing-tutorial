import * as THREE from "https://cdn.skypack.dev/three@0.133.1/build/three.module";
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/controls/OrbitControls'

// DOM selectors
const containerEl = document.querySelector('.container');
const textInputEl = document.querySelector('#text-input');

// Settings
const fontName = 'Verdana';
const textureFontSize = 80;
const fontScaleFactor = .06;

// We need to keep the style of editable <div> (hidden inout field) and canvas
textInputEl.style.fontSize = textureFontSize + 'px';
textInputEl.style.font = '100 ' + textureFontSize + 'px ' + fontName;
textInputEl.style.lineHeight = 1.1 * textureFontSize + 'px';

// 3D scene related globals
let scene, camera, renderer, textCanvas, textCtx, particleGeometry, particleMaterial, instancedMesh, dummy, clock, cursorMesh;

// String to show
let string = 'or with<div>bubbles!</div>';

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

textInputEl.innerHTML = string;
textInputEl.focus();

init();
createEvents();
setCaretToEndOfInput();
handleInput();
refreshText();
render();

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
    containerEl.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enablePan = false;

    textCanvas = document.createElement('canvas');
    textCanvas.width = textCanvas.height = 0;
    textCtx = textCanvas.getContext('2d');

    particleGeometry = new THREE.IcosahedronGeometry(.2, 3);
    particleMaterial = new THREE.ShaderMaterial({
        vertexShader: document.getElementById("vertexShader").textContent,
        fragmentShader: document.getElementById("fragmentShader").textContent,
        transparent: true,
    });

    dummy = new THREE.Object3D();
    clock = new THREE.Clock();

    const cursorGeometry = new THREE.BoxGeometry(.12, 4.5, .03);
    cursorGeometry.translate(.1, -2.2, 0)
    const cursorMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
    });
    cursorMesh = new THREE.Mesh(cursorGeometry, cursorMaterial);
    scene.add(cursorMesh);
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
            p.scale = 1;
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
    this.x = x + .2 * (Math.random() - .5);
    this.y = y + .2 * (Math.random() - .5);
    this.z = 0;
    this.scale = .1 * Math.random();
    this.maxScale = Math.pow(Math.random(), 3);

    this.deltaScale = .1 * .1 * Math.random();

    this.toDelete = false;

    this.isFlying = Math.random() < .06;

    this.grow = function () {
        this.scale += this.deltaScale;
        if (this.scale >= this.maxScale) {
            this.scale = 0;
        } else if (this.toDelete) {
            this.deltaScale += .5;
        }
        if (this.isFlying) {
            this.y -= (7 * this.deltaScale);
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
}

function updateParticlesMatrices() {
    let idx = 0;
    particles.forEach(p => {
        p.grow();
        dummy.scale.set(p.scale, p.scale, p.scale);
        dummy.position.set(p.x, stringBox.hScene - p.y, p.z);
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
        cursorMesh.material.opacity = .3 * roundPulse(2 * clock.getElapsedTime());
    } else {
        cursorMesh.material.opacity = 0;
    }
}