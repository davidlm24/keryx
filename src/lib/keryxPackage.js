// The KERYX package, ".keryx" (owner 2026-10-21, M6 = A; O1-1 = A, O1-2 =
// C): one file for every kind of item — songs, themes, avisos, media,
// Escola materials — carrying what each one uses (its themes, the
// backgrounds, audio and video files, the church's fonts), to open in
// another KERYX. The zip is written and read by the main process
// (electron/keryxPackage.cjs):
//
//   manifest.json   { format: "keryx-pacote", version, app, exportedAt, church, kind, counts, files }
//   items.json      { songs, themes, notices, media, materials, backgroundPrefs }
//   media/<file>    the files the rows name (keryx-media://<file>)
//   fonts/<file>    the church's fonts the themes and avisos use
//
// This module is the pure part: which rows and files a selection carries
// (packageFor), what opening one will do against the library here
// (openPlan: ✓ novo, ! parece repetido, ✕ não abre) and how the rows that go
// in are rewritten to this computer's ids and files (importSteps,
// rewriteRow). Ids are always new on import and nothing here is ever
// overwritten: a repeated row is skipped or reused, never replaced.

import { songKey } from "../../shared/syncDuplicates.mjs";

export const PACKAGE_FORMAT = "keryx-pacote";
export const PACKAGE_VERSION = 1;
export const PACKAGE_EXT = ".keryx";
export const PACKAGE_FILE = /\.keryx$/i;

const SCHEME = "keryx-media://";
// A media folder file (electron/mediaImport.cjs names them uuid + ext);
// "bundled/…" (ships with KERYX, on every computer) is never one.
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// The arrays of items.json and the entity each one is.
export const ENTITIES = {
    songs: "Song",
    themes: "ProjectionTheme",
    notices: "CommunicationVideo",
    media: "Media",
    materials: "BibleMaterial",
    backgroundPrefs: "BackgroundPref",
};
// What can be exported (the kind of the selection).
export const EXPORT_KINDS = ["songs", "themes", "notices", "media", "materials"];

// Fields that belong to the computer or the church that had the row, never
// to the package: the store's own, usage, and what a church chose (its
// default theme, the themes pinned on its console, the class a material
// was in).
const STORE_FIELDS = ["created_date", "updated_date", "created_by", "created_by_id"];
const DROP = {
    Song: ["is_favorite", "play_count", "last_played_at"],
    ProjectionTheme: ["is_default", "pinned"],
    BibleMaterial: ["class_id"],
    BackgroundPref: ["hidden", "favorite"],
};

const isPlain = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
function mapStrings(value, fn) {
    if (typeof value === "string") return fn(value);
    if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
    if (isPlain(value)) {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn);
        return out;
    }
    return value;
}
function eachString(value, fn) {
    if (typeof value === "string") fn(value);
    else if (Array.isArray(value)) value.forEach((v) => eachString(v, fn));
    else if (isPlain(value)) Object.values(value).forEach((v) => eachString(v, fn));
}

// A row as the store keeps it: what the windows load (`mediaBase` + file)
// back to keryx-media://<file>, so the package does not depend on this
// computer's port.
export const storeForm = (value, mediaBase = "") =>
    mediaBase ? mapStrings(value, (s) => (s.startsWith(mediaBase) ? SCHEME + s.slice(mediaBase.length) : s)) : value;

// The media folder file a string names, or null (bundled, YouTube, a colour…).
export function fileOf(url) {
    const s = String(url || "");
    if (!s.startsWith(SCHEME)) return null;
    const name = s.slice(SCHEME.length);
    return FILE_NAME.test(name) ? name : null;
}
export const urlOf = (name) => SCHEME + name;

// Every media folder file named anywhere in some rows, in order.
export function filesIn(rows) {
    const out = new Set();
    eachString(rows, (s) => { const f = fileOf(s); if (f) out.add(f); });
    return [...out];
}

function clean(row, entity) {
    const out = {};
    const drop = new Set([...STORE_FIELDS, ...(DROP[entity] || [])]);
    for (const [k, v] of Object.entries(row || {})) if (!drop.has(k) && v !== undefined) out[k] = v;
    return out;
}

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const isFont = (m) => m?.category === "font" || m?.type === "font";
const isBackground = (m) => m?.category === "background";
const familyOf = (m) => m?.font?.family || m?.title || "";

