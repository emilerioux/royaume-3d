/* Royaume 3D — première tranche jouable.
   Chevalier vu de dos, caméra qui suit dans le dos, décor stylisé doux, PWA hors ligne. */

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

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);

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
knight.root.position.set(0, 0, -6);
scene.add(knight.root);

const input = createInput(canvas, document.getElementById("joy"), document.getElementById("btn-attack"));

// ---------------------------------------------------------------- caméra qui suit dans le dos
let camYaw = 0;
let orbitExtra = 0;
const camPos = new THREE.Vector3();
const camGoal = new THREE.Vector3();
const CAM_DIST = 6.4, CAM_HEIGHT = 3.7;
{
  camYaw = knight.yaw;
  camPos.set(
    knight.root.position.x - Math.sin(camYaw) * CAM_DIST,
    CAM_HEIGHT,
    knight.root.position.z - Math.cos(camYaw) * CAM_DIST
  );
  camera.position.copy(camPos);
}

// ---------------------------------------------------------------- helpers
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), moveDir = new THREE.Vector3();
const WORLD_R = 46;

function step(dt) {
  // --- entrée -> direction dans le repère caméra
  const mv = input.move;
  const kp = knight.root.position;
  fwd.set(kp.x - camPos.x, 0, kp.z - camPos.z);
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
  fwd.normalize();
  right.set(fwd.z, 0, -fwd.x);

  moveDir.set(0, 0, 0).addScaledVector(fwd, -mv.y).addScaledVector(right, mv.x);
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

  // --- caméra
  orbitExtra += input.consumeOrbit();
  orbitExtra *= Math.pow(0.02, dt);           // revient doucement derrière
  let d = ((knight.yaw + orbitExtra) - camYaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  camYaw += d * (1 - Math.pow(0.0009, dt));

  camGoal.set(
    kp.x - Math.sin(camYaw) * CAM_DIST,
    CAM_HEIGHT,
    kp.z - Math.cos(camYaw) * CAM_DIST
  );
  camPos.lerp(camGoal, 1 - Math.pow(0.0016, dt));
  camera.position.copy(camPos);
  camera.lookAt(kp.x + Math.sin(camYaw) * 2.2, kp.y + 1.5, kp.z + Math.cos(camYaw) * 2.2);

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
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------- go
uiEl.hidden = false;
if (DEBUG) fpsEl.hidden = false;
requestAnimationFrame(loop);
requestAnimationFrame(() => { loaderEl.classList.add("gone"); setTimeout(() => loaderEl.remove(), 600); });

if ("serviceWorker" in navigator && !DEBUG) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
