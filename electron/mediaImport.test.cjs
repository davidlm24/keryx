const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { importMedia, freeSpaceOf, formatSize, MAX_IMPORT_BYTES, SPACE_RESERVE } = require("./mediaImport.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keryx-media-"));
// A temp media folder and a temp folder for the "computer's" files.
function setup() {
    const root = tmp();
    const mediaDir = path.join(root, "media");
    const outside = path.join(root, "pc");
    fs.mkdirSync(mediaDir);
    fs.mkdirSync(outside);
    return { mediaDir, outside };
}
const plenty = { freeSpace: async () => 1e15 };

test("a file from the computer is copied under a new name; nothing else is left", async () => {
    const { mediaDir, outside } = setup();
    const src = path.join(outside, "Culto de Domingo.MP4");
    fs.writeFileSync(src, "video");
    const res = await importMedia({ mediaDir, sourcePath: src, name: "Culto de Domingo.MP4" }, plenty);
    assert.match(res.data.fileName, /^[0-9a-f-]{36}\.mp4$/);
    assert.deepEqual(fs.readdirSync(mediaDir), [res.data.fileName]);
    assert.equal(fs.readFileSync(path.join(mediaDir, res.data.fileName), "utf8"), "video");
    assert.equal(fs.readFileSync(src, "utf8"), "video");
});

test("bytes are written as given, a view over a bigger buffer included", async () => {
    const { mediaDir } = setup();
    const whole = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const res = await importMedia({ mediaDir, bytes: whole.subarray(2, 5), name: "pagina.jpg" }, plenty);
    assert.ok(res.data.fileName.endsWith(".jpg"));
    assert.deepEqual([...fs.readFileSync(path.join(mediaDir, res.data.fileName))], [2, 3, 4]);
    const fromBuffer = await importMedia({ mediaDir, bytes: new Uint8Array([9]).buffer, name: "x.png" }, plenty);
    assert.deepEqual([...fs.readFileSync(path.join(mediaDir, fromBuffer.data.fileName))], [9]);
});

test("no space: refused with 507 before anything is written, the reserve counted", async () => {
    const { mediaDir, outside } = setup();
    const src = path.join(outside, "longo.mp4");
    fs.writeFileSync(src, Buffer.alloc(1000));
    const short = await importMedia({ mediaDir, sourcePath: src, name: "longo.mp4" }, { freeSpace: async () => 1000 + 50 - 1, reserve: 50 });
    assert.equal(short.error.status, 507);
    assert.match(short.error.message, /^Falta espaço no disco da pasta de mídia: este arquivo precisa de 1 KB livres e há 1 KB\. Libere espaço/);
    assert.deepEqual(fs.readdirSync(mediaDir), []);
    const bytes = await importMedia({ mediaDir, bytes: new Uint8Array(10), name: "a.jpg" }, { freeSpace: async () => 5, reserve: 0 });
    assert.equal(bytes.error.status, 507);
    const exact = await importMedia({ mediaDir, sourcePath: src, name: "longo.mp4" }, { freeSpace: async () => 1050, reserve: 50 });
    assert.ok(exact.data.fileName);
});

test("a disk that cannot say how much is free never blocks an import", async () => {
    const { mediaDir, outside } = setup();
    const src = path.join(outside, "a.mp3");
    fs.writeFileSync(src, "som");
    const res = await importMedia({ mediaDir, sourcePath: src, name: "a.mp3" }, { freeSpace: async () => Infinity });
    assert.ok(res.data.fileName.endsWith(".mp3"));
    assert.equal(await freeSpaceOf(path.join(mediaDir, "nao-existe")), Infinity);
    const real = await freeSpaceOf(mediaDir);
    assert.ok(real > 0);
});

