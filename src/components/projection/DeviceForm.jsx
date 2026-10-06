import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generatePairingCode } from "@/lib/deviceStyles";

const TYPES = [
  { value: "projector", label: "Projetor" },
  { value: "tv", label: "Smart TV" },
  { value: "tablet", label: "Tablet" },
  { value: "pc", label: "PC" },
];
const ROLES = [
  { value: "lyrics", label: "Letras / Bíblia" },
  { value: "media", label: "Multimídia (Vídeo/Imagem)" },
  { value: "control", label: "Controlo Remoto" },
  { value: "bible", label: "Bíblia" },
  { value: "announcements", label: "Avisos" },
  { value: "mixed", label: "Misto" },
];
const FONTS = ["sans", "serif", "mono", "cursive", "arial", "georgia", "times", "verdana"];
const SIZES = ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"];
const EFFECTS = ["shadow", "glow", "outline", "3d", "neon", "double-shadow", "none"];

export default function DeviceForm({ open, device, onSave, onClose }) {
  const [form, setForm] = useState({
    name: "", type: "projector", role: "lyrics", pairing_code: generatePairingCode(),
    config: { text_color: "#ffffff", font_family: "sans", font_size: "large", text_effect: "shadow", background_image: "" },
    notes: ""
  });

  useEffect(() => {
    if (device) setForm(device);
    else setForm({
      name: "", type: "projector", role: "lyrics", pairing_code: generatePairingCode(),
      config: { text_color: "#ffffff", font_family: "sans", font_size: "large", text_effect: "shadow", background_image: "" },
      notes: ""
    });
  }, [device, open]);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const updateConfig = (key, val) => setForm(f => ({ ...f, config: { ...f.config, [key]: val } }));

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-accent/30 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{device ? "Editar Dispositivo" : "Novo Dispositivo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-accent">Nome *</Label>
            <Input value={form.name} onChange={e => update("name", e.target.value)} className="bg-background border-accent/30 mt-1" placeholder="Ex: Projetor Principal" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-accent">Tipo</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger className="bg-background border-accent/30 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-accent">Função</Label>
              <Select value={form.role} onValueChange={v => update("role", v)}>
                <SelectTrigger className="bg-background border-accent/30 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-accent">Código de Pareamento</Label>
            <div className="flex gap-2 mt-1">
              <Input value={form.pairing_code} readOnly className="bg-background border-accent/30 font-mono" />
              <Button variant="outline" className="border-accent/30" onClick={() => update("pairing_code", generatePairingCode())}>Gerar</Button>
            </div>
          </div>
          <div className="border-t border-accent/20 pt-3">
            <p className="text-sm font-semibold text-accent mb-3">Aparência da Projeção</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-accent text-xs">Cor do Texto</Label>
                <Input type="color" value={form.config?.text_color || "#ffffff"} onChange={e => updateConfig("text_color", e.target.value)} className="h-9 bg-background border-accent/30 mt-1 p-1" />
              </div>
              <div>
                <Label className="text-accent text-xs">Fonte</Label>
                <Select value={form.config?.font_family || "sans"} onValueChange={v => updateConfig("font_family", v)}>
                  <SelectTrigger className="bg-background border-accent/30 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{FONTS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-accent text-xs">Tamanho</Label>
                <Select value={form.config?.font_size || "large"} onValueChange={v => updateConfig("font_size", v)}>
                  <SelectTrigger className="bg-background border-accent/30 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-accent text-xs">Efeito</Label>
                <Select value={form.config?.text_effect || "shadow"} onValueChange={v => updateConfig("text_effect", v)}>
                  <SelectTrigger className="bg-background border-accent/30 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{EFFECTS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label className="text-accent text-xs">Imagem de Fundo (URL)</Label>
              <Input value={form.config?.background_image || ""} onChange={e => updateConfig("background_image", e.target.value)} className="bg-background border-accent/30 mt-1" placeholder="https://..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-accent/30">Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}