import { createElement, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { fontFaceCss, FONT_CATEGORY, isFontMedia } from "@/lib/fonts";

// The church's fonts in every window (Rodada HF1): the Media rows of
// category "font" — one per face, copied into the media library by the
// Editor de temas (src/components/editor/FontPicker.jsx) — read through the
// same adapter the console, a detached /Janela, an output window and a
// screen on the network all have (keryx.entities.Media.filter; the network
// server allows reads), and declared as one @font-face each in a <style>
// (fontFaceCss in src/lib/fonts.js). A row added or deleted anywhere reaches
// every window through the Media subscription. Nothing here depends on the
// console's code: an output loads only this and src/lib/fonts.js.

const EMPTY = [];
export const FONTS_KEY = ["fonts", "rows"];

export function useFontRows() {
    const client = useQueryClient();
    useEffect(() => keryx.entities.Media?.subscribe?.((change) => {
        // Only a font row matters here; a video's poster or a PDF's pages
        // arriving every few seconds must not refetch the fonts.
        if (change?.type === "delete" || isFontMedia(change?.data) || !change?.data) client.invalidateQueries({ queryKey: FONTS_KEY });
    }), [client]);
    const q = useQuery({
        queryKey: FONTS_KEY,
        queryFn: () => keryx.entities.Media?.filter?.({ category: FONT_CATEGORY }) ?? [],
        staleTime: 60_000,
    });
    return q.data ?? EMPTY;
}

// The stylesheet with every church font, mounted once per window (App.jsx):
// a theme that names a family then draws it on this screen as soon as the
// file is here (a copy still coming down from the sync draws Geist until
// it arrives, fontStack's fallback).
export default function FontFaces() {
    const rows = useFontRows();
    const css = useMemo(() => fontFaceCss(rows), [rows]);
    if (!css) return null;
    return createElement("style", { id: "keryx-fonts" }, css);
}
