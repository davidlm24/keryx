// The ARIA tabs pattern for the console's tab lists (audit A11Y-18, C-60):
// one Tab stop per list (the chosen tab; the others tabIndex -1, "roving"),
// ←/→ the previous / next tab, wrapping, Home / End the first / last; the
// tab reached is chosen at once (they only change what a panel shows).
// keys.js leaves a focused tab list its arrows; ↑/↓ stay nothing there.
// -> the index to move to, or null (not a key of the pattern).
export function tabStep(at, count, key) {
    if (!(count > 0) || at < 0 || at >= count) return null;
    if (key === "ArrowRight") return (at + 1) % count;
    if (key === "ArrowLeft") return (at - 1 + count) % count;
    if (key === "Home") return 0;
    if (key === "End") return count - 1;
    return null;
}

// The tab that takes the Tab stop: the chosen one, else the first.
export const tabStop = (index, chosen, anyChosen) => (chosen || (!anyChosen && index === 0) ? 0 : -1);
