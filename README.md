# Royaume 3D

Version 3D de *La Quête du Chevalier* — vue à la 3<sup>e</sup> personne (caméra dans le dos),
décor stylisé doux, PWA jouable **hors ligne** sur téléphone.

- Rendu : [three.js](https://threejs.org) (r160), vendu localement dans `vendor/` — aucun CDN requis.
- Chevalier : construit et animé **à la main** dans `src/knight.js` (hiérarchie d'articulations
  + cycles procéduraux repos / marche / course / coup d'épée). Aucun modèle importé.
- Décor : procédural pour l'instant (`src/world.js`). Les vrais packs de modèles low-poly
  (style Quaternius / Poly, CC0) remplaceront ces volumes à l'étape suivante — l'API ne change pas.

## Lancer en local

```
cd royaume-3d
python3 -m http.server 8000
# http://localhost:8000/?debug   (le ?debug affiche les fps et coupe le service worker)
```

## Déploiement

GitHub Pages, comme le jeu 2D. **Bumper `CACHE` dans `sw.js`** à chaque déploiement,
sinon le téléphone garde l'ancienne version en cache.

## À faire

- [ ] Intégrer les vrais modèles low-poly (maisons, arbres, props)
- [ ] Porter la logique du jeu 2D : quêtes, dialogues, sac, or, sauvegarde
- [ ] Entrer dans les bâtiments
- [ ] Ennemis + combat
- [ ] Profil de perf sur téléphone (viser 60 fps stable)
