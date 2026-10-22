// Which codec a video file was made with, read from its own bytes (Rodada O,
// item 11: loop videos that stayed still on every screen). An MP4/MOV is a
// tree of boxes; the video track's sample description
// (moov/trak/mdia/minf/stbl/stsd) names the codec — avc1 is H.264, hvc1/hev1
// H.265 (HEVC), av01 AV1, vp09 VP9 — and its configuration box says how many
// bits a sample has and how its colour is sampled. Chromium plays H.264 at 8
// bits 4:2:0, VP9 and AV1; HEVC only where the graphics card decodes it, and
// H.264 at 10 bits or 4:2:2/4:4:4 never — KERYX refuses those
// (codecProblem; the owner's O11 = B: refuse, KERYX ships no converter).
// Pure: the bytes come through `read(offset, length)`, so the
// same walk serves a picked File (fileReader), a file of the media folder
// over HTTP Range (rangeReader) and the tests' hand-built boxes.

export const VIDEO_CODECS = ["avc1", "hvc1", "hev1", "av01", "vp09", "webm", "other"];

// Sample entries of the same codec under another name.
const ALIAS = { avc3: "avc1", dvh1: "hvc1", dvhe: "hev1" };
// A box bigger than this is not a moov we read whole (a broken file).
const MAX_MOOV = 32 * 1024 * 1024;
const MAX_BOXES = 4096;

const fourcc = (b, at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b, at) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u16 = (b, at) => (b[at] << 8) + b[at + 1];
const u64 = (b, at) => u32(b, at) * 2 ** 32 + u32(b, at + 4);

// The boxes directly inside bytes[start, end): [{ type, start, body, end }].
function boxes(b, start = 0, end = b.length) {
    const out = [];
    let at = start;
    while (at + 8 <= end && out.length < MAX_BOXES) {
        let size = u32(b, at);
        const type = fourcc(b, at + 4);
        let head = 8;
        if (size === 1) {
            if (at + 16 > end) break;
            size = u64(b, at + 8);
            head = 16;
        } else if (size === 0) size = end - at;
        if (size < head || at + size > end) break;
        out.push({ type, start: at, body: at + head, end: at + size });
        at += size;
    }
    return out;
}
const child = (b, box, type) => box && boxes(b, box.body, box.end).find((x) => x.type === type);

// chroma_format_idc of H.264 and HEVC, as the usual names.
const CHROMA = ["400", "420", "422", "444"];

// What a codec's configuration box says of its samples: { bitDepth, chroma }
// ("420", "422", "444", "400" for black and white), null where it does not say.
function sampleFormat(b, codec, entry) {
    const none = { bitDepth: null, chroma: null };
    // VisualSampleEntry: 8 header + 78 bytes of fields, then its boxes.
    const kids = boxes(b, entry.body + 78, entry.end);
    const box = (type) => kids.find((x) => x.type === type);
    if (codec === "hvc1" || codec === "hev1") {
        const c = box("hvcC");
        // chromaFormat and bitDepthLumaMinus8: the low bits of bytes 16 and 17.
        return c && c.end - c.body > 17 ? { bitDepth: (b[c.body + 17] & 7) + 8, chroma: CHROMA[b[c.body + 16] & 3] } : none;
    }
    if (codec === "av01") {
        const c = box("av1C");
        if (!c || c.end - c.body < 3) return none;
        // high_bitdepth, twelve_bit, monochrome, subsampling_x, subsampling_y.
        const f = b[c.body + 2];
        return { bitDepth: f & 0x40 ? (f & 0x20 ? 12 : 10) : 8, chroma: f & 0x10 ? "400" : !(f & 0x08) ? "444" : f & 0x04 ? "420" : "422" };
    }
    if (codec === "vp09") {
        const c = box("vpcC"); // a full box: 4 bytes of version and flags first
        if (!c || c.end - c.body <= 6) return none;
        const sub = (b[c.body + 6] >> 1) & 7;
        return { bitDepth: b[c.body + 6] >> 4, chroma: sub <= 1 ? "420" : sub === 2 ? "422" : "444" };
    }
    if (codec === "avc1") {
        const c = box("avcC");
        if (!c || c.end - c.body < 7) return none;
        const profile = b[c.body + 1];
        // Baseline, Main, Extended: always 8 bits, 4:2:0. The High profiles
        // say it after the parameter sets; many encoders leave that out, and
        // then the profile itself tells: High is 8 bits 4:2:0, High 10 is
        // 10 bits, High 4:2:2 is 4:2:2 and High 4:4:4 is 4:4:4 (their depth
        // unsaid).
        const plain = { 100: { bitDepth: 8, chroma: "420" }, 110: { bitDepth: 10, chroma: "420" }, 122: { bitDepth: null, chroma: "422" }, 244: { bitDepth: null, chroma: "444" } }[profile];
        if (!plain) return { bitDepth: 8, chroma: "420" };
        let at = c.body + 5;
        let n = b[at++] & 31;
        for (let i = 0; i < n && at + 2 <= c.end; i++) at += 2 + u16(b, at);
        if (at >= c.end) return plain;
        n = b[at++];
        for (let i = 0; i < n && at + 2 <= c.end; i++) at += 2 + u16(b, at);
        // chroma_format, then bit_depth_luma_minus8 (their low bits).
        return at + 1 < c.end ? { bitDepth: (b[at + 1] & 7) + 8, chroma: CHROMA[b[at] & 3] } : plain;
    }
    return none;
}

