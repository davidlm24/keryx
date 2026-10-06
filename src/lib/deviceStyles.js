export const FONT_MAP = {
  sans: "ui-sans-serif, system-ui, sans-serif",
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