import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tv, Tablet, Monitor, ChevronLeft, ChevronRight, Square, Play, Music, BookOpen, Image, Video, Send, Layers, Cast, Pencil } from "lucide-react";
import { CONTENT_TYPE_LABELS } from "@/lib/deviceStyles";
import QuickVerseBar from "@/components/projection/QuickVerseBar";
import QuickAccessDock from "@/components/projection/QuickAccessDock";
import LiveSlideEditor from "@/components/projection/LiveSlideEditor";

const TYPE_ICONS = { projector: Monitor, tv: Tv, tablet: Tablet, pc: Monitor };

const ROLE_CONTENT_HINT = {
  lyrics: { label: "Letras / Bíblia", highlight: "lyrics" },
  bible: { label: "Bíblia", highlight: "bible" },
  media: { label: "Vídeos / Imagens", highlight: "media" },
  control: { label: "Controlo Remoto", highlight: "control" },
  announcements: { label: "Avisos", highlight: "announcement" },
  mixed: { label: "Conteúdo Misto", highlight: null },
};

function parseSlides(song) {
  if (song.slides?.length) return song.slides;
  if (!song.lyrics) return [];
  return song.lyrics.split(/\n\s*\n/).map(block => ({ text: block.trim() })).filter(s => s.text);
}

