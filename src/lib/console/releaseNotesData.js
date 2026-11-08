// Every docs/release-notes/<versão>.md, bundled into the app at build time
// (no download, works offline), keyed by version.
import { notesByVersion } from "./releaseNotes.js";

export const RELEASE_NOTES = notesByVersion(import.meta.glob("../../../docs/release-notes/*.md", { query: "?raw", import: "default", eager: true }));
