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

const start = html.indexOf('id="view-ventas"');
const end = html.indexOf('id="view-ultimas"');
const ventas = html.slice(start, end);

// 1. Resumen fuera del formulario y en columna lateral.
ok(ventas.includes('class="sale-aside"'), "columna lateral de resumen");
ok(ventas.indexOf("</form>") < ventas.indexOf('class="sale-checkout"'), "resumen fuera del formulario");
ok(ventas.indexOf('class="sale-aside"') < ventas.indexOf('sales-list-panel'), "resumen antes de últimas ventas");

// 2. Total grande y líneas del resumen.
ok(app.includes("sale-summary-total"), "total grande en el resumen");
ok(app.includes("sale-summary-lines"), "líneas pagado/fiado/cambio");
ok(/<span>Cambio<\/span>/.test(app), "cambio en el resumen");

// 3. Notas colapsables.
ok(ventas.includes("sale-notes-details"), "notas colapsables");

// 4. CSS de dos columnas y sticky.
ok(/@media \(min-width: 1100px\)[\s\S]{0,500}position: sticky/.test(css), "resumen pegajoso en escritorio");
ok(css.includes(".sale-aside"), "estilos de columna lateral");
ok(css.includes(".sale-summary-total strong"), "tipografía del total");

console.log(`sale-layout: ${passed} PASS`);
