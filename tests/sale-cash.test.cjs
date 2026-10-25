const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

// 1. Campos nuevos y orden: total -> cantidad pagada -> efectivo -> acciones.
const totalAt = html.indexOf('id="saleTotal"');
const paidAt = html.indexOf('id="salePaidWrap"');
const cashAt = html.indexOf('id="saleCashReceived"');
const changeAt = html.indexOf('id="saleChange"');
const actionsAt = html.indexOf('id="saleSubmitBtn"');
const envasesAt = html.indexOf('id="saleContainerException"');
ok(totalAt > 0, "campo total");
ok(cashAt > totalAt, "efectivo recibido debajo del total");
ok(changeAt > cashAt, "cambio a la derecha del efectivo");
ok(actionsAt > cashAt && actionsAt < envasesAt, "Registrar venta bajo el total y antes de envases");
ok(paidAt < cashAt, "cantidad pagada antes del efectivo");
ok(!/class="sale-actions"[\s\S]{0,200}sale-summary/.test(html), "acciones no quedan al final");

// 2. Logica de cambio.
ok(app.includes("saleCashReceived"), "lee efectivo recibido");
ok(app.includes("cashChange"), "calcula cambio");
ok(/is-short/.test(app), "detecta faltante");
ok(/type === "efectivo" \|\| type === "mixto"/.test(app), "solo en efectivo o mixto");
ok(/caption\.textContent = short \? "Falta" : "Cambio"/.test(app), "etiqueta Falta/Cambio");

// 3. Estilos.
ok(css.includes(".sale-cash-box"), "estilos del bloque");
ok(css.includes(".sale-change.is-short"), "estilo de faltante");

console.log(`sale-cash: ${passed} PASS`);
