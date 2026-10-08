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
        const take = (u) => {
            const url = u?.logo_url || defaultLogoUrl();
            setLogo(url);
            try {
                localStorage.setItem("idleLogoUrl", url);
            } catch { /* private mode */ }
        };
        keryx.auth.me().then((u) => { if (u) take(u); }).catch(() => {});
        // Configurações › Igreja changes the logo: every window follows.
        return keryx.entities.User.subscribe?.((change) => { if (change?.data && change.type !== "delete") take(change.data); });
    }, []);

    return logo;
}
