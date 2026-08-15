const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const app = read("js/app.js");
const repository = read("js/data/clients-repository.js");
const bootstrap = read("js/v3/bootstrap.js");
const css = read("css/styles.css");
const migration = read(
  "supabase/migrations/20260814184252_merge_duplicate_clients.sql",
);

assert.match(html, /id="mergeClientsDialog"/);
assert.match(html, /id="mergeClientsOptions"/);
assert.match(app, /function blockingClientDuplicate/);
assert.match(app, /function duplicateClientGroup/);
assert.match(app, /openMergeClientsDialog[\s\S]*mergeDuplicateClients/);
assert.match(app, /Ya existe “\$\{duplicate\.name\}”/);
assert.match(repository, /"merge_clients"/);
assert.match(bootstrap, /mergeClients: async[\s\S]*hydrateOperationalState\("client-merge"\)/);
assert.match(css, /\.mobile-card-actions[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(migration, /create trigger clients_prevent_duplicate/);
assert.match(migration, /raise exception 'duplicate_client_name'/);
assert.match(migration, /v_actor\.role <> 'administrador'/);
assert.match(migration, /update public\.sales[\s\S]*set client_id = p_primary_client_id/);
assert.match(migration, /update public\.payments[\s\S]*set client_id = p_primary_client_id/);
assert.match(migration, /update public\.ledger_entries[\s\S]*set client_id = p_primary_client_id/);
assert.match(migration, /'client_merged'/);
assert.match(migration, /set active = false/);
assert.match(migration, /grant execute on function public\.merge_clients[\s\S]*to authenticated/);

console.log("client-deduplication: 18/18 PASS");
