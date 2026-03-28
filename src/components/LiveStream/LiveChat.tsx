import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { Send } from 'lucide-react';

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

interface LiveChatProps {
  liveId: string;
  currentUser: User | null;
}

const LiveChat: React.FC<LiveChatProps> = ({ liveId, currentUser }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
          // Fetch profile info for the new message
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="flex flex-col h-full bg-black/40 backdrop-blur-md rounded-t-2xl border-t border-white/10">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2">
            <img 
              src={msg.profiles?.avatar_url || `https://picsum.photos/seed/${msg.user_id}/100/100`}
              alt={msg.profiles?.username}
              className="w-8 h-8 rounded-full border border-white/20 object-cover"
            />
            <div className="flex-1">
              <p className="text-[11px] font-bold text-zinc-400">@{msg.profiles?.username || 'user'}</p>
              <p className="text-sm text-white break-words">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSendMessage} className="p-4 flex items-center gap-2 border-t border-white/5">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Diz algo..."
          className="flex-1 bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-red-600 transition-colors"
        />
        <button 
          type="submit"
          className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default LiveChat;
