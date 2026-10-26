// The `drive` adapter (index.cjs): Google Drive spoken to directly, over its
// REST API with fetch (no googleapis package), in the account's
// appDataFolder only — the app's hidden folder, which no person sees in
// their Drive and no other app reads (scope drive.appdata, googleAuth.cjs).
//
//   - an object is one Drive file; its name is the engine's name as is
//     ("changes/<pc>/000012.jsonl": Drive names may hold slashes), its
//     props are the file's appProperties; names are not unique on Drive
//     either, which the engine already copes with;
//   - what is there is kept as an index in memory: one full listing when
//     the adapter first lists, then Drive's changes feed (changes.list in
//     appDataFolder, from the page token saved after each catch-up), at
//     most once every `freshMs` — the engine's few listings in a pass cost
//     one call, not a listing of everything each. What this computer writes
//     or removes goes into the index at once;
//   - putNew is a multipart create; putWhole updates the oldest file of the
//     name and removes the others (as fakeDrive does); putIfAbsent is
//     firstWins (rules.cjs);
//   - media goes up with Drive's resumable protocol (8 MB chunks; a cut
//     goes on from what Drive says it has, while the session lives, in
//     this run) and comes down by Range into the engine's `.partial` file,
//     which an `.id` beside it ties to the file it came from (another file:
//     it starts over);
//   - 429, 5xx and Drive's rate-limit 403s are tried again, waiting what
//     Retry-After says or 1, 2, 4… s (at most 32); a 401 refreshes the
//     access token once; no answer at all is code "offline", a full account
//     "quota", a sign-in Google refuses "auth" (from googleAuth).
//
// auth: { accessToken() -> Promise<string>, invalidate() } (googleAuth.cjs).

const fs = require("node:fs");
const crypto = require("node:crypto");
const { oldestOf, firstWins } = require("./rules.cjs");

const fsp = fs.promises;

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FIELDS = "id,name,size,createdTime,modifiedTime,appProperties";
// A resumable chunk: a multiple of 256 KiB, as Drive asks.
const CHUNK = 8 * 1024 * 1024;
const TRIES = 5;
const MAX_WAIT_MS = 32 * 1000;
const META_MS = 30 * 1000;
// A transfer may take long; it fails when nothing moves for this long.
const IDLE_MS = 2 * 60 * 1000;
const FRESH_MS = 2000;
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

const fail = (message, code, status) => Object.assign(new Error(message), { code, status });
const offline = () => fail("O Google Drive não respondeu.", "offline");

const metaOf = (f) => ({
    id: f.id,
    name: f.name,
    size: f.size != null ? Number(f.size) : 0,
    created: Date.parse(f.createdTime) || 0,
    modified: Date.parse(f.modifiedTime) || 0,
    props: { ...(f.appProperties || {}) },
});
const copy = (m) => ({ ...m, props: { ...m.props } });

// Retry-After in seconds or as a date, in ms (null: none).
function retryAfter(res, now) {
    const v = res.headers.get("retry-after");
    if (!v) return null;
    if (/^\d+$/.test(v.trim())) return Number(v) * 1000;
    const at = Date.parse(v);
    return Number.isFinite(at) ? Math.max(0, at - now()) : null;
}

async function bodyOf(res) {
    try {
        return await res.clone().json();
    } catch {
        return null;
    }
}
const reasonOf = (body) => body?.error?.errors?.[0]?.reason || body?.error?.status || null;
const drain = (res) => res.arrayBuffer().catch(() => {});

// "bytes=0-524287" -> 524288 (what Drive has of a resumable upload).
function rangeEnd(range) {
    const m = /bytes=0-(\d+)/.exec(String(range || ""));
    return m ? Number(m[1]) + 1 : 0;
}

// An AbortSignal that fires after `ms` without a call to touch().
function idleSignal(ms) {
    const ctl = new AbortController();
    let timer = null;
    const touch = () => {
        clearTimeout(timer);
        timer = setTimeout(() => ctl.abort(new Error("sem resposta")), ms);
        timer.unref?.();
    };
    touch();
    return { signal: ctl.signal, touch, done: () => clearTimeout(timer) };
}

