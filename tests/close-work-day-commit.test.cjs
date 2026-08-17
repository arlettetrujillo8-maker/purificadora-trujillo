const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(
  path.join(root, "js/data/operational-store.js"),
  "utf8",
);
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");

// commit() es un despachador diff->RPC: una cadena if/else if donde solo corre
// una rama por commit. El cierre de jornada rompe esa forma dos veces: puede
// cerrar cajas Y rondas a la vez, y cuando no hay nada abierto no produce
// ningun diff despachable. Sin tratarlo aparte, aborta con "comando central
// seguro" y no guarda nada.

// 1. La marca explicita, que es lo que hace visible un cierre de cero elementos.
assert.match(
  app,
  /state\.workDayClosedAt = timestamp/,
  "closeWorkDay debe marcar state.workDayClosedAt",
);
assert.match(
  store,
  /const workDayClosed =\s*\n?\s*Boolean\(draft\.workDayClosedAt\) &&\s*\n?\s*draft\.workDayClosedAt !== before\.workDayClosedAt/,
  "commit debe derivar workDayClosed comparando draft contra before",
);

// 2. La rama de jornada va PRIMERA: si quedara despues de cualquier otra, un
//    diff ajeno la eclipsaria y volveria el bug.
const chain = store.slice(store.indexOf("async commit(before, draft)"));
const firstBranch = chain.indexOf("if (");
const workDayBranch = chain.indexOf("if (workDayClosed)");
assert.equal(
  workDayBranch,
  firstBranch,
  "la rama de cierre de jornada debe ser la primera de la cadena",
);

// 3. Dentro de esa rama se despachan cajas y rondas, no una u otra.
const workDayBody = chain.slice(workDayBranch, chain.indexOf("else if (newUsers[0])"));
assert.match(workDayBody, /cashRepository\.close\(session\)/);
assert.match(workDayBody, /roundsRepository\.finalize\(round\)/);

// 4. Las viejas ramas excluyentes no deben volver: eran las que hacian que al
//    cerrar caja y ronda juntas las rondas nunca llegaran al servidor.
assert.doesNotMatch(
  store,
  /else if \(autoClosedSessions\.length > 0\)/,
  "autoClosedSessions no debe volver a la cadena excluyente",
);
assert.doesNotMatch(
  store,
  /else if \(autoClosedRounds\.length > 0\)/,
  "autoClosedRounds no debe volver a la cadena excluyente",
);

// 5. Regla del proyecto: cerrar jornada marca, nunca borra.
const closeWorkDayFn = app.slice(
  app.indexOf("async function closeWorkDay(e)"),
  app.indexOf("async function saveCashMovement(e)"),
);
assert.ok(closeWorkDayFn.length > 0, "no encontre closeWorkDay en app.js");
assert.doesNotMatch(
  closeWorkDayFn,
  /\.splice\(|delete state\./,
  "closeWorkDay no debe borrar ni hacer splice de datos",
);
assert.match(closeWorkDayFn, /session\.autoClosedWorkDay = true/);
assert.match(closeWorkDayFn, /round\.autoClosedWorkDay = true/);

console.log("close-work-day-commit: 10/10 PASS");
