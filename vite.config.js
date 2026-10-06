import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The Base44 vite plugin used to provide this alias; jsconfig.json
      // mirrors it for the editor.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Modules the Electron main process uses too (shared/live-state.mjs).
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
});
