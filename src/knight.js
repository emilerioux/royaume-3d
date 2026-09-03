/* Le chevalier : entièrement construit et animé à la main (pas de modèle importé).
   Une petite hiérarchie d'articulations + des cycles d'animation procéduraux
   (repos / marche / course / coup d'épée). Rendu lisse (pas de flat shading). */

import * as THREE from "three";

const COL = {
  steel: 0xaeb7c2, steelDark: 0x6b7580,
  tunic: 0x3f6cae, tunicDark: 0x2d4f83,
  leather: 0x6b4f33, leatherDark: 0x4a3722,
  skin: 0xdcab7f, gold: 0xc99a3f,
  cape: 0x8c3f3a, plume: 0xd0654f,
};

const WALK_SPEED = 2.4;   // m/s
const RUN_SPEED = 5.2;
const ATK_DUR = 0.52;     // s

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.62,
    metalness: opts.metal ?? 0.18,
  });
}
function part(geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Knight {
  constructor() {
    this.root = new THREE.Group();
    this.yaw = 0;
    this.phase = 0;
    this.gait = 0;          // 0 repos … 1 marche … ~2 course
    this.attackT = 0;
    this.t = 0;

    const mS = mat(COL.steel, { rough: 0.42, metal: 0.35 });
    const mSD = mat(COL.steelDark, { rough: 0.5, metal: 0.3 });
    const mT = mat(COL.tunic, { rough: 0.8, metal: 0 });
    const mL = mat(COL.leather, { rough: 0.85, metal: 0 });
    const mSkin = mat(COL.skin, { rough: 0.7, metal: 0 });
    const mGold = mat(COL.gold, { rough: 0.35, metal: 0.55 });
    const mCape = mat(COL.cape, { rough: 0.9, metal: 0 });
    const mPlume = mat(COL.plume, { rough: 0.8, metal: 0 });

    // --- squelette
    const body = joint(this.root, 0, -0.06, 0);   // pose les pieds au sol
    this.body = body;
    const hips = joint(body, 0, 0.98, 0);
    const spine = joint(hips, 0, 0.15, 0);
    const chest = joint(spine, 0, 0.26, 0);
    const neck = joint(chest, 0, 0.20, 0);
    const headJ = joint(neck, 0, 0.13, 0);
    this.hips = hips; this.spine = spine; this.chest = chest; this.headJ = headJ;

    const shL = joint(chest, -0.22, 0.09, 0);
    const shR = joint(chest, 0.22, 0.09, 0);
    const elL = joint(shL, 0, -0.28, 0);
    const elR = joint(shR, 0, -0.28, 0);
    this.shL = shL; this.shR = shR; this.elL = elL; this.elR = elR;

    const thL = joint(hips, -0.12, -0.06, 0);
    const thR = joint(hips, 0.12, -0.06, 0);
    const knL = joint(thL, 0, -0.46, 0);
    const knR = joint(thR, 0, -0.46, 0);
    this.thL = thL; this.thR = thR; this.knL = knL; this.knR = knR;

    const capeA = joint(chest, 0, 0.05, -0.15);
    const capeB = joint(capeA, 0, -0.27, 0);
    const capeC = joint(capeB, 0, -0.25, 0);
    this.capeA = capeA; this.capeB = capeB; this.capeC = capeC;

    const plumeJ = joint(headJ, 0, 0.10, -0.06);
    this.plumeJ = plumeJ;

    // --- volumes (capsules = allure douce)
    // bassin + torse
    const pelvis = part(new THREE.CapsuleGeometry(0.16, 0.16, 6, 12), mL);
    pelvis.position.y = -0.05; pelvis.scale.z = 0.9; hips.add(pelvis);
    const torso = part(new THREE.CapsuleGeometry(0.185, 0.34, 6, 14), mT);
    torso.position.y = 0.0; chest.add(torso);
    // plastron : coque lisse par-dessus le torse
    const cuir = part(new THREE.SphereGeometry(0.2, 20, 16), mS);
    cuir.scale.set(0.94, 1.06, 0.82); cuir.position.y = 0.02; chest.add(cuir);
    // ceinture dorée
    const belt = part(new THREE.TorusGeometry(0.185, 0.032, 8, 20), mGold);
    belt.rotation.x = Math.PI / 2; hips.add(belt);

    // épaulières
    const pauld = new THREE.SphereGeometry(0.092, 14, 12);
    const pL = part(pauld, mS); pL.scale.set(1.1, 0.8, 1.05); shL.add(pL);
    const pR = part(pauld, mS); pR.scale.set(1.1, 0.8, 1.05); shR.add(pR);
    // bras
    const uaL = part(new THREE.CapsuleGeometry(0.058, 0.20, 5, 10), mT); uaL.position.y = -0.14; shL.add(uaL);
    const uaR = part(new THREE.CapsuleGeometry(0.058, 0.20, 5, 10), mT); uaR.position.y = -0.14; shR.add(uaR);
    const faL = part(new THREE.CapsuleGeometry(0.052, 0.18, 5, 10), mSD); faL.position.y = -0.13; elL.add(faL);
    const faR = part(new THREE.CapsuleGeometry(0.052, 0.18, 5, 10), mSD); faR.position.y = -0.13; elR.add(faR);
    elL.add(part(new THREE.SphereGeometry(0.062, 10, 8), mL)).position.y = -0.26;
    this.handR = joint(elR, 0, -0.26, 0);
    this.handR.add(part(new THREE.SphereGeometry(0.062, 10, 8), mL));

    // jambes
    const thighL = part(new THREE.CapsuleGeometry(0.088, 0.24, 5, 10), mL); thighL.position.y = -0.16; thL.add(thighL);
    const thighR = part(new THREE.CapsuleGeometry(0.088, 0.24, 5, 10), mL); thighR.position.y = -0.16; thR.add(thighR);
    const shinL = part(new THREE.CapsuleGeometry(0.072, 0.26, 5, 10), mSD); shinL.position.y = -0.17; knL.add(shinL);
    const shinR = part(new THREE.CapsuleGeometry(0.072, 0.26, 5, 10), mSD); shinR.position.y = -0.17; knR.add(shinR);
    const footL = part(new THREE.BoxGeometry(0.12, 0.08, 0.24), mL); footL.position.set(0, -0.34, 0.05); knL.add(footL);
    const footR = part(new THREE.BoxGeometry(0.12, 0.08, 0.24), mL); footR.position.set(0, -0.34, 0.05); knR.add(footR);

    // tête + heaume (dôme lisse, ouvert devant)
    neck.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), mSkin));
    headJ.add(part(new THREE.SphereGeometry(0.115, 16, 14), mSkin));
    const helm = part(new THREE.SphereGeometry(0.138, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.74), mS);
    helm.position.y = 0.012; headJ.add(helm);
    const comb = part(new THREE.BoxGeometry(0.028, 0.05, 0.24), mGold);
    comb.position.y = 0.115; headJ.add(comb);
    // panache
    const plume = part(new THREE.CapsuleGeometry(0.03, 0.20, 4, 8), mPlume);
    plume.position.y = 0.12; plume.rotation.x = -0.5; plumeJ.add(plume);

    // cape (3 segments souples)
    const cw = [0.34, 0.30, 0.24], ch = [0.28, 0.26, 0.22];
    [[capeA, 0], [capeB, 1], [capeC, 2]].forEach(([j, i]) => {
      const seg = part(new THREE.BoxGeometry(cw[i], ch[i], 0.02), mCape);
      seg.material.side = THREE.DoubleSide;
      seg.position.y = -ch[i] / 2;
      seg.castShadow = true;
      j.add(seg);
    });

    // épée dans le dos
    const scab = joint(chest, -0.03, 0.02, -0.17);
    scab.rotation.set(-0.28, 0, 0.5);
    this.scab = scab;
    const blade = part(new THREE.BoxGeometry(0.05, 0.86, 0.13), mS); blade.position.y = 0.42; scab.add(blade);
    const guard = part(new THREE.BoxGeometry(0.24, 0.05, 0.17), mGold); scab.add(guard);
    const grip = part(new THREE.CylinderGeometry(0.028, 0.028, 0.15, 8), mL); grip.position.y = -0.10; scab.add(grip);
    const pommel = part(new THREE.SphereGeometry(0.038, 10, 8), mGold); pommel.position.y = -0.18; scab.add(pommel);

    // repères neutres
    this._neutral();
  }

  _neutral() {
    this.spine.rotation.set(0.04, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.shL.rotation.set(0, 0, 0.06);
    this.shR.rotation.set(0, 0, -0.06);
    this.elL.rotation.set(-0.15, 0, 0);
    this.elR.rotation.set(-0.15, 0, 0);
  }

  triggerAttack() {
    if (this.attackT <= 0) this.attackT = ATK_DUR;
  }

  /* cmd = { dir:{x,z} normalisé ou {0,0}, moving:bool, speed:m/s } */
  update(dt, cmd) {
    this.t += dt;
    this._neutral();

    // orientation
    if (cmd.moving && (cmd.dir.x || cmd.dir.z)) {
      const want = Math.atan2(cmd.dir.x, cmd.dir.z);
      this.yaw = lerpAngle(this.yaw, want, 1 - Math.pow(0.000002, dt));
    }
    this.root.rotation.y = this.yaw;

    // allure : 0 repos, ~1 marche, ~2 course
    const targetGait = cmd.moving
      ? THREE.MathUtils.clamp(cmd.speed / WALK_SPEED, 0.4, RUN_SPEED / WALK_SPEED)
      : 0;
    this.gait += (targetGait - this.gait) * Math.min(1, dt * 9);
    const g = this.gait;
    const runBlend = THREE.MathUtils.clamp((g - 1) / (RUN_SPEED / WALK_SPEED - 1), 0, 1);

    // cadence du pas
    const cad = 5.0 + g * 3.2;
    if (g > 0.05) this.phase += dt * cad;
    const sw = Math.sin(this.phase);
    const sw2 = Math.sin(this.phase * 2);
    const amp = Math.min(1, g) + runBlend * 0.5;

    // --- jambes
    this.thL.rotation.x = sw * 0.52 * amp;
    this.thR.rotation.x = -sw * 0.52 * amp;
    this.knL.rotation.x = Math.max(0, -sw) * (0.75 + runBlend * 0.5) * amp;
    this.knR.rotation.x = Math.max(0, sw) * (0.75 + runBlend * 0.5) * amp;

    // --- bassin / torse
    this.body.position.y = Math.abs(sw2) * 0.045 * Math.min(1.2, g)
      + (g < 0.06 ? Math.sin(this.t * 1.6) * 0.006 : 0);
    this.hips.rotation.y = sw * 0.14 * Math.min(1, g);
    this.chest.rotation.y = -sw * 0.08 * Math.min(1, g);
    this.spine.rotation.x = 0.04 + g * 0.10 + runBlend * 0.14;
    this.hips.rotation.z = g < 0.06 ? Math.sin(this.t * 0.8) * 0.02 : 0;

    // --- bras (si pas en pleine attaque)
    const atk = this.attackT;
    if (atk <= 0 || atk > ATK_DUR * 0.85) {
      this.shL.rotation.x = -sw * (0.34 * amp) - 0.05;
      this.shR.rotation.x = sw * (0.34 * amp) - 0.05;
      this.elL.rotation.x = -0.18 - Math.max(0, sw) * 0.4 * amp;
      this.elR.rotation.x = -0.18 - Math.max(0, -sw) * 0.4 * amp;
    }

    // --- coup d'épée (haut du corps)
    if (atk > 0) {
      this.attackT -= dt;
      const p = 1 - this.attackT / ATK_DUR;   // 0 → 1
      let arm, ez, cy;
      if (p < 0.32) {                          // armé
        const k = p / 0.32;
        arm = -1.7 * k; ez = -0.5 * k; cy = -0.35 * k;
      } else if (p < 0.60) {                   // frappe
        const k = (p - 0.32) / 0.28;
        arm = THREE.MathUtils.lerp(-1.7, 1.0, k);
        ez = THREE.MathUtils.lerp(-0.5, 0.25, k);
        cy = THREE.MathUtils.lerp(-0.35, 0.55, k);
        this.body.position.z = 0;              // (lunge géré côté main.js si besoin)
      } else {                                 // retour
        const k = (p - 0.60) / 0.40;
        arm = THREE.MathUtils.lerp(1.0, 0, k);
        ez = THREE.MathUtils.lerp(0.25, 0, k);
        cy = THREE.MathUtils.lerp(0.55, 0, k);
      }
      this.shR.rotation.x = arm;
      this.shR.rotation.z = -0.06 + ez;
      this.elR.rotation.x = -0.9 + Math.max(0, arm) * 0.4;
      this.chest.rotation.y = cy;
      this.spine.rotation.x = 0.04 + g * 0.10 + 0.12;
    }

    // --- cape : suit l'allure + flottement
    const flow = 0.16 + g * 0.34 + runBlend * 0.2;
    this.capeA.rotation.x = flow + Math.sin(this.t * 5 + this.phase) * 0.05;
    this.capeB.rotation.x = flow * 0.7 + Math.sin(this.t * 5 + this.phase - 0.6) * 0.07;
    this.capeC.rotation.x = flow * 0.5 + Math.sin(this.t * 5 + this.phase - 1.2) * 0.09;
    this.capeA.rotation.y = sw * 0.06 * Math.min(1, g);

    // --- panache
    this.plumeJ.rotation.x = -0.18 - g * 0.22 + Math.sin(this.t * 6) * 0.09;
    this.plumeJ.rotation.z = Math.sin(this.t * 4.4 + 1) * 0.06;

    // --- tête : petit contre-mouvement
    this.headJ.rotation.y = -this.chest.rotation.y * 0.6;
    this.headJ.rotation.x = g < 0.06 ? Math.sin(this.t * 1.6 + 1) * 0.02 : -0.02 * g;
  }
}

export { WALK_SPEED, RUN_SPEED };
