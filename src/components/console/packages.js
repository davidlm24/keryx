import { createContext, useContext } from "react";
import { keryx } from "@/api/keryxClient";
import {
    packageFor, packageManifest, packageFileName, lyricsJson, readItems, openPlan, importSteps, rewriteRow,
    sameFileCandidates, storeForm, copyName, fileOf,
} from "@/lib/keryxPackage";

// The KERYX package, the page's side (src/lib/keryxPackage.js has the
// rules; electron/keryxPackage.cjs the zip): "Exportar…" in the selection
// bars and the menus asks with ExportPackageDialog, "Abrir pacote do
// KERYX…" (Biblioteca › +, or a .keryx picked in Importar músicas) shows
// OpenPackageDialog. The console and a detached /Janela each hold both and
// give their door through this context:
//   exportItems(kind, rows)   kind: songs | themes | notices | media | materials
//   openPackage(file?)        a File the page was given, or the chooser
export const PackageContext = createContext(null);
const nobody = { exportItems: () => {}, openPackage: () => {} };
export const usePackages = () => useContext(PackageContext) || nobody;

// What the windows load files from (`mediaBase` + file), read once.
const mediaBase = () => (typeof window !== "undefined" && window.keryxDesktop?.mediaBaseUrl) || "";
const all = (name) => keryx.entities[name].list().then((r) => r || []).catch(() => []);

// The library a package is built from: every theme, Media row (backgrounds
// and fonts included) and background setting, read from the store when
// asked (the lists on screen leave the backgrounds and fonts out).
async function library() {
    const [themes, media, backgroundPrefs] = await Promise.all([all("ProjectionTheme"), all("Media"), all("BackgroundPref")]);
    return { themes, media, backgroundPrefs };
}

// The package for a selection, and its size: the files' sizes from the
// media folder (FileInfo), plus a little for the rows. -> { pkg, bytes, missing }
export async function preparePackage(kind, rows) {
    const base = mediaBase();
    const pkg = packageFor({ kind, rows, data: await library(), mediaBase: base });
    let bytes = JSON.stringify(pkg.items).length;
    let missing = 0;
    if (pkg.files.length) {
        const urls = pkg.files.map((f) => base + f.name);
        const info = await keryx.integrations.Core.FileInfo({ urls }).catch(() => ({}));
        for (const u of urls) {
            if (info[u]?.exists) bytes += info[u].size || 0;
            else missing += 1;
        }
    }
    return { pkg, bytes, missing };
}

async function appVersion() {
    try {
        const res = await window.keryxDesktop?.system?.call("info");
        return res?.data?.version || "";
    } catch {
        return "";
    }
}

// "Com os arquivos": the .keryx where the operator chooses. -> the result
// of the save ({ file, bytes, files, missing }) or null (closed).
export async function writePackage(kind, rows, pkg) {
    const church = await keryx.auth.me().then((u) => u?.church_name || "", () => "");
    const manifest = packageManifest({ kind, counts: pkg.counts, app: await appVersion(), church });
    return keryx.integrations.Core.PackageExport({ manifest, items: pkg.items, files: pkg.files, name: packageFileName(kind, rows) });
}

// "Só as letras": the JSON "Exportar todas" always wrote, as a download.
export function writeLyrics(songs) {
    const blob = new Blob([lyricsJson(songs)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = songs.length === 1 ? packageFileName("songs", songs).replace(/\.keryx$/, ".json") : `keryx_musicas_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Opens a package and plans it against the library here.
// -> null (closed) | { pkg, plan }
export async function readPackage(file) {
    const opened = await keryx.integrations.Core.PackageOpen({ file });
    if (!opened) return null;
    const base = mediaBase();
    const pkg = {
        id: opened.id,
        name: opened.name || "",
        bytes: opened.bytes || 0,
        manifest: opened.manifest || {},
        items: readItems(opened.items),
        files: opened.files || [],
        sizes: opened.manifest?.files || {},
    };
    const [songs, themes, media, notices, materials] = await Promise.all([all("Song"), all("ProjectionTheme"), all("Media"), all("CommunicationVideo"), all("BibleMaterial")]);
    const hereMedia = media.map((m) => storeForm(m, base));
    const candidates = sameFileCandidates(pkg, hereMedia);
    const sizes = {};
    if (candidates.length) {
        const urls = candidates.map((u) => base + fileOf(u));
        const info = await keryx.integrations.Core.FileInfo({ urls }).catch(() => ({}));
        for (const u of candidates) { const i = info[base + fileOf(u)]; if (i?.exists) sizes[u] = i.size; }
    }
    const plan = openPlan(pkg, { songs, themes, media: hereMedia, notices, materials, sizes }, { mediaBase: base });
    return { pkg, plan, themes };
}

export const closePackage = (pkg) => (pkg?.id ? keryx.integrations.Core.PackageClose({ id: pkg.id }) : null);

// Writes what goes in, in order: the files (each copied into the media
// folder under a new name), the Media rows behind them and their
// background settings, the themes, then the songs, avisos and materials —
// every row through the store, so the sync records it. A row that fails is
// named; the rest go on. -> { made: { songs, themes, … }, skipped, failed }
export async function runImport({ pkg, plan, themesHere = [], skip, forced, onProgress }) {
    const steps = importSteps(plan, { skip, forced, items: pkg.items });
    const files = { ...steps.reuse.files };
    const themes = Object.fromEntries(Object.entries(steps.reuse.themes).map(([id, row]) => [id, row.id]));
    const made = { songs: 0, themes: 0, notices: 0, materials: 0, backgrounds: 0, fonts: 0, media: 0 };
    const failed = [];
    const total = steps.takes.length + steps.total;
    let done = 0;
    const tick = () => onProgress?.({ done: ++done, total });

    for (const entry of steps.takes) {
        const name = entry.slice(entry.indexOf("/") + 1);
        try { files[name] = (await keryx.integrations.Core.PackageTake({ id: pkg.id, entry })).file_url; }
        catch (err) { failed.push(`${name} (${err?.message || "falhou"})`); }
        tick();
    }
    const create = async (entity, row, title) => {
        try { return await keryx.entities[entity].create(row); } catch (err) { failed.push(`${title} (${err?.message || "falhou"})`); return null; }
    };

    for (const it of steps.create.media) {
        const row = rewriteRow(it.row, { files });
        // A Media row whose file did not come is not made (it would be a row
        // with nothing behind it).
        if (fileOf(it.row.file_url) && !row.file_url) { failed.push(`${it.title} (o arquivo não veio)`); tick(); continue; }
        if (await create("Media", row, it.title)) made[it.group] += 1;
        tick();
    }
    for (const p of steps.create.backgroundPrefs) {
        const row = rewriteRow(p, { files });
        if (row.source) await create("BackgroundPref", row, "ajustes do fundo");
    }
    const names = themesHere.map((t) => t.name).filter(Boolean);
    for (const it of steps.create.themes) {
        const row = rewriteRow(it.row, { files });
        if (it.status === "repeated" && row.name) { row.name = copyName(row.name, names); names.push(row.name); }
        const out = await create("ProjectionTheme", row, it.title);
        if (out) { themes[it.row.id] = out.id; made.themes += 1; }
        tick();
    }
    for (const [group, entity] of [["songs", "Song"], ["notices", "CommunicationVideo"], ["materials", "BibleMaterial"]]) {
        for (const it of steps.create[group]) {
            if (await create(entity, rewriteRow(it.row, { files, themes }), it.title)) made[group] += 1;
            tick();
        }
    }
    return { made, skipped: steps.skipped, reused: steps.reused, failed };
}

