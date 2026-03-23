
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Radio, Users, Heart, Share2, Shield } from 'lucide-react';
import { Profile } from '../types';
import { supabase } from '../supabaseClient';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

interface HostLiveProps {
  onClose: () => void;
  title: string;
  hostProfile: Profile;
}

const AGORA_APP_ID = 'dbed3d587ca34b93ae30fcec0b24b62d';

const HostLive: React.FC<HostLiveProps> = ({ onClose, title, hostProfile }) => {
  const [isLive, setIsLive] = useState(false);
  const [viewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<{ video: ICameraVideoTrack; audio: IMicrophoneAudioTrack } | null>(null);

  const stopLive = useCallback(async () => {
    try {
      if (liveId) {
        await supabase.from('lives').update({ status: 'ended' }).eq('id', liveId);
      }
      
      if (localTracksRef.current) {
        localTracksRef.current.video.stop();
        localTracksRef.current.video.close();
        localTracksRef.current.audio.stop();
        localTracksRef.current.audio.close();
      }
      
      if (clientRef.current) {
        await clientRef.current.leave();
      }
    } catch (err) {
      console.error("Error stopping live:", err);
    } finally {
      setIsLive(false);
      onClose();
    }
  }, [liveId, onClose]);

  const startCamera = useCallback(async () => {
    try {
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localTracksRef.current = { video: videoTrack, audio: audioTrack };
      
      if (videoRef.current) {
        videoTrack.play(videoRef.current);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Não foi possível aceder à câmara ou microfone.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopLive();
    };
  }, [startCamera, stopLive]);

  const startLive = async () => {
    if (!localTracksRef.current) return;

    try {
      setIsLive(true);
      
      // 1. Initialize Agora Client
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      clientRef.current = client;
      client.setClientRole('host');

      // 2. Join Channel
      const channelName = `live_${hostProfile.id}_${Date.now()}`;
      await client.join(AGORA_APP_ID, channelName, null, hostProfile.id);

      // 3. Publish Tracks
      await client.publish([localTracksRef.current.audio, localTracksRef.current.video]);

      // 4. Register Live in Supabase
      const { data: liveData, error: supabaseError } = await supabase
        .from('lives')
        .insert({
          host_id: hostProfile.id,
          title: title,
          status: 'live',
          agora_channel: channelName,
          viewer_count: 0
        })
        .select()
        .single();

      if (supabaseError) throw supabaseError;
      setLiveId(liveData.id);

      console.log("Live started successfully with Agora!");
    } catch (err) {
      console.error("Error starting live:", err);
      setError((err as Error).message);
      setIsLive(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden">
      {/* Camera Preview Container */}
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
              <img src={hostProfile.avatar_url || ''} className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-white text-sm font-black uppercase tracking-tighter">{hostProfile.username}</h3>
              <div className="flex items-center gap-2">
                <span className="bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded text-white uppercase">LIVE</span>
                <span className="text-white/60 text-[8px] font-bold flex items-center gap-1">
                  <Users size={10} /> {viewerCount}
                </span>
              </div>
            </div>
          </div>
          <button onClick={stopLive} className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white">
            <X size={24} />
          </button>
        </div>

        {/* Live Title */}
        <div className="mt-4">
          <h2 className="text-white text-lg font-black italic uppercase tracking-tight drop-shadow-lg">{title}</h2>
        </div>

        <div className="flex-1" />

        {/* Bottom Controls */}
        {!isLive ? (
          <div className="flex flex-col items-center gap-6 mb-12">
            <div className="bg-black/60 backdrop-blur-xl p-6 rounded-[32px] border border-white/10 text-center max-w-xs">
              <Radio size={48} className="text-red-600 mx-auto mb-4 animate-pulse" />
              <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">Pronto para a Banda?</h3>
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">A tua live vai aparecer no feed de todos os Kambas.</p>
            </div>
            <button 
              onClick={startLive}
              className="px-12 py-5 bg-red-600 text-white rounded-full font-black uppercase text-xs tracking-[0.2em] shadow-[0_0_50px_rgba(220,38,38,0.5)] active:scale-95 transition-all"
            >
              Iniciar Transmissão
            </button>
          </div>
        ) : (
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
              <button className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white">
                <Share2 size={24} />
              </button>
            </div>
          </div>
        )}
      </div>

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

export default HostLive;
