/* Service worker : cache-first pour jouer hors ligne.
   Bumper CACHE à chaque déploiement, sinon le téléphone garde l'ancienne version. */
const CACHE = "royaume3d-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./vendor/three.module.js",
  "./vendor/GLTFLoader.js",
  "./src/main.js",
  "./src/input.js",
  "./src/world.js",
  "./src/knight.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
