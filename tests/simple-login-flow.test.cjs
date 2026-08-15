const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "js/v3/bootstrap.js"), "utf8");
const client = fs.readFileSync(path.join(root, "js/data/supabase-client.js"), "utf8");

assert.match(html, /id="accessChoiceDialog"[\s\S]*?Entrar como Administrador[\s\S]*?Entrar como Usuario/);
assert.match(html, /id="v3AuthEmail"[\s\S]*?autocomplete="username"/);
assert.match(html, /id="v3AuthPassword"[\s\S]*?autocomplete="current-password"/);
assert.match(html, /La sesión quedará conectada en este dispositivo\./);
assert.doesNotMatch(html, /id="v3RememberDevice"/);
assert.match(app, /function beginAccessFlow\(flow\)/);
assert.match(app, /PENDING_ACCESS_KEY/);
assert.match(app, /function resumePendingAccessFlow\(\)/);
assert.match(app, /function enterAsCentralAdministrator\(\)/);
assert.match(app, /if \(flow === "admin"\)[\s\S]*?enterAsCentralAdministrator\(\)/);
assert.doesNotMatch(app, /if \(flow === "admin"\) openAdminEntryLogin\(\)/);
assert.match(app, /\$\("v3AuthDialog"\)\.addEventListener\("close"[\s\S]*?setPendingAccessFlow\(null\)/);
assert.match(app, /function openAdminEntryLogin\(\)/);
assert.match(app, /adminLoginPurpose === "entry"[\s\S]*?employeeSession = \{ userId: user\.id/);
assert.match(app, /function requestAdminReauth\(actionLabel\)/);
assert.match(app, /requestAdminReauth\("anular esta venta"\)/);
assert.doesNotMatch(app, /requestAdminReauth\("guardar usuarios o roles"\)/);
assert.match(app, /requestAdminReauth\("guardar precio y configuración"\)/);
assert.match(app, /u\.active && u\.role !== "administrador"/);
assert.match(bootstrap, /new CustomEvent\("purificadora:central-access"/);
assert.match(bootstrap, /emitCentralAccessState\(true, source\)/);
assert.match(client, /persistSession: true/);
assert.match(client, /autoRefreshToken: true/);
assert.match(client, /storage: centralAuthStorage/);
assert.match(client, /REMEMBERED_EMAIL_KEY/);
assert.doesNotMatch(client, /password/i);
assert.doesNotMatch(app + bootstrap, /service_role/i);

console.log("simple-login-flow: 27/27 PASS");
