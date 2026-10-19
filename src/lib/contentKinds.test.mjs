import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_TYPES, TRANSITION_TYPE_IDS, contentType, mediaType, typeOf } from "./contentKinds.js";
import { SHOW_KINDS } from "./outputPrefs.js";
import { CONTENT_KINDS, MEDIA_KINDS } from "../../shared/live-state.mjs";

test("content kinds: one list, unique ids, every live kind has its kind", () => {
    const ids = CONTENT_TYPES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(TRANSITION_TYPE_IDS, ["lyrics", "bible", "text", "presentation", "image", "video", "notice", "tool"], "Transições › Por tipo de conteúdo, in the mockup's order");
    for (const k of CONTENT_KINDS) assert.ok(typeOf("content", { kind: k }), `content ${k}`);
    for (const k of MEDIA_KINDS) assert.ok(mediaType(k), `media ${k}`);
    assert.equal(contentType("tool").label, "Timer, relógio, cronômetro");
    assert.equal(contentType("nope"), null);
});

test("content kinds: what a layer holds", () => {
    assert.equal(typeOf("content", { kind: "bible" }), "bible");
    assert.equal(typeOf("content", {}), "lyrics", "a content with no kind is a song");
    assert.deepEqual(["image", "gif", "video", "youtube", "pdf"].map(mediaType), ["image", "image", "video", "video", "presentation"]);
    assert.equal(typeOf("media", { kind: "gif" }), "image");
    assert.equal(typeOf("video", { kind: "youtube" }), "video");
    assert.equal(typeOf("communication", { item: {} }), "notice");
    assert.equal(typeOf("tool", { mode: "timer" }), "tool");
    assert.equal(typeOf("media", null), null);
});

test("content kinds: Mostrar reads the list and is what it always was", () => {
    assert.deepEqual(SHOW_KINDS, [
        { id: "lyrics", name: "Letras", layer: "content", kind: "lyrics" },
        { id: "bible", name: "Bíblia", layer: "content", kind: "bible" },
        { id: "text", name: "Texto", layer: "content", kind: "text" },
        { id: "media", name: "Imagens e vídeos", layer: "media" },
        { id: "presentation", name: "Apresentações", layer: "content", kind: "presentation" },
        { id: "tool", name: "Relógio e timer", layer: "tool" },
        { id: "communication", name: "Avisos", layer: "communication" },
        { id: "alert", name: "Aviso rápido", layer: "alert" },
    ]);
});
