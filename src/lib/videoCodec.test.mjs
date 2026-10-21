import test from "node:test";
import assert from "node:assert/strict";
import { codecInMoov, readVideoCodec, rangeReader, mayNotPlay, needsCodec } from "./videoCodec.js";

// Tiny hand-built MP4 boxes: just enough of the tree for the walk.
const bytes = (...parts) => Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : Array.isArray(p) ? p : [p])));
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n) => [(n >> 8) & 255, n & 255];
const box = (type, ...body) => {
    const inner = bytes(...body);
    return bytes(be32(8 + inner.length), type, [...inner]);
};
const join = (...arrs) => Uint8Array.from(arrs.flatMap((a) => [...a]));
const zeros = (n) => new Array(n).fill(0);

// A VisualSampleEntry: 78 bytes of fields (width and height at 24/26), then its boxes.
const sampleEntry = (format, config, w = 1920, h = 1080) => box(format, zeros(24), be16(w), be16(h), zeros(50), [...(config || [])]);
const hvcC = (bits) => box("hvcC", 1, 2, zeros(4), zeros(6), 120, 0xf0, 0, 0xfc, 0xfd, 0xf8 | (bits - 8), zeros(5));
const av1C = (flags) => box("av1C", 0x81, 0x08, flags, 0);
const vpcC = (bits) => box("vpcC", zeros(4), 0, 31, bits << 4, 0, 0, 0, 0, 0);
// avcC: version, profile, compat, level, length size, 1 SPS (2 bytes), 1 PPS (1 byte), then the High profiles' extension.
const avcC = (profile, ext = []) => box("avcC", 1, profile, 0, 40, 0xff, 0xe1, be16(2), 0x67, 0x64, 1, be16(1), 0x68, ext);

const track = (handler, entry) => box("trak",
    [...box("tkhd", zeros(84))],
    [...box("mdia",
        [...box("hdlr", zeros(8), handler, zeros(12))],
        [...box("minf", [...box("stbl", [...box("stsd", zeros(4), be32(1), [...entry])])])],
    )],
);
const moov = (...traks) => box("moov", [...box("mvhd", zeros(100))], ...traks.map((t) => [...t]));
const mp4 = (...traks) => join(box("ftyp", "isom", zeros(4), "isomavc1"), box("mdat", zeros(64)), moov(...traks));

const memReader = (file, calls = []) => async (offset, length) => { calls.push([offset, length]); return file.subarray(offset, offset + length); };

test("codecInMoov: the video track's sample entry names the codec", () => {
    const sound = track("soun", box("mp4a", zeros(28)));
    assert.deepEqual(codecInMoov(moov(sound, track("vide", sampleEntry("hvc1", hvcC(10))))), { codec: "hvc1", bitDepth: 10, width: 1920, height: 1080 }, "the audio track is skipped");
    assert.equal(codecInMoov(moov(track("vide", sampleEntry("hev1", hvcC(8))))).bitDepth, 8);
    assert.deepEqual(codecInMoov(moov(track("vide", sampleEntry("avc1", avcC(66), 1280, 720)))), { codec: "avc1", bitDepth: 8, width: 1280, height: 720 }, "Baseline is 8 bits");
    assert.equal(codecInMoov(moov(track("vide", sampleEntry("avc3", avcC(100))))).codec, "avc1", "avc3 is H.264 too");
    assert.equal(codecInMoov(moov(track("vide", sampleEntry("avc1", avcC(100))))).bitDepth, 8, "High without the extension");
    assert.equal(codecInMoov(moov(track("vide", sampleEntry("avc1", avcC(110, [0xfd, 0xfa, 0xfa, 0]))))).bitDepth, 10, "High 10");
    assert.equal(codecInMoov(moov(track("vide", sampleEntry("av01", av1C(0x00))))).bitDepth, 8);
    assert.equal(codecInMoov(moov(track("vide", sampleEntry("av01", av1C(0x40))))).bitDepth, 10);
    assert.equal(codecInMoov(moov(track("vide", sampleEntry("av01", av1C(0x60))))).bitDepth, 12);
    assert.equal(codecInMoov(moov(track("vide", sampleEntry("vp09", vpcC(10))))).bitDepth, 10);
    assert.deepEqual(codecInMoov(moov(track("vide", sampleEntry("apcn")))), { codec: "other", bitDepth: null, width: 1920, height: 1080, format: "apcn" }, "ProRes");
    assert.equal(codecInMoov(moov(sound)), null, "no video track");
    assert.equal(codecInMoov(bytes(0, 0, 0, 3, "moov")), null, "a broken box");
});

