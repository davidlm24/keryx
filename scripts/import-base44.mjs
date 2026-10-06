#!/usr/bin/env node
// One-off import of the Base44 data into the desktop app's local database.
//
// Reads every entity through the Base44 SDK (so pagination and auth match
// what the old app did) and writes it into keryx.db with the original ids and
// timestamps, so cross-references (song_id, serviceId, playlist.songs, ...)
// survive. Re-running replaces rows with the same id; nothing is deleted.
//
// Usage (close KERYX first):
//   npm i --no-save @base44/sdk
//   BASE44_APP_ID=... BASE44_ACCESS_TOKEN=... npm run db:import -- [--dry-run] [--only Song,Service] [--db path]
//
// Getting a Base44 token: log in to the old app in a browser and copy
// localStorage["base44_access_token"] from devtools.
//
// The database defaults to %APPDATA%/KERYX/keryx.db (or $KERYX_DATA_DIR),
// the same file the app opens.
//
// Also imported: the logged-in Base44 user's branding (logo, colours,
// background) into the local operator profile.
// Not imported: uploaded files. Rows keep their media.base44.com URLs, which
// work online for as long as Base44 serves them.

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createStore, PROFILE_ID } = require("../electron/db/store.cjs");
const schema = require("../electron/db/schema.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const dryRun = flag("--dry-run");
const only = option("--only") ? new Set(option("--only").split(",")) : null;
const dataDir = process.env.KERYX_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "KERYX");
const dbFile = option("--db") || path.join(dataDir, "keryx.db");

const env = (name) => {
    const v = process.env[name];
    if (!v) {
        console.error(`Missing ${name}. See the comment at the top of scripts/import-base44.mjs.`);
        process.exit(1);
    }
    return v;
};

const { createClient } = await import("@base44/sdk").catch(() => {
    console.error("Run `npm i --no-save @base44/sdk` first.");
    process.exit(1);
});

const base44 = createClient({
    appId: env("BASE44_APP_ID"),
    serverUrl: process.env.BASE44_SERVER_URL || "https://app.base44.com",
    token: env("BASE44_ACCESS_TOKEN"),
    requiresAuth: true,
});

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

// Base44 stored "" for empty dates; keep them empty rather than as "".
function clean(entity, record) {
    const columns = schema.entities[entity].columns;
    const row = {};
    for (const [key, value] of Object.entries(record)) {
        if (!columns[key]) continue;
        row[key] = value === "" && /date|_at$/.test(key) ? null : value;
    }
    return row;
}

if (!dryRun) fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const unknown = new Set();
const store = dryRun ? null : createStore({ file: dbFile, schema, log: (m) => unknown.add(m) });

const entities = Object.keys(schema.entities)
    .filter((name) => name !== "User")
    .filter((name) => !only || only.has(name));

console.log(`${dryRun ? "Dry run against" : "Importing into"} ${dbFile}\n`);
let total = 0;
for (const entity of entities) {
    let records;
    try {
        records = await fetchAll(entity);
    } catch (err) {
        console.error(`  ${entity}: read failed — ${err.message}`);
        continue;
    }
    total += records.length;
    console.log(`${entity.padEnd(22)} ${String(records.length).padStart(6)} rows${dryRun ? "  (dry run)" : ""}`);
    if (dryRun || records.length === 0) continue;
    try {
        store.importRows(entity, records.map((r) => clean(entity, r)));
    } catch (err) {
        console.error(`  ${entity}: write failed — ${err.message}`);
    }
}

if (!only || only.has("User")) {
    try {
        const me = await base44.auth.me();
        const branding = clean("User", me);
        delete branding.id;
        delete branding.created_date;
        delete branding.updated_date;
        if (me.full_name) branding.full_name = me.full_name;
        if (!dryRun) store.call("User", "update", [PROFILE_ID, branding]);
        console.log(`\nProfile: ${Object.keys(branding).join(", ") || "nothing to import"} from ${me.email}`);
    } catch (err) {
        console.error(`\nProfile: could not read the Base44 user — ${err.message}`);
    }
}

if (store) store.close();
console.log(`\n${total} rows ${dryRun ? "found" : "imported"} across ${entities.length} entities.`);
for (const message of unknown) console.log(`  ${message}`);
