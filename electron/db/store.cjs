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
const { isSynced, syncRow, SYNC_ENTITIES, LOCAL_USER_FIELDS } = require("./syncScope.cjs");

// Deletes of synced entities leave a mark (entity, id, when) so the delete can
// travel to the church's other computers instead of the row coming back from
// one that still has it. Not an entity: nothing in the app reads it.
const TOMBSTONES = "_tombstone";
// Sync bookkeeping (docs/desktop-architecture.md §8b), none of it an entity:
//   _meta     this database's own values (pc_id: the computer's stable id)
//   _outbox   every change to a synced entity made HERE, in order (seq), for
//             the transport to carry to the other computers
//   _version  the version (at, pc) each synced row is at, so a remote change
//             is compared with the edit it would overwrite, the computer's id
//             breaking ties
const META = "_meta";
const OUTBOX = "_outbox";
const VERSIONS = "_version";
// What a newer KERYX on another computer sends that this version cannot
// store yet (an entity it does not know, fields its tables do not have),
// kept as it came and filled in when a version that knows them opens this
// database (replayParked). Without it, an older computer would lose those
// values, and its next edit would erase them everywhere.
const PARKED = "_parked";
const PARKED_LIMIT = 50000;

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
    db.exec(`CREATE TABLE IF NOT EXISTS ${quote(TOMBSTONES)} (entity TEXT NOT NULL, id TEXT NOT NULL, deleted_at TEXT NOT NULL, PRIMARY KEY (entity, id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS ${quote(META)} (key TEXT PRIMARY KEY, value TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ${quote(OUTBOX)} (seq INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, id TEXT NOT NULL, op TEXT NOT NULL, row TEXT, at TEXT NOT NULL, pc TEXT NOT NULL)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ${quote(VERSIONS)} (entity TEXT NOT NULL, id TEXT NOT NULL, at TEXT NOT NULL, pc TEXT NOT NULL, PRIMARY KEY (entity, id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS ${quote(PARKED)} (entity TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, op TEXT, row TEXT, at TEXT NOT NULL, pc TEXT NOT NULL, PRIMARY KEY (entity, id, kind))`);

    // This computer's id: made once, kept in the database.
    let pcId = db.prepare(`SELECT value FROM ${quote(META)} WHERE key = 'pc_id'`).get()?.value;
    if (!pcId) {
        pcId = crypto.randomUUID();
        db.prepare(`INSERT INTO ${quote(META)} (key, value) VALUES ('pc_id', ?)`).run(pcId);
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
        // A row that exists again is no longer deleted.
        if (isSynced(entity)) prepare(`DELETE FROM ${quote(TOMBSTONES)} WHERE entity = ? AND id = ?`).run(entity, String(row.id));
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

    // -- Sync: outbox and versions ---------------------------------------------

    // The profile's church fields a write sets. The profile is one row of
    // independent preferences, so it syncs field by field: each field has its
    // own version (`local.<field>` in _version) and travels alone.
    const churchFields = (def, data) => Object.keys(data || {})
        .filter((key) => def.columns[key] && data[key] !== undefined && !SYSTEM_FIELDS.has(key) && !LOCAL_USER_FIELDS.has(key));
    const fieldKey = (field) => `${PROFILE_ID}.${field}`;

    function setVersion(entity, id, at, pc) {
        prepare(`INSERT OR REPLACE INTO ${quote(VERSIONS)} (entity, id, at, pc) VALUES (?, ?, ?, ?)`).run(entity, String(id), at, pc);
    }

    const getVersion = (entity, id) => {
        const v = prepare(`SELECT at, pc FROM ${quote(VERSIONS)} WHERE entity = ? AND id = ?`).get(entity, String(id));
        return v ? { at: v.at, pc: v.pc } : null;
    };

    // Whether local changes go to the outbox: only while this computer syncs
    // (main says so, electron/syncControl.cjs). Off, the outbox would grow
    // forever; joining sends everything anyway (snapshot). Versions are kept
    // either way.
    let recording = true;

    // A local change, in the same transaction as the write itself: `data` is
    // what the write set (the whole row for a create). A profile write that
    // touches only this computer's fields (a new density) records nothing.
    function record(entity, def, op, row, at, data = row) {
        if (!isSynced(entity)) return;
        let body = null;
        if (entity === "User") {
            const fields = churchFields(def, data);
            if (!fields.length) return;
            body = { id: row.id };
            for (const field of fields) {
                body[field] = row[field];
                setVersion(entity, fieldKey(field), at, pcId);
            }
        } else {
            if (op === "upsert") body = syncRow(entity, row);
            setVersion(entity, row.id, at, pcId);
        }
        if (!recording) return;
        prepare(`INSERT INTO ${quote(OUTBOX)} (entity, id, op, row, at, pc) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(entity, String(row.id), op, body && JSON.stringify(body), at, pcId);
    }

    // a is newer than b: later, or as late from a computer with a greater id.
    const newer = (a, b) => a.at > b.at || (a.at === b.at && a.pc > b.pc);

    // The version a row (or its delete) is at here. The recorded one wins a
    // tie with the row's own date (a remote change keeps its computer); a
    // later date on the row is a write that bypassed the outbox (importRows).
    function localVersion(entity, id, row) {
        let best = getVersion(entity, id);
        const mark = prepare(`SELECT deleted_at FROM ${quote(TOMBSTONES)} WHERE entity = ? AND id = ?`).get(entity, id);
        const dated = [row && { at: toIso(row.updated_date) || "", pc: pcId }, mark && { at: mark.deleted_at, pc: pcId }];
        for (const v of dated) if (v && (!best || v.at > best.at)) best = v;
        return best;
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
            const row = transaction(() => {
                const created = insert(entity, def, data);
                record(entity, def, "upsert", created, created.updated_date);
                return created;
            });
            emit([event(entity, "create", row)]);
            return row;
        },
        bulkCreate(entity, def, [rows]) {
            if (!Array.isArray(rows)) throw new StoreError("bulkCreate precisa de uma lista.", 400);
            const created = transaction(() => rows.map((data) => {
                const row = insert(entity, def, data);
                record(entity, def, "upsert", row, row.updated_date);
                return row;
            }));
            emit(created.map((row) => event(entity, "create", row)));
            return created;
        },
        update(entity, def, [id, data]) {
            const row = transaction(() => {
                const updated = update(entity, def, id, data);
                record(entity, def, "upsert", updated, updated.updated_date, data);
                return updated;
            });
            emit([event(entity, "update", row)]);
            return row;
        },
        bulkUpdate(entity, def, [rows]) {
            if (!Array.isArray(rows)) throw new StoreError("bulkUpdate precisa de uma lista.", 400);
            const updated = transaction(() => rows.map((r) => {
                if (!isPlainObject(r) || r.id == null) throw new StoreError("Cada item precisa de um id.", 400);
                const { id, ...changes } = r;
                const row = update(entity, def, id, changes);
                record(entity, def, "upsert", row, row.updated_date, changes);
                return row;
            }));
            emit(updated.map((row) => event(entity, "update", row)));
            return updated;
        },
        delete(entity, def, [id]) {
            const old = getRow(def, id);
            if (old) {
                transaction(() => {
                    prepare(`DELETE FROM ${quote(def.table)} WHERE id = ?`).run(String(id));
                    if (isSynced(entity)) {
                        const now = new Date().toISOString();
                        prepare(`INSERT OR REPLACE INTO ${quote(TOMBSTONES)} (entity, id, deleted_at) VALUES (?, ?, ?)`)
                            .run(entity, String(id), now);
                        record(entity, def, "delete", old, now);
                    }
                });
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
    // replaces rows with the same id. Emits no events and records nothing.
    function importRows(entity, rows) {
        const def = entityDef(entity);
        return transaction(() => rows.map((data) => insert(entity, def, data, { keepSystem: true, replace: true }))).length;
    }

    // Removes every row of a computer's own entity whose column is `value`
    // (an edition's 31k verses at once, Configurações › Bíblias › Excluir…).
    // Never for a synced entity: those deletes must travel. Emits no events
    // and records nothing, like importRows. -> the number of rows removed.
    function dropRows(entity, column, value) {
        const def = entityDef(entity);
        if (isSynced(entity)) throw new StoreError(`${entity} é sincronizada: apague linha por linha.`, 400);
        if (!def.columns[column]) throw new StoreError(`Campo '${column}' não existe em ${entity}.`, 400);
        return Number(transaction(() => prepare(`DELETE FROM ${quote(def.table)} WHERE ${quote(column)} = ?`).run(value)).changes);
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

    // Deletes of synced entities after `since` (ISO; none = all), oldest first.
    function tombstones(since) {
        const after = toIso(since);
        const sql = `SELECT entity, id, deleted_at FROM ${quote(TOMBSTONES)}`
            + (after ? " WHERE deleted_at > ?" : "") + " ORDER BY deleted_at, entity, id";
        return prepare(sql).all(...(after ? [after] : [])).map((r) => ({ ...r }));
    }

    // Forgets the marks older than `before` (every computer has seen them).
    function pruneTombstones(before) {
        const until = toIso(before);
        if (!until) throw new StoreError("Data inválida.", 400);
        return Number(prepare(`DELETE FROM ${quote(TOMBSTONES)} WHERE deleted_at < ?`).run(until).changes);
    }

    // This computer's changes after `after` (a seq; none = all), oldest
    // first, at most `limit`: { seq, entity, id, op: upsert|delete, row, at, pc }.
    function outbox(after = 0, limit) {
        const n = Math.floor(Number(limit));
        const sql = `SELECT seq, entity, id, op, row, at, pc FROM ${quote(OUTBOX)} WHERE seq > ? ORDER BY seq`
            + (n > 0 ? " LIMIT ?" : "");
        return prepare(sql).all(Math.floor(Number(after)) || 0, ...(n > 0 ? [n] : []))
            .map((r) => ({ ...r, row: r.row === null ? null : JSON.parse(r.row) }));
    }

    // Forgets the changes up to `seq` (the transport has written them).
    function pruneOutbox(seq) {
        const upTo = Math.floor(Number(seq));
        if (!Number.isFinite(upTo)) throw new StoreError("Sequência inválida.", 400);
        return Number(prepare(`DELETE FROM ${quote(OUTBOX)} WHERE seq <= ?`).run(upTo).changes);
    }

    // Everything this computer holds of the church's content, into the outbox
    // (docs/desktop-architecture.md §8b, the first join): what joining the
    // sync, or a new code, sends to the others, since the outbox only holds
    // what changed after it started recording. Whatever the outbox held is
    // forgotten first: the rows are the state it led to. Each row goes at the
    // version it is at here (`_version`, else its date), so the other
    // computers' newer copies still win, and every delete at its tombstone's
    // date. The profile only sends the church fields this computer set (a
    // version of their own, or a value other than the factory one), at their
    // own versions: a fresh install never sends its defaults over the
    // church's logo. `bump`: the rows go as edits made now (a backup restored
    // for every computer), deletes still at their dates. Returns the count.
    function snapshot({ bump = false } = {}) {
        const now = new Date().toISOString();
        return transaction(() => {
            prepare(`DELETE FROM ${quote(OUTBOX)}`).run();
            const put = prepare(`INSERT INTO ${quote(OUTBOX)} (entity, id, op, row, at, pc) VALUES (?, ?, ?, ?, ?, ?)`);
            let n = 0;
            for (const entity of SYNC_ENTITIES) {
                const def = schema.entities[entity];
                if (!def) continue;
                if (entity === "User") {
                    n += snapshotProfile(def, put, bump, now);
                    continue;
                }
                for (const raw of prepare(`SELECT * FROM ${quote(def.table)} ORDER BY rowid`).all()) {
                    const row = decodeRow(def, raw);
                    let at = now;
                    if (bump) setVersion(entity, row.id, now, pcId);
                    else at = localVersion(entity, String(row.id), row)?.at || toIso(row.updated_date) || now;
                    put.run(entity, String(row.id), "upsert", JSON.stringify(syncRow(entity, row)), at, pcId);
                    n += 1;
                }
            }
            for (const mark of prepare(`SELECT entity, id, deleted_at FROM ${quote(TOMBSTONES)} ORDER BY deleted_at`).all()) {
                if (!isSynced(mark.entity)) continue;
                put.run(mark.entity, mark.id, "delete", null, mark.deleted_at, pcId);
                n += 1;
            }
            return n;
        });
    }

    function snapshotProfile(def, put, bump, now) {
        const row = getRow(def, PROFILE_ID);
        if (!row) return 0;
        const byAt = new Map();
        for (const field of churchFields(def, row)) {
            const value = row[field];
            if (value === null || value === undefined) continue;
            let at = getVersion("User", fieldKey(field))?.at;
            if (!at) {
                const factory = field in PROFILE_DEFAULTS ? PROFILE_DEFAULTS[field] : def.columns[field].default;
                if (factory !== undefined && JSON.stringify(factory) === JSON.stringify(value)) continue;
                at = toIso(row.updated_date) || now;
            }
            if (bump) {
                at = now;
                setVersion("User", fieldKey(field), now, pcId);
            }
            if (!byAt.has(at)) byAt.set(at, { id: PROFILE_ID });
            byAt.get(at)[field] = value;
        }
        for (const [at, body] of byAt) put.run("User", PROFILE_ID, "upsert", JSON.stringify(body), at, pcId);
        return byAt.size;
    }

    // Keeps what this version cannot store: a whole change of an entity it
    // does not know ("row"), or the fields of a row its table lacks
    // ("fields"), the newest per row winning.
    function park(entity, id, kind, op, row, at, pc) {
        const was = prepare(`SELECT at, pc FROM ${quote(PARKED)} WHERE entity = ? AND id = ? AND kind = ?`).get(entity, id, kind);
        if (was && !newer({ at, pc }, was)) return;
        if (!was && Number(prepare(`SELECT COUNT(*) AS n FROM ${quote(PARKED)}`).get().n) >= PARKED_LIMIT) {
            if (!warned.has(PARKED)) {
                warned.add(PARKED);
                log("[keryx-db] dados de uma versão mais nova do KERYX demais para guardar; atualize este computador");
            }
            return;
        }
        prepare(`INSERT OR REPLACE INTO ${quote(PARKED)} (entity, id, kind, op, row, at, pc) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(entity, id, kind, op, row == null ? null : JSON.stringify(row), at, pc);
    }

    // The fields of a remote row this version's table does not have.
    const unknownFields = (def, row) => Object.keys(row || {}).filter((k) => !def.columns[k] && !SYSTEM_FIELDS.has(k) && row[k] !== undefined);
    const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

    // One remote change, inside applyRemote's transaction. Returns false when
    // it is not taken (unknown, ours, or not newer than what is here), else
    // { event } (null when a delete found nothing to delete). An entity this
    // version does not know is parked, not taken.
    function applyOne(change) {
        if (!isPlainObject(change)) return false;
        const { entity, op } = change;
        if (op !== "upsert" && op !== "delete") return false;
        const at = toIso(change.at);
        const pc = change.pc == null ? "" : String(change.pc);
        if (!at || !pc || pc === pcId || change.id == null || change.id === "" || typeof entity !== "string") return false;
        if (!schema.entities[entity]) {
            if (/^[A-Z][A-Za-z0-9]{0,63}$/.test(entity)) park(entity, String(change.id), "row", op, isPlainObject(change.row) ? change.row : null, at, pc);
            return false;
        }
        if (!isSynced(entity)) return false;
        const def = entityDef(entity);
        if (entity === "User") return applyProfile(def, change, at, pc);
        const id = String(change.id);
        const old = getRow(def, id);
        const here = localVersion(entity, id, old);
        if (here && !newer({ at, pc }, here)) return false;

        if (op === "delete") {
            if (old) prepare(`DELETE FROM ${quote(def.table)} WHERE id = ?`).run(id);
            prepare(`INSERT OR REPLACE INTO ${quote(TOMBSTONES)} (entity, id, deleted_at) VALUES (?, ?, ?)`).run(entity, id, at);
            setVersion(entity, id, at, pc);
            return { event: old ? event(entity, "delete", old) : null };
        }

        if (!isPlainObject(change.row)) return false;
        // Over what is here: a sender on an older version does not know every
        // column, and what it does not mention stays (a sender that knows a
        // column always sends it, empty or not).
        const incoming = syncRow(entity, change.row);
        const extra = unknownFields(def, incoming);
        if (extra.length) park(entity, id, "fields", "upsert", pick(incoming, extra), at, pc);
        const row = insert(entity, def, { ...(old || {}), ...incoming, id, updated_date: at }, { keepSystem: true, replace: true });
        setVersion(entity, id, at, pc);
        return { event: event(entity, old ? "update" : "create", row) };
    }

    // The profile, field by field: each church field the change carries is
    // taken when it is newer than that field here; this computer's fields are
    // never touched (even when a sender's copy carries them), and every
    // computer's profile is the one local row, never deleted.
    function applyProfile(def, change, at, pc) {
        if (change.op !== "upsert" || !isPlainObject(change.row)) return false;
        const extra = unknownFields(def, change.row).filter((k) => !LOCAL_USER_FIELDS.has(k));
        if (extra.length) park("User", PROFILE_ID, "fields", "upsert", pick(change.row, extra), at, pc);
        const taken = {};
        for (const field of churchFields(def, change.row)) {
            const here = getVersion("User", fieldKey(field));
            if (here && !newer({ at, pc }, here)) continue;
            taken[field] = change.row[field];
            setVersion("User", fieldKey(field), at, pc);
        }
        if (!Object.keys(taken).length) return false;
        return { event: event("User", "update", update("User", def, PROFILE_ID, taken)) };
    }

    // Changes from the other computers (their outbox entries). Last edit wins
    // per row against the local row's date or delete, the computer's id
    // breaking ties; what is taken emits its change event so open windows
    // refresh, and is never recorded in this computer's outbox (no echo).
    // A change that fails is rolled back alone and counted.
    function applyRemote(changes) {
        if (!Array.isArray(changes)) throw new StoreError("applyRemote precisa de uma lista.", 400);
        const result = { applied: 0, skipped: 0, failed: 0 };
        const events = transaction(() => changes.flatMap((change) => {
            db.exec("SAVEPOINT keryx_remote");
            try {
                const done = applyOne(change);
                db.exec("RELEASE keryx_remote");
                if (!done) {
                    result.skipped += 1;
                    return [];
                }
                result.applied += 1;
                return done.event ? [done.event] : [];
            } catch (err) {
                db.exec("ROLLBACK TO keryx_remote; RELEASE keryx_remote");
                result.failed += 1;
                log(`[keryx-db] alteração remota ignorada (${change?.entity} ${change?.id}): ${err.message}`);
                return [];
            }
        }));
        emit(events);
        return result;
    }

    // What was parked and this version now knows (KERYX was updated): a
    // parked change of an entity applied as it came; parked fields filled
    // into the row (this computer never had them, so the latest value seen
    // is the best there is). The rest stays parked. Runs when the store opens.
    function replayParked() {
        const rows = prepare(`SELECT entity, id, kind, op, row, at, pc FROM ${quote(PARKED)}`).all();
        let done = 0;
        for (const p of rows) {
            const def = schema.entities[p.entity];
            if (!def) continue;
            const drop = () => prepare(`DELETE FROM ${quote(PARKED)} WHERE entity = ? AND id = ? AND kind = ?`).run(p.entity, p.id, p.kind);
            let row = null;
            try {
                row = p.row == null ? null : JSON.parse(p.row);
            } catch { /* unreadable: dropped below */ }
            try {
                if (p.kind === "row") {
                    transaction(() => {
                        if (isSynced(p.entity)) applyOne({ entity: p.entity, id: p.id, op: p.op, row, at: p.at, pc: p.pc });
                        drop();
                    });
                    done += 1;
                    continue;
                }
                const known = Object.keys(row || {}).filter((k) => def.columns[k]);
                if (!known.length) {
                    if (!row) drop();
                    continue;
                }
                const left = Object.keys(row).filter((k) => !def.columns[k]);
                transaction(() => {
                    const names = known;
                    prepare(`UPDATE ${quote(def.table)} SET ${names.map((n) => `${quote(n)} = ?`).join(", ")} WHERE id = ?`)
                        .run(...names.map((n) => encode(def.columns[n], row[n])), p.id);
                    if (left.length) prepare(`UPDATE ${quote(PARKED)} SET row = ? WHERE entity = ? AND id = ? AND kind = ?`).run(JSON.stringify(pick(row, left)), p.entity, p.id, p.kind);
                    else drop();
                });
                done += 1;
            } catch (err) {
                log(`[keryx-db] dado guardado de outra versão não aplicado (${p.entity} ${p.id}): ${err.message}`);
            }
        }
        if (done) log(`[keryx-db] ${done} registro(s) de uma versão mais nova do KERYX aplicados agora`);
        return done;
    }
    replayParked();

    // This database's own bookkeeping (_meta, never synced): the transport's
    // cursors and file numbers. Values are JSON; null removes the key. The
    // computer's id is not settable.
    function getMeta(key) {
        const value = prepare(`SELECT value FROM ${quote(META)} WHERE key = ?`).get(String(key))?.value;
        if (value == null) return null;
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }

    function setMeta(key, value) {
        if (String(key) === "pc_id") throw new StoreError("pc_id não pode ser alterado.", 400);
        if (value == null) prepare(`DELETE FROM ${quote(META)} WHERE key = ?`).run(String(key));
        else prepare(`INSERT OR REPLACE INTO ${quote(META)} (key, value) VALUES (?, ?)`).run(String(key), JSON.stringify(value));
    }

    // A consistent copy of the whole database while it is in use (VACUUM INTO
    // takes its own read transaction); the target must not exist.
    function backupTo(target) {
        db.prepare("VACUUM INTO ?").run(target);
    }

    return {
        call,
        importRows,
        dropRows,
        countBy,
        tombstones,
        pruneTombstones,
        outbox,
        pruneOutbox,
        snapshot,
        applyRemote,
        replayParked,
        parkedCount: () => Number(prepare(`SELECT COUNT(*) AS n FROM ${quote(PARKED)}`).get().n),
        setRecording: (on) => { recording = Boolean(on); },
        isRecording: () => recording,
        pcId,
        getMeta,
        setMeta,
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
