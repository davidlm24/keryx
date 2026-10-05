import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Wand2 } from 'lucide-react';

export default function SongForm({ song, onSubmit, onCancel, isLoading }) {
  const [formData, setFormData] = useState(song || {
    title: '',
    artist: '',
    lyrics: '',
    category: 'worship',
    bpm: null,
    song_key: '',
    musician_notes: '',
    font_size: 'large',
    font_family: 'sans',
    text_effect: 'shadow',
    text_color: '#ffffff',
    text_color_2: '',
    background_image: '',
    slides: [],
    is_favorite: false,
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const detectChorus = (text) => /^\s*(\[?\s*(refr[ãa]o|coro)\s*:?\s*\]?)/i.test(text);

  const processLyrics = () => {
    if (!formData.lyrics) return;
    const blocks = formData.lyrics.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    if (blocks.length > 1) {
      const slides = blocks.map(b => ({ text: b, duration: 10, is_chorus: detectChorus(b) }));
      handleChange('slides', slides);
    } else {
      const lines = formData.lyrics.split('\n').filter(l => l.trim());
      const slides = [];
      for (let i = 0; i < lines.length; i += 4) {
        const text = lines.slice(i, i + 4).join('\n');
        if (text.trim()) slides.push({ text, duration: 10, is_chorus: detectChorus(text) });
      }
      handleChange('slides', slides.length > 0 ? slides : [{ text: formData.lyrics, duration: 30 }]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    if (!data.slides || data.slides.length === 0) {
      data.slides = [{ text: data.lyrics, duration: 30 }];
    }
    if (data.bpm !== null && data.bpm !== '') data.bpm = parseInt(data.bpm) || null;
    onSubmit(data);
  };

  return (
    <div className="glass-effect rounded-3xl p-8 border border-white/10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">
          {song ? 'Editar Música' : 'Nova Música'}
        </h2>
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-gray-400 hover:text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-white">Título *</Label>
            <Input
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Nome da música"
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white">Artista</Label>
            <Input
              value={formData.artist}
              onChange={(e) => handleChange('artist', e.target.value)}
              placeholder="Nome do artista"
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-white">Categoria</Label>
            <Select value={formData.category} onValueChange={(v) => handleChange('category', v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="worship">Adoração</SelectItem>
                <SelectItem value="praise">Louvor</SelectItem>
                <SelectItem value="hymn">Hino</SelectItem>
                <SelectItem value="contemporary">Contemporâneo</SelectItem>
                <SelectItem value="infantil">Infantil</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">BPM</Label>
            <Input
              type="number"
              value={formData.bpm || ''}
              onChange={(e) => handleChange('bpm', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Ex: 120"
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white">Tonalidade</Label>
            <Input
              value={formData.song_key || ''}
              onChange={(e) => handleChange('song_key', e.target.value)}
              placeholder="Ex: C, G, Am"
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-white">Letra</Label>
          <Textarea
            value={formData.lyrics}
            onChange={(e) => handleChange('lyrics', e.target.value)}
            placeholder={"Escreva a letra da música...\n\nDica: separe estrofes com linha em branco. Escreva [Refrão] para destacar."}
            rows={8}
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-white">Notas para Músicos</Label>
          <Textarea
            value={formData.musician_notes || ''}
            onChange={(e) => handleChange('musician_notes', e.target.value)}
            placeholder="Ex: capo 2, introdução 4 compassos..."
            rows={2}
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
          />
        </div>

        <Button type="button" onClick={processLyrics} disabled={!formData.lyrics}
          className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white">
          <Wand2 className="w-4 h-4 mr-2" />
          Gerar Slides Automaticamente
        </Button>

        {formData.slides?.length > 0 && (
          <p className="text-sm text-emerald-300 text-center">{formData.slides.length} slides gerados</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="space-y-2">
            <Label className="text-white">Tamanho da Fonte</Label>
            <Select value={formData.font_size || 'large'} onValueChange={(v) => handleChange('font_size', v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xsmall">X-Pequeno</SelectItem>
                <SelectItem value="small">Pequeno</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="large">Grande</SelectItem>
                <SelectItem value="xlarge">X-Grande</SelectItem>
                <SelectItem value="xxlarge">Gigante</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Fonte</Label>
            <Select value={formData.font_family || 'sans'} onValueChange={(v) => handleChange('font_family', v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sans">Sans Serif</SelectItem>
                <SelectItem value="serif">Serif</SelectItem>
                <SelectItem value="mono">Monospace</SelectItem>
                <SelectItem value="cursive">Cursiva</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Efeito</Label>
            <Select value={formData.text_effect || 'shadow'} onValueChange={(v) => handleChange('text_effect', v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shadow">Sombra</SelectItem>
                <SelectItem value="glow">Brilho</SelectItem>
                <SelectItem value="outline">Contorno</SelectItem>
                <SelectItem value="3d">3D</SelectItem>
                <SelectItem value="neon">Neon</SelectItem>
                <SelectItem value="none">Nenhum</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-white">Cor do Texto</Label>
          <div className="flex gap-2 items-center">
            <Input type="color" value={formData.text_color || '#ffffff'} onChange={(e) => handleChange('text_color', e.target.value)}
              className="w-16 h-12 p-1 bg-white/5 border-white/10" />
            <Input type="text" value={formData.text_color || '#ffffff'} onChange={(e) => handleChange('text_color', e.target.value)}
              placeholder="#ffffff" className="flex-1 bg-white/5 border-white/10 text-white" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
          <Button type="button" variant="outline" onClick={onCancel}
            className="border-white/10 text-white hover:bg-white/10">Cancelar</Button>
          <Button type="submit" disabled={isLoading}
            className="bg-gradient-to-r from-emerald-600 to-lime-500 hover:from-emerald-700 hover:to-lime-600 text-white">
            {isLoading ? 'A guardar...' : song ? 'Atualizar' : 'Criar Música'}
          </Button>
        </div>
      </form>
    </div>
  );
}