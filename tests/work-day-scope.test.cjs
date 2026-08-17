const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const store = fs.readFileSync(
  path.join(root, "js/data/operational-store.js"),
  "utf8",
);
const repo = fs.readFileSync(
  path.join(root, "js/data/work-days-repository.js"),
  "utf8",
);

// La jornada se define por la frontera guardada en public.work_days, no por el
// dia natural: si se cierra a las 8pm y se sigue vendiendo, o si la jornada
// cruza la medianoche, sameDay() corta donde no es.

// 1. El repositorio consulta la tabla y expone el comando de cierre.
assert.match(repo, /selectAll\("work_days"/);
assert.match(repo, /rpc\(\s*"close_work_day"/);

// 2. Se carga y se proyecta junto al resto del estado.
assert.match(store, /workDaysRepository\.list\(\)/);
assert.match(store, /workDays: workDays\.map/);
assert.match(store, /closedAt: item\.closed_at/);

// 3. El cierre llama a la RPC DESPUES de cerrar cajas y rondas: la funcion
//    rechaza la operacion si queda alguna viva.
const branch = store.slice(
  store.indexOf("if (workDayClosed)"),
  store.indexOf("else if (newUsers[0])"),
);
const posCash = branch.indexOf("cashRepository.close");
const posRounds = branch.indexOf("roundsRepository.finalize");
const posClose = branch.indexOf("workDaysRepository.close");
assert.ok(posCash > -1 && posRounds > -1 && posClose > -1, "faltan llamadas en la rama");
assert.ok(
  posClose > posCash && posClose > posRounds,
  "close_work_day debe ir despues de cerrar cajas y rondas",
);

// 4. Antes del primer cierre no hay frontera: se cae al dia natural para no
//    dejar las pantallas en blanco.
assert.match(
  app,
  /return start \? String\(date\) > start : sameDay\(date\)/,
  "inCurrentWorkDay debe usar sameDay como respaldo sin frontera",
);

// 5. Los tres consumidores quedan acotados a la jornada.
assert.match(app, /function todaySales\(\)[\s\S]{0,200}inCurrentWorkDay\(s\.date\)/);
assert.match(app, /function todayExpenses\(\)[\s\S]{0,160}inCurrentWorkDay\(e\.date\)/);
assert.match(
  app,
  /function scopedLatestSales\([\s\S]{0,220}inCurrentWorkDay\(s\.date\)/,
  "Ultimas ventas debe filtrarse por jornada",
);

// 6. Reportes conserva el historico: no debe colgarse de todaySales().
const reportes = app.slice(app.indexOf("const totalSales = sales.reduce") - 1200);
assert.match(
  reportes.slice(0, 1200),
  /const sales = state\.sales/,
  "Reportes debe seguir leyendo state.sales, no la jornada en curso",
);

// 7. workDays sobrevive a hydrateState, o el filtro se vaciaria en cada carga.
assert.match(app, /"users",\s*\n\s*"workDays",/);

console.log("work-day-scope: 13/13 PASS");