export default function OperatorPanel() {
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [songSearch, setSongSearch] = useState("");
  const [bibleRef, setBibleRef] = useState("");
  const [bibleText, setBibleText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showLiveEditor, setShowLiveEditor] = useState(false);
  const queryClient = useQueryClient();

  const { data: devices } = useQuery({ queryKey: ["projectionDevices"], queryFn: () => base44.entities.ProjectionDevice.list("-updated_date"), initialData: [] });
  const { data: scenes } = useQuery({ queryKey: ["projectionScenes"], queryFn: () => base44.entities.ProjectionScene.list("-updated_date"), initialData: [] });
  const { data: songs } = useQuery({ queryKey: ["songs"], queryFn: () => base44.entities.Song.list("title"), initialData: [] });

  // Poll device status for live online/offline updates
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["projectionDevices"] });
    }, 10000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const filteredSongs = songs.filter(s =>
    !songSearch.trim() ||
    s.title?.toLowerCase().includes(songSearch.toLowerCase()) ||
    s.artist?.toLowerCase().includes(songSearch.toLowerCase())
  ).slice(0, 20);

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);
  const output = selectedDevice?.current_output || {};

  const sendToDevice = useMutation({
    mutationFn: ({ deviceId, output }) => base44.entities.ProjectionDevice.update(deviceId, { current_output: output }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectionDevices"] })
  });

  const sendSong = (song) => {
    if (!selectedDeviceId) return;
    const slides = parseSlides(song);
    sendToDevice.mutate({
      deviceId: selectedDeviceId,
      output: { content_type: "lyrics", title: song.title, slides, slide_index: 0, background_image: song.background_image || "" }
    });
  };

  const sendBible = () => {
    if (!selectedDeviceId || !bibleText.trim()) return;
    sendToDevice.mutate({ deviceId: selectedDeviceId, output: { content_type: "bible", bible_reference: bibleRef, text: bibleText } });
  };

  const sendMedia = (type) => {
    if (!selectedDeviceId || !mediaUrl.trim()) return;
    sendToDevice.mutate({ deviceId: selectedDeviceId, output: { content_type: type, media_url: mediaUrl } });
  };

  const sendBlank = () => {
    if (!selectedDeviceId) return;
    sendToDevice.mutate({ deviceId: selectedDeviceId, output: { content_type: "blank" } });
  };

  const sendLogo = () => {
    if (!selectedDeviceId) return;
    sendToDevice.mutate({ deviceId: selectedDeviceId, output: { content_type: "logo" } });
  };

  const sendAlert = async (message, type = "alert") => {
    // Desativar alertas anteriores e criar novo
    try {
      const existing = await base44.entities.AlertMessage.filter({ status: "active" });
      if (existing.length) {
        await base44.entities.AlertMessage.bulkUpdate(
          existing.map(a => ({ id: a.id, status: "inactive" }))
        );
      }
    } catch (e) {}
    await base44.entities.AlertMessage.create({
      message,
      type,
      status: "active",
      timestamp: Date.now(),
    });
  };

  const clearAlert = async () => {
    try {
      const existing = await base44.entities.AlertMessage.filter({ status: "active" });
      if (existing.length) {
        await base44.entities.AlertMessage.bulkUpdate(
          existing.map(a => ({ id: a.id, status: "inactive" }))
        );
      }
    } catch (e) {}
  };

  const navigateSlide = (dir) => {
    if (!selectedDevice) return;
    const slides = output.slides || [];
    const newIndex = Math.max(0, Math.min(slides.length - 1, (output.slide_index || 0) + dir));
    sendToDevice.mutate({ deviceId: selectedDevice.id, output: { ...output, slide_index: newIndex } });
  };

  const editCurrentSlide = (newText) => {
    if (!selectedDevice) return;
    const slides = [...(output.slides || [])];
    const idx = output.slide_index || 0;
    if (slides[idx]) {
      slides[idx] = { ...slides[idx], text: newText };
      sendToDevice.mutate({ deviceId: selectedDevice.id, output: { ...output, slides } });
    }
  };

  const activateScene = (scene) => {
    scene.items?.forEach(item => {
      sendToDevice.mutate({
        deviceId: item.device_id,
        output: { content_type: item.content_type, title: item.content_title, ...(item.content_data || {}) }
      });
    });
  };

  const isOnline = (d) => d.is_online && d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 60000;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent mb-1">Painel do Operador</h1>
        <p className="text-accent text-sm">Controlo ao vivo dos dispositivos de projeção</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device list */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2"><Cast className="w-4 h-4" /> Dispositivos</h2>
          {devices.length === 0 && <p className="text-muted-foreground text-sm">Nenhum dispositivo. Configure no Gestor de Projeções.</p>}
          {devices.map(d => {
            const Icon = TYPE_ICONS[d.type] || Monitor;
            const online = isOnline(d);
            const active = selectedDeviceId === d.id;
            const dOutput = d.current_output;
            return (
              <button key={d.id} onClick={() => setSelectedDeviceId(d.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                  active ? "bg-primary/20 border border-primary/50" : "bg-card/50 border border-border hover:border-primary/30"
                }`}>
                <div className="bg-primary/20 p-2 rounded-lg shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate text-sm">{d.name}</p>
                  <p className="text-muted-foreground text-xs truncate">
                    {dOutput?.content_type && active && dOutput.content_type !== "blank" ? CONTENT_TYPE_LABELS[dOutput.content_type] : (d.role || d.type)}
                  </p>
                </div>
                <div className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-green-400" : "bg-gray-600"}`}></div>
              </button>
            );
          })}

          {scenes.length > 0 && (
            <div className="pt-4">
              <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2"><Layers className="w-4 h-4" /> Cenas Rápidas</h2>
              <div className="space-y-1.5">
                {scenes.map(scene => (
                  <Button key={scene.id} variant="outline" className="w-full justify-start border-border hover:bg-white/10" onClick={() => activateScene(scene)}>
                    <Play className="w-3.5 h-3.5 mr-2" /> {scene.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Control panel */}
        <div className="lg:col-span-2">
          {!selectedDevice ? (
            <Card className="bg-card/50 border-border h-full flex items-center justify-center">
              <CardContent className="py-16 text-center text-muted-foreground">
                <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Selecione um dispositivo para controlar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Quick controls */}
              <Card className="bg-card/50 border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{selectedDevice.name}</h2>
                      {ROLE_CONTENT_HINT[selectedDevice.role] && (
                        <p className="text-xs text-muted-foreground mt-0.5">Sugestão: {ROLE_CONTENT_HINT[selectedDevice.role].label}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className={`w-2 h-2 rounded-full ${isOnline(selectedDevice) ? "bg-green-400" : "bg-gray-600"}`}></div>
                      <span className={isOnline(selectedDevice) ? "text-green-400" : "text-gray-500"}>{isOnline(selectedDevice) ? "Online" : "Offline"}</span>
                    </div>
                  </div>
                  {selectedDevice.role === "control" && (
                    <div className="mb-3 bg-primary/10 border border-border rounded-lg p-2 text-xs text-muted-foreground text-center">
                      <Cast className="w-4 h-4 inline mr-1" /> Este dispositivo funciona como controlo remoto — não recebe projeção de conteúdo.
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Button variant="outline" className="border-border hover:bg-white/10 h-14 text-sm" onClick={sendBlank}><Square className="w-5 h-5 mr-2" /> Vazio</Button>
                    <Button variant="outline" className="border-border hover:bg-white/10 h-14 text-sm" onClick={sendLogo}><Image className="w-5 h-5 mr-2" /> Logo</Button>
                    <Button variant="outline" className="border-border hover:bg-white/10 h-14 text-sm" disabled={!output.slides?.length} onClick={() => navigateSlide(-1)}><ChevronLeft className="w-5 h-5 mr-1" /> Slide</Button>
                    <Button variant="outline" className="border-border hover:bg-white/10 h-14 text-sm" disabled={!output.slides?.length} onClick={() => navigateSlide(1)}>Slide <ChevronRight className="w-5 h-5 ml-1" /></Button>
                  </div>
                  {output.slides?.length > 0 && (
                    <Button variant="outline" className="w-full mt-2 border-accent/30 hover:bg-accent/10 text-sm" onClick={() => setShowLiveEditor(true)}>
                      <Pencil className="w-4 h-4 mr-2" /> Editar slide atual
                    </Button>
                  )}
                  {output.slides?.length > 0 && (
                    <div className="mt-3 text-center text-sm text-muted-foreground">
                      Slide {(output.slide_index || 0) + 1} de {output.slides.length}
                      {output.title && ` • ${output.title}`}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Send song */}
              <Card className="bg-card/50 border-border">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2"><Music className="w-4 h-4" /> Enviar Música</h3>
                  <Input value={songSearch} onChange={e => setSongSearch(e.target.value)} placeholder="Pesquisar música..." className="bg-white/10 border-border mb-2" />
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredSongs.map(song => (
                      <button key={song.id} onClick={() => sendSong(song)} className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-primary/20 transition-colors">
                        <span className="text-white text-sm font-medium">{song.title}</span>
                        {song.artist && <span className="text-muted-foreground text-xs ml-2">{song.artist}</span>}
                      </button>
                    ))}
                    {filteredSongs.length === 0 && <p className="text-muted-foreground text-xs text-center py-2">Nenhuma música encontrada.</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Verse Bar — versículo rápido */}
              <Card className="bg-card/50 border-border">
                <CardContent className="p-4">
                  <QuickVerseBar
                    onProject={(passage) => {
                      if (!selectedDeviceId) return;
                      sendToDevice.mutate({
                        deviceId: selectedDeviceId,
                        output: { content_type: "bible", bible_reference: passage.reference, text: passage.text, slides: passage.slides, title: passage.reference }
                      });
                    }}
                  />
                </CardContent>
              </Card>

              {/* Send Bible (manual) */}
              <Card className="bg-card/50 border-border">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4" /> Enviar Bíblia (Manual)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input value={bibleRef} onChange={e => setBibleRef(e.target.value)} placeholder="João 3:16" className="bg-white/10 border-border" />
                    <Input value={bibleText} onChange={e => setBibleText(e.target.value)} placeholder="Texto do versículo" className="bg-white/10 border-border md:col-span-2" />
                  </div>
                  <Button onClick={sendBible} disabled={!bibleText.trim()} className="mt-2 w-full"><Send className="w-4 h-4 mr-2" /> Enviar</Button>
                </CardContent>
              </Card>

              {/* Send Media */}
              <Card className="bg-card/50 border-border">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2"><Video className="w-4 h-4" /> Enviar Multimédia</h3>
                  <div className="flex gap-2">
                    <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="URL do vídeo ou imagem" className="bg-white/10 border-border flex-1" />
                    <Button variant="outline" className="border-border" onClick={() => sendMedia("video")}><Video className="w-4 h-4" /></Button>
                    <Button variant="outline" className="border-border" onClick={() => sendMedia("image")}><Image className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
      <QuickAccessDock
        onBlank={sendBlank}
        onLogo={sendLogo}
        onCountdown={() => {
          if (!selectedDeviceId) return;
          sendToDevice.mutate({ deviceId: selectedDeviceId, output: { content_type: "countdown", countdown_duration: 300 } });
        }}
        onAnnouncement={() => {
          if (!selectedDeviceId) return;
          const text = prompt("Texto do anúncio:");
          if (text) sendToDevice.mutate({ deviceId: selectedDeviceId, output: { content_type: "announcement", text } });
        }}
        onAlert={() => {
          const text = prompt("Alerta de berçário (ex: Pais da Maria, dirijam-se à sala 3):");
          if (text) sendAlert(text, "alert");
        }}
        onMessage={() => {
          const text = prompt("Mensagem sobreposta:");
          if (text) sendAlert(text, "message");
        }}
        onLiveEdit={() => setShowLiveEditor(true)}
        onCarousel={() => {
          const url = `${window.location.origin}/AnnouncementCarousel`;
          window.open(url, "_blank", "noopener,noreferrer");
        }}
        onBlack={() => {
          clearAlert();
          if (!selectedDeviceId) return;
          sendToDevice.mutate({ deviceId: selectedDeviceId, output: { content_type: "blank", title: "" } });
        }}
      />
      {showLiveEditor && (
        <LiveSlideEditor
          currentText={output.slides?.[output.slide_index || 0]?.text || ""}
          onSave={editCurrentSlide}
          onClose={() => setShowLiveEditor(false)}
        />
      )}
    </div>
  );
}