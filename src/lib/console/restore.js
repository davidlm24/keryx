// Putting things back on air: "Voltar ao anterior" (one history entry, back
// through the Prévia) and the Desfazer of Esc / Encerrar (everything the
// screens showed, straight back). Pure, no imports, so node --test can check
// it (restore.test.mjs).

// The op and args that put a history entry (live.history[i], see
// shared/live-state.mjs) back on the projector.
export function restoreArgs(entry) {
    const d = entry.data;
    if (entry.layer === "content") return ["content.show", { kind: d.kind, ref: d.ref, title: d.title, artist: d.artist, slides: d.slides, index: d.index, style: d.style, stage: d.stage, audio: d.audio }];
    if (entry.layer === "media") return d.playlist ? ["media.playlist", { items: d.playlist, index: d.playlistIndex }] : ["media.show", { kind: d.kind, url: d.url, title: d.title, duration: d.duration, id: d.id, poster: d.poster }];
    if (entry.layer === "communication") return d.playlist ? ["communication.show", { playlist: d.playlist, index: d.playlistIndex }] : ["communication.show", { item: d.item }];
    if (entry.layer === "tool") return ["tool.show", { mode: d.mode, text: d.text, style: d.style, durationMs: d.mode === "timer" ? Math.max(1, d.endsAt - d.startedAt) : undefined }];
    throw new Error(`Entrada de histórico desconhecida: ${entry.layer}`);
}

// Esc ends the projection at once (owner's decision 2026-10-10); its toast's
// Desfazer puts back what the screens showed, from the live state just
// before: the main layers bottom-up (each show takes down the layers above
// it, so the top one goes last), the video channel, and Tela preta / Logo.
// Media and videos start again from the beginning; the audio channel was
// never taken down. -> [[op, args], ...], empty when nothing was on air.
export function undoEndOps(before) {
    if (!before) return [];
    const ops = [];
    for (const layer of ["content", "media", "communication", "tool"]) {
        if (before[layer]) ops.push(restoreArgs({ layer, data: before[layer] }));
    }
    const v = before.video;
    if (v) ops.push(["video.show", { kind: v.kind, url: v.url, title: v.title, duration: v.duration, id: v.id }]);
    if (ops.length && (before.screen === "black" || before.screen === "logo")) ops.push(["screen.set", { mode: before.screen }]);
    // Esc may have put the papel de parede on the Fundo: the one the item was
    // shown over comes back first (not while the padlock holds the Fundo).
    const held = (before.lockedLayers || []).includes("background");
    if (ops.length && !held && before.defaultBackground && JSON.stringify(before.background) !== JSON.stringify(before.defaultBackground)) {
        ops.unshift(before.background ? ["background.set", { ...before.background }] : ["background.clear", {}]);
    }
    return ops;
}
