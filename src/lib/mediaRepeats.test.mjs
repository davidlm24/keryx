import { test } from "node:test";
import assert from "node:assert/strict";
import { repeatedFiles, youtubeRow, repeatQuestion, skippedSay, foldName, titleOfFile } from "./mediaRepeats.js";
import { focusesCancel } from "./console/confirm.js";

const typeOf = (f) => (/\.mp4$/i.test(f.name) ? "video" : /\.(jpe?g|png)$/i.test(f.name) ? "image" : "other");
const file = (name, size) => ({ name, size });
const row = (id, title, type, size, extra = {}) => ({ id, title, type, size, file_url: `keryx-media://${id}.bin`, ...extra });

test("a file with the same kind, title and size is already in the Mídia", () => {
    const media = [row("a", "Abertura culto", "video", 1000), row("b", "Foto", "image", 50)];
    const { fresh, repeated } = repeatedFiles([file("Abertura culto.mp4", 1000), file("Novo.mp4", 1000)], media, typeOf);
    assert.deepEqual(fresh.map((f) => f.name), ["Novo.mp4"]);
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0].row.id, "a");
});

test("names compare without accents or case; a different size or kind is another file", () => {
    const media = [row("a", "Louvor Graça", "video", 1000)];
    assert.equal(repeatedFiles([file("louvor graca.mp4", 1000)], media, typeOf).repeated.length, 1);
    assert.equal(repeatedFiles([file("Louvor Graça.mp4", 999)], media, typeOf).repeated.length, 0, "another size");
    assert.equal(repeatedFiles([file("Louvor Graça.jpg", 1000)], media, typeOf).repeated.length, 0, "another kind");
});

test("a row whose size is not known yet counts by its title", () => {
    const media = [row("a", "Abertura", "video", undefined)];
    assert.equal(repeatedFiles([file("Abertura.mp4", 1000)], media, typeOf).repeated.length, 1);
});

test("the same file twice in one pick: the first goes in", () => {
    const { fresh, repeated } = repeatedFiles([file("A.mp4", 5), file("A.mp4", 5)], [], typeOf);
    assert.equal(fresh.length, 1);
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0].row, null);
});

test("a YouTube link row never matches a picked file", () => {
    const media = [{ id: "y", title: "Abertura", type: "video", file_url: "https://youtu.be/dQw4w9WgXcQ" }];
    assert.equal(repeatedFiles([file("Abertura.mp4", 5)], media, typeOf).repeated.length, 0);
});

test("a YouTube video is found by its id, in any form, also once downloaded", () => {
    const link = { id: "l", type: "video", file_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
    const got = { id: "d", type: "video", file_url: "keryx-media://x.mp4", source_url: "https://youtu.be/abcdefghijk" };
    const media = [link, got];
    assert.equal(youtubeRow("https://youtu.be/dQw4w9WgXcQ?t=30", media)?.id, "l");
    assert.equal(youtubeRow("https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ", media)?.id, "l", "v= not first");
    assert.equal(youtubeRow("https://www.youtube.com/shorts/dQw4w9WgXcQ", media)?.id, "l");
    assert.equal(youtubeRow("https://www.youtube.com/watch?v=abcdefghijk", media)?.id, "d", "the downloaded one keeps its link");
    assert.equal(youtubeRow("https://www.youtube.com/live/zzzzzzzzzzz", media), null);
    assert.equal(youtubeRow("não é link", media), null);
});

test("the question adds anyway on its action, skips on Cancelar, and opens on skipping", () => {
    const q = repeatQuestion(["Abertura culto"]);
    assert.equal(q.title, "Já está na Mídia");
    assert.equal(q.ok, "Adicionar mesmo assim");
    assert.equal(q.no, "Pular");
    assert.equal(focusesCancel(q), true, "Enter answers skip");
    assert.equal(repeatQuestion(["a", "b"]).no, "Pular as repetidas");
    assert.match(repeatQuestion(["x"], { link: true }).text, /YouTube/);
});

test("words", () => {
    assert.equal(skippedSay(0), "");
    assert.equal(skippedSay(1), "1 já estava na Mídia e ficou de fora");
    assert.equal(skippedSay(2), "2 já estavam na Mídia e ficaram de fora");
    assert.equal(foldName(" Graça "), "graca");
    assert.equal(titleOfFile({ name: "a.b.mp4" }), "a.b");
});
