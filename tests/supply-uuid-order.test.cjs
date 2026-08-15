const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const store = fs.readFileSync(
  path.join(root, "js/data/operational-store.js"),
  "utf8",
);
const repository = fs.readFileSync(
  path.join(root, "js/data/supplies-repository.js"),
  "utf8",
);

assert.match(
  app,
  /id: id \|\| window\.PurificadoraCrypto\.safeRandomUUID\(\),[\s\S]*?name,[\s\S]*?category:/,
);
assert.doesNotMatch(app, /id: id \|\| uid\("supply"\)/);
assert.ok(
  store.indexOf("else if (newSupply)") <
    store.indexOf("else if (newSupplyMovement)"),
  "The supply must be created before any separately detected movement",
);
assert.match(
  store,
  /else if \(newSupply\)\s*await suppliesRepository\.save\(newSupply\)/,
);
assert.match(
  repository,
  /p_supply_id:[\s\S]*?\? supply\.id[\s\S]*?: entityId\(\)/,
);
assert.match(
  repository,
  /initial_stock: Number\(supply\.currentStock \|\| 0\)/,
);

console.log("supply-uuid-order: 6/6 PASS");
