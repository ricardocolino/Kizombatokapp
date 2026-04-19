import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { supabase } from '../supabaseClient';
import { Camera, Mic, MicOff, CameraOff, X, Users, Heart } from 'lucide-react';
import LiveChat from './LiveChat';
import { User, RealtimeChannel } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'motion/react';

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';

interface LiveHostProps {
  currentUser: User;
  onClose: () => void;
}

interface Gift {
  id: string;
  name: string;
  icon: string;
  price: number;
}

const LiveHost: React.FC<LiveHostProps> = ({ currentUser, onClose }) => {
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [liveTitle, setLiveTitle] = useState(`Live de ${currentUser.user_metadata?.username || 'user'}`);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [activeGift, setActiveGift] = useState<{ gift: Gift; senderName: string } | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const audioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const videoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const liveIdRef = useRef<string | null>(null);

  useEffect(() => {
    const initTracks = async () => {
      try {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        setLocalAudioTrack(audioTrack);
        setLocalVideoTrack(videoTrack);
        audioTrackRef.current = audioTrack;
        videoTrackRef.current = videoTrack;

        if (videoRef.current) {
          videoTrack.play(videoRef.current);
        }
      } catch (err) {
        console.error('Error initializing tracks:', err);
      }
    };

    initTracks();

    return () => {
      if (videoTrackRef.current) {
        videoTrackRef.current.stop();
        videoTrackRef.current.close();
      }
      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
        audioTrackRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!isStarting || !AGORA_APP_ID) return;

    let statusChannel: RealtimeChannel | null = null;
    let giftsChannel: RealtimeChannel | null = null;
    let agoraClient: IAgoraRTCClient | null = null;

    const startLiveSession = async () => {
      agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      agoraClient.setClientRole('host');
      clientRef.current = agoraClient;

      try {
        const audioTrack = audioTrackRef.current;
        const videoTrack = videoTrackRef.current;

        if (!audioTrack || !videoTrack) {
          console.error('Tracks not ready for publishing');
          return;
        }

        const channelName = `live_${currentUser.id}_${Date.now()}`;
        await agoraClient.join(AGORA_APP_ID, channelName, null, currentUser.id);
        await agoraClient.publish([audioTrack, videoTrack]);

        // Create live record in Supabase
        const { data, error } = await supabase.from('lives').insert({
          host_id: currentUser.id,
          title: liveTitle,
          status: 'active',
          channel_name: channelName,
        }).select().single();

        if (error) throw error;
        setLiveId(data.id);
        setLikesCount(data.likes_count || 0);
        liveIdRef.current = data.id;

        // Subscribe to viewer count updates
        statusChannel = supabase
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
              setLikesCount(payload.new.likes_count || 0);
            }
          )
          .subscribe();

        // Subscribe to gifts
        giftsChannel = supabase
          .channel(`live_gifts:${data.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'live_gifts',
              filter: `live_id=eq.${data.id}`,
            },
            async (payload) => {
              const [profileRes, giftRes] = await Promise.all([
                supabase.from('profiles').select('username, name').eq('id', payload.new.sender_id).single(),
                supabase.from('gift_types').select('*').eq('id', payload.new.gift_type_id).single()
              ]);

              if (profileRes.data && giftRes.data) {
                const displayName = profileRes.data.name || `@${profileRes.data.username}`;
                setActiveGift({ gift: giftRes.data, senderName: displayName });
                setTimeout(() => setActiveGift(null), 4000);
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Error starting live session:', err);
      }
    };

    startLiveSession();

    return () => {
      const cleanupSession = async () => {
        if (agoraClient) {
          await agoraClient.leave();
        }
        if (liveIdRef.current) {
          await supabase.from('lives').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', liveIdRef.current);
          liveIdRef.current = null;
        }
        if (statusChannel) supabase.removeChannel(statusChannel);
        if (giftsChannel) supabase.removeChannel(giftsChannel);
      };
      cleanupSession();
    };
  }, [currentUser.id, isStarting, liveTitle]);
 // Only depend on currentUser.id

  useEffect(() => {
    if (!isStarting || !liveId) return;

    const handleUnexpectedExit = () => {
      if (liveIdRef.current) {
        const currentId = liveIdRef.current;
        // Mark as ended in Supabase (fire and forget)
        supabase
          .from('lives')
          .update({ 
            status: 'ended', 
            ended_at: new Date().toISOString() 
          })
          .eq('id', currentId)
          .then(() => {
            console.log('Live ended due to unexpected exit');
          });
        
        // Cleanup Agora if possible
        if (clientRef.current) {
          clientRef.current.leave().catch(() => {});
        }
        
        onClose();
      }
    };

    const onVisibilityChange = () => {
      // If the app goes to background (e.g. phone call or switching apps), end the live
      if (document.visibilityState === 'hidden') {
        handleUnexpectedExit();
      }
    };

    const onPageHide = () => {
      handleUnexpectedExit();
    };

    const onOffline = () => {
      handleUnexpectedExit();
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('offline', onOffline);
    };
  }, [isStarting, liveId, onClose]);

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

      {/* Gift Overlay Notification */}
      <AnimatePresence>
        {activeGift && (
          <motion.div 
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            className="absolute top-1/4 left-4 z-50 flex items-center gap-3 bg-gradient-to-r from-yellow-500/90 to-orange-600/90 backdrop-blur-md rounded-full pl-1 pr-6 py-1 border border-white/20 shadow-2xl"
          >
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-2xl shadow-inner">
              {activeGift.gift.icon}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-white/70 uppercase tracking-wider">Presente Recebido!</span>
              <span className="text-sm font-black text-white leading-none">
                {activeGift.senderName} enviou {activeGift.gift.name}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col z-10 p-4 pointer-events-none">
        {/* Header */}
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2 bg-white/5 backdrop-blur-xl rounded-full px-3 py-1.5 border border-white/10">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-white">LIVE</span>
            {isStarting && (
              <>
                <div className="w-px h-3 bg-white/20 mx-1" />
                <div className="flex items-center gap-1 text-white/80">
                  <Users size={14} />
                  <span className="text-xs font-bold">{viewerCount}</span>
                </div>
                <div className="w-px h-3 bg-white/20 mx-1" />
                <div className="flex items-center gap-1 text-white/80">
                  <Heart size={14} fill="currentColor" className="text-red-500" />
                  <span className="text-xs font-bold">{likesCount}</span>
                </div>
              </>
            )}
          </div>

          <button 
            onClick={handleEndLive}
            className="w-10 h-10 bg-white/5 backdrop-blur-xl rounded-full flex items-center justify-center text-white border border-white/10 active:scale-90 transition-transform"
          >
            <X size={20} />
          </button>
        </div>

        {/* Setup Screen */}
        {!isStarting && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 pointer-events-auto">
            <div className="w-full max-w-xs space-y-4">
              <input 
                type="text"
                value={liveTitle}
                onChange={(e) => setLiveTitle(e.target.value)}
                placeholder="Título da sua live..."
                className="w-full bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl px-6 py-4 text-white font-bold placeholder:text-white/40 focus:outline-none focus:border-red-600 transition-colors shadow-2xl"
              />
              <button 
                onClick={() => setIsStarting(true)}
                className="w-full bg-red-600 text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-lg shadow-red-600/20 active:scale-95 transition-transform"
              >
                Começar Live
              </button>
            </div>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Prepara-te para entrar em direto!</p>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col justify-end mt-4 mb-4 overflow-hidden">
          {isStarting && liveId && (
            <div className="h-[320px] w-full pointer-events-auto">
              <LiveChat 
                liveId={liveId} 
                currentUser={currentUser} 
                isHost={true}
                extraActions={
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button 
                      onClick={toggleMute}
                      className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center border transition-all ${isMuted ? 'bg-red-600 border-red-600' : 'bg-white/5 backdrop-blur-xl border-white/20'}`}
                    >
                      {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                    <button 
                      onClick={toggleVideo}
                      className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center border transition-all ${isVideoOff ? 'bg-red-600 border-red-600' : 'bg-white/5 backdrop-blur-xl border-white/20'}`}
                    >
                      {isVideoOff ? <CameraOff size={16} /> : <Camera size={16} />}
                    </button>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveHost;
