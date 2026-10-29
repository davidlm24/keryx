import { useCallback, useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { useConfirm } from "./ConfirmDialog";
import { isConsoleSetlist } from "@/lib/console/consoleSetlist";

// The church's active culto (owner 2026-10-29, U1/U4 = A;
// src/lib/console/consoleSetlist.js): User.active_service_id, synced, so
// activating a culto on any computer switches every console to it, and
// ending it brings them all back to the shared Setlist. The console's
// Setlist header, the Culto menu and Planejar o culto all come here.
// Switching only changes the list on screen: nothing leaves the air.

const named = (s) => `“${s?.title || "Culto sem nome"}”`;

// The changes this window made (its own toast said them already), so the
// console does not repeat them as news from elsewhere.
const mine = new Set();

// ask: the console passes its own question (it holds the ConfirmDialog, so
// the context is not above it); pages under the console use the context.
export function useActiveService(say, ask = null) {
    const activeId = usePrefs().active_service_id || "";
    const fromContext = useConfirm();
    const confirm = ask || fromContext;

    // service: a culto, or null for the shared Setlist.
    const activate = useCallback(async (service) => {
        const id = service && !isConsoleSetlist(service) ? service.id : "";
        if (id === activeId) return true;
        mine.add(id);
        try {
            await updateUser({ active_service_id: id });
        } catch (err) {
            mine.delete(id);
            say?.(err?.message || "Não foi possível trocar o culto.");
            return false;
        }
        say?.(id ? `${named(service)} ativado em todos os computadores.` : "De volta à Setlist em todos os computadores.");
        return true;
    }, [activeId, say]);

    // "Encerrar o culto…" (U4 = A): marked Feito, every console back to the
    // shared Setlist. Asks first; nothing on air changes.
    const endService = useCallback(async (service) => {
        if (!service || isConsoleSetlist(service)) return false;
        const yes = await confirm({
            title: "Encerrar o culto?",
            text: `${named(service)} fica marcado como feito e todos os computadores voltam à Setlist. Nada sai do ar.`,
            ok: "Encerrar o culto",
        });
        if (!yes) return false;
        try {
            await keryx.entities.Service.update(service.id, { status: "COMPLETED" });
            if (service.id === activeId) {
                mine.add("");
                await updateUser({ active_service_id: "" });
            }
        } catch (err) {
            say?.(err?.message || "Não foi possível encerrar o culto.");
            return false;
        }
        say?.(`${named(service)} encerrado · de volta à Setlist.`);
        return true;
    }, [activeId, confirm, say]);

    return { activeId, activate, endService };
}

// The console says when the active culto changed elsewhere (another
// computer, a detached planner): the list on screen just switched.
export function useActiveServiceNews(activeId, services, say) {
    const seen = useRef(undefined);
    useEffect(() => {
        const id = activeId || "";
        if (seen.current === undefined) { seen.current = id; return; }
        if (seen.current === id) return;
        seen.current = id;
        if (mine.delete(id)) return;
        const s = id ? (services || []).find((x) => x.id === id) : null;
        say?.(id ? `${named(s)} agora é o culto ativo.` : "De volta à Setlist.");
    }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
}
