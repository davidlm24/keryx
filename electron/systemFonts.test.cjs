const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSystemFonts, scanDirs, fontDirs, parseNames, faceOf, extractFromCollection, tableRecords } = require("./systemFonts.cjs");

// Fonts built in memory: an sfnt with a `name` table and an OS/2 table,
// enough for what systemFonts.cjs reads (and a filler table, as real fonts
// carry others).
const utf16be = (s) => { const le = Buffer.from(s, "utf16le"); for (let i = 0; i + 1 < le.length; i += 2) { const t = le[i]; le[i] = le[i + 1]; le[i + 1] = t; } return le; };
function nameTable(records) {
    const strings = [];
    let offset = 0;
    const recs = records.map(([platform, encoding, language, id, value]) => {
        const bytes = platform === 1 ? Buffer.from(value, "latin1") : utf16be(value);
        const r = { platform, encoding, language, id, length: bytes.length, offset };
        strings.push(bytes);
        offset += bytes.length;
        return r;
    });
    const head = Buffer.alloc(6 + recs.length * 12);
    head.writeUInt16BE(0, 0);
    head.writeUInt16BE(recs.length, 2);
    head.writeUInt16BE(head.length, 4);
    recs.forEach((r, i) => {
        const at = 6 + i * 12;
        head.writeUInt16BE(r.platform, at); head.writeUInt16BE(r.encoding, at + 2); head.writeUInt16BE(r.language, at + 4);
        head.writeUInt16BE(r.id, at + 6); head.writeUInt16BE(r.length, at + 8); head.writeUInt16BE(r.offset, at + 10);
    });
    return Buffer.concat([head, ...strings]);
}
function os2Table({ weight = 400, fsType = 0, italic = false } = {}) {
    const t = Buffer.alloc(78);
    t.writeUInt16BE(4, 0);
    t.writeUInt16BE(weight, 4);
    t.writeUInt16BE(fsType, 8);
    t.writeUInt16BE(italic ? 1 : 0, 62);
    return t;
}
// A font file: family, style, the OS/2 numbers; extra name records go first
// (a Mac record, another language) so the preference is tested.
function makeFont(family, style, { os2, extra = [] } = {}) {
    const tables = {
        "OS/2": os2Table(os2),
        cmap: Buffer.from("filler-table-1234"),
        name: nameTable([...extra, [3, 1, 0x409, 1, family], [3, 1, 0x409, 2, style]]),
    };
    const tags = Object.keys(tables).sort();
    const dirLen = 12 + tags.length * 16;
    const pad4 = (n) => (n + 3) & ~3;
    const out = Buffer.alloc(dirLen + tags.reduce((n, t) => n + pad4(tables[t].length), 0));
    out.writeUInt32BE(0x00010000, 0);
    out.writeUInt16BE(tags.length, 4);
    let at = dirLen;
    tags.forEach((tag, i) => {
        const r = 12 + i * 16;
        out.write(tag.padEnd(4), r, "latin1");
        out.writeUInt32BE(0, r + 4);
        out.writeUInt32BE(at, r + 8);
        out.writeUInt32BE(tables[tag].length, r + 12);
        tables[tag].copy(out, at);
        at += pad4(tables[tag].length);
    });
    return out;
}
// A .ttc holding the fonts given: each font's tables moved to its place
// in the file (collection offsets count from the file's start).
function makeCollection(fonts) {
    const headLen = 12 + fonts.length * 4;
    const head = Buffer.alloc(headLen);
    head.write("ttcf", 0, "latin1");
    head.writeUInt32BE(0x00010000, 4);
    head.writeUInt32BE(fonts.length, 8);
    let base = headLen;
    const parts = fonts.map((f, i) => {
        head.writeUInt32BE(base, 12 + i * 4);
        const copy = Buffer.from(f);
        const n = copy.readUInt16BE(4);
        for (let t = 0; t < n; t++) { const r = 12 + t * 16; copy.writeUInt32BE(copy.readUInt32BE(r + 8) + base, r + 8); }
        base += copy.length;
        return copy;
    });
    return Buffer.concat([head, ...parts]);
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keryx-fonts-"));
const namesOf = (buf) => { const { tables } = tableRecords(buf, 0); return parseNames(buf.subarray(tables.name.offset, tables.name.offset + tables.name.length)); };

test("fontDirs: the Windows folder and the per-user one; none elsewhere", () => {
    assert.deepEqual(fontDirs({ WINDIR: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" }, "win32"), [path.join("C:\\Windows", "Fonts"), path.join("C:\\Users\\a\\AppData\\Local", "Microsoft", "Windows", "Fonts")]);
    assert.deepEqual(fontDirs({}, "linux"), []);
});

test("parseNames: the Windows English record wins over a Mac one and another language", () => {
    const names = namesOf(makeFont("Montserrat", "Bold", { extra: [[1, 0, 0, 1, "Montserrat Mac"], [3, 1, 0x416, 1, "Montserrat PT"]] }));
    assert.equal(names[1], "Montserrat");
    assert.equal(names[2], "Bold");
    // Only a Mac record: it is used.
    const { tables } = tableRecords(makeFont("X", "Regular"), 0);
    assert.ok(tables.name && tables["OS/2"]);
    assert.equal(parseNames(nameTable([[1, 0, 0, 1, "Só Mac"]]))[1], "Só Mac");
    assert.deepEqual(parseNames(Buffer.alloc(2)), {});
});

test("faceOf: Regular/Bold/Italic/Bold Italic by name, other styles by OS/2, a restricted licence marked", () => {
    assert.deepEqual(faceOf({ 1: "Arial", 2: "Bold Italic" }, null), { family: "Arial", name: "Bold Italic", weight: "700", style: "italic", restricted: false });
    assert.equal(faceOf({ 1: "Segoe UI Semibold", 2: "Regular" }, { weight: 600, fsType: 8 }).weight, "400"); // its own family: Regular is 400
    assert.deepEqual(faceOf({ 1: "Bahnschrift", 2: "Light Condensed" }, { weight: 300, fsType: 0, italic: false }), { family: "Bahnschrift", name: "Light Condensed", weight: "300", style: "normal", restricted: false });
    assert.equal(faceOf({ 1: "A", 2: "Oblique" }, { weight: 400, fsType: 0 }).style, "italic");
    assert.equal(faceOf({ 1: "A", 2: "Regular" }, { weight: 400, fsType: 2 }).restricted, true);
    assert.equal(faceOf({ 1: "A", 2: "Regular" }, { weight: 400, fsType: 2 | 8 }).restricted, false); // editable wins
    assert.equal(faceOf({ 16: "Só tipográfica", 2: "Regular" }, null).family, "Só tipográfica");
});

test("scanDirs: every family with its faces, a collection's fonts, the system copy first, other files skipped", async () => {
    const sys = tmp(), user = tmp();
    fs.writeFileSync(path.join(sys, "mont.ttf"), makeFont("Montserrat", "Regular"));
    fs.writeFileSync(path.join(sys, "montbd.ttf"), makeFont("Montserrat", "Bold", { os2: { weight: 700 } }));
    fs.writeFileSync(path.join(sys, "light.otf"), makeFont("Montserrat Light", "Regular", { os2: { weight: 300 } }));
    fs.writeFileSync(path.join(sys, "cambria.ttc"), makeCollection([makeFont("Cambria", "Regular"), makeFont("Cambria Math", "Regular")]));
    fs.writeFileSync(path.join(sys, "secret.ttf"), makeFont("Comprada", "Regular", { os2: { fsType: 2 } }));
    fs.writeFileSync(path.join(sys, "notes.txt"), "not a font");
    fs.writeFileSync(path.join(sys, "broken.ttf"), Buffer.from("trunc"));
    fs.writeFileSync(path.join(user, "mont-copy.ttf"), makeFont("Montserrat", "Regular"));
    fs.writeFileSync(path.join(user, "abeezee.ttf"), makeFont("ABeeZee", "Italic"));

    const { families, byId } = await scanDirs([sys, user, path.join(sys, "missing")]);
    assert.deepEqual(families.map((f) => f.family), ["ABeeZee", "Cambria", "Cambria Math", "Comprada", "Montserrat", "Montserrat Light"]);
    const mont = families.find((f) => f.family === "Montserrat");
    assert.deepEqual(mont.faces.map((f) => `${f.name} ${f.weight} ${f.style}`), ["Regular 400 normal", "Bold 700 normal"]);
    assert.equal(byId.get(mont.faces[0].id).file, path.join(sys, "mont.ttf"), "the system's copy, not the user's");
    assert.equal(families.find((f) => f.family === "ABeeZee").faces[0].style, "italic");
    assert.equal(families.find((f) => f.family === "Comprada").faces[0].restricted, true);
    const cambria = families.find((f) => f.family === "Cambria").faces[0];
    assert.equal(cambria.bytes, null, "a collection's face has no size of its own");
    assert.ok(mont.faces[0].bytes > 0);
});

test("read: a face's file by its id; a collection's face cut out into a font of its own; an unknown id refused", async () => {
    const dir = tmp();
    const regular = makeFont("Montserrat", "Regular");
    fs.writeFileSync(path.join(dir, "mont.ttf"), regular);
    fs.writeFileSync(path.join(dir, "cambria.ttc"), makeCollection([makeFont("Cambria", "Regular"), makeFont("Cambria Math", "Regular")]));
    const fonts = createSystemFonts({ dirs: [dir] });
    const families = await fonts.list();
    const byName = (n) => families.find((f) => f.family === n).faces[0].id;

    assert.deepEqual(await fonts.read(byName("Montserrat")), regular);
    const math = await fonts.read(byName("Cambria Math"));
    assert.deepEqual([...math.subarray(0, 4)], [0, 1, 0, 0], "a TrueType font file, not a collection");
    assert.equal(namesOf(math)[1], "Cambria Math");
    const { tables } = tableRecords(math, 0);
    assert.ok(Object.values(tables).every((t) => t.offset % 4 === 0 && t.offset + t.length <= math.length));

    await assert.rejects(fonts.read("../../windows/system32"), (err) => err.status === 404);
    await assert.rejects(fonts.read(""), (err) => err.status === 404);
});

test("extractFromCollection: only an index the collection has", () => {
    const ttc = makeCollection([makeFont("A", "Regular")]);
    assert.equal(namesOf(extractFromCollection(ttc, 0))[1], "A");
    assert.throws(() => extractFromCollection(ttc, 1));
    assert.throws(() => extractFromCollection(makeFont("A", "Regular"), 0));
});

test("the list is kept until a font folder changes", async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "a.ttf"), makeFont("Alfa", "Regular"));
    const fonts = createSystemFonts({ dirs: [dir] });
    assert.deepEqual((await fonts.list()).map((f) => f.family), ["Alfa"]);
    fs.writeFileSync(path.join(dir, "b.ttf"), makeFont("Beta", "Regular"));
    // A new file changes the folder's mtime (on a coarse clock, move it on).
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(dir, later, later);
    assert.deepEqual((await fonts.list()).map((f) => f.family), ["Alfa", "Beta"]);
});
