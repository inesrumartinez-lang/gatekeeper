/*
 * Service worker de Gatekeeper.
 * Estrategia sencilla "cache primero" para que la app funcione sin conexión:
 * se precachea el esqueleto de la app y, en cada petición, se responde desde
 * caché si es posible y se cae a red solo cuando hace falta.
 */

const NOMBRE_CACHE = 'gatekeeper-v6';

// Archivos que forman la app completa (app shell)
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Instalación: guardar en caché todos los archivos de la app
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(NOMBRE_CACHE).then((cache) => cache.addAll(ARCHIVOS))
  );
  // Activar el nuevo service worker sin esperar a que se cierren las pestañas
  self.skipWaiting();
});

// Activación: borrar cachés de versiones anteriores
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(
        claves
          .filter((clave) => clave !== NOMBRE_CACHE)
          .map((clave) => caches.delete(clave))
      )
    ).then(() => self.clients.claim())
  );
});

// Peticiones: responder desde caché; si no está, ir a red y guardar copia
self.addEventListener('fetch', (evento) => {
  // Solo gestionamos peticiones GET (la app no hace otras)
  if (evento.request.method !== 'GET') return;

  evento.respondWith(
    caches.match(evento.request).then((respuestaCache) => {
      if (respuestaCache) return respuestaCache;

      return fetch(evento.request)
        .then((respuestaRed) => {
          // Guardar copia en caché de lo que se descargue con éxito
          if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type === 'basic') {
            const copia = respuestaRed.clone();
            caches.open(NOMBRE_CACHE).then((cache) => cache.put(evento.request, copia));
          }
          return respuestaRed;
        })
        .catch(() => {
          // Sin red y sin caché: si es una navegación, devolver la app
          if (evento.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
