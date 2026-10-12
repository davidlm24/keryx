import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, emptyState } from "../../shared/live-state.mjs";
import { streamCaption, captionSize } from "./streamCaption.js";

const T = 1_000_000;
const show = (args) => applyOp(emptyState(T), "content.show", args, T);

test("nothing on air: nothing on the stream", () => {
    assert.equal(streamCaption(null), null);
    assert.equal(streamCaption(emptyState(T)), null);
});

test("lyrics: the slide's lines, no reference", () => {
    const s = show({ kind: "lyrics", title: "Canto", slides: [{ text: "Linha um\nLinha dois" }, { text: "Refrão" }] });
    const c = streamCaption(s);
    assert.deepEqual([c.kind, c.text, c.ref], ["lyrics", "Linha um\nLinha dois", ""]);
    const next = streamCaption(applyOp(s, "content.next", {}, T + 1));
    assert.equal(next.text, "Refrão");
    assert.notEqual(next.key, c.key);
});

test("a Bible slide: the text without its verse numbers, and the reference", () => {
    const passage = show({ kind: "bible", title: "João 3:16-17 · NVI", slides: [{ text: "16 Porque Deus amou 17 Porque Deus enviou" }] });
    assert.deepEqual(
        (({ text, ref }) => ({ text, ref }))(streamCaption(passage)),
        { text: "Porque Deus amou Porque Deus enviou", ref: "João 3:16-17 · NVI" },
    );
    // A chapter goes out one verse per slide, each with its own reference.
    const chapter = show({ kind: "bible", title: "João 3 · NVI", slides: [{ text: "16 Porque Deus amou", ref: "João 3:16 · NVI" }] });
    assert.equal(streamCaption(chapter).ref, "João 3:16 · NVI");
    // A number that is not a verse mark stays text.
    const years = show({ kind: "bible", title: "Gênesis 5:5 · NVI", slides: [{ text: "5 Adão viveu ao todo 930 anos" }] });
    assert.equal(streamCaption(years).text, "Adão viveu ao todo 930 anos");
});

test("Tela preta, Logo and Limpar clear the stream; the text comes back after", () => {
    const s = show({ kind: "text", title: "Boas-vindas", slides: [{ text: "Sejam bem-vindos" }] });
    assert.equal(streamCaption(applyOp(s, "screen.set", { mode: "black" }, T + 1)), null);
    assert.equal(streamCaption(applyOp(s, "screen.set", { mode: "logo" }, T + 1)), null);
    assert.equal(streamCaption(applyOp(s, "content.clear", {}, T + 1)), null);
    const back = applyOp(applyOp(s, "screen.set", { mode: "black" }, T + 1), "screen.set", { mode: "show" }, T + 2);
    assert.equal(streamCaption(back).text, "Sejam bem-vindos");
});

test("media, avisos and tools over the text keep the stream clear", () => {
    const s = show({ kind: "lyrics", title: "Canto", slides: [{ text: "Linha" }] });
    const media = applyOp(s, "media.show", { kind: "image", url: "keryx-media://a.png", title: "Foto" }, T + 1);
    assert.equal(streamCaption(media), null);
    const tool = applyOp(s, "tool.show", { mode: "clock" }, T + 1);
    assert.equal(streamCaption(tool), null);
});

test("an empty slide shows nothing", () => {
    assert.equal(streamCaption(show({ kind: "lyrics", title: "Canto", slides: [{ text: "   " }] })), null);
});

test("long text steps down in size", () => {
    assert.equal(captionSize("curto"), "l");
    assert.equal(captionSize("x".repeat(150)), "m");
    assert.equal(captionSize("x".repeat(260)), "s");
});

test("the stream's reference follows the church's choice (ref_line)", () => {
    const show = (ref_line) => streamCaption(applyOp(emptyState(1), "content.show", { kind: "bible", title: "João 3:16 · NVI", slides: [{ text: "16 Porque Deus amou o mundo" }], style: ref_line ? { ref_line } : {} }, 1));
    assert.equal(show(null).ref, "João 3:16 · NVI");
    assert.equal(show("plain").ref, "João 3:16");
    assert.equal(show("none").ref, "");
});
