import { useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { createRemoteRunner } from "@/lib/console/remoteRunner";
import { stageFromVerses, stageFromSong, stageFromMedia, stageFromPiece, stageFromMaterial, stageFromTool } from "@/lib/console/stage";
import { LOCKED_SAY } from "@/components/console/useConsole";
import { reportedDuration } from "@/components/console/meterStore";
import { installedVersions } from "@/lib/bibleText";
import { getPrefs } from "@/hooks/useUser";
import { pagesProgressOf } from "@/hooks/usePagesBackfill";

const STAGES = { song: stageFromSong, media: stageFromMedia, piece: stageFromPiece, material: stageFromMaterial, verses: stageFromVerses, tool: stageFromTool };

// Controle remoto (a phone, electron/lan.cjs): the commands main relays
// (`keryx:remote`, { id, action, args, v }) run through createRemoteRunner
// (remoteRunner.js) with the console's latest state — this render's lists
// through a ref, what is on air from the live client itself — and each
// answer goes back to the phone.
export function useRemote({ c, data, service, items, rows, airItemId, airNow, nextItem, prefs, playerPick, sendStage, buildStage, referenceVerses }) {
    // The KERYX version (state.app: a change reloads the phone's page).
    const app = useRef("");
    const deps = useRef(null);
    deps.current = {
        live: () => keryx.live.current() || c.cur,
        now: () => keryx.live.now(),
        lockedSay: LOCKED_SAY,
        service, items, rows, airItemId, airNow, nextItem, prefs, playerPick,
        songs: data.songs, media: data.media, pieces: data.pieces, materials: data.materials, themes: data.themes,
        alertPresets: data.alertPresets, timerPresets: data.timerPresets, loaded: data.loaded,
        app: () => app.current,
        bible: async () => ({ version: getPrefs().bible_version || "", installed: Object.keys(await installedVersions()) }),
        reportedDuration,
        // How far each PDF's pages are: the phone says "Preparando páginas 3/12".
        progressOf: pagesProgressOf,
        callOp: c.callOp, liveOp: c.liveOp, clearText: c.clearText, say: c.say, end: c.end,
        // Desfazer as the console's Ctrl+Z: the toast's own, when it has one.
        undo: () => { const a = c.toastAction; if (!a?.undo) return false; a.run(); return true; },
        sendStage, buildStage, referenceVerses, stages: STAGES,
    };
    useEffect(() => {
        const remote = window.keryxDesktop?.remote;
        if (!remote?.onCommand) return undefined;
        window.keryxDesktop?.system?.call?.("info")?.then((r) => { app.current = String(r?.data?.version || r?.version || ""); }).catch(() => {});
        const runner = createRemoteRunner(() => deps.current);
        return remote.onCommand(async (command) => remote.reply(command.id, await runner.answer(command)));
    }, []);
}
