import React from "react";
import "@ds/components/bundle.js";

// A bare glyph from the KERYX icon set (docs/design-system/components/bundle.js):
// 16 px, 1.5 stroke, currentColor, never framed. Names: window.KERYX.names.
export default function Icon({ name, size = 16, className = "" }) {
    const path = window.KERYX?.ICONS[name];
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
