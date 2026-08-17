const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("js/app.js", "utf8");
const css = fs.readFileSync("css/styles.css", "utf8");

// Bug real detectado al probar en dispositivo: mientras hay ronda activa, la
// cifra de "Llenos" mostrada es metrics.availableFull (carga + recargas -
// vendidos de ESA ronda), no state.inventory[route]. "Corregir existencias"
// ajusta state.inventory[route], así que durante una ronda activa NO debe
// ofrecerse como si fuera a corregir lo que se ve en pantalla.
assert.match(
  app,
  /const fullEditable = !round && can\("adjust_inventory"\)/,
  "la cifra de Llenos solo es tocable cuando NO hay ronda activa",
);
assert.match(
  app,
  /Llenos en ruta<\/small>\$\{stockCell\([\s\S]{0,200}?fullEditable/,
  "la celda de Llenos debe usar esa condición, no una propia",
);

// Vacíos SIEMPRE lee state.inventory[`empty_${route}`] sin importar si hay
// ronda activa o no, así que debe seguir siendo tocable en ambos casos.
assert.match(
  app,
  /const emptyEditable = can\("adjust_inventory"\)/,
  "la cifra de Vacíos siempre es tocable si el usuario tiene el permiso",
);
assert.match(
  app,
  /Vacíos en ruta<\/small>\$\{stockCell\([\s\S]{0,200}?emptyEditable/,
  "la celda de Vacíos debe usar esa condición",
);
// La celda no reintroduce su propia regla: la decisión vive fuera de ella.
assert.match(
  app,
  /const stockCell = \(location, value, editable, danger = false\)/,
  "stockCell recibe la decisión, no la calcula",
);

// El botón de texto que queda disponible durante una ronda activa corrige
// vacíos (que sí es correcto en ese contexto), no llenos.
assert.match(
  app,
  /data-inventory-quick="adjust" data-location="empty_\$\{route\}">Corregir vacíos<\/button>/,
  "durante una ronda activa, el botón secundario corrige vacíos, no llenos",
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

console.log("route-inline-stock-edit-v2: 9/9 PASS");
