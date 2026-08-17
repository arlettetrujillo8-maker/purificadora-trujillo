const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { emptyReconcileState } = require("../js/empty-reconcile.js");

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

console.log("empty-reconcile: 24/24 PASS");
