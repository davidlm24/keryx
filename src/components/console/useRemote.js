import { useEffect, useRef } from "react";
import { createRemoteRunner } from "@/lib/console/remoteRunner";
import { stageFromVerses } from "@/lib/console/stage";
import { LOCKED_SAY } from "@/components/console/useConsole";

// Controle remoto (a phone, electron/lan.cjs): the commands main relays
// (`keryx:remote`) run through createRemoteRunner (remoteRunner.js) with the
// console's latest state, read through a ref, and each answer goes back to
// the phone.
export function useRemote({ c, service, items, airItemId, airNow, nextItem, prefs, playerPick, sendStage, buildStage, referenceVerses }) {
    const deps = useRef(null);
    deps.current = {
        live: () => c.cur,
        locked: c.locked,
        lockedSay: LOCKED_SAY,
        service, items, airItemId, airNow, nextItem, prefs, playerPick,
        callOp: c.callOp, liveOp: c.liveOp, clearText: c.clearText, say: c.say, end: c.end,
        sendStage, buildStage, referenceVerses, stageFromVerses,
    };
    useEffect(() => {
        const remote = window.keryxDesktop?.remote;
        if (!remote?.onCommand) return undefined;
        const runner = createRemoteRunner(() => deps.current);
        return remote.onCommand(async (command) => remote.reply(command.id, await runner.answer(command)));
    }, []);
}
