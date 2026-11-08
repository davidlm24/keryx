// A printable lyric sheet for a song (Imprimir in the song editor): a new
// window with plain HTML and the system print dialog. Text is escaped.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CATEGORY = { worship: "Adoração", praise: "Louvor", hymn: "Hino", contemporary: "Contemporâneo", other: "Outro" };

export function printSong(song, slides) {
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return false;
    const meta = [song.song_key && `Tom: ${song.song_key}`, song.bpm && `BPM: ${song.bpm}`, CATEGORY[song.category], `${slides.length} ${slides.length === 1 ? "slide" : "slides"}`].filter(Boolean).join(" · ");
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(song.title)}</title>
<style>
body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 20px; color: #1a1a1a; line-height: 1.7; }
h1 { font-size: 28px; margin: 0 0 4px; }
.artist { font-size: 16px; color: #555; margin-bottom: 8px; }
.meta { font-size: 13px; color: #777; margin-bottom: 24px; }
.slide { margin-bottom: 22px; page-break-inside: avoid; }
.slide p { font-size: 18px; white-space: pre-wrap; margin: 0; }
.lab { font: 600 11px system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #8a6d1f; margin-bottom: 4px; }
.chorus p { font-style: italic; }
.notes { font-size: 14px; color: #444; border-left: 3px solid #ccc; padding-left: 12px; margin-bottom: 24px; white-space: pre-wrap; }
.footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 12px; color: #888; text-align: center; }
</style></head><body>
<h1>${esc(song.title)}</h1>
<div class="artist">${esc(song.artist || "")}</div>
<div class="meta">${esc(meta)}</div>
${song.musician_notes ? `<div class="notes">${esc(song.musician_notes)}</div>` : ""}
${slides.map((s, i) => `<div class="slide ${s.is_chorus ? "chorus" : ""}">${s.label && (i === 0 || slides[i - 1].label !== s.label) ? `<div class="lab">${esc(s.label)}</div>` : ""}<p>${esc(s.text)}</p></div>`).join("\n")}
<div class="footer">KERYX · ${esc(new Date().toLocaleDateString("pt-BR"))}${song.ccli_number ? ` · CCLI ${esc(song.ccli_number)}` : ""}</div>
</body></html>`);
    win.document.close();
    setTimeout(() => { try { win.print(); } catch { /* the window was closed */ } }, 300);
    return true;
}
