import { useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { gerarRequestRow, gerarMessageRow, gerarStatusPatch, gerarMediaRow } from "@/lib/console/gerarImport";
import { codecFields, rangeReader, readVideoCodec } from "@/lib/videoCodec";

// What the GERAR sends (electron/gerarInbox.cjs; owner 2026-11-18, wave 2):
// the console writes each request and chat message as a ServiceMessage of
// the culto it shows (ensureService: the active culto, else the shared
// Setlist), as the phones' are, so the Painel, the toast, the bell and the
// sync between the church's computers take them as they are. A row is found
// by its GERAR id (external_id): one already here is not written again. A
// changed request updates its row's state (gerarStatusPatch).
// Answers [{ key, id }] for what is here now. Console only (never /Janela).
export function useGerarImport({ ensureService }) {
    const ensure = useRef(ensureService);
    ensure.current = ensureService;
    useEffect(() => {
        const g = typeof window !== "undefined" ? window.keryxDesktop?.gerar : null;
        if (!g?.onImport) return undefined;
        const db = keryx.entities.ServiceMessage;
        const here = async (kind, externalId) => {
            const rows = await db.filter({ source: "gerar", kind, external_id: String(externalId) }).catch(() => []);
            return Array.isArray(rows) ? rows : [];
        };
        return g.onImport(async (items) => {
            const results = [];
            for (const it of items || []) {
                // The files attached in the GERAR (wave 4): the card's state, then
                // each one as a Media row; the first video or audio is the pedido's.
                if (it?.type === "fileState" && it.requestId) {
                    for (const local of await here("pedido", it.requestId)) await db.update(local.id, { gerar_file: it.state || "" });
                    continue;
                }
                if (it?.type === "file" && it.requestId && it.fileName) {
                    const pedidos = await here("pedido", it.requestId);
                    const fileUrl = `${window.keryxDesktop?.mediaBaseUrl || ""}${it.fileName}`;
                    const fields = gerarMediaRow({ name: it.name, fileUrl }, pedidos[0]);
                    if (!fields) continue;
                    // A video's codec, as on every import (a HEVC one wears its mark).
                    const codec = fields.type === "video" ? await readVideoCodec(rangeReader(fileUrl)).catch(() => null) : null;
                    const media = await keryx.entities.Media.create({ ...fields, ...(codec ? codecFields(codec) : {}) });
                    const playable = fields.type === "video" || fields.type === "audio";
                    for (const local of pedidos) if (playable && media?.id && !local.mediaId && !local.songId) await db.update(local.id, { mediaId: media.id });
                    continue;
                }
                if (it?.type === "status" && it.request?.id) {
                    for (const local of await here("pedido", it.request.id)) {
                        const patch = gerarStatusPatch(local, it.request);
                        if (patch) await db.update(local.id, patch);
                    }
                    continue;
                }
                const isRequest = it?.type === "request" && it.request?.id;
                const isMessage = it?.type === "message" && it.message?.id;
                if (!isRequest && !isMessage) continue;
                const fields = isRequest ? gerarRequestRow(it.request) : gerarMessageRow(it.message);
                // A library pick (C8) stays tied only to a video or an audio this
                // computer has; otherwise the pedido keeps its title, as typed.
                if (fields.mediaId) {
                    const m = await keryx.entities.Media.filter({ id: fields.mediaId }).catch(() => []);
                    if (!(Array.isArray(m) && m[0] && (m[0].type === "video" || m[0].type === "audio"))) delete fields.mediaId;
                }
                const have = await here(fields.kind, fields.external_id);
                const row = have[0] || await db.create({ ...fields, serviceId: await ensure.current() });
                if (row?.id) results.push({ key: fields.external_id, id: row.id });
            }
            return results;
        });
    }, []);
}
