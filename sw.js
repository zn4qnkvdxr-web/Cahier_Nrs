/**
 * Cahier de vacances IA — Service Worker
 * Stratégie :
 *  - Coquille applicative (HTML, config, icônes, libs CDN) : cache d'abord
 *  - CSV de contenu : réseau d'abord (fraîcheur), repli cache hors-ligne
 *  - /api/* : jamais en cache (LLM et sauvegarde exigent le réseau ;
 *    hors-ligne, le front bascule seul sur ses réponses de secours)
 */
const VERSION = 'cv-ia-v3';
const SHELL = [
  '/',
  '/index.html',
  '/config.js',
  '/manifest.json',
  '/content/defis.csv',
  '/content/ressources.csv',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/Draggable.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // réseau uniquement

  // CSV : réseau d'abord, cache en repli
  if (url.pathname.endsWith('.csv')) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Navigation : index en repli hors-ligne
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Le reste (coquille, fontes, libs) : cache d'abord, réseau en repli + mise en cache
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return r;
        })
    )
  );
});
