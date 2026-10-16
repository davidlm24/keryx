// node --test electron/db/store.test.cjs   (npm test)
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createStore, PROFILE_ID } = require("./store.cjs");
const { buildSchema } = require("./build-schema.cjs");
const schema = require("./schema.json");

const fresh = () => createStore({ file: ":memory:", schema, log: () => {} });

test("schema.json matches base44/entities (run npm run db:schema)", () => {
    assert.deepEqual(buildSchema(path.join(__dirname, "..", "..", "base44", "entities")), schema);
});

test("create fills id, timestamps and defaults; strips system fields", () => {
    const s = fresh();
    const song = s.call("Song", "create", [{ title: "A", lyrics: "x", id: "forged", created_date: "1999-01-01" }]);
    assert.notEqual(song.id, "forged");
    assert.match(song.id, /^[0-9a-f-]{36}$/);
    assert.equal(song.created_date, song.updated_date);
    assert.ok(Date.parse(song.created_date) > Date.parse("2020-01-01"));
    assert.equal(song.category, "worship"); // default from Song.jsonc
});

test("types round-trip: json, boolean, number", () => {
    const s = fresh();
    const slides = [{ text: "v1", duration: 10 }, { text: "v2" }];
    const song = s.call("Song", "create", [{ title: "A", slides, is_favorite: true, duration: "240" }]);
    assert.deepEqual(song.slides, slides);
    assert.equal(song.is_favorite, true);
    assert.equal(song.duration, 240);
    const off = s.call("Song", "update", [song.id, { is_favorite: false }]);
    assert.equal(off.is_favorite, false);
});

test("Date values are stored as ISO strings", () => {
    const s = fresh();
    const when = new Date("2026-10-06T12:00:00Z");
    const row = s.call("SongHistory", "create", [{ song_id: "x", song_title: "A", played_at: when }]);
    assert.equal(row.played_at, when.toISOString());
    assert.equal(s.call("SongHistory", "filter", [{ played_at: { $gte: new Date("2026-01-01") } }]).length, 1);
});

test("unknown fields are dropped and reported once", () => {
    const warnings = [];
    const s = createStore({ file: ":memory:", schema, log: (m) => warnings.push(m) });
    const row = s.call("LiveSession", "create", [{ status: "active", _probe: 1 }]);
    s.call("LiveSession", "update", [row.id, { _probe: 2 }]);
    assert.equal(row._probe, undefined);
    assert.equal(warnings.length, 1);
});

test("update bumps updated_date, keeps created_date, 404s on missing id", () => {
    const s = fresh();
    const a = s.call("Song", "create", [{ title: "A" }]);
    const b = s.call("Song", "update", [a.id, { title: "B", created_date: "2000-01-01" }]);
    assert.equal(b.title, "B");
    assert.equal(b.created_date, a.created_date);
    assert.ok(b.updated_date >= a.updated_date);
    assert.throws(() => s.call("Song", "update", ["nope", { title: "x" }]), { status: 404 });
    assert.throws(() => s.call("Song", "get", ["nope"]), { status: 404 });
});

test("filter: equality, null, undefined ignored, arrays as $in", () => {
    const s = fresh();
    s.call("ServiceItem", "bulkCreate", [[
        { serviceId: "s1", title: "a", order: 1 },
        { serviceId: "s1", title: "b", order: 2 },
        { serviceId: "s2", title: "c", order: 1 },
        { title: "orphan" },
    ]]);
    assert.equal(s.call("ServiceItem", "filter", [{ serviceId: "s1" }]).length, 2);
    assert.equal(s.call("ServiceItem", "filter", [{ serviceId: null }]).length, 1);
    assert.equal(s.call("ServiceItem", "filter", [{ serviceId: undefined }]).length, 4);
    assert.equal(s.call("ServiceItem", "filter", [{ serviceId: ["s1", "s2"] }]).length, 3);
    assert.equal(s.call("ServiceItem", "filter", [{ serviceId: [] }]).length, 0);
});

