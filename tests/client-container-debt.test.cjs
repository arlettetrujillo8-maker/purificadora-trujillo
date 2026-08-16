const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("js/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const store = fs.readFileSync("js/data/operational-store.js", "utf8");
const clientsRepo = fs.readFileSync("js/data/clients-repository.js", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260815233000_client_container_debt.sql",
  "utf8",
);

// Pantalla y navegación
assert.match(html, /id="view-envases"/, "existe la vista Envases pendientes");
assert.match(
  html,
  /data-view="envases">Env[aá]ses pendientes/,
  "aparece en el menú lateral",
);
assert.match(app, /envases: renderContainerDebt/, "está en el despachador de vistas");
assert.match(app, /renderContainerDebt\(\);/, "se refresca en renderAll()");

// Visibilidad por rol: mismo permiso que Fiado (view_client_debt), no uno nuevo.
assert.match(
  app,
  /envases: "view_client_debt"/,
  "usa el mismo permiso que Fiado y pagos",
);
["administrador", "repartidor", "ventanilla"].forEach((role) => {
  const start = app.indexOf(`${role}: {`);
  const block = app.slice(start, start + 400);
  assert.match(block, /"fiado",\s*\n\s*"envases"/, `${role} tiene envases junto a fiado`);
});

// No es retroactivo: la columna nace en 0 para todos.
assert.match(
  migration,
  /add column if not exists container_debt integer not null default 0/,
  "container_debt arranca en 0 (no retroactivo)",
);

// La deuda se calcula y revierte en la MISMA transacción que ya mueve el
// inventario de envases (no una ruta paralela que se pueda desincronizar).
assert.match(
  migration,
  /apply_sale_container_effect[\s\S]*?container_debt = container_debt \+ v_debt/,
  "la venta suma deuda dentro del mismo trigger que ya existía",
);
assert.match(
  migration,
  /reverse_sale_container_effect[\s\S]*?container_debt = container_debt - v_debt_qty/,
  "la devolución/corrección resta deuda proporcionalmente",
);

// Entrega de envases sueltos (sin venta): RPC dedicado, nunca dejar
// container_debt negativo.
assert.match(
  migration,
  /function public\.return_client_containers/,
  "existe el RPC de entrega de envases",
);
assert.match(
  migration,
  /v_applied := least\(p_quantity, greatest\(v_client\.container_debt, 0\)\)/,
  "nunca resta más deuda de la que el cliente realmente debe",
);

// El cliente (JS) llama al RPC real, no a update_client genérico -- y con
// prioridad ANTES del guardado genérico de cliente en el diff.
assert.match(
  clientsRepo,
  /returnContainers: \(\{ clientId, quantity, location, notes \}\)/,
  "existe returnContainers en el repositorio",
);
const containerBranch = store.indexOf("containerReturnClient)");
const updatedClientBranch = store.indexOf("else if (updatedClient)");
assert.ok(
  containerBranch > 0 && containerBranch < updatedClientBranch,
  "la entrega de envases se detecta ANTES que la edición genérica de cliente",
);

console.log("client-container-debt: 12/12 PASS");
