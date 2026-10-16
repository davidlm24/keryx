// The church's sync code (docs/desktop-architecture.md §8b, "PCs verificados"):
// made on the first computer, typed on the others. Whoever has it can sync
// through the church's folder; each computer's change files are signed with
// a key derived from it (electron/syncPairing.cjs), so files from computers
// without the code are reported and never applied.
//
// Twelve symbols in three groups, "K7QM-2HXP-9WRT": Crockford's base32 (no
// I, L, O or U, so nothing reads as something else), eleven random symbols
// (55 bits) and a check symbol, so a typo is caught as it is typed instead of
// looking like another church's code. Typing forgives what people do: lower
// case, spaces or dots for the dashes, O for zero, I or L for one.
//
// Shared by the main process (making and checking the code) and the console
// (checking it as the operator types). Pure: no Node, no DOM.

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 12;
const RANDOM = CODE_LENGTH - 1;

// Weighted sum mod 31 (a prime): any one symbol changed, or two neighbours
// swapped, changes it — except 0 and Z, 31 apart.
function checkSymbol(values) {
    let sum = 0;
    values.forEach((v, i) => { sum += (i + 1) * v; });
    return CODE_ALPHABET[sum % 31];
}

// "K7QM2HXP9WRT" -> "K7QM-2HXP-9WRT".
export const formatCode = (code) => String(code).match(/.{1,4}/g).join("-");

// A new code. `random(n)` gives n random bytes (crypto.getRandomValues in
// both the app and the tests); 256 is a multiple of 32, so `& 31` is even.
export function makeCode(random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
    const values = [...random(RANDOM)].slice(0, RANDOM).map((b) => b & 31);
    return formatCode(values.map((v) => CODE_ALPHABET[v]).join("") + checkSymbol(values));
}

// What the operator typed -> { code } (the 12 symbols, upper case, no
// dashes) or { error, char? }: "empty" | "char" | "short" | "long" | "check".
export function parseCode(input) {
    const s = String(input ?? "").toUpperCase().replace(/[\s._-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
    if (!s) return { error: "empty" };
    for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return { error: "char", char: ch };
    if (s.length < CODE_LENGTH) return { error: "short" };
    if (s.length > CODE_LENGTH) return { error: "long" };
    const values = [...s.slice(0, RANDOM)].map((ch) => CODE_ALPHABET.indexOf(ch));
    if (checkSymbol(values) !== s[RANDOM]) return { error: "check" };
    return { code: s };
}

// The pt-BR line for a parseCode error.
export function codeMessage(result) {
    switch (result?.error) {
        case "empty": return "Digite o código da igreja.";
        case "char": return `O código não tem "${result.char}": só letras e números.`;
        case "short": return `Faltam letras: o código tem ${CODE_LENGTH}.`;
        case "long": return `Sobram letras: o código tem ${CODE_LENGTH}.`;
        case "check": return "Alguma letra está errada. Confira o código.";
        default: return "";
    }
}