// The themes a song follows: its own and each part's.
export function songThemeIds(song) {
    const ids = new Set();
    if (song?.theme_id) ids.add(song.theme_id);
    if (isPlain(song?.part_themes)) for (const id of Object.values(song.part_themes)) if (typeof id === "string" && id) ids.add(id);
    return [...ids];
}

// -- Export -------------------------------------------------------------------

// What a selection carries. kind: one of EXPORT_KINDS; rows: the selected
// rows (as the windows read them); data: the library here ({ themes, media
// — every Media row, backgrounds and fonts included —, backgroundPrefs }).
// -> { items, files: [{ name, as: "media" | "fonts" }], counts }
export function packageFor({ kind, rows = [], data = {}, mediaBase = "" }) {
    if (!EXPORT_KINDS.includes(kind)) throw new Error(`keryxPackage: kind "${kind}"`);
    const S = (v) => storeForm(v, mediaBase);
    const items = { songs: [], themes: [], notices: [], media: [], materials: [], backgroundPrefs: [] };
    items[kind] = rows.map((r) => clean(S(r), ENTITIES[kind]));

    // Themes: the songs' (their own and their parts').
    if (kind === "songs") {
        const byId = new Map((data.themes || []).map((t) => [t.id, t]));
        const ids = new Set(items.songs.flatMap(songThemeIds));
        items.themes = [...ids].map((id) => byId.get(id)).filter(Boolean).map((t) => clean(S(t), "ProjectionTheme"));
    }

    // The church's fonts the themes and avisos name (every face of the family).
    const allMedia = (data.media || []).map(S);
    const families = new Set([...items.themes, ...items.notices].map((r) => fold(r.font_family)).filter(Boolean));
    const fonts = allMedia.filter((m) => isFont(m) && families.has(fold(familyOf(m))));

    // The Media rows behind every file a row names (a song's audio, a
    // theme's background), so they arrive listed in the Mídia or the
    // background library and not as bare files.
    const primary = new Set(items.media.map((m) => m.id));
    const named = new Set(filesIn([items.songs, items.themes, items.notices, items.materials]));
    const behind = allMedia.filter((m) => !primary.has(m.id) && !isFont(m) && named.has(fileOf(m.file_url)));
    const seen = new Set(primary);
    for (const m of [...fonts, ...behind]) if (!seen.has(m.id)) { seen.add(m.id); items.media.push(clean(m, "Media")); }

    // A carried file's background settings (dim, blur, fit, its category).
    const carried = new Set(filesIn(items.media.map((m) => m.file_url)));
    items.backgroundPrefs = (data.backgroundPrefs || []).map(S).filter((p) => carried.has(fileOf(p.source))).map((p) => clean(p, "BackgroundPref"));

    const fontFiles = new Set(items.media.filter(isFont).map((m) => fileOf(m.file_url)).filter(Boolean));
    const files = filesIn([items.songs, items.themes, items.notices, items.materials, items.media]).map((name) => ({ name, as: fontFiles.has(name) ? "fonts" : "media" }));
    return { items, files, counts: packageCounts(items) };
}

// What a package holds, by the kinds the import dialog shows.
export function packageCounts(items = {}) {
    const media = items.media || [];
    return {
        songs: (items.songs || []).length,
        themes: (items.themes || []).length,
        notices: (items.notices || []).length,
        materials: (items.materials || []).length,
        backgrounds: media.filter(isBackground).length,
        fonts: new Set(media.filter(isFont).map((m) => fold(familyOf(m)))).size,
        media: media.filter((m) => !isFont(m) && !isBackground(m)).length,
    };
}

export function packageManifest({ kind, counts, app = "0", church = "", now = new Date() }) {
    return { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, app: String(app), exportedAt: now.toISOString(), church: String(church || ""), kind, counts };
}

const NOUN = {
    songs: ["música", "músicas", "a"],
    themes: ["tema", "temas", "o"],
    notices: ["aviso", "avisos", "o"],
    media: ["arquivo", "arquivos", "o"],
    materials: ["material", "materiais", "o"],
    backgrounds: ["fundo", "fundos", "o"],
    fonts: ["fonte", "fontes", "a"],
};
export const nounOf = (kind, n) => (n === 1 ? NOUN[kind][0] : NOUN[kind][1]);
export const countOf = (kind, n) => `${n} ${nounOf(kind, n)}`;

