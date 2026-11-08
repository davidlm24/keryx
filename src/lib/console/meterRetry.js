// When the player's level meters try the PC's sound again (owner 2026-11-08:
// "L/R não funcionam toda vez que um áudio passa"). The console captures the
// system output once (meterStore.js); on Windows that capture follows the
// device that was the default when it started, so a projector's HDMI or a
// mixer's USB coming on left it live but silent, and one that failed or
// ended stayed off until KERYX restarted. Now it starts again: after a
// failure, a capture that never answered or one that ended, on this backoff;
// at once (from the first step) when the devices change or the PC wakes.
// Pure, so node --test checks it.
export const RETRY_MS = [2000, 5000, 15000, 30000, 60000];
export const START_TIMEOUT_MS = 10000;
// A timer that should tick every few seconds and saw this much pass: the PC slept.
export const WAKE_GAP_MS = 20000;
// Windows says "devicechange" several times for one change: one restart.
export const DEVICE_SETTLE_MS = 1000;

export const retryDelay = (attempt) => RETRY_MS[Math.max(0, Math.min(Math.floor(attempt) || 0, RETRY_MS.length - 1))];

export const wokeUp = (lastTick, now) => now - lastTick > WAKE_GAP_MS;
