// Local data store: the Base44-style entity API (list / filter / get / create
// / update / delete / bulk*) over SQLite, plus change events for subscribe().
//
// Pure Node (node:sqlite), no Electron, so it runs the same inside the app,
// in the import script and under `node --test`.
//
// Where the old Supabase adapter and Base44 behaved differently, this follows
// Base44, because that is what the pages were written against:
//   - a filter value of `undefined` is ignored (Base44 sent queries as JSON,
//     which drops it), not turned into IS NULL
//   - $ne / $nin match rows where the field is empty, like Mongo
//   - empty values sort first ascending and last descending (SQLite default)

const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const SYSTEM_FIELDS = new Set(["id", "created_date", "updated_date", "created_by", "created_by_id"]);
const SQL_TYPES = { text: "TEXT", real: "REAL", integer: "INTEGER", boolean: "INTEGER", json: "TEXT" };

// Lookups the pages make often enough to need an index: a Bible chapter by
// version, book and chapter (31k verses per installed version).
const INDEXES = {
    bible_verse: [["version", "book", "chapter", "verse"]],
};

const PROFILE_ID = "local";
// The operator profile starts on the KERYX palette, not the lime defaults in
// User.jsonc.
const PROFILE_DEFAULTS = {
    full_name: "Operador",
    language: "pt",
    primary_color: "#7d8470",
    secondary_color: "#c9a86a",
    navbar_primary_color: "#7d8470",
    navbar_secondary_color: "#c9a86a",
    device_mode: "desktop",
};

class StoreError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = "StoreError";
        this.status = status;
    }
}

