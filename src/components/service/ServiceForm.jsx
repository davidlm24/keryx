import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Calendar, Users, Plus, Trash2, Loader2 } from "lucide-react";
import { keryx } from "@/api/keryxClient";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function ServiceForm({ service, onSubmit, onCancel }) {
    const colors = useThemeColors();
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState(service ? {
        ...service,
        startTime: service.startTime || service.time || "",
        location: service.location || ""
    } : {
        title: "",
        date: "",
        startTime: "",
        location: "",
        service_type: "culto",
        event_description: "",
        worship_team: [],
        notes: "",
        status: "DRAFT",
        items: []
    });
    const [teamMembers, setTeamMembers] = useState([]);

    useEffect(() => {
        const loadTeamMembers = async () => {
            try {
                const members = await keryx.entities.WorshipTeam.list("name");
                setTeamMembers(members);
            } catch (error) {
                console.error("Erro ao carregar membros:", error);
            }
        };
        loadTeamMembers();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.title.trim() || !formData.date) return;
        setSubmitting(true);
        onSubmit(formData);
        // Reset will happen on unmount (success) or onError reopens form
        setTimeout(() => setSubmitting(false), 3000);
    };

    const addTeamMember = () => {
        setFormData({
            ...formData,
            worship_team: [...(formData.worship_team || []), { member_id: "", member_name: "", role: "" }]
        });
    };

    const removeTeamMember = (index) => {
        const newTeam = [...formData.worship_team];
        newTeam.splice(index, 1);
        setFormData({ ...formData, worship_team: newTeam });
    };

    const updateTeamMember = (index, field, value) => {
        const newTeam = [...formData.worship_team];
        newTeam[index] = { ...newTeam[index], [field]: value };
        
        if (field === "member_id") {
            const member = teamMembers.find(m => m.id === value);
            if (member) {
                newTeam[index].member_name = member.name;
                newTeam[index].role = member.role || "";
            }
        }
        
        setFormData({ ...formData, worship_team: newTeam });
    };

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2" style={{ color: colors.primary }}>
                        <Calendar className="w-5 h-5" />
                        {service ? "Editar Culto" : "Novo Culto"}
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCancel}
                        style={{ color: colors.primary }}
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        placeholder="Nome do culto (ex: Culto de Domingo)"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="bg-white/10 text-white placeholder:text-gray-400"
                        style={{ borderColor: `${colors.primary}50` }}
                        required
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className="bg-white/10 text-white"
                            style={{ borderColor: `${colors.primary}50` }}
                            required
                        />
                        <Input
                            type="time"
                            value={formData.startTime}
                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                            className="bg-white/10 text-white"
                            style={{ borderColor: `${colors.primary}50` }}
                        />
                    </div>
                    <Input
                        placeholder="Local do culto (ex: Templo Principal)"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        className="bg-white/10 text-white placeholder:text-gray-400"
                        style={{ borderColor: `${colors.primary}50` }}
                    />

                    <Select
                        value={formData.service_type}
                        onValueChange={(value) => setFormData({ ...formData, service_type: value })}
                    >
                        <SelectTrigger className="bg-white/10 text-white" style={{ borderColor: `${colors.primary}50` }}>
                            <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="culto">Culto</SelectItem>
                            <SelectItem value="evento">Evento</SelectItem>
                        </SelectContent>
                    </Select>

                    {formData.service_type === "evento" && (
                        <Textarea
                            placeholder="Descrição do evento..."
                            value={formData.event_description}
                            onChange={(e) => setFormData({ ...formData, event_description: e.target.value })}
                            className="bg-white/10 text-white placeholder:text-gray-400 min-h-20"
                            style={{ borderColor: `${colors.primary}50` }}
                        />
                    )}

                    <div className="space-y-3 border-t pt-4" style={{ borderColor: `${colors.primary}30` }}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: colors.primary }}>
                                <Users className="w-4 h-4" />
                                Escala da Equipe de Louvor
                            </h3>
                            <Button
                                type="button"
                                onClick={addTeamMember}
                                size="sm"
                                variant="outline"
                                style={{ borderColor: `${colors.primary}50`, color: colors.primary }}
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                Adicionar
                            </Button>
                        </div>
                        {formData.worship_team?.map((member, index) => (
                            <div key={index} className="flex gap-2 items-center bg-white/5 p-3 rounded-lg">
                                <Select
                                    value={member.member_id}
                                    onValueChange={(value) => updateTeamMember(index, "member_id", value)}
                                >
                                    <SelectTrigger className="bg-white/10 text-white flex-1" style={{ borderColor: `${colors.primary}50` }}>
                                        <SelectValue placeholder="Selecionar membro" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teamMembers.map(tm => (
                                            <SelectItem key={tm.id} value={tm.id}>
                                                {tm.name} - {tm.role}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input
                                    placeholder="Função"
                                    value={member.role}
                                    onChange={(e) => updateTeamMember(index, "role", e.target.value)}
                                    className="bg-white/10 text-white placeholder:text-gray-400 flex-1"
                                    style={{ borderColor: `${colors.primary}50` }}
                                />
                                <Button
                                    type="button"
                                    onClick={() => removeTeamMember(index)}
                                    size="icon"
                                    variant="ghost"
                                    className="text-red-400 hover:text-red-300"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>

                    <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                        <SelectTrigger className="bg-white/10 text-white" style={{ borderColor: `${colors.primary}50` }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="DRAFT">Rascunho</SelectItem>
                            <SelectItem value="READY">Pronto</SelectItem>
                            <SelectItem value="LIVE">Ao Vivo</SelectItem>
                            <SelectItem value="COMPLETED">Concluído</SelectItem>
                            <SelectItem value="ARCHIVED">Arquivado</SelectItem>
                        </SelectContent>
                    </Select>
                    <Textarea
                        placeholder="Notas gerais..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="bg-white/10 text-white placeholder:text-gray-400 min-h-24"
                        style={{ borderColor: `${colors.primary}50` }}
                    />
                    <div className="flex gap-3 pt-4 pb-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            className="flex-1"
                            style={{ borderColor: `${colors.primary}50` }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 text-white"
                            style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                service ? "Atualizar" : "Criar"
                            )}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}