// The video track's codec in a moov box's bytes (the box, header included,
// or `moov` saying where its body is): { codec, bitDepth, chroma, width, height } or null.
export function codecInMoov(b, moov = null) {
    if (!moov) moov = b.length >= 8 && fourcc(b, 4) === "moov" ? { body: 8, end: b.length } : { body: 0, end: b.length };
    for (const trak of boxes(b, moov.body, moov.end).filter((x) => x.type === "trak")) {
        const mdia = child(b, trak, "mdia");
        const hdlr = child(b, mdia, "hdlr");
        // hdlr: a full box (4), pre_defined (4), then the handler type.
        if (!hdlr || hdlr.end - hdlr.body < 12 || fourcc(b, hdlr.body + 8) !== "vide") continue;
        const stsd = child(b, child(b, child(b, mdia, "minf"), "stbl"), "stsd");
        if (!stsd) continue;
        // stsd: a full box (4) and the entry count (4), then the entries.
        const entry = boxes(b, stsd.body + 8, stsd.end)[0];
        if (!entry) continue;
        const type = ALIAS[entry.type] || entry.type;
        const codec = VIDEO_CODECS.includes(type) && type !== "webm" ? type : "other";
        const sized = entry.end - entry.body >= 28;
        return {
            codec,
            ...(codec === "other" ? { bitDepth: null, chroma: null } : sampleFormat(b, codec, entry)),
            width: sized ? u16(b, entry.body + 24) : null,
            height: sized ? u16(b, entry.body + 26) : null,
            ...(codec === "other" ? { format: entry.type } : {}),
        };
    }
    return null;
}

// Reads a video's codec through read(offset, length) -> Uint8Array (fewer
// bytes at the end of the file). Walks the top-level boxes by their headers
// only — the moov may come after gigabytes of media data — and reads the
// moov whole. -> { codec, bitDepth, width, height } or null when the file is
// not an MP4/MOV (or a WebM, said as "webm") or has no video track.
export async function readVideoCodec(read, size = Infinity) {
    const first = await read(0, 16);
    if (first.length >= 4 && first[0] === 0x1a && first[1] === 0x45 && first[2] === 0xdf && first[3] === 0xa3) {
        return { codec: "webm", bitDepth: null, chroma: null, width: null, height: null };
    }
    let at = 0;
    for (let n = 0; n < MAX_BOXES && at < size; n++) {
        const head = n === 0 ? first : await read(at, 16);
        if (head.length < 8) return null;
        let len = u32(head, 0);
        const type = fourcc(head, 4);
        // The first box of an MP4 is ftyp (a QuickTime file may start with
        // wide, free, skip or mdat); anything else is not one.
        if (n === 0 && !/^(ftyp|moov|mdat|wide|free|skip|pnot)$/.test(type)) return null;
        let headLen = 8;
        if (len === 1) {
            if (head.length < 16) return null;
            len = u64(head, 8);
            headLen = 16;
        } else if (len === 0) {
            if (!Number.isFinite(size)) return null;
            len = size - at;
        }
        if (len < headLen) return null;
        if (type === "moov") {
            if (len > MAX_MOOV) return null;
            const moov = await read(at, len);
            return codecInMoov(moov, { body: headLen, end: moov.length });
        }
        at += len;
    }
    return null;
}

