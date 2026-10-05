/* Service Worker de Mandados: permite abrir la app sin internet.
   Va en la misma carpeta que index.html (mismo sitio HTTPS).
   - Archivos del propio sitio: red primero (así llegan las versiones nuevas) y, sin señal, la copia guardada.
   - Firebase JS, html2canvas y tipografías: se guardan y se sirven de la copia guardada (se refrescan en segundo plano).
   - Los datos (Firestore) NO pasan por aquí: los guarda y sincroniza Firestore con su persistencia local.
   Para forzar a los celulares a bajar una versión nueva de este archivo, cambia el número de CACHE. */
const CACHE = "mandados-v1";
const SHELL = ["./", "./index.html"];
const EXTERNO = u =>
  (u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) ||
  u.hostname === "cdnjs.cloudflare.com" ||
  u.hostname === "fonts.googleapis.com" ||
  u.hostname === "fonts.gstatic.com";

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La página avisa qué recursos externos usó para guardarlos desde la primera visita
self.addEventListener("message", e => {
  const urls = e.data && e.data.warm;
  if (!Array.isArray(urls)) return;
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(urls.map(async u => {
    try {
      if (!EXTERNO(new URL(u)) || await c.match(u)) return;
      const r = await fetch(u);
      if (r.ok || r.type === "opaque") await c.put(u, r);
    } catch (_) {}
  }))));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      } catch (_) {
        return (await c.match(req, { ignoreSearch: true })) ||
          (req.mode === "navigate" && ((await c.match("./index.html")) || (await c.match("./")))) ||
          Response.error();
      }
    })());
    return;
  }

  if (EXTERNO(url)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreVary: true });
      const red = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(red); return hit; }
      return (await red) || Response.error();
    })());
  }
  // Cualquier otra petición (p. ej. la API de Firestore) pasa directo a la red
});
