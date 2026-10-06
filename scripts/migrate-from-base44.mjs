#!/usr/bin/env node
// One-off import of the Base44 data into the Supabase project.
//
// Reads every entity through the Base44 SDK (so pagination and auth match
// what the old app did) and upserts rows into the matching Postgres table
// with the service role, keeping the original ids so cross-references
// (song_id, serviceId, playlist.songs, ...) survive.
//
// Usage:
//   npm i --no-save @base44/sdk
//   BASE44_APP_ID=... BASE44_ACCESS_TOKEN=... \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/migrate-from-base44.mjs [--dry-run] [--only Song,Service]
//
// Getting a Base44 token: log in to the old app in a browser and copy
// localStorage["base44_access_token"] from devtools.
//
// Not migrated:
//   - User accounts. Passwords can't be exported; people register again.
//     Their theme settings (User custom fields) are therefore lost too.
//   - Uploaded files. Rows keep their media.base44.com URLs, which work for
//     as long as Base44 serves them. Re-upload through the app when needed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENTITY_DIR = path.join(here, "..", "base44", "entities");

const env = (name, required = true) => {
  const v = process.env[name];
  if (!v && required) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return v;
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyArg = args[args.indexOf("--only") + 1];
const only = args.includes("--only") && onlyArg ? new Set(onlyArg.split(",")) : null;

const BASE44_APP_ID = env("BASE44_APP_ID");
const BASE44_ACCESS_TOKEN = env("BASE44_ACCESS_TOKEN");
const BASE44_SERVER_URL = process.env.BASE44_SERVER_URL || "https://app.base44.com";
const SUPABASE_URL = env("SUPABASE_URL", !dryRun);
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", !dryRun);

const { createClient } = await import("@base44/sdk").catch(() => {
  console.error("Run `npm i --no-save @base44/sdk` first.");
  process.exit(1);
});

const base44 = createClient({
  appId: BASE44_APP_ID,
  serverUrl: BASE44_SERVER_URL,
  token: BASE44_ACCESS_TOKEN,
  requiresAuth: true,
});

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const SYSTEM_FIELDS = ["id", "created_date", "updated_date", "created_by", "created_by_id"];

// Column list per table comes from the same schemas the migration was
// generated from, so unknown keys (Base44 internals like is_sample) are
// dropped instead of failing the insert.
const schemas = Object.fromEntries(
  fs.readdirSync(ENTITY_DIR)
    .filter((f) => f.endsWith(".jsonc"))
    .map((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(ENTITY_DIR, f), "utf8"));
      return [j.name, j];
    }),
);

function toRow(entity, record) {
  const props = schemas[entity].properties || {};
  const row = {};
  for (const k of SYSTEM_FIELDS) if (record[k] !== undefined) row[k] = record[k];
  for (const [k, def] of Object.entries(props)) {
    let v = record[k];
    if (v === undefined) continue;
    // Base44 stored "" for empty dates; Postgres date/timestamptz reject it.
    if (v === "" && (def.format === "date" || def.format === "date-time")) v = null;
    row[k] = v;
  }
  return row;
}

async function fetchAll(entity) {
  const out = [];
  const pageSize = 500;
  for (let skip = 0; ; skip += pageSize) {
    const page = await base44.entities[entity].list(undefined, pageSize, skip);
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`${table} batch ${i / 200 + 1}: HTTP ${res.status} ${await res.text()}`);
    }
  }
}

const entities = Object.keys(schemas)
  .filter((n) => n !== "User")
  .filter((n) => !only || only.has(n));

let total = 0;
for (const entity of entities) {
  const table = snake(entity);
  let records;
  try {
    records = await fetchAll(entity);
  } catch (e) {
    console.error(`  ${entity}: read failed — ${e.message}`);
    continue;
  }
  const rows = records.map((r) => toRow(entity, r));
  total += rows.length;
  console.log(`${entity.padEnd(22)} ${String(rows.length).padStart(6)} rows -> ${table}${dryRun ? "  (dry run)" : ""}`);
  if (dryRun || rows.length === 0) continue;
  try {
    await upsert(table, rows);
  } catch (e) {
    console.error(`  ${entity}: ${e.message}`);
  }
}
console.log(`\n${total} rows ${dryRun ? "found" : "imported"} across ${entities.length} entities.`);
if (only === null) {
  console.log("Skipped: User (accounts and theme settings can't be exported; people register again).");
}
