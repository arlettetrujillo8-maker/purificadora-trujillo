const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  emptyReconcileState,
  containerDebtPrompt,
} = require("../js/empty-reconcile.js");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

// El caso que motivo el cambio: el repartidor vendio 22 y le entregaron 30,
// porque clientes le devolvieron envases que traian debiendo de otras visitas.
const sobrante = emptyReconcileState({ expected: 22, brought: 30, routeDebt: 15 });
assert.equal(sobrante.state, "surplus");
assert.equal(sobrante.difference, 8);
assert.equal(sobrante.requiresNote, true, "un sobrante debe exigir explicacion");
assert.equal(sobrante.suspicious, false, "8 cabe en una deuda de 15");
assert.match(sobrante.message, /8 de más/);
assert.doesNotMatch(sobrante.message, /Revisa la cuenta/);

// Cota de cordura: mas vacios de los que toda la ruta debe es un dedazo.
const dedazo = emptyReconcileState({ expected: 22, brought: 60, routeDebt: 15 });
assert.equal(dedazo.state, "surplus");
assert.equal(dedazo.suspicious, true);
assert.match(dedazo.message, /la ruta solo debe 15/);

// Faltantes: quedaron con clientes y se les suma a su cuenta.
const faltante = emptyReconcileState({ expected: 22, brought: 19, routeDebt: 15 });
assert.equal(faltante.state, "short");
assert.equal(faltante.difference, -3);
assert.equal(faltante.requiresNote, true);
assert.match(faltante.message, /3 de menos/);

// Cuadra: sin friccion, no se pide nada.
const cuadra = emptyReconcileState({ expected: 22, brought: 22 });
assert.equal(cuadra.state, "even");
assert.equal(cuadra.requiresNote, false);

// Sin capturar todavia no se juzga nada.
for (const vacio of ["", null, undefined]) {
  const pendiente = emptyReconcileState({ expected: 22, brought: vacio });
  assert.equal(pendiente.state, "pending", `"${vacio}" no debe evaluarse`);
  assert.equal(pendiente.requiresNote, false);
}

// Cero capturado SI es una respuesta: no trajo ninguno.
const cero = emptyReconcileState({ expected: 22, brought: 0 });
assert.equal(cero.state, "short");
assert.equal(cero.difference, -22);

// Basura no debe tronar ni inventar diferencias.
assert.equal(emptyReconcileState({ expected: "x", brought: 5 }).difference, 5);
assert.equal(emptyReconcileState({ expected: 10, brought: "abc" }).difference, -10);

// Sin deuda de ruta, cualquier sobrante es sospechoso.
assert.equal(
  emptyReconcileState({ expected: 5, brought: 6, routeDebt: 0 }).suspicious,
  true,
);

// Cableado: el campo ya no se prellena con los vendidos, que era la raiz.
assert.doesNotMatch(
  app,
  /roundReturnedEmpty"\)\.value = isReturned[\s\S]{0,80}int\(metrics\.netSold\)/,
  "no debe volver a dictar los vendidos como vacios esperados",
);
assert.match(app, /requiresNote && !\$\("roundReturnNotes"\)\.value\.trim\(\)/);
assert.match(html, /empty-reconcile\.js\?v=/, "el modulo debe cargarse");
assert.match(html, /id="roundEmptyReconcile"/);

// --- Aviso de envases pendientes en la venta ---
// Se atiende donde SI se sabe de quien son los envases: frente al cliente.

const conDeuda = containerDebtPrompt({ name: "Doña Mari", containerDebt: 3 });
assert.equal(conDeuda.show, true);
assert.equal(conDeuda.debt, 3);
assert.match(conDeuda.message, /Doña Mari tiene 3 envase/);
assert.match(conDeuda.message, /Recibió más vacíos/, "debe decir qué opción elegir");

// Sin deuda no se estorba: la venta normal no cambia en nada.
for (const sinDeuda of [
  { name: "Juan", containerDebt: 0 },
  { name: "Juan" },
  { name: "Juan", containerDebt: null },
  null,
  undefined,
])
  assert.equal(
    containerDebtPrompt(sinDeuda).show,
    false,
    `no debe avisar para ${JSON.stringify(sinDeuda)}`,
  );

// Una deuda negativa por datos sucios tampoco debe disparar el aviso.
assert.equal(containerDebtPrompt({ name: "X", containerDebt: -2 }).show, false);
// Sin nombre no se imprime "undefined" en la cara del repartidor.
assert.match(containerDebtPrompt({ containerDebt: 2 }).message, /^Este cliente tiene 2/);

// Cableado: el rótulo deja de llamarle "excepción" a algo de todos los días.
assert.match(html, /<span>Envases del cliente<\/span>/);
assert.doesNotMatch(html, /Envases \/ excepción/);
assert.match(html, /id="saleContainerDebtHint"/);
// Se abre una sola vez por cliente, para no pelear si el usuario lo cierra.
assert.match(app, /if \(containerPromptClientId !== client\.id\)[\s\S]{0,120}details\.open = true/);

console.log("empty-reconcile: 38/38 PASS");
