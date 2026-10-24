import { test } from "node:test";
import assert from "node:assert/strict";
import { teamState, youtubeLink, cleanText, songTextOf, remoteRoleAllows, TEAM_CAPS, remoteState, remoteSay, passagePreview, remoteKind, remoteOps, EMERGENCY, REMOTE_CAPS, PROTOCOL, libraryPage, refFromArgs, backItemOf, relativeMedia, itemStatus } from "./remote.js";
import { WHILE_LOCKED } from "../../../shared/live-state.mjs";

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
    assert.equal(remoteSay("alertClear"), "Celular: tirou o aviso.", "the contract's label for the new actions");
    const verses = [{ number: 16, text: "Porque Deus amou" }, { number: 17, text: "para que" }, { number: 18, text: "x" }];
    assert.deepEqual(passagePreview("João 3:16-17 · NVI", verses, [16, 17]), { reference: "João 3:16-17 · NVI", text: "16 Porque Deus amou 17 para que", version: "" });
    assert.equal(passagePreview("João 3", verses, [], "NVI").text, "16 Porque Deus amou 17 para que 18 x", "a whole chapter: from its first verse");
    assert.equal(passagePreview("João 3", verses, [], "NVI").version, "NVI");
    assert.ok(passagePreview("x", [{ number: 1, text: "a".repeat(400) }], [1]).text.length <= PROTOCOL.limits.passageText);
});

// The lock table: what the runner refuses while locked (kind S) is exactly
// what the live state refuses, op by op (shared/live-state.mjs WHILE_LOCKED).
test("kind S ⇔ an op the live state refuses while locked, for every action and case", () => {
    const value = (v) => (v === "true" ? true : v === "false" ? false : v);
    for (const [name, a] of Object.entries(PROTOCOL.actions)) {
        const cases = a.opsBy ? Object.keys(a.opsBy.cases).map((v) => ({ [a.opsBy.arg]: value(v) })) : [{}];
        for (const args of cases) {
            const kind = remoteKind(name, args);
            const ops = remoteOps(name, args);
            if (kind === "R") { assert.deepEqual(ops, [], name); continue; }
            for (const op of ops) assert.equal(!WHILE_LOCKED.has(op), kind === "S", `${name} ${JSON.stringify(args)}: ${op}`);
        }
    }
    assert.equal(remoteKind("player", { do: "swap" }), "T");
    assert.equal(remoteKind("player", { do: "toggle" }), "S");
    assert.equal(remoteKind("layer", { which: "text", on: false }), "T");
    assert.equal(remoteKind("layer", { which: "text", on: true }), "S");
    assert.equal(remoteKind("nope"), null);
    // The emergency lane only takes things off.
    for (const a of EMERGENCY) assert.equal(remoteKind(a, {}), "T", a);
});

