/*
 * Service worker de Gatekeeper.
 * Estrategia sencilla "cache primero" para que la app funcione sin conexión:
 * se precachea el esqueleto de la app y, en cada petición, se responde desde
 * caché si es posible y se cae a red solo cuando hace falta.
 */

const NOMBRE_CACHE = 'gatekeeper-v14';

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

// Peticiones:
// - Navegaciones (la página): RED PRIMERO con tope de 4s, para que con
//   conexión siempre llegue la última versión publicada; la caché queda
//   como respaldo cuando no hay red.
// - Resto (iconos, manifest): caché primero, que apenas cambian.
self.addEventListener('fetch', (evento) => {
  // Solo gestionamos peticiones GET (la app no hace otras)
  if (evento.request.method !== 'GET') return;

  const esNavegacion = evento.request.mode === 'navigate' ||
    evento.request.destination === 'document';

  if (esNavegacion) {
    evento.respondWith((async () => {
      try {
        const control = new AbortController();
        const temporizador = setTimeout(() => control.abort(), 4000);
        const red = await fetch(evento.request, { signal: control.signal });
        clearTimeout(temporizador);
        if (red && red.status === 200) {
          const copia = red.clone();
          caches.open(NOMBRE_CACHE).then((cache) => cache.put('./index.html', copia));
        }
        return red;
      } catch (e) {
        // Sin red (o demasiado lenta): servir la copia guardada
        const cacheado = await caches.match('./index.html');
        return cacheado || Response.error();
      }
    })());
    return;
  }

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
        .catch(() => {});
    })
  );
});
