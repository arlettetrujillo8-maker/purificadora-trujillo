const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { safeRandomUUID } = require("../js/safe-uuid.js");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const client = fs.readFileSync(path.join(root, "js/data/supabase-client.js"), "utf8");
const repositoryUtils = fs.readFileSync(path.join(root, "js/data/repository-utils.js"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");

const nativeUuid = "11111111-2222-4333-8444-555555555555";
assert.equal(safeRandomUUID({ randomUUID: () => nativeUuid }), nativeUuid);

const fallbackUuid = safeRandomUUID({
  getRandomValues(bytes) {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
    return bytes;
  },
});
assert.match(
  fallbackUuid,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);
assert.throws(() => safeRandomUUID({}), /generador criptogr/);

assert.match(html, /safe-uuid\.js\?v=20260815-icono-ruta-pickup/);
assert.match(sw, /js\/safe-uuid\.js/);
assert.match(client, /PurificadoraCrypto\?\.safeRandomUUID/);
assert.match(repositoryUtils, /PurificadoraCrypto\.safeRandomUUID\(\)/);
assert.match(app, /PurificadoraCrypto\.safeRandomUUID\(\)/);
assert.doesNotMatch(client + repositoryUtils + app, /crypto\.randomUUID/);
assert.doesNotMatch(client + repositoryUtils + app, /Math\.random/);

console.log("safe-uuid: 11/11 PASS");
