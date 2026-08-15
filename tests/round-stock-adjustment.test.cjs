const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("js/app.js", "utf8");

function policyBlock(role, nextRole) {
  const start = app.indexOf(`${role}: {`);
  const end = app.indexOf(`${nextRole}:`, start);
  assert.ok(start >= 0 && end > start, `se localiza ACCESS_POLICY de ${role}`);
  return app.slice(start, end);
}

const admin = policyBlock("administrador", "repartidor");
assert.match(admin, /"adjust_inventory"/, "administrador puede corregir existencias");
assert.match(admin, /"transfer_inventory"/, "administrador puede transferir");

const repartidor = policyBlock("repartidor", "ventanilla");
assert.doesNotMatch(
  repartidor,
  /"adjust_inventory"|"transfer_inventory"/,
  "repartidor NO debe poder ajustar/transferir inventario",
);

const ventanilla = policyBlock("ventanilla", "inventario");
assert.doesNotMatch(
  ventanilla,
  /"adjust_inventory"|"transfer_inventory"/,
  "ventanilla NO debe poder ajustar/transferir inventario",
);

assert.match(
  app,
  /function openInventoryAdjustQuick\(location\)[\s\S]*?requirePermission\("adjust_inventory"\)/,
  "Corregir existencias reutiliza el permiso y flujo seguro existente",
);

// Bug real reportado: permissionsFor() tomaba un arreglo vacío como definitivo
// en vez de caer al permiso base del rol (perfiles centrales con permissions: []).
assert.match(
  app,
  /function permissionsFor\(user = activeUser\(\)\) \{\s*return user\?\.permissions\?\.length/,
  "un permissions:[] vacío no debe anular los permisos base del rol",
);

console.log("round-stock-adjustment: 5/5 PASS");
