// OpenLyrics (openlyrics.org; what OpenLP exports, one song per .xml): the
// verses v1/c1/b1… become labelled parts of the lyrics ([Estrofe 1],
// [Refrão], [Ponte]), in the order <verseOrder> plays them (a part sung
// twice is written twice), and <chord> marks become inline chords ([D]), so
// the lyrics carry the Palco's chorded twin. Pure: the text in, songs out;
// songImport.js turns them into Song rows. Spec samples in fixtures/.
import { parseXml, elements, child, textOf } from "./xml.js";
import { isChordToken } from "../chords.js";

// Is this text an OpenLyrics song?
export const isOpenLyrics = (text) => /<(?:\w+:)?song\b[^>]*openlyrics\.info/i.test(text) || (/<(?:\w+:)?song\b/.test(text) && /<(?:\w+:)?lyrics\b/.test(text) && /<(?:\w+:)?verse\b/.test(text));

const KINDS = { v: "Estrofe", c: "Refrão", b: "Ponte", p: "Pré-refrão", i: "Introdução", e: "Final", o: "Outro" };

// A chord written as OpenLyrics' "structure" (a shortcode or an interval
// formula, docs/source/chordlist.rst) in the cifra the church reads.
const STRUCTURES = {
    "": "", major: "", "3-5": "", min: "m", "m3-5": "m", power: "5", 5: "5",
    aug: "+", "3-a5": "+", dim: "º", "m3-d5": "º", dom7: "7", "3-5-m7": "7",
    maj7: "7M", "3-5-7": "7M", min7: "m7", "m3-5-m7": "m7", dim7: "º7", "m3-d5-d7": "º7",
    halfdim7: "m7(b5)", "m3-d5-m7": "m7(b5)", maj6: "6", "3-5-6": "6", min6: "m6", "m3-5-6": "m6",
    dom9: "9", "3-5-m7-9": "9", min9: "m9", "m3-5-m7-9": "m9", sus4: "sus4", "4-5": "sus4",
    sus2: "sus2", "2-5": "sus2", add9: "add9", "3-5-9": "add9", "m3-5-9": "m(add9)",
};

// German/Hungarian notation names B flat "B" and B "H".
const note = (n, german) => {
    const s = String(n || "").trim().replace(/♯/g, "#").replace(/♭/g, "b");
    if (/^H/i.test(s)) return `B${s.slice(1)}`;
    if (german && /^B(?![b#])/.test(s)) return `Bb${s.slice(1)}`;
    return s;
};

// <chord name="Am7"/> (0.8) or <chord root="A" structure="min7" bass="G"/>
// (0.9) -> "Am7" | "" when it is not a chord the cifra can show (a token the
// projector would not strip must never reach the lyrics).
export function chordName(attrs, german = false) {
    let name;
    if (attrs.name) name = note(attrs.name, german);
    else if (attrs.root) {
        const structure = STRUCTURES[attrs.structure ?? ""] ?? "";
        name = `${note(attrs.root, german)}${structure}${attrs.bass ? `/${note(attrs.bass, german)}` : ""}`;
    } else return "";
    return isChordToken(name) ? name : "";
}

// One <lines> as text lines, chords inline, comments out.
function linesText(node, german) {
    const walk = (n) => n.children.map((c) => {
        if (typeof c === "string") return c.replace(/\s+/g, " ");
        if (c.name === "br") return "\n";
        if (c.name === "comment") return "";
        if (c.name === "line") return `${walk(c)}\n`; // 0.8
        if (c.name === "chord") { const name = chordName(c.attrs, german); return `${name ? `[${name}]` : ""}${walk(c)}`; }
        return walk(c);
    }).join("");
    return walk(node).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// "v1" -> { kind: "v", num: "1", sub: "" }; null for a name outside the spec.
const verseName = (name) => {
    const m = /^([a-z])(\d*)([a-z]?)$/i.exec(String(name || "").trim());
    return m && KINDS[m[1].toLowerCase()] ? { kind: m[1].toLowerCase(), num: m[2], sub: m[3] } : null;
};

const primary = (lang) => String(lang || "").toLowerCase().split("-")[0];

// -> [{ title, artist, lyrics, song_key?, ccli_number?, copyright?, bpm? }]
export function parseOpenLyrics(text) {
    const song = parseXml(text);
    if (song.name !== "song") throw new Error("XML que não é do OpenLyrics.");
    const props = child(song, "properties");
    const german = /german|hungarian|dutch/i.test(song.attrs.chordNotation || "");
    const verses = elements(child(song, "lyrics"), "verse");
    const lang = primary(song.attrs.lang || verses.find((v) => v.attrs.lang)?.attrs.lang);

    // One verse per name: the song's language when a name comes in several.
    const byName = new Map();
    for (const v of verses) {
        const name = String(v.attrs.name || "").trim();
        if (!name) continue;
        const had = byName.get(name);
        if (!had || (primary(had.attrs.lang) !== lang && primary(v.attrs.lang) === lang)) byName.set(name, v);
    }
    const names = [...byName.keys()];

    // Labels: numbered only when the song has 2+ parts of that kind.
    const count = {};
    for (const n of names) { const p = verseName(n); if (p) count[p.kind] = (count[p.kind] || 0) + 1; }
    const label = (n) => {
        const p = verseName(n);
        if (!p) return n;
        return count[p.kind] > 1 && (p.num || p.sub) ? `${KINDS[p.kind]} ${p.num}${p.sub}` : KINDS[p.kind];
    };

    // <verseOrder>: "c" finds "c1" and "c1" finds "c"; names it lacks are skipped.
    const find = (token) => (byName.has(token) ? token
        : byName.has(`${token}1`) ? `${token}1`
            : /1$/.test(token) && byName.has(token.slice(0, -1)) ? token.slice(0, -1) : null);
    const order = textOf(child(props, "verseOrder")).split(/\s+/).filter(Boolean).map(find).filter(Boolean);

    const blocks = [];
    for (const name of order.length ? order : names) {
        const stanzas = elements(byName.get(name), "lines").map((l) => linesText(l, german)).filter((l) => l.length);
        if (!stanzas.length) continue;
        blocks.push([`[${label(name)}]`, ...stanzas[0]].join("\n"), ...stanzas.slice(1).map((s) => s.join("\n")));
    }

    const titles = elements(child(props, "titles"), "title");
    const titleNode = titles.find((t) => t.attrs.original === "true") || titles.find((t) => primary(t.attrs.lang) === lang) || titles[0];
    const authors = elements(child(props, "authors"), "author").filter((a) => a.attrs.type !== "translation").map((a) => textOf(a).trim()).filter(Boolean);
    const tempo = child(props, "tempo");
    const bpm = tempo && (tempo.attrs.type || "bpm") === "bpm" ? Number(textOf(tempo).trim()) : NaN;
    const field = (name) => textOf(child(props, name)).replace(/\s+/g, " ").trim();

    const out = {
        title: textOf(titleNode).replace(/\s+/g, " ").trim(),
        artist: [...new Set(authors)].join(", "),
        lyrics: blocks.join("\n\n"),
    };
    if (field("key")) out.song_key = field("key");
    if (field("ccliNo")) out.ccli_number = field("ccliNo");
    if (field("copyright")) out.copyright = field("copyright");
    if (Number.isFinite(bpm) && bpm > 0) out.bpm = bpm;
    return out.lyrics ? [out] : [];
}
