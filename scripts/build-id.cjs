// Escaneo compartido del identificador de build.
// Lo usan tests/build-consistency.test.cjs (verificar) y
// scripts/bump-build.cjs (reescribir).
const fs = require("node:fs");
const path = require("node:path");

const CANONICAL_BUILD_FILE = "index.html";
const CANONICAL_PATTERN = /<meta name="app-build" content="([^"]+)"/;

const SCANNED_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".html", ".webmanifest"]);
const SKIPPED_DIRS = new Set([".git", ".claude", "node_modules", "outputs", "assets", "supabase"]);

// Estos archivos SON la herramienta del build: traen ejemplos como
// "20260817-mi-cambio" en comentarios y mensajes de ayuda, no referencias
// reales que haya que mantener sincronizadas.
const SKIPPED_FILES = new Set([
  "scripts/build-id.cjs",
  "scripts/bump-build.cjs",
  "tests/build-consistency.test.cjs",
]);

// Un build se ve como 20260816-reporte-y-envases-fix: fecha + guion + letra.
// Exigir letra despues del guion evita confundirlo con los UUID de prueba
// (00000000-0000-4000-...), que siempre traen digito o hex ahi.
const BUILD_PATTERN = /\d{8}-[a-z][a-z0-9-]*/g;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function readCanonicalBuild(root) {
  const html = fs.readFileSync(path.join(root, CANONICAL_BUILD_FILE), "utf8");
  const match = html.match(CANONICAL_PATTERN);
  if (!match) {
    throw new Error(`No encontre <meta name="app-build"> en ${CANONICAL_BUILD_FILE}`);
  }
  return match[1];
}

function listScannedFiles(root, dir = root, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      listScannedFiles(root, path.join(dir, entry.name), found);
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      const file = path.join(dir, entry.name);
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (!SKIPPED_FILES.has(relative)) found.push(file);
    }
  }
  return found;
}

function collectBuildOccurrences(root) {
  const occurrences = [];
  for (const file of listScannedFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      // Los UUID se borran antes de buscar para que no cuenten como builds.
      const clean = line.replace(UUID_PATTERN, "");
      for (const match of clean.matchAll(BUILD_PATTERN)) {
        occurrences.push({ file: relative, line: index + 1, build: match[0] });
      }
    });
  }
  return occurrences;
}

module.exports = {
  CANONICAL_BUILD_FILE,
  BUILD_PATTERN,
  UUID_PATTERN,
  collectBuildOccurrences,
  listScannedFiles,
  readCanonicalBuild,
};
