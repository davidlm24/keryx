import React from "react";
import { iconNode, iconMarkup, strokeFor } from "@/lib/icons";

// A bare glyph (Lucide, mapped by name in src/lib/icons.js): 16 px, the
// STROKE there, currentColor, never framed. An unknown name draws nothing.

const warned = new Set();
const warnOnce = (name) => {
    if (!name || !import.meta.env?.DEV || warned.has(name)) return;
    warned.add(name);
    console.warn(`Icon: no icon named "${name}" (src/lib/icons.js)`);
};

// React wants camelCase for hyphenated SVG attributes (stroke-width…).
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const props = (attrs) => Object.fromEntries(Object.entries(attrs).map(([k, v]) => [camel(k), v]));

// The glyph's SVG markup, for a node built outside React (the drag ghost).
export const iconSvg = (name, size = 14) => {
    const out = iconMarkup(name, size);
    if (!out) warnOnce(name);
    return out;
};

export default function Icon({ name, size = 16, className = "" }) {
    const node = iconNode(name);
    if (!node) {
        warnOnce(name);
        return null;
    }
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
        >
            {node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...props(attrs) }))}
        </svg>
    );
}
