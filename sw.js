// AgroFinca Service Worker - Offline-First PWA
const CACHE_NAME = 'agrofinca-v8';

// Use relative paths - resolved at install time via self.registration.scope
const STATIC_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/app.js',
  './js/db.js',
  './js/sync.js',
  './js/supabase-client.js',
  './js/plan-guard.js',
  './js/gemini-client.js',
  './js/utils/charts.js',
  './js/utils/dates.js',
  './js/utils/format.js',
  './js/utils/photos.js',
  './js/modules/auth.js',
  './js/modules/fincas.js',
  './js/modules/dashboard.js',
  './js/modules/produccion.js',
  './js/modules/ventas.js',
  './js/modules/costos.js',
  './js/modules/finanzas.js',
  './js/modules/tareas.js',
  './js/modules/inspecciones.js',
  './js/modules/fitosanitario.js',
  './js/modules/lombricompost.js',
  './js/modules/apicultura.js',
  './js/modules/animales.js',
  './js/modules/configuracion.js',
  './js/modules/asistente-ia.js',
  './js/modules/admin.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './manifest.json'
];

// Leaflet CDN assets to cache
const CDN_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js'
];

// Install - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Resolve relative paths against SW scope
      const scope = self.registration.scope;
      const urls = STATIC_FILES.map(f => new URL(f, scope).href);
      return cache.addAll(urls).catch(err => {
        console.warn('SW: Some static assets failed to cache:', err);
        return Promise.allSettled(
          urls.map(url => cache.add(url).catch(() => null))
        );
      });
    }).then(() => {
      return caches.open(CACHE_NAME).then(cache => {
        return Promise.allSettled(
          CDN_ASSETS.map(url => cache.add(url).catch(() => null))
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Cache-first for static, Network-first for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Network-first for Supabase API calls
  if (url.hostname.includes('supabase')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for tile servers (maps)
  if (url.hostname.includes('tile') || url.hostname.includes('openstreetmap') || url.hostname.includes('arcgisonline')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (static assets, CDN)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match(new URL('./index.html', self.registration.scope).href);
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Background sync support
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }));
      })
    );
  }
});

// Push notification support (future)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'AgroFinca', {
        body: data.body || 'Tienes una nueva notificación',
        icon: './icons/icon-192.svg',
        badge: './icons/icon-192.svg'
      })
    );
  }
});
