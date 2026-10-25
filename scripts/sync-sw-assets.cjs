#!/usr/bin/env node
// Mantiene la lista ASSETS del service worker sincronizada con lo que realmente
// carga la app: scripts del index, imports de modulos, CSS, manifest e iconos.
// Sin esto, un archivo nuevo puede quedar fuera del cache y la app se queda en
// blanco cuando no hay conexion.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function normalizeLocal(spec) {
  const clean = spec.split("?")[0].split("#")[0];
  return clean.startsWith("./") ? clean.slice(2) : clean;
}

function collectImports(content) {
  const specs = [];
  const patterns = [
    /import\s+[^;\n]*?from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /import\s+["']([^"']+)["']/g,
    /export\s+[^;\n]*?from\s+["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function collectAssets() {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [];
  const styles = [];
  for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) {
    const src = normalizeLocal(match[1]);
    if (!src.startsWith("js/")) continue;
    scripts.push(src);
  }
  for (const match of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) {
    const href = normalizeLocal(match[1]);
    if (href.startsWith("css/")) styles.push(href);
  }

  const jsFiles = [];
  const seen = new Set();
  const visit = (file) => {
    if (!file || seen.has(file)) return;
    seen.add(file);
    if (!fs.existsSync(path.join(root, file))) return;
    jsFiles.push(file);
    const content = fs.readFileSync(path.join(root, file), "utf8");
    for (const spec of collectImports(content)) {
      if (!spec.startsWith(".")) continue;
      const resolved = path
        .normalize(path.join(path.dirname(file), spec.split("?")[0]))
        .replace(/\\/g, "/");
      visit(resolved);
    }
  };
  scripts.forEach(visit);

  const manifestPath = "manifest.webmanifest";
  const assets = ["./", "./index.html"];
  styles.forEach((href) => assets.push(`./${href}`));
  scripts.forEach((src) => assets.push(`./${src}`));
  jsFiles
    .filter((file) => !scripts.includes(file))
    .forEach((file) => assets.push(`./${file}`));
  if (fs.existsSync(path.join(root, manifestPath))) assets.push(`./${manifestPath}`);

  const iconFiles = new Set(["assets/logo/logo-trujillo.svg", "assets/logo/purificadora-trujillo.png"]);
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, manifestPath), "utf8"),
    );
    for (const icon of manifest.icons || [])
      if (icon?.src) iconFiles.add(normalizeLocal(icon.src));
  } catch {}
  [...iconFiles]
    .filter((file) => fs.existsSync(path.join(root, file)))
    .sort()
    .forEach((file) => assets.push(`./${file}`));

  return [...new Set(assets)];
}

function renderAssetsBlock(assets) {
  const lines = assets.map((asset) => {
    if (/\.(js|css)$/.test(asset.split("?")[0]))
      return `  \`${asset}?v=\${BUILD}\`,`;
    return `  "${asset}",`;
  });
  return `const ASSETS = [\n${lines.join("\n")}\n];`;
}

function syncSwAssets({ check = false } = {}) {
  const swPath = path.join(root, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");
  const start = sw.indexOf("const ASSETS = [");
  const end = sw.indexOf("];", start);
  if (start < 0 || end < 0) throw new Error("No se encontro el bloque ASSETS en sw.js");
  const expected = renderAssetsBlock(collectAssets());
  const current = sw.slice(start, end + 2);
  if (current === expected) {
    console.log("sw.js: ASSETS completo y al dia");
    return true;
  }
  if (check) {
    console.error("sw.js: ASSETS desincronizado. Ejecuta: node scripts/sync-sw-assets.cjs");
    return false;
  }
  fs.writeFileSync(
    swPath,
    sw.slice(0, start) + expected + sw.slice(end + 2),
    "utf8",
  );
  console.log("sw.js: ASSETS regenerado con", collectAssets().length, "entradas");
  return true;
}

module.exports = { collectAssets, renderAssetsBlock, syncSwAssets };

if (require.main === module) {
  const ok = syncSwAssets({ check: process.argv.includes("--check") });
  process.exit(ok ? 0 : 1);
}
