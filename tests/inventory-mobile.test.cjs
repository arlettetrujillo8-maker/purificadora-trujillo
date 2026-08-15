const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const store = fs.readFileSync(
  path.join(root, "js", "data", "operational-store.js"),
  "utf8",
);
const repository = fs.readFileSync(
  path.join(root, "js", "data", "inventory-repository.js"),
  "utf8",
);

test("los formularios de transferencia y ajuste tienen controles exclusivos", () => {
  for (const id of [
    "transferForm",
    "inventoryAdjustForm",
    "transferFrom",
    "transferTo",
    "transferQty",
    "adjustLocation",
    "adjustQty",
    "adjustReason",
  ]) {
    assert.equal(
      (html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length,
      1,
    );
  }
  assert.match(
    html,
    /form="transferForm"[\s\S]*data-inventory-action="transfer"/,
  );
  assert.match(
    html,
    /form="inventoryAdjustForm"[\s\S]*data-inventory-action="adjust"/,
  );
});

test("cada submit usa únicamente los campos de su propio formulario", () => {
  assert.match(app, /form\.id !== "transferForm"/);
  assert.match(app, /form\.elements\.namedItem\("transferFrom"\)/);
  assert.match(app, /form\.id !== "inventoryAdjustForm"/);
  assert.match(app, /form\.elements\.namedItem\("adjustLocation"\)/);
  const adjustmentBlock = app.slice(
    app.indexOf("async function saveInventoryAdjustment"),
    app.indexOf("function renderSupplies"),
  );
  assert.doesNotMatch(
    adjustmentBlock,
    /transferFrom|transferTo|Origen y destino/,
  );
});

test("ajuste y transferencia conservan RPC separadas", () => {
  assert.match(repository, /transfer:[\s\S]*"transfer_inventory"/);
  assert.match(repository, /adjust:[\s\S]*"adjust_inventory"/);
  assert.match(store, /inventoryRepository\.transfer\(/);
  assert.match(store, /inventoryRepository\.adjust\(/);
});

test("Inventario conserva scroll y no enfoca controles durante rerender", () => {
  const renderBlock = app.slice(
    app.indexOf("function renderInventory"),
    app.indexOf("async function saveTransfer"),
  );
  assert.match(renderBlock, /currentView === "inventario"/);
  assert.match(renderBlock, /preservedScrollY = preserveScroll \? window\.scrollY : null/);
  assert.match(renderBlock, /window\.scrollTo\(\{[\s\S]*?top: preservedScrollY[\s\S]*?behavior: "auto"/);
  assert.doesNotMatch(renderBlock, /\.focus\(|scrollIntoView|behavior: "smooth"/);
});

test("navegación solo sube al inicio cuando cambia la vista", () => {
  const showViewBlock = app.slice(
    app.indexOf("function showView"),
    app.indexOf("function bindDialogs"),
  );
  assert.match(showViewBlock, /const isNewNavigation = currentView !== name/);
  assert.match(showViewBlock, /if \(isNewNavigation && window\.scrollY !== 0\)/);
  assert.match(showViewBlock, /if \(!isNewNavigation && window\.scrollY !== preservedScrollY\)/);
  assert.doesNotMatch(showViewBlock, /behavior: "smooth"/);
});

test("rerender no reconstruye selectores sin cambios", () => {
  const populateBlock = app.slice(
    app.indexOf("function populateLocationSelects"),
    app.indexOf("function renderInventory"),
  );
  assert.match(populateBlock, /select\.innerHTML === inventoryOptions/);
  assert.match(populateBlock, /const previousValue = select\.value/);
  assert.match(populateBlock, /select\.value = previousValue/);
});