// A picked File (the browser's slice): the reader for import.
export const fileReader = (file) => async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());

// A file served over HTTP (the media folder answers Range): the reader for
// rows already in the library. A server that ignores Range sends the whole
// file; only the bytes asked for are kept.
export const rangeReader = (url, fetchImpl = fetch) => async (offset, length) => {
    const res = await fetchImpl(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return res.status === 206 ? bytes.subarray(0, length) : bytes.subarray(offset, offset + length);
};

// A video KERYX refuses on import and marks in the lists (Rodada O, O11 = B):
// HEVC (it may freeze on the screens: only some graphics cards decode it),
// H.264 above 8 bits, and H.264 whose colour is not 4:2:0. -> "hevc" |
// "10bit" | "chroma" | null. A file read as something else (VP9, AV1, a
// WebM, a codec the reader does not name) or not read at all passes.
export function codecProblem({ codec, bitDepth, chroma } = {}) {
    if (codec === "hvc1" || codec === "hev1") return "hevc";
    if (codec === "avc1" && Number(bitDepth) > 8) return "10bit";
    if (codec === "avc1" && chroma && chroma !== "420" && chroma !== "400") return "chroma";
    return null;
}

// A Media row's codec fields as codecProblem takes them.
export const codecOfRow = (row) => ({ codec: row?.video_codec || null, bitDepth: row?.video_bit_depth ?? null, chroma: row?.video_chroma || null });

// The fields a read codec leaves on a Media row.
export function codecFields(found) {
    if (!found) return {};
    return { video_codec: found.codec, ...(found.bitDepth ? { video_bit_depth: found.bitDepth } : {}), ...(found.chroma ? { video_chroma: found.chroma } : {}) };
}

const chromaName = (c) => `${c[0]}:${c[1]}:${c[2]}`;
// Each problem: its short name (the mark, a list of refusals) and what the
// file is (the sentences).
const PROBLEM = {
    hevc: () => ({ short: "HEVC", what: "HEVC (H.265)" }),
    "10bit": (f) => ({ short: `${f.bitDepth} bits`, what: `H.264 de ${f.bitDepth} bits` }),
    chroma: (f) => ({ short: chromaName(f.chroma), what: `H.264 ${chromaName(f.chroma)}` }),
};
const words = (found) => { const p = codecProblem(found || {}); return p ? PROBLEM[p](found) : null; };
const HANDBRAKE = "Converta para MP4 H.264 no HandBrake, predefinição \"Fast 1080p30\".";

// The words for a video with a problem ("" for none), all of them here: the
// mark in the lists ("HEVC · pode não tocar") and its tooltip, which has the
// room to say it all; the refusal of one file (a toast, an editor's upload),
// short enough for one line of the toast at 960 px with a usual name; and
// one sentence for several refused at once (refusalSummary).
export function codecMark(found) {
    const w = words(found);
    return w ? `${w.short} · pode não tocar` : "";
}
export function codecHint(found) {
    const w = words(found);
    return w ? `Este vídeo está em ${w.what} e pode congelar nas telas. Converta para MP4 H.264 no HandBrake (gratuito), predefinição "Fast 1080p30", e envie de novo.` : "";
}
// What the file is, for a line that already names it ("HEVC (H.265)"; "" for none).
export const codecWhat = (found) => words(found)?.what || "";
export function codecRefusal(name, found) {
    const w = words(found);
    return w ? `${name} recusado: ${w.what} pode congelar nas telas. ${HANDBRAKE}` : "";
}
// [{ name, codec }] -> "" | one file's refusal | "2 vídeos recusados (HEVC, 10 bits): a.mp4, b.mp4. Converta…"
export function refusalSummary(list = []) {
    const bad = (list || []).filter((x) => words(x?.codec));
    if (bad.length < 2) return bad.length ? codecRefusal(bad[0].name, bad[0].codec) : "";
    const kinds = [...new Set(bad.map((x) => words(x.codec).short))].join(", ");
    return `${bad.length} vídeos recusados (${kinds}): ${bad.map((x) => x.name).join(", ")}. ${HANDBRAKE}`;
}

// A video row of the library whose codec is not known yet: a file on this
// computer (not a link, not missing).
export function needsCodec(row) {
    if (!row || row.type !== "video" || row.missing || row.video_codec) return false;
    const url = String(row.file_url || "");
    return url.startsWith("http") && !/youtu\.?be/.test(url);
}
