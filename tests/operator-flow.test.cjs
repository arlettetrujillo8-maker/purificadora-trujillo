const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const store = fs.readFileSync(
  path.join(root, "js/data/operational-store.js"),
  "utf8",
);
const profiles = fs.readFileSync(
  path.join(root, "js/data/profiles-repository.js"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260814071500_add_secure_operator_management.sql",
  ),
  "utf8",
);
const deletionMigration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260814080923_add_secure_operator_deletion.sql",
  ),
  "utf8",
);

assert.match(migration, /create table if not exists app_private\.operator_pins/);
assert.match(migration, /alter table app_private\.operator_pins enable row level security/);
assert.match(migration, /extensions\.crypt\(p_pin, v_hash\) = v_hash/);
assert.match(migration, /create or replace function public\.save_operator/);
assert.match(migration, /create or replace function public\.set_operator_active/);
assert.match(migration, /revoke all on function public\.save_operator[\s\S]*?from public, anon, authenticated/);
assert.doesNotMatch(migration + profiles + app, /service_role/i);
assert.match(profiles, /rpc\("save_operator"/);
assert.match(profiles, /rpc\("validate_operator_pin"/);
assert.match(store, /profilesRepository\.save/);
assert.match(store, /profilesRepository\.setActive/);
assert.match(app, /async function validateEmployeePin/);
assert.match(app, /Inicio de turno administrador con cuenta central/);
assert.match(app, /centralProfileRole !== "administrador"/);
assert.doesNotMatch(app, /requestAdminReauth\("guardar usuarios o roles"\)/);
assert.doesNotMatch(app, /requestAdminReauth\("activar o desactivar usuarios"\)/);
assert.match(html, /id="generateUserPinBtn"/);
assert.match(html, /id="copyUserPinBtn"/);
assert.match(app, /input\.type = "text";[\s\S]*?input\.value = String/);
assert.match(app, /PIN generado\. Anótalo antes de crear el empleado\./);
assert.match(app, /generateUserPinBtn"\)\.textContent = "Generado ✓"/);
assert.match(app, /function openUserPinDialog\(user\)/);
assert.match(app, /class="text-btn change-user-pin"/);
assert.match(app, /navigator\.clipboard\.writeText\(pin\)/);
assert.match(app, /PIN: \$\{pinStatus\(u\)\}/);
assert.match(html, /Alias interno/);
assert.doesNotMatch(html, /Solo para prototipo/);
assert.match(html, /id="usersCards"/);
assert.match(deletionMigration, /create or replace function public\.delete_operator/);
assert.match(deletionMigration, /v_actor\.role <> 'administrador'/);
assert.match(deletionMigration, /current_administrator_protected/);
assert.match(deletionMigration, /last_administrator_protected/);
assert.match(deletionMigration, /when foreign_key_violation then[\s\S]*?operator_has_history/);
assert.match(deletionMigration, /revoke all on function public\.delete_operator[\s\S]*?from public, anon, authenticated/);
assert.match(profiles, /rpc\("delete_operator"/);
assert.match(store, /function removed\(before, after\)/);
assert.match(store, /profilesRepository\.remove\(deletedUser\.id\)/);
assert.match(html, /id="deleteUserDialog"/);
assert.match(app, /class="text-btn danger delete-user"/);
assert.match(app, /async function confirmDeleteUser\(\)/);

console.log("operator-flow: 40/40 PASS");
