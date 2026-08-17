const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const store = fs.readFileSync(
  path.join(root, "js/data/operational-store.js"),
  "utf8",
);

// Abrir caja dejo de ser un requisito previo para trabajar. Antes, cualquier
// operacion con efectivo se detenia con un modal si no habia sesion abierta.
// Ahora la caja se abre sola con fondo 0. El vinculo con la sesion NO se
// quita: es lo que hace que el corte cuadre y que el dinero quede atribuido.

const fn = app.slice(
  app.indexOf("async function ensureCashSession"),
  app.indexOf("function requireOpenCashSession"),
);
assert.ok(fn.length > 0, "no encontre ensureCashSession");

// Solo interviene cuando de verdad se mueve efectivo.
assert.match(fn, /String\(method\)\.toLowerCase\(\) === "efectivo" && Number\(amount\) > 0/);
assert.match(fn, /if \(getOpenCashSession\(user\.id\)\) return true/);

// Fondo 0: no se inventa un monto que el usuario no conto.
assert.match(fn, /openingAmount: 0/);

// Sigue siendo una sesion real y auditada, no un atajo sin registro.
assert.match(fn, /state\.cashSessions\.push\(session\)/);
assert.match(fn, /audit\(\s*\n?\s*"open_cash"/);
assert.match(fn, /await commitState\(previousState\)/);

// Sin permiso para abrir caja no se puede resolver solo: se avisa como antes.
assert.match(fn, /if \(!can\("open_cash"\)\)[\s\S]{0,160}cashRequiredDialog/);

// Se le dice al usuario que paso, para que pueda ajustar el fondo.
assert.match(fn, /fondo \$0/);

// Todos los flujos que mueven efectivo deben asegurarla antes de exigirla.
const flujos = [
  "async function saveSale",
  "async function saveSaleReturn",
  "async function savePayment",
  "async function saveExpense",
  "async function saveSupplyMovement",
  "async function saveSaleCorrection",
  "async function saveSaleCorrectionV2",
  "async function voidSaleFromCorrection",
];
for (const inicio of flujos) {
  const i = app.indexOf(inicio);
  assert.ok(i > -1, `no encontre ${inicio}`);
  const cuerpo = app.slice(i, i + 6000);
  assert.match(
    cuerpo,
    /await ensureCashSession\(/,
    `${inicio} debe asegurar la caja antes de exigirla`,
  );
}

// La guarda final se conserva: si aun asi no hay sesion, no se registra el
// movimiento a ciegas.
assert.match(app, /function requireOpenCashSession/);
assert.match(app, /cashCheck\.required && !cashCheck\.session/);

// La frontera de jornada no debe poder tumbar la carga entera de la app.
assert.match(
  store,
  /workDaysRepository\.list\(\)\.catch\(\(error\) => \{[\s\S]{0,200}return \[\];/,
  "un fallo leyendo work_days debe degradar, no romper el arranque",
);

console.log("auto-open-cash: 20/20 PASS");
