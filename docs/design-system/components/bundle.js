/* @ds-bundle: {"format":4,"namespace":"KERYX","components":[]} */
/* KERYX — icon set and tiny helpers. One classic script, no dependencies.
   Icons are bare glyphs: 24-unit viewBox drawn for 16px, 1.5 stroke, round caps, no fill.
   This is the design system's own, first set, kept for its pages. The app
   no longer reads it: it draws Lucide, mapped by name in src/lib/icons.js
   (Rodada HI, 2026-10-19). */
(function () {
  var ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
    play: '<path d="M7 5v14l11-7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    'skip-back': '<path d="M18 18 8 12l10-6zM6 6v12"/>',
    'skip-fwd': '<path d="m6 6 10 6-10 6zM18 6v12"/>',
    black: '<rect x="3" y="5" width="18" height="13" rx="1.5"/><path d="m5 18 14-11"/>',
    logo: '<circle cx="12" cy="12" r="8"/><path d="M9.5 8.5v7M14.5 8.5 9.5 12l5 3.5"/>',
    edit: '<path d="M4.5 19.5 5.3 15 16 4.3a1.7 1.7 0 0 1 2.4 0l1.3 1.3a1.7 1.7 0 0 1 0 2.4L9 18.7z"/><path d="m14 6.3 3.7 3.7"/>',
    eraser: '<path d="m5 15 8.5-8.5a1.5 1.5 0 0 1 2 0l2 2a1.5 1.5 0 0 1 0 2L11 17H7z"/><path d="M5 20h14"/>',
    stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>',
    power: '<path d="M12 3v8"/><path d="M6.5 7a7.5 7.5 0 1 0 11 0"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.75"/>',
    'eye-off': '<path d="m4 4 16 16"/><path d="M10 6.2A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 7.4A16 16 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3.5-.7"/><path d="M10.1 10.1a2.75 2.75 0 0 0 3.8 3.8"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
    unlock: '<rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 6.6-1.6"/>',
    'chevron-down': '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    'chevron-right': '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
    'chevron-left': '<path d="m14.5 6.5-5.5 5.5 5.5 5.5"/>',
    more: '<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
    grip: '<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
    music: '<path d="M9 18V6l11-2.5V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    film: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
    megaphone: '<path d="M3.5 10.5v3a1 1 0 0 0 1 1h2l5.5 4v-13l-5.5 4h-2a1 1 0 0 0-1 1z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>',
    book: '<path d="M4.5 19.5A2 2 0 0 1 6.5 17.5H19.5V3.5H6.5a2 2 0 0 0-2 2z"/><path d="M4.5 19.5a2 2 0 0 0 2 2H19.5v-4"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
    layers: '<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    undo: '<path d="M8.5 13.5 4 9l4.5-4.5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/>',
    monitor: '<rect x="2.5" y="4.5" width="19" height="12" rx="1.5"/><path d="M8.5 20.5h7M12 16.5v4"/>',
    tablet: '<rect x="5.5" y="2.5" width="13" height="19" rx="1.5"/><path d="M11 18h2"/>',
    projector: '<rect x="2.5" y="7.5" width="19" height="9" rx="1.5"/><circle cx="16" cy="12" r="2.25"/><path d="M5.5 11h5M5.5 13.5h3M7 20h10"/>',
    tv: '<rect x="2.5" y="7.5" width="19" height="12" rx="1.5"/><path d="m8.5 3.5 3.5 4 3.5-4"/>',
    volume: '<path d="M4.5 10v4h3l4 3.5v-11l-4 3.5z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>',
    'volume-off': '<path d="M4.5 10v4h3l4 3.5v-11l-4 3.5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    folder: '<path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
    keyboard: '<rect x="2.5" y="6.5" width="19" height="11" rx="1.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
    palette: '<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="15.5" cy="10" r="1"/><path d="M12 20.5a2.25 2.25 0 0 1 0-4.5h2a2.5 2.5 0 0 0 2.5-2.5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    wifi: '<path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
    'wifi-off': '<path d="m4 4 16 16"/><path d="M8.5 16a5 5 0 0 1 7 0M5.5 12.5a10 10 0 0 1 4-2.2M12 7.5a15 15 0 0 1 9.5 1.5"/><circle cx="12" cy="19.5" r="1"/>',
    collapse: '<path d="m6.5 14.5 5.5-5.5 5.5 5.5"/>',
    expand: '<path d="M4 9V4h5M20 15v5h-5M20 4l-6 6M4 20l6-6"/>',
    'arrow-right': '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
    'corner-down-left': '<path d="M19.5 5v6a2 2 0 0 1-2 2H5"/><path d="m9 9-4.5 4 4.5 4"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.75"/><path d="m20.5 15.5-4.5-4.5-8.5 8.5"/>',
    text: '<path d="M5 6.5h14M12 6.5v12M9 18.5h6"/>',
    refresh: '<path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6"/><path d="M20 4v4h-4M4 20v-4h4"/>',
    save: '<path d="M5 4.5h10.5l3.5 3.5v11.5H5z"/><path d="M8 4.5v5h7v-5M8 19.5v-6h8v6"/>',
    external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18.5v-9A1.5 1.5 0 0 1 6.5 8h5"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4.5H8M12 8v4.5l3 1.8"/>',
    dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'
  };
  function icon(name, size) {
    var s = size || 16;
    return '<svg class="kx-i" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  /* Replace every <i data-icon="name"></i> in a root with its glyph. */
  function mount(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) { el.innerHTML = icon(el.getAttribute('data-icon'), el.getAttribute('data-size')); });
  }
  window.KERYX = { ICONS: ICONS, icon: icon, mount: mount, names: Object.keys(ICONS) };
})();
