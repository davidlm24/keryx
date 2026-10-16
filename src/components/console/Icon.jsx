import React from "react";
import "@ds/components/bundle.js";

// A bare glyph from the KERYX icon set (docs/design-system/components/bundle.js):
// 16 px, 1.5 stroke, currentColor, never framed. Names: window.KERYX.names.
// Glyphs the design-system set does not have yet, in its style.
const EXTRA = {
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    download: '<path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
    "chevron-up": '<path d="m6.5 14.5 5.5-5.5 5.5 5.5"/>',
    grid: '<rect x="4" y="5" width="7" height="6" rx="1"/><rect x="13" y="5" width="7" height="6" rx="1"/><rect x="4" y="13" width="7" height="6" rx="1"/><rect x="13" y="13" width="7" height="6" rx="1"/>',
    trash: '<path d="M5 7.5h14M10 7.5V5.5h4v2M7 7.5l.8 11a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4l.8-11M10.5 11v5.5M13.5 11v5.5"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5.5"/><path d="M12 7.8v.2"/>',
    pin:'<path d="M9.5 4.5h5l-.7 5 2.7 2.5v1.5H7.5V12l2.7-2.5z"/><path d="M12 13.5V20"/>',
    cloud: '<path d="M7.5 18.5h9.5a3.75 3.75 0 0 0 .4-7.48 5.5 5.5 0 0 0-10.6 1.26A3.1 3.1 0 0 0 7.5 18.5z"/>',
    // Two ticks: select all (the Bíblia's verses).
    checks: '<path d="m3.5 12.5 3.5 3.5 7-8"/><path d="m11 15.5.5.5 8-9"/>',
};

// The stroke in the glyphs' 24-unit box: 1.5 at the set's 16 px, scaled so
// it stays one pixel at any size (a 12 px mark drew 0.75 px, faint; POL-15).
const strokeFor = (size) => String(Math.round((24 / size) * 100) / 100);

// The glyph's SVG markup, for a node built outside React (the drag ghost).
export const iconSvg = (name, size = 14) => {
    const path = window.KERYX?.ICONS[name] || EXTRA[name];
    return path ? `<svg class="kx-i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeFor(size)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>` : "";
};

export default function Icon({ name, size = 16, className = "" }) {
    const path = window.KERYX?.ICONS[name] || EXTRA[name];
    if (!path) return null;
    return (
        <svg
            className={`kx-i ${className}`}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeFor(size)}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: path }}
        />
    );
}
