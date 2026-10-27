import { test } from "node:test";
import assert from "node:assert/strict";
import { refLine, refVersion } from "./bibleDisplay.js";
import { withoutVerseMarks } from "./verseMarks.js";

test("reference line: full, without the version, or none", () => {
    assert.equal(refLine("João 3:16-17 · NVI"), "João 3:16-17 · NVI");
    assert.equal(refLine("João 3:16-17 · NVI", "plain"), "João 3:16-17");
    assert.equal(refLine("João 3 · BKJ1611", "plain"), "João 3");
    assert.equal(refLine("João 3:16", "plain"), "João 3:16", "no version to take off");
    assert.equal(refLine("João 3:16 · NVI", "none"), "");
    assert.equal(refLine(null), "");
});

test("verse numbers can be hidden, other numbers stay", () => {
    assert.equal(withoutVerseMarks("16 Porque Deus amou 17 Porque Deus enviou"), "Porque Deus amou Porque Deus enviou");
    assert.equal(withoutVerseMarks("5 Adão viveu ao todo 930 anos"), "Adão viveu ao todo 930 anos");
});

test("the sigla a reference ends with: the first edition's tag beside a second one", () => {
    assert.equal(refVersion("João 3:16 · NVI"), "NVI");
    assert.equal(refVersion("Atos 11:3-5 · BLIVRE "), "BLIVRE");
    assert.equal(refVersion("João 3:16"), "");
    assert.equal(refVersion(null), "");
});