test("filter operators follow Base44/Mongo semantics", () => {
    const s = fresh();
    s.call("LiveSession", "bulkCreate", [[
        { status: "active", startedAt: 10 },
        { status: "ended", startedAt: 20 },
        { startedAt: 30, status: null },
    ]]);
    const f = (q) => s.call("LiveSession", "filter", [q]).length;
    assert.equal(f({ status: { $ne: "ended" } }), 2, "$ne keeps empty fields");
    assert.equal(f({ status: { $nin: ["ended"] } }), 2, "$nin keeps empty fields");
    assert.equal(f({ status: { $in: ["active", "ended"] } }), 2);
    assert.equal(f({ startedAt: { $gte: 20 } }), 2);
    assert.equal(f({ startedAt: { $gt: 10, $lt: 30 } }), 1);
    assert.equal(f({ status: { $exists: false } }), 1);
    assert.equal(f({ status: { $exists: true } }), 2);
    assert.equal(f({ status: { $eq: null } }), 1);
});

test("$regex is a substring match that ignores case and accents", () => {
    const s = fresh();
    s.call("Song", "bulkCreate", [[{ title: "CORAÇÃO Valente" }, { title: "Outra" }]]);
    assert.equal(s.call("Song", "filter", [{ title: { $regex: "coração" } }]).length, 1);
    assert.equal(s.call("Song", "filter", [{ title: { $regex: "coracao" } }]).length, 1, "accents optional");
    assert.equal(s.call("Song", "filter", [{ title: { $regex: "valente", $options: "i" } }]).length, 1);
});

test("boolean filters match stored flags", () => {
    const s = fresh();
    s.call("ServiceItem", "bulkCreate", [[{ title: "a", enabled: true }, { title: "b", enabled: false }, { title: "c" }]]);
    assert.equal(s.call("ServiceItem", "filter", [{ enabled: true }]).length, 2, "enabled defaults to true");
    assert.equal(s.call("ServiceItem", "filter", [{ enabled: false }]).length, 1);
    assert.equal(s.call("ServiceItem", "filter", [{ enabled: { $ne: false } }]).length, 2);
});

test("unknown filter field, sort field and operators are errors", () => {
    const s = fresh();
    assert.throws(() => s.call("Song", "filter", [{ nope: 1 }]), { status: 400 });
    assert.throws(() => s.call("Song", "list", ["-nope"]), { status: 400 });
    assert.throws(() => s.call("Song", "filter", [{ title: { $where: "1" } }]), { status: 400 });
    assert.throws(() => s.call("Song", "filter", [{ $or: [] }]), { status: 400 });
    assert.throws(() => s.call("Nope", "list", []), { status: 400 });
    assert.throws(() => s.call("Song", "drop", []), { status: 400 });
});

test("sort: asc/desc, nulls first ascending and last descending, stable ties", () => {
    const s = fresh();
    s.call("LiveSession", "bulkCreate", [[{ startedAt: 2, channel: "b" }, { channel: "n" }, { startedAt: 1, channel: "a" }]]);
    const order = (sort) => s.call("LiveSession", "list", [sort]).map((r) => r.channel).join("");
    assert.equal(order("startedAt"), "nab");
    assert.equal(order("+startedAt"), "nab");
    assert.equal(order("-startedAt"), "ban", "-startedAt puts the empty one last, so list('-startedAt', 1) finds a real session");
    assert.equal(order(undefined), "bna", "no sort = insertion order");
});

test("limit and skip, positional and paged forms", () => {
    const s = fresh();
    s.call("Song", "bulkCreate", [[1, 2, 3, 4, 5].map((n) => ({ title: `t${n}`, duration: n }))]);
    const titles = (rows) => rows.map((r) => r.title).join(",");
    assert.equal(titles(s.call("Song", "list", ["duration", 2])), "t1,t2");
    assert.equal(titles(s.call("Song", "list", ["duration", 2, 2])), "t3,t4");
    assert.equal(titles(s.call("Song", "list", ["duration", undefined, 3])), "t4,t5");
    const page = s.call("Song", "filter", [{}, { sort: "-duration", limit: 2 }]);
    assert.deepEqual(Object.keys(page).sort(), ["items", "next_cursor"]);
    assert.equal(titles(page.items), "t5,t4");
    assert.equal(titles(s.call("Song", "list", [{ sort: "duration", limit: 1, skip: 1 }]).items), "t2");
});

