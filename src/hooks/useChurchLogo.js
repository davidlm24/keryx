import { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { defaultLogoUrl } from "@/lib/backgrounds";

// The church logo for idle and "logo" screens: the profile's, else the one
// shipped with the app. Remembered so a screen shows it before the profile loads.
export function useChurchLogo() {
    const [logo, setLogo] = useState(() => {
        try {
            return localStorage.getItem("idleLogoUrl") || defaultLogoUrl();
        } catch {
            return defaultLogoUrl();
        }
    });

    useEffect(() => {
        keryx.auth.me().then((u) => {
            if (!u?.logo_url) return;
            setLogo(u.logo_url);
            try {
                localStorage.setItem("idleLogoUrl", u.logo_url);
            } catch { /* private mode */ }
        }).catch(() => {});
    }, []);

    return logo;
}
