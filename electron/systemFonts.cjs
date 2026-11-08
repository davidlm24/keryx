// The fonts installed on this computer, read by KERYX itself (owner
// 2026-10-20: "como no Holyrics, que já lista todas as fontes do PC"). The
// Editor de temas' "Do computador…" lists them (src/components/editor/
// LocalFontsDialog.jsx) and copies the chosen faces into the church's media
// library (Media rows of category font, src/lib/fonts.js). Before, the list
// came from Chromium's Local Font Access: it needed a permission and a
// click, and only families with a face named exactly Regular/Bold/Italic/
// Bold Italic showed up.
//
// Windows keeps the fonts in %WINDIR%\Fonts and, installed for one user
// only, %LOCALAPPDATA%\Microsoft\Windows\Fonts. Each file is read only as far
// as it must be: the table directory, the `name` table and OS/2's fsType. A
// family is the font's Windows family name (nameID 1), as Windows lists it
// and Holyrics shows it ("Segoe UI Semibold" is a family of its own), and a
// face is its style (nameID 2: Regular, Bold, Italic, Bold Italic), so a
// theme's normal and bold text find their faces. A .ttc collection holds
// several fonts in one file; @font-face cannot address one of them, so a
// face from a collection is cut out into a file of its own when it is read.
// A face whose licence forbids embedding (fsType "restricted") is listed
// but marked, and the dialog does not copy it.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const fsp = fs.promises;
const EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);
const MAX_NAME_TABLE = 512 * 1024;
const RIBBI = { regular: ["400", "normal"], bold: ["700", "normal"], italic: ["400", "italic"], "bold italic": ["700", "italic"] };

