const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bootstrap = fs.readFileSync(path.join(root, "js/v3/bootstrap.js"), "utf8");
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260811053244_enable_operational_realtime.sql",
  ),
  "utf8",
);

const checks = [
  [
    bootstrap.includes('{ event: "*", schema: "public", table }'),
    "la suscripción cubre INSERT/UPDATE/DELETE por tabla",
  ],
  [
    ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].every((status) =>
      bootstrap.includes(status),
    ),
    "el diagnóstico conserva los estados exactos de Realtime",
  ],
  [
    bootstrap.includes("CENTRAL_REFRESH_INTERVAL_MS = 10000") &&
      bootstrap.includes('hydrateOperationalState("polling")'),
    "polling consulta y aplica la proyección central cada 10 segundos",
  ],
  [
    bootstrap.includes('hydrateOperationalState("focus")') &&
      bootstrap.includes('hydrateOperationalState("visibility")'),
    "foco y visibilidad disparan refresco central",
  ],
  [
    bootstrap.includes("app.applyCentralState(projection, store.profile)"),
    "cada hidratación actualiza state y render mediante applyCentralState",
  ],
  [
    migration.includes("pg_publication_tables") &&
      migration.includes("alter publication supabase_realtime add table"),
    "la publicación Realtime se configura con una migración idempotente",
  ],
];

checks.forEach(([condition, message], index) => {
  assert.ok(condition, `QA ${index + 1}: ${message}`);
  console.log(`PASS ${index + 1}/6: ${message}`);
});
