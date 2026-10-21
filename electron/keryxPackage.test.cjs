const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const yazl = require("yazl");
const { writePackage, readPackage, stagedFile, createPackages, FORMAT } = require("./keryxPackage.cjs");
const { importMedia } = require("./mediaImport.cjs");

function tmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "keryx-pkg-test-"));
}

async function zipOf(file, entries) {
    const zip = new yazl.ZipFile();
    for (const [name, content] of entries) zip.addBuffer(Buffer.from(content), name);
    zip.end();
    await pipeline(zip.outputStream, fs.createWriteStream(file));
}

test("write then read: the manifest, the rows and the files, sizes in the manifest", async () => {
    const root = tmp();
    const mediaDir = path.join(root, "media");
    fs.mkdirSync(mediaDir);
    fs.writeFileSync(path.join(mediaDir, "a1.mp3"), "audio!");
    fs.writeFileSync(path.join(mediaDir, "f1.woff2"), "font");
    const target = path.join(root, "louvor.keryx");
    const items = { songs: [{ id: "s1", title: "A", audio_url: "keryx-media://a1.mp3" }] };
    const out = await writePackage({
        target, mediaDir, items,
        manifest: { kind: "songs", church: "Igreja X", counts: { songs: 1 }, format: "outro" },
        files: [{ name: "a1.mp3", as: "media" }, { name: "f1.woff2", as: "fonts" }, { name: "gone.jpg", as: "media" }, { name: "../evil", as: "media" }],
    });
    assert.equal(out.files, 2);
    assert.deepEqual(out.missing, ["gone.jpg"]);
    assert.equal(fs.existsSync(`${target}.partial`), false);

    const dir = path.join(root, "open");
    const read = await readPackage({ zipFile: target, dir });
    assert.equal(read.manifest.format, FORMAT);
    assert.equal(read.manifest.church, "Igreja X");
    assert.deepEqual(read.manifest.files, { "media/a1.mp3": 6, "fonts/f1.woff2": 4 });
    assert.deepEqual(read.items, items);
    assert.deepEqual(read.files.sort(), ["fonts/f1.woff2", "media/a1.mp3"]);
    assert.equal(fs.readFileSync(stagedFile(dir, "media/a1.mp3"), "utf8"), "audio!");
    assert.equal(stagedFile(dir, "media/../../x"), null);
    assert.equal(stagedFile(dir, "media/nao.jpg"), null);
    assert.ok(read.bytes > 0);
});

test("read refuses what is not a package, an entry out of the list, a newer version", async () => {
    const root = tmp();
    const dir = path.join(root, "open");
    const zip = (name) => path.join(root, name);
    const manifest = JSON.stringify({ format: FORMAT, version: 1 });

    fs.writeFileSync(zip("plain.keryx"), "não é zip");
    await assert.rejects(readPackage({ zipFile: zip("plain.keryx"), dir }), /não é um zip/);

    await zipOf(zip("other.keryx"), [["manifest.json", JSON.stringify({ format: "keryx-export" })], ["items.json", "{}"]]);
    await assert.rejects(readPackage({ zipFile: zip("other.keryx"), dir }), /não é um pacote do KERYX/);

    await zipOf(zip("evil.keryx"), [["manifest.json", manifest], ["items.json", "{}"], ["keryx.db", "x"]]);
    await assert.rejects(readPackage({ zipFile: zip("evil.keryx"), dir }), /item inesperado/);
    assert.equal(fs.existsSync(dir), false, "nothing left staged");

    await zipOf(zip("new.keryx"), [["manifest.json", JSON.stringify({ format: FORMAT, version: 99 })], ["items.json", "{}"]]);
    await assert.rejects(readPackage({ zipFile: zip("new.keryx"), dir }), /versão mais nova/);

    await zipOf(zip("noitems.keryx"), [["manifest.json", manifest]]);
    await assert.rejects(readPackage({ zipFile: zip("noitems.keryx"), dir }), /lista de itens/);

    await zipOf(zip("bad.keryx"), [["manifest.json", manifest], ["items.json", "{nope"]]);
    await assert.rejects(readPackage({ zipFile: zip("bad.keryx"), dir }), /não dá para ler/);

    await zipOf(zip("many.keryx"), [["manifest.json", manifest], ["items.json", "{}"], ["media/a.jpg", "1"]]);
    await assert.rejects(readPackage({ zipFile: zip("many.keryx"), dir, maxEntries: 2 }), /itens demais/);
    await assert.rejects(readPackage({ zipFile: zip("many.keryx"), dir, freeSpace: () => 10 }), /espaço livre/);
});

test("createPackages: open, take a file into the media folder under a new name, close", async () => {
    const root = tmp();
    const mediaDir = path.join(root, "media");
    fs.mkdirSync(mediaDir);
    fs.writeFileSync(path.join(mediaDir, "bg.jpg"), "picture");
    const packages = createPackages({ root: path.join(root, "pacotes"), mediaDir, importMedia });
    const target = path.join(root, "p.keryx");
    await packages.write({ target, manifest: { kind: "media" }, items: { media: [] }, files: [{ name: "bg.jpg", as: "media" }] });

    const opened = await packages.open(target);
    assert.deepEqual(opened.files, ["media/bg.jpg"]);
    const { fileName } = await packages.take(opened.id, "media/bg.jpg");
    assert.notEqual(fileName, "bg.jpg");
    assert.equal(fs.readFileSync(path.join(mediaDir, fileName), "utf8"), "picture");
    await assert.rejects(packages.take(opened.id, "media/other.jpg"), /não está no pacote/);
    await assert.rejects(packages.take("nope", "media/bg.jpg"), /não está no pacote/);
    packages.close(opened.id);
    assert.equal(fs.existsSync(path.join(root, "pacotes", opened.id)), false);
});
