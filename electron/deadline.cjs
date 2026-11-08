// A request to the internet within a deadline (the 0.2.19 audit): a
// connection that never completes left "Instalar" or the lyrics search
// waiting for ever. `work(signal)` does the whole job — the request and its
// body — and gets the signal that stops a real fetch; the race also ends one
// that ignores it. Rejects with a TimeoutError (name "TimeoutError") when
// `ms` pass first.
class TimeoutError extends Error {
    constructor() {
        super("timeout");
        this.name = "TimeoutError";
    }
}

function withDeadline(work, ms) {
    const ctrl = new AbortController();
    let timer;
    const late = new Promise((_, reject) => {
        timer = setTimeout(() => {
            ctrl.abort();
            reject(new TimeoutError());
        }, ms);
    });
    return Promise.race([Promise.resolve().then(() => work(ctrl.signal)), late]).finally(() => clearTimeout(timer));
}

module.exports = { withDeadline, TimeoutError };
