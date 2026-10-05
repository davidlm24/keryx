import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function ServiceItemConfig({ item, open, onClose, onSave }) {
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (item) {
            setFormData({
                title: item.title || "",
                notes: item.notes || "",
                duration: item.duration || "",
                sceneId: item.sceneId || "",
                autoAdvance: item.autoAdvance || false,
                enabled: item.enabled !== false,
            });
        }
    }, [item]);

    const { data: scenes } = useQuery({
        queryKey: ["projectionScenes"],
        queryFn: () => base44.entities.ProjectionScene.list("-created_date"),
        initialData: [],
    });

    if (!item) return null;

    const handleSave = () => {
        onSave(item.id, {
            title: formData.title,
            notes: formData.notes,
            duration: formData.duration ? parseInt(formData.duration) : null,
            sceneId: formData.sceneId,
            autoAdvance: formData.autoAdvance,
            enabled: formData.enabled,
        });
        onClose();
    };

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="bottom" className="bg-slate-900 border-white/15 text-white overflow-y-auto max-h-[85vh] rounded-t-2xl">
                <SheetHeader>
                    <SheetTitle className="text-white">Configurar Item</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 px-1 pb-8">
                    <div>
                        <Label className="text-gray-300 mb-1.5 block">Título</Label>
                        <Input
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="bg-white/10 border-white/15 text-white"
                        />
                    </div>
                    <div>
                        <Label className="text-gray-300 mb-1.5 block">Notas do Operador</Label>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="bg-white/10 border-white/15 text-white min-h-20"
                            placeholder="Notas para este item..."
                        />
                    </div>
                    <div>
                        <Label className="text-gray-300 mb-1.5 block">Duração (segundos)</Label>
                        <Input
                            type="number"
                            value={formData.duration}
                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                            className="bg-white/10 border-white/15 text-white"
                            placeholder="0"
                        />
                    </div>
                    <div>
                        <Label className="text-gray-300 mb-1.5 block">Cena de Projeção</Label>
                        <Select
                            value={formData.sceneId || "none"}
                            onValueChange={(v) => setFormData({ ...formData, sceneId: v === "none" ? "" : v })}
                        >
                            <SelectTrigger className="bg-white/10 border-white/15 text-white">
                                <SelectValue placeholder="Nenhuma cena" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhuma cena</SelectItem>
                                {scenes.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                        <Label className="text-gray-300">Avanço Automático</Label>
                        <Switch
                            checked={formData.autoAdvance}
                            onCheckedChange={(v) => setFormData({ ...formData, autoAdvance: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                        <Label className="text-gray-300">Item Ativo</Label>
                        <Switch
                            checked={formData.enabled}
                            onCheckedChange={(v) => setFormData({ ...formData, enabled: v })}
                        />
                    </div>
                    <Button onClick={handleSave} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                        Salvar Configuração
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}