// "Exportar 3 músicas", "Exportar o tema"
export function exportTitle(kind, n) {
    return n === 1 ? `Exportar ${NOUN[kind][2]} ${NOUN[kind][0]}` : `Exportar ${n} ${NOUN[kind][1]}`;
}

// The name offered in the save dialog: the item's title for one, else the
// kind and the date. Plain letters, digits and dashes (any Windows folder).
export function packageFileName(kind, rows = [], now = new Date()) {
    const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const one = rows.length === 1 ? slug(rows[0].title || rows[0].name || rows[0].text) : "";
    const base = one || `keryx-${rows.length}-${slug(NOUN[kind][1])}-${now.toISOString().slice(0, 10)}`;
    return `${base}${PACKAGE_EXT}`;
}

// "Só as letras": the JSON "Exportar todas" always wrote, which every
// importer of songs reads back (songsFromJson).
export function lyricsJson(songs = [], now = new Date()) {
    const rows = songs.map(({ id: _id, created_date: _c, updated_date: _u, created_by_id: _b, created_by: _cb, ...rest }) => rest);
    return JSON.stringify({ exported_at: now.toISOString(), app: "KERYX", count: rows.length, songs: rows }, null, 2);
}

// "18 MB" (as the Mídia shows sizes).
export function formatBytes(n) {
    const units = ["bytes", "KB", "MB", "GB"];
    let v = Math.max(0, Number(n) || 0);
    let u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
    const shown = u === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "").replace(".", ",");
    return `${shown} ${units[u]}`;
}

// -- Import -------------------------------------------------------------------

// items.json as read: only arrays of plain rows, each with an id (the
// package's own, used only to point rows at each other), at most `max` per
// kind. Anything else is left out.
export function readItems(raw, { max = 20000 } = {}) {
    const out = {};
    for (const key of Object.keys(ENTITIES)) {
        const list = Array.isArray(raw?.[key]) ? raw[key] : [];
        out[key] = list.filter((r) => isPlain(r) && typeof r.id === "string" && r.id).slice(0, max);
    }
    return out;
}

const songTitle = (s) => s.title || "Sem título";
const themeTitle = (t) => t.name || "Tema sem nome";
const mediaTitle = (m) => m.title || fileOf(m.file_url) || "Sem título";
const noticeTitle = (n) => n.title || n.text || "Sem título";

// The groups of the dialog, in order (O1-1 = A: one list by kind).
export const GROUPS = [
    { id: "songs", name: "Músicas" },
    { id: "themes", name: "Temas" },
    { id: "backgrounds", name: "Fundos" },
    { id: "fonts", name: "Fontes" },
    { id: "notices", name: "Avisos" },
    { id: "media", name: "Mídia" },
    { id: "materials", name: "Materiais" },
];
const groupOfMedia = (m) => (isFont(m) ? "fonts" : isBackground(m) ? "backgrounds" : "media");

