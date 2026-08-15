const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const repository = fs.readFileSync(
  path.join(root, "js", "data", "cash-repository.js"),
  "utf8",
);

assert.match(html, /<option value="efectivo">Efectivo<\/option>/);
assert.match(
  html,
  /<option value="transferencia">Transferencia<\/option>/,
);
assert.match(html, /<option value="otro">Otro<\/option>/);
assert.match(repository, /String\(value \|\| "otro"\)\.trim\(\)\.toLowerCase\(\)/);
assert.match(repository, /normalized === "sin_efectivo"/);
assert.match(
  repository,
  /\["efectivo", "transferencia", "otro"\]\.includes\(normalized\)/,
);
assert.match(
  repository,
  /payment_method: expensePaymentMethod\(expense\.method\)/,
);

console.log("expense payment method: 7/7 PASS");
