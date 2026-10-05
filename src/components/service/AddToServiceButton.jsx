import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Check, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function AddToServiceButton({ itemType, contentId, title, ensureContent, variant = "ghost", size = "icon", className = "" }) {
    const [open, setOpen] = useState(false);
    const [addedTo, setAddedTo] = useState(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: services } = useQuery({
        queryKey: ["services"],
        queryFn: () => base44.entities.Service.list("-date"),
        initialData: [],
    });

    const addItemMutation = useMutation({
        mutationFn: async ({ serviceId, serviceTitle }) => {
            let finalContentId = contentId;
            if (!finalContentId && ensureContent) {
                const content = await ensureContent();
                finalContentId = content?.id || "";
            }
            const items = await base44.entities.ServiceItem.filter({ serviceId });
            const order = items.length;
            return base44.entities.ServiceItem.create({
                serviceId,
                order,
                type: itemType,
                title,
                contentId: finalContentId,
                enabled: true,
                autoAdvance: false,
            });
        },
        onSuccess: (_data, vars) => {
            setAddedTo(vars.serviceTitle);
            queryClient.invalidateQueries({ queryKey: ["serviceItems", vars.serviceId] });
            toast({ title: "Adicionado ao culto", description: `"${title}" → ${vars.serviceTitle}` });
            setTimeout(() => setAddedTo(null), 2000);
            setOpen(false);
        },
        onError: () => {
            toast({ title: "Erro", description: "Não foi possível adicionar ao culto", variant: "destructive" });
        },
    });

    return (
        <div className="relative">
            <Button
                size={size}
                variant={variant}
                className={className}
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setOpen(!open);
                }}
                title="Adicionar ao culto"
            >
                {addedTo ? (
                    <Check className="w-4 h-4 text-green-400" />
                ) : (
                    <CalendarPlus className="w-4 h-4" />
                )}
            </Button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-64 overflow-y-auto rounded-lg border border-white/15 bg-slate-900 shadow-xl no-scrollbar">
                        <div className="p-2 text-xs text-gray-400 font-medium border-b border-white/10 sticky top-0 bg-slate-900">
                            Adicionar "{title?.slice(0, 30)}" ao culto
                        </div>
                        {services.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 text-center">Nenhum culto criado</div>
                        ) : (
                            services.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        addItemMutation.mutate({ serviceId: s.id, serviceTitle: s.title });
                                    }}
                                    disabled={addItemMutation.isPending}
                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                                >
                                    <CalendarPlus className="w-3.5 h-3.5 text-primary shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate">{s.title}</div>
                                        <div className="text-xs text-gray-500">{s.date}</div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}