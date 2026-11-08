// Putting things back on air: "Voltar ao anterior" (one history entry, back
// through the Prévia) and the Desfazer of Esc / Encerrar (everything the
// screens showed, and the player's music, straight back). Pure (only the
// live state's own helpers, by a relative path), so node --test can check it
// (restore.test.mjs).
import { livePosition } from "../../../shared/live-state.mjs";

// The op and args that put a history entry (live.history[i], see
// shared/live-state.mjs) back on the projector.
export function restoreArgs(entry) {
    const d = entry.data;
    if (entry.layer === "content") return ["content.show", { kind: d.kind, ref: d.ref, title: d.title, artist: d.artist, slides: d.slides, index: d.index, style: d.style, stage: d.stage, audio: d.audio, follow: d.follow }];
    if (entry.layer === "media") return d.playlist ? ["media.playlist", { items: d.playlist, index: d.playlistIndex }] : ["media.show", { kind: d.kind, url: d.url, title: d.title, duration: d.duration, id: d.id, poster: d.poster }];
    if (entry.layer === "communication") return d.playlist ? ["communication.show", { playlist: d.playlist, index: d.playlistIndex }] : ["communication.show", { item: d.item }];
    if (entry.layer === "tool") return ["tool.show", { mode: d.mode, text: d.text, style: d.style, durationMs: d.mode === "timer" ? Math.max(1, d.endsAt - d.startedAt) : undefined }];
    throw new Error(`Entrada de histórico desconhecida: ${entry.layer}`);
}

// Esc ends the projection at once (owner's decision 2026-10-10; with the
// exit fade of Transições since Rodada F2); its toast's
// Desfazer puts back what the screens showed, from the live state just
// before: the main layers bottom-up (each show takes down the layers above
// it, so the top one goes last), the video channel, the player's music and
// Tela preta / Logo. Media and videos start again from the beginning; the
// music (Esc stops it since Rodada G3, owner 2026-10-17) comes back at the
// second it stopped — `endedAt`, the updatedAt of Esc's change —, paused if
// it was, its volume rising over the pause fade (`fadeIn: true`, which
// withTransitions turns into Ao pausar o som's ms), a list at its item. A
// sound put back never stops another (Transições, one sound at a time:
// `mix`) and comes back at the volume it had.
// -> [[op, args], ...], empty when nothing was on air.
const asItWas = ([op, args], data) => [op, { ...args, transition: { mode: "mix" }, ...(typeof data?.playback?.volume === "number" ? { volume: data.playback.volume } : {}) }];
function musicBack(a, endedAt) {
    const pb = a.playback || {};
    const paused = Boolean(pb.paused);
    const start = { position: paused ? pb.position || 0 : livePosition(pb, endedAt ?? pb.at), paused, fadeIn: true };
    const one = (it) => ({ kind: it.kind, url: it.url, title: it.title, duration: it.duration, id: it.id, poster: it.poster });
    const op = a.playlist ? ["audio.playlist", { items: a.playlist, index: a.playlistIndex, ...start }] : ["audio.show", { ...one(a), ...start }];
    return asItWas(op, a);
}
export function undoEndOps(before, endedAt) {
    if (!before) return [];
    const ops = [];
    for (const layer of ["content", "media", "communication", "tool"]) {
        if (!before[layer]) continue;
        const op = restoreArgs({ layer, data: before[layer] });
        ops.push(layer === "media" ? asItWas(op, before.media) : op);
    }
    const v = before.video;
    if (v) ops.push(asItWas(["video.show", { kind: v.kind, url: v.url, title: v.title, duration: v.duration, id: v.id }], v));
    if (before.audio) ops.push(musicBack(before.audio, endedAt));
    if (ops.length && (before.screen === "black" || before.screen === "logo")) ops.push(["screen.set", { mode: before.screen }]);
    // Esc may have put the papel de parede on the Fundo: the one the item was
    // shown over comes back first (not while the padlock holds the Fundo).
    const held = (before.lockedLayers || []).includes("background");
    if (ops.length && !held && before.defaultBackground && JSON.stringify(before.background) !== JSON.stringify(before.defaultBackground)) {
        ops.unshift(before.background ? ["background.set", { ...before.background }] : ["background.clear", {}]);
    }
    return ops;
}
