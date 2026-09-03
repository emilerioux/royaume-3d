/* Effets : poussière sous les pas et traînée lumineuse de la lame.
   Tout est en additif et sans écriture de profondeur : léger pour le téléphone. */

import * as THREE from "three";

// ---------------------------------------------------------------- poussière
export class Dust {
  constructor(scene, max = 36) {
    this.max = max;
    this.next = 0;
    this.parts = [];
    const geo = new THREE.CircleGeometry(0.5, 8);
    geo.rotateX(-Math.PI / 2);                      // à plat sur le sol
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.5,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);

    this._d = new THREE.Object3D();
    for (let i = 0; i < max; i++) {
      this.parts.push({ x: 0, y: -99, z: 0, t: 1, life: 1, r: 0, col: new THREE.Color() });
      this._d.position.set(0, -99, 0);
      this._d.updateMatrix();
      this.mesh.setMatrixAt(i, this._d.matrix);
    }
  }

  // kind : "terre" ou "herbe"
  spawn(x, y, z, kind) {
    const p = this.parts[this.next];
    this.next = (this.next + 1) % this.max;
    p.x = x + (Math.random() - 0.5) * 0.16;
    p.y = y + 0.04;
    p.z = z + (Math.random() - 0.5) * 0.16;
    p.t = 0;
    p.life = 0.5 + Math.random() * 0.25;
    p.r = 0.16 + Math.random() * 0.08;
    if (kind === "terre") p.col.setRGB(0.55, 0.45, 0.30);
    else p.col.setRGB(0.34, 0.44, 0.20);
  }

  update(dt) {
    const d = this._d;
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (p.t >= p.life) continue;
      p.t += dt;
      dirty = true;
      const k = Math.min(1, p.t / p.life);
      const fade = 1 - k;
      const s = p.r * (1 + k * 2.6);
      d.position.set(p.x, p.y + k * 0.22, p.z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(k >= 1 ? 0.0001 : s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      const f = fade * fade * 0.9;
      this.mesh.instanceColor.setXYZ(i, p.col.r * f, p.col.g * f, p.col.b * f);
    }
    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------- traînée de lame
export class BladeTrail {
  constructor(scene, samples = 12) {
    this.n = samples;
    this.on = false;
    this.fill = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(samples * 2 * 3);
    this.col = new Float32Array(samples * 2 * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    const idx = [];
    for (let i = 0; i < samples - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  start() { this.on = true; this.fill = 0; this.mesh.visible = true; }
  stop() { this.on = false; }

  // base et tip : Object3D placés sur la lame
  update(baseObj, tipObj) {
    if (!this.on && this.fill <= 0) { this.mesh.visible = false; return; }
    const n = this.n;
    // décale l'historique d'un cran
    this.pos.copyWithin(0, 6);
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);                       // 0 = plus vieux, 1 = actuel
      const a = f * f * (this.on ? 1 : 0.35);
      this.col[i * 6 + 0] = 1.0 * a; this.col[i * 6 + 1] = 0.96 * a; this.col[i * 6 + 2] = 0.80 * a;
      this.col[i * 6 + 3] = 0.75 * a; this.col[i * 6 + 4] = 0.85 * a; this.col[i * 6 + 5] = 1.0 * a;
    }
    if (this.on) {
      baseObj.getWorldPosition(this._a);
      tipObj.getWorldPosition(this._b);
      this.fill = Math.min(n, this.fill + 1);
    } else {
      // on laisse la traînée se résorber sur elle-même
      this._a.fromArray(this.pos, (n - 1) * 6);
      this._b.fromArray(this.pos, (n - 1) * 6 + 3);
      this.fill -= 1;
      if (this.fill <= 0) { this.mesh.visible = false; }
    }
    const o = (n - 1) * 6;
    this.pos[o] = this._a.x; this.pos[o + 1] = this._a.y; this.pos[o + 2] = this._a.z;
    this.pos[o + 3] = this._b.x; this.pos[o + 4] = this._b.y; this.pos[o + 5] = this._b.z;

    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
