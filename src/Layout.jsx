import React from "react";
import { keryx } from "@/api/keryxClient";
import TopHeader from "@/components/layout/TopHeader";
import BottomTabBar from "@/components/layout/BottomTabBar";

export default function Layout({ children, currentPageName }) {
    const [userSettings, setUserSettings] = React.useState({
        logo_url: "https://media.base44.com/images/public/69388756d10163d1050a1fd7/134ea9bea_IMG-20260802-WA0009.jpg",
        background_url: "",
        language: "pt",
        primary_color: "#7d8470",
        secondary_color: "#c9a86a",
        navbar_primary_color: "#7d8470",
        navbar_secondary_color: "#c9a86a",
        submenu_primary_color: "#7d8470",
        submenu_secondary_color: "#c9a86a",
        device_mode: "desktop"
    });

    // Auto-toggle dark class based on Android/system prefers-color-scheme
    React.useEffect(() => {
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const applyTheme = (isDark) => {
            if (isDark) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        };
        applyTheme(mql.matches);
        const listener = (e) => applyTheme(e.matches);
        mql.addEventListener("change", listener);
        return () => mql.removeEventListener("change", listener);
    }, []);

    React.useEffect(() => {
        const loadSettings = async () => {
            const SETTINGS_KEY = "gerar_projection_settings";
            const defaults = {
                logo_url: "https://media.base44.com/images/public/69388756d10163d1050a1fd7/134ea9bea_IMG-20260802-WA0009.jpg",
                background_url: "",
                language: "pt",
                primary_color: "#7d8470",
                secondary_color: "#c9a86a",
                navbar_primary_color: "#7d8470",
                navbar_secondary_color: "#c9a86a",
                submenu_primary_color: "#7d8470",
                submenu_secondary_color: "#c9a86a",
                device_mode: "desktop"
            };

            try {
                const user = await keryx.auth.me();
                if (user) {
                    setUserSettings({
                        logo_url: user.logo_url || defaults.logo_url,
                        background_url: user.background_url || "",
                        language: user.language || "pt",
                        primary_color: user.primary_color || "#7d8470",
                        secondary_color: user.secondary_color || "#c9a86a",
                        navbar_primary_color: user.navbar_primary_color || "#7d8470",
                        navbar_secondary_color: user.navbar_secondary_color || "#c9a86a",
                        submenu_primary_color: user.submenu_primary_color || user.navbar_primary_color || "#7d8470",
                        submenu_secondary_color: user.submenu_secondary_color || user.navbar_secondary_color || "#c9a86a",
                        device_mode: user.device_mode || "desktop"
                    });
                    return;
                }
            } catch (error) {
                // Not authenticated, try localStorage
            }

            try {
                const saved = localStorage.getItem(SETTINGS_KEY);
                if (saved) {
                    const data = JSON.parse(saved);
                    setUserSettings({
                        ...defaults,
                        ...data,
                        submenu_primary_color: data.submenu_primary_color || data.navbar_primary_color || defaults.submenu_primary_color,
                        submenu_secondary_color: data.submenu_secondary_color || data.navbar_secondary_color || defaults.submenu_secondary_color,
                    });
                }
            } catch (e) {
                console.error("Erro ao carregar configurações:", e);
            }
        };
        loadSettings();
    }, []);

    // Projection pages render raw, without header/footer
    if (currentPageName === "Projection" || currentPageName === "LyricProjection" || currentPageName === "CommunicationProjection" || currentPageName === "BannerProjection" || currentPageName === "PastorView" || currentPageName === "StageView" || currentPageName === "BibleMaterialProjection") {
        return children;
    }

    const backgroundStyle = userSettings.background_url
        ? { backgroundImage: `url(${userSettings.background_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : {
            background: `linear-gradient(to bottom right, ${userSettings.primary_color}15, ${userSettings.secondary_color}15)`,
            backgroundColor: '#1a1714'
        };

    return (
        <div className="min-h-screen flex flex-col" style={{
            ...backgroundStyle,
            '--primary-color': userSettings.primary_color,
            '--secondary-color': userSettings.secondary_color,
            '--navbar-primary-color': userSettings.navbar_primary_color,
            '--navbar-secondary-color': userSettings.navbar_secondary_color,
            '--submenu-primary-color': userSettings.submenu_primary_color,
            '--submenu-secondary-color': userSettings.submenu_secondary_color
        }}>
            <style>{`
                :root {
                    --primary: ${userSettings.primary_color};
                    --secondary: ${userSettings.secondary_color};
                    --navbar-primary: ${userSettings.navbar_primary_color};
                    --navbar-secondary: ${userSettings.navbar_secondary_color};
                    --submenu-primary: ${userSettings.submenu_primary_color};
                    --submenu-secondary: ${userSettings.submenu_secondary_color};
                }
            `}</style>
            {userSettings.background_url && <div className="absolute inset-0 bg-black/50"></div>}

            <TopHeader
                logoUrl={userSettings.logo_url}
                primaryColor={userSettings.navbar_primary_color}
                secondaryColor={userSettings.navbar_secondary_color}
            />

            <main className="relative z-10 flex-1 overflow-y-auto pb-16 no-scrollbar">
                {children}
            </main>

            <BottomTabBar
                primaryColor={userSettings.navbar_primary_color}
                secondaryColor={userSettings.navbar_secondary_color}
            />
        </div>
    );
}