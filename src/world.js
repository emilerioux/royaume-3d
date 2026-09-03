/* Le décor : procédural, style « stylisé doux » (formes arrondies, ombrage lisse,
   palette chaude). Les vrais packs de modèles low-poly viendront remplacer ces
   volumes à l'étape suivante — l'API (buildWorld -> { update, colliders }) ne change pas. */

import * as THREE from "three";

const C = {
  grassLo: 0x6f8347, grassHi: 0x8fa65c, path: 0xbfa478,
};

export function buildWorld(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const trees = [];

  // ---------------------------------------------------------------- sol vallonné
  const G = 120, SEG = 96;
  const gGeo = new THREE.PlaneGeometry(G, G, SEG, SEG);
  gGeo.rotateX(-Math.PI / 2);
  const pos = gGeo.attributes.position;
  const colors = [];
  const cLo = new THREE.Color(C.grassLo), cHi = new THREE.Color(C.grassHi), cPath = new THREE.Color(C.path);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = Math.sin(x * 0.09) * Math.cos(z * 0.08) * 0.7
          + Math.sin(x * 0.03 + z * 0.05) * 0.5
          + Math.sin(z * 0.13) * 0.25;
    const onPath = Math.abs(x) < 1.9;
    if (onPath) h *= 0.12;
    if (Math.hypot(x, z) < 6) h *= 0.2;               // place du village aplatie
    pos.setY(i, h);
    const c = onPath
      ? cPath.clone().multiplyScalar(0.94 + Math.random() * 0.08)
      : cLo.clone().lerp(cHi, THREE.MathUtils.clamp(h * 0.4 + 0.45, 0, 1));
    colors.push(c.r, c.g, c.b);
  }
  gGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(
    gGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
  );
  ground.receiveShadow = true;
  group.add(ground);

  // ---------------------------------------------------------------- maisons
  const mkMat = (col, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: col, roughness: r, metalness: m });
  const wood = mkMat(0x6b4a30, 0.9);
  const plaster = mkMat(0xdac9a6, 0.95);
  const HOUSES = [
    { x: -7, z: -4, rot: 0.22, roof: 0xb0704a },
    { x: 7.5, z: -7, rot: -0.34, roof: 0x8a5f7c },
    { x: -8, z: 6, rot: 0.12, roof: 0x6f8a6a },
    { x: 8, z: 5, rot: -0.2, roof: 0xc39a58 },
  ];
  for (const h of HOUSES) {
    const gg = new THREE.Group();
    gg.position.set(h.x, 0, h.z);
    gg.rotation.y = h.rot;

    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.3, 3.4), plaster);
    body.position.y = 1.15; body.castShadow = true; body.receiveShadow = true;
    gg.add(body);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.7, 4), mkMat(h.roof, 0.8));
    roof.position.y = 3.15; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    gg.add(roof);

    // poutres d'angle
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), wood);
      beam.position.set(sx * 1.45, 1.15, sz * 1.65);
      gg.add(beam);
    }

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.45, 0.16), mkMat(0x3a2616, 0.9));
    door.position.set(0, 0.75, 1.72);
    gg.add(door);

    for (const wx of [-0.85, 0.85]) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.62, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xffe0a6, emissive: 0xffbf66, emissiveIntensity: 0.5, roughness: 0.6 })
      );
      win.position.set(wx, 1.45, 1.72);
      gg.add(win);
    }

    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.1, 0.42), mkMat(0x6a5848, 0.95));
    chim.position.set(0.9, 3.1, -0.7); chim.castShadow = true;
    gg.add(chim);

    group.add(gg);
    colliders.push({ x: h.x, z: h.z, r: 2.5 });
  }

  // ---------------------------------------------------------------- puits (place du village)
  {
    const gg = new THREE.Group();
    gg.position.set(0, 0, 2.6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.18, 8, 18), mkMat(0xa9a08a, 0.95));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.55; ring.castShadow = true;
    gg.add(ring);
    for (const px of [-0.58, 0.58]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), wood);
      post.position.set(px, 0.8, 0); post.castShadow = true;
      gg.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.66, 4), mkMat(0xb0704a, 0.8));
    roof.position.y = 1.9; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    gg.add(roof);
    group.add(gg);
    colliders.push({ x: 0, z: 2.6, r: 1.0 });
  }

  // ---------------------------------------------------------------- arbres
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.15, 6);
  const trunkMat = mkMat(0x5c4327, 0.95);
  const folMats = [mkMat(0x4f7a3e, 0.9), mkMat(0x5f8f4a, 0.9), mkMat(0x6fa055, 0.9)];
  const placed = [];
  for (let n = 0; n < 17; n++) {
    const a = Math.random() * Math.PI * 2;
    const r = 11 + Math.random() * 34;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 3.2) continue;
    let ok = true;
    for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < 3.4) ok = false;
    for (const p of placed) if (Math.hypot(x - p[0], z - p[1]) < 3) ok = false;
    if (!ok) continue;
    placed.push([x, z]);

    const tg = new THREE.Group();
    tg.position.set(x, 0, z);
    const s = 0.85 + Math.random() * 0.8;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.setScalar(s); trunk.position.y = 0.57 * s; trunk.castShadow = true;
    tg.add(trunk);
    const fol = new THREE.Group();
    fol.position.y = 1.35 * s;
    const fm = folMats[(Math.random() * folMats.length) | 0];
    const f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95 * s, 1), fm);
    f1.castShadow = true; fol.add(f1);
    const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62 * s, 1), fm);
    f2.position.set(0.3 * s, 0.5 * s, 0.12 * s); f2.castShadow = true; fol.add(f2);
    tg.add(fol);
    tg.userData = { fol, seed: Math.random() * 9, base: fol.rotation.z };
    group.add(tg);
    trees.push(tg);
    colliders.push({ x, z, r: 0.7 });
  }

  // ---------------------------------------------------------------- rochers
  const rockMat = mkMat(0x8a8a82, 0.98);
  for (let n = 0; n < 7; n++) {
    const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 32;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 3) continue;
    const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + Math.random() * 0.4, 0), rockMat);
    rk.position.set(x, 0.15, z);
    rk.rotation.set(Math.random(), Math.random(), Math.random());
    rk.castShadow = true; rk.receiveShadow = true;
    group.add(rk);
  }

  // ---------------------------------------------------------------- touffes d'herbe (InstancedMesh, léger)
  {
    const N = 170;
    const blade = new THREE.ConeGeometry(0.03, 0.22, 3);
    const im = new THREE.InstancedMesh(blade, mkMat(0x7d9a4c, 1), N);
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      d.position.set(x, 0.1, z);
      d.rotation.y = Math.random() * Math.PI;
      d.scale.setScalar(0.7 + Math.random() * 0.8);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.receiveShadow = false; im.castShadow = false;
    group.add(im);
  }

  return {
    colliders,
    update(dt, t) {
      for (const tg of trees) {
        tg.userData.fol.rotation.z = Math.sin(t * 1.1 + tg.userData.seed) * 0.045;
        tg.userData.fol.rotation.x = Math.cos(t * 0.9 + tg.userData.seed) * 0.03;
      }
    },
  };
}
