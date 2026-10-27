// After an import: make every row independent of the internet.
//   - files on Base44's CDN are downloaded into the media folder and the
//     row points at keryx-media://<file>
//   - URLs the app ships a copy of (bundled backgrounds) point at that copy
// Strings are rewritten wherever they appear, including inside JSON fields
// (slides, overlays, files lists).

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE44_FILE = /^https:\/\/media\.base44\.com\/\S+$/;
// BibleVerse is large and never holds media.
const SKIP = new Set(["BibleVerse"]);

function safeExtension(url) {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function mapStrings(value, fn) {
    if (typeof value === "string") return fn(value);
    if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn);
        return out;
    }
    return value;
}

function collectStrings(value, out) {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out));
    return out;
}

// mapUrl(url) -> a keryx-media:// replacement for URLs the app already has,
// or null. Returns { downloaded, mapped, failed: [{ url, reason }], rowsUpdated }.
async function localizeMedia({ store, entities, mediaDir, mapUrl = () => null, fetchImpl = fetch, log = () => {} }) {
    fs.mkdirSync(mediaDir, { recursive: true });
    const replacements = new Map();
    const result = { downloaded: 0, mapped: 0, failed: [], rowsUpdated: 0 };

    const rowsByEntity = entities.filter((e) => !SKIP.has(e)).map((entity) => [entity, store.call(entity, "list", [])]);

    // 1. Decide a replacement for every distinct URL, downloading once each.
    const urls = new Set();
    for (const [, rows] of rowsByEntity) for (const row of rows) collectStrings(row, []).forEach((s) => urls.add(s));
    for (const url of urls) {
        const mapped = mapUrl(url);
        if (mapped) {
            replacements.set(url, mapped);
            result.mapped++;
            continue;
        }
        if (!BASE44_FILE.test(url)) continue;
        try {
            const response = await fetchImpl(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const fileName = crypto.randomUUID() + safeExtension(url);
            fs.writeFileSync(path.join(mediaDir, fileName), Buffer.from(await response.arrayBuffer()));
            replacements.set(url, `keryx-media://${fileName}`);
            result.downloaded++;
            log(`  baixado ${url} -> ${fileName}`);
        } catch (err) {
            // Left as is: it keeps working online, and the report lists it.
            result.failed.push({ url, reason: err.message });
        }
    }
    if (replacements.size === 0) return result;

    // 2. Rewrite the rows that mention any of them.
    for (const [entity, rows] of rowsByEntity) {
        for (const row of rows) {
            const changes = {};
            for (const [field, value] of Object.entries(row)) {
                if (field === "id") continue;
                const next = mapStrings(value, (s) => replacements.get(s) ?? s);
                if (JSON.stringify(next) !== JSON.stringify(value)) changes[field] = next;
            }
            if (Object.keys(changes).length) {
                store.call(entity, "update", [row.id, changes]);
                result.rowsUpdated++;
            }
        }
    }
    return result;
}

module.exports = { localizeMedia };
