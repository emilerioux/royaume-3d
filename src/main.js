/* Royaume 3D — première tranche jouable.
   Caméra diorama à angle fixe, joystick aligné sur l écran, décor stylisé doux, PWA hors ligne. */

import * as THREE from "three";
import { createInput } from "./input.js";
import { buildWorld } from "./world.js";
import { Knight, WALK_SPEED, RUN_SPEED } from "./knight.js";

const DEBUG = location.search.includes("debug");
const canvas = document.getElementById("c");
const uiEl = document.getElementById("ui");
const loaderEl = document.getElementById("loader");
const fpsEl = document.getElementById("fps");

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// récupération si le GPU perd le contexte (rare sur téléphone, mais on veut que ça reparte)
canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); });
canvas.addEventListener("webglcontextrestored", () => location.reload());

const scene = new THREE.Scene();

// ciel dégradé + brume douce
(() => {
  const cnv = document.createElement("canvas");
  cnv.width = 2; cnv.height = 256;
  const g = cnv.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#bcd6e6");
  grd.addColorStop(0.55, "#e0e4d6");
  grd.addColorStop(1, "#ecdfc4");
  g.fillStyle = grd; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
})();
scene.fog = new THREE.Fog(0xdcd9c8, 34, 92);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);

// ---------------------------------------------------------------- lumières
const hemi = new THREE.HemisphereLight(0xc6dbee, 0x5f5740, 1.05);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe7c4, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);
const SUN_OFF = new THREE.Vector3(14, 20, 9);

// ---------------------------------------------------------------- monde + chevalier
const world = buildWorld(scene);

const knight = new Knight();
knight.root.position.set(0, 0, -0.6);   // sur la place, au milieu du hameau
scene.add(knight.root);

const input = createInput(canvas, document.getElementById("joy"), document.getElementById("btn-attack"));

// ---------------------------------------------------------------- caméra « diorama » : angle FIXE, elle suit sans jamais tourner
const CAM_BASE = new THREE.Vector3(0, 13, 16);  // l'ANGLE (hauteur/recul) ne change jamais
const CAM_OFF = CAM_BASE.clone();               // seule la distance s'adapte au format d'écran
const camPos = new THREE.Vector3().copy(knight.root.position).add(CAM_OFF);
const camGoal = new THREE.Vector3();
camera.position.copy(camPos);

// ---------------------------------------------------------------- helpers
const moveDir = new THREE.Vector3();
const WORLD_R = 46;

function step(dt) {
  // --- entrée : le joystick est aligné sur l'ÉCRAN, pas sur le chevalier.
  //     Haut = vers le haut de l'écran, toujours. C'est ce qui rend ça prévisible.
  const mv = input.move;
  const kp = knight.root.position;

  moveDir.set(mv.x, 0, mv.y);
  const mag = Math.min(1, moveDir.length());
  const moving = mag > 0.08;
  let speed = 0;
  if (moving) {
    moveDir.normalize();
    speed = mag < 0.62 ? WALK_SPEED : RUN_SPEED;
    kp.addScaledVector(moveDir, speed * dt);
  }

  // --- limites + collisions douces
  const rr = Math.hypot(kp.x, kp.z);
  if (rr > WORLD_R) { kp.x *= WORLD_R / rr; kp.z *= WORLD_R / rr; }
  for (const c of world.colliders) {
    const dx = kp.x - c.x, dz = kp.z - c.z, d = Math.hypot(dx, dz);
    const min = c.r + 0.35;
    if (d < min && d > 1e-3) { kp.x = c.x + (dx / d) * min; kp.z = c.z + (dz / d) * min; }
  }

  // --- attaque
  if (input.consumeAttack()) knight.triggerAttack();

  // --- chevalier
  knight.update(dt, { dir: { x: moveDir.x, z: moveDir.z }, moving, speed });

  // --- caméra : décalage constant -> l'orientation ne change JAMAIS, elle glisse seulement
  camGoal.copy(kp).add(CAM_OFF);
  camPos.lerp(camGoal, 1 - Math.pow(0.0009, dt));
  camera.position.copy(camPos);
  camera.lookAt(camPos.x - CAM_OFF.x, camPos.y - CAM_OFF.y + 1.1, camPos.z - CAM_OFF.z);

  // --- une maison qui cache le chevalier s'efface en fondu (sinon on le perd de vue)
  for (const h of world.houses) {
    const inFront = h.z > kp.z && (h.z - kp.z) < 7 && Math.abs(h.x - kp.x) < 2.8;
    const target = inFront ? 0.3 : 1;
    h.fade += (target - h.fade) * Math.min(1, dt * 7);
    for (const m of h.mats) m.opacity = h.fade;
  }

  // --- soleil colle au joueur (ombres nettes et proches)
  sun.position.copy(kp).add(SUN_OFF);
  sun.target.position.copy(kp);
  sun.target.updateMatrixWorld();

  world.update(dt, performance.now() / 1000);
}

// ---------------------------------------------------------------- boucle
let last = performance.now();
let acc = 0, frames = 0, fpsT = 0;
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  step(dt);
  renderer.render(scene, camera);

  if (DEBUG) {
    frames++; fpsT += dt;
    if (fpsT >= 0.5) { fpsEl.textContent = Math.round(frames / fpsT) + " fps"; frames = 0; fpsT = 0; }
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- resize
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const asp = w / h;
  camera.aspect = asp;
  camera.updateProjectionMatrix();
  // en portrait l'écran est étroit : on recule (sans changer l'angle) pour voir autant de décor
  const k = THREE.MathUtils.clamp(0.82 / asp, 1, 1.9);
  CAM_OFF.copy(CAM_BASE).multiplyScalar(k);
}
window.addEventListener("resize", resize);
resize();
camPos.copy(knight.root.position).add(CAM_OFF);   // pas de zoom parasite au démarrage
camera.position.copy(camPos);

// ---------------------------------------------------------------- go
uiEl.hidden = false;
if (DEBUG) fpsEl.hidden = false;
requestAnimationFrame(loop);
requestAnimationFrame(() => { loaderEl.classList.add("gone"); setTimeout(() => loaderEl.remove(), 600); });

if ("serviceWorker" in navigator && !DEBUG) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
