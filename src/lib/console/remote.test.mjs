import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteState, remoteSay, passagePreview } from "./remote.js";

test("the phone's view of the service: on air, the Setlist, the next item", () => {
    const live = { screen: "show", content: { title: "Hino", slides: [{ text: "a" }, { text: "b" }], index: 1, startedAt: 1 }, locked: false };
    const items = [{ id: "s", type: "SECTION", title: "Louvor" }, { id: "a", type: "song", title: "Hino" }, { id: "b", type: "BIBLE", title: "João 3" }];
    const st = remoteState({ service: { title: "Culto de domingo" }, items, airItemId: "a", nextItemId: "b", live });
    assert.equal(st.service, "Culto de domingo");
    assert.deepEqual(st.onAir, { title: "Hino", pos: "2/2" });
    assert.equal(st.screen, "show");
    assert.deepEqual(st.items.map((i) => [i.id, i.type, i.section]), [["s", "SECTION", true], ["a", "SONG", false], ["b", "BIBLE", false]]);
    assert.equal(st.nextItemId, "b");
});

test("nothing on air, black, logo and locked say so", () => {
    assert.equal(remoteState({}).onAir, null);
    assert.equal(remoteState({ live: { screen: "black" } }).screen, "black");
    assert.equal(remoteState({ live: { screen: "logo" } }).screen, "logo");
    assert.equal(remoteState({ live: { locked: true } }).locked, true);
});

test("what the console says, and a passage to check before sending", () => {
    assert.equal(remoteSay("next"), "Celular: próximo slide.");
    assert.equal(remoteSay("black", "Tela preta"), "Celular: Tela preta.");
    const verses = [{ number: 16, text: "Porque Deus amou" }, { number: 17, text: "para que" }, { number: 18, text: "x" }];
    assert.deepEqual(passagePreview("João 3:16-17 · NVI", verses, [16, 17]), { reference: "João 3:16-17 · NVI", text: "16 Porque Deus amou 17 para que" });
    assert.equal(passagePreview("João 3", verses, []).text, "16 Porque Deus amou", "a whole chapter: its first verse");
    assert.ok(passagePreview("x", [{ number: 1, text: "a".repeat(400) }], [1]).text.length <= 280);
});
