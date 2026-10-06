// Background images offered in the galleries (Unsplash photos, Unsplash
// License). On desktop they ship inside the app (resources/backgrounds/) and
// are served under the media URL space, so they work offline and still pass
// the pages' startsWith("http") image checks. The web build loads them from
// Unsplash. Three photos the old lists linked to no longer exist and were
// dropped.

export const BACKGROUNDS = {
    "Adoração": [
        "1557672172-298e090bd0f1",
        "1506905925346-21bda4d32df4",
        "1419242902214-272b3f66ee7a",
        "1475274047050-1d0c0975c63e",
        "1470071459604-3b5ec3a7fe05",
    ],
    "Natureza": [
        "1501594907352-04cda38ebc29",
        "1464822759023-fed622ff2c3b",
        "1418065460487-3e41a6c84dc5",
        "1447752875215-b2761acb3c5d",
        "1472214103451-9374bd1c798e",
    ],
    "Abstrato": [
        "1516339901601-2e1b62dc0c45",
        "1505765050516-f72dcac9c60e",
        "1495616811223-4d98c6e9c869",
    ],
    "Céu/Luz": [
        "1418065460487-3e41a6c84dc5",
        "1505765050516-f72dcac9c60e",
        "1470071459604-3b5ec3a7fe05",
        "1464822759023-fed622ff2c3b",
    ],
    "Comunicação": [
        "1507003211169-0a1dd7228f2d",
        "1511632765486-a01980e01a18",
        "1470252649378-9c29740c9fa8",
        "1502139214982-d0ad755818d8",
        "1518531933037-91b2f5f229cc",
        "1476610182048-b716b8518aae",
        "1506905925346-21bda4d32df4",
        "1419242902214-272b3f66ee7a",
    ],
};

const ALL_IDS = new Set(Object.values(BACKGROUNDS).flat());

const desktopMediaBase = () =>
    typeof window !== "undefined" && window.keryxDesktop ? window.keryxDesktop.mediaBaseUrl : null;

export function backgroundUrl(id) {
    const base = desktopMediaBase();
    return base ? `${base}bundled/backgrounds/${id}.webp` : `https://images.unsplash.com/photo-${id}?w=1920&q=80`;
}

// The bundled id for an Unsplash URL saved before backgrounds were bundled
// (imported rows), or null.
export function bundledBackgroundId(url) {
    const match = /^https:\/\/images\.unsplash\.com\/photo-([0-9a-f-]+)/.exec(String(url || ""));
    return match && ALL_IDS.has(match[1]) ? match[1] : null;
}

const BUNDLED_LOGO_PATH = "bundled/branding/church-logo.jpg";
const HOSTED_LOGO = "https://media.base44.com/images/public/69388756d10163d1050a1fd7/134ea9bea_IMG-20260802-WA0009.jpg";

// The church logo when the profile has none: shipped with the desktop app,
// still loaded from where Base44 hosted it in the web build.
export function defaultLogoUrl() {
    const base = desktopMediaBase();
    return base ? base + BUNDLED_LOGO_PATH : HOSTED_LOGO;
}
