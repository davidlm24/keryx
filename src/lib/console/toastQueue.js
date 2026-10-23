// The console's toast (useToast in useConsole.js): one line at a time. A
// toast with an action — Desfazer after Esc or Encerrar — is the one way
// back, so (design audit C-13, WCAG 2.2.1) a plain toast said meanwhile
// waits behind it instead of replacing it, and its time stands still while
// the pointer or the focus is on it (the hook pauses the timer).
//   state: { cur: { id, text, action, ms } | null, queue: [toast…] }

// How long one shows: 3 s; 6 s for a long one (how to send a PowerPoint
// as PDF); 8 s with an action, so there is time to reach it.
export const toastMs = (text, action, important) => {
    const ms = action ? 8000 : String(text).length > 80 ? 6000 : 3000;
    return important ? Math.max(ms, IMPORTANT_MS) : ms;
};
// An important toast (a new pedido, a screen lost) shows at least this long.
export const IMPORTANT_MS = 6000;
// Plain toasts waiting behind an action: the last few, the oldest dropped.
export const TOAST_QUEUE = 3;

export const emptyToasts = { cur: null, queue: [] };

// A new toast. A plain one over an action toast queues; anything else takes
// the place (the newest action wins: Esc twice keeps the latest Desfazer),
// and so does one marked `replace` (the answer to that action's question).
export function pushToast(state, toast) {
    const s = state || emptyToasts;
    const t = { ...toast, ms: toast.ms ?? toastMs(toast.text, toast.action, toast.important) };
    // An important toast is kept like an action one: a plain toast never
    // swallows it (a plain one queues behind it).
    const keeps = s.cur?.action || s.cur?.important;
    if (keeps && !t.action && !t.important && !t.replace) return { cur: s.cur, queue: [...s.queue, t].slice(-TOAST_QUEUE) };
    return { cur: t, queue: s.queue };
}

// The one showing goes now, if it says `text` (the Setlist automática's
// countdown, overtaken by a send); anything else stays.
export function dropToast(state, text) {
    const s = state || emptyToasts;
    return s.cur && s.cur.text === text ? nextToast(s) : s;
}

// The one showing is done (its time is up, or its action ran): the next
// waiting one shows.
export function nextToast(state) {
    const s = state || emptyToasts;
    const [cur = null, ...queue] = s.queue;
    return { cur, queue };
}
