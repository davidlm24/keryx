// node --test src/lib/console/gerarImport.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { gerarRequestRow, gerarMessageRow, gerarStatusPatch, gerarEvent, oneGerarCopy, gerarMediaType, gerarMediaRow, GERAR_CATEGORY } from "./gerarImport.js";

const EV = { id: "ev-1", title: "Culto de domingo", date: "2026-11-23" };
const REQ = {
    id: "11111111-2222-3333-4444-555555555555", event_id: "ev-1", requester_name: "Ana", title: "Bondade de Deus",
    category: "song", details: "em Lá, entrada depois da oração", resource_kind: "youtube", resource_url: "https://youtu.be/dQw4w9WgXcQ?si=x",
    status: "new", version: 1, created_at: "2026-11-23T19:42:00Z",
};

test("a song request: who asks sings, the YouTube link rebuilt, the culto of the GERAR to show", () => {
    const row = gerarRequestRow(REQ, EV);
    assert.equal(row.id, undefined, "the store makes the id; the row is found by external_id");
    assert.equal(row.kind, "pedido");
    assert.equal(row.source, "gerar");
    assert.equal(row.external_id, REQ.id);
    assert.equal(row.sender, "Ana");
    assert.equal(row.singer, "Ana");
    assert.equal(row.song, "Bondade de Deus");
    assert.equal(row.text, "em Lá, entrada depois da oração");
    assert.equal(row.link, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(row.status, "open");
    assert.equal(row.gerar_status, "new");
    assert.equal(row.gerar_category, "song");
    assert.deepEqual(row.gerar_event, EV);
    assert.equal(row.sentAt, REQ.created_at);
});

test("the GERAR cuts nothing, so neither does the import (up to its own limits)", () => {
    const long = { ...REQ, requester_name: "N".repeat(120), title: "T".repeat(180), details: "D".repeat(2000) };
    const row = gerarRequestRow(long, EV);
    assert.equal(row.sender.length, 120);
    assert.equal(row.song.length, 180);
    assert.equal(row.text.length, 2000);
});

test("not music (D6 = A): no singer; another link stays readable in the text, never a link", () => {
    const row = gerarRequestRow({ ...REQ, category: "microphone", title: "Microfone sem fio no púlpito", resource_kind: "link", resource_url: "https://drive.example/arquivo", details: "" }, EV);
    assert.equal(row.singer, "");
    assert.equal(row.gerar_category, "microphone");
    assert.equal(row.link, undefined);
    assert.equal(row.text, "https://drive.example/arquivo");
    assert.equal(gerarRequestRow({ ...REQ, category: "nova-categoria" }).gerar_category, "other", "an unknown category reads as other");
    assert.equal(GERAR_CATEGORY.lighting.glyph, "lightbulb");
});

test("a file request carries no link (its file comes in a later wave); the culto embedded by the query", () => {
    const row = gerarRequestRow({ ...REQ, resource_kind: "file", resource_url: null, events: EV });
    assert.equal(row.link, undefined);
    assert.deepEqual(row.gerar_event, EV);
    assert.equal(gerarEvent(null), null);
});

test("completed in the GERAR is atendido here", () => {
    assert.equal(gerarRequestRow({ ...REQ, status: "completed" }).status, "done");
    assert.equal(gerarRequestRow({ ...REQ, status: "cancelled" }).status, "open", "cancelled stays open, marked by gerar_status");
});

test("a chat message of the GERAR: its sender, its text; a YouTube link plays, another stays text", () => {
    const msg = { id: "m-1", event_id: "ev-1", side: "team", sender_name: "Pr. Marcos", text: "Avise quando o vídeo estiver pronto", link: null, created_at: "2026-11-23T19:46:00Z" };
    const row = gerarMessageRow(msg, EV);
    assert.equal(row.external_id, "m-1");
    assert.equal(row.kind, "chat");
    assert.equal(row.sender, "Pr. Marcos");
    assert.equal(row.text, msg.text);
    assert.equal(row.source, "gerar");
    assert.equal(gerarMessageRow({ ...msg, link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }).link, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(gerarMessageRow({ ...msg, text: "veja", link: "https://site.example/a" }).text, "veja https://site.example/a");
});

test("a state that changed in the GERAR: completed = atendido, closed = marked, never undoing the operator", () => {
    const local = { status: "open", gerar_status: "new" };
    assert.deepEqual(gerarStatusPatch(local, { status: "in_review" }), { gerar_status: "in_review" });
    assert.deepEqual(gerarStatusPatch(local, { status: "completed" }), { gerar_status: "completed", status: "done" });
    assert.deepEqual(gerarStatusPatch(local, { status: "cancelled" }), { gerar_status: "cancelled" });
    assert.equal(gerarStatusPatch({ status: "done", gerar_status: "in_review" }, { status: "preparing" }).status, undefined, "the operator's atendido stays");
    assert.deepEqual(gerarStatusPatch({ status: "done", gerar_status: "completed" }, { status: "in_review" }), { gerar_status: "in_review", status: "open" }, "reopened there, open here");
    assert.equal(gerarStatusPatch(local, { status: "new" }), null);
    assert.equal(gerarStatusPatch(null, { status: "new" }), null);
});

test("a GERAR row two computers both brought is shown once (the oldest)", () => {
    const rows = [
        { id: "a", kind: "chat", source: "gerar", external_id: "m1", sentAt: "1" },
        { id: "b", kind: "chat", source: "gerar", external_id: "m1", sentAt: "1" },
        { id: "c", kind: "chat", source: "", sentAt: "2" },
        { id: "d", kind: "pedido", source: "gerar", external_id: "m1", sentAt: "3" },
    ];
    assert.deepEqual(oneGerarCopy(rows).map((r) => r.id), ["a", "c", "d"]);
});

test("a file attached in the GERAR: its Mídia type by name, and its row (wave 4)", () => {
    assert.equal(gerarMediaType("Playback.MP3"), "audio");
    assert.equal(gerarMediaType("clipe.mov"), "video");
    assert.equal(gerarMediaType("foto.jpeg"), "image");
    assert.equal(gerarMediaType("cifra.pdf"), "pdf");
    assert.equal(gerarMediaType("letra.docx"), null, "the Mídia does not take it");
    const row = gerarMediaRow({ name: "Bondade de Deus.mp3", fileUrl: "http://127.0.0.1:7700/media/u.mp3" }, { sender: "Ana", gerar_event: { title: "Culto de domingo" } });
    assert.deepEqual(row, { title: "Bondade de Deus", type: "audio", file_url: "http://127.0.0.1:7700/media/u.mp3", duration: 0, description: "Do GERAR · pedido de Ana · Culto de domingo" });
    assert.equal(gerarMediaRow({ name: "x.docx", fileUrl: "u" }), null);
});

test("a request picked from the KERYX library (C8) is tied to the file", () => {
    const row = gerarRequestRow({ ...REQ, title: "", resource_kind: null, resource_url: null, category: "playback", keryx_media_id: "media-42", keryx_media_title: "Bondade de Deus (playback)" }, EV);
    assert.equal(row.mediaId, "media-42");
    assert.equal(row.song, "Bondade de Deus (playback)", "the index's title when the request has none");
    assert.equal(gerarRequestRow(REQ, EV).mediaId, undefined, "a request from before C8 has none");
});
