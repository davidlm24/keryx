// One-off: builds the app's icon from the church logo — build/icon.ico
// (16, 24, 32, 48, 64, 128 and 256 px: the taskbar, Alt+Tab, the shortcuts
// and the installer) and build/icon.png (512 px, the same picture).
// The logo (resources/branding/church-logo.jpg) is the emblem in one cream
// colour over a photo; a photo shrunk to 16–32 px is mud, so the emblem is
// lifted off it by its colour and laid flat: the cream emblem on a dark disc
// (the console's --bg-0) inside its own ring, transparent outside the ring,
// so it reads on a light taskbar and a dark one alike.
// Run with Electron because it uses nativeImage:  npx electron scripts/make-icon.cjs
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { app, nativeImage } = require("electron");

const EMBLEM = [224, 232, 217]; // the logo's cream, sampled from church-logo.jpg
const DISC = [13, 13, 12]; // --bg-0 (docs/design-system/tokens.css)
const WORK = 1024; // the logo is scaled up to this before the emblem is lifted: smoother edges
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Skia's native order on little-endian Windows/macOS/Linux: B, G, R, A.
const B = 0, G = 1, R = 2, A = 3;

// The emblem's coverage per pixel, by how close the colour is to the cream.
function emblemAlpha(bitmap, n) {
    const alpha = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
        const o = i * 4;
        const dist = Math.hypot(bitmap[o + R] - EMBLEM[0], bitmap[o + G] - EMBLEM[1], bitmap[o + B] - EMBLEM[2]);
        alpha[i] = clamp01(1 - (dist - 14) / 60);
    }
    return alpha;
}

// The ring: the extent of the solid emblem around the middle of the picture.
function findRing(alpha, n) {
    let minX = n, maxX = 0, minY = n, maxY = 0;
    const c = n / 2;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (alpha[y * n + x] < 0.9 || Math.hypot(x - c, y - c) > n * 0.47) continue;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
    }
    const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
    const r = Math.max(maxX - minX + 1, maxY - minY + 1) / 2;
    // The ring's thickness: solid pixels inward from its left edge.
    let t = 0;
    while (t < r && alpha[Math.round(cy) * n + minX + t] >= 0.5) t++;
    return { cx, cy, r, thickness: t };
}

// Bilinear: the coverage between pixel centres.
function sample(alpha, n, x, y) {
    const fx = Math.min(n - 1, Math.max(0, x - 0.5)), fy = Math.min(n - 1, Math.max(0, y - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const top = alpha[y0 * n + x0] * (1 - tx) + alpha[y0 * n + x1] * tx;
    const bottom = alpha[y1 * n + x0] * (1 - tx) + alpha[y1 * n + x1] * tx;
    return top * (1 - ty) + bottom * ty;
}

// The flat icon, premultiplied BGRA, size × size: the crop around the ring
// with a small margin, the disc under the emblem, nothing outside the ring.
function flatIcon(alpha, n, ring, size) {
    const margin = ring.r / 16;
    const half = ring.r + margin;
    const scale = (2 * half) / size;
    const out = Buffer.alloc(size * size * 4);
    const discR = ring.r - ring.thickness / 2;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const sx = ring.cx - half + (x + 0.5) * scale;
            const sy = ring.cy - half + (y + 0.5) * scale;
            const d = Math.hypot(sx - ring.cx, sy - ring.cy);
            const e = sample(alpha, n, sx, sy) * clamp01(ring.r + 1 - d); // nothing past the ring
            const disc = clamp01(discR - d + 0.5);
            const a = e + disc * (1 - e);
            const o = (y * size + x) * 4;
            // Premultiplied: colour × coverage.
            out[o + R] = Math.round(EMBLEM[0] * e + DISC[0] * disc * (1 - e));
            out[o + G] = Math.round(EMBLEM[1] * e + DISC[1] * disc * (1 - e));
            out[o + B] = Math.round(EMBLEM[2] * e + DISC[2] * disc * (1 - e));
            out[o + A] = Math.round(a * 255);
        }
    }
    return out;
}

