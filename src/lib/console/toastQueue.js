// The console's toast (useToast in useConsole.js): one line at a time. A
// toast with an action — Desfazer after Esc or Encerrar — is the one way
// back, so (design audit C-13, WCAG 2.2.1) a plain toast said meanwhile
// waits behind it instead of replacing it, and its time stands still while
// the pointer or the focus is on it (the hook pauses the timer).
//   state: { cur: { id, text, action, ms } | null, queue: [toast…] }

// How long one shows: 3 s; 6 s for a long one (how to send a PowerPoint
// as PDF); 8 s with an action, so there is time to reach it.
export const toastMs = (text, action) => (action ? 8000 : String(text).length > 80 ? 6000 : 3000);
// Plain toasts waiting behind an action: the last few, the oldest dropped.
export const TOAST_QUEUE = 3;

export const emptyToasts = { cur: null, queue: [] };

// A new toast. A plain one over an action toast queues; anything else takes
// the place (the newest action wins: Esc twice keeps the latest Desfazer).
export function pushToast(state, toast) {
    const s = state || emptyToasts;
    const t = { ...toast, ms: toast.ms ?? toastMs(toast.text, toast.action) };
    if (s.cur?.action && !t.action) return { cur: s.cur, queue: [...s.queue, t].slice(-TOAST_QUEUE) };
    return { cur: t, queue: s.queue };
}

// The one showing is done (its time is up, or its action ran): the next
// waiting one shows.
export function nextToast(state) {
    const s = state || emptyToasts;
    const [cur = null, ...queue] = s.queue;
    return { cur, queue };
}
