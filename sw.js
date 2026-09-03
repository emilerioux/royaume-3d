/* Service worker.
   Stratégie RÉSEAU D'ABORD : tant qu'on a du signal on prend toujours la version
   la plus récente (fini le téléphone qui garde une vieille build en cache), et on
   retombe sur le cache dès qu'on est hors ligne. */
const CACHE = "royaume3d-v6";
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
  "./src/fx.js",
  "./src/gear.js",
  "./src/coins.js",
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
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
