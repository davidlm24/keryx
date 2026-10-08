// A Bible slide's text carries its verse numbers inline ("16 Porque Deus…
// 17 Porque…"). Which numbers are verse marks: the one the text starts with,
// then each next one in sequence — so "Adão viveu ao todo 930 anos" keeps its
// 930 as text. Plain JS, no imports, so node --test can check it.

// -> [{ n, text }]: n is the verse number, or null for text before any mark.
export function verseSegments(text) {
    const s = String(text ?? "");
    const re = /(^|\s)(\d{1,3})\s+(?=\S)/g;
    const marks = [];
    let last = null;
    for (let m = re.exec(s); m; m = re.exec(s)) {
        const n = Number(m[2]);
        if (last === null ? m.index === 0 : n === last + 1) {
            marks.push({ at: m.index, end: m.index + m[0].length, n });
            last = n;
        }
    }
    if (!marks.length) return [{ n: null, text: s }];
    const out = marks[0].at > 0 ? [{ n: null, text: s.slice(0, marks[0].at) }] : [];
    marks.forEach((mk, i) => out.push({ n: mk.n, text: s.slice(mk.end, i + 1 < marks.length ? marks[i + 1].at : s.length) }));
    return out;
}

export const verseNumbers = (text) => verseSegments(text).filter((x) => x.n !== null).map((x) => x.n);