test("too many bytes: refused with 413 and a hint to bring the file from a folder", async () => {
    const { mediaDir } = setup();
    const res = await importMedia({ mediaDir, bytes: new Uint8Array(9), name: "grande.mp4" }, { ...plenty, maxBytes: 8 });
    assert.equal(res.error.status, 413);
    assert.match(res.error.message, /grande demais.*Do computador…/);
    assert.deepEqual(fs.readdirSync(mediaDir), []);
    // The preload says only the size of a file it did not read.
    const declared = await importMedia({ mediaDir, size: MAX_IMPORT_BYTES + 1, name: "grande.mp4" }, plenty);
    assert.equal(declared.error.status, 413);
    assert.match(declared.error.message, /o limite é 256 MB/);
    const small = await importMedia({ mediaDir, size: 10, name: "x.mp4" }, plenty);
    assert.equal(small.error.status, 400);
    // No cap on a file copied from the computer.
    assert.equal(MAX_IMPORT_BYTES, 256 * 1024 * 1024);
});

test("not a file, a relative path, a missing file, nothing at all: refused, nothing written", async () => {
    const { mediaDir, outside } = setup();
    const dir = await importMedia({ mediaDir, sourcePath: outside, name: "pc" }, plenty);
    assert.deepEqual([dir.error.status, dir.error.message], [400, "Não foi possível salvar o arquivo: não é um arquivo."]);
    const relative = await importMedia({ mediaDir, sourcePath: "pc/a.mp4", name: "a.mp4" }, plenty);
    assert.equal(relative.error.status, 400);
    const missing = await importMedia({ mediaDir, sourcePath: path.join(outside, "sumiu.mp4"), name: "sumiu.mp4" }, plenty);
    assert.equal(missing.error.status, 404);
    const odd = await importMedia({ mediaDir, bytes: "texto", name: "a.txt" }, plenty);
    assert.equal(odd.error.status, 400);
    const none = await importMedia({ mediaDir }, plenty);
    assert.deepEqual(none.error, { message: "Nenhum arquivo fornecido.", status: 400 });
    assert.deepEqual(fs.readdirSync(mediaDir), []);
});

test("a copy that fails half-way leaves no partial file behind", async () => {
    const { mediaDir, outside } = setup();
    const src = path.join(outside, "video.mp4");
    fs.writeFileSync(src, "video inteiro");
    const seen = [];
    const halfway = async (from, to) => {
        fs.writeFileSync(to, "video in");
        seen.push(path.basename(to));
        throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
    };
    const res = await importMedia({ mediaDir, sourcePath: src, name: "video.mp4" }, { ...plenty, copyFile: halfway, randomName: () => "abc" });
    assert.equal(res.error.status, 500);
    assert.match(res.error.message, /^Não foi possível salvar o arquivo: EIO/);
    // Written under a hidden name backups and the archive skip, then removed.
    assert.deepEqual(seen, [".abc.mp4.partial"]);
    assert.deepEqual(fs.readdirSync(mediaDir), []);

    const full = async (to) => {
        fs.writeFileSync(to, "pag");
        throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    };
    const disk = await importMedia({ mediaDir, bytes: new Uint8Array(3), name: "p.jpg" }, { ...plenty, writeFile: full });
    assert.deepEqual(disk.error, { message: "Falta espaço no disco da pasta de mídia. Libere espaço e tente de novo.", status: 507 });
    assert.deepEqual(fs.readdirSync(mediaDir), []);
});

test("an unsafe extension is dropped, the default reserve is 100 MB", async () => {
    const { mediaDir } = setup();
    const res = await importMedia({ mediaDir, bytes: new Uint8Array(1), name: "estranho.ex e" }, plenty);
    assert.match(res.data.fileName, /^[0-9a-f-]{36}$/);
    assert.equal(SPACE_RESERVE, 100 * 1024 * 1024);
});

test("sizes read in pt-BR", () => {
    assert.equal(formatSize(0), "0 bytes");
    assert.equal(formatSize(512), "512 bytes");
    assert.equal(formatSize(12 * 1024), "12 KB");
    assert.equal(formatSize(1.5 * 1024 * 1024), "1,5 MB");
    assert.equal(formatSize(850 * 1024 * 1024), "850 MB");
    assert.equal(formatSize(4.2 * 1024 ** 3), "4,2 GB");
    assert.equal(formatSize(256 * 1024 * 1024), "256 MB");
});