// What opening a package will do, against the library here. pkg: { manifest,
// items (readItems), files: the entries the zip has ("media/x", "fonts/y"),
// sizes: { "media/x": bytes } }; here: { songs, themes, media, notices,
// materials } as the windows read them, and `sizes` { url: bytes } of the
// media files here that may be the same file (sameFileCandidates).
// -> { groups: [{ id, label, items }], items, counts, primary }
// Each item: { key, group, entity, status: ok | repeated | bad, title, meta,
// row, way?: "force" | "copy", match? (the row here it reuses), reason? }.
export function openPlan(pkg, here = {}, { mediaBase = "" } = {}) {
    const items = pkg.items || {};
    const present = new Set(pkg.files || []);
    const S = (v) => storeForm(v, mediaBase);
    const entryOf = (name, m) => `${m && isFont(m) ? "fonts" : "media"}/${name}`;
    const has = (name) => present.has(`media/${name}`) || present.has(`fonts/${name}`);
    const out = [];

    // Media first: the songs and themes say which of theirs came.
    const hereMedia = (here.media || []).map(S);
    const sizeHere = here.sizes || {};
    const sizeIn = pkg.sizes || {};
    for (const m of items.media || []) {
        const name = fileOf(m.file_url);
        const group = groupOfMedia(m);
        const item = { key: `media:${m.id}`, group, entity: "Media", title: group === "fonts" ? `${familyOf(m)}${m.font?.face ? ` · ${m.font.face}` : ""}` : mediaTitle(m), row: m };
        if (name && !has(name)) Object.assign(item, { status: "bad", reason: "o arquivo não veio no pacote" });
        else if (group === "fonts") {
            const same = hereMedia.find((h) => isFont(h) && fold(familyOf(h)) === fold(familyOf(m)) && String(h.font?.weight || "400") === String(m.font?.weight || "400") && (h.font?.style || "normal") === (m.font?.style || "normal"));
            Object.assign(item, same ? { status: "repeated", match: same, meta: "esta fonte já está aqui" } : { status: "ok", meta: "" });
        } else {
            const size = name ? sizeIn[entryOf(name, m)] : undefined;
            const same = name && size !== undefined && hereMedia.find((h) => h.type === m.type && !isFont(h) && fold(h.title) === fold(m.title) && sizeHere[h.file_url] === size);
            Object.assign(item, same ? { status: "repeated", match: same, way: "force", meta: `parece ${group === "backgrounds" ? "o fundo" : "o arquivo"} "${mediaTitle(same)}" que já está aqui` } : { status: "ok", meta: "" });
        }
        out.push(item);
    }
    const mediaByFile = new Map((items.media || []).map((m) => [fileOf(m.file_url), m]).filter(([f]) => f));
    const fileTitle = (name) => (mediaByFile.get(name) ? mediaTitle(mediaByFile.get(name)) : "um arquivo");

    // Themes: the same name here is reused (O1-2 = C) unless "Trazer como cópia".
    const namesHere = new Map((here.themes || []).filter((t) => fold(t.name)).map((t) => [fold(t.name), t]));
    const themeById = new Map((items.themes || []).map((t) => [t.id, t]));
    for (const t of items.themes || []) {
        const same = fold(t.name) ? namesHere.get(fold(t.name)) : null;
        const bg = filesIn([t.background, t.background_image])[0];
        const font = (items.media || []).find((m) => isFont(m) && fold(familyOf(m)) === fold(t.font_family));
        const withBg = Boolean(bg && has(bg));
        const comes = font
            ? (withBg ? `fundo e fonte "${familyOf(font)}" vêm junto` : `a fonte "${familyOf(font)}" vem junto`)
            : withBg ? "o fundo vem junto" : "";
        out.push(same
            ? { key: `themes:${t.id}`, group: "themes", entity: "ProjectionTheme", status: "repeated", way: "copy", match: same, title: themeTitle(t), meta: "já existe um tema com esse nome", row: t }
            : { key: `themes:${t.id}`, group: "themes", entity: "ProjectionTheme", status: "ok", title: themeTitle(t), meta: comes, row: t });
    }

    // Songs, by title and lyrics (songKey), here and earlier in the package.
    const library = new Set((here.songs || []).map(songKey));
    const seen = new Set();
    for (const s of items.songs || []) {
        const k = songKey(s);
        const where = library.has(k) ? "library" : seen.has(k) ? "package" : "";
        seen.add(k);
        if (where) {
            out.push({ key: `songs:${s.id}`, group: "songs", entity: "Song", status: "repeated", way: "force", title: songTitle(s), meta: where === "library" ? `parece a "${songTitle(s)}" que já está aqui` : "repetida dentro do pacote", row: s });
            continue;
        }
        const theme = songThemeIds(s).map((id) => themeById.get(id)).find(Boolean);
        const bg = filesIn([s.background, s.background_image])[0];
        const parts = [theme && `o tema "${themeTitle(theme)}"`, bg && has(bg) && `o fundo "${fileTitle(bg)}"`].filter(Boolean);
        out.push({ key: `songs:${s.id}`, group: "songs", entity: "Song", status: "ok", title: songTitle(s), meta: parts.length ? `com ${parts.join(" e ")}` : "só a letra", row: s });
    }

    // Avisos and materials, by their title and type.
    const keyOf = (r, title) => `${r.type || ""}\u0000${fold(title(r))}`;
    const repeatedBy = (list, hereList, title, group, entity, word) => {
        const lib = new Set((hereList || []).map((r) => keyOf(r, title)));
        for (const r of list || []) {
            const same = lib.has(keyOf(r, title));
            out.push({ key: `${group}:${r.id}`, group, entity, status: same ? "repeated" : "ok", way: same ? "force" : undefined, title: title(r), meta: same ? `já existe ${word} com esse nome` : "", row: r });
        }
    };
    repeatedBy(items.notices, here.notices, noticeTitle, "notices", "CommunicationVideo", "um aviso");
    repeatedBy(items.materials, here.materials, (r) => r.title || "Sem título", "materials", "BibleMaterial", "um material");

    const order = GROUPS.map((g) => g.id);
    out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    const groups = GROUPS.map((g) => ({ ...g, items: out.filter((it) => it.group === g.id) })).filter((g) => g.items.length);
    const counts = { ok: 0, repeated: 0, bad: 0 };
    for (const it of out) counts[it.status] += 1;
    return { groups, items: out, counts, primary: pkg.manifest?.kind || "", present: [...present] };
}

