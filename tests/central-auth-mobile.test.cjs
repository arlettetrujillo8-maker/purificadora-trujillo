const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bootstrap = fs.readFileSync(path.join(root, "js/v3/bootstrap.js"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const authUi = fs.readFileSync(path.join(root, "js/central-auth-ui.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const dataModules = fs
  .readdirSync(path.join(root, "js/data"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(root, "js/data", name), "utf8"))
  .join("\n");
const moduleGraph = `${bootstrap}\n${dataModules}`;

assert.match(html, /id="v3OpenAuthBtn"[\s\S]*?type="button"[\s\S]*?aria-controls="v3AuthDialog"/);
assert.match(html, /meta name="app-build" content="20260816-sesion-y-inventario-fix"/);
assert.match(html, /id="v3AuthTrace"/);
assert.match(html, /central-auth-ui\.js no cargado/);
assert.match(authUi, /bindStableAuthDelegation\(document\)/);
assert.match(authUi, /#v3OpenAuthBtn, #v3BackendBadge/);
assert.match(authUi, /1\. click recibido/);
assert.match(authUi, /2\. handler ejecutado/);
assert.match(authUi, /3\. openCentralAuthModal\(\) llamado/);
assert.match(authUi, /4\. modal encontrado en DOM/);
assert.match(authUi, /5\. modal marcado visible/);
assert.match(authUi, /6\. render completado/);
assert.match(authUi, /HTMLDialogElement\.prototype\.showModal\.call\(dialog\)/);
assert.match(authUi, /addEventListener\?\.\("error"/);
assert.match(authUi, /addEventListener\?\.\("unhandledrejection"/);
assert.match(bootstrap, /button\.disabled = false/);
assert.match(bootstrap, /client\.auth\.signInWithPassword/);
assert.match(bootstrap, /diagnosticState\.userId = result\.data\.session\.user\.id/);
assert.match(bootstrap, /await hydrateOperationalState\("sign-in"\)/);
assert.match(bootstrap, /startCentralRefresh\(\)/);
assert.match(bootstrap, /App build:/);
assert.match(bootstrap, /Bootstrap build:/);
assert.match(bootstrap, /Central auth UI build:/);
assert.match(bootstrap, /Service-worker\/cache version:/);
assert.match(css, /#v3OpenAuthBtn[\s\S]*?touch-action: manipulation/);
assert.match(sw, /20260816-sesion-y-inventario-fix/);
assert.match(app, /PurificadoraAppScriptBuild = APP_SCRIPT_BUILD/);
assert.match(bootstrap, /APP_SCRIPT_BUILD = window\.PurificadoraAppScriptBuild/);
assert.match(sw, /GET_PURIFICADORA_BUILD/);
assert.match(sw, /operational-store\.js\?v=\$\{BUILD\}/);
assert.match(sw, /profiles-repository\.js\?v=\$\{BUILD\}/);
assert.doesNotMatch(
  moduleGraph,
  /from\s+["'](?:\.{1,2}\/)[^"']+\.js["']/,
  "Todos los módulos locales deben usar una versión para evitar mezclas de caché móvil",
);
assert.match(
  bootstrap,
  /operational-store\.js\?v=20260816-sesion-y-inventario-fix/,
);

const submitStart = bootstrap.indexOf('form.addEventListener("submit"');
const submitEnd = bootstrap.indexOf("recoveryForm?.addEventListener", submitStart);
const submitSource = bootstrap.slice(submitStart, submitEnd);
assert.ok(submitStart >= 0 && submitEnd > submitStart);
assert.match(submitSource, /await signIn\(email, password\)/);
assert.doesNotMatch(authUi, /client\.auth\./);

console.log("central-auth-mobile: 33/33 PASS");
