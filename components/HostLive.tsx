import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { agoraService } from '../services/agoraService';
import { X, Users, Heart, Send, Loader2, Settings, Shield, Ban, MessageCircle, AlertCircle, Star } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Profile } from '../types';
import { parseMediaUrl } from '../services/mediaUtils';
import { motion, AnimatePresence } from 'motion/react';

import UserActionModal from './UserActionModal';
import GiftAnimation from './GiftAnimation';

interface HostLiveProps {
  channelName: string;
  onClose: () => void;
  title?: string;
  hostProfile: Profile;
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

const HostLive: React.FC<HostLiveProps> = ({ channelName, onClose, title, hostProfile }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount] = useState(0);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [likes, setLikes] = useState(0);
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string, username: string, avatarUrl?: string } | null>(null);
  const [activeGift, setActiveGift] = useState<{ name: string, username: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [currentHostProfile, setCurrentHostProfile] = useState<Profile>(hostProfile);

  const channelRef = useRef<{
    send: (payload: { type: string; event: string; payload?: Record<string, unknown> }) => Promise<string>;
    subscribe: (callback?: (status: string) => void) => void;
    unsubscribe: () => void;
  } | null>(null);

  useEffect(() => {
    let localTracks: { videoTrack: ICameraVideoTrack, audioTrack: IMicrophoneAudioTrack } | null = null;
    let isMounted = true;

    const setupLive = async () => {
      try {
        try {
          localTracks = await agoraService.joinAndPublish(channelName);
          if (!isMounted || !localTracks) {
            if (localTracks) await agoraService.leave();
            return;
          }
        } catch (err) {
          const agoraErr = err as { code: string; message: string };
          if (agoraErr.code === 'CAN_NOT_GET_GATEWAY_SERVER') {
            throw new Error('Erro de Autenticação: O seu App ID da Agora exige um Token. Por favor, desative o "App Certificate" no console da Agora para usar apenas o App ID.');
          }
          throw err;
        }

        if (videoRef.current && localTracks.videoTrack) {
          localTracks.videoTrack.play(videoRef.current);
        }
        
        // Register live in DB
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isMounted) {
          setCurrentUser({ id: session.user.id });
          const { error: dbError } = await supabase.from('lives').insert({
            user_id: session.user.id,
            channel_name: channelName,
            title: title || 'Live de Angola 🇦🇴',
            is_active: true,
            viewer_count: 0
          });
          
          if (dbError) {
            console.error('Erro ao registar live na DB:', dbError);
          }
        }
        
        if (isMounted) {
          setLoading(false);
          setComments(prev => [...prev, { 
            id: 'sys_' + Date.now(), 
            username: 'Sistema', 
            text: 'Estás em direto! Partilha a vibe com Angola.',
            type: 'system'
          }]);
        }

      } catch (err) {
        if (!isMounted) return;
        const setupErr = err as { message?: string };
        console.error('Erro ao iniciar live:', err);
        setError(setupErr.message || 'Ocorreu um erro ao tentar conectar à live.');
      }
    };

    setupLive();

    const refreshProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', hostProfile.id)
        .single();
      if (data && isMounted) {
        setCurrentHostProfile(data);
      }
    };

    // Real-time profile updates (balance, etc)
    const profileSubscription = supabase
      .channel(`profile_${hostProfile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${hostProfile.id}`
        },
        (payload) => {
          if (isMounted) {
            setCurrentHostProfile(payload.new as Profile);
          }
        }
      )
      .subscribe();

    channelRef.current = supabase.channel(`live_${channelName}`)
      .on('broadcast', { event: 'comment' }, ({ payload }) => {
        if (isMounted) {
          setComments(prev => [...prev, payload]);
          if (payload.type === 'gift') {
            setActiveGift({ name: payload.giftName, username: payload.username });
            
            // Atualização otimista do saldo do host (100% do valor do presente)
            if (payload.price) {
              setCurrentHostProfile(prev => ({
                ...prev,
                balance: prev.balance + payload.price
              }));
            }

            // Refresh profile manually to ensure balance is correct eventually
            refreshProfile();
          }
        }
      })
      .on('broadcast', { event: 'like' }, () => {
        if (isMounted) setLikes(prev => prev + 1);
      })
      .subscribe();

    return () => {
      isMounted = false;
      const endLive = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from('lives').update({ is_active: false }).eq('channel_name', channelName).eq('user_id', session.user.id);
        }
        await agoraService.leave();
      };
      endLive();
      supabase.removeChannel(profileSubscription);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [channelName, title, hostProfile.id]);

  const handleSendComment = useCallback(async () => {
    if (!newComment.trim() || !channelRef.current) return;
    
    const comment = { 
      id: Date.now().toString(), 
      userId: currentHostProfile.id,
      username: currentHostProfile.username || 'Host', 
      avatarUrl: currentHostProfile.avatar_url,
      text: newComment 
    };

    setComments(prev => [...prev, comment]);
    setNewComment('');

    await channelRef.current.send({
      type: 'broadcast',
      event: 'comment',
      payload: comment
    });
  }, [newComment, currentHostProfile]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-8 text-center">
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
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div ref={videoRef} className="absolute inset-0 bg-zinc-900" />
      
      <div className="relative flex-1 flex flex-col p-4 justify-between bg-gradient-to-b from-black/40 via-transparent to-black/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-red-600 overflow-hidden shadow-lg shadow-red-600/20">
              {currentHostProfile.avatar_url ? (
                <img src={parseMediaUrl(currentHostProfile.avatar_url)} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-black">
                  {currentHostProfile.username?.[0].toUpperCase() || 'A'}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-black text-white drop-shadow-md">{currentHostProfile.username || 'Host'}</p>
              <div className="flex items-center gap-2">
                <span className="bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse shadow-sm">Direto</span>
                <button onClick={() => {}} className="flex items-center gap-1 text-[10px] text-white/90 font-bold bg-black/20 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  <Users size={10} /> {viewerCount}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHostPanel(true)} className="p-2.5 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10">
              <Settings size={20} />
            </button>
            <button onClick={onClose} className="p-2.5 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10">
              <X size={20} />
            </button>
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest text-white">A preparar o mambo...</p>
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
            <div className="flex-1 relative">
              <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendComment()} placeholder="Diz algo à tua audiência..." className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-full py-3.5 px-6 text-xs text-white placeholder:text-white/40 outline-none focus:border-red-600 transition-all shadow-xl" />
              <button onClick={handleSendComment} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-600"><Send size={20} /></button>
            </div>
            <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white relative border border-white/10">
              <Heart size={24} className={likes > 0 ? 'fill-red-600 text-red-600' : ''} />
              {likes > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm">{likes}</span>}
            </div>
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
            isHost={true}
            onClose={() => setSelectedUser(null)}
            currentUser={currentUser}
          />
        )}

        {showHostPanel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHostPanel(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[210]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="absolute bottom-0 left-0 w-full bg-zinc-900 rounded-t-[32px] z-[220] p-8 pb-12">
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
              <h3 className="text-xl font-black text-white mb-8 uppercase tracking-tighter flex items-center gap-3"><Settings className="text-red-600" /> Painel do Host</h3>
              <div className="grid grid-cols-2 gap-4">
                <button className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-[24px] border border-white/5 hover:bg-white/10 transition-colors"><Shield className="text-blue-500" size={28} /><span className="text-[10px] font-black uppercase tracking-widest text-white/60">Moderadores</span></button>
                <button className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-[24px] border border-white/5 hover:bg-white/10 transition-colors"><Ban className="text-red-500" size={28} /><span className="text-[10px] font-black uppercase tracking-widest text-white/60">Bloqueados</span></button>
                <button className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-[24px] border border-white/5 hover:bg-white/10 transition-colors"><MessageCircle className="text-green-500" size={28} /><span className="text-[10px] font-black uppercase tracking-widest text-white/60">Filtros Chat</span></button>
                <div className="flex flex-col items-center gap-3 p-6 bg-yellow-500/10 rounded-[24px] border border-yellow-500/20">
                  <Star className="text-yellow-500" size={28} />
                  <div className="text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/60 block mb-1">Saldo Total</span>
                    <span className="text-sm font-black text-white">{currentHostProfile.balance} AngoCoins</span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="w-full mt-8 bg-red-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-xs shadow-lg shadow-red-600/20">Encerrar Live</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HostLive;
