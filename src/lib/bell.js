// A short two-note chime for avisos with "Som de alerta", made with Web
// Audio (no file to ship or lose). It plays on the output's speakers like
// any other sound, so the console's meters (system loopback) see it. The
// church can turn it off or set its volume (Configurações › Telas e saídas ›
// Som do aviso, on the profile): every output and network screen follows.

// The volume the chime always had (gain 0.35), in percent.
export const CHIME_VOLUME = 35;

// -> the notes to play: [{ freq, at, gain }] (none when turned off).
export function chimeNotes({ on = true, volume = CHIME_VOLUME } = {}) {
    if (on === false) return [];
    const v = Math.min(100, Math.max(5, Number(volume) || CHIME_VOLUME));
    return [[880, 0], [1320, 0.18]].map(([freq, at]) => ({ freq, at, gain: v / 100 }));
}

export function ringBell(prefs = {}) {
    const notes = chimeNotes(prefs);
    if (!notes.length) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const t0 = ctx.currentTime + 0.02;
        for (const { freq, at, gain: peak } of notes) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t0 + at);
            gain.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.1);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0 + at);
            osc.stop(t0 + at + 1.2);
        }
        setTimeout(() => ctx.close().catch(() => {}), 1800);
    } catch { /* no sound */ }
}
