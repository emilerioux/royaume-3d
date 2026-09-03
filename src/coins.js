/* Pièces d'or à ramasser dans le monde. En attendant les ennemis, c'est la
   source de revenu : on marche dessus, elles réapparaissent après un moment. */

import * as THREE from "three";
import { pathX } from "./world.js";

const RESPAWN = 22;      // s avant qu'une pièce revienne

export class Coins {
  constructor(scene, colliders, count = 20) {
    this.list = [];
    const geo = new THREE.CylinderGeometry(0.16, 0.16, 0.035, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe9be4a, roughness: 0.3, metalness: 0.75,
      emissive: 0x6a4c10, emissiveIntensity: 0.35,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this._d = new THREE.Object3D();

    let tries = 0;
    while (this.list.length < count && tries < 600) {
      tries++;
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 24;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let ok = true;
      for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.9) ok = false;
      if (!ok) continue;
      this.list.push({
        x, z, valeur: 5 + ((Math.random() * 3) | 0) * 5,
        pris: false, t: Math.random() * 6, repop: 0,
      });
    }
    this._refresh(0);
  }

  _refresh(t) {
    const d = this._d;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.pris) {
        d.position.set(0, -99, 0);
        d.scale.setScalar(0.001);
      } else {
        d.position.set(c.x, 0.42 + Math.sin(t * 2 + c.t) * 0.09, c.z);
        d.scale.setScalar(1);
      }
      d.rotation.set(Math.PI / 2, 0, t * 2.2 + c.t);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, t) {
    for (const c of this.list) {
      if (c.pris) {
        c.repop -= dt;
        if (c.repop <= 0) c.pris = false;
      }
    }
    this._refresh(t);
  }

  // renvoie l'or ramassé à cette position (0 si rien)
  tryCollect(x, z, rayon = 0.85) {
    let total = 0;
    for (const c of this.list) {
      if (c.pris) continue;
      if (Math.hypot(x - c.x, z - c.z) < rayon) {
        c.pris = true;
        c.repop = RESPAWN;
        total += c.valeur;
      }
    }
    return total;
  }
}
