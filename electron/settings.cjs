// Small JSON settings file next to the database (%APPDATA%/KERYX/settings.json).
// Written atomically; a missing or corrupt file reads as empty rather than
// stopping the app from starting.

const fs = require("node:fs");

function createSettings(file, log = console.warn) {
    let data = {};
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
    } catch (err) {
        if (err.code !== "ENOENT") log(`[keryx-settings] ${file} ilegível, a usar os padrões: ${err.message}`);
    }

    function save() {
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, file);
    }

    return {
        get: (key, fallback) => (data[key] === undefined ? fallback : data[key]),
        set(key, value) {
            data = { ...data, [key]: value };
            save();
        },
    };
}

module.exports = { createSettings };
