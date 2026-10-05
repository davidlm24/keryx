import React from 'react';
import { Button } from '@/components/ui/button';
import { Music, Edit, Trash2, Heart, Video, FileText } from 'lucide-react';
import { useThemeColors } from '@/hooks/useThemeColors';
import AddToServiceButton from '@/components/service/AddToServiceButton';

export default function SongCard({ song, onEdit, onDelete }) {
  const themeColors = useThemeColors();
  const getCategoryColor = (category) => {
    const colors = {
      worship: 'from-accent to-primary',
      praise: 'from-emerald-600 to-lime-500',
      hymn: 'from-blue-600 to-cyan-500',
      contemporary: 'from-cyan-600 to-blue-500',
      infantil: 'from-yellow-600 to-orange-500',
      ceia: 'from-amber-600 to-red-500',
      other: 'from-gray-600 to-gray-500',
      outro: 'from-gray-600 to-gray-500',
    };
    return colors[category] || colors.other;
  };

  const getCategoryLabel = (category) => {
    const labels = {
      worship: 'Adoração', praise: 'Louvor', hymn: 'Hino', contemporary: 'Contemporâneo',
      infantil: 'Infantil', ceia: 'Ceia', other: 'Outro', outro: 'Outro',
    };
    return labels[category] || 'Outro';
  };

  const slideCount = song.slides?.length || (song.lyrics ? song.lyrics.split(/\n\s*\n/).filter(b => b.trim()).length || 1 : 0);

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 transition-all duration-300 hover:shadow-xl"
      style={{ ['--hover-border']: `${themeColors.primary}50`, ['--hover-shadow']: `${themeColors.primary}1a` }}>
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }} />
      </div>

      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl bg-gradient-to-br ${getCategoryColor(song.category)} shadow-lg`}>
            <Music className="w-6 h-6 text-white" />
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <AddToServiceButton itemType="SONG" contentId={song.id} title={song.title} />
            <Button size="icon" variant="ghost" onClick={() => onEdit(song)}
              className="h-8 w-8 bg-white/10 hover:bg-white/20 text-white">
              <Edit className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => onDelete(song.id)}
              className="h-8 w-8 bg-red-500/20 hover:bg-red-500/30 text-red-400">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-white font-bold text-lg line-clamp-1">{song.title}</h3>
          {song.is_favorite && <Heart className="w-4 h-4 text-pink-400 fill-current shrink-0" />}
        </div>
        <p className="text-gray-400 text-sm mb-2">{song.artist || 'Artista desconhecido'}</p>

        {(song.song_key || song.bpm) && (
          <p className="text-gray-500 text-xs mb-4">
            {song.song_key && `Tom: ${song.song_key}`}
            {song.song_key && song.bpm && ' • '}
            {song.bpm && `BPM: ${song.bpm}`}
          </p>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <span className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getCategoryColor(song.category)} text-white`}>
            {getCategoryLabel(song.category)}
          </span>
          <div className="flex items-center gap-2">
            {song.audio_url ? (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Video className="w-3 h-3" />Vídeo
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <FileText className="w-3 h-3" />Só letra
              </span>
            )}
            <span className="text-gray-500 text-sm">{slideCount} slides</span>
          </div>
        </div>
      </div>
    </div>
  );
}