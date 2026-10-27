import { applyOp, emptyState } from "@shared/live-state.mjs";

// Sample content for the settings' live previews (Aparência's transition
// screen, each output's Ajustes): real ops on an empty state, so a preview
// is the renderer itself, never a mock.
export const SAMPLE_SLIDES = [{ text: "Grande é o Senhor\ne mui digno de louvor" }, { text: "Na cidade do nosso Deus\nno seu santo monte" }];

// Items the pastor's "Próximo" sample lists.
export const SAMPLE_ITEMS = [
    { id: "ex1", title: "Canção de exemplo", type: "SONG" },
    { id: "ex2", title: "João 3:16-17", type: "BIBLE" },
    { id: "ex3", title: "Avisos da semana", type: "ANNOUNCEMENT" },
    { id: "ex4", title: "Oração", type: "TEXT" },
    { id: "ex5", title: "Hino final", type: "SONG" },
];

// A song on air, with the stage data the Palco shows (key, BPM, chords, notes).
export function sampleLive(now, style = {}) {
    return applyOp(emptyState(now), "content.show", {
        kind: "lyrics", title: "Canção de exemplo", artist: "Ministério", slides: SAMPLE_SLIDES, style,
        stage: { song_key: "G", bpm: 72, chords: "G  D  Em  C", musician_notes: "Intro 2x · final a cappella" },
    }, now);
}

// An Aviso rápido on air (its `since` replays the bar's entrance), for the
// Editor's look at the bar a screen draws (Rodada E3).
export function sampleAlert(now) {
    return applyOp(emptyState(now), "alert.show", { message: "Carro placa ABC-1234, procure a recepção", type: "message" }, now).alert;
}

// An aviso on air, for the outputs whose view only shows avisos.
export function sampleNotice(now) {
    return applyOp(emptyState(now), "communication.show", {
        item: { id: "exemplo", title: "Avisos da semana", type: "announcement", text: "Culto de oração · quinta às 19h30", background_color: "#101a2e" },
    }, now);
}

// A timer on air, as tool.show leaves it (the Editor de telas' "Timer"
// state, Rodada G2): ten minutes from `now`, nothing else on air.
export function sampleTimer(now) {
    return applyOp(emptyState(now), "tool.show", { mode: "timer", durationMs: 10 * 60000 }, now);
}
