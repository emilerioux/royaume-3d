/* Équipement du chevalier : ce qu'il porte, et ce qu'on peut acheter à l'armurerie.
   Il démarre avec le strict minimum ; tout le reste se gagne en ramassant de l'or. */

export const TENUE_DEPART = {
  visiere: false,
  ecu: false,
  mailles: false,
  blason: false,
  cape: "laine",      // cape de laine toute simple
  tunique: "bleu",
};

export const COULEURS = {
  cape:    { laine: 0x7d6a4e, rouge: 0x9c3f38, bleue: 0x2f5590, verte: 0x3f6f45 },
  tunique: { bleu: 0x3f6cae, blanc: 0xd6d4c8, noir: 0x272733, vert: 0x44784c },
};

export const ITEMS = [
  { id: "visiere", nom: "Heaume à visière", desc: "Visière, fente pour les yeux et rivets.",
    prix: 90, champ: "visiere", valeur: true },
  { id: "mailles", nom: "Cotte de mailles", desc: "Jupe de mailles sous la ceinture.",
    prix: 110, champ: "mailles", valeur: true },
  { id: "ecu", nom: "Écu", desc: "Bouclier au bras gauche.",
    prix: 150, champ: "ecu", valeur: true },
  { id: "blason", nom: "Blason au lion", desc: "Emblème sur le torse et la cape.",
    prix: 70, champ: "blason", valeur: true },

  { id: "cape_rouge", nom: "Cape cramoisie", desc: "Laine teinte de rouge profond.",
    prix: 60, champ: "cape", valeur: "rouge" },
  { id: "cape_bleue", nom: "Cape d'azur", desc: "Bleu roi, pour les grandes occasions.",
    prix: 60, champ: "cape", valeur: "bleue" },
  { id: "tun_blanc", nom: "Tunique d'argent", desc: "Tunique claire sous l'acier.",
    prix: 120, champ: "tunique", valeur: "blanc" },
  { id: "tun_noir", nom: "Tunique de nuit", desc: "Sombre, presque noire.",
    prix: 140, champ: "tunique", valeur: "noir" },
];

export const ITEM_PAR_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// un item « couleur » est équipable/déséquipable une fois acheté ; les pièces
// d'armure, elles, restent portées.
export const estCouleur = (it) => it.champ === "cape" || it.champ === "tunique";
