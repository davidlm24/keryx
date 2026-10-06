// Serves the built web app (dist/) on loopback so every window loads it from
// a real http origin. BrowserRouter, localStorage and window.open all behave
// as they do in a browser, which `file://` would not give us.

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
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".map": "application/json",
};

function startStaticServer({ root, host, port }) {
    const rootDir = path.resolve(root);

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

        const resolved = path.resolve(rootDir, "." + pathname);
        if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
            res.writeHead(403).end();
            return;
        }

        const serve = (file, immutable) => {
            fs.readFile(file, (err, data) => {
                if (err) {
                    res.writeHead(404).end();
                    return;
                }
                res.writeHead(200, {
                    "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
                    "Content-Length": data.length,
                    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
                });
                res.end(req.method === "HEAD" ? undefined : data);
            });
        };

        fs.stat(resolved, (err, stat) => {
            if (!err && stat.isFile()) {
                serve(resolved, pathname.startsWith("/assets/"));
            } else if (path.extname(pathname)) {
                // A missing asset is a 404, not the app shell.
                res.writeHead(404).end();
            } else {
                // Client-side route (/Home, /Bible, ...): hand it to the SPA.
                serve(path.join(rootDir, "index.html"), false);
            }
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

module.exports = { startStaticServer };
