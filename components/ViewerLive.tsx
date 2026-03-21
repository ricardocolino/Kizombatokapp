import React, { useEffect, useRef, useState, useCallback } from 'react';
import { IAgoraRTCRemoteUser, ICameraVideoTrack, IMicrophoneAudioTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { agoraService } from '../services/agoraService';
import { X, Users, Heart, Send, Loader2, Gift, AlertCircle, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Profile } from '../types';
import { parseMediaUrl } from '../services/mediaUtils';
import { motion, AnimatePresence } from 'motion/react';

import UserActionModal from './UserActionModal';
import GiftAnimation from './GiftAnimation';

interface ViewerLiveProps {
  channelName: string;
  onClose: () => void;
  hostProfile?: Profile;
  hostId?: string;
}

interface LiveComment {
  id: string;
  username: string;
  text: string;
  userId?: string;
  avatarUrl?: string;
  type?: 'system' | 'gift';
  giftName?: string;
  price?: number;
}

const ViewerLive: React.FC<ViewerLiveProps> = ({ channelName, onClose, hostProfile, hostId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [likes, setLikes] = useState(0);
  const [showGiftMenu, setShowGiftMenu] = useState(false);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [selectedUser, setSelectedUser] = useState<{ id: string, username: string, avatarUrl?: string } | null>(null);
  const [activeGift, setActiveGift] = useState<{ name: string, username: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [multiGuestEnabled, setMultiGuestEnabled] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [guests, setGuests] = useState<IAgoraRTCRemoteUser[]>([]);
  const [guestProfiles, setGuestProfiles] = useState<Record<string, Profile>>({});
  const [localGuestTracks, setLocalGuestTracks] = useState<{ videoTrack: ICameraVideoTrack, audioTrack: IMicrophoneAudioTrack } | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [`[${timestamp}] ${msg}`, ...prev].slice(0, 50));
    console.log(`[DEBUG] ${msg}`);
  }, []);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hostVideoRef = useRef<HTMLDivElement>(null);
  const hostVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);

  // Effect to play host video when ref is ready
  useEffect(() => {
    if (hostVideoTrackRef.current && hostVideoRef.current && !loading) {
      hostVideoTrackRef.current.play(hostVideoRef.current);
    }
  }, [loading]);

  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      const { data } = await supabase
        .from('comments')
        .select('*, profiles!user_id(*)')
        .eq('post_id', `live:${channelName}`)
        .order('created_at', { ascending: true })
        .limit(50);
      
      if (data && isMounted) {
        const historyComments: LiveComment[] = data.map(c => ({
          id: c.id.toString(),
          userId: c.user_id,
          username: c.profiles?.username || 'Anónimo',
          avatarUrl: c.profiles?.avatar_url || undefined,
          text: c.content,
          type: c.content.includes('enviou um') && c.content.includes('🎁') ? 'gift' : undefined
        }));
        setComments(prev => [...historyComments, ...prev.filter(pc => pc.type === 'system')]);
      }
    };

    const setupLive = async () => {
      try {
        addLog(`Iniciando setup para canal: ${channelName}`);
        addLog(`Host ID esperado: ${hostId}`);
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('Precisas de estar logado para ver a live.');
          setLoading(false);
          return;
        }

        // Check if live is active
        const { data: liveData } = await supabase
          .from('lives')
          .select('*')
          .eq('channel_name', channelName)
          .eq('is_active', true)
          .single();

        if (!liveData && isMounted) {
          setError('Esta live já terminou ou não existe.');
          setLoading(false);
          return;
        }

        if (liveData && isMounted) {
          setMultiGuestEnabled(liveData.multi_guest_enabled);
        }

        if (session && isMounted) {
          setCurrentUser({ id: session.user.id });
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          if (profile && isMounted) setUserProfile(profile);
        }

        await agoraService.joinAsAudience(channelName, session.user.id);
        
        if (isMounted) {
          setLoading(false);
          setComments(prev => [...prev, { 
            id: 'sys_' + Date.now(), 
            username: 'Sistema', 
            text: 'Entraste na live. Respeita a comunidade!',
            type: 'system'
          }]);
          fetchHistory();
        }

        // Setup Presence and Broadcast
        const channel = supabase.channel(`live_${channelName}`, {
          config: {
            presence: {
              key: session.user.id,
            },
          },
        });

        channelRef.current = channel
          .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            if (isMounted) {
              setViewerCount(Object.keys(state).length);
            }
          })
          .on('broadcast', { event: 'comment' }, ({ payload }) => {
            if (isMounted) {
              setComments(prev => {
                if (prev.find(c => c.id === payload.id)) return prev;
                return [...prev, payload];
              });
              if (payload.type === 'gift') {
                setActiveGift({ name: payload.giftName, username: payload.username });
              }
            }
          })
          .on('broadcast', { event: 'like' }, () => {
            if (isMounted) setLikes(prev => prev + 1);
          })
          .on('broadcast', { event: 'multi_guest_toggle' }, ({ payload }) => {
            if (isMounted) {
              setMultiGuestEnabled(payload.enabled);
              if (!payload.enabled && isGuest) {
                handleLeaveGuest();
              }
            }
          })
          .on('broadcast', { event: 'guest_action' }, ({ payload }) => {
            if (isMounted && isGuest && payload.targetUid === session.user.id) {
              if (payload.type === 'kick') {
                handleLeaveGuest();
              } else if (payload.type === 'mute_audio') {
                toggleMic(false);
              }
            }
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED' && isMounted) {
              await channel.track({
                user_id: session.user.id,
                online_at: new Date().toISOString(),
              });
            }
          });

      } catch (err) {
        if (!isMounted) return;
        console.error('Erro ao entrar na live:', err);
        setError('Não foi possível conectar à live. Tenta novamente.');
      }
    };

    setupLive();

    agoraService.onUserPublished(async (user, mediaType) => {
      addLog(`Usuário publicou: ${user.uid} (${mediaType})`);
      await agoraService.subscribe(user, mediaType);
      
      if (mediaType === 'video') {
        const isHost = String(user.uid) === String(hostId);
        addLog(`Comparação: ${user.uid} === ${hostId} ? ${isHost}`);
        
        if (isHost) {
          addLog('Host identificado, iniciando reprodução de vídeo');
          hostVideoTrackRef.current = user.videoTrack;
          if (hostVideoRef.current) {
            user.videoTrack?.play(hostVideoRef.current);
          }
        } else {
          addLog('Usuário identificado como convidado');
          setGuests(prev => {
            if (prev.find(g => g.uid === user.uid)) return prev;
            return [...prev, user];
          });
          
          // Fetch guest profile
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', String(user.uid))
            .single();
          if (data) {
            setGuestProfiles(prev => ({ ...prev, [user.uid]: data }));
          }
        }
      } else if (mediaType === 'audio') {
        user.audioTrack?.play();
      }
    });

    agoraService.onUserUnpublished((user, mediaType) => {
      addLog(`Usuário despublicou: ${user.uid} (${mediaType})`);
      if (mediaType === 'video') {
        if (String(user.uid) === String(hostId)) {
          addLog('Host despublicou vídeo');
          hostVideoTrackRef.current = null;
        } else {
          addLog('Convidado despublicou vídeo');
          setGuests(prev => [...prev]);
        }
      }
    });

    agoraService.onUserLeft((user) => {
      addLog(`Usuário saiu: ${user.uid}`);
      setGuests(prev => prev.filter(g => g.uid !== user.uid));
      setGuestProfiles(prev => {
        const next = { ...prev };
        delete next[user.uid];
        return next;
      });
    });

    return () => {
      isMounted = false;
      agoraService.leave();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [channelName, isGuest, toggleMic, handleLeaveGuest, hostId, addLog]);

  const handleSendComment = useCallback(async () => {
    if (!newComment.trim() || !channelRef.current || !userProfile) return;
    
    const commentId = Date.now().toString();
    const comment: LiveComment = { 
      id: commentId, 
      userId: userProfile.id,
      username: userProfile.username || 'Espectador', 
      avatarUrl: userProfile.avatar_url || undefined,
      text: newComment 
    };

    setComments(prev => [...prev, comment]);
    setNewComment('');

    // Persist to DB
    await supabase.from('comments').insert({
      post_id: `live:${channelName}`,
      user_id: userProfile.id,
      content: newComment
    });

    await channelRef.current.send({
      type: 'broadcast',
      event: 'comment',
      payload: comment
    });
  }, [newComment, userProfile, channelName]);

  const handleSendLike = useCallback(async () => {
    if (!channelRef.current) return;
    setLikes(prev => prev + 1);
    await channelRef.current.send({
      type: 'broadcast',
      event: 'like'
    });
  }, []);

  const handleJoinGuest = async () => {
    try {
      await agoraService.setRole('host');
      const tracks = await agoraService.publishTracks();
      setLocalGuestTracks(tracks);
      setIsGuest(true);
      setIsMicOn(true);
      setIsCamOn(true);
    } catch (err) {
      console.error('Erro ao entrar como convidado:', err);
      alert('Não foi possível ativar a tua câmera.');
    }
  };

  const handleLeaveGuest = useCallback(async () => {
    await agoraService.unpublishTracks();
    await agoraService.setRole('audience');
    setLocalGuestTracks(null);
    setIsGuest(false);
    setIsMicOn(true);
    setIsCamOn(true);
  }, []);

  const toggleMic = useCallback(async (forceState?: boolean) => {
    const newState = forceState !== undefined ? forceState : !isMicOn;
    setIsMicOn(newState);
    await agoraService.muteAudio(!newState);
  }, [isMicOn]);

  const toggleCam = useCallback(async () => {
    const newState = !isCamOn;
    setIsCamOn(newState);
    await agoraService.muteVideo(!newState);
  }, [isCamOn]);

  const sendGift = useCallback(async (giftName: string, price: number) => {
    if (!channelRef.current || !userProfile) return;
    
    if (userProfile.balance < price) {
      alert('Saldo insuficiente para enviar este presente!');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // --- OPTIMISTIC UI UPDATES (Instant feedback) ---
    const oldBalance = userProfile.balance;
    const newBalance = oldBalance - price;
    
    // Update local state immediately
    setUserProfile(prev => prev ? { ...prev, balance: newBalance } : null);

    const giftMsg = {
      id: 'gift_' + Date.now().toString(),
      userId: userProfile.id,
      username: userProfile.username || 'Espectador',
      avatarUrl: userProfile.avatar_url,
      text: `enviou um ${giftName}! 🎁`,
      type: 'gift' as const,
      giftName: giftName,
      price: price
    };
    
    setComments(prev => [...prev, giftMsg]);
    setActiveGift({ name: giftName, username: userProfile.username || 'Espectador' });
    setShowGiftMenu(false);
    
    // Persist gift to DB as a comment
    await supabase.from('comments').insert({
      post_id: `live:${channelName}`,
      user_id: userProfile.id,
      content: `enviou um ${giftName}! 🎁`
    });

    // Broadcast immediately
    channelRef.current.send({
      type: 'broadcast',
      event: 'comment',
      payload: giftMsg
    });

    // --- BACKGROUND DB UPDATES ---
    try {
      const targetHostId = hostId || hostProfile?.id;
      if (!targetHostId) {
        console.error('Host ID not found for gift update');
        return;
      }

      // Deduct balance from sender
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      // Add balance to host using RPC (more reliable)
      // Creator receives 100% of the coins
      const { error: hostUpdateError } = await supabase.rpc('increment_user_balance', {
        target_user_id: targetHostId,
        amount: price
      });

      if (hostUpdateError) {
        console.error('Erro ao incrementar saldo do host via RPC:', hostUpdateError);
        // Fallback to manual update if RPC fails
        const { data: hostData } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', targetHostId)
          .single();

        if (hostData) {
          await supabase
            .from('profiles')
            .update({ balance: hostData.balance + price })
            .eq('id', targetHostId);
        }
      }
    } catch (error) {
      console.error('Erro ao processar presente no servidor:', error);
      // Rollback local state on error
      setUserProfile(prev => prev ? { ...prev, balance: oldBalance } : null);
      alert('Houve um problema ao processar o presente. O teu saldo foi restaurado.');
    }
  }, [userProfile, hostId, hostProfile, channelName]);

  if (error) {
    return (
      <div className="absolute inset-0 z-[200] bg-black flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-red-600/20 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-red-600" />
        </div>
        <h2 className="text-2xl font-black text-white mb-4 uppercase tracking-tighter">Erro na Conexão</h2>
        <p className="text-white/60 mb-8 text-sm leading-relaxed">{error}</p>
        <div className="w-full space-y-3">
          <button onClick={() => { setError(null); setLoading(true); }} className="w-full bg-white text-black font-black py-4 rounded-2xl uppercase tracking-widest text-xs">Tentar Novamente</button>
          <button onClick={onClose} className="w-full bg-zinc-900 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs border border-white/10">Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[200] bg-black flex flex-col">
      {/* Debug Toggle - Small indicator in top right corner */}
      <div 
        className="absolute top-4 right-12 z-[300] w-8 h-8 flex items-center justify-center opacity-20 hover:opacity-100 cursor-pointer bg-white/10 rounded-full"
        onClick={() => setShowDebug(!showDebug)}
      >
        <AlertCircle size={14} className="text-white" />
      </div>

      {/* Debug Popup */}
      <AnimatePresence>
        {showDebug && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-4 z-[400] bg-black/95 border border-white/20 rounded-3xl p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-black uppercase tracking-widest text-xs">Debug Logs</h3>
              <button onClick={() => setShowDebug(false)} className="text-white/60 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 font-mono text-[10px]">
              {debugLogs.map((log, i) => (
                <div key={i} className="text-zinc-400 border-b border-white/5 pb-1">
                  {log}
                </div>
              ))}
              {debugLogs.length === 0 && <div className="text-zinc-600 italic">Nenhum log capturado</div>}
            </div>
            <button 
              onClick={() => setDebugLogs([])}
              className="mt-4 w-full py-3 bg-zinc-900 text-white/60 text-[10px] font-black uppercase tracking-widest rounded-xl"
            >
              Limpar Logs
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-zinc-900">
        <div ref={hostVideoRef} className="w-full h-full object-cover" />
        
        {/* Guest Windows Grid */}
        {multiGuestEnabled && (
          <div className="absolute top-20 right-4 w-32 flex flex-col gap-2 z-10">
            {/* Local Guest Window */}
            {isGuest && localGuestTracks?.videoTrack && (
              <div className="w-32 h-40 bg-black/60 rounded-xl border-2 border-red-600 overflow-hidden relative shadow-2xl">
                {isCamOn ? (
                  <div 
                    className="w-full h-full"
                    ref={(el) => {
                      if (el) localGuestTracks.videoTrack.play(el);
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                    {userProfile?.avatar_url ? (
                      <img src={parseMediaUrl(userProfile.avatar_url)} className="w-full h-full object-cover opacity-50" alt="" />
                    ) : (
                      <Users size={24} className="text-white/20" />
                    )}
                  </div>
                )}
                
                <div className="absolute top-1 right-1 flex flex-col gap-1">
                  <button 
                    onClick={handleLeaveGuest}
                    className="bg-red-600 p-1 rounded-full text-white"
                  >
                    <X size={10} />
                  </button>
                  <button 
                    onClick={() => toggleMic()}
                    className={`p-1 rounded-full text-white ${isMicOn ? 'bg-zinc-800' : 'bg-red-600'}`}
                  >
                    {isMicOn ? <Mic size={10} /> : <MicOff size={10} />}
                  </button>
                  <button 
                    onClick={toggleCam}
                    className={`p-1 rounded-full text-white ${isCamOn ? 'bg-zinc-800' : 'bg-red-600'}`}
                  >
                    {isCamOn ? <Video size={10} /> : <VideoOff size={10} />}
                  </button>
                </div>

                <div className="absolute bottom-1 left-1 bg-red-600 px-1.5 py-0.5 rounded text-[8px] text-white font-black uppercase">
                  Tu (Convidado)
                </div>
              </div>
            )}

            {/* Remote Guest Windows */}
            {guests.slice(0, 4).map((guest, idx) => {
              const profile = guestProfiles[guest.uid];
              return (
                <div 
                  key={guest.uid} 
                  className="w-32 h-40 bg-black/60 rounded-xl border border-white/10 overflow-hidden relative shadow-2xl"
                >
                  {guest.hasVideo ? (
                    <div 
                      className="w-full h-full"
                      ref={(el) => {
                        if (el && guest.videoTrack) {
                          guest.videoTrack.play(el);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                      {profile?.avatar_url ? (
                        <img src={parseMediaUrl(profile.avatar_url)} className="w-full h-full object-cover opacity-50" alt="" />
                      ) : (
                        <Users size={24} className="text-white/20" />
                      )}
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 bg-black/40 px-1.5 py-0.5 rounded text-[8px] text-white font-black uppercase">
                    {profile?.username || `Convidado ${idx + 1}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="relative flex-1 flex flex-col p-4 justify-between bg-gradient-to-b from-black/40 via-transparent to-black/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-red-600 overflow-hidden shadow-lg shadow-red-600/20">
              {hostProfile?.avatar_url ? (
                <img src={parseMediaUrl(hostProfile.avatar_url)} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-black">
                  {hostProfile?.username?.[0].toUpperCase() || 'A'}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-black text-white drop-shadow-md">{hostProfile?.username || 'Host'}</p>
              <div className="flex items-center gap-2">
                <span className="bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse shadow-sm">Live</span>
                <div className="flex items-center gap-1 text-[10px] text-white/90 font-bold bg-black/20 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  <Users size={10} /> {viewerCount}
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10">
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest text-white">A entrar na vibe...</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="max-h-64 overflow-y-auto flex flex-col gap-2 no-scrollbar mask-fade-top">
            {comments.map(c => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }} 
                animate={{ opacity: 1, x: 0 }} 
                key={c.id} 
                onClick={() => c.type !== 'system' && setSelectedUser({ id: c.userId || '', username: c.username, avatarUrl: c.avatarUrl })}
                className={`flex items-start gap-2 p-2 rounded-xl max-w-[85%] cursor-pointer active:scale-95 transition-transform ${c.type === 'system' ? 'bg-zinc-800/40 border border-zinc-700/30' : c.type === 'gift' ? 'bg-yellow-500/20 border border-yellow-500/30' : 'bg-black/30 backdrop-blur-sm'}`}
              >
                {c.type !== 'system' && (
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/10 bg-zinc-800">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-white/40">
                        {c.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className={`text-[9px] font-black uppercase tracking-wider ${c.type === 'system' ? 'text-zinc-400' : c.type === 'gift' ? 'text-yellow-500' : 'text-red-500'}`}>{c.username}</span>
                  <p className={`text-[11px] font-medium leading-tight ${c.type === 'gift' ? 'text-yellow-200 font-black' : 'text-white'}`}>{c.text}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {multiGuestEnabled && !isGuest && guests.length < 4 && (
              <button 
                onClick={handleJoinGuest}
                className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/20 active:scale-95 transition-transform border border-white/10"
                title="Entrar na Live"
              >
                <Users size={22} />
              </button>
            )}
            
            <div className="flex-1 relative">
              <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendComment()} placeholder="Diz um mambo..." className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-full py-3.5 px-6 text-xs text-white placeholder:text-white/40 outline-none focus:border-red-600 transition-all shadow-xl" />
              <button onClick={handleSendComment} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-600"><Send size={20} /></button>
            </div>
            
            <button onClick={() => setShowGiftMenu(true)} className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center text-black shadow-lg shadow-yellow-500/20 active:scale-95 transition-transform">
              <Gift size={22} />
            </button>

            <button onClick={handleSendLike} className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white relative active:scale-95 transition-transform border border-white/10">
              <Heart size={24} className={likes > 0 ? 'fill-red-600 text-red-600' : ''} />
              {likes > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm">{likes}</span>}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeGift && (
          <GiftAnimation 
            giftName={activeGift.name} 
            username={activeGift.username} 
            onComplete={() => setActiveGift(null)} 
          />
        )}

        {selectedUser && (
          <UserActionModal 
            userId={selectedUser.id}
            username={selectedUser.username}
            avatarUrl={selectedUser.avatarUrl}
            isHost={false}
            onClose={() => setSelectedUser(null)}
            currentUser={currentUser}
          />
        )}

        {showGiftMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGiftMenu(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[210]" />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 w-full bg-zinc-900 rounded-t-[32px] z-[220] p-8 pb-12"
            >
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                  <Gift className="text-yellow-500" /> Enviar Presente
                </h3>
                <div className="bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-2xl">
                  <p className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">O teu Saldo</p>
                  <p className="text-sm font-black text-white">{userProfile?.balance || 0} AngoCoins</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {[
                  { name: 'Rosa', icon: '🌹', price: 1 },
                  { name: 'Diamante', icon: '💎', price: 10 },
                  { name: 'Coroa', icon: '👑', price: 50 },
                  { name: 'Kizomba', icon: '💃', price: 5 },
                  { name: 'Fogo', icon: '🔥', price: 2 },
                  { name: 'Angola', icon: '🇦🇴', price: 100 },
                ].map(gift => (
                  <button key={gift.name} onClick={() => sendGift(gift.name, gift.price)} className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 active:scale-95 transition-all">
                    <span className="text-3xl">{gift.icon}</span>
                    <span className="text-[10px] font-black text-white">{gift.name}</span>
                    <span className="text-[9px] font-bold text-yellow-500">{gift.price} AC</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ViewerLive;
