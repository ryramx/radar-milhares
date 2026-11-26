// Estratégia: rede primeiro (sempre pega a versão mais nova quando há internet),
// cache como reserva para funcionar offline. Não é preciso trocar a versão a cada
// deploy; troque CACHE só se mudar a lista de ASSETS.
const CACHE = "radar-milhares-v2";
const NETWORK_TIMEOUT_MS = 4000;
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    const controller = new AbortController();
    // Com cópia em cache, não deixa uma rede lenta travar o app.
    const timer = cached ? setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS) : null;
    try {
      // "no-cache" revalida com o servidor em vez de usar o cache HTTP do navegador.
      const res = await fetch(req.url, { cache: "no-cache", credentials: "same-origin", signal: controller.signal });
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
      }
      return res;
    } catch (err) {
      if (cached) return cached;
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      return Response.error();
    } finally {
      if (timer) clearTimeout(timer);
    }
  })());
});
