const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const store = fs.readFileSync(path.join(root, "js/data/operational-store.js"), "utf8");
const client = fs.readFileSync(path.join(root, "js/data/supabase-client.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "js/v3/bootstrap.js"), "utf8");

assert.match(html, /id="openAdminBtn"[^>]*>[\s\S]*?Administraci/);
assert.match(html, /<h3>Administrador<\/h3>/);
assert.match(html, /id="adminLoginPin"[\s\S]*?minlength="4"/);
assert.doesNotMatch(html, /saveAdminPinBtn|currentAdminPin|newAdminPin|confirmAdminPin/);
assert.doesNotMatch(app, /settings\.adminPin|adminPin:\s*["']/);
assert.match(app, /async function validateEmployeePin\(user, pin\)/);
assert.match(app, /async function requireAdminPin\(pin, user = activeUser\(\)\)[\s\S]*?await validateEmployeePin\(user, pin\)/);
assert.match(app, /\$\("openAdminBtn"\)\.addEventListener\("click", openAdminLogin\)/);
assert.doesNotMatch(app, /if \(state\.central\)\s*(?:return )?unlockAdmin/);
assert.match(app, /if \(!adminMode\) return;[\s\S]*?showView\("diagnostico"\)/);
assert.match(app, /adminPinLockedUntil = Date\.now\(\) \+ 30000/);
assert.match(store, /pinConfigured: Boolean\(item\.pin_configured\)/);
assert.match(bootstrap, /validateOperatorPin: profilesRepository\.validatePin/);
assert.match(client, /persistSession: true/);
assert.match(client, /storage: centralAuthStorage/);
assert.match(client, /sessionStorage\.getItem\(AUTH_STORAGE_KEY\)/);
assert.match(client, /return window\.localStorage\.getItem\(key\)/);
assert.match(client, /autoRefreshToken: true/);
assert.match(client, /localStorage\.setItem\(AUTH_STORAGE_KEY, legacySession\)/);
assert.match(bootstrap, /CENTRAL_CONFIGURED_KEY/);
assert.match(bootstrap, /Sesi[^"']+ central expirada/);
assert.match(html, /id="centralSessionNotice"/);

const logoutStart = app.indexOf("async function logoutEmployee");
const logoutEnd = app.indexOf("function openAdminLogin", logoutStart);
assert.ok(logoutStart >= 0 && logoutEnd > logoutStart);
assert.doesNotMatch(app.slice(logoutStart, logoutEnd), /signOut/);

console.log("admin-access-simplified: 22/22 PASS");
