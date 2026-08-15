const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const inventoryRepository = fs.readFileSync(
  path.join(root, "js/data/inventory-repository.js"),
  "utf8",
);

assert.match(app, /dashboardCards[\s\S]*operational-card[\s\S]*Caja abierta/);
assert.match(app, /data-channel="\$\{route\}"[\s\S]*Recargar[\s\S]*Regreso/);
assert.match(app, /routeMetrics\.inconsistencyQty \? "Requiere ajuste"[\s\S]*routeMetrics\.inconsistencyQty && !isAdmin \? "disabled"/);
assert.match(app, /recover-round[\s\S]*Resolver ronda activa/);
assert.match(app, /Registro rápido[\s\S]*data-expense-center/);

assert.match(html, /id="saleContextBanner"/);
assert.match(app, /function beginSaleForClient[\s\S]*clientId:[\s\S]*route:/);
assert.match(app, /function beginSaleForRoute[\s\S]*roundId: activeRound\(route\)/);
assert.match(css, /contextual-sale\[data-context-type="client"\]/);

assert.match(html, /id="inventoryAdjustQuickDialog"[\s\S]*Cantidad actual[\s\S]*Nueva cantidad[\s\S]*Motivo/);
assert.match(html, /id="inventoryTransferQuickDialog"[\s\S]*Destino[\s\S]*Cantidad/);
assert.match(app, /function submitInventoryAdjustQuick[\s\S]*inventoryAdjustForm[\s\S]*requestSubmit/);
assert.match(app, /function submitInventoryTransferQuick[\s\S]*transferForm[\s\S]*requestSubmit/);
assert.match(app, /previousValue:[\s\S]*newValue:[\s\S]*difference:/);
assert.match(inventoryRepository, /rpc\([\s\S]*"transfer_inventory"/);
assert.match(inventoryRepository, /rpc\([\s\S]*"adjust_inventory"/);

assert.match(app, /Vender[\s\S]*Cobrar[\s\S]*Historial[\s\S]*Editar/);
assert.match(html, /id="paymentSettleBtn">Liquidar/);
assert.match(html, /id="paymentOtherAmountBtn">Otro monto/);
assert.match(html, /Más opciones de inventario/);

assert.doesNotMatch(app + html, /Resetear (?:ruta|inventario)|Borrar jornada/i);
assert.doesNotMatch(app, /behavior: "smooth"/);
assert.match(css, /@media \(max-width: 850px\)[\s\S]*primary-action-grid[\s\S]*grid-template-columns: 1fr/);

console.log("operational-cards-ux: 23/23 PASS");
