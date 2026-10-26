// A fake Google Drive on 127.0.0.1 for the tests (never in the installer:
// electron/fixtures is left out of the build): the REST endpoints the Drive
// adapter (electron/syncStore/drive.cjs) uses — files, changes, about,
// multipart, media and resumable uploads — with Drive's wire format, its
// 308s and Range headers, and faults on demand (a status, a cut connection).
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");

function fakeDriveServer({ page = 2 } = {}) {
    const files = new Map();
    const changes = [];
    const sessions = new Map();
    const requests = [];
    const faults = [];
    let clock = Date.parse("2026-10-01T00:00:00Z");
    const stamp = () => new Date((clock += 1000)).toISOString();
    const srv = {
        files, requests, token: "acesso-1", page,
        cutUpload: null, // bytes of the next session PUT before the connection drops
        cutDownload: null, // bytes of the next media GET before it drops
        slowUpload: 0, // ms each resumable chunk takes to be answered (a slow line)
        // The next `times` requests matching get this answer instead.
        fault(match, status, { headers = {}, body = { error: { code: status } }, times = 1 } = {}) { faults.push({ match, status, headers, body, times }); },
    };
    const json = (f) => ({ id: f.id, name: f.name, size: String(f.bytes.length), createdTime: f.createdTime, modifiedTime: f.modifiedTime, appProperties: f.appProperties, trashed: false });
    const changed = (f, removed = false) => changes.push({ fileId: f.id, removed, file: removed ? null : json(f) });
    srv.add = (name, bytes, appProperties) => {
        const id = crypto.randomBytes(9).toString("base64url");
        const at = stamp();
        const f = { id, name, bytes: Buffer.from(bytes), appProperties: appProperties || undefined, createdTime: at, modifiedTime: at };
        files.set(id, f);
        changed(f);
        return f;
    };
    srv.drop = (id) => {
        const f = files.get(id);
        files.delete(id);
        if (f) changed(f, true);
    };
    srv.named = (name) => [...files.values()].filter((f) => f.name === name);

    const send = (res, status, body, headers = {}) => {
        const text = body == null ? "" : JSON.stringify(body);
        res.writeHead(status, { "Content-Type": "application/json", ...headers });
        res.end(text);
    };
    const readBody = (req) => new Promise((resolve) => {
        const parts = [];
        req.on("data", (d) => parts.push(d));
        req.on("end", () => resolve(Buffer.concat(parts)));
    });

    function multipart(type, body) {
        const boundary = /boundary=(.+)$/.exec(type)[1];
        const sep = Buffer.from(`--${boundary}`);
        const first = body.indexOf(sep);
        const second = body.indexOf(sep, first + sep.length);
        const last = body.indexOf(Buffer.from(`\r\n--${boundary}--`), second);
        const metaPart = body.subarray(first + sep.length, second).toString("utf8");
        const meta = JSON.parse(metaPart.slice(metaPart.indexOf("\r\n\r\n") + 4).trim());
        const mediaPart = body.subarray(second + sep.length, last);
        const at = mediaPart.indexOf(Buffer.from("\r\n\r\n"));
        return { meta, bytes: mediaPart.subarray(at + 4) };
    }

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");
        const p = url.pathname;
        requests.push({ method: req.method, path: p, query: Object.fromEntries(url.searchParams), headers: req.headers });
        const fault = faults.find((f) => f.times > 0 && f.match(req.method, p, url.searchParams));
        if (fault) {
            fault.times -= 1;
            await readBody(req);
            return send(res, fault.status, fault.body, fault.headers);
        }
        if (req.headers.authorization !== `Bearer ${srv.token}`) {
            await readBody(req);
            return send(res, 401, { error: { code: 401, status: "UNAUTHENTICATED" } });
        }
        if (p === "/drive/v3/changes/startPageToken") return send(res, 200, { startPageToken: String(changes.length) });
        if (p === "/drive/v3/files" && req.method === "GET") {
            assert.equal(url.searchParams.get("spaces"), "appDataFolder");
            const all = [...files.values()].sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
            const off = Number(url.searchParams.get("pageToken") || 0);
            const n = Math.min(Number(url.searchParams.get("pageSize") || 100), srv.page);
            const body = { files: all.slice(off, off + n).map(json) };
            if (off + n < all.length) body.nextPageToken = String(off + n);
            return send(res, 200, body);
        }
        if (p === "/drive/v3/changes") {
            assert.equal(url.searchParams.get("spaces"), "appDataFolder");
            const off = Number(url.searchParams.get("pageToken"));
            if (!(off >= 0 && off <= changes.length)) return send(res, 404, { error: { code: 404 } });
            const body = { changes: changes.slice(off, off + srv.page) };
            if (off + srv.page < changes.length) body.nextPageToken = String(off + srv.page);
            else body.newStartPageToken = String(changes.length);
            return send(res, 200, body);
        }
        if (p === "/drive/v3/about") return send(res, 200, { user: { emailAddress: "igreja@example.com" }, storageQuota: { limit: "16106127360", usage: "524288" } });
        let m = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
        if (m) {
            const f = files.get(decodeURIComponent(m[1]));
            if (req.method === "DELETE") {
                if (!f) return send(res, 404, { error: { code: 404 } });
                srv.drop(f.id);
                res.writeHead(204).end();
                return undefined;
            }
            if (!f) return send(res, 404, { error: { code: 404 } });
            if (url.searchParams.get("alt") !== "media") return send(res, 200, json(f));
            const range = /bytes=(\d+)-/.exec(req.headers.range || "");
            const from = range ? Number(range[1]) : 0;
            if (from >= f.bytes.length && range) return send(res, 416, { error: { code: 416 } });
            const slice = f.bytes.subarray(from);
            res.writeHead(range ? 206 : 200, { "Content-Type": "application/octet-stream", "Content-Length": String(slice.length) });
            if (srv.cutDownload != null) {
                const n = srv.cutDownload;
                srv.cutDownload = null;
                res.write(slice.subarray(0, n), () => setTimeout(() => res.destroy(), 10));
                return undefined;
            }
            res.end(slice);
            return undefined;
        }
        if (p === "/upload/drive/v3/files" && req.method === "POST") {
            const body = await readBody(req);
            const kind = url.searchParams.get("uploadType");
            if (kind === "multipart") {
                const { meta, bytes } = multipart(req.headers["content-type"], body);
                assert.deepEqual(meta.parents, ["appDataFolder"]);
                return send(res, 200, json(srv.add(meta.name, bytes, meta.appProperties)));
            }
            if (kind === "resumable") {
                const meta = JSON.parse(body.toString("utf8"));
                assert.deepEqual(meta.parents, ["appDataFolder"]);
                const sid = crypto.randomBytes(6).toString("hex");
                sessions.set(sid, { meta, total: Number(req.headers["x-upload-content-length"]), have: Buffer.alloc(0) });
                return send(res, 200, {}, { Location: `http://127.0.0.1:${server.address().port}/upload/session/${sid}` });
            }
        }
        m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(p);
        if (m && req.method === "PATCH") {
            const f = files.get(decodeURIComponent(m[1]));
            const body = await readBody(req);
            if (!f) return send(res, 404, { error: { code: 404 } });
            f.bytes = body;
            f.modifiedTime = stamp();
            changed(f);
            return send(res, 200, json(f));
        }
        m = /^\/upload\/session\/([0-9a-f]+)$/.exec(p);
        if (m && req.method === "PUT") {
            const s = sessions.get(m[1]);
            if (!s) {
                await readBody(req);
                return send(res, 404, { error: { code: 404 } });
            }
            const cr = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers["content-range"] || "");
            const answer = () => {
                if (s.have.length === s.total) {
                    if (!s.file) s.file = srv.add(s.meta.name, s.have, s.meta.appProperties);
                    return send(res, 200, json(s.file));
                }
                return send(res, 308, null, s.have.length ? { Range: `bytes=0-${s.have.length - 1}` } : {});
            };
            if (!cr) {
                await readBody(req);
                return answer();
            }
            let pos = Number(cr[1]);
            let got = 0;
            const cut = srv.cutUpload;
            srv.cutUpload = null;
            req.on("data", (d) => {
                // Bytes past what the session has are kept; overlap is skipped.
                const skip = Math.max(0, s.have.length - pos);
                if (skip < d.length) s.have = Buffer.concat([s.have, d.subarray(skip)]);
                pos += d.length;
                got += d.length;
                if (cut != null && got >= cut) req.socket.destroy();
            });
            req.on("end", () => setTimeout(answer, srv.slowUpload || 0));
            return undefined;
        }
        await readBody(req);
        return send(res, 400, { error: { code: 400, message: `não sei ${req.method} ${p}` } });
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
        const base = `http://127.0.0.1:${server.address().port}`;
        srv.api = `${base}/drive/v3`;
        srv.upload = `${base}/upload/drive/v3`;
        srv.close = () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
        srv.count = (method, p) => requests.filter((r) => r.method === method && r.path === p).length;
        resolve(srv);
    }));
}

module.exports = { fakeDriveServer };
