const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "js/v3/bootstrap.js"), "utf8");
const repo = fs.readFileSync(path.join(root, "js/data/routes-repository.js"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261025_routes_expandible.sql"),
  "utf8",
);

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

// 1. Catalogo con fallback ruta1/ruta2 (la app funciona sin migracion).
ok(app.includes("DEFAULT_ROUTES"), "existe catalogo por defecto");
ok(/code: "ruta1", name: "Ruta 1"/.test(app), "fallback ruta1");
ok(/code: "ruta2", name: "Ruta 2"/.test(app), "fallback ruta2");
ok(/function routeCatalog\(\)/.test(app), "routeCatalog()");
ok(/function routeCodes\(\)/.test(app), "routeCodes()");
ok(/function isRouteCode\(code\)/.test(app), "isRouteCode()");
ok(/window\.PurificadoraRoutes/.test(app), "lee el catalogo publicado por bootstrap");

// 2. Selects dinamicos y eventos.
ok(/function renderRouteSelects\(\)/.test(app), "renderRouteSelects()");
ok(/purificadora:routes/.test(app), "escucha el evento de rutas");
ok(/setSelectOptions\("saleChannel", channels\)/.test(app), "canal de venta dinamico");
ok(/setSelectOptions\("clientRoute", clientRoutes\)/.test(app), "ruta de cliente dinamica");
ok(/setSelectOptions\("roundRoute", routes\)/.test(app), "ruta de ronda dinamica");
ok(/setSelectOptions\("expenseCenter", centers\)/.test(app), "centro de gasto dinamico");
ok(/function renderAll\(\) \{\s*\n\s*renderRouteSelects\(\);/.test(app), "se refresca en renderAll");

// 3. Sin listas hardcodeadas de rutas.
ok(!/\["ruta1", "ruta2"\]/.test(app), "sin lista hardcodeada ruta1/ruta2");
ok(!/channel === "ruta1" \|\| channel === "ruta2"/.test(app), "sin comparaciones hardcodeadas de canal");
ok(!/\["local", "ruta1", "ruta2"\]/.test(app), "sin lista hardcodeada de centros");

// 4. El repositorio y la migracion existen.
ok(/routesRepository/.test(repo), "repositorio de rutas");
ok(/from\("routes"\)|selectAll\("routes"/.test(repo), "consulta la tabla routes");
ok(bootstrap.includes("routesRepository.list()"), "bootstrap carga las rutas");
ok(bootstrap.includes('new CustomEvent("purificadora:routes"'), "bootstrap publica el evento");
ok(/create table if not exists public\.routes/.test(migration), "migracion crea la tabla routes");
ok(/insert into public\.routes/.test(migration), "migracion siembra ruta1/ruta2");
ok(/routes_read_authenticated/.test(migration), "migracion con RLS de lectura");
ok(/\^ruta\[0-9\]\+\$/.test(migration), "validaciones por patron para rutas nuevas");

console.log(`routes-expandible: ${passed} PASS`);

