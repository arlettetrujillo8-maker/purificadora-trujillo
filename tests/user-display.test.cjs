const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { userDisplayLabel } = require("../js/user-display.js");

const center = (value) =>
  ({ local: "Local", ruta1: "Ruta 1", ruta2: "Ruta 2" })[value] || value;

assert.equal(
  userDisplayLabel(
    { name: "Administrador", role: "administrador", center: "local" },
    center,
  ),
  "Administrador · Local",
);
assert.equal(
  userDisplayLabel(
    { name: "Juan", role: "repartidor", center: "ruta1" },
    center,
  ),
  "Juan · Repartidor · Ruta 1",
);
assert.equal(
  userDisplayLabel(
    { name: "Ana", role: "ventanilla", center: "local" },
    center,
  ),
  "Ana · Ventanilla · Local",
);
assert.doesNotMatch(
  userDisplayLabel(
    { name: "Administrador", role: "administrador", center: "local" },
    center,
  ),
  /Administrador · Administrador/,
);

const appSource = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
assert.match(appSource, /\$\("sessionChip"\)\.textContent = u[\s\S]*userDisplayLabel\(u\)/);
assert.match(appSource, /\$\("mobileUserIdentity"\)\.textContent = u \? userDisplayLabel\(u\)/);
assert.match(appSource, /<option value="\$\{u\.id\}">\$\{esc\(userDisplayLabel\(u\)\)\}<\/option>/);
assert.match(
  appSource,
  /<strong>\$\{esc\(u\.name\)\}<\/strong>[\s\S]*?Usuario: \$\{esc\(u\.username\)\}/,
);

console.log("user-display: 8/8 PASS");
