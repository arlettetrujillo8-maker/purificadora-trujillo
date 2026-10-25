const assert = require("node:assert/strict");
const orders = require("../js/v3/orders.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

const today = new Date(2026, 9, 25);
const list = [
  { id: "a", clientName: "Ana", route: "ruta1", date: "2026-10-25", qty: 2, price: 14, status: "pendiente" },
  { id: "b", clientName: "Beto", route: "ruta2", date: "2026-10-24", qty: 1, price: 14, status: "pendiente" },
  { id: "c", clientName: "Carla", route: "ruta1", date: "2026-10-25", qty: 4, price: 12, status: "pendiente" },
  { id: "d", clientName: "Dora", route: "ruta1", date: "2026-10-25", qty: 1, price: 14, status: "entregado", deliveredAt: "2026-10-25T12:00:00Z" },
  { id: "e", clientName: "Ema", route: "ruta2", date: "2026-10-25", qty: 1, price: 14, status: "cancelado" },
];

// 1. Normalizacion y estado valido.
const n = orders.normalize({ id: "x", qty: 0, status: "raro" });
assert.equal(n.qty, 1);
assert.equal(n.status, "pendiente");
assert.equal(n.route, "ventanilla");
ok(true, "normalize");

// 2. Pedidos debidos hoy o atrasados.
const due = orders.dueToday(list, today);
assert.deepEqual(due.map((o) => o.id), ["b", "a", "c"]);
ok(due.every((o) => o.status === "pendiente"), "solo pendientes");

// 3. Agrupacion por ruta.
const ruta1 = orders.byRoute(list, "ruta1").map((o) => o.id);
assert.deepEqual(ruta1.sort(), ["a", "c", "d"]);
ok(true, "byRoute");

// 4. Resumen del dia.
const sum = orders.summary(list, today);
assert.equal(sum.pending, 3);
assert.equal(sum.dueToday, 3);
assert.equal(sum.dueUnits, 7);
assert.equal(sum.deliveredToday, 1);
assert.equal(sum.cancelled, 1);
assert.equal(sum.estimatedTotal, 2 * 14 + 1 * 14 + 4 * 12);
ok(true, "summary");

// 5. Transiciones permitidas.
assert.equal(orders.canTransition({ status: "pendiente" }, "entregado"), true);
assert.equal(orders.canTransition({ status: "pendiente" }, "cancelado"), true);
assert.equal(orders.canTransition({ status: "entregado" }, "cancelado"), false);
assert.equal(orders.canTransition({ status: "pendiente" }, "pendiente"), false);
assert.equal(orders.canTransition({ status: "pendiente" }, "otro"), false);
ok(true, "canTransition");

// 6. Orden de trabajo por fecha y cliente.
const sorted = orders.sortForWork(list).map((o) => o.id);
assert.deepEqual(sorted, ["b", "a", "c", "d", "e"]);
ok(true, "sortForWork");

// 7. Fechas y entradas vacias.
assert.equal(orders.todayKey(today), "2026-10-25");
assert.deepEqual(orders.dueToday(null, today), []);
assert.deepEqual(orders.byRoute(undefined, "ruta1"), []);
ok(true, "entradas vacias");

console.log(`orders: ${passed} bloques PASS`);
