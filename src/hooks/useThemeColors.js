import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const DEFAULTS = { primary: "#7d8470", secondary: "#c9a86a" };
const SETTINGS_KEY = "gerar_projection_settings";

export function useThemeColors() {
    const [colors, setColors] = useState(DEFAULTS);

    useEffect(() => {
        const load = async () => {
            try {
                const user = await base44.auth.me();
                if (user) {
                    setColors({
                        primary: user.navbar_primary_color || user.primary_color || DEFAULTS.primary,
                        secondary: user.navbar_secondary_color || user.secondary_color || DEFAULTS.secondary,
                    });
                    return;
                }
            } catch (error) {
                // not authenticated
            }

            try {
                const saved = localStorage.getItem(SETTINGS_KEY);
                if (saved) {
                    const data = JSON.parse(saved);
                    setColors({
                        primary: data.navbar_primary_color || data.primary_color || DEFAULTS.primary,
                        secondary: data.navbar_secondary_color || data.secondary_color || DEFAULTS.secondary,
                    });
                }
            } catch (e) {}
        };
        load();
    }, []);

    return colors;
}