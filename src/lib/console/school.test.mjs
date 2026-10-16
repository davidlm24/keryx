import test from "node:test";
import assert from "node:assert/strict";
import { materialSlides, materialStage, materialMeta, quizQuestions, cleanOptions, slidesFromText, textFromSlides, slidesFromEdit, revealAction, revealNote, moveItem, remapBlanks, toggleAttendance, attendanceNote, presentCount, dayOf } from "./school.js";
import { applyOp, emptyState, activitySteps } from "../../../shared/live-state.mjs";

test("a quiz question is one slide with its options as cards; the answer is revealed on it", () => {
    const m = { type: "quiz", quiz_questions: [{ question: "Quem construiu a arca?", options: ["Moisés", "Noé"], correct: 1, explain: "Gênesis 6:13-22", notes: "40 dias" }, { question: "Por quê?", options: [] }] };
    const s = materialSlides(m);
    assert.equal(s.length, 2, "one slide per question");
    assert.deepEqual(s.map((x) => x.label), ["Pergunta 1", "Pergunta 2"]);
    assert.deepEqual(s[0], { text: "Quem construiu a arca?", label: "Pergunta 1", activity: { kind: "choice", options: ["Moisés", "Noé"], correct: 1, explain: "Gênesis 6:13-22" }, notes: "40 dias" });
    assert.equal(s[1].activity, undefined, "an open question (no options) is plain text");
    assert.deepEqual(quizQuestions({ quiz_question: "Velha?", quiz_options: ["a"], quiz_correct: 0 }), [{ question: "Velha?", options: ["a"], correct: 0 }], "old rows");
    assert.match(materialMeta(m), /2 perguntas/);
    // What goes on air has no teacher's notes; they ride apart.
    const st = materialStage(m);
    assert.equal(st.slides[0].notes, undefined);
    assert.deepEqual(st.slideNotes, ["40 dias", ""]);
    assert.deepEqual(materialStage({ type: "quiz", quiz_questions: [{ question: "Q", options: ["a", "b"] }] }).slideNotes, []);
    // The live state takes it as it is.
    const live = applyOp(emptyState(0), "content.show", { kind: "text", slides: st.slides }, 0);
    assert.equal(activitySteps(live.content.slides[0]), 1);
});

test("quiz options: up to eight, empty ones left out, the right one followed", () => {
    assert.deepEqual(cleanOptions({ options: ["a", "", "c", "d"], correct: 2 }), { options: ["a", "c", "d"], correct: 1 });
    assert.deepEqual(cleanOptions({ options: ["a", "b", ""], correct: 2 }), { options: ["a", "b"], correct: 0 }, "the right one empty: the first");
    assert.equal(cleanOptions({ options: Array.from({ length: 10 }, (_, i) => `o${i}`), correct: 0 }).options.length, 8);
});

test("Verdadeiro ou falso, Complete a frase, Memorizar and Discussão become activity slides", () => {
    const tf = materialSlides({ type: "truefalse", quiz_questions: [{ question: "Noé construiu a arca.", correct: 0 }, { question: "Choveu 7 dias.", correct: 1, explain: "Gn 7:12" }] });
    assert.deepEqual(tf.map((x) => [x.label, x.activity]), [["Afirmação 1", { kind: "truefalse", correct: 0 }], ["Afirmação 2", { kind: "truefalse", correct: 1, explain: "Gn 7:12" }]]);
    const bl = materialSlides({ type: "blanks", slides: [{ text: "Porque Deus amou o mundo", blanks: [4, 1, 99], ref: "João 3:16" }, { text: "Sem lacunas", blanks: [] }] });
    assert.deepEqual(bl[0], { text: "Porque Deus amou o mundo", label: "Frase 1", activity: { kind: "blanks", blanks: [1, 4], explain: "João 3:16" } });
    assert.equal(bl[1].activity, undefined, "no blank chosen: plain text");
    const mz = materialSlides({ type: "memorize", slides: [{ text: "O Senhor é o meu pastor", rounds: 3 }] })[0];
    assert.equal(mz.activity.kind, "memorize");
    assert.equal(mz.activity.rounds, 3);
    assert.deepEqual([...mz.activity.order].sort(), [0, 1, 2, 3, 4, 5]);
    const ds = materialSlides({ type: "discussion", slides: [{ text: "O que é graça?", minutes: 3, notes: "ouvir todos" }] })[0];
    assert.deepEqual(ds, { text: "O que é graça?", label: "Discussão", activity: { kind: "discussion", minutes: 3 }, notes: "ouvir todos" });
    assert.match(materialMeta({ type: "blanks", slides: [{ text: "a" }] }), /Complete a frase · 1 frase/);
    // Every one of them passes the live state's checks.
    const slides = [...tf, ...bl, mz, ds].map(({ notes: _n, ...s }) => s);
    assert.equal(applyOp(emptyState(0), "content.show", { kind: "text", slides }, 0).content.slides.length, 6);
});

