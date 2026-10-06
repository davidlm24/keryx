import React, { useState } from "react";
import QRCode from "react-qr-code";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tv, Tablet, Monitor, Trash2, Pencil, Link2, QrCode, X, Copy, Check } from "lucide-react";
import { DEVICE_TYPE_LABELS, DEVICE_ROLE_LABELS, CONTENT_TYPE_LABELS } from "@/lib/deviceStyles";
import { createPageUrl } from "@/utils";
import { useLanBaseUrl, LAN_OFF_HINT } from "@/hooks/useLanBaseUrl";

const TYPE_ICONS = { projector: Monitor, tv: Tv, tablet: Tablet, pc: Monitor };

export default function DeviceCard({ device, onEdit, onDelete, onCopyUrl }) {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = TYPE_ICONS[device.type] || Monitor;
  const online = device.is_online && device.last_seen && Date.now() - new Date(device.last_seen).getTime() < 60000;
  const out = device.current_output;
  const { baseUrl } = useLanBaseUrl();
  const deviceUrl = baseUrl ? `${baseUrl}${createPageUrl("DeviceView")}?device=${device.id}` : "";

  const copyUrl = () => {
    if (!deviceUrl) {
      alert(LAN_OFF_HINT);
      return;
    }
    navigator.clipboard.writeText(deviceUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-white">{device.name}</h3>
              <p className="text-muted-foreground text-xs">{DEVICE_TYPE_LABELS[device.type]} • {DEVICE_ROLE_LABELS[device.role]}</p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${online ? "text-green-400" : "text-gray-500"}`}>
            <div className={`w-2 h-2 rounded-full ${online ? "bg-green-400" : "bg-gray-600"}`}></div>
            {online ? "Online" : "Offline"}
          </div>
        </div>

        {out?.content_type && out.content_type !== "blank" && (
          <div className="text-xs text-muted-foreground mb-3 bg-black/20 rounded p-2">
            A exibir: <span className="font-medium text-white">{CONTENT_TYPE_LABELS[out.content_type] || out.content_type}</span>
            {out.title ? ` — ${out.title}` : ""}
          </div>
        )}

        {showQR && (
          <div className="mb-3 bg-white rounded-xl p-3 flex flex-col items-center gap-2">
            <button onClick={() => setShowQR(false)} className="self-end text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
            <QRCode value={deviceUrl} size={140} bgColor="#ffffff" fgColor="#1e1b4b" />
            <p className="text-xs text-gray-600 text-center">Aponte a câmera do tablet/TV<br />para abrir este dispositivo</p>
            <div className="flex items-center gap-1.5 w-full bg-gray-100 rounded-lg px-2 py-1.5">
              <span className="text-xs text-gray-500 truncate flex-1">{deviceUrl}</span>
              <button onClick={copyUrl} className="text-accent hover:text-accent/80">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}

        {!showQR && (
          <div className="text-xs text-muted-foreground mb-3">
            Código: <span className="font-mono text-accent">{device.pairing_code || "—"}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant={showQR ? "default" : "outline"} className={showQR ? "" : "border-border hover:bg-white/10"} onClick={() => setShowQR(!showQR)}>
            <QrCode className="w-3.5 h-3.5 mr-1" /> QR
          </Button>
          <Button size="sm" variant="outline" className="border-border hover:bg-white/10" onClick={() => onCopyUrl(device)}>
            <Link2 className="w-3.5 h-3.5 mr-1" /> Link
          </Button>
          <Button size="sm" variant="outline" className="border-border hover:bg-white/10" onClick={() => onEdit(device)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="border-red-500/30 hover:bg-red-500/10 text-red-400" onClick={() => onDelete(device)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}