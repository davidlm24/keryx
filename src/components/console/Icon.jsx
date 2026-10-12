import React from "react";
import "@ds/components/bundle.js";

// A bare glyph from the KERYX icon set (docs/design-system/components/bundle.js):
// 16 px, 1.5 stroke, currentColor, never framed. Names: window.KERYX.names.
// Glyphs the design-system set does not have yet, in its style.
const EXTRA = {
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    download: '<path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
    "chevron-up": '<path d="m6.5 14.5 5.5-5.5 5.5 5.5"/>',
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
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: path }}
        />
    );
}
