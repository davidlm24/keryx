import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_MAP } from "./deviceStyles.js";

// The fonts KERYX ships (src/fonts.css): the console and every screen use
// the same Geist, from the app itself, never from the internet.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p));

test("Sem serifa is the bundled Geist, with the system font only as a fallback", () => {
    assert.match(FONT_MAP.sans, /^"Geist",/);
    assert.match(FONT_MAP.sans, /system-ui/);
});

test("the @font-face points at a real woff2 shipped in the repository", () => {
    const css = read("src/fonts.css").toString();
    const url = css.match(/url\("\.\/(assets\/fonts\/[^"]+\.woff2)"\)/);
    assert.ok(url, "fonts.css declares a local woff2");
    const file = read(path.join("src", url[1]));
    assert.equal(file.subarray(0, 4).toString("latin1"), "wOF2");
    assert.match(css, /font-weight:\s*100 900/);
});

test("the font's license ships with the build (SIL OFL 1.1)", () => {
    const license = read("public/fonts/Geist-OFL.txt").toString();
    assert.match(license, /SIL Open Font License, Version 1\.1/);
    assert.match(license, /Copyright \(c\) 2023 Vercel/);
});

test("no stylesheet fetches fonts from the internet", () => {
    for (const p of ["src/index.css", "src/fonts.css", "src/components/console/console.css", "src/components/screen/screen.css", "docs/design-system/components/bundle.css", "docs/design-system/tokens.css", "index.html"]) {
        assert.doesNotMatch(read(p).toString(), /fonts\.(googleapis|gstatic)\.com/, p);
    }
});

// The church's fonts (Rodada HF1, src/lib/fonts.js): a theme's font_family
// is a KERYX key or a family's name; the family's faces are Media rows of
// category font, declared by one @font-face each in every window.
import { fontStack, isFontKey, isFontMedia, cssFamily, fontFaceCss, fontFormat, fontKind, weightOfStyle, wantedFace, findFontRow, findFontRows, fontFamilies, familyFromFileName, faceFromFileName, themesUsingFont, MAX_FONT_BYTES } from "./fonts.js";

test("fontStack: a KERYX key gives its stack, a family name is quoted with the Geist stack behind it", () => {
    assert.equal(fontStack("sans"), FONT_MAP.sans);
    assert.equal(fontStack("georgia"), FONT_MAP.georgia);
    assert.equal(fontStack(""), FONT_MAP.sans);
    assert.equal(fontStack(undefined), FONT_MAP.sans);
    assert.equal(fontStack("Montserrat"), `"Montserrat", ${FONT_MAP.sans}`);
    assert.equal(fontStack('Ana\'s "Font"'), `"Ana's \\"Font\\"", ${FONT_MAP.sans}`);
    // A name that happens to be an object property is not a key.
    assert.equal(fontStack("constructor"), `"constructor", ${FONT_MAP.sans}`);
    assert.equal(isFontKey("sans"), true);
    assert.equal(isFontKey("Montserrat"), false);
    assert.equal(isFontKey("toString"), false);
    assert.equal(cssFamily("A\\B"), '"A\\\\B"');
});

test("isFontMedia: by category or type, never a background or a video", () => {
    assert.equal(isFontMedia({ category: "font" }), true);
    assert.equal(isFontMedia({ type: "font" }), true);
    assert.equal(isFontMedia({ category: "background", type: "image" }), false);
    assert.equal(isFontMedia(null), false);
});

