import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Maximize2, Tv, Wifi } from "lucide-react";
import { FONT_MAP, SIZE_MAP, getTextEffect, DEVICE_TYPE_LABELS } from "@/lib/deviceStyles";

function CountdownDisplay({ duration, config }) {
  const [remaining, setRemaining] = useState(duration || 60);
  useEffect(() => {
    setRemaining(duration || 60);
    const timer = setInterval(() => setRemaining(r => r > 0 ? r - 1 : 0), 1000);
    return () => clearInterval(timer);
  }, [duration]);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return (
    <div className="font-bold tabular-nums" style={{
      fontFamily: FONT_MAP[config.font_family] || FONT_MAP.sans,
      fontSize: "8rem",
      color: config.text_color || "#ffffff",
      ...getTextEffect(config.text_effect, config.text_color)
    }}>{mins}:{String(secs).padStart(2, "0")}</div>
  );
}

export default function DeviceView() {
  const [deviceId, setDeviceId] = useState(() => new URLSearchParams(window.location.search).get("device"));
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pairingCode, setPairingCode] = useState("");
  const [pairError, setPairError] = useState("");
  const heartbeatRef = useRef(null);

  const handlePair = async () => {
    if (!pairingCode.trim()) return;
    try {
      const devices = await base44.entities.ProjectionDevice.filter({ pairing_code: pairingCode.trim().toUpperCase() });
      if (devices.length > 0) {
        window.location.search = `?device=${devices[0].id}`;
      } else {
        setPairError("Código não encontrado. Verifique com o operador.");
      }
    } catch (e) {
      setPairError("Erro ao conectar. Tente novamente.");
    }
  };

  useEffect(() => {
    if (!deviceId) { setLoading(false); return; }
    let unsubscribe = null;
    const load = async () => {
      try {
        const dev = await base44.entities.ProjectionDevice.get(deviceId);
        setDevice(dev);
        setLoading(false);

        unsubscribe = base44.entities.ProjectionDevice.subscribe((event) => {
          if (event.data?.id === deviceId) setDevice(event.data);
        });

        const beat = async () => {
          try { await base44.entities.ProjectionDevice.update(deviceId, { is_online: true, last_seen: new Date().toISOString() }); } catch (e) { /* ignore */ }
        };
        beat();
        heartbeatRef.current = setInterval(beat, 30000);
      } catch (e) {
        setLoading(false);
      }
    };
    load();
    return () => {
      if (unsubscribe) unsubscribe();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [deviceId]);

  useEffect(() => {
    const onUnmount = () => {
      if (deviceId) base44.entities.ProjectionDevice.update(deviceId, { is_online: false }).catch(() => {});
    };
    window.addEventListener("beforeunload", onUnmount);
    return () => window.removeEventListener("beforeunload", onUnmount);
  }, [deviceId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // Pairing screen
  if (!deviceId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex bg-accent/20 p-4 rounded-2xl mb-4">
              <Tv className="w-12 h-12 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Conectar Dispositivo</h1>
            <p className="text-accent text-sm">Digite o código de pareamento fornecido pelo operador</p>
          </div>
          <div className="space-y-3">
            <Input
              value={pairingCode}
              onChange={e => { setPairingCode(e.target.value); setPairError(""); }}
              placeholder="Código de pareamento"
              className="text-center text-2xl font-mono tracking-widest h-14 bg-background border-accent/30 text-white"
              onKeyDown={e => e.key === "Enter" && handlePair()}
            />
            {pairError && <p className="text-red-400 text-sm text-center">{pairError}</p>}
            <Button onClick={handlePair} className="w-full h-12 bg-gradient-to-r from-accent to-primary" disabled={!pairingCode.trim()}>
              <Wifi className="w-4 h-4 mr-2" /> Conectar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-accent">A conectar...</div>;
  }
  if (!device) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-red-400">Dispositivo não encontrado.</div>;
  }

  const output = device.current_output || {};
  const config = device.config || {};
  const contentType = output.content_type || "blank";

  const renderContent = () => {
    switch (contentType) {
      case "lyrics": {
        const slides = output.slides || [];
        const slide = slides[output.slide_index || 0];
        if (!slide) return null;
        return (
          <div className="text-center px-12">
            {output.title && <h2 className="text-accent text-xl mb-4 font-light">{output.title}</h2>}
            <pre className="whitespace-pre-wrap font-bold" style={{
              fontFamily: FONT_MAP[config.font_family] || FONT_MAP.sans,
              fontSize: SIZE_MAP[config.font_size] || SIZE_MAP.large,
              color: config.text_color || "#ffffff",
              lineHeight: 1.3,
              ...getTextEffect(config.text_effect, config.text_color)
            }}>{slide.text}</pre>
          </div>
        );
      }
      case "bible":
        return (
          <div className="text-center px-12 max-w-5xl mx-auto">
            {output.bible_reference && <h2 className="text-accent text-2xl mb-6 font-light">{output.bible_reference}</h2>}
            <p className="font-bold" style={{
              fontFamily: FONT_MAP[config.font_family] || FONT_MAP.sans,
              fontSize: SIZE_MAP[config.font_size] || SIZE_MAP.large,
              color: config.text_color || "#ffffff",
              lineHeight: 1.4,
              ...getTextEffect(config.text_effect, config.text_color)
            }}>{output.text}</p>
          </div>
        );
      case "announcement":
        return (
          <div className="text-center px-12">
            <p className="font-bold" style={{
              fontFamily: FONT_MAP[config.font_family] || FONT_MAP.sans,
              fontSize: SIZE_MAP[config.font_size] || SIZE_MAP.large,
              color: config.text_color || "#ffffff",
              lineHeight: 1.3,
              ...getTextEffect(config.text_effect, config.text_color)
            }}>{output.text}</p>
          </div>
        );
      case "video":
        return <video src={output.media_url} autoPlay loop muted className="w-full h-full object-contain" key={output.media_url} />;
      case "image":
        return <img src={output.media_url || output.background_image} className="w-full h-full object-contain" alt="" />;
      case "countdown":
        return <CountdownDisplay duration={output.countdown_duration} config={config} />;
      case "logo":
        return (
          <div className="flex items-center justify-center h-full">
            <img src={config.background_image || output.media_url} className="max-h-40 max-w-xs object-contain" alt="Logo" />
          </div>
        );
      default:
        return null;
    }
  };

  const bg = output.background_image || config.background_image;

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden" onClick={toggleFullscreen}>
      {bg && contentType !== "video" && (
        <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url(${bg})` }} />
      )}
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        {renderContent()}
      </div>
      <button className="absolute top-3 right-3 z-20 text-white/30 hover:text-white text-xs" onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}>
        <Maximize2 className="w-5 h-5" />
      </button>
      <div className="absolute bottom-3 left-3 z-20 text-white/20 text-xs">
        {device.name} • {DEVICE_TYPE_LABELS[device.type]}
      </div>
    </div>
  );
}