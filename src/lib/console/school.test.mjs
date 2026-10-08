import test from "node:test";
import assert from "node:assert/strict";
import { materialSlides, materialMeta, quizQuestions, slidesFromText, textFromSlides, toggleAttendance, attendanceNote, presentCount, dayOf } from "./school.js";

test("a quiz is a question slide and its answer slide", () => {
    const m = { type: "quiz", quiz_questions: [{ question: "Quem construiu a arca?", options: ["Moisés", "Noé"], correct: 1 }, { question: "Por quê?", options: [] }] };
    const s = materialSlides(m);
    assert.equal(s.length, 3, "a question without options has no answer slide");
    assert.deepEqual(s.map((x) => x.label), ["Pergunta 1", "Resposta 1", "Pergunta 2"]);
    assert.equal(s[0].text, "Quem construiu a arca?\n\nA) Moisés\nB) Noé");
    assert.equal(s[1].text, "Quem construiu a arca?\n\n✓ B) Noé");
    assert.deepEqual(quizQuestions({ quiz_question: "Velha?", quiz_options: ["a"], quiz_correct: 0 }), [{ question: "Velha?", options: ["a"], correct: 0 }], "old rows");
    assert.match(materialMeta(m), /2 perguntas/);
});

test("slides and text; blank slides dropped; images kept", () => {
    const m = { type: "slides", slides: [{ text: "Um" }, { text: "  " }, { text: "", image_url: "http://x/a.png" }] };
    assert.deepEqual(materialSlides(m), [{ text: "Um", label: "Slide 1" }, { text: "", label: "Slide 2", image_url: "http://x/a.png" }]);
    assert.deepEqual(materialSlides({ type: "video", video_url: "v" }), []);
    assert.deepEqual(slidesFromText("A\nlinha\n\n\nB"), [{ text: "A\nlinha" }, { text: "B" }]);
    assert.equal(textFromSlides([{ text: "A" }, { text: "B" }]), "A\n\nB");
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
