import React, { useEffect, useRef, useState, useCallback } from 'react';
import { agoraService } from '../services/agoraService';
import { X, Users, Heart, Send, Loader2, Gift, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Profile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface ViewerLiveProps {
  channelName: string;
  onClose: () => void;
  hostProfile?: Profile;
}

const ViewerLive: React.FC<ViewerLiveProps> = ({ channelName, onClose, hostProfile }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount] = useState(0);
  const [comments, setComments] = useState<{ id: string, username: string, text: string, type?: 'system' | 'gift' }[]>([]);
  const [newComment, setNewComment] = useState('');
  const [likes, setLikes] = useState(0);
  const [showGiftMenu, setShowGiftMenu] = useState(false);

  const channelRef = useRef<{
    send: (payload: { type: string; event: string; payload?: Record<string, unknown> }) => Promise<string>;
    subscribe: (callback?: (status: string) => void) => void;
    unsubscribe: () => void;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const setupLive = async () => {
      try {
        await agoraService.joinAsAudience(channelName);
        if (isMounted) {
          setLoading(false);
          setComments(prev => [...prev, { 
            id: 'sys_' + Date.now(), 
            username: 'Sistema', 
            text: 'Entraste na live. Respeita a comunidade!',
            type: 'system'
          }]);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Erro ao entrar na live:', err);
        setError('Não foi possível conectar à live. Tenta novamente.');
      }
    };

    setupLive();

    channelRef.current = supabase.channel(`live_${channelName}`)
      .on('broadcast', { event: 'comment' }, ({ payload }) => {
        if (isMounted) setComments(prev => [...prev, payload]);
      })
      .on('broadcast', { event: 'like' }, () => {
        if (isMounted) setLikes(prev => prev + 1);
      })
      .subscribe();

    return () => {
      isMounted = false;
      agoraService.leave();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [channelName]);

  const handleSendComment = useCallback(async () => {
    if (!newComment.trim() || !channelRef.current) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    const comment = { 
      id: Date.now().toString(), 
      username: session?.user.email?.split('@')[0] || 'Espectador', 
      text: newComment 
    };

    setComments(prev => [...prev, comment]);
    setNewComment('');

    await channelRef.current.send({
      type: 'broadcast',
      event: 'comment',
      payload: comment
    });
  }, [newComment]);

  const handleSendLike = useCallback(async () => {
    if (!channelRef.current) return;
    setLikes(prev => prev + 1);
    await channelRef.current.send({
      type: 'broadcast',
      event: 'like'
    });
  }, []);

  const sendGift = useCallback(async (giftName: string) => {
    if (!channelRef.current) return;
    const { data: { session } } = await supabase.auth.getSession();
    const giftMsg = {
      id: 'gift_' + Date.now().toString(),
      username: session?.user.email?.split('@')[0] || 'Espectador',
      text: `enviou um ${giftName}! 🎁`,
      type: 'gift' as const
    };
    
    setComments(prev => [...prev, giftMsg]);
    setShowGiftMenu(false);
    
    await channelRef.current.send({
      type: 'broadcast',
      event: 'comment',
      payload: giftMsg
    });
  }, []);

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
      <div id="remote-player" className="absolute inset-0 bg-zinc-900" />
      
      <div className="relative flex-1 flex flex-col p-4 justify-between bg-gradient-to-b from-black/40 via-transparent to-black/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-red-600 overflow-hidden shadow-lg shadow-red-600/20">
              {hostProfile?.avatar_url ? (
                <img src={hostProfile.avatar_url} className="w-full h-full object-cover" alt="" />
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
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={c.id} className={`flex items-start gap-2 p-2 rounded-xl max-w-[85%] ${c.type === 'system' ? 'bg-zinc-800/40 border border-zinc-700/30' : c.type === 'gift' ? 'bg-yellow-500/20 border border-yellow-500/30' : 'bg-black/30 backdrop-blur-sm'}`}>
                <div className="flex flex-col">
                  <span className={`text-[9px] font-black uppercase tracking-wider ${c.type === 'system' ? 'text-zinc-400' : c.type === 'gift' ? 'text-yellow-500' : 'text-red-500'}`}>{c.username}</span>
                  <p className={`text-[11px] font-medium leading-tight ${c.type === 'gift' ? 'text-yellow-200 font-black' : 'text-white'}`}>{c.text}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center gap-3">
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
        {showGiftMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGiftMenu(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[210]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="absolute bottom-0 left-0 w-full bg-zinc-900 rounded-t-[32px] z-[220] p-8 pb-12">
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
              <h3 className="text-xl font-black text-white mb-8 uppercase tracking-tighter flex items-center gap-3"><Gift className="text-yellow-500" /> Enviar Presente</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { name: 'Rosa', icon: '🌹', price: 1 },
                  { name: 'Diamante', icon: '💎', price: 10 },
                  { name: 'Coroa', icon: '👑', price: 50 },
                  { name: 'Kizomba', icon: '💃', price: 5 },
                  { name: 'Fogo', icon: '🔥', price: 2 },
                  { name: 'Angola', icon: '🇦🇴', price: 100 },
                ].map(gift => (
                  <button key={gift.name} onClick={() => sendGift(gift.name)} className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 active:scale-95 transition-all">
                    <span className="text-3xl">{gift.icon}</span>
                    <span className="text-[10px] font-black text-white">{gift.name}</span>
                    <span className="text-[9px] font-bold text-yellow-500">{gift.price} Kz</span>
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
