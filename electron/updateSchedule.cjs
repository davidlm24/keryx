// When the updater looks for a new version by itself (main.cjs): shortly after
// launch, every few hours for a PC left on, again soon after a failed check
// (a PC that boots before its network comes up fails the first one with
// ERR_NAME_NOT_RESOLVED and would otherwise wait the whole interval), and
// again when the PC wakes. It only finds out; the bell tells, and nothing is
// downloaded or installed here. Pure Node: tested.

const REGULAR_MS = 6 * 60 * 60 * 1000;
// After a failed check, then the last step again and again until one works.
const RETRY_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];
// The network takes a moment to come back after a wake.
const RESUME_MS = 15 * 1000;

function createCheckSchedule({ updater, firstMs, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let timer = null;
    let failures = 0;
    let stopped = false;

    const arm = (ms) => {
        if (stopped) return;
        clearTimer(timer);
        timer = setTimer(run, ms);
        if (timer && typeof timer.unref === "function") timer.unref();
    };

    async function run() {
        let status = "none";
        try {
            status = (await updater.check()).status;
        } catch {
            status = "error";
        }
        if (status === "error") {
            arm(RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]);
            failures += 1;
        } else {
            failures = 0;
            arm(REGULAR_MS);
        }
    }

    return {
        start: () => arm(firstMs),
        // The PC woke up: look again soon, unless a download is under way or done.
        resume() {
            const status = updater.state().status;
            if (status === "downloading" || status === "downloaded") return;
            arm(RESUME_MS);
        },
        stop() {
            stopped = true;
            clearTimer(timer);
        },
    };
}

module.exports = { createCheckSchedule, REGULAR_MS, RETRY_MS, RESUME_MS };
