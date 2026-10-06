import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

const CONTENT_TYPES = [
  { value: "lyrics", label: "Letras" },
  { value: "bible", label: "Bíblia" },
  { value: "video", label: "Vídeo" },
  { value: "image", label: "Imagem" },
  { value: "announcement", label: "Aviso" },
  { value: "countdown", label: "Contagem" },
  { value: "logo", label: "Logo" },
  { value: "blank", label: "Vazio" },
];

export default function SceneForm({ open, scene, devices, onSave, onClose }) {
  const [form, setForm] = useState({ name: "", description: "", items: [] });

  useEffect(() => {
    if (scene) setForm(scene);
    else setForm({ name: "", description: "", items: [] });
  }, [scene, open]);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const addItem = () => {
    if (devices.length === 0) return;
    const d = devices[0];
    setForm(f => ({ ...f, items: [...f.items, { device_id: d.id, device_name: d.name, content_type: "blank", content_title: "" }] }));
  };

  const updateItem = (idx, key, val) => {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [key]: val } : it) }));
  };

  const removeItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scene ? "Editar Cena" : "Nova Cena"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-muted-foreground">Nome *</Label>
            <Input value={form.name} onChange={e => update("name", e.target.value)} className="bg-white/10 border-border mt-1" placeholder="Ex: Entrada do Culto" />
          </div>
          <div>
            <Label className="text-muted-foreground">Descrição</Label>
            <Input value={form.description || ""} onChange={e => update("description", e.target.value)} className="bg-white/10 border-border mt-1" />
          </div>
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-muted-foreground">Dispositivos</p>
              <Button size="sm" variant="outline" className="border-border" onClick={addItem}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start bg-white/5 rounded-lg p-2">
                  <Select value={item.device_id} onValueChange={v => { const d = devices.find(d => d.id === v); updateItem(idx, "device_id", v); updateItem(idx, "device_name", d?.name || ""); }}>
                    <SelectTrigger className="bg-white/10 border-border flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{devices.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={item.content_type} onValueChange={v => updateItem(idx, "content_type", v)}>
                    <SelectTrigger className="bg-white/10 border-border w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{CONTENT_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="icon" variant="outline" className="border-red-500/30 text-red-400 shrink-0" onClick={() => removeItem(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
              {form.items.length === 0 && <p className="text-muted-foreground text-xs text-center py-2">Adicione dispositivos à cena.</p>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border">Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}