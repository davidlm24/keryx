import { test } from "node:test";
import assert from "node:assert/strict";
import {
    packageFor, packageCounts, packageManifest, exportTitle, packageFileName, lyricsJson, formatBytes,
    readItems, openPlan, importSteps, rewriteRow, copyName, sameFileCandidates, packageSource, packageChips,
    importSay, fileOf, filesIn, storeForm, songThemeIds, PACKAGE_FORMAT,
} from "./keryxPackage.js";

const BASE = "http://127.0.0.1:7700/media/";

// A library as the windows read it (http urls).
const library = () => ({
    themes: [
        { id: "t1", name: "Ceia escuro", font_family: "Playfair Display", background: { kind: "image", value: `${BASE}bg1.jpg` }, is_default: true, pinned: true },
        { id: "t2", name: "Azul noturno", background: { kind: "color", value: "#001" } },
        { id: "t3", name: "Não usado" },
    ],
    media: [
        { id: "m1", title: "pão e vinho", type: "image", category: "background", file_url: `${BASE}bg1.jpg` },
        { id: "m2", title: "Grande é o Senhor (playback)", type: "audio", category: "other", file_url: `${BASE}a1.mp3` },
        { id: "f1", title: "Playfair Display", type: "font", category: "font", file_url: `${BASE}f1.woff2`, font: { family: "Playfair Display", weight: "400", style: "normal", face: "Regular" } },
        { id: "f2", title: "Playfair Display", type: "font", category: "font", file_url: `${BASE}f2.woff2`, font: { family: "Playfair Display", weight: "700", style: "normal", face: "Bold" } },
        { id: "f3", title: "Outra", type: "font", category: "font", file_url: `${BASE}f3.woff2`, font: { family: "Outra" } },
        { id: "m3", title: "Não usado", type: "image", category: "other", file_url: `${BASE}x.jpg` },
    ],
    backgroundPrefs: [
        { id: "p1", source: `${BASE}bg1.jpg`, dim_pct: 40, category: "Ceia", favorite: true },
        { id: "p2", source: "bundled:123", dim_pct: 10 },
    ],
});
const songs = [
    { id: "s1", title: "Grande é o Senhor", lyrics: "Grande é o Senhor", theme_id: "t1", part_themes: { refrão: "t2" }, audio_url: `${BASE}a1.mp3`, is_favorite: true, play_count: 9, created_date: "x" },
    { id: "s2", title: "Tu és fiel", lyrics: "Tu és fiel", background: { kind: "image", value: `${BASE}bundled/backgrounds/abc.webp` } },
];

test("files: keryx-media names only, never bundled or the web", () => {
    assert.equal(fileOf("keryx-media://a1.mp3"), "a1.mp3");
    assert.equal(fileOf("keryx-media://bundled/backgrounds/x.webp"), null);
    assert.equal(fileOf("https://youtu.be/x"), null);
    assert.deepEqual(filesIn([{ a: "keryx-media://x.jpg", b: ["keryx-media://y.mp4", "keryx-media://x.jpg"] }]), ["x.jpg", "y.mp4"]);
    assert.deepEqual(storeForm({ u: `${BASE}a.jpg`, v: "#fff" }, BASE), { u: "keryx-media://a.jpg", v: "#fff" });
    assert.deepEqual(songThemeIds(songs[0]), ["t1", "t2"]);
});

test("packageFor: songs carry their themes, the files they name, the Media rows behind them and the fonts", () => {
    const { items, files, counts } = packageFor({ kind: "songs", rows: songs, data: library(), mediaBase: BASE });
    assert.deepEqual(items.songs.map((s) => s.id), ["s1", "s2"]);
    // Store form, and what belongs to this church is left out.
    assert.equal(items.songs[0].audio_url, "keryx-media://a1.mp3");
    for (const k of ["is_favorite", "play_count", "created_date"]) assert.equal(k in items.songs[0], false, k);
    assert.deepEqual(items.themes.map((t) => t.id).sort(), ["t1", "t2"]);
    assert.equal("is_default" in items.themes[0] || "pinned" in items.themes[0], false);
    // The audio and the background come with their rows; both faces of the
    // theme's font; nothing unused.
    assert.deepEqual(items.media.map((m) => m.id).sort(), ["f1", "f2", "m1", "m2"]);
    assert.deepEqual(items.backgroundPrefs.map((p) => p.id), ["p1"]);
    assert.equal("favorite" in items.backgroundPrefs[0], false);
    assert.deepEqual(files.sort((a, b) => a.name.localeCompare(b.name)), [
        { name: "a1.mp3", as: "media" }, { name: "bg1.jpg", as: "media" }, { name: "f1.woff2", as: "fonts" }, { name: "f2.woff2", as: "fonts" },
    ]);
    assert.deepEqual(counts, { songs: 2, themes: 2, notices: 0, materials: 0, backgrounds: 1, fonts: 1, media: 1 });
});

