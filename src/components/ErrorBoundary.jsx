import React from "react";
import { useLocation } from "react-router-dom";

// Unattended screens (TVs, tablets) have nobody to press "Recarregar".
const SCREEN_PATHS = [
    "/Projection", "/LyricProjection", "/VideoProjection", "/CommunicationProjection",
    "/BannerProjection", "/StageView", "/PastorView", "/DeviceView",
    "/BibleMaterialProjection", "/AnnouncementCarousel",
];
const SCREEN_RELOAD_MS = 10000;

class Boundary extends React.Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error("[keryx] erro de renderização:", error, info?.componentStack);
        if (this.props.isScreen) {
            this.reloadTimer = setTimeout(() => window.location.reload(), SCREEN_RELOAD_MS);
        }
    }

    componentDidUpdate(prev) {
        if (prev.resetKey !== this.props.resetKey && this.state.error) {
            clearTimeout(this.reloadTimer);
            this.setState({ error: null });
        }
    }

    componentWillUnmount() {
        clearTimeout(this.reloadTimer);
    }

    render() {
        if (!this.state.error) return this.props.children;

        if (this.props.isScreen) {
            return <div className="fixed inset-0 bg-black" />;
        }

        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
                <div className="max-w-md text-center space-y-4">
                    <h1 className="text-2xl font-heading font-semibold">Algo correu mal</h1>
                    <p className="text-muted-foreground">
                        Esta página encontrou um erro inesperado. Os dados salvos não foram afetados.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium"
                        >
                            Recarregar
                        </button>
                        <a href="/" className="px-4 py-2 rounded-lg border border-border font-medium">
                            Ir para o início
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}

export default function ErrorBoundary({ children }) {
    const { pathname } = useLocation();
    const isScreen = SCREEN_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
    return (
        <Boundary resetKey={pathname} isScreen={isScreen}>
            {children}
        </Boundary>
    );
}