test("readVideoCodec: walks the top boxes by their headers and reads only the moov", async () => {
    const file = mp4(track("vide", sampleEntry("hvc1", hvcC(10))));
    const calls = [];
    assert.deepEqual(await readVideoCodec(memReader(file, calls), file.length), { codec: "hvc1", bitDepth: 10, width: 1920, height: 1080 });
    assert.ok(calls.every(([, len], i) => i === calls.length - 1 || len === 16), "headers only, then the moov");
    // The moov first (a "fast start" file), and a 64-bit mdat size.
    const big = join(box("ftyp", "isom", zeros(4)), moov(track("vide", sampleEntry("avc1", avcC(77))))
        , bytes(be32(1), "mdat", be32(0), be32(24), zeros(8)));
    assert.equal((await readVideoCodec(memReader(big), big.length)).codec, "avc1");
    const wide = join(bytes(be32(1), "mdat", be32(0), be32(16)), moov(track("vide", sampleEntry("av01", av1C(0)))));
    assert.equal((await readVideoCodec(memReader(wide), wide.length)).codec, "av01", "a 64-bit box size is skipped by its length");
});

test("readVideoCodec: WebM and files that are not a video", async () => {
    const webm = bytes(0x1a, 0x45, 0xdf, 0xa3, zeros(20));
    assert.equal((await readVideoCodec(memReader(webm), webm.length)).codec, "webm");
    const png = bytes(0x89, "PNG", zeros(20));
    assert.equal(await readVideoCodec(memReader(png), png.length), null);
    assert.equal(await readVideoCodec(memReader(bytes(1, 2)), 2), null, "too short");
    const noMoov = join(box("ftyp", "isom"), box("mdat", zeros(8)));
    assert.equal(await readVideoCodec(memReader(noMoov), noMoov.length), null, "no moov");
});

test("rangeReader: asks for the bytes, keeps them whether the server honours Range or not", async () => {
    const file = Uint8Array.from({ length: 50 }, (_, i) => i);
    const asked = [];
    const partial = async (url, { headers }) => {
        asked.push(headers.Range);
        const [, a, b] = /bytes=(\d+)-(\d+)/.exec(headers.Range);
        return { ok: true, status: 206, arrayBuffer: async () => file.slice(Number(a), Number(b) + 1).buffer };
    };
    assert.deepEqual([...await rangeReader("u", partial)(10, 4)], [10, 11, 12, 13]);
    assert.deepEqual(asked, ["bytes=10-13"]);
    const whole = async () => ({ ok: true, status: 200, arrayBuffer: async () => file.slice().buffer });
    assert.deepEqual([...await rangeReader("u", whole)(10, 4)], [10, 11, 12, 13]);
    await assert.rejects(rangeReader("u", async () => ({ ok: false, status: 404 }))(0, 4), /404/);
});

test("mayNotPlay: HEVC, H.264 above 8 bits and the unknown ones", () => {
    assert.equal(mayNotPlay("hvc1", 8), true);
    assert.equal(mayNotPlay("hev1"), true);
    assert.equal(mayNotPlay("other"), true);
    assert.equal(mayNotPlay("avc1", 8), false);
    assert.equal(mayNotPlay("avc1", null), false);
    assert.equal(mayNotPlay("avc1", 10), true);
    assert.equal(mayNotPlay("vp09", 10), false);
    assert.equal(mayNotPlay("av01", 12), true);
    assert.equal(mayNotPlay("webm"), false);
    assert.equal(mayNotPlay(null), false, "not read yet");
    assert.equal(mayNotPlay(""), false);
});

test("needsCodec: a video file on this computer whose codec is not known", () => {
    const file = { type: "video", file_url: "http://127.0.0.1:7700/media/v.mp4" };
    assert.equal(needsCodec(file), true);
    assert.equal(needsCodec({ ...file, video_codec: "avc1" }), false);
    assert.equal(needsCodec({ ...file, missing: true }), false);
    assert.equal(needsCodec({ ...file, file_url: "https://youtu.be/abc" }), false);
    assert.equal(needsCodec({ ...file, type: "image" }), false);
    assert.equal(needsCodec(null), false);
});
