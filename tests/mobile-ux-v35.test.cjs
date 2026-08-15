const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "js/v3/bootstrap.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

assert.match(html, /id="operationalStatusBar"/);
assert.match(app, /En línea[\s\S]*Caja abierta[\s\S]*Ronda activa[\s\S]*Sincronizado/);
assert.match(html, /id="dashboardPrimaryActions"/);
assert.match(app, /operational-card[\s\S]*Nueva venta[\s\S]*Recargar[\s\S]*Regreso[\s\S]*Inventario[\s\S]*Cobrar[\s\S]*Registrar gasto/);
assert.match(html, /id="routeStatusHeader"[\s\S]*id="routeClientsQuick"[\s\S]*id="routeRoundActions"/);
assert.match(app, /route-client-sale[\s\S]*route-client-pay/);
assert.match(html, /id="windowSaleSlot"/);
assert.match(app, /mountSaleFormForView[\s\S]*window-compact-sale/);
assert.match(css, /window-compact-sale \.sale-field-channel[\s\S]*display: none/);
assert.match(html, /id="clientsMobileList"/);
assert.match(app, /Precio especial[\s\S]*createClientFromSearch/);
assert.match(app, /class="secondary-btn repeat-sale"/);
assert.match(html, /data-view="dashboard"[\s\S]*>Inicio<\/button>[\s\S]*data-view="ventas"[\s\S]*>Venta<\/button>[\s\S]*data-view="clientes"[\s\S]*>Clientes<\/button>[\s\S]*data-view="fiado"[\s\S]*>Fiado<\/button>[\s\S]*>Más<\/button>/);
assert.match(html, /data-view="diagnostico"/);
assert.match(html, /id="v3DiagnosticHost"/);
assert.match(bootstrap, /host\.appendChild\(panel\)/);
assert.doesNotMatch(bootstrap, /document\.body\.appendChild\(panel\)/);
assert.match(css, /button,\s*input,\s*select\s*\{\s*min-height: 44px/);
assert.match(sw, /20260815-sesion-fantasma-fix/);
assert.match(html, /class="panel sales-list-panel"/);
assert.match(css, /\.sales-list-panel\s*\{\s*container-type: inline-size/);
assert.match(css, /@container \(max-width: 760px\)[\s\S]*?\.sales-list-panel \.sale-card\s*\{[\s\S]*?grid-template-columns: 1fr/);
assert.match(css, /@container \(max-width: 480px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /@media \(max-width: 850px\)[\s\S]*?\.route-header-secondary\s*\{[\s\S]*?display: grid/);
assert.match(css, /\.route-header-secondary\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /\.route-header-secondary button\s*\{[\s\S]*?min-width: 0[\s\S]*?white-space: normal/);
assert.match(css, /\.route-header-secondary \.text-btn\s*\{\s*color: #fff/);
assert.match(app, /route-header-secondary[\s\S]*Recargar[\s\S]*Regreso[\s\S]*Cobrar[\s\S]*Registrar gasto[\s\S]*Corregir vacíos/);
assert.match(app, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
assert.doesNotMatch(app, /behavior: "smooth"/);
assert.match(
  app,
  /sidebarWasOpen[\s\S]*showView\(currentView \|\| "dashboard", \{[\s\S]*preserveSidebar: sidebarWasOpen/,
);

console.log("mobile-ux-v35: 30/30 PASS");