function createDriveStore({
    auth, fetchImpl = fetch, key = "drive", where = "Google Drive", api = API, upload: uploadUrl = UPLOAD,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), freshMs = FRESH_MS, chunk = CHUNK,
    tries = TRIES, idleMs = IDLE_MS,
}) {
    let index = null; // Map id -> meta
    let pageToken = null;
    let freshAt = 0;
    let catching = null;
    // Resumable sessions by (name, file, size, mtime): Drive keeps one a week.
    const sessions = new Map();

    async function driveError(res) {
        const body = await bodyOf(res);
        const reason = reasonOf(body);
        await drain(res);
        if (reason === "storageQuotaExceeded") return fail("A conta do Google Drive da igreja está cheia.", "quota", res.status);
        if (res.status === 401) return fail("O Google Drive não aceitou a entrada. Entre de novo com a conta da igreja.", "auth", res.status);
        return fail(`O Google Drive respondeu ${res.status}${reason ? ` (${reason})` : ""}.`, "drive", res.status);
    }

    // One request, with the access token; tried again on 429/5xx/rate
    // limits (Retry-After honoured) and once after a 401 with a new token.
    // `signal`: the caller's (a transfer's idle timer), else META_MS.
    async function call(url, init = {}, { signal = null, retry = true } = {}) {
        let renewed = false;
        for (let attempt = 0; ; attempt += 1) {
            const headers = { ...(init.headers || {}), Authorization: `Bearer ${await auth.accessToken()}` };
            let res;
            try {
                res = await fetchImpl(url, { ...init, headers, signal: signal || AbortSignal.timeout(META_MS) });
            } catch {
                if (retry && attempt === 0 && !signal) {
                    await sleep(1000);
                    continue;
                }
                throw offline();
            }
            if (res.status === 401 && !renewed) {
                renewed = true;
                auth.invalidate();
                await drain(res);
                continue;
            }
            let again = res.status === 429 || res.status >= 500;
            if (res.status === 403) again = RATE_REASONS.has(reasonOf(await bodyOf(res)));
            if (!again || !retry || attempt >= tries - 1) return res;
            const wait = retryAfter(res, now) ?? (1000 * 2 ** attempt + Math.floor(Math.random() * 250));
            await drain(res);
            await sleep(Math.min(MAX_WAIT_MS, wait));
        }
    }

    async function json(url, init) {
        const res = await call(url, init);
        if (!res.ok) throw await driveError(res);
        return res.json();
    }

    // -- What is there ---------------------------------------------------------

    async function listAll() {
        const { startPageToken } = await json(`${api}/changes/startPageToken`);
        const next = new Map();
        let page = null;
        do {
            const q = new URLSearchParams({ spaces: "appDataFolder", q: "trashed = false", fields: `nextPageToken,files(${FIELDS})`, pageSize: "1000" });
            if (page) q.set("pageToken", page);
            const body = await json(`${api}/files?${q}`);
            for (const f of body.files || []) next.set(f.id, metaOf(f));
            page = body.nextPageToken || null;
        } while (page);
        index = next;
        pageToken = startPageToken;
    }

    // Drive's changes since the last catch-up; a token Drive no longer
    // takes starts over with a full listing.
    async function catchUp() {
        let page = pageToken;
        for (;;) {
            const q = new URLSearchParams({
                pageToken: page, spaces: "appDataFolder", includeRemoved: "true", pageSize: "1000",
                fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FIELDS},trashed))`,
            });
            const res = await call(`${api}/changes?${q}`);
            if ([400, 404, 410].includes(res.status)) {
                await drain(res);
                await listAll();
                return;
            }
            if (!res.ok) throw await driveError(res);
            const body = await res.json();
            for (const c of body.changes || []) {
                if (c.removed || !c.file || c.file.trashed) index.delete(c.fileId);
                else index.set(c.fileId, metaOf(c.file));
            }
            if (body.nextPageToken) page = body.nextPageToken;
            else {
                pageToken = body.newStartPageToken || page;
                return;
            }
        }
    }

    async function refresh() {
        if (index && now() - freshAt < freshMs) return;
        if (!catching) {
            catching = (async () => {
                if (!index) await listAll();
                else await catchUp();
                freshAt = now();
            })().finally(() => { catching = null; });
        }
        await catching;
    }

    async function list(prefix = "") {
        await refresh();
        const p = String(prefix);
        return [...index.values()].filter((o) => o.name.startsWith(p)).map(copy);
    }

    const known = (meta) => {
        if (index) index.set(meta.id, meta);
        return copy(meta);
    };
    const forget = (id) => index?.delete(id);

    async function stat(id) {
        const res = await call(`${api}/files/${encodeURIComponent(id)}?fields=${FIELDS},trashed`);
        if (res.status === 404) {
            await drain(res);
            forget(id);
            return null;
        }
        if (!res.ok) throw await driveError(res);
        const f = await res.json();
        if (f.trashed) return null;
        const m = metaOf(f);
        return { size: m.size, created: m.created, modified: m.modified };
    }

    async function read(id) {
        const res = await call(`${api}/files/${encodeURIComponent(id)}?alt=media`);
        if (res.status === 404) {
            await drain(res);
            forget(id);
            return null;
        }
        if (!res.ok) throw await driveError(res);
        return Buffer.from(await res.arrayBuffer());
    }

    // -- Writes ----------------------------------------------------------------

    function multipart(meta, bytes) {
        const boundary = `keryx-${crypto.randomBytes(12).toString("hex")}`;
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
            Buffer.from(bytes),
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        return { body, type: `multipart/related; boundary=${boundary}` };
    }

    async function create(name, bytes, props) {
        const meta = { name: String(name), parents: ["appDataFolder"] };
        const appProperties = Object.fromEntries(Object.entries(props || {}).map(([k, v]) => [k, String(v)]));
        if (Object.keys(appProperties).length) meta.appProperties = appProperties;
        const { body, type } = multipart(meta, bytes);
        return known(metaOf(await json(`${uploadUrl}/files?uploadType=multipart&fields=${FIELDS}`, { method: "POST", headers: { "Content-Type": type }, body })));
    }

    const putNew = (name, bytes, props) => create(name, bytes, props);

    async function putWhole(name, bytes) {
        const same = (await list(name)).filter((o) => o.name === name);
        const keep = oldestOf(same);
        if (!keep) return create(name, bytes);
        const res = await call(`${uploadUrl}/files/${encodeURIComponent(keep.id)}?uploadType=media&fields=${FIELDS}`, {
            method: "PATCH", headers: { "Content-Type": "application/octet-stream" }, body: Buffer.from(bytes),
        });
        if (res.status === 404) {
            await drain(res);
            forget(keep.id);
            return create(name, bytes);
        }
        if (!res.ok) throw await driveError(res);
        const made = known(metaOf(await res.json()));
        for (const other of same) if (other.id !== keep.id) await remove(other.id);
        return made;
    }

    const putIfAbsent = (name, bytes) => firstWins(api0, name, bytes);

    async function remove(id) {
        const res = await call(`${api}/files/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404) throw await driveError(res);
        await drain(res);
        forget(id);
    }

    // -- Media -----------------------------------------------------------------

    // What Drive has of a session: { at } bytes, { done: meta }, or null (gone).
    async function sessionState(session, total) {
        const res = await call(session, { method: "PUT", headers: { "Content-Range": `bytes */${total}`, "Content-Length": "0" } });
        if (res.status === 308) {
            const at = rangeEnd(res.headers.get("range"));
            await drain(res);
            return { at };
        }
        if (res.ok) return { done: metaOf(await res.json()) };
        await drain(res);
        if (res.status === 404 || res.status === 410) return null;
        throw await driveError(res);
    }

    async function upload(name, fromFile) {
        const st = await fsp.stat(fromFile);
        const total = st.size;
        if (total === 0) return create(name, Buffer.alloc(0));
        const k = `${name}\u0000${fromFile}\u0000${total}\u0000${st.mtimeMs}`;
        let session = sessions.get(k) || null;
        let from = 0;
        if (session) {
            const was = await sessionState(session, total);
            if (was?.done) {
                sessions.delete(k);
                return known(was.done);
            }
            if (was) from = was.at;
            else {
                sessions.delete(k);
                session = null;
            }
        }
        if (!session) {
            const res = await call(`${uploadUrl}/files?uploadType=resumable&fields=${FIELDS}`, {
                method: "POST",
                headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(total) },
                body: JSON.stringify({ name: String(name), parents: ["appDataFolder"] }),
            });
            if (!res.ok) throw await driveError(res);
            session = res.headers.get("location");
            await drain(res);
            // The access token goes to this address with every chunk: only
            // Drive's own upload host.
            let sameHost = false;
            try {
                sameHost = new URL(session).origin === new URL(uploadUrl).origin;
            } catch { /* not a URL */ }
            if (!session || !sameHost) throw fail("O Google Drive não abriu o envio.", "drive");
            sessions.set(k, session);
        }
        const fh = await fsp.open(fromFile, "r");
        try {
            let stuck = 0;
            while (from < total) {
                const end = Math.min(total, from + chunk);
                const buf = Buffer.alloc(end - from);
                await fh.read(buf, 0, buf.length, from);
                const idle = idleSignal(idleMs);
                let res;
                try {
                    res = await call(session, { method: "PUT", headers: { "Content-Range": `bytes ${from}-${end - 1}/${total}` }, body: buf }, { signal: idle.signal, retry: false });
                } finally {
                    idle.done();
                }
                if (res.status === 308) {
                    const at = rangeEnd(res.headers.get("range"));
                    await drain(res);
                    // Drive taking nothing, chunk after chunk: next pass.
                    stuck = at > from ? 0 : stuck + 1;
                    if (stuck >= 3) throw fail("O Google Drive não está recebendo o arquivo.", "drive");
                    from = at;
                    continue;
                }
                if (res.ok) {
                    sessions.delete(k);
                    return known(metaOf(await res.json()));
                }
                if (res.status === 404 || res.status === 410) sessions.delete(k);
                // A 5xx: what Drive has is asked at the next try (the session stays).
                throw await driveError(res);
            }
            // Every byte sent and no file yet: Drive says what it made.
            const was = await sessionState(session, total);
            if (was?.done) {
                sessions.delete(k);
                return known(was.done);
            }
            throw fail("O envio ao Google Drive não terminou.", "drive");
        } finally {
            await fh.close();
        }
    }

    // Into toFile, going on from what it holds when its `.id` names this file.
    async function download(id, toFile) {
        const tag = `${toFile}.id`;
        let have = 0;
        try {
            const st = await fsp.stat(toFile);
            if ((await fsp.readFile(tag, "utf8")).trim() === id) have = st.size;
        } catch { /* nothing kept */ }
        if (!have) {
            await fsp.writeFile(toFile, Buffer.alloc(0));
            await fsp.writeFile(tag, id);
        }
        const idle = idleSignal(idleMs);
        try {
            const res = await call(`${api}/files/${encodeURIComponent(id)}?alt=media`, { headers: have ? { Range: `bytes=${have}-` } : {} }, { signal: idle.signal });
            if (res.status === 404) {
                await drain(res);
                throw fail("o arquivo não está mais no Drive", "gone");
            }
            // Asked past its end: the file here is already whole.
            if (res.status === 416) {
                await drain(res);
                await fsp.rm(tag, { force: true });
                return;
            }
            if (!res.ok) throw await driveError(res);
            const fh = await fsp.open(toFile, res.status === 206 ? "a" : "w");
            try {
                for await (const part of res.body) {
                    idle.touch();
                    await fh.write(part);
                }
            } catch {
                throw fail("download interrompido", "cut");
            } finally {
                await fh.close();
            }
            await fsp.rm(tag, { force: true });
        } finally {
            idle.done();
        }
    }

    // Signed in and Drive answers. A sign-in Google refuses is thrown (code
    // "auth" or "config"), so the engine says so instead of "offline".
    async function available() {
        try {
            await auth.accessToken();
            await refresh();
            return true;
        } catch (err) {
            if (err && (err.code === "auth" || err.code === "config")) throw err;
            return false;
        }
    }

    // The account and its space, for Configurações (not part of the seam).
    async function about() {
        const body = await json(`${api}/about?fields=${encodeURIComponent("user(emailAddress),storageQuota(limit,usage)")}`);
        const q = body.storageQuota || {};
        return {
            email: body.user?.emailAddress || null,
            used: q.usage != null ? Number(q.usage) : null,
            // No limit: an account without one (some Workspace plans).
            total: q.limit != null ? Number(q.limit) : null,
        };
    }

    const api0 = { kind: "drive", where, key, available, list, stat, read, putNew, putWhole, putIfAbsent, remove, upload, download, about };
    return api0;
}

module.exports = { createDriveStore, CHUNK };
