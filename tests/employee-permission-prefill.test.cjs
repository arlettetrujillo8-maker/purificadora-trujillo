const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("js/app.js", "utf8");

// Bug real reportado: al editar un empleado con permissions: [] (heredando
// del rol), el formulario de Empleados no marcaba sus casillas heredadas
// -> se veían todas destapadas -> si el admin solo marcaba "Gastos" y
// guardaba, el empleado terminaba viéndose como si nunca hubiera recibido
// el permiso extra (o, en el mejor caso, con una UI engañosa que no refleja
// lo que el empleado realmente tiene).
//
// openUserDialog debe reusar permissionsFor() (ya corregido para no dejar
// que un arreglo vacío anule los permisos del rol) en vez de duplicar la
// lógica con el patrón `user?.permissions || ROLE_PERMISSIONS[...]`.
assert.match(
  app,
  /const selected = user\s*\?\s*permissionsFor\(user\)/,
  "el formulario de Empleados usa permissionsFor(), no la lógica duplicada",
);

// No debe quedar ningún rastro del patrón defectuoso original.
assert.doesNotMatch(
  app,
  /const selected =\s*\n?\s*user\?\.permissions \|\| ROLE_PERMISSIONS/,
  "no debe quedar la versión con el bug del arreglo vacío",
);

// Para un empleado nuevo (user null) debe seguir defaulteando a ventanilla,
// igual que antes -- no debe heredar accidentalmente los permisos del admin
// que está creando el registro (activeUser()).
assert.match(
  app,
  /: ROLE_PERMISSIONS\.ventanilla \|\| \[\];/,
  "un empleado nuevo sigue defaulteando a permisos de ventanilla",
);

console.log("employee-permission-prefill: 3/3 PASS");
