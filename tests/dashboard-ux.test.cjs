const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed++;
}

// 1. Estructura del Inicio accionable.
const kpiAt = html.indexOf('id="dashboardKpis"');
const quickAt = html.indexOf('id="dashboardQuickActions"');
const todayAt = html.indexOf('id="dashboardToday"');
const attentionAt = html.indexOf('id="dashboardAttention"');
ok(kpiAt > 0 && quickAt > kpiAt, "KPIs antes de acciones rápidas");
ok(todayAt > quickAt && attentionAt > todayAt, "Para hoy y Atención después");
ok(html.includes('id="offlineBanner"') && html.includes('id="offlineBannerSync"'), "banner offline persistente");

// 2. Render del Inicio.
ok(app.includes("function statCard("), "helper StatCard");
ok(app.includes("kpiHost.innerHTML"), "KPIs renderizados");
ok(app.includes("quickHost.innerHTML"), "acciones rápidas renderizadas");
ok(app.includes("dueToday(scoped)"), "pedidos del día en Inicio");
ok(app.includes('$("dashboardToday")') && app.includes('$("dashboardAttention")'), "paneles Para hoy y Atención");

// 3. Banner offline conectado a red y cola.
ok(app.includes("function renderOfflineBanner("), "render del banner");
ok(app.includes("function refreshOfflineBanner("), "consulta de cola pendiente");
ok(app.includes("purificadora:queue-changed"), "reacciona a cambios de cola");
ok(/updateOnlineStatus[\s\S]{0,400}refreshOfflineBanner/.test(app), "se actualiza al cambiar conexión");

// 4. Estilos y responsive.
ok(css.includes(".stat-grid") && css.includes(".stat-card"), "estilos StatCard");
ok(css.includes(".quick-action-row"), "estilos de acciones rápidas");
ok(css.includes(".offline-banner"), "estilos del banner");
ok(/@media \(max-width: 640px\)[\s\S]{0,400}\.stat-grid/.test(css), "responsive móvil");

console.log(`dashboard-ux: ${passed} PASS`);
