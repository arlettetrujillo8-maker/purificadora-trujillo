const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("js/app.js");
const html = read("index.html");
const salesRepo = read("js/data/sales-repository.js");
const correctionsRepo = read("js/data/corrections-repository.js");
const migration = read("supabase/migrations/20260815010351_simplified_container_flow.sql");
const sw = read("sw.js");

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks += 1; };

function sell(stock, quantity, emptyReturn = quantity, damaged = 0) {
  if (!Number.isInteger(quantity) || quantity <= 0 || stock.full < quantity)
    throw new Error("insufficient_inventory");
  return { full: stock.full - quantity, empty: stock.empty + emptyReturn, damaged: stock.damaged + damaged };
}
function prepare(stock, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0 || stock.empty < quantity)
    throw new Error("insufficient_empty_inventory");
  return { ...stock, full: stock.full + quantity, empty: stock.empty - quantity };
}

assert.deepEqual(prepare({ full: 100, empty: 30, damaged: 2 }, 20), { full: 120, empty: 10, damaged: 2 }); checks++;
assert.throws(() => prepare({ full: 100, empty: 10, damaged: 0 }, 11), /insufficient_empty_inventory/); checks++;
assert.deepEqual(sell({ full: 20, empty: 5, damaged: 0 }, 3), { full: 17, empty: 8, damaged: 0 }); checks++;
assert.deepEqual(sell({ full: 10, empty: 1, damaged: 0 }, 2), { full: 8, empty: 3, damaged: 0 }); checks++;
assert.deepEqual(sell({ full: 10, empty: 1, damaged: 0 }, 2, 0), { full: 8, empty: 1, damaged: 0 }); checks++;
assert.deepEqual(sell({ full: 10, empty: 1, damaged: 0 }, 3, 1), { full: 7, empty: 2, damaged: 0 }); checks++;
assert.deepEqual(sell({ full: 10, empty: 1, damaged: 0 }, 2, 0, 2), { full: 8, empty: 1, damaged: 2 }); checks++;
assert.throws(() => sell({ full: 2, empty: 0, damaged: 0 }, 3), /insufficient_inventory/); checks++;

ok(/Preparar llenos/.test(app) && !/\["Lavado", \["lavado"\]\]/.test(app), "Lavado no aparece como tarjeta operativa");
ok(/id="saleContainerException"[\s\S]*Intercambio normal 1:1/.test(html), "la excepción está colapsada y el intercambio normal es predeterminado");
ok(/register_sale_with_containers/.test(salesRepo), "la venta usa RPC transaccional con envases");
ok(/correct_sale_with_containers/.test(correctionsRepo), "la corrección usa la misma semántica de envases");
ok(/sales_apply_container_effect[\s\S]*after insert on public\.sales/.test(migration), "el vacío se registra dentro de la transacción de venta");
ok(/sale_returns_reverse_containers/.test(migration), "devoluciones generan reversa compensatoria");
ok(/sale_corrections_reverse_containers/.test(migration), "correcciones y anulaciones revierten envases");
ok(/claim_operation[\s\S]*fill_containers/.test(migration), "preparar llenos conserva idempotencia");
ok(/quantity<p_quantity[\s\S]*insufficient_empty_inventory/.test(migration), "preparar valida existencias no negativas");
ok(/round_return_empty/.test(migration) && /empty_local/.test(migration), "el regreso lleva vacíos de ruta a Local");
ok(/round_reload/.test(read("supabase/migrations/20260811054310_enforce_round_capacity_and_reloads.sql")), "la recarga sigue vinculada a la ronda");
ok(/finalize_round_close/.test(read("supabase/migrations/20260814153453_round_return_recovery.sql")), "el cierre histórico de ronda permanece");
ok(/audit_log/.test(migration), "preparar llenos registra auditoría");
ok(/can_operate\('rounds'\)/.test(migration), "los permisos se validan en backend");
ok(!/drop\s+table|truncate\s+table|delete\s+from\s+public\.(sales|rounds)/i.test(migration), "la migración no es destructiva");
ok(/20260817-vacios-ronda/.test(sw), "service worker usa el build nuevo");

console.log(`simplified-container-flow: ${checks}/${checks} PASS`);
