import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Edit, Trash2, ChevronRight, PartyPopper, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import PullToRefresh from "@/components/PullToRefresh";

export default function ServiceList({ services, onView, onEdit, onDelete, onRefresh }) {
    const statusColors = {
        DRAFT: "bg-yellow-100 text-yellow-800",
        planning: "bg-yellow-100 text-yellow-800",
        READY: "bg-blue-100 text-blue-800",
        ready: "bg-blue-100 text-blue-800",
        LIVE: "bg-red-100 text-red-800 animate-pulse",
        COMPLETED: "bg-green-100 text-green-800",
        completed: "bg-green-100 text-green-800",
        ARCHIVED: "bg-gray-100 text-gray-800"
    };

    const statusLabels = {
        DRAFT: "Rascunho",
        planning: "Rascunho",
        READY: "Pronto",
        ready: "Pronto",
        LIVE: "Ao Vivo",
        COMPLETED: "Concluído",
        completed: "Concluído",
        ARCHIVED: "Arquivado"
    };

    return (
        <PullToRefresh onRefresh={onRefresh}>
        <div className="grid gap-4">
            {services.map((service, index) => (
                <motion.div
                    key={service.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                >
                    <Card className="bg-gradient-to-br from-primary/20 to-accent/20 border-primary/30 hover:border-primary/50 transition-all cursor-pointer"
                          onClick={() => onView(service)}>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="bg-primary/20 p-3 rounded-lg">
                                        {service.service_type === "evento" ? (
                                            <PartyPopper className="w-6 h-6 text-primary" />
                                        ) : (
                                            <Calendar className="w-6 h-6 text-primary" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-semibold text-white">
                                                {service.title}
                                            </h3>
                                            {service.service_type === "evento" && (
                                                <Badge className="bg-accent/20 text-accent border-accent/30">
                                                    Evento
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-primary text-sm">
                                            {format(new Date(service.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                            {service.time && ` às ${service.time}`}
                                        </p>
                                        <div className="flex gap-2 mt-2">
                                            <Badge className={statusColors[service.status]}>
                                                {statusLabels[service.status]}
                                            </Badge>
                                            <Badge variant="outline" className="text-primary border-primary/30">
                                                {service.items?.length || 0} itens
                                            </Badge>
                                            {service.worship_team?.length > 0 && (
                                                <Badge variant="outline" className="text-emerald-300 border-emerald-500/30 flex items-center gap-1">
                                                    <Users className="w-3 h-3" />
                                                    {service.worship_team.length} membros
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                        onClick={() => onEdit(service)}
                                        variant="outline"
                                        size="icon"
                                        className="border-primary/30 hover:bg-primary/10"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        onClick={() => onDelete(service)}
                                        variant="outline"
                                        size="icon"
                                        className="border-red-500/30 hover:bg-red-500/10 text-red-400"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        onClick={() => onView(service)}
                                        className="bg-gradient-to-r from-primary to-accent hover:from-primary hover:to-accent"
                                    >
                                        Ver Detalhes
                                        <ChevronRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            ))}
        </div>
        </PullToRefresh>
    );
}