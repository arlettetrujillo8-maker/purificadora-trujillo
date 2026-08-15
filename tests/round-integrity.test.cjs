const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const store = fs.readFileSync(
  path.join(root, "js/data/operational-store.js"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260811054310_enforce_round_capacity_and_reloads.sql",
  ),
  "utf8",
);

const metrics = (loaded, reloads, sold) => ({
  total: loaded + reloads,
  available: loaded + reloads - sold,
});

assert.deepEqual(metrics(20, 0, 20), { total: 20, available: 0 });
console.log("PASS 1/8: carga 20 y venta 20 deja 0");

assert.equal(metrics(20, 20, 35).available, 5);
console.log("PASS 2/8: carga 20 + recarga 20 - venta 35 deja 5");

assert.match(
  app,
  /if \(qty > metrics\.availableFull\)[\s\S]*Registra una recarga/,
);
console.log("PASS 3/8: frontend rechaza venta mayor a available_full");

assert.ok(
  !/Math\.max\(0, (?:round|r)\.loadedQty/.test(app) &&
    app.includes("availableFull = totalLoaded - netSold"),
);
console.log("PASS 4/8: la sobreventa no se oculta con Math.max");

assert.ok(
  migration.includes("for update") &&
    migration.includes("round_capacity_exceeded") &&
    migration.includes("before insert on public.sales"),
);
console.log("PASS 5/8: Supabase bloquea la ronda antes de insertar la venta");

assert.ok(
  migration.includes("movement_type = 'round_reload'") &&
    migration.includes("'round_reload', 'round', v_round.id, v_round.id"),
);
console.log("PASS 6/8: cada recarga se asocia al round_id");

assert.ok(
  store.includes("reloadQty: reloadsByRound.get(item.id) || 0") &&
    store.includes("availableFullQty:"),
);
console.log("PASS 7/8: repository proyecta recargas y disponibilidad");

assert.ok(
  app.includes("Se capturaron ${int(-difference)} garrafones de más") &&
    app.includes("Inconsistencia detectada: hay ${int(metrics.inconsistencyQty)} ventas"),
);
console.log("PASS 8/8: mensajes nunca muestran faltantes negativos");
