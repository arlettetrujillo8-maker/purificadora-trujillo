const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const bootstrap = read("js/v3/bootstrap.js");
const store = read("js/data/operational-store.js");
const app = read("js/app.js");
const html = read("index.html");
const sw = read("sw.js");
const offline = read("js/data/offline-store.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

// 1. Modulo offline expuesto al navegador y registrado en el shell.
ok(/PurificadoraOfflineStore/.test(offline), "offline-store expone API");
ok(/module\.exports/.test(offline), "offline-store es requerible en Node");
ok(/js\/data\/offline-store\.js/.test(html), "offline-store cargado en index.html");
ok(/js\/data\/offline-store\.js/.test(sw), "offline-store en el service worker");

// 2. Snapshot: se guarda tras sincronizar y se restaura sin conexion.
ok(
  /offlineApi\s*\n?\s*\.saveSnapshot\(projection/.test(bootstrap) ||
    /offlineApi\.saveSnapshot/.test(bootstrap),
  "bootstrap guarda el snapshot tras sincronizar",
);
ok(
  /applyCentralState\((source|snapshot\.state|current), profile, \{ offline: true \}\)/.test(
    bootstrap,
  ),
  "bootstrap restaura el snapshot en modo offline",
);

// 3. Cola: el commit offline detecta la operacion y la encola.
ok(/navigator\.onLine === false/.test(store), "commit detecta la perdida de red");
ok(/commitOffline\(before, draft\)/.test(store), "existe commitOffline");
ok(/detectOfflineOperation\(before, draft\)/.test(store), "existe detectOfflineOperation");
ok(
  /enqueueOperation\(item\)/.test(store) || /enqueueOperation\(op\)/.test(store),
  "commitOffline encola la operacion",
);
ok(
  /register_sale/.test(store) &&
    /register_payment/.test(store) &&
    /start_round/.test(store) &&
    /register_round_return/.test(store) &&
    /finalize_round_close/.test(store),
  "detectOfflineOperation soporta el conjunto del repartidor",
);
ok(
  /type: "return_sale"/.test(store) &&
    /type: "void_sale"/.test(store) &&
    /type: "correct_sale"/.test(store) &&
    /type: "upsert_supply"/.test(store) &&
    /type: "register_supply_movement"/.test(store) &&
    /type: "close_work_day"/.test(store),
  "detectOfflineOperation cubre devoluciones, correcciones, insumos y jornada",
);

// 4. Sincronizacion: reenvia la cola al reconectar con operationId estable.
ok(/syncQueuedOperations/.test(bootstrap), "existe el motor de sync");
ok(/window\.addEventListener\("online"/.test(bootstrap), "reconexion dispara sync");
ok(
  /syncHandlers/.test(bootstrap) &&
    /salesRepository\.create\(\{ \.\.\.sale, operationId: opId \}\)/.test(bootstrap),
  "el reenvio reutiliza el operationId de la cola",
);
ok(
  /return_sale:/.test(bootstrap) &&
    /void_sale:/.test(bootstrap) &&
    /correct_sale:/.test(bootstrap) &&
    /upsert_supply:/.test(bootstrap) &&
    /close_work_day:/.test(bootstrap),
  "syncHandlers cubre devoluciones, correcciones, insumos y jornada",
);
// 4b. UI de la cola: reintentar y descartar operaciones pendientes.
ok(/renderQueuePanel/.test(bootstrap), "existe el panel de cola");
ok(/retryQueueEntry/.test(bootstrap), "existe reintentar entrada");
ok(/discardQueueEntry/.test(bootstrap), "existe descartar entrada");
ok(/v3QueuePanel/.test(bootstrap), "el panel de cola se monta en Diagnóstico");

// 5. Estado de la app: modo offline persiste localmente.
ok(/offlineMode/.test(app), "app.js conoce el modo offline");
ok(/state\.central = !offline/.test(app), "offline deja central en false");
ok(
  /saveState\(\{ skipConflict: true \}\)/.test(app),
  "commit offline persiste en localStorage",
);

// 6. Repositorios aceptan operationId estable para idempotencia.
ok(
  /payment\.operationId \|\| null/.test(read("js/data/ledger-repository.js")),
  "register_payment reusa operationId",
);
ok(
  /client\.operationId \|\| null/.test(read("js/data/clients-repository.js")),
  "clientes reusan operationId",
);
ok(
  /round\.operationId \|\| null/.test(read("js/data/rounds-repository.js")),
  "rondas reusan operationId",
);
ok(
  /session\.operationId \|\| null/.test(read("js/data/cash-repository.js")),
  "caja reusa operationId",
);

// 7. Entidades nuevas usan UUID reales (para que el servidor las acepte al sync).
ok(/bareUuid = \(\) =>/.test(app), "existe el helper de UUID real");
ok(
  !/id: uid\("sale"\)/.test(app) &&
    !/id: uid\("round"\)/.test(app) &&
    !/id: uid\("cli"\)/.test(app),
  "venta/ronda/cliente ya no usan ids con prefijo",
);

// 8. Turno offline: el operador activo se reanuda sin conexion (PIN ya validado).
ok(/PERSISTED_EMPLOYEE_KEY/.test(app), "existe la persistencia del operador");
ok(
  /localStorage\.setItem\(PERSISTED_EMPLOYEE_KEY, user\.id\)/.test(app),
  "el login persiste el operador activo",
);
ok(
  /localStorage\.removeItem\(PERSISTED_EMPLOYEE_KEY\)/.test(app),
  "el logout limpia la persistencia",
);
ok(
  /const persistedUser =\s*\n?\s*offlineMode &&\s*\n?\s*persistedEmployeeId/.test(
    app,
  ),
  "init reanuda el turno solo estando sin conexion",
);

console.log(`offline-mode: ${passed} PASS`);
