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

// 4. Al enfocar se desplaza MINIMO (no centra): centrar esconde el formulario
//    detras del teclado.
ok(
  !/scrollIntoView\(\{ block: "center"/.test(app),
  "no centra el campo al enfocar",
);
ok(
  /block: "nearest"/.test(app) || /rect\.bottom > visibleBottom/.test(app),
  "usa desplazamiento minimo",
);

// 5. Fase 2: errores inline junto al campo.
ok(/function fieldError\(/.test(app), "existe fieldError");
ok(/function clearAllFieldErrors/.test(app), "existe clearAllFieldErrors");
ok(
  /has-field-error/.test(css) && /\.field-error \{/.test(css),
  "estilos de error inline",
);
ok(
  /saleQty/.test(app) && /fieldError\(/.test(app),
  "la venta usa errores inline en sus campos",
);

// 6. Fase 2: toast arriba en movil (no tapado por el teclado).
ok(
  /\.toast \{\s*\n\s*inset: 16px 16px auto 16px/.test(css),
  "toast arriba en movil",
);

// 7. Fase 2: dirty-guard cierra el teclado antes de preguntar por cambios.
ok(
  /document\.activeElement\.blur\(\)/.test(app),
  "cierra el teclado antes del dialogo de descarte",
);

// 8. Blindaje anti-zoom de iOS: viewport con maximum-scale + 16px en el campo
//    de cliente + touch-action en controles.
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
ok(
  /maximum-scale=1/.test(html) && /user-scalable=no/.test(html),
  "viewport bloquea el zoom de iOS",
);
ok(
  /\.inline-control input \{\s*\n\s*flex: 1;[\s\S]{0,80}font-size: 16px/.test(css),
  "el buscador de cliente tiene 16px explicito",
);
ok(/touch-action: manipulation/.test(css), "controles con touch-action");

// 9. La barra inferior se oculta con el teclado abierto (mas espacio al form).
ok(
  /classList\.add\("keyboard-open"\)/.test(app),
  "marca keyboard-open al enfocar",
);
ok(
  /body\.keyboard-open \.bottom-nav/.test(css),
  "CSS oculta la barra inferior con el teclado",
);

console.log(`mobile-input-ux: ${passed} PASS`);