test("bulkUpdate is atomic", () => {
    const s = fresh();
    const [a, b] = s.call("ServiceItem", "bulkCreate", [[{ title: "a", order: 1 }, { title: "b", order: 2 }]]);
    s.call("ServiceItem", "bulkUpdate", [[{ id: a.id, order: 2 }, { id: b.id, order: 1 }]]);
    assert.equal(s.call("ServiceItem", "get", [a.id]).order, 2);
    assert.throws(() => s.call("ServiceItem", "bulkUpdate", [[{ id: a.id, order: 9 }, { id: "missing", order: 9 }]]), { status: 404 });
    assert.equal(s.call("ServiceItem", "get", [a.id]).order, 2, "first update rolled back");
});

test("delete returns success and is quiet for missing ids", () => {
    const s = fresh();
    const a = s.call("Song", "create", [{ title: "A" }]);
    assert.deepEqual(s.call("Song", "delete", [a.id]), { success: true });
    assert.deepEqual(s.call("Song", "delete", [a.id]), { success: true });
    assert.equal(s.call("Song", "list", []).length, 0);
});

test("change events: create, update, delete carry the whole row", () => {
    const s = fresh();
    const events = [];
    const off = s.onChange((e) => events.push(e));
    const row = s.call("LyricSync", "create", [{ song_title: "A", timestamp: 1 }]);
    s.call("LyricSync", "update", [row.id, { slide_index: 3 }]);
    s.call("LyricSync", "delete", [row.id]);
    s.call("LyricSync", "delete", [row.id]);
    assert.deepEqual(events.map((e) => e.type), ["create", "update", "delete"]);
    assert.equal(events[1].data.slide_index, 3);
    assert.equal(events[2].data.song_title, "A", "delete carries the old row");
    assert.ok(events.every((e) => e.entity === "LyricSync" && e.id === row.id && e.timestamp));
    off();
    s.call("LyricSync", "create", [{ timestamp: 2 }]);
    assert.equal(events.length, 3);
});

test("bulk events fire only after the transaction commits", () => {
    const s = fresh();
    const events = [];
    s.onChange((e) => events.push(e));
    const [a] = s.call("Song", "bulkCreate", [[{ title: "a" }]]);
    events.length = 0;
    assert.throws(() => s.call("Song", "bulkUpdate", [[{ id: a.id, title: "z" }, { id: "missing" }]]));
    assert.equal(events.length, 0);
});

test("the local profile exists with the KERYX palette and can be updated", () => {
    const s = fresh();
    const me = s.call("User", "get", [PROFILE_ID]);
    assert.equal(me.primary_color, "#7d8470");
    assert.equal(me.full_name, "Operador");
    assert.equal(s.call("User", "update", [PROFILE_ID, { logo_url: "x" }]).logo_url, "x");
});

test("importRows keeps ids and timestamps, replaces on re-run, emits nothing", () => {
    const s = fresh();
    const events = [];
    s.onChange((e) => events.push(e));
    const rows = [{ id: "65f0c0ffee", title: "Old", created_date: "2025-03-01T10:00:00.000000", updated_date: "2025-03-02T10:00:00Z" }];
    assert.equal(s.importRows("Song", rows), 1);
    s.importRows("Song", [{ ...rows[0], title: "Older" }]);
    const song = s.call("Song", "get", ["65f0c0ffee"]);
    assert.equal(song.title, "Older");
    assert.equal(song.created_date, new Date("2025-03-01T10:00:00.000000").toISOString());
    assert.equal(s.call("Song", "list", []).length, 1);
    assert.equal(events.length, 0);
});

