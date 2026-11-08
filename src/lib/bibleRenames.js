// Editions that left the list, read as the one that took their place (the
// King James Fiel 1611 was only ever online, from a source that closed).
// Apart from bibleBooks.js so the church's preferences (src/lib/prefs/schema.js,
// in every window's first load) read a saved edition without the 66 books:
// the outputs' JS has a budget (scripts/bundle-budget.cjs).
const RENAMED = { BKJ1611: "KJA" };
export const renamedVersion = (id) => RENAMED[id] || id;
export const RETIRED_VERSIONS = Object.keys(RENAMED);
