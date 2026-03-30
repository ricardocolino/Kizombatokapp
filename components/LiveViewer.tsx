import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { supabase } from '../supabaseClient';
import { X, Users, Heart, Gift as GiftIcon } from 'lucide-react';
import LiveChat from './LiveChat';
import GiftPicker from './GiftPicker';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '@supabase/supabase-js';

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';

interface LiveViewerProps {
  liveId: string;
  currentUser: User | null;
  onClose: () => void;
}

interface LiveData {
  id: string;
  host_id: string;
  title: string;
  channel_name: string;
  viewer_count: number;
  profiles: {
    username: string;
    avatar_url: string;
  };
}

interface Gift {
  id: string;
  name: string;
  icon: string;
  price: number;
}

const LiveViewer: React.FC<LiveViewerProps> = ({ liveId, currentUser, onClose }) => {
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const [status, setStatus] = useState<string>('Conectando...');
  const [activeGift, setActiveGift] = useState<{ gift: Gift; senderName: string } | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);
  const clientRef = useRef<IAgoraRTCClient | null>(null);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const fetchLiveData = async () => {
      try {
        const { data, error } = await supabase
          .from('lives')
          .select('*, profiles(username, avatar_url)')
          .eq('id', liveId)
          .single();

        if (error) throw error;
        setLiveData(data);
        setViewerCount(data.viewer_count || 0);
        await initAgora(data.channel_name);
      } catch (error) {
        console.error('Error fetching live data:', error);
        setStatus('Erro ao carregar dados da live');
        setTimeout(onClose, 3000);
      }
    };

    const initAgora = async (channelName: string) => {
      if (!AGORA_APP_ID) {
        setStatus('Erro: App ID do Agora não configurado');
        return;
      }

      const agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      agoraClient.setClientRole('audience');
      clientRef.current = agoraClient;

      let signalTimeout: ReturnType<typeof setTimeout> | null = null;

      agoraClient.on('user-published', async (user, mediaType) => {
        try {
          setStatus(`Recebendo ${mediaType === 'video' ? 'vídeo' : 'áudio'}...`);
          await agoraClient.subscribe(user, mediaType);
          console.log('Subscribed to user:', user.uid, mediaType);
          
          if (mediaType === 'video') {
            if (videoRef.current) {
              user.videoTrack?.play(videoRef.current);
              setStatus(''); // Sinal recebido com sucesso
              if (signalTimeout) clearTimeout(signalTimeout);
            }
          }
          if (mediaType === 'audio') {
            user.audioTrack?.play();
          }
        } catch (err) {
          console.error('Error subscribing to user:', err);
          setStatus('Erro ao processar sinal do host');
        }
      });

      agoraClient.on('user-unpublished', (user) => {
        console.log('User unpublished:', user.uid);
        setStatus('Host parou de transmitir');
      });

      try {
        setStatus('Entrando no canal...');
        await agoraClient.join(AGORA_APP_ID, channelName, null, currentUser?.id || null);
        setStatus('Aguardando sinal do host...');
        
        // Timeout de 15 segundos para sinal
        signalTimeout = setTimeout(() => {
          setStatus('Sinal do host não detectado. Verifique se o host ainda está online.');
        }, 15000);

        // Increment viewer count
        await supabase.rpc('increment_viewer_count', { live_id: liveId });
      } catch (err) {
        console.error('Error joining live:', err);
        setStatus('Erro ao entrar no canal de voz/vídeo');
      }
    };

    fetchLiveData();

    // Subscribe to viewer count and status updates
    const channel = supabase
      .channel(`live_status:${liveId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lives',
          filter: `id=eq.${liveId}`,
        },
        (payload) => {
          setViewerCount(payload.new.viewer_count || 0);
          if (payload.new.status === 'ended') {
            onClose();
          }
        }
      )
      .subscribe();

    // Subscribe to gifts
    const giftsChannel = supabase
      .channel(`live_gifts:${liveId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_gifts',
          filter: `live_id=eq.${liveId}`,
        },
        async (payload) => {
          const [profileRes, giftRes] = await Promise.all([
            supabase.from('profiles').select('username').eq('id', payload.new.sender_id).single(),
            supabase.from('gift_types').select('*').eq('id', payload.new.gift_type_id).single()
          ]);

          if (profileRes.data && giftRes.data) {
            setActiveGift({ gift: giftRes.data, senderName: profileRes.data.username });
            setTimeout(() => setActiveGift(null), 4000);
          }
        }
      )
      .subscribe();

    return () => {
      const cleanup = async () => {
        if (clientRef.current) {
          await clientRef.current.leave();
          clientRef.current.removeAllListeners();
        }
        supabase.removeChannel(channel);
        supabase.removeChannel(giftsChannel);
        // Decrement viewer count
        await supabase.rpc('decrement_viewer_count', { live_id: liveId });
      };
      cleanup();
    };
  }, [liveId, currentUser?.id, onClose]);

  const sendHeart = () => {
    const id = Date.now();
    const x = Math.random() * 100 - 50;
    setHearts((prev) => [...prev, { id, x }]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {/* Video Container */}
      <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center overflow-hidden">
        <div ref={videoRef} className="w-full h-full" />
        {status && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-20 p-6 text-center">
            <div className="text-white/60 text-sm font-medium flex flex-col items-center gap-4">
              {!status.includes('Erro') && !status.includes('não detectado') && (
                <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              )}
              <p className="max-w-xs">{status}</p>
              {(status.includes('Erro') || status.includes('não detectado')) && (
                <button 
                  onClick={() => window.location.reload()}
                  className="mt-2 px-4 py-2 bg-white text-black rounded-full text-xs font-bold active:scale-95 transition-transform"
                >
                  Tentar Novamente
                </button>
              )}
            </div>
          </div>
        )}
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
              <span className="text-[10px] font-black text-white/70 uppercase tracking-wider">Presente!</span>
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
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
            <img 
              src={liveData?.profiles?.avatar_url || `https://picsum.photos/seed/${liveData?.host_id}/100/100`}
              alt={liveData?.profiles?.username}
              className="w-8 h-8 rounded-full border border-white/20 object-cover"
            />
            <div className="flex flex-col">
              <span className="text-xs font-black text-white">@{liveData?.profiles?.username || 'host'}</span>
              <div className="flex items-center gap-1 text-white/60">
                <Users size={10} />
                <span className="text-[10px] font-bold">{viewerCount}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 active:scale-90 transition-transform"
          >
            <X size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col justify-end mt-4 mb-4 overflow-hidden">
          <div className="h-[320px] w-full pointer-events-auto">
            <LiveChat 
              liveId={liveId} 
              currentUser={currentUser} 
              extraActions={
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button 
                    onClick={() => setShowGiftPicker(true)}
                    className="flex-shrink-0 w-9 h-9 bg-yellow-500 rounded-full flex items-center justify-center text-black active:scale-90 transition-transform shadow-lg shadow-yellow-500/20"
                  >
                    <GiftIcon size={16} />
                  </button>
                  <button 
                    onClick={sendHeart}
                    className="flex-shrink-0 w-9 h-9 bg-red-600 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg shadow-red-600/20"
                  >
                    <Heart size={16} fill="currentColor" />
                  </button>
                </div>
              }
            />
          </div>
        </div>

        {/* Floating Hearts */}
        <div className="absolute bottom-32 right-8 pointer-events-none">
          <AnimatePresence>
            {hearts.map((heart) => (
              <motion.div
                key={heart.id}
                initial={{ opacity: 1, y: 0, x: 0, scale: 0.5 }}
                animate={{ opacity: 0, y: -200, x: heart.x, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: "easeOut" }}
                className="absolute text-red-500"
              >
                <Heart size={24} fill="currentColor" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Gift Picker */}
      <AnimatePresence>
        {showGiftPicker && (
          <GiftPicker 
            liveId={liveId} 
            currentUser={currentUser} 
            onClose={() => setShowGiftPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default LiveViewer;
