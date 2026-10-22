const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const yazl = require("yazl");
const { writePackage, readPackage, fitsOn, createPackages, FORMAT } = require("./keryxPackage.cjs");
const { importMedia } = require("./mediaImport.cjs");

function tmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "keryx-pkg-test-"));
}

async function zipOf(file, entries, { compress = false } = {}) {
    const zip = new yazl.ZipFile();
    for (const [name, content] of entries) zip.addBuffer(Buffer.from(content), name, { compress });
    zip.end();
    await pipeline(zip.outputStream, fs.createWriteStream(file));
}

// A package whose central directory lies about one entry's size, as a
// crafted one from elsewhere could: the declared size is what the caps see.
function declareSize(file, entry, size) {
    const buf = fs.readFileSync(file);
    const name = Buffer.from(entry);
    for (let i = 0; i < buf.length - 46; i += 1) {
        if (buf.readUInt32LE(i) !== 0x02014b50) continue;
        const len = buf.readUInt16LE(i + 28);
        if (buf.subarray(i + 46, i + 46 + len).equals(name)) { buf.writeUInt32LE(size, i + 24); fs.writeFileSync(file, buf); return; }
    }
    throw new Error("entry not found");
}

const MANIFEST = JSON.stringify({ format: FORMAT, version: 1 });

test("write then read: the manifest, the rows and the declared sizes; no file is unpacked", async () => {
    const root = tmp();
    const mediaDir = path.join(root, "media");
    fs.mkdirSync(mediaDir);
    fs.writeFileSync(path.join(mediaDir, "a1.mp3"), "audio!");
    fs.writeFileSync(path.join(mediaDir, "f1.woff2"), "font");
    fs.writeFileSync(path.join(mediaDir, "big.mp4"), "x".repeat(50));
    const target = path.join(root, "louvor.keryx");
    const items = { songs: [{ id: "s1", title: "A", audio_url: "keryx-media://a1.mp3" }] };
    const out = await writePackage({
        target, mediaDir, items, maxFile: 20,
        manifest: { kind: "songs", church: "Igreja X", counts: { songs: 1 }, format: "outro" },
        files: [{ name: "a1.mp3", as: "media" }, { name: "f1.woff2", as: "fonts" }, { name: "gone.jpg", as: "media" }, { name: "big.mp4", as: "media" }, { name: "../evil", as: "media" }],
    });
    assert.equal(out.files, 2);
    assert.deepEqual(out.missing, ["gone.jpg"]);
    assert.deepEqual(out.tooBig, ["big.mp4"]);
    assert.equal(fs.existsSync(`${target}.partial`), false);

    const before = fs.readdirSync(root).sort();
    const read = await readPackage({ zipFile: target });
    assert.deepEqual(fs.readdirSync(root).sort(), before, "opening writes nothing");
    assert.equal(read.manifest.format, FORMAT);
    assert.equal(read.manifest.church, "Igreja X");
    assert.deepEqual(read.manifest.files, { "media/a1.mp3": 6, "fonts/f1.woff2": 4 });
    assert.deepEqual(read.manifest.left, { "gone.jpg": "missing", "big.mp4": "big" });
    assert.deepEqual(read.items, items);
    assert.deepEqual(read.sizes, { "media/a1.mp3": 6, "fonts/f1.woff2": 4 });
    assert.equal(read.total, 10);
});

test("read refuses what is not a package, an entry out of the list, a newer version", async () => {
    const root = tmp();
    const zip = (name) => path.join(root, name);

    fs.writeFileSync(zip("plain.keryx"), "não é zip");
    await assert.rejects(readPackage({ zipFile: zip("plain.keryx") }), /não é um zip/);

    await zipOf(zip("other.keryx"), [["manifest.json", JSON.stringify({ format: "keryx-export" })], ["items.json", "{}"]]);
    await assert.rejects(readPackage({ zipFile: zip("other.keryx") }), /não é um pacote do KERYX/);

    await zipOf(zip("evil.keryx"), [["manifest.json", MANIFEST], ["items.json", "{}"], ["keryx.db", "x"]]);
    await assert.rejects(readPackage({ zipFile: zip("evil.keryx") }), /item inesperado/);

    await zipOf(zip("new.keryx"), [["manifest.json", JSON.stringify({ format: FORMAT, version: 99 })], ["items.json", "{}"]]);
    await assert.rejects(readPackage({ zipFile: zip("new.keryx") }), /versão mais nova/);

    await zipOf(zip("noitems.keryx"), [["manifest.json", MANIFEST]]);
    await assert.rejects(readPackage({ zipFile: zip("noitems.keryx") }), /lista de itens/);

    await zipOf(zip("bad.keryx"), [["manifest.json", MANIFEST], ["items.json", "{nope"]]);
    await assert.rejects(readPackage({ zipFile: zip("bad.keryx") }), /não dá para ler/);

    await zipOf(zip("many.keryx"), [["manifest.json", MANIFEST], ["items.json", "{}"], ["media/a.jpg", "1"]]);
    await assert.rejects(readPackage({ zipFile: zip("many.keryx"), maxEntries: 2 }), /itens demais/);
});

