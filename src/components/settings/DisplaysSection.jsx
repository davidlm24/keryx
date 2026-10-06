import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, Play, Square, ScanEye } from "lucide-react";
import { openProjectionWindow } from "@/lib/projectionWindow";

const POLL_MS = 3000;
const WINDOW_FEATURES = "width=1280,height=720,menubar=no,toolbar=no,location=no";

// Desktop only: which display each output (projector, stage, ...) opens on.
// The window itself is still opened by the page that projects; this decides
// where it lands. Plugging in a monitor shows up here within a few seconds.
export default function DisplaysSection({ isMobile }) {
    // contextBridge hands out a fresh object on every property access, so read
    // it once; a new reference each render would re-run the effect forever.
    const bridgeRef = useRef(null);
    if (!bridgeRef.current) bridgeRef.current = window.keryxDesktop.displays;
    const bridge = bridgeRef.current;
    const [state, setState] = useState(null);
    const [error, setError] = useState("");

    const apply = useCallback((res) => {
        if (res.error) setError(res.error.message);
        else {
            setError("");
            setState(res.data);
        }
    }, []);

    const refresh = useCallback(() => bridge.list().then(apply).catch((e) => setError(e.message)), [bridge, apply]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, POLL_MS);
        return () => clearInterval(interval);
    }, [refresh]);

    if (!state) {
        return error ? <p className="text-sm text-destructive">{error}</p> : null;
    }

    const { displays, outputs } = state;
    const number = (id) => displays.findIndex((d) => d.id === id) + 1;
    const describe = (d) => `Tela ${number(d.id)} — ${d.width}×${d.height}${d.primary ? " (principal)" : ""}`;

    const valueOf = (assignment) => {
        const t = assignment.target;
        if (t === "auto" || t === "window") return t;
        const match = displays.find((d) => d.id === t.id);
        return match ? `d:${match.id}` : `gone:${t.id}`;
    };

    const choose = (output, value) => {
        let target;
        if (value === "auto" || value === "window") target = value;
        else {
            const d = displays.find((x) => `d:${x.id}` === value);
            target = { id: d.id, label: d.label, width: d.width, height: d.height };
        }
        bridge.set(output.key, { target }).then(apply);
    };

    const status = (output) => {
        const { mode, displayId, missing } = output.placement;
        if (missing) return "A tela escolhida não está ligada; abre numa janela até ser ligada.";
        if (mode === "fullscreen") return `Tela cheia na Tela ${number(displayId)}.`;
        return "Abre numa janela.";
    };

    const test = (output) => {
        if (output.key === "/Projection") openProjectionWindow();
        else window.open(window.location.origin + output.key, output.windowName, WINDOW_FEATURES);
        setTimeout(refresh, 800);
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader className={isMobile ? "p-4" : ""}>
                <CardTitle className={`text-card-foreground flex items-center gap-2 ${isMobile ? "text-base" : "text-lg"}`}>
                    <Monitor className="w-5 h-5" />
                    Telas e saídas
                </CardTitle>
            </CardHeader>
            <CardContent className={`space-y-4 ${isMobile ? "p-4 pt-0" : ""}`}>
                <p className="text-sm text-muted-foreground">
                    Escolha em que tela cada saída aparece. As saídas abrem quando você projeta; aqui define-se onde.
                    Em tela cheia a saída não tem botão de fechar: use Ctrl+W nela, ou o botão Fechar abaixo.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-foreground">
                        {displays.length === 1 ? "1 tela detectada" : `${displays.length} telas detectadas`}:
                    </span>
                    {displays.map((d) => (
                        <span key={d.id} className="text-xs rounded-md border border-border px-2 py-1 text-muted-foreground">
                            {describe(d)}
                        </span>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => bridge.identify()}>
                        <ScanEye className="w-4 h-4 mr-2" />
                        Identificar telas
                    </Button>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <ul className="divide-y divide-border rounded-lg border border-border">
                    {outputs.map((output) => (
                        <li key={output.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground">{output.label}</p>
                                <p className="text-xs text-muted-foreground">{status(output)}</p>
                            </div>
                            <Select value={valueOf(output.assignment)} onValueChange={(v) => choose(output, v)}>
                                <SelectTrigger className="sm:w-60"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">Automático</SelectItem>
                                    <SelectItem value="window">Sempre numa janela</SelectItem>
                                    {displays.map((d) => (
                                        <SelectItem key={d.id} value={`d:${d.id}`}>{describe(d)}</SelectItem>
                                    ))}
                                    {typeof output.assignment.target === "object" && !displays.some((d) => d.id === output.assignment.target.id) && (
                                        <SelectItem value={`gone:${output.assignment.target.id}`} disabled>
                                            {`${output.assignment.target.width}×${output.assignment.target.height} (desligada)`}
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            {output.open ? (
                                <Button variant="outline" size="sm" onClick={() => bridge.close(output.key).then(apply)}>
                                    <Square className="w-4 h-4 mr-2" /> Fechar
                                </Button>
                            ) : (
                                <Button variant="outline" size="sm" onClick={() => test(output)}>
                                    <Play className="w-4 h-4 mr-2" /> Testar
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}
