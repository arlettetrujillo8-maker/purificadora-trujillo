const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  listMigrationFiles,
  buildPlan,
  validateMigrationSql,
} = require("../scripts/apply-migrations.cjs");

const root = path.resolve(__dirname, "..");
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

// 1. Inventario y orden de migraciones.
const files = listMigrationFiles();
ok(files.length >= 2, "hay migraciones");
ok(files.includes("20261025_routes_expandible.sql"), "migracion de rutas");
ok(files.includes("20261025_orders_programados.sql"), "migracion de pedidos");
ok([...files].sort((a, b) => a.localeCompare(b, "en")).join() === files.join(), "ordenadas por fecha");

// 2. Plan con metadatos y checksum.
const plan = buildPlan([
  "20261025_routes_expandible.sql",
  "20261025_orders_programados.sql",
]);
ok(plan.length === 2, "plan de dos migraciones");
ok(plan.every((item) => item.bytes > 500 && /^[0-9a-f]{12}$/.test(item.checksum)), "bytes y checksum");

// 3. Deteccion de sentencias destructivas.
ok(validateMigrationSql("drop table public.x;").some((i) => i.includes("destructiva")), "detecta drop table");
ok(validateMigrationSql("truncate public.x;").some((i) => i.includes("destructiva")), "detecta truncate");
ok(
  !validateMigrationSql("create table if not exists public.x (id int);").some((i) =>
    i.includes("destructiva"),
  ),
  "no marca create table",
);

// 4. Migracion de rutas.
const routes = fs.readFileSync(
  path.join(root, "supabase/migrations/20261025_routes_expandible.sql"),
  "utf8",
);
ok(/create table if not exists public\.routes/i.test(routes), "crea routes");
ok(/enable row level security/i.test(routes), "RLS en routes");
ok(/create policy/i.test(routes), "politica de lectura");
ok(/grant select on public\.routes/i.test(routes), "grant de lectura");
ok(/insert into public\.routes/i.test(routes), "siembra ruta1/ruta2");
ok(/\^ruta\[0-9\]\+\$/.test(routes), "patron de rutas dinamicas");

// 5. Migracion de pedidos.
const orders = fs.readFileSync(
  path.join(root, "supabase/migrations/20261025_orders_programados.sql"),
  "utf8",
);
ok(/create table if not exists public\.orders/i.test(orders), "crea orders");
ok(/enable row level security/i.test(orders), "RLS en orders");
ok(/create or replace function public\.create_order/i.test(orders), "RPC create_order");
ok(/create or replace function public\.set_order_status/i.test(orders), "RPC set_order_status");
ok(/security definer/i.test(orders) && /set search_path/i.test(orders), "RPCs seguras");
ok(/grant execute on function public\.create_order/i.test(orders), "grant create_order");
ok(/status in \('pendiente', 'entregado', 'cancelado'\)/.test(orders), "estados de pedido");

// 6. CLI en dry-run y sin token.
const dry = spawnSync(process.execPath, ["scripts/apply-migrations.cjs"], {
  cwd: root,
  encoding: "utf8",
});
ok(dry.status === 0, "dry-run exitoso");
ok(/Dry-run/.test(dry.stdout), "dry-run no ejecuta");
ok(dry.stdout.includes("20261025_orders_programados.sql"), "plan lista pedidos");

const noToken = spawnSync(process.execPath, ["scripts/apply-migrations.cjs", "--apply"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: "" },
});
ok(noToken.status === 1, "apply sin token falla");
ok(/SUPABASE_ACCESS_TOKEN/.test(noToken.stderr), "explica que falta el token");

// 7. Guia y seguridad.
const doc = fs.readFileSync(path.join(root, "outputs/migraciones-pendientes.md"), "utf8");
ok(/Personal Access Token/.test(doc) && /--apply/.test(doc), "guia de aplicacion");
ok(/Rotar|rotarse|Revocar/i.test(doc), "incluye rotacion de la secret key");

const sensitive = [
  ...fs.readdirSync(path.join(root, "js")).map((f) => `js/${f}`),
  ...fs.readdirSync(path.join(root, "scripts")).map((f) => `scripts/${f}`),
];
const embedded = sensitive.filter((file) => {
  const full = path.join(root, file);
  if (!fs.statSync(full).isFile()) return false;
  const text = fs.readFileSync(full, "utf8");
  return /sb_secret_[A-Za-z0-9_-]+/.test(text) || /eyJhbGciOiJIUzI1Ni/.test(text);
});
ok(embedded.length === 0, "sin secret keys embebidas: " + embedded.join(", "));

console.log(`migrations: ${passed} PASS`);