test("the Escola's Revelar button and the question list", () => {
    assert.deepEqual(revealAction({ kind: "choice" }, 0, 1), { label: "Revelar resposta", to: 1, done: false });
    assert.deepEqual(revealAction({ kind: "choice" }, 1, 1), { label: "Esconder a resposta", to: 0, done: true });
    assert.equal(revealAction({ kind: "blanks" }, 1, 3).label, "Revelar a próxima palavra · 1/3");
    assert.equal(revealAction({ kind: "discussion" }, 0, 1).label, "Iniciar o timer");
    assert.equal(revealAction(null, 0, 0), null);
    assert.equal(revealNote({ kind: "choice" }, 1, 1), "revelada");
    assert.equal(revealNote({ kind: "memorize" }, 2, 4), "2/4");
    assert.equal(revealNote({ kind: "choice" }, 0, 1), "");
    assert.deepEqual(moveItem(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 0, -1), ["a", "b"], "the first stays first");
});

test("Complete a frase: the blanks follow their words when the verse is edited", () => {
    const before = "o mundo e o mundo";
    assert.deepEqual(remapBlanks(before, "Deus amou o mundo e o mundo", [4]), [6], "the second mundo stays the second");
    assert.deepEqual(remapBlanks(before, "o mundo", [1, 4]), [1], "a word gone takes its blank");
    assert.deepEqual(remapBlanks("Porque Deus amou", "Porque Deus amou, amém", [1]), [1]);
});

test("slides and text; blank slides dropped; images kept", () => {
    const m = { type: "slides", slides: [{ text: "Um" }, { text: "  " }, { text: "", image_url: "http://x/a.png" }] };
    assert.deepEqual(materialSlides(m), [{ text: "Um", label: "Slide 1" }, { text: "", label: "Slide 2", image_url: "http://x/a.png" }]);
    assert.deepEqual(materialSlides({ type: "video", video_url: "v" }), []);
    assert.deepEqual(slidesFromText("A\nlinha\n\n\nB"), [{ text: "A\nlinha" }, { text: "B" }]);
    assert.equal(textFromSlides([{ text: "A" }, { text: "", image_url: "p" }, { text: "B" }]), "A\n\nB", "a picture-only slide has no block");
});

test("editing the slides' text keeps each picture with its slide", () => {
    const old = [{ text: "Um", image_url: "1.png" }, { text: "Dois" }, { text: "", image_url: "so.png" }, { text: "Três", image_url: "3.png" }];
    // A block added at the top: the pictures do not move down.
    assert.deepEqual(slidesFromEdit(old, "Zero\n\nUm\n\nDois\n\nTrês"), [{ text: "Zero" }, { text: "Um", image_url: "1.png" }, { text: "Dois" }, { text: "", image_url: "so.png" }, { text: "Três", image_url: "3.png" }]);
    // A block taken out: the next one does not inherit its picture.
    assert.deepEqual(slidesFromEdit(old, "Dois\n\nTrês"), [{ text: "Dois" }, { text: "", image_url: "so.png" }, { text: "Três", image_url: "3.png" }]);
    // A block's text changed: it keeps its own picture.
    assert.deepEqual(slidesFromEdit(old, "Um!\n\nDois\n\nTrês"), [{ text: "Um!", image_url: "1.png" }, { text: "Dois" }, { text: "", image_url: "so.png" }, { text: "Três", image_url: "3.png" }]);
    // "Dois" gone: the picture after it follows "Um".
    assert.deepEqual(slidesFromEdit(old, "Um\n\nTrês").map((s) => s.image_url || s.text), ["1.png", "so.png", "3.png"]);
    assert.deepEqual(slidesFromEdit([], "A\n\nB"), [{ text: "A" }, { text: "B" }]);
});

test("attendance by day", () => {
    const day = dayOf(new Date(2026, 9, 11));
    assert.equal(day, "2026-10-11");
    let s = { name: "Ana", attendance: ["2026-10-04"] };
    assert.equal(attendanceNote(s, day), "última vez 04/10");
    s = toggleAttendance(s, day);
    assert.deepEqual(s.attendance, ["2026-10-04", "2026-10-11"]);
    assert.equal(attendanceNote(s, day), "presente");
    assert.equal(presentCount({ students: [s, { name: "Bia" }] }, day), 1);
    assert.equal(attendanceNote({ name: "Bia" }, day), "sem presença");
    assert.deepEqual(toggleAttendance(s, day).attendance, ["2026-10-04"]);
});
