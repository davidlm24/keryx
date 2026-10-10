// The church's default look for projected text (Configurações › Aparência,
// stored on User): the transition between slides and its length. Stamped
// into each item's style when it goes on air, so every output (windows and
// network screens) gets it through the live state; an item's own choice
// (Camadas) wins.

export const TRANSITIONS = [["fade", "Esmaecer"], ["slide", "Deslizar"], ["cut", "Corte"]];
export const TRANSITION_MS = [120, 600];
const KINDS = TRANSITIONS.map(([v]) => v);

// The defaults a User row asks for; null where it asks for nothing.
export function lookDefaults(user) {
    const transition = KINDS.includes(user?.transition_type) ? user.transition_type : null;
    const ms = Number(user?.transition_ms);
    const [lo, hi] = TRANSITION_MS;
    return { transition, transition_ms: Number.isFinite(ms) && ms > 0 ? Math.round(Math.min(hi, Math.max(lo, ms))) : null };
}

// content.show's arguments with the defaults filled in where the item has none.
export function withLookDefaults(op, args, defaults) {
    if (op !== "content.show" || !args || !defaults) return args;
    const style = { ...(args.style || {}) };
    if (!style.transition && defaults.transition) style.transition = defaults.transition;
    if (style.transition_ms == null && defaults.transition_ms) style.transition_ms = defaults.transition_ms;
    return { ...args, style };
}
