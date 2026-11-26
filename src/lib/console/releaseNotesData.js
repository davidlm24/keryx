// Every docs/release-notes/<versão>.md, bundled into the app at build time
// (no download, works offline), keyed by version; and their pictures
// (docs/release-notes/img/, owner 2026-11-26), keyed by file name, as the
// built files' urls.
import { notesByVersion, imagesByName } from "./releaseNotes.js";

export const RELEASE_NOTES = notesByVersion(import.meta.glob("../../../docs/release-notes/*.md", { query: "?raw", import: "default", eager: true }));
export const RELEASE_IMAGES = imagesByName(import.meta.glob("../../../docs/release-notes/img/*.{png,jpg,webp}", { query: "?url", import: "default", eager: true }));
