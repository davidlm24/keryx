import test from "node:test";
import assert from "node:assert/strict";
import { searchTerms, verseMatches, highlightParts, anchorTerm, scopeBooks, fold } from "./bibleSearch.js";

test("terms: words, quoted phrases, accents and case ignored", () => {
    assert.deepEqual(searchTerms("Amor próximo"), ["amor", "proximo"]);
    assert.deepEqual(searchTerms('"amor ao próximo" Deus'), ["amor ao proximo", "deus"]);
    assert.deepEqual(searchTerms("a e coração"), ["coracao"], "one-letter words are dropped");
    assert.deepEqual(searchTerms("(luz"), ["luz"], "punctuation never reaches a pattern");
    assert.deepEqual(searchTerms('"sem fim'), ["sem fim"], "an unclosed quote is still a phrase");
    assert.equal(anchorTerm(["amor", "proximo"]), "proximo");
    assert.equal(fold("CORAÇÃO"), "coracao");
});

test("matching needs every term", () => {
    const v = "Amarás o teu próximo como a ti mesmo.";
    assert.equal(verseMatches(v, searchTerms("proximo amaras")), true);
    assert.equal(verseMatches(v, searchTerms("proximo Deus")), false);
    assert.equal(verseMatches(v, searchTerms('"teu proximo"')), true);
    assert.equal(verseMatches(v, []), false);
});

test("hits are marked on the original text", () => {
    const parts = highlightParts("Ó Senhor, o teu coração é bom; corações", searchTerms("coracao"));
    assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.text), ["coração"], "corações folds to coracoes: not a hit");
    assert.deepEqual(highlightParts("Corações e coração", searchTerms("CORA")).filter((p) => p.hit).map((p) => p.text), ["Cora", "cora"]);
    assert.equal(parts.map((p) => p.text).join(""), "Ó Senhor, o teu coração é bom; corações", "nothing lost");
    assert.deepEqual(highlightParts("texto (com parênteses)", searchTerms("(com")).filter((p) => p.hit).map((p) => p.text), ["com"]);
    assert.deepEqual(highlightParts("abc", []), [{ text: "abc", hit: false }]);
});

test("scopes", () => {
    const books = Array.from({ length: 66 }, (_, i) => ({ name: `L${i}` }));
    assert.equal(scopeBooks("ot", books).length, 39);
    assert.equal(scopeBooks("nt", books)[0], "L39");
    assert.deepEqual(scopeBooks("book", books, "João"), ["João"]);
    assert.equal(scopeBooks("all", books), null);
});
