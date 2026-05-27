import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Send, Gift as GiftIcon, X } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import UserActionModal from './UserActionModal';
import { AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id?: string | null;
  profiles?: {
    username: string;
    name: string | null;
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
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [notices, setNotices] = useState<{ id: string; content: string; type: 'join' | 'like' }[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSilenced, setIsSilenced] = useState(false);
  const [gifts, setGifts] = useState<Record<string, Gift>>({});
  const [selectedUser, setSelectedUser] = useState<{ id: string, username: string, avatarUrl?: string, bio?: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ username: string; name: string | null; avatar_url: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentUser) {
      supabase
        .from('profiles')
        .select('username, name, avatar_url')
        .eq('id', currentUser.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setCurrentUserProfile(data);
          }
        });
    }
  }, [currentUser]);

  useEffect(() => {
    if (!liveId) return;

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
      try {
        const { data, error } = await supabase
          .from('live_messages')
          .select('*, profiles(username, name, avatar_url)')
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
      } catch (err) {
        console.error('Exception fetching messages:', err);
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`live_messages_${liveId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_messages',
          filter: `live_id=eq.${liveId}`,
        },
        async (payload) => {
          try {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('username, name, avatar_url')
              .eq('id', payload.new.user_id)
              .maybeSingle();

            const newMessage = {
              ...payload.new,
              profiles: profileData || undefined,
            } as Message;

            // React to mod actions
            if (currentUser && newMessage.content && newMessage.content.startsWith('__MOD_')) {
              if (newMessage.content === `__MOD_SILENCE:${currentUser.id}__`) {
                setIsSilenced(true);
              } else if (newMessage.content === `__MOD_UNSILENCE:${currentUser.id}__`) {
                setIsSilenced(false);
              }
            }

            setMessages((prev) => {
              // Prevent duplicate messages
              if (prev.some(m => m.id === newMessage.id)) return prev;
              const updated = [...prev, newMessage];
              return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
            });
          } catch (e) {
            console.error('Error handling realtime message payload:', e);
            // Fallback: append message anyway
            const newMessage = {
              ...payload.new,
              profiles: undefined,
            } as Message;
            setMessages((prev) => {
              if (prev.some(m => m.id === newMessage.id)) return prev;
              const updated = [...prev, newMessage];
              return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
            });
          }
        }
      )
      .on('broadcast', { event: 'system_notice' }, (payload) => {
        if (!payload || !payload.payload) return;
        const id = Date.now().toString() + Math.random().toString();
        const content = payload.payload.type === 'join' 
          ? t('Entered the live')
          : t('Liked the live');
        
        const displayName = payload.payload.name || (payload.payload.username ? `@${payload.payload.username}` : '@user');
        
        setNotices(prev => [...prev, { 
          id, 
          content: `${displayName} ${content}`,
          type: payload.payload.type 
        }].slice(-3)); // Show max 3 latest notices

        setTimeout(() => {
          setNotices(prev => prev.filter(n => n.id !== id));
        }, 4000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId, currentUser, t]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !currentUser || !liveId) return;

    const messageContent = newMessage.trim();
    const parentIdToSave = replyingTo?.id || null;
    setNewMessage('');
    setReplyingTo(null);

    // Create a unique temporary id
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate optimistic user profile details
    const optimisticMessage: Message = {
      id: tempId,
      user_id: currentUser.id,
      content: messageContent,
      created_at: new Date().toISOString(),
      parent_id: parentIdToSave,
      profiles: {
        username: currentUserProfile?.username || currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'user',
        name: currentUserProfile?.name || currentUser.user_metadata?.name || currentUser.user_metadata?.full_name || null,
        avatar_url: currentUserProfile?.avatar_url || currentUser.user_metadata?.avatar_url || `https://picsum.photos/seed/${currentUser.id}/100/100`,
      }
    };

    // Optimistically update message list so it renders instantly
    setMessages((prev) => [...prev, optimisticMessage]);

    const insertPayload: { live_id: string; user_id: string; content: string; parent_id?: string } = {
      live_id: liveId,
      user_id: currentUser.id,
      content: messageContent,
    };

    if (parentIdToSave) {
      insertPayload.parent_id = parentIdToSave;
    }

    const { data, error } = await supabase
      .from('live_messages')
      .insert(insertPayload)
      .select('*, profiles(username, name, avatar_url)')
      .maybeSingle();

    if (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message if insert failed
      setMessages((prev) => prev.filter((m) => m.id !== tempId));

      // Se a coluna parent_id não existir na tabela do banco de dados ainda, tentamos reenviar sem ela!
      if (parentIdToSave && (error.message?.includes('parent_id') || error.code === '42703')) {
        console.log('Retrying message send without parent_id column...');
        const retryTempId = `retry_${Date.now()}`;
        const retryOptimisticMessage: Message = {
          ...optimisticMessage,
          id: retryTempId,
          parent_id: null,
        };
        setMessages((prev) => [...prev, retryOptimisticMessage]);

        const { data: retryData, error: retryError } = await supabase
          .from('live_messages')
          .insert({
            live_id: liveId,
            user_id: currentUser.id,
            content: messageContent,
          })
          .select('*, profiles(username, name, avatar_url)')
          .maybeSingle();

        if (retryError) {
          console.error('Retry error without parent_id:', retryError);
          setMessages((prev) => prev.filter((m) => m.id !== retryTempId));
        } else if (retryData) {
          // Replace retry optimistic with real database message
          setMessages((prev) => prev.map((m) => (m.id === retryTempId ? (retryData as Message) : m)));
        }
      }
    } else if (data) {
      // Replace optimistic message with real database message
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as Message) : m)));
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
            <span className="text-[10px] font-black text-yellow-300/90 uppercase leading-none mb-0.5">{t('Sent')} {gift?.name || t('Gifts')}</span>
            <span className="text-xs font-black text-white leading-none drop-shadow-md">
              {msg.profiles?.name || `@${msg.profiles?.username}`}
            </span>
          </div>
          <div className="text-2xl drop-shadow-2xl transform hover:scale-125 transition-transform">
            {gift?.icon || '🎁'}
          </div>
        </div>
      );
    }

    const parentMsg = msg.parent_id ? messages.find(m => m.id === msg.parent_id) : null;

    return (
      <div 
        key={msg.id} 
        className="flex items-start gap-1.5 max-w-full group animate-in fade-in slide-in-from-bottom-1 duration-300 py-0.5"
      >
        <img 
          src={msg.profiles?.avatar_url || `https://picsum.photos/seed/${msg.user_id}/100/100`}
          alt={msg.profiles?.username}
          onClick={() => handleUserClick(msg.user_id, msg.profiles?.username || 'user', msg.profiles?.avatar_url)}
          className="w-7 h-7 rounded-full border border-white/10 object-cover flex-shrink-0 mt-0.5 shadow-sm cursor-pointer active:scale-95 transition-all"
        />
        <div className="flex-1 flex flex-col min-w-0 px-0.5">
          <div className="flex items-center gap-1.5">
            <span 
              onClick={() => handleUserClick(msg.user_id, msg.profiles?.username || 'user', msg.profiles?.avatar_url)}
              className="text-[11px] font-black text-zinc-300 tracking-wide mb-0 truncate drop-shadow-md cursor-pointer hover:underline"
            >
              {msg.profiles?.name || `@${msg.profiles?.username || 'user'}`}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReplyingTo(msg);
              }}
              className="text-[9px] text-purple-400 font-bold bg-purple-500/10 hover:bg-purple-500/20 px-1.5 py-0.5 rounded cursor-pointer transition-all"
            >
              {t('Reply', 'Responder')}
            </button>
          </div>
          {msg.parent_id && (
            <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-bold bg-white/5 py-0.5 px-2 rounded-lg mb-1 w-max">
              <span className="opacity-60">↳ {t('Replied to', 'Respondeu a')}</span>
              <span className="text-purple-400">
                {parentMsg ? `@${parentMsg.profiles?.username || 'user'}` : t('a comment', 'um comentário')}
              </span>
            </div>
          )}
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
        
        {/* System Notices (Join/Like) */}
        <div className="space-y-1.5 pt-2">
          {notices.map(notice => (
            <div key={notice.id} className="flex items-center gap-1.5 animate-in slide-in-from-left duration-500 fade-in">
              <div className={`w-1.5 h-1.5 rounded-full ${notice.type === 'join' ? 'bg-emerald-500' : 'bg-purple-500'} animate-pulse`} />
              <span className={`text-[11px] font-black tracking-tight ${notice.type === 'join' ? 'text-emerald-400' : 'text-purple-400'} drop-shadow-md drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]`}>
                {notice.content}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2">
        {replyingTo && (
          <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-between text-white animate-in slide-in-from-bottom-1 duration-200">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-400">
                {t('Replying to', 'A responder a')} @{replyingTo.profiles?.username || 'user'}
              </span>
              <span className="text-xs text-zinc-300 truncate max-w-[200px]">
                {replyingTo.content}
              </span>
            </div>
            <button 
              type="button" 
              onClick={() => setReplyingTo(null)}
              className="text-zinc-400 hover:text-white p-1 rounded-full cursor-pointer hover:bg-white/5 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2 min-w-0">
          <div className={`flex-1 min-w-0 relative group flex items-center backdrop-blur-md border rounded-full px-4 py-2 transition-all shadow-lg ${isSilenced ? 'bg-red-500/10 border-red-500/20' : 'bg-white/10 border-white/20 focus-within:bg-white/20 focus-within:border-white/30'}`}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={isSilenced}
              placeholder={isSilenced ? t('Silenced') : t('Say something')}
              className="flex-1 bg-transparent border-none text-sm text-white placeholder:text-white/40 focus:outline-none min-w-0 disabled:opacity-50 font-medium"
            />
          </div>
          <button 
            type="submit"
            disabled={!newMessage.trim() || isSilenced}
            className="flex-shrink-0 w-10 h-10 bg-purple-600 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-full flex items-center justify-center text-white active:scale-90 transition-all shadow-xl shadow-purple-600/30"
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
