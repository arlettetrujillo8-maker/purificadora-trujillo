const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("js/app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

// El diálogo y sus campos deben existir.
assert.match(html, /id="roundLoadCorrectionDialog"/, "existe el diálogo");
assert.match(html, /id="roundLoadCorrectionQty"/, "campo de nuevo total");
assert.match(
  html,
  /id="roundLoadCorrectionReason"[\s\S]*?required/,
  "el motivo es obligatorio",
);

// El botón solo debe ofrecerse a Administrador, con ronda activa (no
// "regresada"), y solo cuando NO hay ya una inconsistencia (esa tiene su
// propio flujo: Resolver ronda activa).
assert.match(
  app,
  /adminMode && !metrics\?\.inconsistencyQty && round\.status !== "regresada"[\s\S]*?correct-round-load/,
  "el botón Corregir carga respeta las 3 condiciones",
);

// openRoundLoadCorrection debe rechazar si hay inconsistencia (evita pisar
// el flujo de recuperación administrativa existente).
assert.match(
  app,
  /function openRoundLoadCorrection\(id\)[\s\S]*?if \(metrics\.inconsistencyQty\)[\s\S]*?return toast/,
  "no permite abrir la corrección si hay inconsistencia",
);

// saveRoundLoadCorrection: no debe permitir bajar de lo ya vendido, exige
// motivo, y calcula el delta contra availableFull (no contra loadedQty).
assert.match(
  app,
  /newAvailable < metrics\.netSold/,
  "no permite un total menor a lo ya vendido",
);
assert.match(
  app,
  /if \(!reason\) return toast\("Escribe el motivo de la corrección\."/,
  "exige motivo",
);

// El invariante que motivó esta función: la corrección debe tocar AMBOS
// lados (state.inventory[route] vía recordInventoryMovement Y
// round.reloadQty), igual que hace reloadActiveRound — así el número que
// se ve en pantalla (roundMetrics) y el inventario de la ruta nunca
// vuelven a quedar desincronizados.
assert.match(
  app,
  /recordInventoryMovement\(\s*"local",\s*-delta,\s*"round_load_correction"/,
  "descuenta\\/regresa a Local según el signo del delta",
);
assert.match(
  app,
  /recordInventoryMovement\(\s*round\.route,\s*delta,\s*"round_load_correction"/,
  "ajusta el inventario de la ruta con el mismo delta",
);
assert.match(
  app,
  /round\.reloadQty = Number\(round\.reloadQty \|\| 0\) \+ delta;/,
  "el delta se refleja en reloadQty (no toca loadedQty, se preserva la carga inicial histórica)",
);

// Debe refrescar toda la UI, no solo inventario (mismo bug que ya se
// corrigió antes para Corregir existencias / Transferir).
assert.match(
  app,
  /audit\(\s*"round_load_corrected"[\s\S]*?renderAll\(\);/,
  "refresca toda la interfaz tras guardar",
);

console.log("round-load-correction: 8/8 PASS");
