import test from "node:test";
import assert from "node:assert/strict";
import { songFolders, mediaFolders, foldersOf, folderOpen, visibleRows, folderCount, canGroup, normalizeLibGroup, normalizeFoldersOpen, NO_ARTIST } from "./libraryFolders.js";

const songs = [
    { id: "1", artist: "Aline Barros" },
    { id: "2", artist: "" },
    { id: "3", artist: " aline barros " },
    { id: "4", artist: "Ágape" },
    { id: "5", artist: "aline barros" },
    { id: "6" },
    { id: "7", artist: "Fernandinho" },
];

test("Letras: one folder per artist, grouped without case, the most common spelling, Sem artista last", () => {
    const f = songFolders(songs);
    assert.deepEqual(f.map((x) => x.name), ["Ágape", "aline barros", "Fernandinho", NO_ARTIST]);
    assert.deepEqual(f[1].rows.map((s) => s.id), ["1", "3", "5"], "rows keep their order");
    assert.deepEqual(f[3].rows.map((s) => s.id), ["2", "6"]);
    assert.equal(songFolders([{ artist: "B" }, { artist: "b" }])[0].name, "B", "a tie keeps the first spelling");
    assert.deepEqual(songFolders([]), []);
});

test("media tabs: one folder per church category in use, in the church's order", () => {
    const media = [
        { id: "a", category: "Louvor" },
        { id: "b", category: "sermon" },
        { id: "c" },
        { id: "d", category: "Batismo" },
        { id: "e", category: "Louvor" },
    ];
    const f = mediaFolders(media, null);
    assert.deepEqual(f.map((x) => x.name), ["Pregação", "Louvor", "Outros", "Batismo"]);
    assert.deepEqual(f[1].rows.map((m) => m.id), ["a", "e"]);
    assert.deepEqual(mediaFolders(media, ["Louvor", "Pregação"]).map((x) => x.name), ["Louvor", "Pregação", "Batismo", "Outros"]);
});

test("Avisos has no folders", () => {
    assert.equal(canGroup("avisos"), false);
    assert.deepEqual(foldersOf("avisos", [{ id: "x" }]), []);
    assert.equal(canGroup("letras"), true);
    assert.equal(canGroup("apresentacoes"), true);
});

test("open state: what was chosen, else closed — the only folder open", () => {
    const one = songFolders([{ id: "1", artist: "X" }]);
    assert.equal(folderOpen({}, one[0], 1), true);
    assert.equal(folderOpen({ "a:x": false }, one[0], 1), false);
    const f = songFolders(songs);
    assert.equal(folderOpen({}, f[0], f.length), false);
    assert.equal(folderOpen({ [f[0].key]: true }, f[0], f.length), true);
});

test("visible rows: only open folders, in display order", () => {
    const f = songFolders(songs);
    assert.deepEqual(visibleRows(f, {}).map((s) => s.id), []);
    assert.deepEqual(visibleRows(f, { [f[1].key]: true, [f[3].key]: true }).map((s) => s.id), ["1", "3", "5", "2", "6"]);
    assert.deepEqual(visibleRows(songFolders([{ id: "1" }]), {}).map((s) => s.id), ["1"]);
});

test("counts in words", () => {
    assert.equal(folderCount("letras", 1), "1 música");
    assert.equal(folderCount("letras", 3), "3 músicas");
    assert.equal(folderCount("imagens", 2), "2 imagens");
    assert.equal(folderCount("videos", 1), "1 vídeo");
    assert.equal(folderCount("apresentacoes", 2), "2 apresentações");
});

test("the saved values are made safe", () => {
    assert.deepEqual(normalizeLibGroup({ letras: true, videos: false, avisos: true, imagens: "yes" }), { letras: true });
    assert.deepEqual(normalizeLibGroup(null), {});
    assert.deepEqual(normalizeLibGroup([true]), {});
    assert.deepEqual(normalizeFoldersOpen({ letras: { "a:x": true, "a:y": false, "a:z": 1 }, avisos: { k: true }, videos: [] }), { letras: { "a:x": true, "a:y": false } });
    assert.deepEqual(normalizeFoldersOpen("x"), {});
});
