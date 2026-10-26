// The names the sync uses and the few rules every adapter shares
// (index.cjs describes the interface).

// A computer's id (its folder's name, where there are folders: Drive para
// computador may add " (1)" to a copy of it).
const PC_DIR = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// The changes object's name for a computer and a number, and back; with
// `hi`, the object compaction made of the numbers seq..hi (sync.cjs),
// "changes/<pc>/000001-000040.jsonl". parseChanges -> { pc, seq, hi, range }
// (hi = seq for a single one).
const pad = (n) => String(n).padStart(6, "0");
const changesName = (pc, seq, hi = null) => `changes/${String(pc).toLowerCase()}/${pad(seq)}${hi != null ? `-${pad(hi)}` : ""}.jsonl`;
const CHANGES = /^changes\/([0-9a-f-]{36})\/(\d+)(?:-(\d+))?\.jsonl$/;
function parseChanges(name) {
    const m = CHANGES.exec(String(name));
    if (!m) return null;
    const seq = Number(m[2]);
    const hi = m[3] != null ? Number(m[3]) : seq;
    return hi >= seq ? { pc: m[1], seq, hi, range: m[3] != null } : null;
}

// The object of a name that counts when there are several: the first made.
const byAge = (a, b) => (a.created - b.created) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const oldestOf = (list) => [...list].sort(byAge)[0] || null;

// putIfAbsent where the service has no "only if absent" (Drive): make it,
// then look; when an older object of the name is there, this one goes. Two
// computers that both list before the other's object shows both think they
// won; readers take the oldest (oldestOf), so the other one sees "outro
// código" and types the code that stayed — what the folder did with a
// conflict copy.
async function firstWins(store, name, bytes) {
    const mine = await store.putNew(name, bytes);
    const all = (await store.list(name)).filter((o) => o.name === name);
    if (!all.some((o) => o.id === mine.id)) all.push(mine);
    if (oldestOf(all).id === mine.id) return true;
    await store.remove(mine.id);
    return false;
}

module.exports = { PC_DIR, changesName, parseChanges, oldestOf, byAge, firstWins };
