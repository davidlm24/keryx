// A file into the media folder (keryx:media-import, electron/data-ipc.cjs).
//
// A file the operator picked or dragged from a folder comes as its path,
// which only the preload reads (webUtils.getPathForFile on a File the OS
// gave; page code cannot name one), and the main process copies it: a video
// of several GB never crosses IPC. Only what the console makes itself (a
// video's still, a PDF's pages) or a file with no path behind it (dragged
// from a browser) comes as bytes.
//
// There is no cap on a copied file: churches import long videos of several
// GB. What is checked instead:
//   - the source is stat-ed first: a regular file, and how big;
//   - the disk of the media folder has room for it and SPACE_RESERVE more,
//     so the database can still write (507 otherwise, in pt-BR);
//   - bytes are at most MAX_IMPORT_BYTES: a bigger file is held whole in
//     memory in both processes, so it is refused (413) with a hint to bring
//     it from a folder (the preload refuses before reading it);
//   - the copy lands under a hidden temporary name (".<name>.partial", like
//     sync.cjs; backups and the archive skip it) and is renamed only when
//     whole, so a failure leaves nothing behind.
// -> { data: { fileName } } | { error: { message, status } }

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const fsp = fs.promises;

const MAX_IMPORT_BYTES = 256 * 1024 * 1024;
const SPACE_RESERVE = 100 * 1024 * 1024;

function safeExtension(name) {
    const ext = path.extname(String(name || "")).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

// "4,2 GB", "850 MB", "12 KB" (binary units, as Windows shows them).
function formatSize(bytes) {
    const units = ["bytes", "KB", "MB", "GB", "TB"];
    let n = Math.max(0, Number(bytes) || 0);
    let u = 0;
    while (n >= 1024 && u < units.length - 1) { n /= 1024; u += 1; }
    const shown = u === 0 || n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "").replace(".", ",");
    return `${shown} ${units[u]}`;
}

// Free bytes for this user on the disk holding `dir`. A disk that cannot
// say (a network share, an old system) never blocks an import.
async function freeSpaceOf(dir) {
    try {
        const s = await fsp.statfs(dir);
        const free = Number(s.bavail) * Number(s.bsize);
        return Number.isFinite(free) ? free : Infinity;
    } catch {
        return Infinity;
    }
}

const fail = (message, status) => ({ error: { message, status } });

function tooBig(size, max) {
    return fail(`Este arquivo (${formatSize(size)}) é grande demais para vir assim: o limite é ${formatSize(max)}. Salve-o numa pasta do computador e use Do computador… (ou arraste-o da pasta).`, 413);
}

function noSpace(need, free) {
    const counts = Number.isFinite(free) && Number.isFinite(need);
    return fail(counts
        ? `Falta espaço no disco da pasta de mídia: este arquivo precisa de ${formatSize(need)} livres e há ${formatSize(free)}. Libere espaço e tente de novo.`
        : "Falta espaço no disco da pasta de mídia. Libere espaço e tente de novo.", 507);
}

// A Uint8Array over what IPC delivered (a Uint8Array, a Buffer or an
// ArrayBuffer), without copying it; anything else is not a file.
function asBytes(bytes) {
    if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    return null;
}

// `size` alone is the preload saying a file with no path is too big to read:
// the answer is the same refusal, with nothing sent.
async function importMedia({ mediaDir, sourcePath, bytes, name, size: declared } = {}, deps = {}) {
    const {
        freeSpace = freeSpaceOf,
        copyFile = (from, to) => fsp.copyFile(from, to),
        writeFile = (to, data) => fsp.writeFile(to, data),
        randomName = () => crypto.randomUUID(),
        maxBytes = MAX_IMPORT_BYTES,
        reserve = SPACE_RESERVE,
        log = () => {},
    } = deps;

    let size;
    let write;
    if (sourcePath) {
        if (typeof sourcePath !== "string" || !path.isAbsolute(sourcePath)) return fail("Não foi possível salvar o arquivo: caminho inválido.", 400);
        let stat;
        try {
            stat = await fsp.stat(sourcePath);
        } catch (err) {
            if (err && err.code === "ENOENT") return fail("Não foi possível salvar o arquivo: ele não foi encontrado no computador.", 404);
            return fail(`Não foi possível ler o arquivo: ${err && err.message}`, 500);
        }
        if (!stat.isFile()) return fail("Não foi possível salvar o arquivo: não é um arquivo.", 400);
        size = stat.size;
        write = (to) => copyFile(sourcePath, to);
    } else if (bytes) {
        const data = asBytes(bytes);
        if (!data) return fail("Não foi possível salvar o arquivo: conteúdo inválido.", 400);
        if (data.byteLength > maxBytes) return tooBig(data.byteLength, maxBytes);
        size = data.byteLength;
        write = (to) => writeFile(to, data);
    } else if (Number.isFinite(declared) && declared > maxBytes) {
        return tooBig(declared, maxBytes);
    } else {
        return fail("Nenhum arquivo fornecido.", 400);
    }

    const free = await freeSpace(mediaDir);
    if (size + reserve > free) return noSpace(size + reserve, free);

    const fileName = randomName() + safeExtension(name || sourcePath);
    const target = path.join(mediaDir, fileName);
    const temp = path.join(mediaDir, `.${fileName}.partial`);
    try {
        await write(temp);
        await fsp.rename(temp, target);
        return { data: { fileName } };
    } catch (err) {
        log(`[keryx-media] import failed: ${err && err.message}`);
        // The disk filled during the copy (another program, or two imports at
        // once): the numbers from before would not explain it.
        if (err && err.code === "ENOSPC") return noSpace();
        return fail(`Não foi possível salvar o arquivo: ${err && err.message}`, 500);
    } finally {
        await fsp.rm(temp, { force: true }).catch(() => {});
    }
}

module.exports = { importMedia, freeSpaceOf, formatSize, safeExtension, MAX_IMPORT_BYTES, SPACE_RESERVE };
