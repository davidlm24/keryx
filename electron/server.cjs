// Serves the built web app (dist/) and the media library on loopback, so
// every window loads from a real http origin: BrowserRouter, localStorage and
// window.open behave as in a browser, which `file://` would not give us.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".pdf": "application/pdf",
    ".map": "application/json",
    // pdf.js's image decoders (dist/pdfjs/wasm, src/lib/pdfPagesCapture.js).
    ".wasm": "application/wasm",
};

const MEDIA_PREFIX = "/media/";
// Files shipped with the app (backgrounds, default logo) live under the media
// URL space too, so the database can reference them the same way.
const BUNDLED_PREFIX = "/media/bundled/";

// Resolve `pathname` inside `dir`, refusing anything that escapes it.
function within(dir, pathname) {
    const resolved = path.resolve(dir, "." + pathname);
    return resolved === dir || resolved.startsWith(dir + path.sep) ? resolved : null;
}

function sendFile(req, res, file, stat, headers) {
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    const base = { "Content-Type": type, "Accept-Ranges": "bytes", ...headers };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");

    // Videos seek with Range requests; without 206 support they can't scrub.
    if (range && (range[1] || range[2])) {
        let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
        let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
        start = Math.max(0, start);
        end = Math.min(end, stat.size - 1);
        if (start > end) {
            res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
            return;
        }
        res.writeHead(206, { ...base, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1 });
        if (req.method === "HEAD") res.end();
        else fs.createReadStream(file, { start, end }).pipe(res);
        return;
    }

    res.writeHead(200, { ...base, "Content-Length": stat.size });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
}

function startStaticServer({ root, mediaDir, bundledDir, host, port }) {
    const rootDir = path.resolve(root);
    const media = mediaDir ? path.resolve(mediaDir) : null;
    const bundled = bundledDir ? path.resolve(bundledDir) : null;

    const server = http.createServer((req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405, { Allow: "GET, HEAD" }).end();
            return;
        }

        let pathname;
        try {
            pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        } catch {
            res.writeHead(400).end();
            return;
        }

        if (media && pathname.startsWith(MEDIA_PREFIX)) {
            const file = bundled && pathname.startsWith(BUNDLED_PREFIX)
                ? within(bundled, pathname.slice(BUNDLED_PREFIX.length - 1))
                : within(media, pathname.slice(MEDIA_PREFIX.length - 1));
            if (!file) {
                res.writeHead(403).end();
                return;
            }
            fs.stat(file, (err, stat) => {
                if (err || !stat.isFile()) {
                    res.writeHead(404).end();
                    return;
                }
                // Readable from the Vite dev origin too, and by canvas exports.
                sendFile(req, res, file, stat, {
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Access-Control-Allow-Origin": "*",
                });
            });
            return;
        }

        const resolved = within(rootDir, pathname);
        if (!resolved) {
            res.writeHead(403).end();
            return;
        }
        fs.stat(resolved, (err, stat) => {
            if (!err && stat.isFile()) {
                sendFile(req, res, resolved, stat, {
                    "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
                });
                return;
            }
            if (path.extname(pathname)) {
                // A missing asset is a 404, not the app shell.
                res.writeHead(404).end();
                return;
            }
            // Client-side route (/Console, /Projection, ...): hand it to the SPA.
            const index = path.join(rootDir, "index.html");
            fs.stat(index, (indexErr, indexStat) => {
                if (indexErr) res.writeHead(404).end();
                else sendFile(req, res, index, indexStat, { "Cache-Control": "no-cache" });
            });
        });
    });

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve({ server, url: `http://${host}:${server.address().port}` });
        });
    });
}

module.exports = { startStaticServer, MEDIA_PREFIX, BUNDLED_PREFIX, MIME, within, sendFile };
