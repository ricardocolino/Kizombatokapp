import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { supabase } from '../supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';
import { X, Users, Heart, Gift as GiftIcon, Plus } from 'lucide-react';
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

interface RankedUser {
  userId: string;
  username: string;
  name: string;
  avatarUrl: string;
  points: number;
}

const LiveViewer: React.FC<LiveViewerProps> = ({ liveId, currentUser, onClose }) => {
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [isFollowingHost, setIsFollowingHost] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [ranking, setRanking] = useState<Record<string, RankedUser>>({});
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const [status, setStatus] = useState<string>('Conectando...');
  const [activeGift, setActiveGift] = useState<{ gift: Gift; senderName: string } | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);

  const updatePoints = (userId: string, points: number, profile?: { username: string; name: string | null; avatar_url: string }) => {
    setRanking(prev => {
      const existing = prev[userId] || {
        userId,
        username: profile?.username || 'user',
        name: profile?.name || profile?.username || 'User',
        avatarUrl: profile?.avatar_url || `https://picsum.photos/seed/${userId}/100/100`,
        points: 0
      };
      
      const updated = {
        ...existing,
        points: existing.points + points
      };

      // Ensure we keep the latest profile if provided
      if (profile) {
        updated.username = profile.username;
        updated.name = profile.name || profile.username;
        if (profile.avatar_url) {
          updated.avatarUrl = profile.avatar_url;
        }
      }

      return { ...prev, [userId]: updated };
    });
  };

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Initialize broadcast channel
    const broadcastChannel = supabase.channel(`live_messages:${liveId}`);
    broadcastChannelRef.current = broadcastChannel;

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
        setLikesCount(data.likes_count || 0);

        // Check if following host
        if (currentUser) {
          const { data: followData } = await supabase
            .from('follows')
            .select('*')
            .eq('follower_id', currentUser.id)
            .eq('following_id', data.host_id)
            .single();
          setIsFollowingHost(!!followData);
        }

        // Check for block signals in history
        if (currentUser) {
          const { data: blockMsgs } = await supabase
            .from('live_messages')
            .select('content')
            .eq('live_id', liveId)
            .ilike('content', `__MOD_BLOCK:${currentUser.id}__`);
          
          if (blockMsgs && blockMsgs.length > 0) {
            alert('Foste bloqueado desta live e não podes entrar.');
            onClose();
            return;
          }
        }

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

        // Send Join Notice
        if (currentUser && broadcastChannelRef.current) {
          broadcastChannelRef.current.send({
            type: 'broadcast',
            event: 'system_notice',
            payload: { 
              type: 'join', 
              userId: currentUser.id,
              username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'User',
              name: currentUser.user_metadata?.name || null,
              avatarUrl: currentUser.user_metadata?.avatar_url || null
            }
          });
        }
      } catch (err) {
        console.error('Error joining live:', err);
        setStatus('Erro ao entrar no canal de voz/vídeo');
      }
    };

    fetchLiveData();

    // Subscribe to status and system notices
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
          setLikesCount(payload.new.likes_count || 0);
          if (payload.new.status === 'ended') {
            onClose();
          }
        }
      )
      .on('broadcast', { event: 'system_notice' }, (payload) => {
        if (payload.payload.type === 'like' && payload.payload.userId) {
          updatePoints(payload.payload.userId, 1, {
            username: payload.payload.username,
            name: payload.payload.name,
            avatar_url: payload.payload.avatarUrl
          });
        }
      })
      .subscribe();

    // Subscribe to messages for points
    const messagesChannel = supabase
      .channel(`live_msg_points:${liveId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_messages',
          filter: `live_id=eq.${liveId}`,
        },
        async (payload) => {
          // If it's a block message, handle it
          if (currentUser && payload.new.content === `__MOD_BLOCK:${currentUser.id}__`) {
            alert('Foste removido desta live pelo host.');
            onClose();
          }

          // Points for comments (only non-system messages)
          if (!payload.new.content.startsWith('__MOD_') && !payload.new.content.startsWith('GIFT_SENT:')) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, name, avatar_url')
              .eq('id', payload.new.user_id)
              .single();
            if (profile) {
              updatePoints(payload.new.user_id, 5, profile);
            }
          }
        }
      )
      .subscribe();

    // Subscribe to gifts for points
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
            supabase.from('profiles').select('username, name, avatar_url').eq('id', payload.new.sender_id).single(),
            supabase.from('gift_types').select('*').eq('id', payload.new.gift_type_id).single()
          ]);

          if (profileRes.data && giftRes.data) {
            const displayName = profileRes.data.name || `@${profileRes.data.username}`;
            setActiveGift({ gift: giftRes.data, senderName: displayName });
            
            // Points for gifts: price * 10
            updatePoints(payload.new.sender_id, giftRes.data.price * 10, profileRes.data);
            
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
        supabase.removeChannel(messagesChannel);
        supabase.removeChannel(giftsChannel);
        // Decrement viewer count
        await supabase.rpc('decrement_viewer_count', { live_id: liveId });
      };
      cleanup();
    };
  }, [liveId, currentUser, onClose]);

  const sendHeart = () => {
    // Optimistic update: increment locally first for immediate feedback
    setLikesCount(prev => prev + 1);

    // Increment heart count in DB
    supabase.rpc('increment_likes', { live_id: liveId }).then(({ error }) => {
      if (error) {
        console.error('Error incrementing likes in DB:', error);
        // If it fails, we revert the local count slightly or just log it
        // Reverting in a high-freq action like hearts is usually not worth it
      }
    });

    // Send Like Notice broadcast
    if (currentUser && broadcastChannelRef.current) {
      broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'system_notice',
        payload: { 
          type: 'like', 
          userId: currentUser.id,
          username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'User',
          name: currentUser.user_metadata?.name || null,
          avatarUrl: currentUser.user_metadata?.avatar_url || null
        }
      });
    }

    // Also update current user's locally tracked points for immediate feedback
    updatePoints(currentUser?.id || 'anonymous', 1, currentUser?.user_metadata ? {
      username: currentUser.user_metadata.username,
      name: currentUser.user_metadata.name,
      avatar_url: currentUser.user_metadata.avatar_url
    } : undefined);

    const id = Date.now();
    const x = Math.random() * 100 - 50;
    setHearts((prev) => [...prev, { id, x }]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    }, 2000);
  };

  const handleFollowHost = async () => {
    if (!currentUser || !liveData) return;
    
    try {
      if (isFollowingHost) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', liveData.host_id);
        setIsFollowingHost(false);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: currentUser.id, following_id: liveData.host_id });
        setIsFollowingHost(true);
      }
    } catch (err) {
      console.error('Error toggling host follow:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {/* Video Container */}
      <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center overflow-hidden">
        <div ref={videoRef} className="w-full h-full" />
        
        {/* Tap to Like Hit Area */}
        <div 
          className="absolute inset-0 z-[5] cursor-pointer" 
          onClick={sendHeart}
        />

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
            className="absolute top-1/4 left-4 z-50 flex items-center gap-3 bg-white/95 backdrop-blur-xl rounded-full pl-1 pr-6 py-1 border border-amber-200 shadow-2xl"
          >
            <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center text-2xl shadow-sm overflow-hidden border border-amber-100">
              {(() => {
                const mapping: Record<string, string> = {
                  '🌹': 'https://cdn-icons-png.flaticon.com/512/1087/1087420.png',
                  '☕': 'https://cdn-icons-png.flaticon.com/512/924/924514.png',
                  '❤️': 'https://cdn-icons-png.flaticon.com/512/2107/2107845.png',
                  '💎': 'https://cdn-icons-png.flaticon.com/512/1071/1071985.png',
                  '🚀': 'https://cdn-icons-png.flaticon.com/512/1356/1356479.png',
                  '🏰': 'https://cdn-icons-png.flaticon.com/512/2509/2509748.png',
                  '🦁': 'https://cdn-icons-png.flaticon.com/512/616/616412.png',
                };
                const img = mapping[activeGift.gift.icon];
                return img ? <img src={img} className="w-7 h-7 object-contain" referrerPolicy="no-referrer" /> : activeGift.gift.icon;
              })()}
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest leading-tight">Presente Especial!</span>
              <span className="text-sm font-black text-zinc-900 leading-tight">
                {activeGift.senderName} <span className="text-zinc-500 font-bold">enviou</span> {activeGift.gift.name}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col z-10 p-4 pointer-events-none">
        {/* Header */}
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-xl rounded-full px-3 py-1.5 border border-white/10">
              <img 
                src={liveData?.profiles?.avatar_url || `https://picsum.photos/seed/${liveData?.host_id}/100/100`}
                alt={liveData?.profiles?.username}
                className="w-8 h-8 rounded-full border border-white/20 object-cover"
              />
              <div className="flex flex-col">
                <span className="text-xs font-black text-white">@{liveData?.profiles?.username || 'host'}</span>
                <div className="flex items-center gap-2 text-white/60">
                  <div className="flex items-center gap-1">
                    <Users size={10} />
                    <span className="text-[10px] font-bold">{viewerCount}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Heart size={10} fill="currentColor" className="text-red-500" />
                    <span className="text-[10px] font-bold">{likesCount}</span>
                  </div>
                </div>
              </div>
              
              {currentUser && liveData && liveData.host_id !== currentUser.id && !isFollowingHost && (
                <button 
                  onClick={handleFollowHost}
                  className="ml-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 transition-all active:scale-90"
                >
                  <Plus size={14} strokeWidth={3} />
                </button>
              )}
            </div>

            {/* Top Viewers Ranking */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[180px] px-1">
              {Object.values(ranking)
                .sort((a, b) => b.points - a.points)
                .slice(0, 5)
                .map((rankedUser, index) => (
                  <div key={rankedUser.userId} className="flex-shrink-0 flex flex-col items-center gap-0.5">
                    <div className="relative group">
                      <div className={`absolute -top-1 -right-1 z-20 w-3.5 h-3.5 ${index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-zinc-300' : index === 2 ? 'bg-orange-400' : 'bg-white/20'} rounded-full flex items-center justify-center text-[7px] font-black text-black border border-black/20`}>
                        {index + 1}
                      </div>
                      <img 
                        src={rankedUser.avatarUrl} 
                        className={`w-7 h-7 rounded-full border-2 ${index === 0 ? 'border-yellow-400' : 'border-white/10'} object-cover`}
                        alt={rankedUser.username}
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[6px] font-black text-white/90 truncate max-w-[28px] uppercase leading-tight">
                        {rankedUser.name.split(' ')[0]}
                      </span>
                      <span className="text-[5px] font-black text-yellow-500 leading-none">
                        {rankedUser.points}
                      </span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-10 h-10 bg-white/5 backdrop-blur-xl rounded-full flex items-center justify-center text-white border border-white/10 active:scale-90 transition-transform"
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
