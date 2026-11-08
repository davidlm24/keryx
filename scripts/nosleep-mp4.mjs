// public/nosleep.mp4, the controle remoto's "Manter a tela ligada" (Rodada G6):
// the page loops it, muted and hidden, so the phone does not sleep (Wake
// Lock needs HTTPS; the remote is http://192.168…). Run once:
//   node scripts/nosleep-mp4.mjs public/nosleep.mp4
// One I_PCM macroblock per frame (raw black samples: no encoder needed),
// H.264 Baseline 16x16, 4 IDR frames over 2 s, about 2 kB.
import fs from "node:fs";

class Bits {
    constructor() { this.bytes = []; this.cur = 0; this.n = 0; }
    u(v, len) { for (let i = len - 1; i >= 0; i--) this.bit((v >> i) & 1); }
    bit(b) { this.cur = (this.cur << 1) | b; this.n++; if (this.n === 8) { this.bytes.push(this.cur); this.cur = 0; this.n = 0; } }
    ue(v) { const x = v + 1; const len = Math.floor(Math.log2(x)); this.u(0, len); this.u(x, len + 1); }
    se(v) { this.ue(v <= 0 ? -2 * v : 2 * v - 1); }
    align0() { while (this.n) this.bit(0); }
    trailing() { this.bit(1); this.align0(); }
    raw(arr) { if (this.n) throw new Error("not aligned"); this.bytes.push(...arr); }
}
const ep = (rbsp) => { // emulation prevention
    const out = []; let zeros = 0;
    for (const b of rbsp) { if (zeros >= 2 && b <= 3) { out.push(3); zeros = 0; } out.push(b); zeros = b === 0 ? zeros + 1 : 0; }
    return out;
};
const nal = (header, bits) => [header, ...ep(bits.bytes)];

const sps = (() => { const b = new Bits(); b.u(66, 8); b.u(0xc0, 8); b.u(10, 8); b.ue(0); b.ue(0); b.ue(2); b.ue(1); b.u(0, 1); b.ue(0); b.ue(0); b.u(1, 1); b.u(1, 1); b.u(0, 1); b.u(0, 1); b.trailing(); return nal(0x67, b); })();
const pps = (() => { const b = new Bits(); b.ue(0); b.ue(0); b.u(0, 1); b.u(0, 1); b.ue(0); b.ue(0); b.ue(0); b.u(0, 1); b.u(0, 2); b.se(0); b.se(0); b.se(0); b.u(1, 1); b.u(0, 1); b.u(0, 1); b.trailing(); return nal(0x68, b); })();
const idr = (id) => {
    const b = new Bits();
    b.ue(0); b.ue(7); b.ue(0); b.u(0, 4); b.ue(id); // first_mb, slice_type I, pps, frame_num, idr_pic_id
    b.u(0, 1); b.u(0, 1); // dec_ref_pic_marking
    b.se(0); b.ue(1); // slice_qp_delta, disable_deblocking_filter_idc
    b.ue(25); b.align0(); // mb_type I_PCM, pcm_alignment_zero_bits
    b.raw(new Array(256).fill(16)); b.raw(new Array(128).fill(128));
    b.trailing();
    return nal(0x65, b);
};

const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const u16 = (v) => [(v >> 8) & 255, v & 255];
const str = (s) => [...s].map((c) => c.charCodeAt(0));
const box = (type, ...parts) => { const body = parts.flat(); return [...u32(body.length + 8), ...str(type), ...body]; };
const full = (type, version, flags, ...parts) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].flatMap(u32);

const N = 4, DELTA = 500, D = N * DELTA, W = 16, H = 16;
const samples = Array.from({ length: N }, (_, i) => { const n = idr(i % 2); return [...u32(n.length), ...n]; });
const avcC = box("avcC", [1, 66, 0xc0, 10, 0xff, 0xe1, ...u16(sps.length), ...sps, 1, ...u16(pps.length), ...pps]);
const avc1 = box("avc1", new Array(6).fill(0), u16(1), u16(0), u16(0), new Array(12).fill(0), u16(W), u16(H), u32(0x00480000), u32(0x00480000), u32(0), u16(1), new Array(32).fill(0), u16(0x18), u16(0xffff), avcC);
const ftyp = box("ftyp", str("isom"), u32(512), str("isom"), str("iso2"), str("avc1"), str("mp41"));
const moovWith = (offset) => box("moov",
    full("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(D), u32(0x00010000), u16(0x0100), new Array(10).fill(0), MATRIX, new Array(24).fill(0), u32(2)),
    box("trak",
        full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(D), new Array(8).fill(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(W << 16), u32(H << 16)),
        box("mdia",
            full("mdhd", 0, 0, u32(0), u32(0), u32(1000), u32(D), u16(0x55c4), u16(0)),
            full("hdlr", 0, 0, u32(0), str("vide"), new Array(12).fill(0), str("VideoHandler"), [0]),
            box("minf",
                full("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0)),
                box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
                box("stbl",
                    full("stsd", 0, 0, u32(1), avc1),
                    full("stts", 0, 0, u32(1), u32(N), u32(DELTA)),
                    full("stsc", 0, 0, u32(1), u32(1), u32(N), u32(1)),
                    full("stsz", 0, 0, u32(0), u32(N), samples.map((s) => u32(s.length)).flat()),
                    full("stco", 0, 0, u32(1), u32(offset)),
                )))));
const moov0 = moovWith(0);
const offset = ftyp.length + moov0.length + 8;
const moov = moovWith(offset);
const mdat = box("mdat", samples.flat());
const file = Buffer.from([...ftyp, ...moov, ...mdat]);
fs.writeFileSync(process.argv[2], file);
console.log("bytes", file.length);
