import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { keryx } from "@/api/keryxClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import ServiceItemCard from "./ServiceItemCard";
import ServiceItemConfig from "./ServiceItemConfig";
import ServiceItemPicker from "./ServiceItemPicker";
import ServiceTemplateSelector from "./ServiceTemplateSelector";

export default function ServiceItemManager({ service, onPlayItem }) {
    const queryClient = useQueryClient();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [templateOpen, setTemplateOpen] = useState(false);
    const [configItem, setConfigItem] = useState(null);

    const { data: serviceItems, isLoading } = useQuery({
        queryKey: ["serviceItems", service.id],
        queryFn: () => keryx.entities.ServiceItem.filter({ serviceId: service.id }),
        initialData: [],
    });

    const sortedItems = [...(serviceItems || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Migrar itens embutidos legados para a entidade ServiceItem
    useEffect(() => {
        const migrate = async () => {
            if (!service.id) return;
            try {
                const existing = await keryx.entities.ServiceItem.filter({ serviceId: service.id });
                if (existing.length === 0 && service.items?.length > 0) {
                    const typeMap = { song: "SONG", bible: "BIBLE", media: "VIDEO", announcement: "ANNOUNCEMENT" };
                    await keryx.entities.ServiceItem.bulkCreate(
                        service.items.map((item, idx) => ({
                            serviceId: service.id,
                            order: idx,
                            type: typeMap[item.type] || "FREE_CONTENT",
                            title: item.title || "",
                            contentId: item.item_id || "",
                            notes: item.notes || "",
                            enabled: true,
                            autoAdvance: false,
                        }))
                    );
                    queryClient.invalidateQueries({ queryKey: ["serviceItems", service.id] });
                }
            } catch (e) {
                console.error("Erro na migração:", e);
            }
        };
        migrate();
    }, [service.id]);

    const createItem = useMutation({
        mutationFn: (data) => keryx.entities.ServiceItem.create({
            ...data,
            serviceId: service.id,
            order: sortedItems.length,
            enabled: true,
            autoAdvance: false,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["serviceItems", service.id] });
            setPickerOpen(false);
        },
    });

    const updateItem = useMutation({
        mutationFn: ({ id, data }) => keryx.entities.ServiceItem.update(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["serviceItems", service.id] }),
    });

    const deleteItem = useMutation({
        mutationFn: (id) => keryx.entities.ServiceItem.delete(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["serviceItems", service.id] }),
    });

    const reorderItems = useMutation({
        mutationFn: (items) => keryx.entities.ServiceItem.bulkUpdate(
            items.map((item, idx) => ({ id: item.id, order: idx }))
        ),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["serviceItems", service.id] }),
    });

    const handleAdd = (data) => createItem.mutate(data);
    const handleDelete = (item) => deleteItem.mutate(item.id);

    const handleDuplicate = (item) => {
        createItem.mutate({
            type: item.type,
            title: `${item.title} (cópia)`,
            contentId: item.contentId,
            duration: item.duration,
            notes: item.notes,
            sceneId: item.sceneId,
            autoAdvance: item.autoAdvance,
            enabled: item.enabled,
        });
    };

    const handleToggleEnabled = (item) => {
        updateItem.mutate({ id: item.id, data: { enabled: !item.enabled } });
    };

    const handleConfigSave = (id, data) => updateItem.mutate({ id, data });

    const handleMove = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= sortedItems.length) return;
        const items = [...sortedItems];
        [items[index], items[newIndex]] = [items[newIndex], items[index]];
        reorderItems.mutate(items);
    };

    const onDragEnd = (result) => {
        if (!result.destination || result.destination.index === result.source.index) return;
        const items = [...sortedItems];
        const [moved] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, moved);
        reorderItems.mutate(items);
    };

    return (
        <>
            <Card className="bg-gradient-to-br from-primary/20 to-accent/20 border-primary/30">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-primary-foreground">Itens do Culto</CardTitle>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}
                                className="border-primary/30 text-primary hover:bg-primary/10">
                                <Sparkles className="w-4 h-4 mr-1" />
                                Template
                            </Button>
                            <Button size="sm" onClick={() => setPickerOpen(true)}
                                className="bg-gradient-to-r from-primary to-accent hover:from-primary hover:to-accent">
                                <Plus className="w-4 h-4 mr-1" />
                                Adicionar
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    {isLoading ? (
                        <p className="text-center text-muted-foreground/60 text-sm py-6">Carregando...</p>
                    ) : sortedItems.length > 0 ? (
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable droppableId="service-items">
                                {(provided) => (
                                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                        {sortedItems.map((item, index) => (
                                            <Draggable key={item.id} draggableId={item.id} index={index}>
                                                {(prov, snapshot) => (
                                                    <div ref={prov.innerRef} {...prov.draggableProps}>
                                                        <ServiceItemCard
                                                            item={item}
                                                            index={index}
                                                            dragHandleProps={prov.dragHandleProps}
                                                            isDragging={snapshot.isDragging}
                                                            totalCount={sortedItems.length}
                                                            onPlay={onPlayItem}
                                                            onDelete={handleDelete}
                                                            onDuplicate={handleDuplicate}
                                                            onToggleEnabled={handleToggleEnabled}
                                                            onConfig={setConfigItem}
                                                            onMove={handleMove}
                                                        />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground/60 text-sm mb-3">Nenhum item adicionado</p>
                            <Button size="sm" onClick={() => setPickerOpen(true)}
                                className="bg-gradient-to-r from-primary to-accent">
                                <Plus className="w-4 h-4 mr-1" />
                                Adicionar primeiro item
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <ServiceItemPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={handleAdd} />
            <ServiceTemplateSelector open={templateOpen} onClose={() => setTemplateOpen(false)} />
            <ServiceItemConfig item={configItem} open={!!configItem} onClose={() => setConfigItem(null)} onSave={handleConfigSave} />
        </>
    );
}