test("state v2: caps, the version, the service per request version, capped lists, no URLs", () => {
    const items = Array.from({ length: 230 }, (_, i) => ({ id: `i${i}`, type: i === 0 ? "SECTION" : "VIDEO", title: "t".repeat(120), contentId: "m1", duration: 60 }));
    const media = [{ id: "m1", type: "video", file_url: "http://127.0.0.1:7700/media/a.mp4", missing: true, syncing: true }];
    const service = { id: "s", title: "Culto", date: "2026-10-19" };
    const st = remoteState({ v: 2, app: "0.2.20", service, items, media, timers: [{ id: null, minutes: 5 }, { id: "t1", minutes: 7 }], alerts: [{ id: "a", message: "m".repeat(120) }], bible: { version: "NVI", installed: ["NVI"] } });
    assert.equal(st.v, 2);
    assert.equal(st.app, "0.2.20");
    assert.deepEqual(st.caps, REMOTE_CAPS);
    // The Controle: every section but the Equipe's chat (Rodada Q).
    assert.deepEqual(REMOTE_CAPS, PROTOCOL.caps.filter((cap) => cap !== "requests"));
    assert.ok(REMOTE_CAPS.includes("plan"));
    assert.equal(st.role, "control");
    assert.deepEqual(st.service, { id: "s", title: "Culto", date: "2026-10-19" });
    assert.equal(st.serviceId, "s");
    assert.ok(st.items.length <= PROTOCOL.limits.items && st.items.length > 100, "capped by count and by size");
    assert.equal(st.truncated, true);
    assert.equal(st.items[1].title.length, PROTOCOL.limits.itemTitle);
    assert.equal(st.items[0].section, true);
    assert.equal(st.items[0].dur, null);
    assert.equal(st.items[1].st, "syncing");
    assert.deepEqual(st.timers, [{ id: "min-5", minutes: 5 }, { id: "t1", minutes: 7 }]);
    assert.equal(st.alerts[0].message.length, PROTOCOL.limits.alertMessage);
    assert.deepEqual(st.bible, { version: "NVI", installed: ["NVI"] });
    assert.equal(st.autoplay, false, "the culto's Avançar sozinho (Rodada N2)");
    assert.equal(remoteState({ v: 2, service: { ...service, autoplay: true } }).autoplay, true);
    assert.ok(!/https?:|keryx-media:/.test(JSON.stringify(st)), "no URL in state");
    assert.ok(JSON.stringify(st).length <= PROTOCOL.limits.stateBytes);
    // A version 1 page: the title string, the v1 fields.
    const v1 = remoteState({ service, items: items.slice(0, 3), media });
    assert.equal(v1.service, "Culto");
    assert.ok(Array.isArray(v1.items) && v1.serviceId === "s");
    // rev changes with what the phone shows, not otherwise.
    assert.equal(remoteState({ v: 2, service }).rev, remoteState({ v: 2, service }).rev);
    assert.notEqual(remoteState({ v: 2, service }).rev, remoteState({ v: 2, service, live: { screen: "black" } }).rev);
});

test("an item's state, Voltar's item and relative media paths", () => {
    assert.equal(itemStatus({ type: "SONG" }), "ok");
    assert.equal(itemStatus({ type: "IMAGE", contentId: "x" }, []), "missing");
    assert.equal(itemStatus({ type: "PDF", contentId: "p" }, [{ id: "p", type: "pdf" }]), "blocked", "a PDF with no pages yet");
    assert.equal(itemStatus({ type: "POWERPOINT", contentId: "p" }, [{ id: "p", type: "powerpoint" }]), "blocked");
    assert.equal(itemStatus({ type: "IMAGE", contentId: "p" }, [{ id: "p", type: "image", missing: true }]), "missing");
    const items = [{ id: "a" }, { id: "b" }];
    const live = { history: [{ data: { ref: { serviceItemId: "b" } } }, { data: { ref: { serviceItemId: "a" } } }, { data: {} }] };
    assert.equal(backItemOf(live, items, "b"), "a");
    assert.equal(backItemOf(live, items, null), "b");
    assert.equal(backItemOf({ history: [{ data: { ref: { serviceItemId: "gone" } } }] }, items, null), null);
    assert.equal(relativeMedia("keryx-media://x.jpg"), "/media/x.jpg");
    assert.equal(relativeMedia("http://127.0.0.1:7700/media/x.jpg"), "/media/x.jpg");
    assert.equal(relativeMedia("https://youtube.com/x"), null);
});

test("the phone's Bíblia args: a reference typed any way, or the picker's", () => {
    assert.deepEqual(refFromArgs({ ref: "jo 3 16" }), { book: "João", chapter: 3, verseStart: 16, verseEnd: 16 });
    assert.deepEqual(refFromArgs({ ref: "Jo 3:16-18" }), { book: "João", chapter: 3, verseStart: 16, verseEnd: 18 });
    assert.deepEqual(refFromArgs({ ref: "jo 3" }), { book: "João", chapter: 3, verseStart: null, verseEnd: null });
    assert.equal(refFromArgs({ ref: "xyz" }), null);
    assert.deepEqual(refFromArgs({ book: "João", chapter: 3 }), { book: "João", chapter: 3, verseStart: null, verseEnd: null });
    assert.deepEqual(refFromArgs({ book: "jo", chapter: 3, verseStart: 16, verseEnd: 99 }), { book: "João", chapter: 3, verseStart: 16, verseEnd: 36 }, "a range past the end is trimmed");
    assert.equal(refFromArgs({ book: "João", chapter: 22 }), null);
    assert.equal(refFromArgs({ book: "João", chapter: 3, verseStart: 40 }), null);
    assert.equal(refFromArgs({ book: "João", chapter: 3, verseStart: 5, verseEnd: 2 }), null);
});

