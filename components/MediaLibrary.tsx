import React, { useEffect, useState } from 'react';
import { Media, MediaAsset, MediaAlbum } from '@capacitor-community/media';
import { X, Check, Image as ImageIcon, Play, Search } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { motion } from 'motion/react';

interface MediaLibraryProps {
  onSelect: (files: File[]) => void;
  onClose: () => void;
  maxSelections?: number;
}

const MediaItem: React.FC<{ asset: MediaAsset; onSelect: (id: string) => void; isSelected: boolean; formatDuration: (s: number) => string }> = ({ asset, onSelect, isSelected, formatDuration }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const getUrl = async () => {
      try {
        const { url: assetUrl } = await Media.getAssetUrl({ identifier: asset.identifier });
        setUrl(Capacitor.convertFileSrc(assetUrl));
      } catch (err) {
        console.error('Error getting asset URL:', err);
      }
    };
    getUrl();
  }, [asset.identifier]);

  return (
    <button
      onClick={() => onSelect(asset.identifier)}
      className="relative aspect-[3/4] bg-zinc-200 overflow-hidden group"
    >
      {url ? (
        <img 
          src={url}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-zinc-100">
          <ImageIcon size={20} className="text-zinc-300" />
        </div>
      )}

      {/* Selection Overlay */}
      <div className={`absolute inset-0 transition-all ${isSelected ? 'bg-yellow-400/30 border-4 border-yellow-400' : 'bg-transparent'}`}>
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-black">
            <Check size={14} strokeWidth={4} />
          </div>
        )}
      </div>

      {/* Video Duration */}
      {asset.type === 'video' && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-black text-white drop-shadow-md">
          <Play size={10} fill="currentColor" />
          {formatDuration(asset.duration || 0)}
        </div>
      )}
    </button>
  );
};

const MediaLibrary: React.FC<MediaLibraryProps> = ({ onSelect, onClose, maxSelections = 5 }) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [albums, setAlbums] = useState<MediaAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'camera_roll' | 'memories'>('camera_roll');

  useEffect(() => {
    const loadMedia = async () => {
      try {
        setLoading(true);
        
        // Check and request permissions
        let permission = await Media.checkPermissions();
        console.log('Current media permissions:', permission);
        
        if (permission.photos !== 'granted' && permission.photos !== 'limited') {
          try {
            permission = await Media.requestPermissions();
          } catch {
            // Em Android 13+, ignorar erro e tentar carregar mesmo assim
          }
        }

        // Get albums
        const { albums: fetchedAlbums } = await Media.getAlbums();
        setAlbums(fetchedAlbums);

        // Get assets
        const { assets: fetchedAssets } = await Media.getAssets({
          albumIdentifier: selectedAlbum || undefined,
          types: ['photos', 'videos'],
          limit: 100, // Load first 100
        });
        
        setAssets(fetchedAssets);
      } catch (err) {
        console.error('Error loading media:', err);
        alert('Erro ao carregar a galeria. Verifique as permissões.');
        onClose();
      } finally {
        setLoading(false);
      }
    };

    loadMedia();
  }, [selectedAlbum, onClose]);

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds(prev => {
      if (prev.includes(assetId)) {
        return prev.filter(id => id !== assetId);
      }
      if (prev.length >= maxSelections) return prev;
      return [...prev, assetId];
    });
  };

  const handleConfirm = async () => {
    if (selectedAssetIds.length === 0) return;

    try {
      const selectedFiles: File[] = [];
      
      for (const id of selectedAssetIds) {
        const asset = assets.find(a => a.identifier === id);
        if (!asset) continue;

        const { url } = await Media.getAssetUrl({ identifier: id });
        const response = await fetch(Capacitor.convertFileSrc(url));
        const blob = await response.blob();
        
        const fileName = asset.name || `media_${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
        const file = new File([blob], fileName, { type: blob.type });
        selectedFiles.push(file);
      }

      onSelect(selectedFiles);
    } catch (err) {
      console.error('Error selecting media:', err);
      alert('Erro ao carregar ficheiros selecionados');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[100] bg-white flex flex-col"
    >
      {/* Header */}
      <div className="px-4 pt-6 pb-2 flex items-center justify-between border-b border-zinc-100">
        <button onClick={onClose} className="p-2 -ml-2 text-zinc-400">
          <X size={24} />
        </button>
        <h2 className="text-lg font-black uppercase tracking-widest text-zinc-900">Memórias</h2>
        <div className="flex items-center gap-2">
          {selectedAssetIds.length > 0 && (
            <button 
              onClick={handleConfirm}
              className="bg-yellow-400 text-black px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2"
            >
              <Check size={14} />
              Criar
            </button>
          )}
          <button className="p-2 text-zinc-400">
            <Search size={20} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-6 border-b border-zinc-100">
        <button 
          onClick={() => setActiveTab('memories')}
          className={`py-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'memories' ? 'text-zinc-900' : 'text-zinc-400'}`}
        >
          Snaps
          {activeTab === 'memories' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400" />}
        </button>
        <button 
          onClick={() => setActiveTab('camera_roll')}
          className={`py-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'camera_roll' ? 'text-zinc-900' : 'text-zinc-400'}`}
        >
          Rolo da Câmara
          {activeTab === 'camera_roll' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400" />}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-zinc-50">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {assets.map((asset) => (
              <MediaItem 
                key={asset.identifier}
                asset={asset}
                onSelect={toggleAssetSelection}
                isSelected={selectedAssetIds.includes(asset.identifier)}
                formatDuration={formatDuration}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer / Album Selector */}
      <div className="p-4 bg-white border-t border-zinc-100 flex items-center gap-4 overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setSelectedAlbum(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${!selectedAlbum ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}
        >
          Recentes
        </button>
        {albums.map(album => (
          <button 
            key={album.identifier}
            onClick={() => setSelectedAlbum(album.identifier)}
            className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedAlbum === album.identifier ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}
          >
            {album.name}
          </button>
        ))}
      </div>
    </motion.div>
  );
};

export default MediaLibrary;
