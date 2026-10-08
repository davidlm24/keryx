import React, { useEffect } from "react";

// The browser preview (`npm run dev`, src/api/backends/preview.js) says so
// on every page, so a screenshot of it can't be taken for the app. The
// console moves down by the strip's height (html.keryx-preview, index.css).
export default function PreviewBanner() {
    useEffect(() => {
        document.documentElement.classList.add("keryx-preview");
        return () => document.documentElement.classList.remove("keryx-preview");
    }, []);
    return (
        <div className="keryx-preview-banner" role="status">
            PRÉVIA DE DESENVOLVIMENTO · dados de exemplo · as saídas reais só no aplicativo
        </div>
    );
}