test("packageFor: themes, media and avisos alone", () => {
    const lib = library();
    const t = packageFor({ kind: "themes", rows: [lib.themes[0]], data: lib, mediaBase: BASE });
    assert.deepEqual(t.items.media.map((m) => m.id).sort(), ["f1", "f2", "m1"]);
    const m = packageFor({ kind: "media", rows: [lib.media[5]], data: lib, mediaBase: BASE });
    assert.deepEqual(m.files, [{ name: "x.jpg", as: "media" }]);
    const n = packageFor({ kind: "notices", rows: [{ id: "n1", title: "Aviso", font_family: "Outra", background_video: `${BASE}v.mp4` }], data: lib, mediaBase: BASE });
    assert.deepEqual(n.items.media.map((x) => x.id), ["f3"]);
    assert.deepEqual(n.files.map((f) => f.name).sort(), ["f3.woff2", "v.mp4"]);
    assert.throws(() => packageFor({ kind: "nada", rows: [] }));
});

test("the export dialog's words and the file name", () => {
    assert.equal(exportTitle("songs", 3), "Exportar 3 músicas");
    assert.equal(exportTitle("songs", 1), "Exportar a música");
    assert.equal(exportTitle("themes", 1), "Exportar o tema");
    assert.equal(packageFileName("songs", [{ title: "Grande é o Senhor!" }]), "grande-e-o-senhor.keryx");
    assert.equal(packageFileName("songs", [{}, {}], new Date("2026-10-21T12:00:00Z")), "keryx-2-musicas-2026-10-21.keryx");
    assert.equal(formatBytes(18 * 1024 * 1024), "18 MB");
    assert.equal(formatBytes(1536), "1,5 KB");
    const m = packageManifest({ kind: "songs", counts: { songs: 1 }, app: "0.2.20", church: "Igreja X", now: new Date("2026-10-18T10:00:00Z") });
    assert.equal(m.format, PACKAGE_FORMAT);
    assert.equal(m.version, 1);
    // "Só as letras" is the JSON the song importers already read.
    const json = JSON.parse(lyricsJson([{ id: "x", title: "A", lyrics: "b", created_date: "z" }]));
    assert.equal(json.app, "KERYX");
    assert.deepEqual(json.songs, [{ title: "A", lyrics: "b" }]);
});

test("readItems keeps only arrays of rows with ids", () => {
    const items = readItems({ songs: [{ id: "a", title: "x" }, { title: "no id" }, "x", null], themes: "nope", evil: [{ id: "z" }] });
    assert.deepEqual(items.songs, [{ id: "a", title: "x" }]);
    assert.deepEqual(items.themes, []);
    assert.equal("evil" in items, false);
});

// A package as opened: the rows of packageFor, the files the zip has.
function opened({ drop = [] } = {}) {
    const { items, files } = packageFor({ kind: "songs", rows: songs, data: library(), mediaBase: BASE });
    const entries = files.filter((f) => !drop.includes(f.name)).map((f) => `${f.as}/${f.name}`);
    return { manifest: { kind: "songs", church: "Igreja X" }, items, files: entries, sizes: Object.fromEntries(entries.map((e) => [e, 1000])) };
}

test("openPlan: one list by kind, new rows, a repeated song, a theme of the same name, a file that did not come", () => {
    const here = { songs: [{ title: "Tu és fiel", lyrics: "Tu és fiel" }], themes: [{ id: "h2", name: "azul NOTURNO" }], media: [] };
    const plan = openPlan(opened({ drop: ["a1.mp3"] }), here, { mediaBase: BASE });
    assert.deepEqual(plan.groups.map((g) => g.name), ["Músicas", "Temas", "Fundos", "Fontes", "Mídia"]);
    const by = (key) => plan.items.find((it) => it.key === key);
    assert.equal(by("songs:s1").status, "ok");
    assert.equal(by("songs:s1").meta, 'com o tema "Ceia escuro"');
    assert.equal(by("songs:s2").status, "repeated");
    assert.equal(by("songs:s2").meta, 'parece a "Tu és fiel" que já está aqui');
    assert.equal(by("themes:t2").status, "repeated");
    assert.equal(by("themes:t2").way, "copy");
    assert.equal(by("themes:t2").match.id, "h2");
    assert.equal(by("themes:t1").meta, 'fundo e fonte "Playfair Display" vêm junto');
    assert.equal(by("media:m2").status, "bad");
    assert.equal(by("media:m2").reason, "o arquivo não veio no pacote");
    assert.deepEqual(plan.counts, { ok: 5, repeated: 2, bad: 1 });
});

