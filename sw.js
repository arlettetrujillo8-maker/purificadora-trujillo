const BUILD = "20261025-reportes-filtros";
const CACHE = `purificadora-trujillo-${BUILD}`;
const ASSETS = [
  "./",
  "./index.html",
  `./css/styles.css?v=${BUILD}`,
  `./js/central-auth-ui.js?v=${BUILD}`,
  `./js/safe-uuid.js?v=${BUILD}`,
  `./js/presentation-labels.js?v=${BUILD}`,
  `./js/user-display.js?v=${BUILD}`,
  `./js/empty-reconcile.js?v=${BUILD}`,
  `./js/sale-client-selection.js?v=${BUILD}`,
  `./js/data/offline-store.js?v=${BUILD}`,
  `./js/v3/costs.js?v=${BUILD}`,
  `./js/v3/orders.js?v=${BUILD}`,
  `./js/app.js?v=${BUILD}`,
  `./js/v3/bootstrap.js?v=${BUILD}`,
  `./js/data/operational-store.js?v=${BUILD}`,
  `./js/data/profiles-repository.js?v=${BUILD}`,
  `./js/data/repository-utils.js?v=${BUILD}`,
  `./js/data/clients-repository.js?v=${BUILD}`,
  `./js/data/sales-repository.js?v=${BUILD}`,
  `./js/data/supabase-client.js?v=${BUILD}`,
  `./js/v3/supabase-config.js?v=${BUILD}`,
  `./js/data/ledger-repository.js?v=${BUILD}`,
  `./js/data/cash-repository.js?v=${BUILD}`,
  `./js/data/inventory-repository.js?v=${BUILD}`,
  `./js/data/rounds-repository.js?v=${BUILD}`,
  `./js/data/supplies-repository.js?v=${BUILD}`,
  `./js/data/settings-repository.js?v=${BUILD}`,
  `./js/data/reports-repository.js?v=${BUILD}`,
  `./js/data/maintenance-repository.js?v=${BUILD}`,
  `./js/data/returns-repository.js?v=${BUILD}`,
  `./js/data/corrections-repository.js?v=${BUILD}`,
  `./js/data/work-days-repository.js?v=${BUILD}`,
  `./js/data/routes-repository.js?v=${BUILD}`,
  `./js/data/orders-repository.js?v=${BUILD}`,
  `./js/v3/money.js?v=${BUILD}`,
  "./manifest.webmanifest",
  "./assets/logo/logo-trujillo.svg",
  "./assets/logo/purificadora-trujillo.png",
];

self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("purificadora-trujillo-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("message", (event) => {
  if (event.data?.type !== "GET_PURIFICADORA_BUILD") return;
  event.source?.postMessage({
    type: "PURIFICADORA_BUILD",
    build: BUILD,
    cache: CACHE,
  });
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Solo se cachea el propio origen: Supabase y terceros van directo a la red.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Navegacion: red primero y, si falla, la app cacheada (nunca en blanco).
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() =>
          caches
            .match("./index.html")
            .then((cached) => cached || caches.match("./")),
        ),
    );
    return;
  }

  // Estaticos: cache primero (funciona sin red) con actualizacion en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
