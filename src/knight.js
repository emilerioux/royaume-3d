/* Le chevalier : entièrement construit et animé à la main (aucun modèle importé).
   Hiérarchie d'articulations + cycles procéduraux :
   repos (avec poses variées), marche, course, demi-tour, encaissement,
   et un enchaînement de trois coups d'épée avec dégainage. */

import * as THREE from "three";
import { TENUE_DEPART, COULEURS } from "./gear.js";

const COL = {
  steel: 0xaeb7c2, steelDark: 0x6b7580,
  tunic: 0x3f6cae,
  leather: 0x6b4f33,
  skin: 0xdcab7f, gold: 0xc99a3f,
  cape: 0x8c3f3a, plume: 0xd0654f,
};

const WALK_SPEED = 2.4;   // m/s
const RUN_SPEED = 5.2;

// les trois coups de l'enchaînement
const STAGES = [
  { dur: 0.46, hit: [0.30, 0.60] },   // taille diagonale
  { dur: 0.44, hit: [0.26, 0.56] },   // revers
  { dur: 0.54, hit: [0.30, 0.58] },   // estoc
];
const SHEATHE_DELAY = 1.7;            // s sans frapper avant de rengainer

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

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
  constructor(opts = {}) {
    this.root = new THREE.Group();
    this.onFootstep = opts.onFootstep || null;
    this.trail = opts.trail || null;
    this.loadout = Object.assign({}, TENUE_DEPART, opts.loadout || {});

    this.yaw = 0;
    this.phase = 0;
    this.gait = 0;
    this.t = 0;
    this.atk = null;
    this.queued = 0;
    this.combatT = 99;
    this.drawT = 0;         // 0 = épée dans le dos, 1 = épée en main
    this.hurtT = 0;
    this.turnT = 0;
    this.idleT = 0;
    this.idleAnim = null;
    this.nextIdle = 3 + Math.random() * 3;
    this.stepSign = 0;

    this.mats = [];
    const mk = (color, rough, metal) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      m.userData.baseEmissive = new THREE.Color(0x000000);
      this.mats.push(m);
      return m;
    };
    const mS = mk(COL.steel, 0.42, 0.35);
    const mSD = mk(COL.steelDark, 0.5, 0.3);
    const mT = mk(COL.tunic, 0.8, 0);
    const mL = mk(COL.leather, 0.85, 0);
    const mSkin = mk(COL.skin, 0.7, 0);
    const mGold = mk(COL.gold, 0.35, 0.55);
    const mCape = mk(COL.cape, 0.9, 0);
    this.matT = mT; this.matCape = mCape;
    const mPlume = mk(COL.plume, 0.8, 0);

    const part = (geo, material) => {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = true;
      return m;
    };

    // ---------------------------------------------------------------- squelette
    const body = joint(this.root, 0, -0.06, 0);
    this.body = body;
    const hips = joint(body, 0, 1.04, 0);
    const spine = joint(hips, 0, 0.17, 0);
    const chest = joint(spine, 0, 0.28, 0);
    const neck = joint(chest, 0, 0.21, 0);
    const headJ = joint(neck, 0, 0.13, 0);
    Object.assign(this, { hips, spine, chest, headJ });

    const shL = joint(chest, -0.205, 0.10, 0);
    const shR = joint(chest, 0.205, 0.10, 0);
    const elL = joint(shL, 0, -0.30, 0);
    const elR = joint(shR, 0, -0.30, 0);
    Object.assign(this, { shL, shR, elL, elR });

    const thL = joint(hips, -0.105, -0.06, 0);
    const thR = joint(hips, 0.105, -0.06, 0);
    const knL = joint(thL, 0, -0.50, 0);
    const knR = joint(thR, 0, -0.50, 0);
    Object.assign(this, { thL, thR, knL, knR });

    const plumeJ = joint(headJ, 0, 0.10, -0.06);
    this.plumeJ = plumeJ;

    // ---------------------------------------------------------------- volumes
    const pelvis = part(new THREE.CapsuleGeometry(0.145, 0.16, 6, 12), mL);
    pelvis.position.y = -0.05; pelvis.scale.z = 0.9; hips.add(pelvis);

    const torso = part(new THREE.CapsuleGeometry(0.163, 0.42, 6, 14), mT);
    chest.add(torso);
    const cuir = part(new THREE.SphereGeometry(0.183, 20, 16), mS);
    cuir.scale.set(0.95, 1.16, 0.80); cuir.position.y = 0.03; chest.add(cuir);
    const belt = part(new THREE.TorusGeometry(0.168, 0.03, 8, 20), mGold);
    belt.rotation.x = Math.PI / 2; hips.add(belt);

    const pauld = new THREE.SphereGeometry(0.082, 14, 12);
    const pL = part(pauld, mS); pL.scale.set(1.1, 0.8, 1.05); shL.add(pL);
    const pR = part(pauld, mS); pR.scale.set(1.1, 0.8, 1.05); shR.add(pR);

    const uaL = part(new THREE.CapsuleGeometry(0.052, 0.22, 5, 10), mT); uaL.position.y = -0.15; shL.add(uaL);
    const uaR = part(new THREE.CapsuleGeometry(0.052, 0.22, 5, 10), mT); uaR.position.y = -0.15; shR.add(uaR);
    const faL = part(new THREE.CapsuleGeometry(0.047, 0.20, 5, 10), mSD); faL.position.y = -0.14; elL.add(faL);
    const faR = part(new THREE.CapsuleGeometry(0.047, 0.20, 5, 10), mSD); faR.position.y = -0.14; elR.add(faR);
    const hL = part(new THREE.SphereGeometry(0.056, 10, 8), mL); hL.position.y = -0.28; elL.add(hL);
    this.handR = joint(elR, 0, -0.28, 0);
    this.handR.add(part(new THREE.SphereGeometry(0.056, 10, 8), mL));

    const thighL = part(new THREE.CapsuleGeometry(0.079, 0.28, 5, 10), mL); thighL.position.y = -0.18; thL.add(thighL);
    const thighR = part(new THREE.CapsuleGeometry(0.079, 0.28, 5, 10), mL); thighR.position.y = -0.18; thR.add(thighR);
    const shinL = part(new THREE.CapsuleGeometry(0.065, 0.30, 5, 10), mSD); shinL.position.y = -0.19; knL.add(shinL);
    const shinR = part(new THREE.CapsuleGeometry(0.065, 0.30, 5, 10), mSD); shinR.position.y = -0.19; knR.add(shinR);
    const footL = part(new THREE.BoxGeometry(0.12, 0.08, 0.24), mL); footL.position.set(0, -0.38, 0.05); knL.add(footL);
    const footR = part(new THREE.BoxGeometry(0.12, 0.08, 0.24), mL); footR.position.set(0, -0.38, 0.05); knR.add(footR);

    neck.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), mSkin));
    headJ.add(part(new THREE.SphereGeometry(0.104, 16, 14), mSkin));
    const helm = part(new THREE.SphereGeometry(0.127, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.74), mS);
    helm.position.y = 0.012; headJ.add(helm);
    const comb = part(new THREE.BoxGeometry(0.026, 0.045, 0.22), mGold);
    comb.position.y = 0.106; headJ.add(comb);
    const plume = part(new THREE.CapsuleGeometry(0.03, 0.20, 4, 8), mPlume);
    plume.position.y = 0.12; plume.rotation.x = -0.5; plumeJ.add(plume);

    // ---------------------------------------------------------------- cape souple (5 segments)
    this.capeSegs = [];
    const CW = [0.29, 0.27, 0.245, 0.21, 0.165];
    const CH = [0.17, 0.16, 0.15, 0.135, 0.115];
    let capeParent = joint(chest, 0, 0.05, -0.15);
    for (let i = 0; i < 5; i++) {
      const seg = i === 0 ? capeParent : joint(capeParent, 0, -CH[i - 1], 0);
      const m = part(new THREE.BoxGeometry(CW[i], CH[i], 0.02), mCape);
      m.material.side = THREE.DoubleSide;
      m.position.y = -CH[i] / 2;
      seg.add(m);
      this.capeSegs.push(seg);
      capeParent = seg;
    }
    this._capeBlasonHote = this.capeSegs[1];

    // ---------------------------------------------------------------- équipement achetable
    const mMail = mk(0x8d949c, 0.55, 0.45);
    const mBlas = mk(0xd8b24a, 0.5, 0.2);

    // visière : bandeau sur le visage + fente sombre + rivets
    const visor = new THREE.Group();
    const band = part(new THREE.BoxGeometry(0.19, 0.085, 0.035), mS);
    band.position.set(0, 0.005, 0.098); visor.add(band);
    const fente = part(new THREE.BoxGeometry(0.145, 0.022, 0.02), mSD);
    fente.position.set(0, 0.012, 0.118); visor.add(fente);
    for (const rx of [-0.075, 0.075]) {
      const riv = part(new THREE.SphereGeometry(0.014, 6, 5), mGold);
      riv.position.set(rx, -0.035, 0.105); visor.add(riv);
    }
    const nasal = part(new THREE.BoxGeometry(0.028, 0.13, 0.03), mS);
    nasal.position.set(0, -0.03, 0.104); visor.add(nasal);
    headJ.add(visor);
    this.eqVisor = visor;

    // écu au bras gauche
    const shield = new THREE.Group();
    const plate = part(new THREE.CylinderGeometry(0.19, 0.145, 0.045, 14), mS);
    plate.rotation.set(Math.PI / 2, 0, 0); shield.add(plate);
    const boss = part(new THREE.SphereGeometry(0.052, 10, 8), mGold);
    boss.position.z = 0.04; boss.scale.z = 0.6; shield.add(boss);
    const bord = part(new THREE.TorusGeometry(0.185, 0.018, 6, 18), mGold);
    shield.add(bord);
    shield.position.set(-0.11, -0.16, 0.07);
    shield.rotation.set(0.25, -0.35, 0.1);
    elL.add(shield);
    this.eqShield = shield;

    // jupe de mailles
    const skirt = part(new THREE.CylinderGeometry(0.185, 0.235, 0.26, 14, 1, true), mMail);
    skirt.material.side = THREE.DoubleSide;
    skirt.position.y = -0.15;
    hips.add(skirt);
    this.eqSkirt = skirt;

    // blason : torse + cape
    const blasTorse = part(new THREE.CircleGeometry(0.072, 12), mBlas);
    blasTorse.position.set(0, 0.02, 0.163);
    chest.add(blasTorse);
    this.eqBlazonChest = blasTorse;

    // ---------------------------------------------------------------- épée + ses deux emplacements
    const sword = new THREE.Group();
    this.sword = sword;
    body.add(sword);                       // placée chaque image entre dos et main
    const blade = part(new THREE.BoxGeometry(0.05, 0.86, 0.13), mS); blade.position.y = 0.42; sword.add(blade);
    const guard = part(new THREE.BoxGeometry(0.24, 0.05, 0.17), mGold); sword.add(guard);
    const grip = part(new THREE.CylinderGeometry(0.028, 0.028, 0.15, 8), mL); grip.position.y = -0.10; sword.add(grip);
    const pommel = part(new THREE.SphereGeometry(0.038, 10, 8), mGold); pommel.position.y = -0.18; sword.add(pommel);
    this.bladeBase = new THREE.Object3D(); this.bladeBase.position.y = 0.12; sword.add(this.bladeBase);
    this.bladeTip = new THREE.Object3D(); this.bladeTip.position.y = 0.88; sword.add(this.bladeTip);

    this.slotBack = new THREE.Object3D();
    this.slotBack.position.set(-0.03, 0.02, -0.17);
    this.slotBack.rotation.set(-0.28, 0, 0.5);
    chest.add(this.slotBack);

    // la lame prolonge l'avant-bras : le poing tient la garde, la pointe part vers l'avant
    this.slotHand = new THREE.Object3D();
    this.slotHand.position.set(0, -0.04, 0.02);
    this.slotHand.rotation.set(Math.PI * 0.94, 0, 0);
    this.handR.add(this.slotHand);

    // scratch
    this._pA = new THREE.Vector3(); this._pB = new THREE.Vector3();
    this._qA = new THREE.Quaternion(); this._qB = new THREE.Quaternion();
    this._inv = new THREE.Matrix4(); this._q = new THREE.Quaternion();

    const blasCape = part(new THREE.CircleGeometry(0.065, 12), mBlas);
    blasCape.position.set(0, -0.08, -0.022);
    blasCape.rotation.y = Math.PI;
    this._capeBlasonHote.add(blasCape);
    this.eqBlazonCape = blasCape;

    this.setLoadout(this.loadout);
    this._neutral();
  }

  // applique la tenue : pièces visibles + teintes
  setLoadout(lo) {
    this.loadout = Object.assign({}, this.loadout, lo || {});
    const L = this.loadout;
    this.eqVisor.visible = !!L.visiere;
    this.eqShield.visible = !!L.ecu;
    this.eqSkirt.visible = !!L.mailles;
    this.eqBlazonChest.visible = !!L.blason;
    this.eqBlazonCape.visible = !!L.blason;
    this.matT.color.setHex(COULEURS.tunique[L.tunique] ?? COULEURS.tunique.bleu);
    this.matCape.color.setHex(COULEURS.cape[L.cape] ?? COULEURS.cape.laine);
  }

  _neutral() {
    this.spine.rotation.set(0.04, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.hips.rotation.set(0, 0, 0);
    this.headJ.rotation.set(0, 0, 0);
    this.shL.rotation.set(0, 0, 0.06);
    this.shR.rotation.set(0, 0, -0.06);
    this.elL.rotation.set(-0.15, 0, 0);
    this.elR.rotation.set(-0.15, 0, 0);
    this.body.rotation.set(0, 0, 0);
  }

  triggerAttack() {
    if (!this.atk) {
      this.atk = { stage: 0, t: 0, dur: STAGES[0].dur };
    } else {
      const p = this.atk.t / this.atk.dur;
      if (p > 0.28 && this.atk.stage < STAGES.length - 1) this.queued = this.atk.stage + 1;
    }
    this.combatT = 0;
    this.idleT = 0; this.idleAnim = null;
  }

  hurt() {
    this.hurtT = 0.5;
    this.idleT = 0; this.idleAnim = null;
  }

  /* cmd = { dir:{x,z}, moving, speed, turning, braking } */
  update(dt, cmd) {
    this.t += dt;
    this._neutral();

    // ---------------------------------------------------------------- orientation
    if (cmd.moving && (cmd.dir.x || cmd.dir.z)) {
      const want = Math.atan2(cmd.dir.x, cmd.dir.z);
      const rate = this.turnT > 0 ? 0.0000002 : 0.000002;
      this.yaw = lerpAngle(this.yaw, want, 1 - Math.pow(rate, dt));
    }
    this.root.rotation.y = this.yaw;
    if (cmd.turning) this.turnT = 0.3;
    if (this.turnT > 0) this.turnT -= dt;

    // ---------------------------------------------------------------- allure
    const targetGait = cmd.moving ? clamp(cmd.speed / WALK_SPEED, 0.35, RUN_SPEED / WALK_SPEED) : 0;
    this.gait += (targetGait - this.gait) * Math.min(1, dt * 9);
    const g = this.gait;
    const runBlend = clamp((g - 1.1) / (RUN_SPEED / WALK_SPEED - 1.1), 0, 1);
    const walking = Math.min(1, g);

    const cad = 5.0 + g * 3.4;
    if (g > 0.05) this.phase += dt * cad;
    const sw = Math.sin(this.phase);
    const sw2 = Math.sin(this.phase * 2);
    const amp = walking + runBlend * 0.55;

    // ---------------------------------------------------------------- jambes
    this.thL.rotation.x = sw * (0.52 + runBlend * 0.28) * amp;
    this.thR.rotation.x = -sw * (0.52 + runBlend * 0.28) * amp;
    this.knL.rotation.x = Math.max(0, -sw) * (0.75 + runBlend * 0.75) * amp;
    this.knR.rotation.x = Math.max(0, sw) * (0.75 + runBlend * 0.75) * amp;

    // pas -> poussière
    if (g > 0.4 && this.onFootstep) {
      const sign = sw >= 0 ? 1 : -1;
      if (sign !== this.stepSign) {
        this.stepSign = sign;
        const side = sign * 0.13;
        this.onFootstep(
          this.root.position.x + Math.cos(this.yaw) * side,
          0,
          this.root.position.z - Math.sin(this.yaw) * side
        );
      }
    }

    // ---------------------------------------------------------------- bassin / torse
    this.body.position.y = -0.06 + Math.abs(sw2) * (0.045 + runBlend * 0.03) * Math.min(1.3, g)
      + (g < 0.06 ? Math.sin(this.t * 1.6) * 0.006 : 0);
    this.hips.rotation.y = sw * 0.14 * walking;
    this.chest.rotation.y = -sw * 0.09 * walking;
    this.spine.rotation.x = 0.04 + g * 0.08 + runBlend * 0.26;
    if (cmd.braking) this.spine.rotation.x -= 0.22;
    if (this.turnT > 0) this.body.rotation.z = Math.sin(this.turnT / 0.3 * Math.PI) * 0.16 * (cmd.dir.x >= 0 ? -1 : 1);
    if (g < 0.06) this.hips.rotation.z = Math.sin(this.t * 0.8) * 0.02;

    // ---------------------------------------------------------------- bras (locomotion)
    const armSwing = (0.34 + runBlend * 0.36) * amp;
    this.shL.rotation.x = -sw * armSwing - 0.05 - runBlend * 0.25;
    this.shR.rotation.x = sw * armSwing - 0.05 - runBlend * 0.25;
    this.elL.rotation.x = -0.18 - runBlend * 0.85 - Math.max(0, sw) * 0.4 * amp;
    this.elR.rotation.x = -0.18 - runBlend * 0.85 - Math.max(0, -sw) * 0.4 * amp;

    // ---------------------------------------------------------------- repos : poses variées
    if (g < 0.06 && !this.atk && this.hurtT <= 0) {
      this.idleT += dt;
      if (!this.idleAnim && this.idleT > this.nextIdle) {
        const noms = ["regarde", "epee", "etire"];
        this.idleAnim = { nom: noms[(Math.random() * noms.length) | 0], t: 0, dur: 2.2 };
      }
    } else {
      this.idleT = 0; this.idleAnim = null;
    }
    if (this.idleAnim) {
      this.idleAnim.t += dt;
      const p = this.idleAnim.t / this.idleAnim.dur;
      const env = Math.sin(clamp(p, 0, 1) * Math.PI);          // monte puis redescend
      if (this.idleAnim.nom === "regarde") {
        this.headJ.rotation.y += Math.sin(p * Math.PI * 2) * 0.75 * env;
        this.chest.rotation.y += Math.sin(p * Math.PI * 2) * 0.18 * env;
      } else if (this.idleAnim.nom === "epee") {
        this.shR.rotation.x += -1.0 * env;
        this.shR.rotation.z += -0.35 * env;
        this.elR.rotation.x += -1.3 * env;
        this.headJ.rotation.x += 0.16 * env;
      } else {
        this.shL.rotation.x += -0.55 * env; this.shR.rotation.x += -0.55 * env;
        this.shL.rotation.z += 0.3 * env; this.shR.rotation.z += -0.3 * env;
        this.spine.rotation.x -= 0.16 * env;
        this.headJ.rotation.x -= 0.18 * env;
      }
      if (p >= 1) { this.idleAnim = null; this.idleT = 0; this.nextIdle = 4 + Math.random() * 4; }
    }

    // ---------------------------------------------------------------- enchaînement d'épée
    let lunge = 0, trailOn = false;
    if (this.atk) {
      this.atk.t += dt;
      const st = STAGES[this.atk.stage];
      const p = clamp(this.atk.t / st.dur, 0, 1);
      trailOn = p >= st.hit[0] && p <= st.hit[1];
      lunge = this._pose(this.atk.stage, p);
      if (this.atk.t >= st.dur) {
        if (this.queued) {
          this.atk = { stage: this.queued, t: 0, dur: STAGES[this.queued].dur };
          this.queued = 0;
        } else this.atk = null;
      }
    }
    this.combatT += dt;

    // dégainage / rengainage
    const wantDrawn = !!this.atk || this.combatT < SHEATHE_DELAY;
    this.drawT += ((wantDrawn ? 1 : 0) - this.drawT) * Math.min(1, dt * (wantDrawn ? 16 : 7));
    // en garde quand l'épée est sortie mais qu'on ne frappe pas
    if (!this.atk && this.drawT > 0.5) {
      const k = (this.drawT - 0.5) * 2;
      this.shR.rotation.x += -0.5 * k;
      this.elR.rotation.x += -0.75 * k;
      this.chest.rotation.y += -0.12 * k;
    }

    // ---------------------------------------------------------------- encaissement
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      const p = 1 - this.hurtT / 0.5;
      const env = Math.max(0, 1 - p) * (p < 0.15 ? p / 0.15 : 1);
      this.spine.rotation.x -= 0.45 * env;
      this.headJ.rotation.x -= 0.3 * env;
      this.shL.rotation.x += -0.7 * env; this.shR.rotation.x += -0.7 * env;
      this.shL.rotation.z += 0.4 * env; this.shR.rotation.z += -0.4 * env;
      // deux éclairs rouges
      const flash = (this.hurtT > 0.38 || (this.hurtT <= 0.28 && this.hurtT > 0.19)) ? 1 : 0;
      for (const m of this.mats) m.emissive.setRGB(0.85 * flash, 0.05 * flash, 0.04 * flash);
    } else if (this.mats[0].emissive.r !== 0) {
      for (const m of this.mats) m.emissive.setRGB(0, 0, 0);
    }

    // ---------------------------------------------------------------- cape souple
    const flow = 0.14 + g * 0.42 + runBlend * 0.3;
    for (let i = 0; i < this.capeSegs.length; i++) {
      const seg = this.capeSegs[i];
      const wave = Math.sin(this.t * 5.5 - i * 0.85 + this.phase) * (0.035 + g * 0.075);
      const tgt = flow * (1 - i * 0.05) + wave;
      seg.rotation.x += (tgt - seg.rotation.x) * Math.min(1, dt * (17 - i * 2.2));
      const tz = Math.sin(this.t * 3.1 - i * 0.7) * (0.018 + g * 0.035) + sw * 0.035 * walking;
      seg.rotation.z += (tz - seg.rotation.z) * Math.min(1, dt * (12 - i * 1.4));
    }

    // ---------------------------------------------------------------- panache + tête
    this.plumeJ.rotation.x = -0.18 - g * 0.24 + Math.sin(this.t * 6) * 0.09;
    this.plumeJ.rotation.z = Math.sin(this.t * 4.4 + 1) * 0.06;
    this.headJ.rotation.y += -this.chest.rotation.y * 0.5;

    // ---------------------------------------------------------------- placement de l'épée
    this.root.updateMatrixWorld(true);
    this.slotBack.getWorldPosition(this._pA); this.slotBack.getWorldQuaternion(this._qA);
    this.slotHand.getWorldPosition(this._pB); this.slotHand.getWorldQuaternion(this._qB);
    const d = clamp(this.drawT, 0, 1);
    this._pA.lerp(this._pB, d);
    this._qA.slerp(this._qB, d);
    this._inv.copy(this.body.matrixWorld).invert();
    this._pA.applyMatrix4(this._inv);
    this.body.getWorldQuaternion(this._q);
    this._q.invert().multiply(this._qA);
    this.sword.position.copy(this._pA);
    this.sword.quaternion.copy(this._q);

    // ---------------------------------------------------------------- traînée
    if (this.trail) {
      if (trailOn && !this.trail.on) this.trail.start();
      if (!trailOn && this.trail.on) this.trail.stop();
      this.sword.updateMatrixWorld(true);
      this.trail.update(this.bladeBase, this.bladeTip);
    }

    return lunge;
  }

  // pose du haut du corps pour un coup ; renvoie l'avancée (lunge) en mètres
  _pose(stage, p) {
    let shX = 0, shY = 0, shZ = 0, elX = -0.15, chY = 0, chX = 0, lunge = 0;
    if (stage === 0) {                                   // taille diagonale
      if (p < 0.30) { const k = p / 0.30;
        shX = lerp(0, -1.9, k); shZ = lerp(0, -0.65, k); chY = lerp(0, -0.42, k); elX = lerp(-0.15, -0.7, k);
      } else if (p < 0.60) { const k = (p - 0.30) / 0.30;
        shX = lerp(-1.9, 1.15, k); shZ = lerp(-0.65, 0.5, k); chY = lerp(-0.42, 0.55, k);
        elX = lerp(-0.7, -0.1, k); chX = lerp(0, 0.18, k); lunge = lerp(0, 0.4, k);
      } else { const k = (p - 0.60) / 0.40;
        shX = lerp(1.15, 0, k); shZ = lerp(0.5, 0, k); chY = lerp(0.55, 0, k);
        elX = lerp(-0.1, -0.55, k); chX = lerp(0.18, 0, k); lunge = lerp(0.4, 0, k);
      }
    } else if (stage === 1) {                            // revers
      if (p < 0.26) { const k = p / 0.26;
        shY = lerp(0, 1.0, k); shX = lerp(0, -0.55, k); chY = lerp(0, 0.5, k); elX = lerp(-0.15, -1.1, k);
      } else if (p < 0.56) { const k = (p - 0.26) / 0.30;
        shY = lerp(1.0, -1.15, k); shX = lerp(-0.55, 0.25, k); chY = lerp(0.5, -0.5, k);
        elX = lerp(-1.1, -0.2, k); lunge = lerp(0, 0.34, k);
      } else { const k = (p - 0.56) / 0.44;
        shY = lerp(-1.15, 0, k); shX = lerp(0.25, 0, k); chY = lerp(-0.5, 0, k);
        elX = lerp(-0.2, -0.55, k); lunge = lerp(0.34, 0, k);
      }
    } else {                                             // estoc
      if (p < 0.30) { const k = p / 0.30;
        shX = lerp(0, -0.35, k); elX = lerp(-0.15, -1.75, k); chY = lerp(0, 0.4, k); lunge = lerp(0, -0.12, k);
      } else if (p < 0.58) { const k = (p - 0.30) / 0.28;
        shX = lerp(-0.35, 0.15, k); elX = lerp(-1.75, -0.05, k); chY = lerp(0.4, -0.3, k);
        chX = lerp(0, 0.12, k); lunge = lerp(-0.12, 0.72, k);
      } else { const k = (p - 0.58) / 0.42;
        shX = lerp(0.15, 0, k); elX = lerp(-0.05, -0.55, k); chY = lerp(-0.3, 0, k);
        chX = lerp(0.12, 0, k); lunge = lerp(0.72, 0, k);
      }
    }
    this.shR.rotation.set(shX, shY, -0.06 + shZ);
    this.elR.rotation.x = elX;
    this.shL.rotation.x = -shX * 0.25 - 0.1;
    this.elL.rotation.x = -0.3;
    this.chest.rotation.y = chY;
    this.spine.rotation.x += chX;
    return lunge;
  }
}

export { WALK_SPEED, RUN_SPEED };
