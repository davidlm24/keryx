import test from "node:test";
import assert from "node:assert/strict";
import { verseSegments, verseNumbers } from "./verseMarks.js";

test("verse marks follow the sequence; other numbers stay text", () => {
    assert.deepEqual(verseSegments("16 Porque Deus amou o mundo 17 Porque Deus enviou"), [
        { n: 16, text: "Porque Deus amou o mundo" },
        { n: 17, text: "Porque Deus enviou" },
    ]);
    assert.deepEqual(verseNumbers("5 Adão viveu ao todo 930 anos e morreu."), [5], "930 is not a verse");
    assert.deepEqual(verseNumbers("3 Texto do versículo 3 para o teste"), [3], "a repeated number is text");
    assert.deepEqual(verseNumbers("1 a 2 b 3 c"), [1, 2, 3]);
    assert.deepEqual(verseSegments("Sem número aqui"), [{ n: null, text: "Sem número aqui" }]);
    assert.deepEqual(verseNumbers("Salmo 23 O Senhor"), [], "a mark must open the text");
});
