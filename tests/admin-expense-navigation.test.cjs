const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");

assert.match(html, /class="nav-item" data-view="gastos">Gastos<\/button>/);
assert.match(html, /id="view-gastos"/);
assert.match(html, /id="moreNavBtn"[^>]*>[\s\S]*?<\/button>/);
assert.match(
  app,
  /administrador:\s*\{[\s\S]*?views:\s*\[[\s\S]*?"gastos"[\s\S]*?permissions:\s*\[[\s\S]*?"create_expense"[\s\S]*?"view_expenses"/,
);
assert.match(
  app,
  /view === "gastos" && permissionsFor\(user\)\.includes\("view_expenses"\)/,
);
assert.match(app, /gastos:\s*"view_expenses"/);
assert.match(app, /moreNavBtn[\s\S]*classList\.toggle\([\s\S]*"active"/);
const repartidorPolicy = app.slice(
  app.indexOf("    repartidor: {"),
  app.indexOf("    ventanilla: {"),
);
const ventanillaPolicy = app.slice(
  app.indexOf("    ventanilla: {"),
  app.indexOf("    inventario: {"),
);
assert.doesNotMatch(repartidorPolicy, /"gastos"|"view_expenses"/);
assert.doesNotMatch(ventanillaPolicy, /"gastos"|"view_expenses"/);

console.log("admin expense navigation: 9/9 PASS");
