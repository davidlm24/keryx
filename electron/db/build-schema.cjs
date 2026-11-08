// Builds the local SQLite schema from base44/entities/*.jsonc, the same field
// docs the Supabase tables were generated from. The result is committed as
// schema.json (npm run db:schema); a test fails if the two drift apart.

const fs = require("node:fs");
const path = require("node:path");

// Columns every table has. Pages sort and filter on these.
const SYSTEM_COLUMNS = {
    id: { type: "text" },
    created_date: { type: "text" },
    updated_date: { type: "text" },
    created_by: { type: "text" },
    created_by_id: { type: "text" },
};

// The desktop app has one local operator profile instead of user accounts.
// It keeps the User entity's custom fields (branding, device mode) plus the
// identity fields pages read from auth.me().
const PROFILE_EXTRA_COLUMNS = {
    full_name: { type: "text" },
    email: { type: "text" },
};

const toTable = (entity) => (entity === "User" ? "profile" : entity.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());

function columnType(def) {
    switch (def.type) {
        case "number":
            return "real";
        case "integer":
            return "integer";
        case "boolean":
            return "boolean";
        case "array":
        case "object":
            return "json";
        default:
            return "text";
    }
}

function buildSchema(entitiesDir) {
    const entities = {};
    const files = fs.readdirSync(entitiesDir).filter((f) => f.endsWith(".jsonc")).sort();
    for (const file of files) {
        const doc = JSON.parse(fs.readFileSync(path.join(entitiesDir, file), "utf8"));
        const columns = { ...SYSTEM_COLUMNS };
        for (const [name, def] of Object.entries(doc.properties || {})) {
            const column = { type: columnType(def) };
            if (def.default !== undefined) column.default = def.default;
            columns[name] = column;
        }
        if (doc.name === "User") Object.assign(columns, PROFILE_EXTRA_COLUMNS);
        entities[doc.name] = { table: toTable(doc.name), columns };
    }
    return { entities };
}

module.exports = { buildSchema, toTable };
