import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { keryx } from "@/api/keryxClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Plus, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function ServiceTemplateSelector({ open, onClose, onCreated }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: templates } = useQuery({
        queryKey: ["serviceTemplates"],
        queryFn: () => keryx.entities.ServiceTemplate.list("-created_date"),
        initialData: [],
    });

    const createFromTemplate = useMutation({
        mutationFn: async (template) => {
            const today = new Date().toISOString().slice(0, 10);
            const service = await keryx.entities.Service.create({
                title: `${template.name} - ${new Date().toLocaleDateString("pt-BR")}`,
                date: today,
                startTime: "19:00",
                status: "DRAFT",
                templateId: template.id,
                items: [],
            });
            if (template.items?.length > 0) {
                await keryx.entities.ServiceItem.bulkCreate(
                    template.items.map((item, idx) => ({
                        serviceId: service.id,
                        order: idx,
                        type: item.type,
                        title: item.title || "",
                        contentId: "",
                        duration: item.duration || null,
                        notes: item.notes || "",
                        enabled: true,
                        autoAdvance: false,
                    }))
                );
            }
            return service;
        },
        onSuccess: (service) => {
            queryClient.invalidateQueries({ queryKey: ["services"] });
            queryClient.invalidateQueries({ queryKey: ["serviceItems", service.id] });
            toast({ title: "Culto criado", description: "A partir do template" });
            onClose();
            onCreated?.(service);
        },
        onError: () => {
            toast({ title: "Erro", description: "Não foi possível criar o culto", variant: "destructive" });
        },
    });

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="bottom" className="bg-slate-900 border-white/15 text-white overflow-y-auto max-h-[85vh] rounded-t-2xl">
                <SheetHeader>
                    <SheetTitle className="text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Criar a partir de Template
                    </SheetTitle>
                </SheetHeader>
                <div className="px-1 pb-8 space-y-3">
                    {templates.length === 0 ? (
                        <p className="text-center text-gray-500 text-sm py-8">Nenhum template criado ainda</p>
                    ) : (
                        templates.map(t => (
                            <button
                                key={t.id}
                                onClick={() => createFromTemplate.mutate(t)}
                                disabled={createFromTemplate.isPending}
                                className="w-full text-left p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/30 transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/20">
                                        <Calendar className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-medium truncate">{t.name}</div>
                                        {t.description && <div className="text-gray-500 text-xs truncate">{t.description}</div>}
                                        <div className="text-gray-400 text-xs mt-1">{t.items?.length || 0} itens</div>
                                    </div>
                                    <Plus className="w-4 h-4 text-primary shrink-0" />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}