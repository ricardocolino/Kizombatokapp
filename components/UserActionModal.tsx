import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { UserPlus, UserMinus, Shield, Ban, VolumeX, Volume2, User } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface UserActionModalProps {
  userId: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  isHost: boolean;
  liveId: string;
  onClose: () => void;
  currentUser: { id: string } | null;
}

const UserActionModal: React.FC<UserActionModalProps> = ({ 
  userId, 
  username, 
  avatarUrl, 
  bio,
  isHost, 
  liveId,
  onClose,
  currentUser
}) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isSilenced, setIsSilenced] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      if (!currentUser) return;
      
      setLoading(true);
      try {
        // Check following
        const { data: followData } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', currentUser.id)
          .eq('following_id', userId)
          .single();
        
        setIsFollowing(!!followData);

        // Check if target user is silenced in this live
        const { data: silenceMsgs } = await supabase
          .from('live_messages')
          .select('content')
          .eq('live_id', liveId)
          .or(`content.eq.__MOD_SILENCE:${userId}__,content.eq.__MOD_UNSILENCE:${userId}__`)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (silenceMsgs && silenceMsgs.length > 0) {
          setIsSilenced(silenceMsgs[0].content.includes('SILENCE'));
        }

        // In a real app, you'd check moderator status in specific tables
      } catch (err) {
        console.error('Error checking status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [userId, currentUser, liveId]);

  const handleFollow = async () => {
    if (!currentUser) return;
    
    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', userId);
        setIsFollowing(false);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: currentUser.id, following_id: userId });
        setIsFollowing(true);
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
    }
  };

  const handleModerator = () => {
    setIsModerator(!isModerator);
    // Logic to update moderator status in DB would go here
  };

  const handleSilence = async () => {
    if (!currentUser || !isHost) return;
    
    const nextSilenced = !isSilenced;
    setIsSilenced(nextSilenced);

    try {
      // Send a system message to the chat
      await supabase.from('live_messages').insert({
        live_id: liveId,
        user_id: currentUser.id,
        content: nextSilenced ? `__MOD_SILENCE:${userId}__` : `__MOD_UNSILENCE:${userId}__`
      });
    } catch (err) {
      console.error('Error silencing user:', err);
    }
  };

  const handleBlock = async () => {
    if (!currentUser || !isHost) return;
    
    if (confirm(`Tens a certeza que queres bloquear @${username} desta live?`)) {
      try {
        // Send a system message to the chat
        await supabase.from('live_messages').insert({
          live_id: liveId,
          user_id: currentUser.id,
          content: `__MOD_BLOCK:${userId}__`
        });
        onClose();
      } catch (err) {
        console.error('Error blocking user:', err);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose} 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.9, opacity: 0, y: 20 }} 
        className="relative w-full max-w-sm bg-zinc-900 rounded-[32px] overflow-hidden border border-white/10 shadow-2xl"
      >
        <div className="p-8 flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full border-4 border-red-600 p-1 shadow-xl shadow-red-600/20">
              <div className="w-full h-full rounded-full overflow-hidden bg-zinc-800">
                {avatarUrl ? (
                  <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white/20">
                    <User size={40} />
                  </div>
                )}
              </div>
            </div>
            {isModerator && (
              <div className="absolute -bottom-1 -right-1 bg-blue-600 p-1.5 rounded-full border-2 border-zinc-900 shadow-lg">
                <Shield size={14} className="text-white" />
              </div>
            )}
          </div>

          <h3 className="text-xl font-black text-white mb-1 uppercase tracking-tighter">@{username}</h3>
          
          {bio ? (
            <p className="text-sm text-zinc-300 font-medium mb-6 leading-relaxed max-w-[240px]">
              {bio}
            </p>
          ) : (
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-8">Utilizador de Angola 🇦🇴</p>
          )}

          <div className="w-full space-y-3">
            {userId !== currentUser?.id && (
              <button 
                onClick={handleFollow}
                disabled={loading}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 ${
                  isFollowing 
                  ? 'bg-zinc-800 text-white border border-white/10' 
                  : 'bg-red-600 text-white shadow-lg shadow-red-600/20 active:scale-95'
                }`}
              >
                {isFollowing ? (
                  <><UserMinus size={16} /> Deixar de Seguir</>
                ) : (
                  <><UserPlus size={16} /> Seguir</>
                )}
              </button>
            )}

            {isHost && userId !== currentUser?.id && (
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                <button 
                  onClick={handleModerator}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    isModerator ? 'bg-blue-600/20 border-blue-600/50 text-blue-500' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  <Shield size={20} />
                  <span className="text-[8px] font-black uppercase tracking-widest">Moderador</span>
                </button>
                <button 
                  onClick={handleSilence}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    isSilenced ? 'bg-yellow-600/20 border-yellow-600/50 text-yellow-500' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {isSilenced ? <Volume2 size={20} /> : <VolumeX size={20} />}
                  <span className="text-[8px] font-black uppercase tracking-widest">{isSilenced ? 'Falar' : 'Silenciar'}</span>
                </button>
                <button 
                  onClick={handleBlock}
                  className="col-span-2 flex items-center justify-center gap-2 p-4 bg-red-600/10 border border-red-600/20 rounded-2xl text-red-500 hover:bg-red-600/20 transition-all"
                >
                  <Ban size={18} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Bloquear Utilizador</span>
                </button>
              </div>
            )}

            <button 
              onClick={onClose}
              className="w-full py-4 text-zinc-500 font-black uppercase tracking-widest text-[10px] hover:text-white transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default UserActionModal;
