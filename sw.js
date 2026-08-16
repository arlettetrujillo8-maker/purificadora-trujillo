const BUILD = "20260816-fix-mobile-login";
const CACHE = `purificadora-trujillo-${BUILD}`;
const ASSETS = [
  "./",
  "./index.html",
  `./css/styles.css?v=${BUILD}`,
  `./js/central-auth-ui.js?v=${BUILD}`,
  `./js/safe-uuid.js?v=${BUILD}`,
  `./js/presentation-labels.js?v=${BUILD}`,
  `./js/user-display.js?v=${BUILD}`,
  `./js/sale-client-selection.js?v=${BUILD}`,
  `./js/app.js?v=${BUILD}`,
  `./js/data/supabase-client.js?v=${BUILD}`,
  `./js/data/repository-utils.js?v=${BUILD}`,
  `./js/data/profiles-repository.js?v=${BUILD}`,
  `./js/data/clients-repository.js?v=${BUILD}`,
  `./js/data/sales-repository.js?v=${BUILD}`,
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
  `./js/data/operational-store.js?v=${BUILD}`,
  `./js/v3/supabase-config.js?v=${BUILD}`,
  `./js/v3/money.js?v=${BUILD}`,
  `./js/v3/bootstrap.js?v=${BUILD}`,
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
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((cached) => cached || caches.match("./index.html")),
      ),
  );
});
