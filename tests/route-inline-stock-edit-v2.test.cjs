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
  /!round && can\("adjust_inventory"\) \? ` ?data-inventory-quick="adjust" data-location="\$\{route\}"/,
  "la cifra de Llenos solo es tocable cuando NO hay ronda activa",
);

// Vacíos SIEMPRE lee state.inventory[`empty_${route}`] sin importar si hay
// ronda activa o no, así que debe seguir siendo tocable en ambos casos.
assert.match(
  app,
  /route-stock-inline-edit[\s\S]*?can\("adjust_inventory"\) \? `data-inventory-quick="adjust" data-location="empty_\$\{route\}"/,
  "la cifra de Vacíos siempre es tocable si el usuario tiene el permiso",
);

// El botón de texto que queda visible durante una ronda activa corrige
// vacíos (que sí es correcto en ese contexto), no llenos.
assert.match(
  app,
  /can\("adjust_inventory"\) \? `<button class="text-btn" data-inventory-quick="adjust" data-location="empty_\$\{route\}">Corregir vacíos<\/button>/,
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

console.log("route-inline-stock-edit-v2: 6/6 PASS");
