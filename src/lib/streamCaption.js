// The Transmissão screen (/StreamView, an OBS Browser Source): what the
// lower third shows, from the live state. Text only (owner's decision
// 2026-10-10): lyrics, Bible passages with their reference and text slides.
// Media, videos, avisos and tools stay off the stream (OBS has the camera),
// and Tela preta, Logo, Limpar and Encerrar clear it. Pure: tested in
// streamCaption.test.mjs.
import { mainLayer, currentSlide } from "../../shared/live-state.mjs";
import { verseSegments } from "./verseMarks.js";

// A Bible slide's text without its verse numbers ("16 Porque Deus… 17 Porque…"
// -> "Porque Deus… Porque…"); the reference line says which verses.
const withoutMarks = (text) => verseSegments(text).map((s) => s.text.trim()).filter(Boolean).join(" ");

// -> null (nothing on the stream) or { key, kind, text, ref }:
//   key  changes with every slide (for the fade between them);
//   text the slide's text (lyrics keep their line breaks);
//   ref  the passage's reference for Bible slides, else "".
export function streamCaption(state) {
    if (!state || mainLayer(state) !== "content" || state.video) return null;
    const content = state.content;
    const slide = currentSlide(content);
    const raw = String(slide?.text || "").trim();
    if (!raw) return null;
    const bible = content.kind === "bible";
    const text = bible ? withoutMarks(raw) : raw;
    if (!text) return null;
    return {
        key: `${content.startedAt || 0}:${content.index || 0}`,
        kind: content.kind,
        text,
        ref: bible ? String(slide.ref || content.title || "").trim() : "",
    };
}

// The text's size step, so a long passage still fits the band: "l" up to
// ~90 characters, "m" up to ~180, "s" beyond.
export const captionSize = (text) => {
    const n = String(text || "").length;
    return n <= 90 ? "l" : n <= 180 ? "m" : "s";
};
