// Which codec a video file was made with, read from its own bytes (Rodada O,
// item 11: loop videos that stayed still on every screen). An MP4/MOV is a
// tree of boxes; the video track's sample description
// (moov/trak/mdia/minf/stbl/stsd) names the codec — avc1 is H.264, hvc1/hev1
// H.265 (HEVC), av01 AV1, vp09 VP9 — and its configuration box says how many
// bits a sample has. Chromium plays H.264 at 8 bits, VP9 and AV1; HEVC only
// where the graphics card decodes it, and H.264 at 10 bits never
// (mayNotPlay). Pure: the bytes come through `read(offset, length)`, so the
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

// The bit depth a codec's configuration box gives (null when it does not say).
function bitDepthOf(b, codec, entry) {
    // VisualSampleEntry: 8 header + 78 bytes of fields, then its boxes.
    const kids = boxes(b, entry.body + 78, entry.end);
    const box = (type) => kids.find((x) => x.type === type);
    if (codec === "hvc1" || codec === "hev1") {
        const c = box("hvcC");
        // bitDepthLumaMinus8 is the low 3 bits of the configuration's byte 17.
        return c && c.end - c.body > 17 ? (b[c.body + 17] & 7) + 8 : null;
    }
    if (codec === "av01") {
        const c = box("av1C");
        if (!c || c.end - c.body < 3) return null;
        const flags = b[c.body + 2];
        return flags & 0x40 ? (flags & 0x20 ? 12 : 10) : 8;
    }
    if (codec === "vp09") {
        const c = box("vpcC"); // a full box: 4 bytes of version and flags first
        return c && c.end - c.body > 6 ? b[c.body + 6] >> 4 : null;
    }
    if (codec === "avc1") {
        const c = box("avcC");
        if (!c || c.end - c.body < 7) return null;
        const profile = b[c.body + 1];
        // Baseline, Main, Extended: always 8 bits; High 10 and up say it
        // after the parameter sets.
        if (![100, 110, 122, 244].includes(profile)) return 8;
        let at = c.body + 5;
        let n = b[at++] & 31;
        for (let i = 0; i < n && at + 2 <= c.end; i++) at += 2 + u16(b, at);
        if (at >= c.end) return profile === 100 ? 8 : null;
        n = b[at++];
        for (let i = 0; i < n && at + 2 <= c.end; i++) at += 2 + u16(b, at);
        // chroma_format, then bit_depth_luma_minus8 (its low 3 bits).
        return at + 1 < c.end ? (b[at + 1] & 7) + 8 : profile === 100 ? 8 : null;
    }
    return null;
}

// The video track's codec in a moov box's bytes (the box, header included,
// or `moov` saying where its body is): { codec, bitDepth, width, height } or null.
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
            bitDepth: codec === "other" ? null : bitDepthOf(b, codec, entry),
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
        return { codec: "webm", bitDepth: null, width: null, height: null };
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

// A codec Chromium may not decode, so the video may stay still: HEVC (only
// where the graphics card decodes it), H.264 above 8 bits, and anything it
// does not know (ProRes, MPEG-4 Part 2…). Unknown (null) is not a warning.
export function mayNotPlay(codec, bitDepth = null) {
    if (!codec || codec === "webm") return false;
    if (codec === "hvc1" || codec === "hev1" || codec === "other") return true;
    if (codec === "avc1") return Number(bitDepth) > 8;
    return Number(bitDepth) > 10;
}

// A video row of the library whose codec is not known yet: a file on this
// computer (not a link, not missing).
export function needsCodec(row) {
    if (!row || row.type !== "video" || row.missing || row.video_codec) return false;
    const url = String(row.file_url || "");
    return url.startsWith("http") && !/youtu\.?be/.test(url);
}
