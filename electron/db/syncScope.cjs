// What travels between the church's computers when sync is on (the shared
// sync folder, docs/desktop-architecture.md §8b): the church's content, never
// what belongs to one computer or to the moment on air.
//
// A new entity is in or out on purpose: `npm test` fails while one is in
// neither list.

// The church's content: edited on any computer, the same on all of them.
const SYNC_ENTITIES = new Set([
    "AlertPreset",
    "BackgroundPref",
    "BibleMaterial",
    "BibleNote",
    "BiblePassage",
    "BibleSchoolClass",
    "CommunicationVideo",
    "Media",
    "ProjectionTheme",
    "Service",
    "ServiceItem",
    "ServiceTemplate",
    "Song",
    "SongHistory",
    "TimerPreset",
    "User", // only its church fields, see LOCAL_USER_FIELDS
    "WorshipTeam",
]);

// Kept on each computer.
const LOCAL_ENTITIES = new Set([
    // Installed per computer (copyrighted editions, 31k rows a version).
    "BibleVerse",
    // Each computer's outputs and their designs.
    "OutputPref",
    // The moment on air, and the retired sync tables.
    "LiveSession",
    "ProjectionState",
    "LyricSync",
    "VideoSync",
    "VideoControl",
    "BibleProjectionSync",
    // Nothing writes these any more (user data kept in place).
    "AlertMessage",
    "BannerTemplate",
    "ChatMessage",
    "Playlist",
    "Poll",
    "ProjectionDevice",
    "ProjectionScene",
    "Quiz",
    "Raffle",
    "ScreenLayout",
    "VolunteerSchedule",
]);

// The operator profile mixes the church's preferences (logo, Bíblia, temas
// padrão, papel de parede) with this computer's: who operates it and its
// one-off migrations (prefs_version is per database — synced, a computer
// would skip its own migration).
const LOCAL_USER_FIELDS = new Set([
    "full_name",
    "prefs_version",
    "console_density",
    "console_hidden_modules",
    "language",
    "device_mode",
]);

const isSynced = (entity) => SYNC_ENTITIES.has(entity);

// The part of a row that travels, or null when the entity stays here.
function syncRow(entity, row) {
    if (!isSynced(entity) || !row) return null;
    if (entity !== "User") return { ...row };
    const out = {};
    for (const [key, value] of Object.entries(row)) {
        if (!LOCAL_USER_FIELDS.has(key)) out[key] = value;
    }
    return out;
}

module.exports = { SYNC_ENTITIES, LOCAL_ENTITIES, LOCAL_USER_FIELDS, isSynced, syncRow };
