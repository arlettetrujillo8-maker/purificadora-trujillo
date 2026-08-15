const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("js/app.js", "utf8");
const css = fs.readFileSync("css/styles.css", "utf8");

// La cifra de Llenos debe apuntar a la ubicación de la ruta, y la de Vacíos
// a "empty_<ruta>", reutilizando el mismo mecanismo data-inventory-quick que
// ya usan el resto de las tarjetas (Local, Inventario), no un observer aparte.
assert.match(
  app,
  /route-stock-inline-edit[\s\S]*?data-inventory-quick="adjust" data-location="\$\{route\}"/,
  "la cifra de Llenos abre Corregir existencias de la ruta",
);
assert.match(
  app,
  /route-stock-inline-edit[\s\S]*?data-location="empty_\$\{route\}"/,
  "la cifra de Vacíos abre Corregir existencias del vacío de la ruta",
);

// Debe estar condicionado al permiso, no visible/interactivo para cualquiera.
assert.match(
  app,
  /can\("adjust_inventory"\) \? ` ?data-inventory-quick="adjust"/,
  "solo aparece tocable si el usuario tiene adjust_inventory",
);

// Accesible por teclado (Enter/Espacio), ya que no es un <button> nativo.
assert.match(
  app,
  /e\.key !== "Enter" && e\.key !== " "[\s\S]*?route-stock-inline-edit/,
  "responde a Enter/Espacio para accesibilidad de teclado",
);

// No debe depender de un MutationObserver ni de detectar texto por contenido:
// eso fue lo que hizo frágiles los intentos anteriores.
assert.doesNotMatch(
  app,
  /MutationObserver/,
  "no debe usarse un MutationObserver para esta función",
);

assert.match(
  css,
  /\.route-stock-inline-edit[\s\S]*?min-height:\s*44px/,
  "objetivo táctil >=44px",
);

console.log("route-inline-stock-edit-v2: 6/6 PASS");
