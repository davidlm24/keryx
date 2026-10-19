import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_TYPES, TRANSITION_TYPE_IDS, contentType, mediaType, typeOf } from "./contentKinds.js";
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

// "O que esta tela recebe" (Rodada H2 / G10): the kinds of the per-output rule.
test("the rule's kinds: the same list on every output, YouTube and the computer's videos apart", async () => {
    const { RULE_KINDS, RULE_KIND_IDS, RULE_GROUPS, ruleKindOf, stageRuleKind, TEXT_KINDS, TRANSITION_TYPES } = await import("./contentKinds.js");
    assert.deepEqual(RULE_KIND_IDS, ["lyrics", "bible", "text", "image", "video", "youtube", "presentation", "tool", "notice"]);
    assert.deepEqual(RULE_GROUPS, ["Textos", "Mídia", "Ferramentas e avisos"]);
    assert.deepEqual(TEXT_KINDS, ["lyrics", "bible", "text"]);
    assert.equal(RULE_KINDS.find((k) => k.id === "video").label, "Vídeos do computador");
    // Every layer of the live state lands on one rule kind.
    assert.equal(ruleKindOf("content", { kind: "lyrics" }), "lyrics");
    assert.equal(ruleKindOf("content", {}), "lyrics", "an old content without a kind is a song");
    assert.equal(ruleKindOf("content", { kind: "presentation" }), "presentation");
    assert.equal(ruleKindOf("media", { kind: "youtube" }), "youtube");
    assert.equal(ruleKindOf("video", { kind: "youtube" }), "youtube");
    assert.equal(ruleKindOf("media", { kind: "video" }), "video");
    assert.equal(ruleKindOf("media", { kind: "gif" }), "image");
    assert.equal(ruleKindOf("media", { kind: "pdf" }), "presentation", "an old PDF row");
    assert.equal(ruleKindOf("communication", { item: {} }), "notice");
    assert.equal(ruleKindOf("tool", { mode: "clock" }), "tool");
    assert.equal(ruleKindOf("media", null), null);
    assert.equal(ruleKindOf("media", { kind: "zip" }), null);
    // Transições keeps its own list: Vídeos e YouTube stay one row there.
    assert.ok(TRANSITION_TYPES.some((t) => t.id === "video" && t.kinds.includes("youtube")));
    // What is prepared: the kind the rule would leave out, null when it never does.
    assert.equal(stageRuleKind({ kind: "bible" }), "bible");
    assert.equal(stageRuleKind({ kind: "piece" }), "notice");
    assert.equal(stageRuleKind({ kind: "media", args: { kind: "image" } }), "image");
    assert.equal(stageRuleKind({ kind: "media", args: { items: [{ kind: "youtube" }] } }), "youtube");
    assert.equal(stageRuleKind({ kind: "video", args: { kind: "video" } }), "video");
    assert.equal(stageRuleKind({ kind: "audio" }), null);
    assert.equal(stageRuleKind(null), null);
});
