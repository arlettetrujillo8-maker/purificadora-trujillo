const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { collectAssets } = require("../scripts/sync-sw-assets.cjs");

const root = path.resolve(__dirname, "..");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

const assets = collectAssets();
const required = assets.filter((asset) => /\.(js|css|html|webmanifest|svg|png)$/.test(asset));

// 1. Todo lo que carga la app esta en el cache del service worker.
const missing = required.filter((asset) => !sw.includes(asset.replace(/^\.\//, "./")));
ok(missing.length === 0, "archivos fuera del cache: " + missing.join(", "));

// 2. Los JS/CSS usan la version del build (evita servir codigo viejo).
const versioned = required.filter((asset) => /\.(js|css)$/.test(asset));
ok(
  versioned.every((asset) => sw.includes(`\`${asset}?v=\${BUILD}\``)),
  "falta versionar algun JS/CSS",
);

// 3. Todos los archivos existen.
ok(required.every((asset) => fs.existsSync(path.join(root, asset))), "asset inexistente");

// 4. El service worker no cachea terceros y no devuelve HTML como JS.
ok(/url\.origin !== self\.location\.origin/.test(sw), "no filtra recursos externos");
ok(/request\.mode === "navigate"/.test(sw), "navegacion con respaldo offline");
ok(/\.match\("\.\/index\.html"\)/.test(sw), "fallback de navegacion a index");
ok(!/cached \|\| caches\.match\("\.\/index\.html"\)/.test(sw), "no devuelve index.html como JS");

// 5. Red de seguridad si el arranque falla.
ok(html.includes("bootFallback"), "aviso de arranque en el HTML");
ok(/No se pudo iniciar la app|bootFallback/.test(html), "mensaje de reintento");

console.log(`offline-assets: ${passed} PASS`);