// The media files here that may be the same as one in the package (same
// type and title): their sizes are asked for (FileInfo) before openPlan.
export function sameFileCandidates(pkg, hereMedia = []) {
    const titles = new Set((pkg.items?.media || []).filter((m) => !isFont(m)).map((m) => `${m.type}\u0000${fold(m.title)}`));
    return hereMedia.filter((h) => !isFont(h) && titles.has(`${h.type}\u0000${fold(h.title)}`)).map((h) => h.file_url).filter(Boolean);
}

// "Ceia escuro (2)": the first free number.
export function copyName(name, taken = []) {
    const used = new Set(taken.map(fold));
    for (let n = 2; ; n += 1) {
        const next = `${name} (${n})`;
        if (!used.has(fold(next))) return next;
    }
}

// What goes in, with the choices: skip ("Pular os repetidos") and forced
// (the keys of the repeated rows the operator brings anyway / as a copy).
// The kind the package was made of comes whole; the rows that came with
// it (themes, backgrounds, fonts, files) only when something that goes in
// uses them. A repeated theme, background or font not brought is reused.
// -> { create: { media, themes, songs, notices, materials, backgroundPrefs }
//      (items), reuse: { themes: { oldId: row }, files: { oldName: url } },
//      takes: ["media/x", …] (the files to copy), total }
export function importSteps(plan, { skip = true, forced = new Set(), items = {} } = {}) {
    const goes = (it) => it.status === "ok" || (it.status === "repeated" && it.way && (!skip || forced.has(it.key)));
    const pick = (group) => plan.items.filter((it) => it.group === group && goes(it));
    const songs = pick("songs");
    const notices = pick("notices");
    const materials = pick("materials");
    const primary = plan.primary;

    // Themes: the package's own when it is a package of themes, else the
    // ones the songs going in follow.
    const themeItems = plan.items.filter((it) => it.group === "themes");
    const wanted = primary === "themes" ? new Set(themeItems.map((it) => it.row.id)) : new Set(songs.flatMap((it) => songThemeIds(it.row)));
    const themes = [];
    const reuseThemes = {};
    for (const it of themeItems) {
        if (!wanted.has(it.row.id)) continue;
        if (goes(it)) themes.push(it);
        else if (it.status === "repeated" && primary !== "themes") reuseThemes[it.row.id] = it.match;
    }

    // Files: what the rows going in name; the Media rows behind them come
    // along, or the one here is reused.
    const fontFamilies = new Set([...themes, ...notices].map((it) => fold(it.row.font_family)).filter(Boolean));
    const usedFiles = new Set(filesIn([...songs, ...themes, ...notices, ...materials].map((it) => it.row)));
    const media = [];
    const reuseFiles = {};
    for (const it of plan.items.filter((x) => x.entity === "Media")) {
        const name = fileOf(it.row.file_url);
        const needed = it.group === "fonts" ? fontFamilies.has(fold(familyOf(it.row))) : primary === "media" || usedFiles.has(name);
        if (!needed || it.status === "bad") continue;
        if (goes(it)) media.push(it);
        else if (it.status === "repeated" && it.match && name) reuseFiles[name] = it.match.file_url;
    }
    const takes = new Set();
    const present = new Set(plan.present || []);
    const entry = (name) => (present.has(`fonts/${name}`) ? `fonts/${name}` : `media/${name}`);
    for (const name of filesIn([...songs, ...themes, ...notices, ...materials, ...media].map((it) => it.row))) {
        if (reuseFiles[name]) continue;
        if (present.has(`media/${name}`) || present.has(`fonts/${name}`)) takes.add(entry(name));
    }
    const carried = new Set(media.map((it) => fileOf(it.row.file_url)).filter(Boolean));
    const backgroundPrefs = (items.backgroundPrefs || []).filter((p) => carried.has(fileOf(p.source)));

    const create = { media, themes, songs, notices, materials, backgroundPrefs };
    const total = media.length + themes.length + songs.length + notices.length + materials.length;
    // For the toast: the repeated songs, avisos and materials left out, and
    // the themes and files here that what came in uses instead.
    const going = new Set([...songs, ...notices, ...materials]);
    const skipped = plan.items.filter((it) => ["songs", "notices", "materials"].includes(it.group) && it.status === "repeated" && !going.has(it)).length;
    const reused = Object.keys(reuseThemes).length + Object.keys(reuseFiles).length;
    return { create, reuse: { themes: reuseThemes, files: reuseFiles }, takes: [...takes], total, skipped, reused };
}

