const assert = require("node:assert/strict");
const costs = require("../js/v3/costs.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

const supplies = [
  { id: "s1", name: "Sal", active: true, consumptionPerUnit: 0.5, costPerUnit: 4 }, // 2.00
  { id: "s2", name: "Tapas", active: true, consumptionPerUnit: 1, costPerUnit: 1.5 }, // 1.50
  { id: "s3", name: "Etiqueta", active: false, consumptionPerUnit: 2, costPerUnit: 9 }, // inactivo
  { id: "s4", name: "Sin consumo", active: true, consumptionPerUnit: 0, costPerUnit: 10 },
];

// 1. Costo por garrafón
assert.equal(costs.costPerContainer(supplies), 3.5);
ok(Number.isInteger(passed), "costo por garrafon");

// 2. Desglose ordenado y porcentajes
const breakdown = costs.breakdown(supplies);
assert.equal(breakdown.length, 2);
assert.equal(breakdown[0].name, "Sal");
assert.equal(breakdown[0].costPerContainer, 2);
assert.ok(Math.abs(breakdown[0].share - 2 / 3.5) < 1e-9);
assert.equal(breakdown[1].name, "Tapas");
ok(breakdown.every((item) => item.costPerContainer > 0), "desglose sin ceros");

// 3. Margen por garrafón
const margin = costs.marginPerContainer(14, supplies);
assert.equal(margin.cost, 3.5);
assert.equal(margin.margin, 10.5);
assert.ok(Math.abs(margin.marginPercent - 0.75) < 1e-9);
assert.equal(costs.marginPerContainer(0, supplies).marginPercent, 0);
ok(margin.price === 14, "margen con precio");

// 4. Produccion: costo y unidades por lote
const moves = [
  { type: "production", quantity: -10, costPerUnit: 4, fillId: "f1", containers: 20, date: "2026-10-01T10:00:00Z", reason: "Llenado de 20 garrafones" },
  { type: "production", quantity: -5, costPerUnit: 1.5, fillId: "f1", containers: 20, date: "2026-10-01T10:00:00Z", reason: "Llenado de 20 garrafones" },
  { type: "production", quantity: -2, costPerUnit: 1.5, fillId: "f2", date: "2026-10-02T10:00:00Z", reason: "Llenado de 8 garrafones" },
  { type: "purchase", quantity: 100, costPerUnit: 4, fillId: "f1", date: "2026-10-01T10:00:00Z" },
];
assert.equal(costs.productionCost(moves), 40 + 7.5 + 3);
assert.equal(costs.producedUnits(moves), 20 + 8);
assert.equal(costs.productionCost(moves, "2026-10-02T00:00:00Z"), 3);
assert.equal(costs.producedUnits(moves, "2026-10-02T00:00:00Z"), 8);
ok(true, "produccion");

// 5. Reporte y entradas vacias
const report = costs.report(supplies, moves, "2026-10-01T00:00:00Z");
assert.equal(report.costPerContainer, 3.5);
assert.equal(report.productionCost, 50.5);
assert.equal(report.producedUnits, 28);
assert.equal(costs.costPerContainer([]), 0);
assert.equal(costs.costPerContainer(null), 0);
assert.deepEqual(costs.breakdown(undefined), []);
ok(report.breakdown.length === 2, "reporte");

// 6. Cableado F4: motor, UI de Insumos, Reportes y produccion.
const fsModule = require("node:fs");
const pathModule = require("node:path");
const root = pathModule.resolve(__dirname, "..");
const app = fsModule.readFileSync(pathModule.join(root, "js/app.js"), "utf8");
const html = fsModule.readFileSync(pathModule.join(root, "index.html"), "utf8");
const sw = fsModule.readFileSync(pathModule.join(root, "sw.js"), "utf8");

ok(app.includes("function costEngine()"), "app usa costEngine");
ok(app.includes("Costo por garrafón"), "tarjeta de costo en Insumos");
ok(app.includes("Margen por garrafón"), "tarjeta de margen en Insumos");
ok(app.includes('$("supplyCostPanel")'), "panel de desglose en Insumos");
ok(app.includes("Costo insumos (vendido)"), "metrica de costo en Reportes");
ok(app.includes("Margen bruto"), "metrica de margen en Reportes");
ok(app.includes("updateFillContainersCost"), "costo en Preparar garrafones");
ok(/containers: qty,/.test(app), "lote de produccion guarda garrafones");
ok(html.includes('id="supplyCostPanel"'), "panel en el HTML");
ok(html.includes('id="fillContainersCost"'), "vista previa en el HTML");
ok(/js\/v3\/costs\.js\?v=/.test(html), "script de costos cargado");
ok(sw.includes("js/v3/costs.js"), "costos.js cacheado por el service worker");


console.log(`supply-costs: ${passed} bloques PASS`);
