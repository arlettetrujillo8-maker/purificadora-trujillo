const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { safeRandomUUID } = require("../js/safe-uuid.js");

const root = path.resolve(__dirname, "..");
const clientPath = path.join(root, "js/data/supabase-client.js");
const source = fs.readFileSync(clientPath, "utf8");
const build = "20260816-reportes-duplicado-fix";

assert.doesNotMatch(source, /crypto\.randomUUID\s*\(/);
assert.doesNotMatch(source, /\.randomUUID\s*\(/);
assert.match(source, /PurificadoraCrypto\?\.safeRandomUUID/);
assert.match(source, new RegExp(`SUPABASE_CLIENT_BUILD = "${build}"`));

const executable = source
  .replace(/^import .*?;\r?\n/gm, "")
  .replace(/^export \{ SUPABASE_CONFIG \};?\r?\n?/gm, "")
  .replace(/\bexport\s+(?=(const|function)\b)/g, "")
  .concat(
    "\nreturn { getDeviceId, getDeviceName, supabase, SUPABASE_CLIENT_BUILD };",
  );

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const localStorage = memoryStorage();
const sessionStorage = memoryStorage();
const cryptoWithoutRandomUuid = {
  randomUUID: undefined,
  getRandomValues(bytes) {
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = index + 1;
    return bytes;
  },
};
const isolatedGlobal = {
  crypto: cryptoWithoutRandomUuid,
  PurificadoraCrypto: {
    safeRandomUUID: () => safeRandomUUID(cryptoWithoutRandomUuid),
  },
};
const windowMock = { localStorage, sessionStorage };
const navigatorMock = { platform: "Android" };
let createClientCalls = 0;
const createClient = (_url, _key, options) => {
  createClientCalls += 1;
  assert.notEqual(options.auth.storage, localStorage);
  options.auth.storage.setItem("storage-check", "ok");
  assert.equal(localStorage.getItem("storage-check"), "ok");
  assert.equal(options.auth.persistSession, true);
  return { auth: {} };
};

const loadClient = new Function(
  "window",
  "localStorage",
  "navigator",
  "globalThis",
  "createClient",
  "SUPABASE_CONFIG",
  executable,
);

let loaded;
assert.doesNotThrow(() => {
  loaded = loadClient(
    windowMock,
    localStorage,
    navigatorMock,
    isolatedGlobal,
    createClient,
    { url: "https://example.supabase.co", publishableKey: "publishable" },
  );
});
assert.equal(createClientCalls, 1);
assert.equal(loaded.SUPABASE_CLIENT_BUILD, build);
assert.match(
  loaded.getDeviceId(),
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

const frontendSources = fs
  .readdirSync(path.join(root, "js"), { recursive: true })
  .filter((name) => name.endsWith(".js") && name !== "safe-uuid.js")
  .map((name) => fs.readFileSync(path.join(root, "js", name), "utf8"))
  .join("\n");
assert.doesNotMatch(frontendSources, /(?:crypto\.)?randomUUID\s*\(/);

console.log("supabase-client UUID load without randomUUID: 8/8 PASS");
