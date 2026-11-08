// A live state that starts empty (a new install, a lost live.json) takes the
// church's own logo look and idle screen from the profile (Configurações ›
// Igreja and Aparência) and the Tela ociosa's look (Editor de telas), so the
// first screens already look like the church.
// Pure: -> the [op, args] to apply, in order.

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const SIZES = ["small", "medium", "large"];
const IDLE = ["logo", "black"];

function seedOps(user) {
    const ops = [];
    const logo = {};
    if (CORNERS.includes(user?.logo_corner)) logo.corner = user.logo_corner;
    if (SIZES.includes(user?.logo_size)) logo.size = user.logo_size;
    const opacity = Number(user?.logo_opacity);
    if (user?.logo_opacity != null && Number.isFinite(opacity) && opacity >= 0.2 && opacity < 1) logo.opacity = opacity;
    const width = Number(user?.logo_width);
    if (user?.logo_width != null && Number.isFinite(width) && width >= 4 && width <= 30) logo.width = Math.round(width);
    const margin = Number(user?.logo_margin);
    if (user?.logo_margin != null && Number.isFinite(margin) && margin >= 1 && margin <= 10 && margin !== 3) logo.margin = margin;
    if (Object.keys(logo).length) ops.push(["logo.set", logo]);
    // A background idle screen needs its picture: the church's standby one.
    if (user?.idle_mode === "background" && user?.standby_background) ops.push(["idle.set", { mode: "background", url: user.standby_background }]);
    else if (IDLE.includes(user?.idle_mode) && user.idle_mode !== "logo") ops.push(["idle.set", { mode: user.idle_mode }]);
    // The Tela ociosa's look (shared/idleLook.mjs), last: the live rules check
    // it, and a broken saved look only loses itself. "Nome da igreja" takes
    // the church's name, as the console writes it.
    const look = user?.idle_look;
    if (look && typeof look === "object" && !Array.isArray(look)) {
        ops.push(["idle.look", { look: look.phrase === "church" ? { ...look, text: typeof user.church_name === "string" ? user.church_name : "" } : look }]);
    }
    return ops;
}

module.exports = { seedOps };