function fontDirs(env = process.env, platform = process.platform) {
    if (platform !== "win32") return [];
    const dirs = [];
    const win = env.WINDIR || env.SystemRoot;
    if (win) dirs.push(path.join(win, "Fonts"));
    if (env.LOCALAPPDATA) dirs.push(path.join(env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts"));
    return dirs;
}

// ---- Reading the tables (pure, on buffers) --------------------------------

const tag4 = (buf, at) => buf.toString("latin1", at, at + 4);

// The table records of the font whose directory starts at `at`.
function tableRecords(dir, at = 0) {
    const count = dir.readUInt16BE(at + 4);
    const tables = {};
    for (let i = 0; i < count; i++) {
        const r = at + 12 + i * 16;
        if (r + 16 > dir.length) break;
        tables[tag4(dir, r)] = { offset: dir.readUInt32BE(r + 8), length: dir.readUInt32BE(r + 12), checksum: dir.readUInt32BE(r + 4) };
    }
    return { count, tables };
}

function decodeName(buf, platform) {
    if (platform === 1) return buf.toString("latin1");
    // Platforms 0 (Unicode) and 3 (Windows): UTF-16BE.
    const le = Buffer.alloc(buf.length - (buf.length % 2));
    for (let i = 0; i + 1 < buf.length; i += 2) { le[i] = buf[i + 1]; le[i + 1] = buf[i]; }
    return le.toString("utf16le");
}

// The `name` table's strings by nameID, the Windows English record first,
// then any Windows record, then Unicode, then Macintosh.
function parseNames(table) {
    if (!table || table.length < 6) return {};
    const count = table.readUInt16BE(2);
    const strings = table.readUInt16BE(4);
    const rank = (platform, encoding, language) => (platform === 3 && language === 0x409 ? 0 : platform === 3 && encoding !== 0 ? 1 : platform === 3 ? 2 : platform === 0 ? 3 : platform === 1 && language === 0 ? 4 : 9);
    const best = {};
    for (let i = 0; i < count; i++) {
        const r = 6 + i * 12;
        if (r + 12 > table.length) break;
        const platform = table.readUInt16BE(r), encoding = table.readUInt16BE(r + 2), language = table.readUInt16BE(r + 4);
        const id = table.readUInt16BE(r + 6), length = table.readUInt16BE(r + 8), offset = table.readUInt16BE(r + 10);
        const score = rank(platform, encoding, language);
        if (score === 9 || (best[id] && best[id].score <= score)) continue;
        const start = strings + offset;
        if (start + length > table.length) continue;
        const value = decodeName(table.subarray(start, start + length), platform).replace(/\0/g, "").trim();
        if (value) best[id] = { score, value };
    }
    return Object.fromEntries(Object.entries(best).map(([id, v]) => [id, v.value]));
}

// The face a font is: its family, its style and @font-face's weight/style.
function faceOf(names, os2) {
    const family = names[1] || names[16] || "";
    const name = names[2] || names[17] || "Regular";
    const ribbi = RIBBI[name.trim().toLowerCase().replace(/\s+/g, " ")];
    let weight, style;
    if (ribbi) [weight, style] = ribbi;
    else {
        const w = os2 && os2.weight ? Math.min(900, Math.max(100, Math.round(os2.weight / 100) * 100)) : 400;
        weight = String(w);
        style = /italic|oblique/i.test(name) || (os2 && os2.italic) ? "italic" : "normal";
    }
    // fsType: "restricted license embedding" alone (bit 1 without 2 or 3)
    // means the font may not travel with a document.
    const restricted = Boolean(os2) && (os2.fsType & 0x000e) === 0x0002;
    return { family, name, weight, style, restricted };
}

const parseOs2 = (table) => (table && table.length >= 10
    ? { weight: table.readUInt16BE(4), fsType: table.readUInt16BE(8), italic: table.length >= 64 ? Boolean(table.readUInt16BE(62) & 1) : false }
    : null);

// One font of a collection as a font file of its own: its table records
// and tables, laid out again (4-byte aligned) with new offsets.
function extractFromCollection(buf, index) {
    if (tag4(buf, 0) !== "ttcf") throw new Error("not a collection");
    const fonts = buf.readUInt32BE(8);
    if (!(index >= 0 && index < fonts)) throw new Error("no such font in the collection");
    const at = buf.readUInt32BE(12 + index * 4);
    const count = buf.readUInt16BE(at + 4);
    const records = [];
    for (let i = 0; i < count; i++) {
        const r = at + 12 + i * 16;
        records.push({ tag: buf.subarray(r, r + 4), checksum: buf.readUInt32BE(r + 4), offset: buf.readUInt32BE(r + 8), length: buf.readUInt32BE(r + 12) });
    }
    const pad4 = (n) => (n + 3) & ~3;
    let size = 12 + count * 16;
    for (const rec of records) size += pad4(rec.length);
    const out = Buffer.alloc(size);
    buf.copy(out, 0, at, at + 12);
    let data = 12 + count * 16;
    records.forEach((rec, i) => {
        const r = 12 + i * 16;
        rec.tag.copy(out, r);
        out.writeUInt32BE(rec.checksum, r + 4);
        out.writeUInt32BE(data, r + 8);
        out.writeUInt32BE(rec.length, r + 12);
        buf.copy(out, data, rec.offset, rec.offset + rec.length);
        data += pad4(rec.length);
    });
    return out;
}

// ---- Reading the files ------------------------------------------------------

async function readAt(fh, position, length) {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, position);
    return buf.subarray(0, bytesRead);
}

// The faces in one font file: [{ index, family, name, weight, style, restricted }].
async function facesInFile(file) {
    const fh = await fsp.open(file, "r");
    try {
        const head = await readAt(fh, 0, 12);
        if (head.length < 12) return [];
        const starts = [];
        if (tag4(head, 0) === "ttcf") {
            const n = Math.min(head.readUInt32BE(8), 64);
            const list = await readAt(fh, 12, n * 4);
            for (let i = 0; i < n && i * 4 + 4 <= list.length; i++) starts.push(list.readUInt32BE(i * 4));
        } else starts.push(0);
        const faces = [];
        for (const [index, at] of starts.entries()) {
            const top = await readAt(fh, at, 12);
            if (top.length < 12) continue;
            const count = top.readUInt16BE(4);
            if (!count || count > 200) continue;
            const dir = Buffer.concat([top, await readAt(fh, at + 12, count * 16)]);
            const { tables } = tableRecords(dir, 0);
            if (!tables.name || tables.name.length > MAX_NAME_TABLE) continue;
            const names = parseNames(await readAt(fh, tables.name.offset, tables.name.length));
            const os2 = tables["OS/2"] ? parseOs2(await readAt(fh, tables["OS/2"].offset, Math.min(tables["OS/2"].length, 64))) : null;
            const face = faceOf(names, os2);
            if (face.family) faces.push({ index, collection: starts.length > 1 || tag4(head, 0) === "ttcf", ...face });
        }
        return faces;
    } finally {
        await fh.close();
    }
}

const idOf = (file, index) => crypto.createHash("sha1").update(`${file}#${index}`).digest("hex").slice(0, 16);

// Every family on the PC, each with its faces, sorted as Brazilians read:
// [{ family, faces: [{ id, name, weight, style, bytes, restricted }] }].
// `byId` remembers where each face is, for read(); nothing else is read.
async function scanDirs(dirs) {
    const families = new Map();
    const byId = new Map();
    // The files of every folder, read a few at a time (one by one took
    // seconds for the ~750 files of a church PC), then gathered in folder
    // order so the system's copy of a face wins over a per-user one.
    const files = [];
    for (const dir of dirs) {
        let names;
        try { names = await fsp.readdir(dir); } catch { continue; }
        for (const name of names) if (EXTENSIONS.has(path.extname(name).toLowerCase())) files.push(path.join(dir, name));
    }
    const found = new Array(files.length);
    let next = 0;
    const worker = async () => {
        while (next < files.length) {
            const i = next++;
            try { const stat = await fsp.stat(files[i]); found[i] = { stat, faces: await facesInFile(files[i]) }; } catch { found[i] = null; }
        }
    };
    await Promise.all(Array.from({ length: Math.min(24, files.length) }, worker));
    for (const [i, file] of files.entries()) {
        if (!found[i]) continue;
        const { stat, faces } = found[i];
        for (const f of faces) {
            if (!families.has(f.family)) families.set(f.family, new Map());
            const byFace = families.get(f.family);
            const key = `${f.weight} ${f.style}`;
            if (byFace.has(key)) continue; // the same face in both folders: the first one
            const id = idOf(file, f.index);
            byId.set(id, { file, index: f.index, collection: f.collection });
            byFace.set(key, { id, name: f.name, weight: f.weight, style: f.style, bytes: f.collection ? null : stat.size, restricted: f.restricted });
        }
    }
    // Regular, Bold, Italic, Bold Italic first (what a theme draws), then
    // the other weights, lightest first.
    const RANK = { "400 normal": 0, "700 normal": 1, "400 italic": 2, "700 italic": 3 };
    const order = (f) => RANK[`${f.weight} ${f.style}`] ?? 10 + Number(f.weight) / 100 + (f.style === "italic" ? 0.5 : 0);
    const list = [...families.entries()]
        .map(([family, faces]) => ({ family, faces: [...faces.values()].sort((a, b) => order(a) - order(b)) }))
        .sort((a, b) => a.family.localeCompare(b.family, "pt-BR", { sensitivity: "base" }));
    return { families: list, byId };
}

// The list and the reader, with the scan kept until a folder changes
// (installing a font touches its folder's mtime).
function createSystemFonts({ dirs = fontDirs() } = {}) {
    let cache = null;
    const stamp = async () => (await Promise.all(dirs.map((d) => fsp.stat(d).then((s) => `${d}:${s.mtimeMs}`).catch(() => `${d}:-`)))).join("|");
    async function scan() {
        const key = await stamp();
        if (!cache || cache.key !== key) cache = { key, ...(await scanDirs(dirs)) };
        return cache;
    }
    return {
        async list() { return (await scan()).families; },
        // A face's file, by an id from the list: never a path from the page.
        async read(id) {
            const where = (await scan()).byId.get(String(id || ""));
            if (!where) throw Object.assign(new Error("Fonte não encontrada neste computador."), { status: 404 });
            const buf = await fsp.readFile(where.file);
            return where.collection ? extractFromCollection(buf, where.index) : buf;
        },
    };
}

module.exports = { createSystemFonts, scanDirs, facesInFile, fontDirs, parseNames, faceOf, extractFromCollection, tableRecords };
