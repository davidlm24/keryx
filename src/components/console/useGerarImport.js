import { useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { gerarRequestRow, gerarMessageRow, gerarStatusPatch } from "@/lib/console/gerarImport";

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
                const have = await here(fields.kind, fields.external_id);
                const row = have[0] || await db.create({ ...fields, serviceId: await ensure.current() });
                if (row?.id) results.push({ key: fields.external_id, id: row.id });
            }
            return results;
        });
    }, []);
}
