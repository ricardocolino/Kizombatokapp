import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Send, Gift as GiftIcon, Smile } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setShowEmojiPicker(false);

    const { error } = await supabase.from('live_messages').insert({
      live_id: liveId,
      user_id: currentUser.id,
      content: messageContent,
    });

    if (error) {
      console.error('Error sending message:', error);
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const renderMessage = (msg: Message) => {
    const isGift = msg.content.startsWith('GIFT_SENT:');
    
    if (isGift) {
      const giftId = msg.content.split(':')[1];
      const gift = gifts[giftId];
      
      return (
        <div key={msg.id} className="flex items-center gap-2 bg-gradient-to-r from-yellow-500/30 to-orange-600/30 backdrop-blur-md p-2 rounded-2xl border border-white/20 shadow-lg animate-in slide-in-from-left duration-300">
          <div className="relative">
            <img 
              src={msg.profiles?.avatar_url || `https://picsum.photos/seed/${msg.user_id}/100/100`}
              alt={msg.profiles?.username}
              className="w-8 h-8 rounded-full border-2 border-yellow-400 object-cover shadow-sm"
            />
            <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-0.5">
              <GiftIcon size={8} className="text-black" />
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <span className="text-[10px] font-black text-yellow-300 uppercase leading-none mb-0.5">Enviou {gift?.name || 'Presente'}</span>
            <span className="text-xs font-black text-white leading-none">@{msg.profiles?.username}</span>
          </div>
          <div className="text-2xl drop-shadow-lg transform hover:scale-125 transition-transform">
            {gift?.icon || '🎁'}
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="flex items-start gap-2 max-w-[85%] group animate-in fade-in slide-in-from-bottom-1 duration-300">
        <div className="flex-1 bg-black/40 backdrop-blur-md rounded-2xl px-3 py-2 border border-white/10 shadow-lg hover:bg-black/50 transition-colors">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-black text-white/70 tracking-tight">@{msg.profiles?.username || 'user'}</span>
          </div>
          <p className="text-[13px] text-white leading-snug break-words font-medium drop-shadow-sm">{msg.content}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Gradient Mask for Top Fade */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-black/20 to-transparent z-10 pointer-events-none" />
      
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

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="absolute bottom-20 left-4 z-[100]">
          <EmojiPicker 
            onEmojiClick={onEmojiClick} 
            theme={Theme.DARK}
            width={300}
            height={400}
          />
        </div>
      )}

      <div className="p-3 flex items-center gap-2 bg-gradient-to-t from-black/90 to-transparent">
        <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0 relative group flex items-center bg-white/10 border border-white/10 rounded-full px-3 py-2 focus-within:bg-white/20 focus-within:border-white/30 transition-all">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Diz algo..."
              className="flex-1 bg-transparent border-none text-sm text-white placeholder:text-white/40 focus:outline-none min-w-0"
            />
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="flex-shrink-0 p-1 text-white/60 hover:text-white transition-colors"
            >
              <Smile size={20} />
            </button>
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
