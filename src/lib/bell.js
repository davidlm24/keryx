// A short two-note chime for avisos with "Som de alerta", made with Web
// Audio (no file to ship or lose). It plays on the output's speakers like
// any other sound, so the console's meters (system loopback) see it.
export function ringBell() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const t0 = ctx.currentTime + 0.02;
        for (const [freq, at] of [[880, 0], [1320, 0.18]]) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t0 + at);
            gain.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.1);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0 + at);
            osc.stop(t0 + at + 1.2);
        }
        setTimeout(() => ctx.close().catch(() => {}), 1800);
    } catch { /* no sound */ }
}
