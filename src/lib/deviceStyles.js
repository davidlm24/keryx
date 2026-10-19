import { lineHeightOf, LETTER_SPACING_RANGE, OUTLINE_RANGE } from "./textSize.js";

// "sans" (Sem serifa, the default) is Geist, shipped with the app
// (src/fonts.css): the same letters on the projector, the console's monitors
// and every network screen, so lines break in the same places. The others
// are the device's own fonts and may differ from one screen to another.
export const FONT_MAP = {
  sans: "\"Geist\", ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, monospace",
  cursive: "cursive",
  arial: "Arial, Helvetica, sans-serif",
  georgia: "Georgia, serif",
  times: "'Times New Roman', serif",
  verdana: "Verdana, sans-serif",
};

export const SIZE_MAP = {
  xsmall: "1.5rem",
  small: "2rem",
  medium: "2.75rem",
  large: "3.5rem",
  xlarge: "4.5rem",
  xxlarge: "6rem",
};

export function getTextEffect(effect, color) {
  const c = color || "#ffffff";
  switch (effect) {
    case "glow":
      return { textShadow: `0 0 20px ${c}, 0 0 40px ${c}` };
    case "shadow":
      return { textShadow: "2px 2px 8px rgba(0,0,0,0.8)" };
    case "outline":
      return { WebkitTextStroke: `2px ${c}`, WebkitTextFillColor: "transparent" };
    case "3d":
      return { textShadow: "1px 1px 0 #888, 2px 2px 0 #777, 3px 3px 6px rgba(0,0,0,0.5)" };
    case "neon":
      return { textShadow: `0 0 5px ${c}, 0 0 10px ${c}, 0 0 20px ${c}, 0 0 40px ${c}` };
    case "double-shadow":
      return { textShadow: "3px 3px 0 rgba(0,0,0,0.9), 6px 6px 12px rgba(0,0,0,0.6)" };
    default:
      return {};
  }
}

// The theme's typography (Rodada HF2), as inline style for the text: weight,
// italic, line spacing, letter spacing and an outline of its own. Each key
// is "" by default and then sets nothing, so the screen's CSS stays (600,
// or 500 for a passage; line height 1.22, 1.3 for a passage). The outline is
// px on a 1920-wide screen, drawn behind the letters (paint-order), so the
// width is what shows outside them: the stroke is twice as wide. It is
// independent of text_effect; the old "outline" effect (hollow letters) is
// still getTextEffect's.
const PX = 100 / 1920; // 1px of a 1920-wide screen, in cqw
const HEX = /^#[0-9a-f]{6}$/i;
export function typography(style = {}) {
  const out = {};
  if (style.font_weight === "bold") out.fontWeight = 700;
  else if (style.font_weight === "normal") out.fontWeight = 400;
  if (style.font_style === "italic") out.fontStyle = "italic";
  if (style.line_height !== undefined && style.line_height !== null && style.line_height !== "") out.lineHeight = lineHeightOf(style.line_height);
  const ls = Number(style.letter_spacing);
  if (style.letter_spacing !== "" && style.letter_spacing != null && Number.isFinite(ls) && ls !== 0) out.letterSpacing = `${Math.min(LETTER_SPACING_RANGE[1], Math.max(LETTER_SPACING_RANGE[0], ls))}em`;
  const px = Math.min(OUTLINE_RANGE[1], Math.max(0, Number(style.text_outline_px) || 0));
  if (px > 0) {
    const color = HEX.test(String(style.text_outline_color || "")) ? style.text_outline_color : "#000000";
    out.WebkitTextStroke = `${(px * 2 * PX).toFixed(3)}cqw ${color}`;
    out.paintOrder = "stroke fill";
  }
  return out;
}

export const DEVICE_TYPE_LABELS = {
  projector: "Projetor",
  tv: "Smart TV",
  tablet: "Tablet",
  pc: "PC",
};

export const DEVICE_ROLE_LABELS = {
  lyrics: "Letras / Bíblia",
  media: "Multimídia",
  control: "Controlo Remoto",
  bible: "Bíblia",
  announcements: "Avisos",
  mixed: "Misto",
};

export const CONTENT_TYPE_LABELS = {
  lyrics: "Letras",
  bible: "Bíblia",
  video: "Vídeo",
  image: "Imagem",
  announcement: "Aviso",
  countdown: "Contagem",
  blank: "Tela Vazia",
  logo: "Logo",
};

export function generatePairingCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}