test("openPlan: the same file here (type, title and size) is a repeated background; a font face here is reused", () => {
    const here = {
        media: [
            { id: "h1", title: "Pão e Vinho", type: "image", category: "background", file_url: `${BASE}here.jpg` },
            { id: "h3", title: "Playfair Display", type: "font", category: "font", file_url: `${BASE}hf.woff2`, font: { family: "Playfair Display", weight: "400", style: "normal" } },
        ],
        sizes: { [`${BASE}here.jpg`]: 1000 },
    };
    const pkg = opened();
    assert.deepEqual(sameFileCandidates(pkg, here.media.map((m) => storeForm(m, BASE))), ["keryx-media://here.jpg"]);
    const plan = openPlan(pkg, { ...here, sizes: { "keryx-media://here.jpg": 1000 } }, { mediaBase: BASE });
    const bg = plan.items.find((it) => it.key === "media:m1");
    assert.equal(bg.status, "repeated");
    assert.equal(bg.way, "force");
    assert.equal(plan.items.find((it) => it.key === "media:f1").status, "repeated");
    assert.equal(plan.items.find((it) => it.key === "media:f2").status, "ok");
    // Another size: not the same file.
    const other = openPlan(pkg, { ...here, sizes: { "keryx-media://here.jpg": 5 } }, { mediaBase: BASE });
    assert.equal(other.items.find((it) => it.key === "media:m1").status, "ok");
});

test("importSteps: Pular os repetidos reuses the theme of the same name (O1-2 = C) and leaves the repeated song out", () => {
    const pkg = opened();
    const here = { songs: [{ title: "Tu és fiel", lyrics: "Tu és fiel" }], themes: [{ id: "h2", name: "Azul noturno" }] };
    const plan = openPlan(pkg, here, { mediaBase: BASE });
    const steps = importSteps(plan, { skip: true, items: pkg.items });
    assert.deepEqual(steps.create.songs.map((it) => it.row.id), ["s1"]);
    assert.deepEqual(steps.create.themes.map((it) => it.row.id), ["t1"]);
    assert.equal(steps.reuse.themes.t2.id, "h2");
    assert.deepEqual(steps.create.media.map((it) => it.row.id).sort(), ["f1", "f2", "m1", "m2"]);
    assert.deepEqual(steps.create.backgroundPrefs.map((p) => p.id), ["p1"]);
    assert.deepEqual(steps.takes.sort(), ["fonts/f1.woff2", "fonts/f2.woff2", "media/a1.mp3", "media/bg1.jpg"]);
    assert.equal(steps.total, 6);
    assert.equal(steps.skipped, 1);
    assert.equal(steps.reused, 1);

    // "Trazer como cópia" and "Trazer mesmo assim".
    const forced = importSteps(plan, { skip: true, forced: new Set(["themes:t2", "songs:s2"]), items: pkg.items });
    assert.deepEqual(forced.create.themes.map((it) => it.row.id).sort(), ["t1", "t2"]);
    assert.deepEqual(forced.create.songs.map((it) => it.row.id), ["s1", "s2"]);
    // Pular off brings the repeated songs, and STILL reuses the theme of the
    // same name (O1-2 = C): a copy comes only from its own box.
    const off = importSteps(plan, { skip: false, items: pkg.items });
    assert.equal(off.create.songs.length, 2);
    assert.deepEqual(off.create.themes.map((it) => it.row.id), ["t1"]);
    assert.equal(off.reuse.themes.t2.id, "h2");
    assert.equal(off.skipped, 0);
    const offCopy = importSteps(plan, { skip: false, forced: new Set(["themes:t2"]), items: pkg.items });
    assert.deepEqual(offCopy.create.themes.map((it) => it.row.id).sort(), ["t1", "t2"]);
    assert.deepEqual(offCopy.reuse.themes, {});
});

