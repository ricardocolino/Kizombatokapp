
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Users, Heart, Share2, Shield, Gift } from 'lucide-react';
import { Profile, Live } from '../types';
import { supabase } from '../supabaseClient';
import { parseMediaUrl } from '../services/mediaUtils';
import AgoraRTC, { IAgoraRTCClient } from 'agora-rtc-sdk-ng';

interface ViewerLiveProps {
  onClose: () => void;
  live: Live;
  currentUser: Profile | null;
}

const AGORA_APP_ID = 'dbed3d587ca34b93ae30fcec0b24b62d';

const ViewerLive: React.FC<ViewerLiveProps> = ({ onClose, live, currentUser }) => {
  const [viewerCount, setViewerCount] = useState(live.viewer_count || 0);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);

  const updateViewerCount = useCallback(async (delta: number) => {
    try {
      const { data: currentLive } = await supabase.from('lives').select('viewer_count').eq('id', live.id).single();
      const newCount = Math.max(0, (currentLive?.viewer_count || 0) + delta);
      await supabase.from('lives').update({ viewer_count: newCount }).eq('id', live.id);
      setViewerCount(newCount);
    } catch (err) {
      console.error("Error updating viewer count:", err);
    }
  }, [live.id]);

  const connectToLive = useCallback(async () => {
    try {
      setIsConnecting(true);
      
      // 1. Initialize Agora Client
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      clientRef.current = client;
      client.setClientRole('audience');

      // 2. Handle remote tracks
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') {
          const remoteVideoTrack = user.videoTrack;
          if (videoRef.current) {
            remoteVideoTrack?.play(videoRef.current);
          }
        }
        if (mediaType === 'audio') {
          const remoteAudioTrack = user.audioTrack;
          remoteAudioTrack?.play();
        }
      });

      // 3. Join Channel
      await client.join(AGORA_APP_ID, live.agora_channel, null, currentUser?.id || null);
      
      setIsConnecting(false);
      console.log("Connected to Agora live successfully!");
    } catch (err) {
      console.error("Error connecting to live:", err);
      setError("Não foi possível ligar à transmissão.");
      setIsConnecting(false);
    }
  }, [live.agora_channel, currentUser?.id]);

  const disconnectFromLive = useCallback(async () => {
    try {
      if (clientRef.current) {
        await clientRef.current.leave();
      }
    } catch (err) {
      console.error("Error leaving Agora channel:", err);
    } finally {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    connectToLive();
    updateViewerCount(1);
    
    return () => {
      disconnectFromLive();
      updateViewerCount(-1);
    };
  }, [connectToLive, disconnectFromLive, updateViewerCount]);

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden">
      {/* Live Video Container */}
      <div 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Overlay UI */}
      <div className="relative z-10 h-full flex flex-col p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-red-600 overflow-hidden">
              <img src={parseMediaUrl(live.profiles?.avatar_url || '')} className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-white text-sm font-black uppercase tracking-tighter">{live.profiles?.username}</h3>
              <div className="flex items-center gap-2">
                <span className="bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded text-white uppercase">LIVE</span>
                <span className="text-white/60 text-[8px] font-bold flex items-center gap-1">
                  <Users size={10} /> {viewerCount}
                </span>
              </div>
            </div>
          </div>
          <button onClick={disconnectFromLive} className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white">
            <X size={24} />
          </button>
        </div>

        {/* Live Title */}
        <div className="mt-4">
          <h2 className="text-white text-lg font-black italic uppercase tracking-tight drop-shadow-lg">{live.title}</h2>
        </div>

        <div className="flex-1" />

        {/* Bottom Controls */}
        <div className="flex flex-col gap-4 mb-8">
          {/* Fake Chat for UI feel */}
          <div className="h-48 overflow-y-auto flex flex-col gap-2 mask-linear-gradient">
            <div className="flex items-center gap-2 bg-black/20 backdrop-blur-sm p-2 rounded-xl self-start">
              <span className="text-yellow-500 text-[10px] font-black">Kamba_123:</span>
              <span className="text-white text-[10px] font-bold">Bora lá! 🔥</span>
            </div>
            <div className="flex items-center gap-2 bg-black/20 backdrop-blur-sm p-2 rounded-xl self-start">
              <span className="text-blue-400 text-[10px] font-black">Angola_Vibe:</span>
              <span className="text-white text-[10px] font-bold">Essa live tá rija! 🇦🇴</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-12 bg-black/40 backdrop-blur-md rounded-full border border-white/10 px-4 flex items-center text-white/40 text-[10px] font-bold uppercase tracking-widest">
              Diz alguma coisa...
            </div>
            <button className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white">
              <Heart size={24} />
            </button>
            <button className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center text-black shadow-[0_0_30px_rgba(234,179,8,0.4)]">
              <Gift size={24} />
            </button>
            <button className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white">
              <Share2 size={24} />
            </button>
          </div>
        </div>
      </div>

      {isConnecting && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-[250]">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white font-black uppercase text-[10px] tracking-widest">A ligar à banda...</p>
        </div>
      )}

      {error && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-950 p-8 rounded-3xl border border-red-600/30 text-center z-[300]">
          <Shield size={48} className="text-red-600 mx-auto mb-4" />
          <p className="text-white font-black uppercase text-xs tracking-widest">{error}</p>
          <button onClick={onClose} className="mt-6 text-red-600 font-black uppercase text-[10px]">Fechar</button>
        </div>
      )}
    </div>
  );
};

export default ViewerLive;
