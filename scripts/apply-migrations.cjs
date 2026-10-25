#!/usr/bin/env node
// Aplica migraciones SQL pendientes a Supabase usando la Management API
// (requiere un Personal Access Token, no la service key).
//
//   node scripts/apply-migrations.cjs                 -> plan (dry-run, sin red)
//   node scripts/apply-migrations.cjs --apply         -> aplica TODAS
//   node scripts/apply-migrations.cjs --only 20261025_orders_programados.sql --apply
//   node scripts/apply-migrations.cjs --verify        -> estado de tablas
//
// Variables de entorno:
//   SUPABASE_ACCESS_TOKEN  PAT de https://supabase.com/dashboard/account/tokens
//   SUPABASE_PROJECT_REF   (opcional) por defecto se lee de js/v3/supabase-config.js
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const DESTRUCTIVE = /\b(drop\s+table|truncate|delete\s+from|alter\s+table\s+\w+\s+drop\s+column)\b/i;

function listMigrationFiles(dir = migrationsDir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function readProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const configPath = path.join(root, "js", "v3", "supabase-config.js");
  const text = fs.readFileSync(configPath, "utf8");
  const match = text.match(/projectRef:\s*['"]([a-z0-9]+)['"]/);
  if (!match) throw new Error("No se encontro projectRef en supabase-config.js");
  return match[1];
}

function readMigration(file) {
  const fullPath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(fullPath, "utf8");
  const checksum = crypto.createHash("sha256").update(sql).digest("hex").slice(0, 12);
  return { file, fullPath, sql, bytes: Buffer.byteLength(sql), checksum };
}

function validateMigrationSql(sql) {
  const issues = [];
  if (!sql.trim()) issues.push("archivo vacio");
  if (DESTRUCTIVE.test(sql))
    issues.push("contiene una sentencia destructiva (drop table/truncate/delete)");
  if (!/\b(begin|commit)\b/i.test(sql))
    issues.push("aviso: sin begin/commit visible (se envolvera en transaccion)");
  return issues;
}

function buildPlan(files = listMigrationFiles()) {
  return files.map((file) => {
    const migration = readMigration(file);
    return {
      ...migration,
      sql: undefined,
      issues: validateMigrationSql(migration.sql),
    };
  });
}

async function runQuery(projectRef, token, sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await response.text();
  if (!response.ok)
    throw new Error(`Management API ${response.status}: ${text.slice(0, 400)}`);
  return text;
}

async function verifyTables(projectRef, token) {
  const sql = `select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name in ('routes', 'orders')
    order by table_name;`;
  const raw = await runQuery(projectRef, token, sql);
  return raw.slice(0, 400);
}

function printPlan(plan) {
  console.log(`Migraciones en supabase/migrations (${plan.length}):`);
  for (const item of plan) {
    const warning = item.issues.length ? `  [AVISO: ${item.issues.join("; ")}]` : "";
    console.log(
      `  ${item.file}  ${String(item.bytes).padStart(6)} B  sha256:${item.checksum}${warning}`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
  const apply = args.includes("--apply");
  const verify = args.includes("--verify");
  const allowDestructive = args.includes("--allow-destructive");

  let files = listMigrationFiles();
  if (only) {
    if (!files.includes(only)) {
      console.error(`No existe la migracion: ${only}`);
      process.exit(1);
    }
    files = [only];
  }
  const plan = buildPlan(files);
  printPlan(plan);

  if (!apply && !verify) {
    console.log("\nDry-run: no se ejecuto nada.");
    console.log("Para aplicar: node scripts/apply-migrations.cjs --apply");
    return 0;
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "\nFalta SUPABASE_ACCESS_TOKEN (Personal Access Token de Supabase).",
    );
    console.error(
      "Crealo en https://supabase.com/dashboard/account/tokens y exportalo en la sesion.",
    );
    return 1;
  }
  const projectRef = readProjectRef();
  console.log(`\nProyecto: ${projectRef}`);

  if (verify && !apply) {
    if (!allowDestructive) {
      // verificar es solo lectura
    }
    console.log("Estado de tablas routes/orders:");
    console.log(await verifyTables(projectRef, token));
    return 0;
  }

  for (const item of plan) {
    const destructive = item.issues.some((issue) => issue.includes("destructiva"));
    if (destructive && !allowDestructive) {
      console.error(
        `\n${item.file}: sentencia destructiva detectada. Usa --allow-destructive si es intencional.`,
      );
      return 1;
    }
  }

  for (const item of plan) {
    const migration = readMigration(item.file);
    const wrapped = `begin;\n${migration.sql}\ncommit;`;
    console.log(`\nAplicando ${item.file} (${item.bytes} B)...`);
    await runQuery(projectRef, token, wrapped);
    console.log(`  OK ${item.file}`);
  }

  console.log("\nEstado final de tablas routes/orders:");
  console.log(await verifyTables(projectRef, token));
  console.log("\nMigraciones aplicadas.");
  return 0;
}

module.exports = {
  listMigrationFiles,
  readMigration,
  readProjectRef,
  validateMigrationSql,
  buildPlan,
  DESTRUCTIVE,
};

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error("ERROR:", error.message);
      process.exit(1);
    });
}
