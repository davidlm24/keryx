import { createContext, useContext } from "react";

// The background library (BackgroundLibrary.jsx) as one call, for every
// picker of a background or a theme (Camadas, the song editor, themes, the
// planner…): the console holds the window and answers
//   pick({ accept, value, title, allowNone, noneLabel })
//     accept: the kinds offered (["image", "video", "generator", "color"]),
//             or "theme" to choose a theme
//     value:  the current background (a spec, backgroundSpec.js) or theme id
//   -> Promise of { spec } (a background), { theme } (a theme row),
//      { none: true } ("Sem fundo") or null (closed without choosing).
export const LibraryContext = createContext(null);
const nothing = async () => null;
export const useLibraryPicker = () => useContext(LibraryContext) || nothing;

export const ALL_KINDS = ["image", "video", "generator", "color"];
