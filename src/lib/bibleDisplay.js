// How a Bible passage's reference shows on the screens (style.ref_line,
// Configurações › Bíblia e músicas). Pure: the renderer, the Transmissão
// caption and their tests read it.
//   full  "João 3:16 · NVI" (the default)
//   plain "João 3:16"       (without the version)
//   none  ""                (no reference line)

// The version a reference ends with, as the Bíblia writes it (" · NVI").
const VERSION_TAIL = /\s+·\s+[A-Za-z0-9]{1,12}$/;

// The sigla a reference ends with ("João 3:16 · NVI" -> "NVI"), "" when none:
// the first edition's tag when two are on screen (slide.pair, Rodada P).
export const refVersion = (reference) => String(reference ?? "").trim().match(VERSION_TAIL)?.[0].replace(/^\s+·\s+/, "") || "";

export function refLine(reference, mode = "full") {
    const ref = String(reference ?? "").trim();
    if (mode === "none") return "";
    if (mode === "plain") return ref.replace(VERSION_TAIL, "");
    return ref;
}
