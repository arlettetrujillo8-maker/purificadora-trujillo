const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(
  path.join(root, "js", "data", "operational-store.js"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260814213440_use_server_time_for_maintenance_counter.sql",
  ),
  "utf8",
);

assert.match(store, /const maintenanceNetSalesCount = sales/);
assert.match(store, /sale\.status === "active"/);
assert.match(store, /sale\.created_at > lastMaintenanceServiceAt/);
assert.doesNotMatch(store, /sale\.occurred_at > lastMaintenanceServiceAt/);
assert.match(store, /returnsBySale\.get\(sale\.id\)\?\.qty/);
assert.match(
  store,
  /count: maintenanceNetSalesCount/,
);
assert.doesNotMatch(store, /count: maintenanceProductionCount/);
assert.match(migration, /from public\.sales sale/);
assert.match(migration, /from public\.sale_returns/);
assert.match(migration, /where sale\.status = 'active'/);
assert.match(migration, /sale\.created_at > coalesce/);
assert.doesNotMatch(migration, /sale\.occurred_at > coalesce/);
assert.match(migration, /set search_path = pg_catalog, public/);
assert.match(
  migration,
  /revoke execute on function public\.register_maintenance_service[\s\S]*from public, anon/,
);

console.log("maintenance sales counter: 14/14 PASS");
