import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Calendar, Music, Book, Film, LayoutGrid, X } from "lucide-react";
import { createPageUrl } from "@/utils";

const MAIN_TABS = [
    { name: "Services", icon: Calendar, label: "Cultos", path: "/Services" },
    { name: "Home", icon: Music, label: "Músicas", path: "/Home" },
    { name: "Bible", icon: Book, label: "Bíblia", path: "/Bible" },
    { name: "Media", icon: Film, label: "Mídia", path: "/Media" },
];

const MORE_PAGES = [
    { name: "Analytics", label: "Estatísticas" },
    { name: "SongHistoryPage", label: "Histórico" },
    { name: "Communication", label: "Comunicação" },
    { name: "BibleSchool", label: "EBD" },
    { name: "Settings", label: "Configurações" },
];

export default function BottomTabBar({ primaryColor, secondaryColor }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [moreOpen, setMoreOpen] = useState(false);

    const isActive = (path) => {
        if (path === "/Home") return location.pathname === "/" || location.pathname === "/Home" || location.pathname.startsWith("/Home/");
        return location.pathname === path || location.pathname.startsWith(path + "/");
    };

    const tabPathsRef = useRef({});

    const getCurrentTabPath = (pathname) => {
        for (const tab of MAIN_TABS) {
            if (pathname === tab.path || pathname.startsWith(tab.path + "/")) {
                return tab.path;
            }
        }
        if (pathname === "/" || pathname === "/Home") return "/Home";
        return null;
    };

    useEffect(() => {
        const currentTab = getCurrentTabPath(location.pathname);
        if (currentTab) {
            tabPathsRef.current[currentTab] = location.pathname;
        }
    }, [location.pathname]);

    const handleTab = (path) => {
        if (isActive(path)) {
            delete tabPathsRef.current[path];
            navigate(path);
        } else {
            const lastPath = tabPathsRef.current[path] || path;
            navigate(lastPath);
        }
    };

    const handleMore = (pageName) => {
        navigate(createPageUrl(pageName));
        setMoreOpen(false);
    };

    const TabButton = ({ tab }) => {
        const Icon = tab.icon;
        const active = isActive(tab.path);
        return (
            <button
                onClick={() => handleTab(tab.path)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full active:scale-90 transition-transform"
                style={{ color: active ? primaryColor : "#9ca3af" }}
            >
                <Icon className="w-5 h-5" style={active ? { color: primaryColor } : {}} />
                <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                {active && (
                    <span
                        className="absolute -top-px h-0.5 w-8 rounded-full"
                        style={{ background: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})` }}
                    />
                )}
            </button>
        );
    };

    return (
        <>
            <nav
                className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-t border-border"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
                <div className="flex items-stretch h-14 select-none">
                    {MAIN_TABS.map((tab) => (
                        <div key={tab.name} className="relative flex-1 flex">
                            <TabButton tab={tab} />
                        </div>
                    ))}
                    <button
                        onClick={() => setMoreOpen(true)}
                        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full active:scale-90 transition-transform"
                        style={{ color: moreOpen ? primaryColor : "#9ca3af" }}
                    >
                        <LayoutGrid className="w-5 h-5" />
                        <span className="text-[10px] font-medium leading-none">Mais</span>
                    </button>
                </div>
            </nav>

            {moreOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end"
                    onClick={() => setMoreOpen(false)}
                >
                    <div
                        className="w-full bg-card border-t border-border rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto"
                        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-white font-semibold text-lg">Mais opções</h2>
                            <button
                                onClick={() => setMoreOpen(false)}
                                className="text-gray-400 hover:text-white active:scale-90 transition-transform"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {MORE_PAGES.map((page) => {
                                const active = location.pathname === createPageUrl(page.name);
                                return (
                                    <button
                                        key={page.name}
                                        onClick={() => handleMore(page.name)}
                                        className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all active:scale-95"
                                        style={
                                            active
                                                ? { background: `${primaryColor}25`, borderColor: primaryColor, color: primaryColor }
                                                : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "#d1d5db" }
                                        }
                                    >
                                        <span className="text-sm font-medium text-center">{page.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}