test("importSteps: a repeated background is reused whatever Pular says, copied only from its own box", () => {
    const pkg = opened();
    const here = { media: [{ id: "h1", title: "pão e vinho", type: "image", category: "background", file_url: "keryx-media://here.jpg" }], sizes: { "keryx-media://here.jpg": 1000 } };
    const plan = openPlan(pkg, here, { mediaBase: BASE });
    for (const skip of [true, false]) {
        const steps = importSteps(plan, { skip, items: pkg.items });
        assert.equal(steps.reuse.files["bg1.jpg"], "keryx-media://here.jpg", `skip ${skip}`);
        assert.ok(!steps.takes.includes("media/bg1.jpg"));
        assert.ok(!steps.create.media.some((it) => it.row.id === "m1"));
        // No setting of a file that did not come.
        assert.ok(!steps.create.backgroundPrefs.length);
    }
    const copy = importSteps(plan, { skip: true, forced: new Set(["media:m1"]), items: pkg.items });
    assert.ok(copy.takes.includes("media/bg1.jpg"));
    assert.ok(copy.create.media.some((it) => it.row.id === "m1"));
});

test("openPlan: a file left out for being over 1 GB says so", () => {
    const pkg = { ...opened({ drop: ["a1.mp3"] }) };
    pkg.manifest = { ...pkg.manifest, left: { "a1.mp3": "big" } };
    assert.equal(openPlan(pkg, {}, { mediaBase: BASE }).items.find((it) => it.key === "media:m2").reason, "o arquivo não veio no pacote (passou de 1 GB)");
});

test("importSteps: what only a skipped song used stays out", () => {
    const pkg = opened();
    const plan = openPlan(pkg, { songs: [{ title: "Grande é o Senhor", lyrics: "Grande é o Senhor" }] }, { mediaBase: BASE });
    const steps = importSteps(plan, { skip: true, items: pkg.items });
    assert.deepEqual(steps.create.songs.map((it) => it.row.id), ["s2"]);
    assert.deepEqual(steps.create.themes, []);
    assert.deepEqual(steps.create.media, []);
    assert.deepEqual(steps.takes, []);
});

test("rewriteRow: no id, new files, new themes, a file that did not come is dropped", () => {
    const row = { id: "s1", title: "A", theme_id: "t1", part_themes: { refrão: "t2", ponte: "tx" }, audio_url: "keryx-media://a1.mp3", background: { kind: "image", value: "keryx-media://gone.jpg" }, keep: "keryx-media://bundled/backgrounds/x.webp" };
    const out = rewriteRow(row, { files: { "a1.mp3": "keryx-media://new.mp3" }, themes: { t1: "N1", t2: "H2" } });
    assert.equal("id" in out, false);
    assert.equal(out.theme_id, "N1");
    assert.deepEqual(out.part_themes, { refrão: "H2" });
    assert.equal(out.audio_url, "keryx-media://new.mp3");
    assert.equal(out.background.value, "");
    assert.equal(out.keep, "keryx-media://bundled/backgrounds/x.webp");
    assert.equal(rewriteRow({ id: "x", theme_id: "gone" }).theme_id, "");
});

test("the dialog's header, chips, copy names and the toast", () => {
    assert.equal(copyName("Azul noturno", ["Azul noturno", "azul noturno (2)"]), "Azul noturno (3)");
    assert.equal(packageSource({ name: "louvor-ceia.keryx", manifest: { church: "Igreja Batista Central", exportedAt: "2026-10-18T12:00:00" }, bytes: 46 * 1024 * 1024 }), "louvor-ceia.keryx · da Igreja Batista Central · 18/10 · 46 MB");
    assert.deepEqual(packageChips({ songs: 9, themes: 2, backgrounds: 6, fonts: 1, notices: 3, media: 0 }).map((c) => `${c.n} ${c.word}`), ["9 músicas", "2 temas", "6 fundos", "1 fonte", "3 avisos"]);
    assert.deepEqual(packageCounts({ media: [{ category: "font", font: { family: "A" } }, { category: "font", font: { family: "A" } }] }).fonts, 1);
    assert.equal(importSay({ made: { songs: 2, themes: 1 }, skipped: 1 }), "Importado: 2 músicas, 1 tema · 1 repetido ficou de fora.");
    assert.equal(importSay({ made: { songs: 2 }, reused: 2 }), "Importado: 2 músicas · 2 que já estavam aqui foram usados.");
    assert.equal(importSay({}), "Nada foi importado.");
});
