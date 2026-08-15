const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const app = read("js/app.js");
const store = read("js/data/operational-store.js");
const repository = read("js/data/rounds-repository.js");
const migration = read("supabase/migrations/20260814153453_round_return_recovery.sql");

assert.match(html, /id="returnRoundDialogTitle"[\s\S]*Registrar regreso/);
assert.match(html, /Llenos que regresan[\s\S]*Vacíos recolectados[\s\S]*Dañados[\s\S]*Observación/);
assert.match(html, /id="roundRecoveryReason"[\s\S]*id="returnRoundSubmitBtn"/);
assert.match(app, /route-return-click[\s\S]*round_id[\s\S]*rpc-start[\s\S]*rpc-success[\s\S]*rpc-error/);
assert.match(app, /function canRecoverRound[\s\S]*role === "administrador"/);
assert.match(app, /round\.status = "regresada"[\s\S]*commitState/);
assert.match(app, /round\.status = "cerrada"[\s\S]*commitState/);
assert.match(repository, /"register_round_return"/);
assert.match(repository, /"finalize_round_close"/);
assert.match(store, /item\.status === "returned"[\s\S]*"regresada"/);
assert.match(store, /roundsRepository\.registerReturn/);
assert.match(store, /roundsRepository\.finalize/);
assert.match(migration, /for update;/i);
assert.match(migration, /claim_operation[\s\S]*complete_operation/);
assert.match(migration, /round_recovery_reason_required/);
assert.match(migration, /v_actor\.role <> 'administrador'/);
assert.match(migration, /status = 'returned'[\s\S]*return_operation_id/);
assert.match(migration, /status = 'closed'[\s\S]*closed_at = now\(\)[\s\S]*closed_by/);
assert.match(migration, /insert into public\.audit_log/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(rounds|sales)/i);
assert.doesNotMatch(migration, /update\s+public\.sales/i);
assert.match(migration, /revoke all on function public\.register_round_return/);
assert.match(migration, /grant execute on function public\.finalize_round_close/);

console.log("round-return-recovery: 23/23 PASS");
