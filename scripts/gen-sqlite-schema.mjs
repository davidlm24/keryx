#!/usr/bin/env node
// Regenerates electron/db/schema.json from base44/entities/*.jsonc.
// Run after adding or changing a field: npm run db:schema
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { buildSchema } = require("../electron/db/build-schema.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = buildSchema(path.join(root, "base44", "entities"));
const out = path.join(root, "electron", "db", "schema.json");
writeFileSync(out, JSON.stringify(schema, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, out)}: ${Object.keys(schema.entities).length} entities`);