test("fontFaceCss: one @font-face per row, format by extension, display block; rows without a family or a file skipped", () => {
    const css = fontFaceCss([
        { category: "font", title: "Montserrat", file_url: "http://127.0.0.1:7700/media/a.ttf", font: { family: "Montserrat", weight: "700", style: "italic" } },
        { category: "font", title: "Geist Igreja", file_url: "http://127.0.0.1:7700/media/b.woff2", font: { family: "Geist Igreja", weight: "100 900" } },
        { category: "font", title: "Semnome", file_url: "http://127.0.0.1:7700/media/c.otf" },
        { category: "font", title: "", file_url: "http://127.0.0.1:7700/media/d.otf" },
        { category: "font", title: "Semarquivo", file_url: "" },
        { category: "other", type: "video", title: "Clipe", file_url: "http://127.0.0.1:7700/media/e.mp4" },
    ]);
    const lines = css.split("\n");
    assert.equal(lines.length, 3);
    assert.equal(lines[0], '@font-face{font-family:"Montserrat";src:url("http://127.0.0.1:7700/media/a.ttf") format("truetype");font-weight:700;font-style:italic;font-display:block}');
    assert.match(lines[1], /font-family:"Geist Igreja";src:url\("[^"]+b\.woff2"\) format\("woff2"\);font-weight:100 900;font-style:normal/);
    // The title names the family when the row has no font object (an old or hand-made row).
    assert.match(lines[2], /font-family:"Semnome";.*format\("opentype"\);font-weight:400;font-style:normal/);
    assert.equal(fontFaceCss([]), "");
    assert.equal(fontFormat("x.WOFF"), "woff");
    assert.equal(fontFormat("x.bin"), "");
    // A bad weight falls back to 400, so a row from another version never breaks the sheet.
    assert.match(fontFaceCss([{ category: "font", title: "X", file_url: "u.ttf", font: { weight: "bold" } }]), /font-weight:400/);
});

test("fontKind: the magic bytes tell ttf, otf, woff, woff2 and a collection; anything else is not a font", () => {
    assert.equal(fontKind(new Uint8Array([0, 1, 0, 0, 0, 10])), "ttf");
    assert.equal(fontKind(Buffer.from("true0000")), "ttf");
    assert.equal(fontKind(Buffer.from("OTTO0000")), "otf");
    assert.equal(fontKind(Buffer.from("wOFF0000")), "woff");
    assert.equal(fontKind(Buffer.from("wOF20000")), "woff2");
    assert.equal(fontKind(Buffer.from("ttcf0000")), "collection");
    assert.equal(fontKind(Buffer.from("%PDF-1.4")), "");
    assert.equal(fontKind(new Uint8Array([0, 1])), "");
    assert.equal(fontKind(null), "");
    // The bundled Geist is a woff2.
    assert.equal(fontKind(read("src/assets/fonts/Geist-Variable.woff2")), "woff2");
    assert.equal(MAX_FONT_BYTES, 20 * 1024 * 1024);
});

test("weightOfStyle and wantedFace: the PC's face names", () => {
    assert.deepEqual(weightOfStyle("Bold Italic"), { weight: "700", style: "italic" });
    assert.deepEqual(weightOfStyle("Regular"), { weight: "400", style: "normal" });
    assert.deepEqual(weightOfStyle("SemiBold"), { weight: "600", style: "normal" });
    assert.deepEqual(weightOfStyle("Light Italic"), { weight: "300", style: "italic" });
    assert.deepEqual(weightOfStyle("ExtraBold"), { weight: "800", style: "normal" });
    assert.deepEqual(weightOfStyle("Black"), { weight: "900", style: "normal" });
    assert.deepEqual(weightOfStyle("Oblique"), { weight: "400", style: "italic" });
    assert.deepEqual(weightOfStyle(""), { weight: "400", style: "normal" });
    assert.equal(wantedFace("Regular"), "Regular");
    assert.equal(wantedFace("Book"), "Regular");
    assert.equal(wantedFace("Bold"), "Bold");
    assert.equal(wantedFace("Italic"), "Italic");
    assert.equal(wantedFace("Bold  Italic"), "Bold Italic");
    assert.equal(wantedFace("SemiBold"), "");
    assert.equal(wantedFace("Light Italic"), "");
});

test("findFontRow(s) and fontFamilies: the rows of a family, one face, the families with their faces, size and state", () => {
    const rows = [
        { id: "1", category: "font", title: "Montserrat", file_url: "a.ttf", font: { family: "Montserrat", weight: "400", style: "normal", face: "Regular" }, size: 1000 },
        { id: "2", category: "font", title: "Montserrat", file_url: "b.ttf", font: { family: "Montserrat", weight: "700", style: "italic", face: "Bold Italic" }, size: 2000, syncing: true, missing: true },
        { id: "3", category: "font", title: "Alfa", file_url: "c.otf", font: { family: "Alfa", weight: "600", style: "normal" }, size: 500 },
        { id: "4", category: "other", type: "image", title: "Montserrat", file_url: "d.jpg" },
    ];
    assert.deepEqual(findFontRows(rows, "Montserrat").map((m) => m.id), ["1", "2"]);
    assert.equal(findFontRow(rows, "Montserrat", { weight: "700", style: "italic" })?.id, "2");
    assert.equal(findFontRow(rows, "Montserrat")?.id, "1");
    assert.equal(findFontRow(rows, "Montserrat", { weight: "700" }), null);
    assert.equal(findFontRow(rows, "Nada"), null);
    const fams = fontFamilies(rows);
    assert.deepEqual(fams.map((f) => f.family), ["Alfa", "Montserrat"]);
    assert.deepEqual(fams[1].faces, ["Regular", "Bold Italic"]);
    assert.equal(fams[1].bytes, 3000);
    assert.equal(fams[1].syncing, true);
    assert.equal(fams[1].missing, true);
    assert.deepEqual(fams[0].faces, ["peso 600 normal"]);
    assert.equal(fams[0].missing, false);
    assert.deepEqual(themesUsingFont([{ id: "t1", font_family: "Alfa" }, { id: "t2", font_family: "sans" }], "Alfa").map((t) => t.id), ["t1"]);
});

test("familyFromFileName and faceFromFileName: the file's name says the family and the face", () => {
    assert.equal(familyFromFileName("Montserrat-BoldItalic.ttf"), "Montserrat");
    assert.equal(familyFromFileName("OpenSans_Regular.woff2"), "OpenSans");
    assert.equal(familyFromFileName("Playfair Display Black.otf"), "Playfair Display");
    assert.equal(familyFromFileName("Roboto.ttf"), "Roboto");
    assert.equal(familyFromFileName(".ttf"), "Fonte");
    assert.deepEqual(faceFromFileName("Montserrat-BoldItalic.ttf"), { weight: "700", style: "italic" });
    assert.deepEqual(faceFromFileName("Roboto-Light.ttf"), { weight: "300", style: "normal" });
    assert.deepEqual(faceFromFileName("Roboto.ttf"), { weight: "400", style: "normal" });
});
