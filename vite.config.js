import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { bundleBudget } from './scripts/bundle-budget.cjs'

// The browser preview (dev only): `npm run dev` mounts the real store and live
// engine on sample data (scripts/preview/server.cjs) so a plain browser —
// Claude's side panel included — runs the whole console. Never in a build;
// `npm run desktop:dev` turns it off (the app has its own store).
function keryxPreview() {
  let api = null;
  return {
    name: 'keryx-preview',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.KERYX_NO_PREVIEW === '1') return;
      // Loaded at run time (Vite bundles this config; the server is CommonJS).
      const loadCjs = createRequire(import.meta.url);
      const { createPreviewServer } = loadCjs('./scripts/preview/server.cjs');
      api = await createPreviewServer({ log: (m) => server.config.logger.warn(m) });
      server.config.logger.info(`  keryx preview: sample data in ${api.dataDir}`);
      server.middlewares.use((req, res, next) => { api.middleware(req, res, next); });
      server.httpServer?.once('close', () => api?.close());
    },
  };
}

// pdf.js's data files (character maps, standard fonts, image decoders,
// colour profiles) at /pdfjs/: served by the dev server and copied into the
// build, so the console reads any PDF offline (src/lib/pdfPagesCapture.js),
// never from a CDN. The script sandbox (quickjs) is left out: PDFs are only
// drawn, their scripts never run.
function pdfjsAssets() {
  const root = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));
  const DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
  const files = (dir) => fs.readdirSync(path.join(root, dir)).filter((name) => !name.startsWith('quickjs'));
  return {
    name: 'keryx-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const [dir, name, extra] = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '').split('/');
        if (!DIRS.includes(dir) || !name || extra !== undefined || !files(dir).includes(name)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        fs.createReadStream(path.join(root, dir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of DIRS) {
        for (const name of files(dir)) this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${name}`, source: fs.readFileSync(path.join(root, dir, name)) });
      }
    },
  };
}

// The phone remote is a browser page on the church LAN, not a PWA yet: HTTP
// cannot install it or run a service worker. It still needs one stable icon
// for Android's "Adicionar à tela inicial" and iOS's home-screen shortcut.
// The source is the same 512 px icon packaged with the Windows application.
function remoteInstallAssets() {
  const icon = fileURLToPath(new URL('./build/icon.png', import.meta.url));
  const url = '/icons/keryx-512.png';
  const send = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(icon).on('error', next).pipe(res);
  };
  return {
    name: 'keryx-remote-install-assets',
    configureServer(server) { server.middlewares.use(url, send); },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'icons/keryx-512.png', source: fs.readFileSync(icon) });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // bundleBudget: the outputs' JS within budget, every stylesheet in the
  // entry (scripts/bundle-budget.cjs); a build past it fails.
  plugins: [react(), keryxPreview(), pdfjsAssets(), remoteInstallAssets(), bundleBudget()],
  // The side-panel preview passes a free port in PORT (.claude/launch.json,
  // autoPort); without it Vite keeps its default.
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : {},
  resolve: {
    alias: {
      // The Base44 vite plugin used to provide this alias; jsconfig.json
      // mirrors it for the editor.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Modules the Electron main process uses too (shared/live-state.mjs).
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      // The design system (tokens, kx- components, icons) the console is built on.
      '@ds': fileURLToPath(new URL('./docs/design-system', import.meta.url)),
    },
  },
});