test("the library, a page at a time: accents folded, lyrics without chords, backgrounds never", () => {
    const songs = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, title: i === 7 ? "Grandioso És Tu" : `Canção ${i}`, artist: i === 3 ? "Aline" : "", lyrics: i === 9 ? "[G]Santo, [D]santo" : "", is_favorite: i % 2 === 0 }));
    const p1 = libraryPage({ tab: "songs", songs });
    assert.equal(p1.total, 120);
    assert.equal(p1.rows.length, PROTOCOL.limits.libraryPage);
    assert.equal(libraryPage({ tab: "songs", songs, skip: 100 }).rows.length, 20);
    assert.equal(libraryPage({ tab: "songs", songs, limit: 10 }).rows.length, 10);
    assert.deepEqual(libraryPage({ tab: "songs", songs, q: "grandioso es" }).rows.map((r) => r.id), ["s7"]);
    assert.deepEqual(libraryPage({ tab: "songs", songs, q: "ALINE" }).rows.map((r) => r.id), ["s3"]);
    assert.deepEqual(libraryPage({ tab: "songs", songs, q: "santo, santo" }).rows.map((r) => r.id), ["s9"], "chords left out of the lyrics");
    assert.equal(libraryPage({ tab: "songs", songs, fav: true }).total, 60);
    assert.equal(libraryPage({ tab: "songs", songs, loaded: { songs: false } }).ready, false);
    const media = [
        { id: "v", type: "video", title: "Vinheta", file_url: "keryx-media://v.mp4", thumbnail_url: "http://127.0.0.1:7700/media/v.jpg", duration: 30 },
        { id: "y", type: "video", title: "Clipe", file_url: "https://youtu.be/x" },
        { id: "i", type: "image", title: "Foto", file_url: "keryx-media://i.jpg", syncing: true, missing: true },
        { id: "p", type: "powerpoint", title: "Slides" },
    ];
    const m = libraryPage({ tab: "media", media });
    assert.deepEqual(m.rows.map((r) => [r.id, r.sub, r.st, r.thumb]), [["v", "Vídeo", "ok", "/media/v.jpg"], ["y", "YouTube", "ok", null], ["i", "Imagem", "syncing", null], ["p", "PowerPoint", "blocked", null]]);
    assert.deepEqual(libraryPage({ tab: "media", media, kind: "pdf" }).rows.map((r) => r.id), ["p"]);
    assert.deepEqual(libraryPage({ tab: "media", media, kind: "image" }).rows.map((r) => r.id), ["i"]);
    assert.ok(!/https?:|keryx-media:/.test(JSON.stringify(m)), "no URL in a page");
    assert.equal(libraryPage({ tab: "pieces", pieces: [{ id: "a", title: "", text: "Bem-vindos", type: "announcement" }] }).rows[0].title, "Bem-vindos");
    assert.equal(libraryPage({ tab: "materials", materials: [{ id: "x", title: "Lição 1", class_name: "Jovens" }], q: "jovens" }).total, 1);
});