// RGBA rows of a PNG nativeImage wrote (8-bit RGBA, not interlaced).
function decodePng(png) {
    let pos = 8, width = 0, height = 0;
    const idat = [];
    while (pos < png.length) {
        const len = png.readUInt32BE(pos);
        const type = png.toString("ascii", pos + 4, pos + 8);
        const data = png.subarray(pos + 8, pos + 8 + len);
        if (type === "IHDR") {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("expected 8-bit RGBA, not interlaced");
        } else if (type === "IDAT") idat.push(data);
        pos += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * 4;
    const px = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const f = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const v = raw[y * (stride + 1) + 1 + x];
            const left = x >= 4 ? px[y * stride + x - 4] : 0;
            const up = y > 0 ? px[(y - 1) * stride + x] : 0;
            const ul = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
            let p;
            if (f === 0) p = 0;
            else if (f === 1) p = left;
            else if (f === 2) p = up;
            else if (f === 3) p = (left + up) >> 1;
            else {
                const base = left + up - ul;
                const pa = Math.abs(base - left), pb = Math.abs(base - up), pc = Math.abs(base - ul);
                p = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
            }
            px[y * stride + x] = (v + p) & 0xff;
        }
    }
    return { width, height, px };
}

// An .ico entry as a 32-bit DIB (what every part of Windows reads at the
// small sizes): BGRA bottom-up, then an all-zero AND mask.
function dibEntry({ width, height, px }) {
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(width, 4);
    header.writeInt32LE(height * 2, 8); // colour + mask
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    header.writeUInt32LE(0, 16);
    const colour = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const s = (y * width + x) * 4;
            const d = ((height - 1 - y) * width + x) * 4;
            colour[d] = px[s + 2]; colour[d + 1] = px[s + 1]; colour[d + 2] = px[s]; colour[d + 3] = px[s + 3];
        }
    }
    const maskRow = Math.ceil(width / 32) * 4;
    return Buffer.concat([header, colour, Buffer.alloc(maskRow * height)]);
}

function writeIco(entries) {
    const dir = Buffer.alloc(6 + 16 * entries.length);
    dir.writeUInt16LE(0, 0);
    dir.writeUInt16LE(1, 2);
    dir.writeUInt16LE(entries.length, 4);
    let offset = dir.length;
    entries.forEach(({ size, data }, i) => {
        const o = 6 + 16 * i;
        dir[o] = size >= 256 ? 0 : size;
        dir[o + 1] = size >= 256 ? 0 : size;
        dir.writeUInt16LE(1, o + 4);
        dir.writeUInt16LE(32, o + 6);
        dir.writeUInt32LE(data.length, o + 8);
        dir.writeUInt32LE(offset, o + 12);
        offset += data.length;
    });
    return Buffer.concat([dir, ...entries.map((e) => e.data)]);
}

app.whenReady().then(() => {
    const root = path.resolve(__dirname, "..");
    const source = nativeImage.createFromPath(path.join(root, "resources", "branding", "church-logo.jpg"));
    if (source.isEmpty()) {
        console.error("church-logo.jpg could not be read");
        app.exit(1);
        return;
    }
    const work = source.resize({ width: WORK, height: WORK, quality: "best" });
    const alpha = emblemAlpha(work.toBitmap(), WORK);
    const ring = findRing(alpha, WORK);
    console.log(`ring: centre ${ring.cx.toFixed(1)},${ring.cy.toFixed(1)} radius ${ring.r} thickness ${ring.thickness}`);

    // Drawn once big, then each size shrunk from it.
    const big = nativeImage.createFromBitmap(flatIcon(alpha, WORK, ring, 1024), { width: 1024, height: 1024 });
    const png = (size) => big.resize({ width: size, height: size, quality: "best" }).toPNG();
    const entries = SIZES.map((size) => ({ size, data: size >= 256 ? png(size) : dibEntry(decodePng(png(size))) }));

    fs.mkdirSync(path.join(root, "build"), { recursive: true });
    fs.writeFileSync(path.join(root, "build", "icon.ico"), writeIco(entries));
    fs.writeFileSync(path.join(root, "build", "icon.png"), png(512));
    console.log(`build/icon.ico (${SIZES.join(", ")} px) and build/icon.png (512 px) written`);
    app.exit(0);
});
