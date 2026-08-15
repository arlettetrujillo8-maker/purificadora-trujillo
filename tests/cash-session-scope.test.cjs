const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const renderCash = app.slice(
  app.indexOf("  function renderCash()"),
  app.indexOf("  function renderDailyCashSummary()"),
);

assert.match(
  app,
  /return Number\.isFinite\(time\) && time >= start && time <= end;/,
);
assert.match(app, /if \(!occursWithinCashSession\(movement, start, end\)\) return false;/);
assert.match(
  app,
  /authorized = state\.cashMovements\.filter\(\(m\) =>\s*belongsToCashSession\(m, session, start, end\)/,
);
assert.match(app, /const debtPaymentsTotal = payments\.reduce/);
assert.match(
  app,
  /t\.toCashSessionId === session\.id &&\s*occursWithinCashSession\(t, start, end\)/,
);
assert.match(renderCash, /const m = cashMovementsForSession\(session\)/);
assert.match(renderCash, /m\.cashSales \+ m\.cashDebtPayments/);
assert.match(renderCash, /m\.nonCashTransfers/);
assert.match(renderCash, /m\.debtPaymentsTotal/);
assert.doesNotMatch(renderCash, /todaySales\(\)/);
assert.doesNotMatch(renderCash, /sameDay\(/);
assert.match(html, /id="cashBreakdownTitle">Resumen de esta caja</);
assert.match(html, /<h3>Hoy calendario<\/h3>/);
assert.match(html, /Totales de todas las cajas visibles desde las 00:00\./);

console.log("cash-session-scope: 14/14 PASS");
