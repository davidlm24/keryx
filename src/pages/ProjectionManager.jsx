import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Monitor, Cast, Layers, Trash2, Copy, Check, Info } from "lucide-react";
import { createPageUrl } from "@/utils";
import DeviceCard from "@/components/projection/DeviceCard";
import DeviceForm from "@/components/projection/DeviceForm";
import SceneForm from "@/components/projection/SceneForm";

export default function ProjectionManager() {
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [editingScene, setEditingScene] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const queryClient = useQueryClient();

  const { data: devices } = useQuery({ queryKey: ["projectionDevices"], queryFn: () => base44.entities.ProjectionDevice.list("-updated_date"), initialData: [] });
  const { data: scenes } = useQuery({ queryKey: ["projectionScenes"], queryFn: () => base44.entities.ProjectionScene.list("-updated_date"), initialData: [] });

  const saveDeviceMut = useMutation({
    mutationFn: (data) => data.id ? base44.entities.ProjectionDevice.update(data.id, data) : base44.entities.ProjectionDevice.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projectionDevices"] }); setShowDeviceForm(false); setEditingDevice(null); }
  });

  const deleteDeviceMut = useMutation({
    mutationFn: (id) => base44.entities.ProjectionDevice.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectionDevices"] })
  });

  const saveSceneMut = useMutation({
    mutationFn: (data) => data.id ? base44.entities.ProjectionScene.update(data.id, data) : base44.entities.ProjectionScene.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projectionScenes"] }); setShowSceneForm(false); setEditingScene(null); }
  });

  const deleteSceneMut = useMutation({
    mutationFn: (id) => base44.entities.ProjectionScene.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectionScenes"] })
  });

  const copyUrl = (device) => {
    const url = `${window.location.origin}${createPageUrl("DeviceView")}?device=${device.id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(device.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent to-primary mb-1">Gestor de Projeções</h1>
        <p className="text-accent text-sm">Controle múltiplos dispositivos de projeção simultaneamente</p>
      </div>

      <Tabs defaultValue="devices">
        <TabsList className="bg-card/50 border border-accent/20">
          <TabsTrigger value="devices" className="data-[state=active]:bg-accent/20"><Monitor className="w-4 h-4 mr-2" /> Dispositivos</TabsTrigger>
          <TabsTrigger value="scenes" className="data-[state=active]:bg-accent/20"><Layers className="w-4 h-4 mr-2" /> Cenas</TabsTrigger>
          <TabsTrigger value="help" className="data-[state=active]:bg-accent/20"><Info className="w-4 h-4 mr-2" /> Ajuda</TabsTrigger>
        </TabsList>

        <TabsContent value="devices" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { setEditingDevice(null); setShowDeviceForm(true); }} className="bg-gradient-to-r from-accent to-primary">
              <Plus className="w-4 h-4 mr-2" /> Novo Dispositivo
            </Button>
          </div>
          {devices.length === 0 ? (
            <Card className="bg-card/50 border-accent/20">
              <CardContent className="py-12 text-center text-accent">
                <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum dispositivo configurado. Adicione projetores, TVs e tablets.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map(device => (
                <div key={device.id}>
                  <DeviceCard
                    device={device}
                    onEdit={(d) => { setEditingDevice(d); setShowDeviceForm(true); }}
                    onDelete={(d) => deleteDeviceMut.mutate(d.id)}
                    onCopyUrl={copyUrl}
                  />
                  {copiedId === device.id && (
                    <p className="text-green-400 text-xs mt-1 text-center flex items-center justify-center gap-1"><Check className="w-3 h-3" /> Link copiado!</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scenes" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { setEditingScene(null); setShowSceneForm(true); }} className="bg-gradient-to-r from-accent to-primary">
              <Plus className="w-4 h-4 mr-2" /> Nova Cena
            </Button>
          </div>
          {scenes.length === 0 ? (
            <Card className="bg-card/50 border-accent/20">
              <CardContent className="py-12 text-center text-accent">
                <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhuma cena criada. Cenas permitem configurar múltiplos dispositivos de uma só vez.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenes.map(scene => (
                <Card key={scene.id} className="bg-card/50 border-accent/20">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-white">{scene.name}</CardTitle>
                        {scene.description && <p className="text-accent text-sm mt-1">{scene.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="border-accent/30" onClick={() => { setEditingScene(scene); setShowSceneForm(true); }}>Editar</Button>
                        <Button size="sm" variant="outline" className="border-red-500/30 text-red-400" onClick={() => deleteSceneMut.mutate(scene.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {scene.items?.map((item, i) => (
                        <div key={i} className="text-sm text-accent flex justify-between bg-black/20 rounded px-2 py-1">
                          <span>{item.device_name}</span>
                          <span className="text-accent">{item.content_type}</span>
                        </div>
                      ))}
                      {(!scene.items || scene.items.length === 0) && <p className="text-muted-foreground text-xs">Sem dispositivos atribuídos.</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="help" className="mt-4">
          <Card className="bg-card/50 border-accent/20">
            <CardContent className="space-y-4 text-sm text-accent/80">
              <div>
                <h3 className="text-white font-semibold mb-1">Como conectar cada dispositivo</h3>
                <ul className="list-disc list-inside space-y-2 text-accent">
                  <li><strong className="text-white">Projetor (HDMI):</strong> No ecrã principal, ao projetar uma música abre-se uma janela separada — arraste-a para o ecrã do projetor. Ou ligue via QR/URL como outros dispositivos.</li>
                  <li><strong className="text-white">Smart TV:</strong> Abra o browser da TV, clique em <em>QR</em> no cartão do dispositivo e aponte a câmara do telemóvel para abrir a URL na TV.</li>
                  <li><strong className="text-white">Tablet:</strong> Clique em <em>QR</em> no cartão e aponte a câmara do tablet para ligar.</li>
                  <li>O dispositivo aparece como <strong>"Online"</strong> no painel do operador.</li>
                  <li>No <strong>Painel do Operador</strong>, escolha o dispositivo e envie o conteúdo apropriado (letras/bíblia para projetor, vídeos/imagens para TV, etc.).</li>
                </ul>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Arquitetura</h3>
                <pre className="bg-black/30 rounded p-3 text-xs overflow-x-auto">{`PC Principal (Controlador)
  │
  ├── Projetor (HDMI) → Letras, Bíblia
  ├── TV (QR/URL)    → Vídeos, Imagens
  └── Tablet (QR)     → Controlo Remoto`}</pre>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Cenas</h3>
                <p className="text-accent">Cenas permitem configurar todos os dispositivos de uma só vez. Ex: "Entrada do Culto" envia "Seja bem-vindo" ao projetor e um vídeo de abertura à TV.</p>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Sincronização</h3>
                <p className="text-accent">A sincronização entre dispositivos funciona em tempo real através da base de dados. Todos os dispositivos devem estar autenticados na mesma conta.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DeviceForm open={showDeviceForm} device={editingDevice} onSave={(data) => saveDeviceMut.mutate(data)} onClose={() => { setShowDeviceForm(false); setEditingDevice(null); }} />
      <SceneForm open={showSceneForm} scene={editingScene} devices={devices} onSave={(data) => saveSceneMut.mutate(data)} onClose={() => { setShowSceneForm(false); setEditingScene(null); }} />
    </div>
  );
}