test("the caps: a crafted entry declaring a huge size, one file over the cap, the whole over the cap", async () => {
    const root = tmp();
    const file = path.join(root, "crafted.keryx");
    await zipOf(file, [["manifest.json", MANIFEST], ["items.json", "{}"], ["media/a.mp4", "tiny"]], { compress: true });
    declareSize(file, "media/a.mp4", 0xfffffff0);
    await assert.rejects(readPackage({ zipFile: file }), /arquivo grande demais/);

    const two = path.join(root, "two.keryx");
    await zipOf(two, [["manifest.json", MANIFEST], ["items.json", "{}"], ["media/a.jpg", "12345"], ["media/b.jpg", "12345"]]);
    await assert.rejects(readPackage({ zipFile: two, maxFile: 4 }), /arquivo grande demais/);
    await assert.rejects(readPackage({ zipFile: two, maxTotal: 8 }), /grande demais para ser do KERYX/);
    assert.equal((await readPackage({ zipFile: two, maxTotal: 10 })).total, 10);
});

test("fitsOn: the chosen files, the largest twice for a moment, and the reserve", () => {
    const sizes = { "media/a": 100, "media/b": 300, "media/c": 1000 };
    assert.deepEqual(fitsOn({ sizes, entries: ["media/a", "media/b"], free: 750, minFree: 50 }), { ok: true, need: 750, free: 750 });
    assert.equal(fitsOn({ sizes, entries: ["media/a", "media/b"], free: 749, minFree: 50 }).ok, false);
    assert.equal(fitsOn({ sizes, entries: [], free: 50, minFree: 50 }).ok, true);
});

test("createPackages: open reads only, take unpacks one file into the media folder under a new name, close", async () => {
    const root = tmp();
    const mediaDir = path.join(root, "media");
    fs.mkdirSync(mediaDir);
    fs.writeFileSync(path.join(mediaDir, "bg.jpg"), "picture");
    fs.writeFileSync(path.join(mediaDir, "other.jpg"), "unused");
    const packages = createPackages({ root: path.join(root, "pacotes"), mediaDir, importMedia, freeSpace: () => Infinity });
    const target = path.join(root, "p.keryx");
    await packages.write({ target, manifest: { kind: "media" }, items: { media: [] }, files: [{ name: "bg.jpg", as: "media" }, { name: "other.jpg", as: "media" }] });

    const opened = await packages.open(target);
    assert.deepEqual(opened.files.sort(), ["media/bg.jpg", "media/other.jpg"]);
    assert.equal(fs.existsSync(path.join(root, "pacotes", opened.id)), false, "nothing unpacked on open");
    assert.equal(packages.fits(opened.id, ["media/bg.jpg"]).ok, true);

    const before = new Set(fs.readdirSync(mediaDir));
    const { fileName } = await packages.take(opened.id, "media/bg.jpg");
    assert.ok(!before.has(fileName));
    assert.equal(fs.readFileSync(path.join(mediaDir, fileName), "utf8"), "picture");
    assert.deepEqual(fs.readdirSync(path.join(root, "pacotes", opened.id)), [], "the unpacked copy is gone");
    assert.equal(fs.readdirSync(mediaDir).length, before.size + 1, "only the file taken came in");
    await assert.rejects(packages.take(opened.id, "media/nope.jpg"), /não está no pacote/);
    await assert.rejects(packages.take("nope", "media/bg.jpg"), /não está mais aberto/);
    packages.close(opened.id);
    assert.equal(fs.existsSync(path.join(root, "pacotes", opened.id)), false);
    assert.ok(fs.existsSync(target), "the operator's own file stays");

    // The preview's upload is the package's own copy: gone on close, and on a failed open.
    const copy = path.join(root, "copy.keryx");
    fs.copyFileSync(target, copy);
    const own = await packages.open(copy, { owned: true });
    packages.close(own.id);
    assert.equal(fs.existsSync(copy), false);
    const junk = path.join(root, "junk.keryx");
    fs.writeFileSync(junk, "x");
    await assert.rejects(packages.open(junk, { owned: true }));
    assert.equal(fs.existsSync(junk), false);
});

test("fits says no when the disk cannot take the files", async () => {
    const root = tmp();
    const mediaDir = path.join(root, "media");
    fs.mkdirSync(mediaDir);
    fs.writeFileSync(path.join(mediaDir, "bg.jpg"), "picture");
    const packages = createPackages({ root: path.join(root, "pacotes"), mediaDir, importMedia, freeSpace: () => 10 });
    const target = path.join(root, "p.keryx");
    await packages.write({ target, manifest: {}, items: {}, files: [{ name: "bg.jpg", as: "media" }] });
    const opened = await packages.open(target);
    assert.equal(packages.fits(opened.id, ["media/bg.jpg"]).ok, false);
});
