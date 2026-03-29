import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { supabase } from '../supabaseClient';
import { Camera, Mic, MicOff, CameraOff, X, Users, MessageCircle } from 'lucide-react';
import LiveChat from './LiveChat';
import { User } from '@supabase/supabase-js';

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';

interface LiveHostProps {
  currentUser: User;
  onClose: () => void;
}

const LiveHost: React.FC<LiveHostProps> = ({ currentUser, onClose }) => {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [showChat, setShowChat] = useState(true);
  const videoRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const audioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const videoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const liveIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const initLive = async () => {
      if (!AGORA_APP_ID) {
        console.error('Agora App ID is missing');
        return;
      }

      const agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      agoraClient.setClientRole('host');
      setClient(agoraClient);
      clientRef.current = agoraClient;

      try {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        setLocalAudioTrack(audioTrack);
        setLocalVideoTrack(videoTrack);
        audioTrackRef.current = audioTrack;
        videoTrackRef.current = videoTrack;

        if (videoRef.current) {
          videoTrack.play(videoRef.current);
        }

        const channelName = `live_${currentUser.id}_${Date.now()}`;
        await agoraClient.join(AGORA_APP_ID, channelName, null, currentUser.id);
        await agoraClient.publish([audioTrack, videoTrack]);

        // Create live record in Supabase
        const { data, error } = await supabase.from('lives').insert({
          host_id: currentUser.id,
          title: `Live de ${currentUser.user_metadata?.username || 'user'}`,
          status: 'active',
          channel_name: channelName,
        }).select().single();

        if (error) throw error;
        setLiveId(data.id);
        liveIdRef.current = data.id;

        // Subscribe to viewer count updates
        const channel = supabase
          .channel(`live_status:${data.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'lives',
              filter: `id=eq.${data.id}`,
            },
            (payload) => {
              setViewerCount(payload.new.viewer_count || 0);
            }
          )
          .subscribe();

        return channel;
      } catch (err) {
        console.error('Error initializing live:', err);
      }
    };

    let statusChannel: any;
    initLive().then(channel => {
      statusChannel = channel;
    });

    return () => {
      const cleanup = async () => {
        if (videoTrackRef.current) {
          videoTrackRef.current.stop();
          videoTrackRef.current.close();
        }
        if (audioTrackRef.current) {
          audioTrackRef.current.stop();
          audioTrackRef.current.close();
        }
        if (clientRef.current) {
          await clientRef.current.leave();
        }
        if (liveIdRef.current) {
          await supabase.from('lives').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', liveIdRef.current);
        }
        if (statusChannel) {
          supabase.removeChannel(statusChannel);
        }
      };
      cleanup();
    };
  }, [currentUser.id]);
 // Only depend on currentUser.id

  const toggleMute = () => {
    if (localAudioTrack) {
      localAudioTrack.setEnabled(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localVideoTrack) {
      localVideoTrack.setEnabled(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  const handleEndLive = async () => {
    if (window.confirm('Queres mesmo encerrar a live?')) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {/* Video Preview */}
      <div className="absolute inset-0 bg-zinc-900 overflow-hidden">
        <div ref={videoRef} className="w-full h-full" />
      </div>

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col z-10 p-4 pointer-events-none">
        {/* Header */}
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-white">LIVE</span>
            <div className="w-px h-3 bg-white/20 mx-1" />
            <div className="flex items-center gap-1 text-white/80">
              <Users size={14} />
              <span className="text-xs font-bold">{viewerCount}</span>
            </div>
          </div>

          <button 
            onClick={handleEndLive}
            className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 active:scale-90 transition-transform"
          >
            <X size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col justify-end mt-4 mb-20">
          {showChat && liveId && (
            <div className="h-1/2 pointer-events-auto">
              <LiveChat liveId={liveId} currentUser={currentUser} />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 pointer-events-auto">
          <button 
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${isMuted ? 'bg-red-600 border-red-600' : 'bg-black/40 border-white/20'}`}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button 
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${isVideoOff ? 'bg-red-600 border-red-600' : 'bg-black/40 border-white/20'}`}
          >
            {isVideoOff ? <CameraOff size={20} /> : <Camera size={20} />}
          </button>
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${showChat ? 'bg-white text-black border-white' : 'bg-black/40 border-white/20'}`}
          >
            <MessageCircle size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveHost;
