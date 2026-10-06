import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Timer, Square, Type, MonitorOff, Loader2 } from "lucide-react";
import { keryx } from "@/api/keryxClient";
import { useThemeColors } from "@/hooks/useThemeColors";
import { sendToProjection } from "@/lib/projectionWindow";

export default function ProjectionTools() {
    const colors = useThemeColors();
    const [activeTool, setActiveTool] = useState(null);
    const [freeText, setFreeText] = useState("");
    const [timerMinutes, setTimerMinutes] = useState(5);
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [textColor, setTextColor] = useState("#ffffff");
    const [fontSize, setFontSize] = useState("large");
    const [bgUploading, setBgUploading] = useState(false);
    const [bgImage, setBgImage] = useState("");
    const [stopwatchStart, setStopwatchStart] = useState(null);

    const sendTool = (mode, payload = {}) => {
        sendToProjection({ type: "PROJECTION_TOOL", mode, payload });
    };

    const stopTool = () => {
        sendToProjection({ type: "PROJECTION_TOOL", mode: "stop" });
        setActiveTool(null);
        setStopwatchStart(null);
    };

    const handleClock = () => {
        sendTool("clock", { text_color: textColor, font_size: fontSize, background_image: bgImage });
        setActiveTool("clock");
        setStopwatchStart(null);
    };

    const handleStopwatch = () => {
        const start = Date.now();
        setStopwatchStart(start);
        sendTool("stopwatch", { startTime: start, text_color: textColor, font_size: fontSize, background_image: bgImage });
        setActiveTool("stopwatch");
    };

    const handleTimer = () => {
        const totalSeconds = (timerMinutes * 60) + timerSeconds;
        if (totalSeconds <= 0) return;
        const end = Date.now() + totalSeconds * 1000;
        sendTool("timer", { endTime: end, text_color: textColor, font_size: fontSize, background_image: bgImage });
        setActiveTool("timer");
    };

    const handleFreeText = () => {
        if (!freeText.trim()) return;
        sendTool("freetext", { text: freeText, text_color: textColor, font_size: fontSize, background_image: bgImage });
        setActiveTool("freetext");
    };

    const handleBlack = () => {
        sendTool("black", {});
        setActiveTool("black");
    };

    const handleUploadBg = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBgUploading(true);
        const { file_url } = await keryx.integrations.Core.UploadFile({ file });
        setBgImage(file_url);
        setBgUploading(false);
    };

    const tools = [
        { key: "clock", label: "Relógio", icon: Clock, action: handleClock },
        { key: "stopwatch", label: "Cronômetro", icon: Timer, action: handleStopwatch },
        { key: "timer", label: "Temporizador", icon: Timer, action: handleTimer },
        { key: "freetext", label: "Texto Livre", icon: Type, action: handleFreeText },
        { key: "black", label: "Tela Preta", icon: MonitorOff, action: handleBlack },
    ];

    return (
        <Card className="bg-card/40 border-border">
            <CardHeader className="pb-3">
                <CardTitle className="text-card-foreground flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Ferramentas de Projeção
                    </span>
                    {activeTool && (
                        <Button size="sm" variant="destructive" onClick={stopTool}>
                            <Square className="w-4 h-4 mr-1" /> Parar
                        </Button>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Configurações de estilo compartilhadas */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-black/20 rounded-lg">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Cor do Texto</label>
                        <input
                            type="color"
                            value={textColor}
                            onChange={(e) => setTextColor(e.target.value)}
                            className="w-full h-8 rounded cursor-pointer border-0 bg-transparent"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Tamanho</label>
                        <Select value={fontSize} onValueChange={setFontSize}>
                            <SelectTrigger className="bg-white/10 border-border text-white text-sm h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="small">Pequeno</SelectItem>
                                <SelectItem value="medium">Médio</SelectItem>
                                <SelectItem value="large">Grande</SelectItem>
                                <SelectItem value="xlarge">Muito Grande</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Imagem de Fundo</label>
                        <label className="flex items-center gap-1 cursor-pointer px-2 py-1.5 rounded bg-white/10 border border-border text-foreground text-xs hover:bg-white/20 transition">
                            {bgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : "📁"}
                            {bgImage ? "Alterar" : "Escolher"}
                            <input type="file" accept="image/*" className="hidden" onChange={handleUploadBg} />
                        </label>
                        {bgImage && (
                            <button onClick={() => setBgImage("")} className="text-xs text-red-400 hover:text-red-300 ml-1">✕</button>
                        )}
                    </div>
                </div>

                {/* Temporizador config */}
                <div className="flex items-center gap-2 p-3 bg-accent/10 border border-accent/30 rounded-lg">
                    <span className="text-xs text-accent font-medium">Temporizador:</span>
                    <Input
                        type="number"
                        min="0"
                        value={timerMinutes}
                        onChange={(e) => setTimerMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 bg-white/10 border-accent/30 text-white text-sm h-8"
                        placeholder="min"
                    />
                    <span className="text-accent text-sm">min</span>
                    <Input
                        type="number"
                        min="0"
                        max="59"
                        value={timerSeconds}
                        onChange={(e) => setTimerSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-16 bg-white/10 border-accent/30 text-white text-sm h-8"
                        placeholder="seg"
                    />
                    <span className="text-accent text-sm">seg</span>
                </div>

                {/* Texto livre config */}
                <div className="p-3 rounded-lg" style={{ background: `${colors.primary}20`, border: `1px solid ${colors.primary}50` }}>
                    <label className="text-xs mb-1 block" style={{ color: colors.primary }}>Texto Livre:</label>
                    <textarea
                        value={freeText}
                        onChange={(e) => setFreeText(e.target.value)}
                        placeholder="Digite o texto a projetar..."
                        rows={2}
                        className="w-full bg-white/10 text-white text-sm rounded p-2 placeholder:text-gray-500 resize-none"
                        style={{ border: `1px solid ${colors.primary}50` }}
                    />
                </div>

                {/* Botões de ferramentas */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {tools.map((tool) => {
                        const Icon = tool.icon;
                        const isActive = activeTool === tool.key;
                        return (
                            <Button
                                key={tool.key}
                                onClick={tool.action}
                                disabled={tool.key === "freetext" && !freeText.trim()}
                                variant={isActive ? "default" : "outline"}
                                className={isActive ? "" : "border-white/15 bg-white/5 hover:bg-white/10"}
                            >
                                <Icon className="w-4 h-4 mr-2" />
                                {tool.label}
                            </Button>
                        );
                    })}
                </div>

                {activeTool && (
                    <p className="text-center text-primary text-xs">
                        ● {tools.find(t => t.key === activeTool)?.label} ativo na projeção
                    </p>
                )}
            </CardContent>
        </Card>
    );
}