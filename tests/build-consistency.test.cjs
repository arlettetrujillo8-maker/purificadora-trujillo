const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  CANONICAL_BUILD_FILE,
  collectBuildOccurrences,
  readCanonicalBuild,
} = require("../scripts/build-id.cjs");

const root = path.resolve(__dirname, "..");

// El identificador de build vive repetido en ~58 lugares (index.html, sw.js,
// los ?v= de cada modulo y los tests). Si un bump se queda a medias la app
// carga mitad codigo nuevo y mitad cacheado, que es exactamente lo que rompio
// el arranque antes. Esta prueba falla en vez de dejar pasar el bump parcial.
const build = readCanonicalBuild(root);
assert.match(
  build,
  /^\d{8}-[a-z][a-z0-9-]*$/,
  `El build de ${CANONICAL_BUILD_FILE} debe verse como 20260816-mi-cambio, no "${build}"`,
);

const occurrences = collectBuildOccurrences(root);
const desincronizados = occurrences.filter((o) => o.build !== build);

assert.deepEqual(
  desincronizados.map((o) => `${o.file}:${o.line} -> ${o.build}`),
  [],
  `Hay builds desincronizados con ${CANONICAL_BUILD_FILE} (${build}). Corre: node scripts/bump-build.cjs <nuevo-build>`,
);

assert.ok(
  occurrences.length > 40,
  `Se esperaban decenas de referencias al build; se encontraron ${occurrences.length}. Revisa el escaneo de scripts/build-id.cjs`,
);

// El service worker cachea por build: si no lo usa, el bump no invalida nada.
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
assert.match(sw, new RegExp(`const BUILD = "${build}"`));
assert.match(sw, /const CACHE = `purificadora-trujillo-\$\{BUILD\}`/);

console.log(`OK build-consistency: ${occurrences.length} referencias en ${build}`);
