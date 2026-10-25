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

// 1. Barra de filtros estática y única.
ok(html.includes('class="reports-filters"'), "barra de filtros");
ok(html.includes('id="reportPeriod"') && html.includes('id="reportRoute"'), "filtros de periodo y ruta");
ok((html.match(/id="reportPeriod"/g) || []).length === 1, "un solo selector de periodo");
ok(!app.includes('id="reportPeriod"'), "el select ya no se genera dos veces");
ok(html.includes('id="reportsExportBtn"') && html.includes('id="reportsPrintBtn"'), "acciones exportar e imprimir");

// 2. Datos filtrados y acciones.
ok(app.includes("const routeFilter ="), "filtro por ruta");
ok(/routeFilter === "all" \|\| s\.channel === routeFilter/.test(app), "ventas filtradas por ruta");
ok(app.includes("function dataTable("), "componente DataTable");
ok(app.includes("function exportReportsCsv("), "exportación CSV");
ok(app.includes('$("reportsExportBtn")?.addEventListener("click", exportReportsCsv)'), "botón exportar conectado");
ok(/reportsPrintBtn[\s\S]{0,80}window\.print\(\)/.test(app), "botón imprimir conectado");
ok(app.includes('.reports-metrics .metric-card'), "CSV incluye métricas");
ok(app.includes('querySelectorAll(".reports-section")'), "CSV incluye tablas");

// 3. Estilos: sticky, responsive e impresión.
ok(/@media \(min-width: 1100px\)[\s\S]{0,200}\.reports-filters[\s\S]{0,120}position: sticky/.test(css), "filtros pegajosos");
ok(/@media print[\s\S]{0,300}#reportsContent/.test(css), "estilos de impresión");
ok(css.includes(".data-table"), "estilo del componente DataTable");

console.log(`reports-ux: ${passed} PASS`);
