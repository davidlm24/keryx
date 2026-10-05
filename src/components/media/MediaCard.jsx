import React from 'react';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Video, FileText, Trash2, Send } from 'lucide-react';
import AddToServiceButton from '@/components/service/AddToServiceButton';

export default function MediaCard({ media, onDelete, onSendToProjection }) {
  const getIcon = () => {
    switch (media.type) {
      case 'video':
        return <Video className="w-6 h-6 text-accent" />;
      case 'presentation':
        return <FileText className="w-6 h-6 text-cyan-400" />;
      default:
        return <ImageIcon className="w-6 h-6 text-emerald-400" />;
    }
  };

  const getGradient = () => {
    switch (media.type) {
      case 'video':
        return 'from-accent to-primary';
      case 'presentation':
        return 'from-cyan-600 to-blue-500';
      default:
        return 'from-emerald-600 to-lime-500';
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-all duration-300 hover:shadow-xl">
      <div className="aspect-video relative overflow-hidden bg-slate-900">
        {media.type === 'video' ? (
          <video
            src={media.file_url}
            className="w-full h-full object-cover"
            preload="metadata"
          />
        ) : (
          <img
            src={media.thumbnail_url || media.file_url}
            alt={media.title}
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="absolute bottom-0 left-0 right-0 p-4 flex gap-2">
            <Button
              size="sm"
              onClick={() => onSendToProjection(media)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              Projetar
            </Button>
            <AddToServiceButton
              itemType={media.type === 'video' ? 'VIDEO' : media.type === 'pdf' ? 'PDF' : media.type === 'powerpoint' ? 'POWERPOINT' : 'IMAGE'}
              contentId={media.id}
              title={media.title}
              variant="secondary"
              size="sm"
            />
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete(media.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${getGradient()}`}>
            {getIcon()}
          </div>
          <h3 className="text-white font-medium line-clamp-1 flex-1">
            {media.title}
          </h3>
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getGradient()} text-white`}>
          {media.category}
        </span>
      </div>
    </div>
  );
}