test("a PDF whose pages are being made says how far on the phone (state.items and the library)", () => {
    const media = [{ id: "pdf1", type: "pdf", title: "Culto", file_url: "http://127.0.0.1:7700/media/a.pdf" }, { id: "img", type: "image", title: "Foto", file_url: "http://x/y.jpg" }];
    const progress = { pdf1: { done: 2, total: 12 } };
    const progressOf = (id) => progress[id] || null;
    const items = [{ id: "i1", type: "PDF", title: "Culto", contentId: "pdf1" }, { id: "i2", type: "IMAGE", title: "Foto", contentId: "img" }, { id: "i3", type: "SONG", title: "Hino", contentId: "pdf1" }];
    const st = remoteState({ v: 2, items, media, progressOf });
    assert.equal(st.items[0].st, "blocked");
    assert.equal(st.items[0].progress, "Preparando páginas 3/12");
    assert.equal("progress" in st.items[1], false, "nothing to say: no field (additive)");
    assert.equal("progress" in st.items[2], false, "only media items");
    assert.equal("progress" in remoteState({ v: 2, items, media }).items[0], false, "a console that does not pass it");
    const page = libraryPage({ tab: "media", media, progressOf });
    assert.equal(page.rows.find((r) => r.id === "pdf1").progress, "Preparando páginas 3/12");
    progress.pdf1 = { error: { cause: "o arquivo está corrompido ou incompleto", retryable: true } };
    assert.equal(libraryPage({ tab: "media", media, progressOf }).rows.find((r) => r.id === "pdf1").progress, "Não deu para preparar as páginas: o arquivo está corrompido ou incompleto.");
    assert.equal("progress" in libraryPage({ tab: "media", media, progressOf }).rows.find((r) => r.id === "img"), false);
});

test("the Equipe (Rodada Q): links only YouTube's, rebuilt; texts clean; capped state and lyrics", () => {
    const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    for (const ok of ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "http://m.youtube.com/shorts/dQw4w9WgXcQ", "https://music.youtube.com/watch?v=dQw4w9WgXcQ"]) assert.equal(youtubeLink(ok), yt, ok);
    for (const bad of ["https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)//youtu.be/dQw4w9WgXcQ", "https://user@youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/", "youtu.be/dQw4w9WgXcQ", ""]) assert.equal(youtubeLink(bad), null, bad);
    assert.equal(cleanText("  a\u0000b\nc\u001b ", 10), "ab\nc");
    assert.equal(cleanText("x".repeat(50), 40).length, 40);
    // The roles as lan.cjs reads them.
    assert.equal(remoteRoleAllows("library", { tab: "songs" }, "team"), true);
    assert.equal(remoteRoleAllows("library", { tab: "media" }, "team"), false);
    assert.equal(remoteRoleAllows("next", {}, "team"), false);
    assert.equal(remoteRoleAllows("requests", {}, "control"), false);
    assert.equal(remoteRoleAllows("constructor", {}, "team"), false);
    // A long Setlist and a long song stay under the cap.
    const items = Array.from({ length: 400 }, (_, i) => ({ id: `i${i}`, type: "SONG", title: "t".repeat(200) }));
    const st = teamState({ items, service: { id: "s", title: "Culto" } });
    assert.deepEqual(st.caps, TEAM_CAPS);
    assert.equal(st.truncated, true);
    assert.ok(JSON.stringify(st).length <= PROTOCOL.limits.stateBytes);
    const long = songTextOf({ id: "s", title: "Longa", lyrics: Array.from({ length: 400 }, (_, i) => `[Verso ${i}]\n${"palavra ".repeat(30)}`).join("\n\n") });
    assert.equal(long.truncated, true);
    assert.ok(JSON.stringify(long).length <= PROTOCOL.limits.stateBytes);
});

test("the Equipe's setlist carries a song item's song (Rodada Q PR4: songText)", () => {
    const st = teamState({ items: [
        { id: "i1", type: "SONG", title: "Raridade", contentId: "song-1" },
        { id: "i2", type: "BIBLE", title: "João 3", contentId: "p-1" },
        { id: "i3", type: "SONG", title: "Sem id" },
    ] });
    assert.deepEqual(st.items.map((it) => it.songId ?? null), ["song-1", null, null]);
});

test("the Equipe's setlist says who sings a pedido's item (Rodada Q S13)", () => {
    const st = teamState({ items: [
        { id: "i1", type: "SONG", title: "Bondade de Deus", contentId: "song-1", requested_by: " Ana Souza " },
        { id: "i2", type: "SONG", title: "Raridade", contentId: "song-2", requested_by: "" },
    ] });
    assert.deepEqual(st.items.map((it) => it.singer ?? null), ["Ana Souza", null]);
});
