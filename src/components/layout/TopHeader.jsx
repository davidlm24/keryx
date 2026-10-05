import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const ROOT_PATHS = ["/", "/Home", "/Services", "/Bible", "/Media"];

export default function TopHeader({ logoUrl, primaryColor, secondaryColor, title = "KERYX" }) {
    const location = useLocation();
    const navigate = useNavigate();
    const isRoot = ROOT_PATHS.includes(location.pathname);

    return (
        <header
            className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "0.5rem" }}
        >
            <div className="flex items-center justify-between px-4 h-14 select-none">
                {isRoot ? (
                    <div className="flex items-center gap-2">
                        {logoUrl && (
                            <img
                                src={logoUrl}
                                alt="Logo"
                                className="w-9 h-9 rounded-full object-cover ring-1 ring-border"
                            />
                        )}
                        <h1
                            className="font-heading font-semibold text-lg bg-clip-text text-transparent tracking-tight"
                            style={{
                                backgroundImage: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
                            }}
                        >
                            {title}
                        </h1>
                    </div>
                ) : (
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 active:scale-95 transition-transform"
                        style={{ color: primaryColor }}
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="text-sm font-medium">Voltar</span>
                    </button>
                )}
            </div>
        </header>
    );
}