// A row of the package as it goes in: no id (the store gives a new one),
// every file it names pointing at this computer's copy (or nothing, when
// the file did not come), every theme at its new id or the one reused.
// files: { oldName: "keryx-media://new" }; themes: { oldId: newId }.
export function rewriteRow(row, { files = {}, themes = {} } = {}) {
    const { id: _id, ...rest } = row;
    const out = mapStrings(rest, (s) => {
        const name = fileOf(s);
        return name ? (files[name] ?? "") : s;
    });
    if ("theme_id" in out) out.theme_id = (out.theme_id && themes[out.theme_id]) || "";
    if (isPlain(out.part_themes)) {
        const parts = {};
        for (const [part, id] of Object.entries(out.part_themes)) if (themes[id]) parts[part] = themes[id];
        out.part_themes = parts;
    }
    return out;
}

// The header under the title: "louvor-ceia.keryx · da Igreja Batista
// Central · 18/10 · 46 MB".
export function packageSource({ name = "", manifest = {}, bytes = 0 } = {}) {
    const d = new Date(manifest.exportedAt || "");
    const date = Number.isFinite(d.getTime()) ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "";
    return [name, manifest.church && `da ${manifest.church}`, date, bytes > 0 && formatBytes(bytes)].filter(Boolean).join(" · ");
}

// The chips: "9 músicas", "2 temas", "6 fundos", "1 fonte", "3 avisos".
export function packageChips(counts = {}) {
    return ["songs", "themes", "backgrounds", "fonts", "notices", "media", "materials"]
        .filter((k) => counts[k] > 0)
        .map((k) => ({ kind: k, n: counts[k], word: nounOf(k, counts[k]) }));
}

// The toast at the end. made: { songs, themes, … } created; reused: themes
// and files here used instead; skipped: repeated left out; failed:
// ["título (motivo)"].
export function importSay({ made = {}, skipped = 0, reused = 0, failed = [] } = {}) {
    const parts = ["songs", "themes", "notices", "materials", "backgrounds", "fonts", "media"].filter((k) => made[k] > 0).map((k) => countOf(k, made[k]));
    const total = Object.values(made).reduce((a, b) => a + (b || 0), 0);
    let text = total ? `Importado: ${parts.join(", ")}` : "Nada foi importado";
    if (reused) text += ` · ${reused === 1 ? "1 que já estava aqui foi usado" : `${reused} que já estavam aqui foram usados`}`;
    if (skipped) text += ` · ${skipped} ${skipped === 1 ? "repetido ficou" : "repetidos ficaram"} de fora`;
    if (failed.length) text += ` · não deu: ${failed.join(", ")}`;
    return `${text}.`;
}