const quote = (ident) => '"' + String(ident).replace(/"/g, '""') + '"';
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isTruthyFlag = (v) => v === true || v === 1 || v === "true" || v === "1";

function encode(column, value) {
    if (value === undefined || value === null) return null;
    // Dates survive IPC as Date objects; store them as ISO strings.
    if (value instanceof Date) value = Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (value === null) return null;
    switch (column.type) {
        case "boolean":
            return isTruthyFlag(value) ? 1 : 0;
        case "json":
            return JSON.stringify(value);
        case "real":
        case "integer":
            if (typeof value === "number") return Number.isFinite(value) ? value : null;
            if (typeof value === "boolean") return value ? 1 : 0;
            if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
            return typeof value === "string" ? value : null;
        default:
            if (typeof value === "string") return value;
            if (typeof value === "object") return JSON.stringify(value);
            return String(value);
    }
}

function decode(column, value) {
    if (value === null || value === undefined) return null;
    if (column.type === "boolean") return value === 1 || value === true;
    if (column.type === "json" && typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
}

function toIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function createStore({ file, schema, log = console.warn }) {
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");

    // Substring match for $regex that ignores case and accents, so "coracao"
    // finds "Coração" (SQLite's LIKE folds ASCII case only).
    const fold = (text) => String(text).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
    db.function("keryx_contains", { deterministic: true }, (value, needle) => {
        if (value === null || needle === null) return 0;
        return fold(value).includes(fold(needle)) ? 1 : 0;
    });

    const statements = new Map();
    const prepare = (sql) => {
        let stmt = statements.get(sql);
        if (!stmt) {
            stmt = db.prepare(sql);
            statements.set(sql, stmt);
        }
        return stmt;
    };

    const listeners = new Set();
    const warned = new Set();

    // -- Schema: create missing tables and add missing columns. Additive only;
    // a renamed or removed field leaves its old column in place.
    for (const def of Object.values(schema.entities)) {
        const columns = Object.entries(def.columns).map(([name, col]) =>
            name === "id" ? `${quote(name)} TEXT PRIMARY KEY` : `${quote(name)} ${SQL_TYPES[col.type]}`);
        db.exec(`CREATE TABLE IF NOT EXISTS ${quote(def.table)} (${columns.join(", ")})`);
        const existing = new Set(db.prepare(`PRAGMA table_info(${quote(def.table)})`).all().map((r) => r.name));
        for (const [name, col] of Object.entries(def.columns)) {
            if (!existing.has(name)) db.exec(`ALTER TABLE ${quote(def.table)} ADD COLUMN ${quote(name)} ${SQL_TYPES[col.type]}`);
        }
        for (const columns of INDEXES[def.table] || []) {
            const name = `${def.table}_${columns.join("_")}`;
            db.exec(`CREATE INDEX IF NOT EXISTS ${quote(name)} ON ${quote(def.table)} (${columns.map(quote).join(", ")})`);
        }
    }

    const entityDef = (entity) => {
        const def = schema.entities[entity];
        if (!def) throw new StoreError(`Entidade desconhecida: ${entity}.`, 400);
        return def;
    };

    const decodeRow = (def, row) => {
        if (!row) return null;
        const out = {};
        for (const [name, value] of Object.entries(row)) {
            const col = def.columns[name];
            out[name] = col ? decode(col, value) : value;
        }
        return out;
    };

    // Unknown fields are dropped, not rejected: forms carry stray UI state and
    // a failed save mid-service is worse than a field that wasn't stored.
    function prepareWrite(entity, def, data, keepSystem) {
        if (!isPlainObject(data)) throw new StoreError("Dados inválidos.", 400);
        const out = {};
        for (const [key, value] of Object.entries(data)) {
            if (value === undefined) continue;
            const col = def.columns[key];
            if (!col) {
                const tag = `${entity}.${key}`;
                if (!warned.has(tag)) {
                    warned.add(tag);
                    log(`[keryx-db] campo desconhecido ignorado: ${tag}`);
                }
                continue;
            }
            if (!keepSystem && SYSTEM_FIELDS.has(key)) continue;
            out[key] = encode(col, value);
        }
        return out;
    }

    function getRow(def, id) {
        return decodeRow(def, prepare(`SELECT * FROM ${quote(def.table)} WHERE id = ?`).get(String(id)));
    }

    function insert(entity, def, data, { keepSystem = false, replace = false } = {}) {
        const row = prepareWrite(entity, def, data, keepSystem);
        const now = new Date().toISOString();
        if (row.id == null || row.id === "") row.id = crypto.randomUUID();
        row.created_date = toIso(row.created_date) || now;
        row.updated_date = toIso(row.updated_date) || row.created_date;
        for (const [name, col] of Object.entries(def.columns)) {
            if (!(name in row) && col.default !== undefined) row[name] = encode(col, col.default);
        }
        const names = Object.keys(row);
        const verb = replace ? "INSERT OR REPLACE" : "INSERT";
        try {
            prepare(`${verb} INTO ${quote(def.table)} (${names.map(quote).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`)
                .run(...names.map((n) => row[n]));
        } catch (err) {
            if (/UNIQUE constraint failed/.test(err.message)) throw new StoreError("Já existe um registro com este id.", 409);
            throw err;
        }
        return getRow(def, row.id);
    }

    function update(entity, def, id, data) {
        const row = prepareWrite(entity, def, data, false);
        row.updated_date = new Date().toISOString();
        const names = Object.keys(row);
        const result = prepare(`UPDATE ${quote(def.table)} SET ${names.map((n) => `${quote(n)} = ?`).join(", ")} WHERE id = ?`)
            .run(...names.map((n) => row[n]), String(id));
        if (result.changes === 0) throw new StoreError("Registro não encontrado.", 404);
        return getRow(def, id);
    }

    // -- Reads ----------------------------------------------------------------

    function inList(sqlCol, col, values, params, negate) {
        if (!Array.isArray(values)) throw new StoreError("$in/$nin precisam de uma lista.", 400);
        if (values.length === 0) return negate ? "1" : "0";
        for (const v of values) params.push(encode(col, v));
        const list = `${sqlCol} IN (${values.map(() => "?").join(", ")})`;
        return negate ? `(${sqlCol} IS NULL OR NOT ${list})` : list;
    }

    function compileOperator(sqlCol, col, op, value, params) {
        switch (op) {
            case "$eq":
                if (value === null) return `${sqlCol} IS NULL`;
                params.push(encode(col, value));
                return `${sqlCol} = ?`;
            case "$ne":
                params.push(encode(col, value));
                return `${sqlCol} IS NOT ?`;
            case "$gt":
            case "$gte":
            case "$lt":
            case "$lte":
                params.push(encode(col, value));
                return `${sqlCol} ${{ $gt: ">", $gte: ">=", $lt: "<", $lte: "<=" }[op]} ?`;
            case "$in":
                return inList(sqlCol, col, value, params, false);
            case "$nin":
                return inList(sqlCol, col, value, params, true);
            case "$regex":
                params.push(value instanceof RegExp ? value.source : String(value));
                return `keryx_contains(${sqlCol}, ?) = 1`;
            case "$options":
                return "1";
            case "$exists":
                return value ? `${sqlCol} IS NOT NULL` : `${sqlCol} IS NULL`;
            default:
                throw new StoreError(`Operador '${op}' não é suportado.`, 400);
        }
    }

    function compileFilter(entity, def, query, params) {
        if (query === undefined || query === null) return "";
        if (!isPlainObject(query)) throw new StoreError("Filtro inválido.", 400);
        const parts = [];
        for (const [field, value] of Object.entries(query)) {
            if (value === undefined) continue;
            if (field.startsWith("$")) throw new StoreError(`Filtro '${field}' não é suportado.`, 400);
            const col = def.columns[field];
            if (!col) throw new StoreError(`Campo '${field}' não existe em ${entity}.`, 400);
            const sqlCol = quote(field);
            if (value === null) {
                parts.push(`${sqlCol} IS NULL`);
            } else if (Array.isArray(value)) {
                parts.push(inList(sqlCol, col, value, params, false));
            } else if (value instanceof RegExp) {
                parts.push(compileOperator(sqlCol, col, "$regex", value, params));
            } else if (isPlainObject(value)) {
                for (const [op, v] of Object.entries(value)) parts.push(compileOperator(sqlCol, col, op, v, params));
            } else {
                params.push(encode(col, value));
                parts.push(`${sqlCol} = ?`);
            }
        }
        return parts.join(" AND ");
    }

    function compileOrder(entity, def, sort) {
        if (typeof sort !== "string" || sort.trim() === "") return " ORDER BY rowid";
        const desc = sort.startsWith("-");
        const field = sort.replace(/^[-+]/, "");
        if (!def.columns[field]) throw new StoreError(`Campo '${field}' não existe em ${entity}.`, 400);
        const dir = desc ? "DESC" : "ASC";
        return ` ORDER BY ${quote(field)} ${dir}, rowid ${dir}`;
    }

    function compileRange(limit, skip, params) {
        const n = Number(limit);
        const offset = Math.max(0, Math.floor(Number(skip) || 0));
        if (Number.isFinite(n) && n > 0) {
            params.push(Math.floor(n), offset);
            return " LIMIT ? OFFSET ?";
        }
        if (offset > 0) {
            params.push(offset);
            return " LIMIT -1 OFFSET ?";
        }
        return "";
    }

    // Both read forms Base44 offered: positional (sort, limit, skip) returns an
    // array; an options object ({ sort, limit, skip }) returns a page.
    function read(entity, def, query, sort, limit, skip) {
        const paged = isPlainObject(sort);
        const opts = paged ? sort : { sort, limit, skip };
        const params = [];
        const where = compileFilter(entity, def, query, params);
        const sql = `SELECT * FROM ${quote(def.table)}`
            + (where ? ` WHERE ${where}` : "")
            + compileOrder(entity, def, opts.sort)
            + compileRange(opts.limit, opts.skip, params);
        const rows = prepare(sql).all(...params).map((r) => decodeRow(def, r));
        return paged ? { items: rows, next_cursor: null } : rows;
    }

    // -- Writes, events, transactions -------------------------------------------

    function emit(events) {
        for (const event of events) {
            for (const listener of listeners) {
                try {
                    listener(event);
                } catch (err) {
                    log(`[keryx-db] erro num ouvinte de alterações: ${err.message}`);
                }
            }
        }
    }

    const event = (entity, type, data) => ({ entity, type, id: data.id, data, timestamp: new Date().toISOString() });

    function transaction(fn) {
        db.exec("BEGIN");
        try {
            const result = fn();
            db.exec("COMMIT");
            return result;
        } catch (err) {
            db.exec("ROLLBACK");
            throw err;
        }
    }

    const ops = {
        list(entity, def, [sort, limit, skip]) {
            return read(entity, def, undefined, sort, limit, skip);
        },
        filter(entity, def, [query, sort, limit, skip]) {
            return read(entity, def, query, sort, limit, skip);
        },
        get(entity, def, [id]) {
            const row = getRow(def, id);
            if (!row) throw new StoreError("Registro não encontrado.", 404);
            return row;
        },
        create(entity, def, [data]) {
            const row = insert(entity, def, data);
            emit([event(entity, "create", row)]);
            return row;
        },
        bulkCreate(entity, def, [rows]) {
            if (!Array.isArray(rows)) throw new StoreError("bulkCreate precisa de uma lista.", 400);
            const created = transaction(() => rows.map((data) => insert(entity, def, data)));
            emit(created.map((row) => event(entity, "create", row)));
            return created;
        },
        update(entity, def, [id, data]) {
            const row = update(entity, def, id, data);
            emit([event(entity, "update", row)]);
            return row;
        },
        bulkUpdate(entity, def, [rows]) {
            if (!Array.isArray(rows)) throw new StoreError("bulkUpdate precisa de uma lista.", 400);
            const updated = transaction(() => rows.map((r) => {
                if (!isPlainObject(r) || r.id == null) throw new StoreError("Cada item precisa de um id.", 400);
                const { id, ...changes } = r;
                return update(entity, def, id, changes);
            }));
            emit(updated.map((row) => event(entity, "update", row)));
            return updated;
        },
        delete(entity, def, [id]) {
            const old = getRow(def, id);
            if (old) {
                prepare(`DELETE FROM ${quote(def.table)} WHERE id = ?`).run(String(id));
                emit([event(entity, "delete", old)]);
            }
            return { success: true };
        },
    };

    function call(entity, op, args = []) {
        const def = entityDef(entity);
        const fn = Object.prototype.hasOwnProperty.call(ops, op) ? ops[op] : null;
        if (!fn) throw new StoreError(`Operação desconhecida: ${op}.`, 400);
        if (!Array.isArray(args)) throw new StoreError("Argumentos inválidos.", 400);
        return fn(entity, def, args);
    }

    // Import keeps ids and timestamps so cross-references survive; re-running
    // replaces rows with the same id. Emits no events.
    function importRows(entity, rows) {
        const def = entityDef(entity);
        return transaction(() => rows.map((data) => insert(entity, def, data, { keepSystem: true, replace: true }))).length;
    }

    // The single local operator profile behind auth.me() and entities.User.
    db.prepare(`INSERT OR IGNORE INTO ${quote(schema.entities.User.table)} (id, created_date, updated_date, ${Object.keys(PROFILE_DEFAULTS).map(quote).join(", ")}) VALUES (?, ?, ?, ${Object.keys(PROFILE_DEFAULTS).map(() => "?").join(", ")})`)
        .run(PROFILE_ID, new Date().toISOString(), new Date().toISOString(), ...Object.values(PROFILE_DEFAULTS));

    // { value: rowCount } for one column, e.g. installed Bible versions.
    function countBy(entity, column) {
        const def = entityDef(entity);
        if (!def.columns[column]) throw new StoreError(`Campo '${column}' não existe em ${entity}.`, 400);
        const rows = prepare(`SELECT ${quote(column)} AS value, COUNT(*) AS n FROM ${quote(def.table)} GROUP BY ${quote(column)}`).all();
        return Object.fromEntries(rows.filter((r) => r.value !== null).map((r) => [r.value, r.n]));
    }

    // A consistent copy of the whole database while it is in use (VACUUM INTO
    // takes its own read transaction); the target must not exist.
    function backupTo(target) {
        db.prepare("VACUUM INTO ?").run(target);
    }

    return {
        call,
        importRows,
        countBy,
        backupTo,
        onChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        close() {
            db.close();
        },
    };
}

module.exports = { createStore, StoreError, PROFILE_ID };
