// The church's name and city (Configurações › Igreja, on the profile), as
// they show beyond Configurações: the window and tab titles, the Tela do
// pastor, the network start page, the service PDF, Relatórios. Pure.

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// "Igreja X · Cidade", either part alone, or "".
export const churchLine = (name, city) => [clean(name), clean(city)].filter(Boolean).join(" · ");

// The window's (or the browser tab's) title: the console is the church's
// KERYX; a screen on the network says which screen it is, and where.
//   screen: that page's name (Palco, Tela do pastor, ...) or "" for the console.
export function windowTitle({ name = "", screen = "" } = {}) {
    const church = clean(name);
    if (screen) return `${screen} · ${church || "KERYX"}`;
    return church ? `${church} · KERYX` : "KERYX";
}
