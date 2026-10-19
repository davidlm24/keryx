import React, { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { THEME_FONTS } from "@/lib/console/themes";
import { FONT_MAP } from "@/lib/deviceStyles";
import { fontStack, isFontKey, fontKind, findFontRow, weightOfStyle, faceFromFileName, KIND_EXTENSION, MAX_FONT_BYTES, FONT_ACCEPT, FONT_CATEGORY, COLLECTION_HINT, TOO_BIG_HINT, NOT_A_FONT_HINT } from "@/lib/fonts";
import { FONTS_KEY } from "@/hooks/useFonts";
import { useChurchFonts } from "../console/useConsoleData";
import LocalFontsDialog from "./LocalFontsDialog";

// The Fonte select of the editors (Rodada HF1, the owner's mockup H3): three
// groups — KERYX (Padrão Geist, then the seven device keys "· do
// aparelho"), Da igreja (the families the church copied in, each with its
// state: "· Baixando…" while the sync brings it, "· arquivo não encontrado"
// when its file is gone) and, in the FontPicker, Trazer (Do computador…,
// Arquivo de fonte…). A choice in Trazer never changes the value by
// itself: the dialog does, once the font is copied.
const PC = "__pc", FILE = "__file";
const DEVICE = THEME_FONTS.filter(([v]) => v !== "sans");

const familyState = (f) => (f.syncing ? " · Baixando…" : f.missing ? " · arquivo não encontrado" : "");

// The select alone (the aviso and song editors): KERYX and Da igreja.
export function FontSelect({ value, onChange, label = "Fonte", className = "pl-input", style, children, onPick }) {
    const { families } = useChurchFonts();
    const v = value || "sans";
    // A family the theme names but the church no longer has: still listed,
    // so the select shows what the theme says (VerifyView says the rest).
    const orphan = !isFontKey(v) && !families.some((f) => f.family === v);
    return (
        <select className={className} style={style} value={v} aria-label={label} onChange={(e) => { const next = e.target.value; if (onPick?.(next)) return; onChange(next); }}>
            <optgroup label="KERYX">
                <option value="sans" style={{ fontFamily: FONT_MAP.sans }}>Padrão (Geist)</option>
                {DEVICE.map(([k, name]) => <option key={k} value={k} style={{ fontFamily: FONT_MAP[k] }}>{name} · do aparelho</option>)}
            </optgroup>
            {(families.length > 0 || orphan) && (
                <optgroup label="Da igreja">
                    {families.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: fontStack(f.family) }}>{f.family}{familyState(f)}</option>)}
                    {orphan && <option value={v}>{v} · não encontrada</option>}
                </optgroup>
            )}
            {children}
        </select>
    );
}

// What the kx-meta under the picker says about the chosen font.
export function fontNote(value, families) {
    const v = value || "sans";
    if (v === "sans") return "vem com o KERYX · a mesma em todas as telas";
    if (isFontKey(v)) return "fonte do aparelho · uma tela sem ela usa outra";
    const f = families.find((x) => x.family === v);
    if (!f) return "fonte da igreja não encontrada · as telas usam a Geist; copie-a de novo em Trazer";
    if (f.syncing) return "copiada para a igreja · o arquivo ainda está chegando da sincronização";
    if (f.missing) return "copiada para a igreja · o arquivo não está na pasta de mídia deste computador";
    return "copiada para a igreja · em todas as telas";
}

// Copies the faces into the library: one Media row per face, the file's
// bytes through UploadFile (the adapter copies them into the media folder
// and the sync carries them). A face the church already has is kept. The
// first refusal stops the rest and is said as it is (a collection, a file
// that is not a font, too big).
export async function copyFaces(faces, rows, { family, origin }) {
    let made = 0;
    for (const face of faces) {
        // face.blob(): the PC's FontData.blob(), or the file picked.
        const bytes = new Uint8Array(await (await face.blob()).arrayBuffer());
        const kind = fontKind(bytes);
        if (kind === "collection") throw new Error(COLLECTION_HINT);
        if (!kind) throw new Error(NOT_A_FONT_HINT);
        if (bytes.byteLength > MAX_FONT_BYTES) throw new Error(TOO_BIG_HINT);
        if (findFontRow(rows, family, { weight: face.weight, style: face.style })) continue;
        const safe = `${family} ${face.name}`.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-") || "fonte";
        const file = new File([bytes], `${safe}${KIND_EXTENSION[kind]}`, { type: `font/${kind}` });
        const { file_url } = await keryx.integrations.Core.UploadFile({ file });
        await keryx.entities.Media.create({
            title: family, type: FONT_CATEGORY, category: FONT_CATEGORY, file_url, duration: 0,
            font: { family, weight: face.weight, style: face.style, face: face.name, origin },
        });
        made += 1;
    }
    return made;
}

export default function FontPicker({ value, onChange, say, label = "Fonte do tema", style }) {
    const { families, rows } = useChurchFonts();
    const client = useQueryClient();
    const [dialog, setDialog] = useState(null); // { mode, file }
    const fileRef = useRef(null);
    const refresh = () => { client.invalidateQueries({ queryKey: FONTS_KEY }); client.invalidateQueries({ queryKey: ["console", "Media"] }); };

    const onPick = (next) => {
        if (next === PC) { setDialog({ mode: "pc" }); return true; }
        if (next === FILE) { fileRef.current?.click(); return true; }
        return false;
    };
    const onFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) setDialog({ mode: "file", file });
    };
    // The dialog's answer: the PC family's faces, or the file with its
    // name. Copied, the theme takes the family at once.
    const onAnswer = async (r) => {
        if (!r) { setDialog(null); return; }
        try {
            let made;
            if (r.faces) {
                const faces = r.faces.map((f) => ({ name: f.name, blob: () => f.data.blob(), ...weightOfStyle(f.name) }));
                made = await copyFaces(faces, rows, { family: r.family, origin: "pc" });
            } else {
                const face = faceFromFileName(r.file.name);
                const name = face.weight === "700" && face.style === "italic" ? "Bold Italic" : face.weight === "700" ? "Bold" : face.style === "italic" ? "Italic" : face.weight === "400" ? "Regular" : `${face.weight}${face.style === "italic" ? " Italic" : ""}`;
                made = await copyFaces([{ name, blob: async () => r.file, ...face }], rows, { family: r.family, origin: "file" });
            }
            refresh();
            onChange(r.family);
            say?.(made ? `Fonte ${r.family} copiada para a igreja: ${made === 1 ? "uma face" : `${made} faces`}. Vai para as outras telas e computadores.` : `A igreja já tinha a fonte ${r.family}.`);
            setDialog(null);
        } catch (err) {
            say?.(err?.message || "Não foi possível copiar a fonte.");
        }
    };

    return (
        <>
            <FontSelect value={value} onChange={onChange} label={label} style={style} onPick={onPick}>
                <optgroup label="Trazer">
                    <option value={PC}>Do computador…</option>
                    <option value={FILE}>Arquivo de fonte…</option>
                </optgroup>
            </FontSelect>
            <input ref={fileRef} type="file" hidden accept={FONT_ACCEPT} onChange={onFile} aria-label="Arquivo de fonte" />
            {dialog && <LocalFontsDialog mode={dialog.mode} file={dialog.file || null} onAnswer={onAnswer} />}
        </>
    );
}

export { fontNote as fontPickerNote };
