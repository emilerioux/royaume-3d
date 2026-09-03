/* Le chevalier : entièrement construit et animé à la main (aucun modèle importé).
   Hiérarchie d'articulations + cycles procéduraux :
   repos (avec poses variées), marche, course, demi-tour, encaissement,
   et un enchaînement de trois coups d'épée avec dégainage. */

import * as THREE from "three";
import { TENUE_DEPART, COULEURS } from "./gear.js";

const COL = {
  steel: 0x8e97a2, steelDark: 0x5b636d, steelWorn: 0x757d87,
  tunic: 0x3f6cae,
  leather: 0x6b4e35, leatherDark: 0x4a3626,
  fur: 0x9c9384, hair: 0x54402b,
  skin: 0xd3a781, gold: 0x8d7340,
  cape: 0x8c3f3a,
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
    const mS = mk(COL.steel, 0.45, 0.62);          // acier patiné
    const mSW = mk(COL.steelWorn, 0.58, 0.5);      // acier usé, plus mat
    const mSD = mk(COL.steelDark, 0.52, 0.55);     // acier sombre
    const mT = mk(COL.tunic, 0.85, 0);
    const mL = mk(COL.leather, 0.92, 0.04);
    const mLD = mk(COL.leatherDark, 0.95, 0.04);
    const mFur = mk(COL.fur, 1.0, 0);
    const mHair = mk(COL.hair, 0.95, 0);
    const mSkin = mk(COL.skin, 0.72, 0);
    const mGold = mk(COL.gold, 0.45, 0.6);         // laiton terni, pas de doré clinquant
    const mCape = mk(COL.cape, 0.95, 0);
    this.matT = mT; this.matCape = mCape;

    const part = (geo, material) => {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = true;
      return m;
    };

    // ---------------------------------------------------------------- squelette
    // Proportions humaines réelles : 1,82 m, tête ≈ 1/7 de la hauteur.
    const body = joint(this.root, 0, 0, 0);
    this.body = body;
    this.baseY = 0;
    const hips = joint(body, 0, 0.96, 0);
    const spine = joint(hips, 0, 0.12, 0);
    const chest = joint(spine, 0, 0.22, 0);
    const neck = joint(chest, 0, 0.22, 0);
    const headJ = joint(neck, 0, 0.14, 0);
    Object.assign(this, { hips, spine, chest, headJ });

    const shL = joint(chest, -0.205, 0.17, 0);
    const shR = joint(chest, 0.205, 0.17, 0);
    const elL = joint(shL, 0, -0.31, 0);
    const elR = joint(shR, 0, -0.31, 0);
    Object.assign(this, { shL, shR, elL, elR });

    const thL = joint(hips, -0.11, -0.04, 0);
    const thR = joint(hips, 0.11, -0.04, 0);
    const knL = joint(thL, 0, -0.45, 0);
    const knR = joint(thR, 0, -0.45, 0);
    Object.assign(this, { thL, thR, knL, knR });

    const HR = 0.128;                       // rayon du crâne
    const plumeJ = joint(headJ, 0, 0.02, -0.11);   // porte la mèche arrière
    this.plumeJ = plumeJ;

    // ---------------------------------------------------------------- torse : tunique puis plates
    const pelvis = part(new THREE.CapsuleGeometry(0.135, 0.10, 6, 12), mLD);
    pelvis.position.y = -0.04; pelvis.scale.set(1.16, 1, 0.82); hips.add(pelvis);

    const torso = part(new THREE.CapsuleGeometry(0.152, 0.28, 6, 14), mT);
    torso.position.y = -0.02; torso.scale.set(1.2, 1, 0.84); chest.add(torso);

    // cuirasse bombée + lames d'abdomen empilées
    const cuir = part(new THREE.CapsuleGeometry(0.166, 0.20, 7, 18), mS);
    cuir.scale.set(1.2, 1, 0.9); cuir.position.y = 0.015; chest.add(cuir);
    const plastron = part(new THREE.SphereGeometry(0.15, 20, 14), mSW);   // bombé du plastron
    plastron.scale.set(1.14, 1.0, 0.92); plastron.position.set(0, 0.05, 0.012); chest.add(plastron);
    for (let i = 0; i < 3; i++) {
      const lame = part(new THREE.SphereGeometry(0.152 - i * 0.004, 18, 10), i % 2 ? mSW : mSD);
      lame.scale.set(1.28, 0.32, 0.95);
      lame.position.y = 0.10 - i * 0.055;
      spine.add(lame);
    }

    // sangles de cuir croisées + boucle
    for (const sgn of [-1, 1]) {
      const sangle = part(new THREE.BoxGeometry(0.44, 0.036, 0.026), mL);
      sangle.position.set(0, 0.03, 0.15);
      sangle.rotation.z = sgn * 0.62;
      chest.add(sangle);
    }
    const boucle = part(new THREE.BoxGeometry(0.044, 0.044, 0.02), mGold);
    boucle.position.set(0, 0.03, 0.164); chest.add(boucle);

    // ceinture large + boucle + tassettes de cuir
    const belt = part(new THREE.TorusGeometry(0.155, 0.036, 8, 22), mL);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1.14, 1, 0.84);
    belt.position.y = 0.02; hips.add(belt);
    const bBoucle = part(new THREE.BoxGeometry(0.095, 0.08, 0.03), mGold);
    bBoucle.position.set(0, 0.02, 0.152); hips.add(bBoucle);
    for (const tx of [-0.095, 0.095]) {
      const tass = part(new THREE.BoxGeometry(0.14, 0.23, 0.032), mL);
      tass.position.set(tx, -0.125, 0.118);
      tass.rotation.x = 0.16;
      hips.add(tass);
      const bord = part(new THREE.BoxGeometry(0.145, 0.03, 0.036), mSW);   // bordure d'acier
      bord.position.set(tx, -0.238, 0.136);
      bord.rotation.x = 0.16;
      hips.add(bord);
    }

    // ---------------------------------------------------------------- manteau de fourrure
    const furJ = joint(chest, 0, 0.215, -0.02);
    this.furJ = furJ;
    // deux rangs de touffes rondes, ouvert devant (~70°) pour voir la cuirasse
    for (const [n, rx, rz, ry, rad] of [[13, 0.20, 0.135, -0.02, 0.072], [10, 0.155, 0.105, 0.045, 0.058]]) {
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 0.2 + (i / (n - 1)) * Math.PI * 1.6;   // 0 = devant
        const touffe = part(new THREE.SphereGeometry(rad, 10, 8), mFur);
        touffe.position.set(Math.sin(a) * rx, ry + Math.cos(a * 3 + i) * 0.012, Math.cos(a) * rz);
        const sc = 0.88 + ((i * 37) % 10) / 40;
        touffe.scale.set(sc * 1.05, sc * 0.92, sc);
        touffe.rotation.y = a;
        furJ.add(touffe);
      }
    }

    // ---------------------------------------------------------------- bras
    for (const [sh, sgn] of [[shL, -1], [shR, 1]]) {
      // spallière en trois lames superposées
      for (let i = 0; i < 3; i++) {
        const lame = part(
          new THREE.SphereGeometry(0.098 - i * 0.007, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
          i === 1 ? mSW : mS);
        lame.scale.set(1.24, 0.66, 1.08);
        lame.position.y = 0.025 - i * 0.052;
        lame.rotation.z = sgn * 0.1;
        sh.add(lame);
      }
      for (const rz of [-0.055, 0.055]) {
        const riv = part(new THREE.SphereGeometry(0.011, 6, 5), mGold);
        riv.position.set(sgn * 0.075, 0.02, rz); sh.add(riv);
      }
    }
    const uaL = part(new THREE.CapsuleGeometry(0.058, 0.20, 5, 10), mT); uaL.position.y = -0.155; shL.add(uaL);
    const uaR = part(new THREE.CapsuleGeometry(0.058, 0.20, 5, 10), mT); uaR.position.y = -0.155; shR.add(uaR);
    for (const [el, sgn] of [[elL, -1], [elR, 1]]) {
      const fa = part(new THREE.CapsuleGeometry(0.05, 0.20, 5, 10), mLD);
      fa.position.y = -0.15; el.add(fa);
      const brass = part(new THREE.CylinderGeometry(0.062, 0.055, 0.19, 12), mSW);   // brassard
      brass.position.y = -0.15; brass.scale.z = 0.92; el.add(brass);
      const lien = part(new THREE.TorusGeometry(0.06, 0.011, 6, 14), mL);
      lien.rotation.x = Math.PI / 2; lien.position.y = -0.075; el.add(lien);
      void sgn;
    }
    const poing = new THREE.SphereGeometry(0.062, 10, 9);
    const hL = part(poing, mLD); hL.position.y = -0.30; hL.scale.set(1, 1.14, 0.88); elL.add(hL);
    this.handR = joint(elR, 0, -0.30, 0);
    const hR = part(poing, mLD); hR.scale.set(1, 1.14, 0.88); this.handR.add(hR);

    // ---------------------------------------------------------------- jambes
    for (const [th, kn] of [[thL, knL], [thR, knR]]) {
      const cuisse = part(new THREE.CapsuleGeometry(0.093, 0.26, 5, 12), mLD);
      cuisse.position.y = -0.20; th.add(cuisse);
      for (const sy of [-0.13, -0.27]) {          // sangles, sinon la jambe est un bloc uni
        const sangle = part(new THREE.CylinderGeometry(0.098, 0.098, 0.032, 12), mL);
        sangle.position.y = sy; sangle.scale.z = 0.98; th.add(sangle);
      }

      const mollet = part(new THREE.CapsuleGeometry(0.072, 0.26, 5, 10), mLD);
      mollet.position.y = -0.19; kn.add(mollet);
      const greve = part(new THREE.SphereGeometry(0.078, 14, 10), mSW);   // grève avant
      greve.scale.set(0.95, 1.9, 0.75); greve.position.set(0, -0.18, 0.028); kn.add(greve);
      const genou = part(new THREE.SphereGeometry(0.075, 12, 10), mS);    // genouillère
      genou.scale.set(1, 0.9, 0.9); genou.position.set(0, 0.005, 0.015); kn.add(genou);

      const boot = part(new THREE.BoxGeometry(0.125, 0.11, 0.22), mLD);
      boot.position.set(0, -0.415, 0.035); kn.add(boot);
      const toe = part(new THREE.SphereGeometry(0.062, 10, 8), mLD);
      toe.position.set(0, -0.412, 0.135); toe.scale.set(1, 0.82, 1); kn.add(toe);
      const revers = part(new THREE.CylinderGeometry(0.088, 0.078, 0.075, 12), mL);
      revers.position.set(0, -0.34, 0.015); kn.add(revers);
    }

    // ---------------------------------------------------------------- tête, visage, cheveux, barbe
    neck.add(part(new THREE.CylinderGeometry(0.052, 0.07, 0.12, 10), mSkin));
    const gorget = part(new THREE.TorusGeometry(0.082, 0.026, 7, 16), mS);   // hausse-col
    gorget.rotation.x = Math.PI / 2; gorget.scale.set(1.15, 1, 0.95);
    gorget.position.y = -0.04; neck.add(gorget);

    const head = part(new THREE.SphereGeometry(HR, 20, 16), mSkin);
    head.scale.set(0.95, 1.14, 1.0);
    headJ.add(head);

    const mEyeW = mk(0xece6da, 0.5, 0);
    const mEyeD = mk(0x1d1611, 0.62, 0);
    for (const ex of [-0.046, 0.046]) {
      const oeil = part(new THREE.SphereGeometry(0.019, 10, 8), mEyeW);
      oeil.position.set(ex, 0.012, HR * 0.87); oeil.scale.set(1, 0.76, 0.5);
      headJ.add(oeil);
      const pup = part(new THREE.SphereGeometry(0.0105, 8, 7), mEyeD);
      pup.position.set(ex, 0.011, HR * 0.955); pup.scale.z = 0.5;
      headJ.add(pup);
      const sourcil = part(new THREE.BoxGeometry(0.042, 0.013, 0.02), mHair);
      sourcil.position.set(ex, 0.048, HR * 0.9);
      sourcil.rotation.z = ex < 0 ? 0.2 : -0.2;
      headJ.add(sourcil);
    }
    const nez = part(new THREE.SphereGeometry(0.022, 10, 8), mSkin);
    nez.position.set(0, -0.022, HR * 1.0); nez.scale.set(0.8, 1.25, 1.15);
    headJ.add(nez);
    const bouche = part(new THREE.BoxGeometry(0.04, 0.011, 0.018), mEyeD);
    bouche.position.set(0, -0.078, HR * 0.94);
    headJ.add(bouche);

    // barbe : coque sur la mâchoire et le menton
    const barbe = part(
      new THREE.SphereGeometry(HR + 0.009, 18, 14, Math.PI * 0.24, Math.PI * 0.52, Math.PI * 0.56, Math.PI * 0.42),
      mHair);
    barbe.material.side = THREE.DoubleSide;
    barbe.scale.set(1.02, 1.1, 1.0); barbe.position.y = -0.006;
    headJ.add(barbe);
    const moust = part(new THREE.BoxGeometry(0.072, 0.02, 0.026), mHair);
    moust.position.set(0, -0.056, HR * 0.93); headJ.add(moust);

    // chevelure : calotte + masse arrière + mèche qui bouge
    const chevTop = part(new THREE.SphereGeometry(HR + 0.013, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.30), mHair);
    chevTop.scale.set(0.98, 1.1, 1.02); chevTop.position.y = 0.004; headJ.add(chevTop);
    const chevBack = part(
      new THREE.SphereGeometry(HR + 0.015, 20, 14, Math.PI * 0.84, Math.PI * 1.32, 0, Math.PI * 0.64), mHair);
    chevBack.material.side = THREE.DoubleSide;
    chevBack.scale.set(0.99, 1.12, 1.04); headJ.add(chevBack);
    const meche = part(new THREE.CapsuleGeometry(0.045, 0.09, 4, 8), mHair);
    meche.position.y = -0.06; meche.scale.set(1.15, 1, 0.75); plumeJ.add(meche);
    this.poils = [chevTop, chevBack, barbe, moust, meche];

    // ---------------------------------------------------------------- cape
    // Chaque pan est un arc de cylindre qui enveloppe le dos et s'évase vers le
    // bas. L'axe des arcs passe par les articulations (au centre du corps) :
    // c'est ce qui garde les pans soudés quand la cape se soulève.
    this.capeSegs = [];
    const CH = [0.22, 0.21, 0.20, 0.18, 0.16];
    const CR = [0.275, 0.288, 0.30, 0.315, 0.335];
    const CA = [1.62, 1.60, 1.54, 1.44, 1.28];      // ouverture de l'arc (rad)
    let capeParent = joint(chest, 0, 0.13, 0.115);
    for (let i = 0; i < 5; i++) {
      const seg = i === 0 ? capeParent : joint(capeParent, 0, -CH[i - 1], 0);
      const L = CA[i];
      const m = part(
        new THREE.CylinderGeometry(CR[i], CR[Math.min(4, i + 1)], CH[i], 16, 1, true, Math.PI - L / 2, L), mCape);
      m.material.side = THREE.DoubleSide;
      m.position.y = -CH[i] / 2;
      seg.add(m);
      this.capeSegs.push(seg);
      capeParent = seg;
    }
    this._capeBlasonHote = this.capeSegs[1];

    // ---------------------------------------------------------------- équipement achetable
    const mMail = mk(0x969ea8, 0.55, 0.6);
    const mBlas = mk(0xa88a3e, 0.6, 0.25);

    // heaume fermé : couvre toute la tête, remplace cheveux + barbe
    const visor = new THREE.Group();
    const heaume = part(new THREE.SphereGeometry(HR + 0.03, 22, 16), mS);
    heaume.scale.set(1.02, 1.14, 1.06); visor.add(heaume);
    const fente = part(new THREE.BoxGeometry(0.19, 0.026, 0.03), mEyeD);
    fente.position.set(0, 0.024, (HR + 0.03) * 0.95); visor.add(fente);
    const arcade = part(new THREE.BoxGeometry(0.215, 0.028, 0.035), mSD);
    arcade.position.set(0, 0.058, (HR + 0.03) * 0.93); visor.add(arcade);
    const nasal = part(new THREE.BoxGeometry(0.03, 0.12, 0.03), mSD);
    nasal.position.set(0, -0.035, (HR + 0.03) * 0.96); visor.add(nasal);
    for (const bx of [-0.05, 0.05]) {
      const trou = part(new THREE.BoxGeometry(0.016, 0.055, 0.026), mEyeD);
      trou.position.set(bx, -0.062, (HR + 0.03) * 0.94); visor.add(trou);
    }
    headJ.add(visor);
    this.eqVisor = visor;

    // écu au bras gauche
    const shield = new THREE.Group();
    const plate = part(new THREE.CylinderGeometry(0.215, 0.165, 0.045, 14), mSW);
    plate.rotation.set(Math.PI / 2, 0, 0); shield.add(plate);
    const boss = part(new THREE.SphereGeometry(0.055, 10, 8), mS);
    boss.position.z = 0.04; boss.scale.z = 0.6; shield.add(boss);
    const bord = part(new THREE.TorusGeometry(0.21, 0.019, 6, 20), mGold);
    shield.add(bord);
    shield.position.set(-0.12, -0.18, 0.09);
    shield.rotation.set(0.25, -0.35, 0.1);
    elL.add(shield);
    this.eqShield = shield;

    // jupe de mailles
    const skirt = part(new THREE.CylinderGeometry(0.185, 0.235, 0.27, 16, 1, true), mMail);
    skirt.material.side = THREE.DoubleSide;
    skirt.position.y = -0.15; skirt.scale.set(1.1, 1, 0.86);
    hips.add(skirt);
    this.eqSkirt = skirt;

    // blason
    const blasTorse = part(new THREE.CircleGeometry(0.068, 14), mBlas);
    blasTorse.position.set(0, 0.075, 0.158);
    chest.add(blasTorse);
    this.eqBlazonChest = blasTorse;

    // ---------------------------------------------------------------- épée + ses deux emplacements
    const sword = new THREE.Group();
    this.sword = sword;
    body.add(sword);
    const blade = part(new THREE.BoxGeometry(0.055, 0.86, 0.135), mSW); blade.position.y = 0.43; sword.add(blade);
    const arete = part(new THREE.BoxGeometry(0.066, 0.80, 0.03), mS); arete.position.y = 0.42; sword.add(arete);
    const guard = part(new THREE.BoxGeometry(0.26, 0.05, 0.16), mSD); sword.add(guard);
    const grip = part(new THREE.CylinderGeometry(0.03, 0.03, 0.17, 8), mL); grip.position.y = -0.11; sword.add(grip);
    const pommel = part(new THREE.SphereGeometry(0.042, 10, 8), mSD); pommel.position.y = -0.20; sword.add(pommel);
    this.bladeBase = new THREE.Object3D(); this.bladeBase.position.y = 0.12; sword.add(this.bladeBase);
    this.bladeTip = new THREE.Object3D(); this.bladeTip.position.y = 0.88; sword.add(this.bladeTip);

    this.slotBack = new THREE.Object3D();
    this.slotBack.position.set(-0.04, 0.05, -0.185);
    this.slotBack.rotation.set(-0.3, 0, 0.55);
    chest.add(this.slotBack);

    this.slotHand = new THREE.Object3D();
    this.slotHand.position.set(0, -0.05, 0.03);
    this.slotHand.rotation.set(Math.PI * 0.94, 0, 0);
    this.handR.add(this.slotHand);

    // scratch
    this._pA = new THREE.Vector3(); this._pB = new THREE.Vector3();
    this._qA = new THREE.Quaternion(); this._qB = new THREE.Quaternion();
    this._inv = new THREE.Matrix4(); this._q = new THREE.Quaternion();

    const blasCape = part(new THREE.CircleGeometry(0.062, 14), mBlas);
    blasCape.position.set(0, -0.10, -0.30);
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
    // le heaume fermé remplace la chevelure et la barbe
    for (const m of this.poils) m.visible = !L.visiere;
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
    this.body.position.y = this.baseY + Math.abs(sw2) * (0.045 + runBlend * 0.03) * Math.min(1.3, g)
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
    // mèche arrière : elle balaie doucement, plus fort quand il court
    this.plumeJ.rotation.x = -0.06 - g * 0.16 + Math.sin(this.t * 5.2) * (0.045 + g * 0.04);
    this.plumeJ.rotation.z = Math.sin(this.t * 3.6 + 1) * 0.05;
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
