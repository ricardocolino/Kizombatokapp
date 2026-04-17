import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Send, Gift as GiftIcon } from 'lucide-react';
import { User } from '@supabase/supabase-js';

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
}

const LiveChat: React.FC<LiveChatProps> = ({ liveId, currentUser, extraActions }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [gifts, setGifts] = useState<Record<string, Gift>>({});
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
        .limit(50);

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data || []);
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

          setMessages((prev) => [...prev, newMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

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

  const renderMessage = (msg: Message) => {
    const isGift = msg.content.startsWith('GIFT_SENT:');
    
    if (isGift) {
      const giftId = msg.content.split(':')[1];
      const gift = gifts[giftId];
      
      return (
        <div key={msg.id} className="flex items-center gap-2 bg-gradient-to-r from-yellow-500/10 to-orange-600/10 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-sm animate-in slide-in-from-left duration-300">
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
      <div key={msg.id} className="flex items-start gap-2 max-w-[85%] group animate-in fade-in slide-in-from-bottom-1 duration-300">
        <img 
          src={msg.profiles?.avatar_url || `https://picsum.photos/seed/${msg.user_id}/100/100`}
          alt={msg.profiles?.username}
          className="w-8 h-8 rounded-full border border-white/20 object-cover flex-shrink-0 mt-1"
        />
        <div className="flex-1 bg-white/5 backdrop-blur-[2px] rounded-2xl px-3 py-2 border border-white/5 shadow-sm hover:bg-white/10 transition-colors">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-black text-white/90 tracking-tight drop-shadow-md">@{msg.profiles?.username || 'user'}</span>
          </div>
          <p className="text-[13px] text-white leading-snug break-words font-medium drop-shadow-md">{msg.content}</p>
        </div>
      </div>
    );
  };

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
        {messages.map((msg) => renderMessage(msg))}
      </div>

      <div className="p-3 flex items-center gap-2">
        <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0 relative group flex items-center bg-white/5 backdrop-blur-[4px] border border-white/10 rounded-full px-3 py-1.5 focus-within:bg-white/10 focus-within:border-white/20 transition-all shadow-sm">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Diz algo..."
              className="flex-1 bg-transparent border-none text-sm text-white placeholder:text-white/40 focus:outline-none min-w-0"
            />
          </div>
          <button 
            type="submit"
            disabled={!newMessage.trim()}
            className="flex-shrink-0 w-9 h-9 bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-full flex items-center justify-center text-white active:scale-90 transition-all shadow-xl shadow-red-600/20"
          >
            <Send size={16} />
          </button>
        </form>
        
        {/* Extra Actions (Like, Gift, etc.) */}
        {extraActions && (
          <div className="flex-shrink-0 flex items-center gap-2">
            {extraActions}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveChat;
