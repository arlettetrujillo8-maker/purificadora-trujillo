const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  formatCenterLabel,
  formatInventoryLocationLabel,
  formatRouteLabel,
  formatStockTypeLabel,
} = require("../js/presentation-labels.js");

assert.equal(formatCenterLabel("local"), "Local");
assert.equal(formatCenterLabel("ruta1"), "Ruta 1");
assert.equal(formatCenterLabel("ruta3"), "Ruta 3");
assert.doesNotMatch(formatCenterLabel("local"), /llenos|vacíos|·/i);
assert.equal(formatInventoryLocationLabel("local"), "Local · llenos");
assert.equal(formatInventoryLocationLabel("empty_ruta2"), "Ruta 2 · vacíos");
assert.equal(formatRouteLabel("ruta3"), "Ruta 3");
assert.equal(formatStockTypeLabel("empty"), "Vacíos");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "js/v3/bootstrap.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(app, /\["local", "ruta1", "ruta2"\][\s\S]*centerLabel\(center\)/);
assert.match(app, /expenseHistory[\s\S]*centerLabel\(e\.center\)/);
assert.match(app, /cashSessionsHistory[\s\S]*centerLabel\(s\.center\)/);
assert.match(app, /const showGlobalStatus = currentView === "dashboard"/);
assert.match(
  app,
  /renderView\(name\);[\s\S]*?if \(!isNewNavigation && window\.scrollY !== preservedScrollY\)[\s\S]*?renderOperationalStatus\(\);/,
);
assert.match(app, /register\(`\.\/sw\.js\?v=\$\{encodeURIComponent\(appBuild\)\}`\)/);
assert.match(bootstrap, /badge\.hidden = centralConnected \|\| noConnection/);
assert.match(bootstrap, /\? "Conectar"/);
assert.match(html, /presentation-labels\.js\?v=20260817-vacios-ronda/);

console.log("presentation-labels: 17/17 PASS");
