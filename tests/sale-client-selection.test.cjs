const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSaleClientSelection,
} = require("../js/sale-client-selection.js");

const registered = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "wera",
  price: null,
  active: true,
};
const special = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Cliente especial",
  price: 8,
  active: true,
};

test("seleccionar un cliente registrado conserva UUID y objeto para resumen y fiado", () => {
  const selection = createSaleClientSelection();
  selection.select(registered);

  assert.equal(selection.clientId, registered.id);
  assert.equal(selection.client.name, "wera");
  assert.equal(Boolean(selection.clientId), true);
});

test("escribir un nombre sin seleccionar no genera client_id", () => {
  const selection = createSaleClientSelection();
  const typedText = "wera";

  assert.equal(typedText, registered.name);
  assert.equal(selection.clientId, null);
  assert.equal(Boolean(selection.clientId), false);
});

test("un identificador local o textual no se acepta como UUID de cliente", () => {
  const selection = createSaleClientSelection();
  selection.select({ id: "cli_wera", name: "wera", active: true });

  assert.equal(selection.clientId, null);
  assert.equal(selection.client, null);
});

test("seleccionar cliente especial conserva el precio correspondiente", () => {
  const selection = createSaleClientSelection();
  selection.select(special);

  assert.equal(selection.client.price, 8);
});

test("cambiar el texto después de seleccionar invalida UUID y objeto", () => {
  const selection = createSaleClientSelection();
  selection.select(registered);
  selection.clear();

  assert.equal(selection.clientId, null);
  assert.equal(selection.client, null);
});
