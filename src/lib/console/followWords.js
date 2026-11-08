// The letra automática's chip (PlayerBar's FollowChip, the phone's Ao vivo,
// the controle remoto's runner): its words and its click; its Iniciar's are
// lyricSync.js's. A module of its own, small: player.js rides in every
// output's chunk and lyricSync.js in a big one of the console's, and the
// phone (/Remote) has an output's budget (scripts/bundle-budget.cjs).
import { clockFollow } from "./player.js";

const byTime = (follow) => follow?.source === "time";

// The chip's words: what the lyrics follow, or that following is paused.
export function followLabel(follow) {
    if (!follow) return "";
    if (clockFollow(follow) && !follow.clock) return byTime(follow) ? "Letra por tempo · esperando Iniciar" : "Letra automática · esperando Iniciar";
    if (follow.paused) return "Letra parada · clique para retomar";
    if (byTime(follow)) return `Por tempo · ${String(follow.each || "").replace(".", ",")} s por slide`;
    return follow.source === "clock" ? "Relógio ao vivo" : follow.source === "video" ? "Letra segue o vídeo" : "Letra segue o playback";
}

// The chip's click (or the clock's Iniciar): the content.follow action.
export function followAction(follow) {
    if (!follow) return null;
    if (clockFollow(follow) && !follow.clock) return "start";
    return follow.paused ? "resume" : "pause";
}
