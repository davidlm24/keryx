import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), keryxPreview()],
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
