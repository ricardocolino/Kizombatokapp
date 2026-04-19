import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Send, Gift as GiftIcon } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import UserActionModal from './UserActionModal';
import { AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: {
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

interface LiveChatProps {
  liveId: string;
  currentUser: User | null;
  extraActions?: React.ReactNode;
  isHost?: boolean;
}

const LiveChat: React.FC<LiveChatProps> = ({ liveId, currentUser, extraActions, isHost = false }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSilenced, setIsSilenced] = useState(false);
  const [gifts, setGifts] = useState<Record<string, Gift>>({});
  const [selectedUser, setSelectedUser] = useState<{ id: string, username: string, avatarUrl?: string, bio?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchGifts = async () => {
      const { data } = await supabase.from('gift_types').select('*');
      if (data) {
        const giftMap = data.reduce((acc, gift) => ({ ...acc, [gift.id]: gift }), {});
        setGifts(giftMap);
      }
    };
    fetchGifts();

    // Fetch initial messages
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('live_messages')
        .select('*, profiles(username, avatar_url)')
        .eq('live_id', liveId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        const msgs = data || [];
        // Check if current user is silenced by scanning history
        if (currentUser) {
          const modMsgs = msgs.filter(m => m.content.startsWith('__MOD_'));
          const mySilences = modMsgs.filter(m => 
            m.content === `__MOD_SILENCE:${currentUser.id}__` || 
            m.content === `__MOD_UNSILENCE:${currentUser.id}__`
          );
          if (mySilences.length > 0) {
            const lastStatus = mySilences[mySilences.length - 1].content;
            setIsSilenced(lastStatus.startsWith('__MOD_SILENCE'));
          }
        }
        setMessages(msgs);
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`live_messages:${liveId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_messages',
          filter: `live_id=eq.${liveId}`,
        },
        async (payload) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          const newMessage = {
            ...payload.new,
            profiles: profileData,
          } as Message;

          // React to mod actions
          if (currentUser && newMessage.content.startsWith('__MOD_')) {
            if (newMessage.content === `__MOD_SILENCE:${currentUser.id}__`) {
              setIsSilenced(true);
            } else if (newMessage.content === `__MOD_UNSILENCE:${currentUser.id}__`) {
              setIsSilenced(false);
            }
          }

          setMessages((prev) => {
            const updated = [...prev, newMessage];
            return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId, currentUser]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !currentUser) return;

    const messageContent = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('live_messages').insert({
      live_id: liveId,
      user_id: currentUser.id,
      content: messageContent,
    });

    if (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleUserClick = async (userId: string, username: string, avatarUrl?: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('bio')
        .eq('id', userId)
        .single();
      
      setSelectedUser({
        id: userId,
        username,
        avatarUrl,
        bio: data?.bio || undefined
      });
    } catch (err) {
      console.error('Error fetching user bio:', err);
      // Fallback if bio fetch fails
      setSelectedUser({ id: userId, username, avatarUrl });
    }
  };

  const renderMessage = (msg: Message) => {
    const isGift = msg.content.startsWith('GIFT_SENT:');
    const isModAction = msg.content.startsWith('__MOD_');

    if (isModAction) return null;
    
    if (isGift) {
      const giftId = msg.content.split(':')[1];
      const gift = gifts[giftId];
      
      return (
        <div 
          key={msg.id} 
          onClick={() => handleUserClick(msg.user_id, msg.profiles?.username || 'user', msg.profiles?.avatar_url)}
          className="flex items-center gap-2 bg-gradient-to-r from-yellow-500/10 to-orange-600/10 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-sm animate-in slide-in-from-left duration-300 cursor-pointer active:scale-95 transition-all"
        >
          <div className="relative">
            <img 
              src={msg.profiles?.avatar_url || `https://picsum.photos/seed/${msg.user_id}/100/100`}
              alt={msg.profiles?.username}
              className="w-8 h-8 rounded-full border border-yellow-400/50 object-cover shadow-sm"
            />
            <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-0.5">
              <GiftIcon size={8} className="text-black" />
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <span className="text-[10px] font-black text-yellow-300/90 uppercase leading-none mb-0.5">Enviou {gift?.name || 'Presente'}</span>
            <span className="text-xs font-black text-white leading-none drop-shadow-md">@{msg.profiles?.username}</span>
          </div>
          <div className="text-2xl drop-shadow-2xl transform hover:scale-125 transition-transform">
            {gift?.icon || '🎁'}
          </div>
        </div>
      );
    }

    return (
      <div 
        key={msg.id} 
        onClick={() => handleUserClick(msg.user_id, msg.profiles?.username || 'user', msg.profiles?.avatar_url)}
        className="flex items-start gap-1.5 max-w-full group animate-in fade-in slide-in-from-bottom-1 duration-300 py-0.5 cursor-pointer active:opacity-70 transition-all"
      >
        <img 
          src={msg.profiles?.avatar_url || `https://picsum.photos/seed/${msg.user_id}/100/100`}
          alt={msg.profiles?.username}
          className="w-7 h-7 rounded-full border border-white/10 object-cover flex-shrink-0 mt-0.5 shadow-sm"
        />
        <div className="flex-1 flex flex-col min-w-0 px-0.5">
          <span className="text-[11px] font-black text-zinc-300 tracking-wide mb-0 truncate drop-shadow-md">@{msg.profiles?.username || 'user'}</span>
          <span className="text-[13px] text-white leading-snug break-words font-black whitespace-pre-wrap drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{msg.content}</span>
        </div>
      </div>
    );
  };

  const filteredMessages = messages.filter(m => !m.content.startsWith('__MOD_'));

  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-transparent">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide"
        style={{ 
          maskImage: 'linear-gradient(to bottom, transparent, black 15%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%)'
        }}
      >
        {filteredMessages.map((msg) => renderMessage(msg))}
      </div>

      <div className="p-3 flex items-center gap-2">
        <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2 min-w-0">
          <div className={`flex-1 min-w-0 relative group flex items-center backdrop-blur-md border rounded-full px-4 py-2 transition-all shadow-lg ${isSilenced ? 'bg-red-500/10 border-red-500/20' : 'bg-white/10 border-white/20 focus-within:bg-white/20 focus-within:border-white/30'}`}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={isSilenced}
              placeholder={isSilenced ? "Silenziado" : "Diz algo..."}
              className="flex-1 bg-transparent border-none text-sm text-white placeholder:text-white/40 focus:outline-none min-w-0 disabled:opacity-50 font-medium"
            />
          </div>
          <button 
            type="submit"
            disabled={!newMessage.trim() || isSilenced}
            className="flex-shrink-0 w-10 h-10 bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-full flex items-center justify-center text-white active:scale-90 transition-all shadow-xl shadow-red-600/30"
          >
            <Send size={18} />
          </button>
        </form>
        
        {/* Extra Actions (Like, Gift, etc.) */}
        {extraActions && (
          <div className="flex-shrink-0 flex items-center gap-2">
            {extraActions}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedUser && (
          <UserActionModal 
            userId={selectedUser.id}
            username={selectedUser.username}
            avatarUrl={selectedUser.avatarUrl}
            bio={selectedUser.bio}
            isHost={isHost}
            liveId={liveId}
            onClose={() => setSelectedUser(null)}
            currentUser={currentUser}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default LiveChat;
