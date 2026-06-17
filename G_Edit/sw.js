/*
 * Service Worker - G'Edit
 * ------------------------------------------------------------------
 * Rôle :
 *  1. Permettre l'usage hors-ligne (mise en cache des fichiers de l'appli).
 *  2. Détecter automatiquement les nouvelles versions poussées sur GitHub
 *     et les proposer à l'utilisateur (voir le script de la page principale).
 *
 * IMPORTANT : à chaque mise à jour que tu pousses sur GitHub, change la
 * valeur de CACHE_VERSION ci-dessous (v1 -> v2 -> v3...). C'est ce qui
 * force le navigateur à considérer qu'il y a une nouvelle version et à
 * vider l'ancien cache. Si tu oublies de changer ce numéro, les fichiers
 * mis en cache risquent de ne pas se rafraîchir correctement.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `g-edit-cache-${CACHE_VERSION}`;

// Fichiers de l'appli elle-même (même origine que GitHub Pages).
// On les "précharge" dès l'installation pour que l'appli marche hors-ligne.
const PRECACHE_URLS = [
  './G_Edit.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// --- Installation : mise en cache initiale ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.error('[SW] Échec du précache :', err))
  );
});

// --- Activation : nettoyage des anciens caches (anciennes versions) ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// --- Permet à la page de déclencher l'activation immédiate du nouveau SW ---
// (utilisé par le bouton "Mettre à jour" dans G_Edit.html)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// --- Stratégie réseau ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // Fichiers de l'appli (HTML, manifest, icônes) : "network-first".
    // On va toujours chercher la dernière version sur GitHub Pages en
    // priorité, et on ne retombe sur le cache que si le réseau échoue
    // (hors-ligne). C'est ce qui garantit que tes mises à jour arrivent
    // bien jusqu'aux utilisateurs.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else {
    // Bibliothèques externes (Tailwind, pdf.js, fabric.js, jsPDF, lucide,
    // Google Fonts) : "stale-while-revalidate". On répond immédiatement
    // avec la version en cache si elle existe (rapide, marche hors-ligne),
    // tout en allant chercher une version fraîche en arrière-plan pour la
    // prochaine fois.
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
