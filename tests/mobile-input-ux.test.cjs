const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

// 1. Inputs con >=16px: evita el zoom automatico de iOS Safari al enfocar.
ok(
  /input,\s*\n\s*select,\s*\n\s*textarea \{[\s\S]{0,400}font-size: 16px/.test(css),
  "inputs con font-size 16px",
);

// 2. El scroll del teclado cubre campos de TODA la pagina (no solo dialogos).
ok(
  !/if \(!field\.closest\("dialog"\)\) return;/.test(app),
  "el scroll del teclado no se restringe a dialogos",
);
ok(/focusedField = field;/.test(app), "registra el campo enfocado");

// 3. Colchon bajo el teclado iOS (body padding = alto del teclado).
ok(/applyKeyboardInset/.test(app), "existe el colchon del teclado");
ok(
  /window\.innerHeight - view\.height/.test(app),
  "calcula el alto del teclado con visualViewport",
);

console.log(`mobile-input-ux: ${passed} PASS`);
