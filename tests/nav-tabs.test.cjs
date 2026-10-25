const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

// 1. Menu agrupado y sin Pedidos como entrada suelta.
const navStart = html.indexOf('<nav id="mainNav">');
const nav = html.slice(navStart, html.indexOf("</nav>", navStart));
const groups = [...nav.matchAll(/class="nav-group-label">([^<]+)</g)].map((m) => m[1].trim());
ok(groups.length === 4, "cuatro grupos de navegación: " + groups.join(", "));
ok(!/data-view="pedidos"/.test(nav), "Pedidos ya no ocupa entrada propia");
ok(/Operación[\s\S]*Nueva venta[\s\S]*Rutas[\s\S]*Ventanilla/.test(nav), "operación agrupada");
ok(/Dinero[\s\S]*Caja[\s\S]*Fiado[\s\S]*Gastos[\s\S]*Reportes/.test(nav), "dinero agrupado");
ok(/Catálogo[\s\S]*Clientes[\s\S]*Inventario[\s\S]*Insumos/.test(nav), "catálogo agrupado");
ok(/Sistema[\s\S]*Empleados[\s\S]*Configuración[\s\S]*Auditoría/.test(nav), "sistema agrupado");

// 2. Rutas con pestanas.
ok(html.includes('id="routeTabRound"') && html.includes('id="routeTabOrders"'), "pestañas Ronda/Pedidos");
ok(html.includes('id="routeRoundView"') && html.includes('id="routeOrdersView"'), "paneles de pestañas");
ok(html.includes('id="routeTabOrdersCount"'), "contador de pedidos en la pestaña");
ok(html.includes('id="newRouteOrderBtn"'), "crear pedido desde la pestaña");
ok(/routeOrdersView[\s\S]{0,1200}routeOrdersPanel/.test(html), "panel de pedidos dentro de la pestaña");

// 3. Lógica de pestañas.
ok(app.includes("function setRouteTab("), "cambio de pestaña");
ok(app.includes("updateRouteOrdersBadge"), "contador actualizado");
ok(/data-route-tab/.test(app), "enlaces con pestaña de ruta");
ok(/renderRoutes\(\);\s*setRouteTab\(routeTab\);/.test(app), "se restaura la pestaña al renderizar");
ok(app.includes('$("routeTabOrders")?.addEventListener'), "listener de pestaña Pedidos");

// 4. Estilos.
ok(css.includes(".nav-group-label"), "estilo de grupos del menú");
ok(css.includes(".segmented-tabs") && css.includes(".segmented-tab"), "estilo de pestañas");

console.log(`nav-tabs: ${passed} PASS`);