test("every entity is either synced or local, never both", () => {
    const { SYNC_ENTITIES, LOCAL_ENTITIES, LOCAL_USER_FIELDS } = require("./syncScope.cjs");
    for (const name of Object.keys(schema.entities)) {
        assert.ok(SYNC_ENTITIES.has(name) !== LOCAL_ENTITIES.has(name), `${name}: add it to SYNC_ENTITIES or LOCAL_ENTITIES in syncScope.cjs`);
    }
    for (const name of [...SYNC_ENTITIES, ...LOCAL_ENTITIES]) assert.ok(schema.entities[name], `${name} is not an entity`);
    for (const field of LOCAL_USER_FIELDS) assert.ok(schema.entities.User.columns[field], `User.${field} does not exist`);
});

test("syncRow: local entities stay, the profile travels without this computer's fields", () => {
    const { syncRow } = require("./syncScope.cjs");
    assert.equal(syncRow("OutputPref", { id: "x" }), null);
    assert.equal(syncRow("BibleVerse", { id: "x" }), null);
    const song = { id: "s", title: "A" };
    assert.deepEqual(syncRow("Song", song), song);
    assert.notEqual(syncRow("Song", song), song, "a copy");
    const me = syncRow("User", { id: PROFILE_ID, logo_url: "l", church_name: "Gerar", full_name: "Ana", prefs_version: 2, console_density: "compact" });
    assert.deepEqual(me, { id: PROFILE_ID, logo_url: "l", church_name: "Gerar" });
});

test("deleting a synced row leaves a tombstone; local entities leave none", () => {
    const s = fresh();
    const a = s.call("Song", "create", [{ title: "A" }]);
    const pref = s.call("OutputPref", "create", [{ page: "/Projection" }]);
    s.call("Song", "delete", [a.id]);
    s.call("Song", "delete", [a.id]);
    s.call("OutputPref", "delete", [pref.id]);
    s.call("Song", "delete", ["never-existed"]);
    const marks = s.tombstones();
    assert.equal(marks.length, 1);
    assert.equal(marks[0].entity, "Song");
    assert.equal(marks[0].id, a.id);
    assert.ok(Date.parse(marks[0].deleted_at) >= Date.parse(a.created_date));
});

test("tombstones: since filters, a row back clears its mark, prune forgets old ones", () => {
    const s = fresh();
    const [a, b] = s.call("Song", "bulkCreate", [[{ title: "A" }, { title: "B" }]]);
    s.call("Song", "delete", [a.id]);
    const first = s.tombstones()[0].deleted_at;
    s.call("Song", "delete", [b.id]);
    assert.equal(s.tombstones().length, 2);
    assert.ok(s.tombstones(first).every((m) => m.deleted_at > first));
    s.importRows("Song", [{ ...a }]);
    assert.deepEqual(s.tombstones().map((m) => m.id), [b.id], "restored row is no longer deleted");
    assert.equal(s.pruneTombstones("2000-01-01"), 0);
    assert.equal(s.pruneTombstones(new Date(Date.now() + 60_000)), 1);
    assert.equal(s.tombstones().length, 0);
    assert.throws(() => s.pruneTombstones("nope"), { status: 400 });
});

test("schema upgrade adds new columns to an existing database", () => {
    const fs = require("node:fs");
    const os = require("node:os");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keryx-")), "t.db");
    const small = { entities: { User: schema.entities.User, Song: { table: "song", columns: { id: { type: "text" }, created_date: { type: "text" }, updated_date: { type: "text" }, title: { type: "text" } } } } };
    createStore({ file, schema: small, log: () => {} }).close();
    const s = createStore({ file, schema, log: () => {} });
    const row = s.call("Song", "create", [{ title: "A", slides: [{ text: "x" }] }]);
    assert.deepEqual(row.slides, [{ text: "x" }]);
    s.close();
});
