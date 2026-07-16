/**
 * Cahier de vacances IA — Service Worker
 *
 * Stratégie de fraîcheur (réseau d'abord sur tout ce qui évolue) :
 *  - Contenu éditable (.csv, .md) : RÉSEAU D'ABORD → toujours la dernière
 *    version en ligne ; repli cache uniquement si le réseau échoue (hors-ligne).
 *  - Navigation (HTML) : réseau d'abord, repli index.html hors-ligne.
 *  - Coquille figée (config, icônes, libs CDN : GSAP, PapaParse) : cache
 *    d'abord → instantané, car ces fichiers ne changent qu'avec un déploiement
 *    (et le bump de VERSION ci-dessous purge alors l'ancien cache).
 *  - /api/* : jamais mis en cache (LLM, sauvegarde, Juge exigent le réseau).
 *
 * ⚠ DÉPLOIEMENT : incrémenter VERSION à CHAQUE déploiement (voir DEPLOIEMENT.md).
 *   C'est ce numéro qui invalide l'ancien cache de coquille chez les visiteurs.
 */
const VERSION = 'cv-ia-v46';

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

// Contenu éditable par l'équipe : doit toujours refléter la dernière version.
function isFreshContent(url) {
  return url.pathname.endsWith('.csv') || url.pathname.endsWith('.md');
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll échouerait en bloc si un seul asset 404 : on tolère l'unité près.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord, avec mise en cache de la copie fraîche ; repli cache hors-ligne.
function networkFirst(request) {
  return fetch(request)
    .then((r) => {
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return r;
    })
    .catch(() => caches.match(request));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return; // réseau uniquement

  // Contenu éditable (.csv, .md) : toujours frais
  if (isFreshContent(url)) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Navigation : dernier HTML en ligne, index.html en repli hors-ligne
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }

  // Coquille figée : cache d'abord, réseau en repli (et mise en cache)
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          if (r && r.ok) {
            const copy = r.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return r;
        })
    )
  );
});
