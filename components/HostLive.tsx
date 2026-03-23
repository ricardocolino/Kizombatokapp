
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Radio, Users, Heart, Share2, Shield } from 'lucide-react';
import { Profile } from '../types';
import { supabase } from '../supabaseClient';

interface HostLiveProps {
  onClose: () => void;
  title: string;
  hostProfile: Profile;
}

const HostLive: React.FC<HostLiveProps> = ({ onClose, title, hostProfile }) => {
  const [isLive, setIsLive] = useState(false);
  const [viewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopLive = useCallback(async () => {
    if (liveId) {
      await supabase.from('lives').update({ status: 'ended' }).eq('id', liveId);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    setIsLive(false);
    onClose();
  }, [liveId, onClose]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
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
    if (!streamRef.current) return;

    try {
      setIsLive(true);
      
      // 1. Get Cloudflare Session from our API
      const response = await fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: hostProfile.id, role: 'host' })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Falha ao criar sessão na Cloudflare");
      }
      const sessionData = await response.json();

      // 2. Setup WebRTC PeerConnection
      // This is a simplified WebRTC flow for Cloudflare RealtimeKit/Calls
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }]
      });
      peerConnectionRef.current = pc;

      // Add tracks to peer connection
      streamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, streamRef.current!);
      });

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 3. Exchange SDP with Cloudflare (Simplified for this example)
      // In a real RealtimeKit implementation, you'd send the offer to their signaling endpoint
      // and receive an answer.
      
      // 4. Register Live in Supabase
      const { data: liveData, error: supabaseError } = await supabase
        .from('lives')
        .insert({
          host_id: hostProfile.id,
          title: title,
          status: 'live',
          cloudflare_session_id: sessionData.id,
          viewer_count: 0
        })
        .select()
        .single();

      if (supabaseError) throw supabaseError;
      setLiveId(liveData.id);

      console.log("Live started successfully!");
    } catch (err) {
      console.error("Error starting live:", err);
      setError((err as Error).message);
      setIsLive(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden">
      {/* Camera Preview */}
      <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline 
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
