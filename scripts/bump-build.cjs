#!/usr/bin/env node
// Cambia el identificador de build en TODOS los archivos de una sola pasada.
//
//   node scripts/bump-build.cjs 20260817-mi-cambio
//   node scripts/bump-build.cjs --check
//
// Antes esto se hacia a mano en ~58 lugares y bastaba olvidar uno para que el
// service worker sirviera codigo viejo mezclado con nuevo.
const fs = require("node:fs");
const path = require("node:path");
const {
  CANONICAL_BUILD_FILE,
  BUILD_PATTERN,
  collectBuildOccurrences,
  listScannedFiles,
  readCanonicalBuild,
} = require("./build-id.cjs");

const root = path.resolve(__dirname, "..");
const arg = process.argv[2];

function reportarDesincronizados(esperado) {
  const fuera = collectBuildOccurrences(root).filter((o) => o.build !== esperado);
  if (fuera.length === 0) {
    console.log(`OK: todo el repo esta en ${esperado}`);
    return 0;
  }
  console.error(`Builds desincronizados con ${CANONICAL_BUILD_FILE} (${esperado}):`);
  for (const o of fuera) console.error(`  ${o.file}:${o.line} -> ${o.build}`);
  return 1;
}

if (!arg || arg === "--check") {
  process.exit(reportarDesincronizados(readCanonicalBuild(root)));
}

if (!/^\d{8}-[a-z][a-z0-9-]*$/.test(arg)) {
  console.error(
    `Build invalido: "${arg}". Usa fecha + descripcion en minusculas, ej. 20260817-reporte-y-envases-fix`,
  );
  process.exit(1);
}

const anterior = readCanonicalBuild(root);
if (anterior === arg) {
  console.error(`El build ya es ${arg}; nada que cambiar.`);
  process.exit(1);
}

let archivosTocados = 0;
let reemplazos = 0;
for (const file of listScannedFiles(root)) {
  const original = fs.readFileSync(file, "utf8");
  let cambios = 0;
  // Solo se reescribe la coincidencia exacta con el build anterior, asi que
  // ningun UUID de prueba puede quedar afectado por accidente.
  const actualizado = original.replace(BUILD_PATTERN, (found) => {
    if (found !== anterior) return found;
    cambios += 1;
    return arg;
  });

  if (cambios > 0) {
    fs.writeFileSync(file, actualizado);
    archivosTocados += 1;
    reemplazos += cambios;
    console.log(`  ${path.relative(root, file).split(path.sep).join("/")} (${cambios})`);
  }
}

console.log(`\n${anterior} -> ${arg}: ${reemplazos} referencias en ${archivosTocados} archivos`);
process.exit(reportarDesincronizados(arg));
