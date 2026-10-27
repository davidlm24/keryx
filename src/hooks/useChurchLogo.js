import { useUser } from "@/hooks/useUser";
import { defaultLogoUrl } from "@/lib/backgrounds";

// The church logo for idle and "logo" screens: the profile's, else the one
// shipped with the app. The profile's cached copy (useUser) paints it before
// the database answers; Configurações › Igreja changes it in every window.
export function useChurchLogo() {
    const user = useUser();
    if (user) return user.logo_url || defaultLogoUrl();
    try {
        // No profile read yet, nor cached: the copy older versions kept.
        return localStorage.getItem("idleLogoUrl") || defaultLogoUrl();
    } catch {
        return defaultLogoUrl();
    }
}
