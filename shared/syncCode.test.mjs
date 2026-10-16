// node --test shared/syncCode.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { makeCode, parseCode, formatCode, codeMessage, CODE_ALPHABET, CODE_LENGTH } from "./syncCode.mjs";

test("a new code: three groups of four, readable symbols, valid", () => {
    for (let i = 0; i < 200; i++) {
        const code = makeCode();
        assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
        assert.deepEqual(parseCode(code), { code: code.replace(/-/g, "") });
    }
    assert.ok(!/[ILOU]/.test(CODE_ALPHABET));
    assert.equal(CODE_ALPHABET.length, 32);
});

test("typing forgives case, spaces, dots, O for zero and I or L for one", () => {
    const fixed = (bytes) => () => Uint8Array.from(bytes);
    const code = makeCode(fixed([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1])).replace(/-/g, "");
    assert.equal(code.slice(0, 11), "01234567891");
    const typed = ` o1 23.4567 89-l${code[11].toLowerCase()} `;
    assert.deepEqual(parseCode(typed), { code });
});

test("a typo is caught: any one symbol changed, two neighbours swapped", () => {
    const { code } = parseCode(makeCode());
    let caught = 0;
    let tries = 0;
    for (let i = 0; i < CODE_LENGTH; i++) {
        for (const ch of CODE_ALPHABET) {
            if (ch === code[i]) continue;
            tries += 1;
            if (parseCode(code.slice(0, i) + ch + code.slice(i + 1)).error === "check") caught += 1;
        }
    }
    // Only 0 <-> Z (31 apart) can slip through, at most once per position.
    assert.ok(caught >= tries - CODE_LENGTH, `${caught}/${tries}`);
    for (let i = 0; i < CODE_LENGTH - 1; i++) {
        if (code[i] === code[i + 1]) continue;
        const a = CODE_ALPHABET.indexOf(code[i]);
        const b = CODE_ALPHABET.indexOf(code[i + 1]);
        if (Math.abs(a - b) === 31) continue;
        const swapped = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2);
        assert.equal(parseCode(swapped).error, "check", swapped);
    }
});

test("what is wrong with a code, in pt-BR", () => {
    assert.equal(parseCode("").error, "empty");
    assert.deepEqual(parseCode("K7QM-2HXP-9WRU"), { error: "char", char: "U" });
    assert.equal(parseCode("K7QM-2HXP").error, "short");
    assert.equal(parseCode("K7QM-2HXP-9WRT-1").error, "long");
    for (const r of [parseCode(""), parseCode("K7Q#"), parseCode("K7QM"), parseCode("K7QM2HXP9WRTX"), { error: "check" }]) {
        assert.ok(codeMessage(r).length > 10, JSON.stringify(r));
    }
    assert.equal(codeMessage({ code: "x" }), "");
    assert.equal(formatCode("K7QM2HXP9WRT"), "K7QM-2HXP-9WRT");
});
