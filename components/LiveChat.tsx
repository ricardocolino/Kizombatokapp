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
  const [newMessage, setNewMessage] = useState('');
  const [isSilenced, setIsSilenced] = useState(false);
  const [gifts, setGifts] = useState<Record<string, Gift>>({});
  const [selectedUser, setSelectedUser] = useState<{ id: string, username: string, avatarUrl?: string, bio?: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ username: string; name: string | null; avatar_url: string } | null>(null);
  const [activeNotification, setActiveNotification] = useState<{ id: string; messageId: string; senderName: string; content: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeNotification) {
      const timer = setTimeout(() => {
        setActiveNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeNotification]);

  const scrollToMessage = (msgId: string) => {
    setTimeout(() => {
      const element = document.getElementById(`msg-${msgId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('bg-purple-500/30', 'px-2', 'rounded-xl');
        setTimeout(() => {
          element.classList.remove('bg-purple-500/30', 'px-2', 'rounded-xl');
        }, 3000);
      }
    }, 100);
  };

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

    // Subscribe to new messages & broadcasts
    const channel = supabase
      .channel(`live_room:${liveId}`, {
        config: {
          broadcast: { self: true },
        },
      })
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
              // Check if this is a reply to current user's message
              if (currentUser && newMessage.parent_id && newMessage.user_id !== currentUser.id) {
                const parentMsg = prev.find(m => m.id === newMessage.parent_id);
                if (parentMsg && parentMsg.user_id === currentUser.id) {
                  const senderName = profileData?.name || `@${profileData?.username || 'user'}`;
                  setActiveNotification({
                    id: Date.now().toString(),
                    messageId: newMessage.id,
                    senderName,
                    content: newMessage.content,
                  });
                }
              }

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
              if (currentUser && newMessage.parent_id && newMessage.user_id !== currentUser.id) {
                const parentMsg = prev.find(m => m.id === newMessage.parent_id);
                if (parentMsg && parentMsg.user_id === currentUser.id) {
                  setActiveNotification({
                    id: Date.now().toString(),
                    messageId: newMessage.id,
                    senderName: '@user',
                    content: newMessage.content,
                  });
                }
              }

              if (prev.some(m => m.id === newMessage.id)) return prev;
              const updated = [...prev, newMessage];
              return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
            });
          }
        }
      )
      .on('broadcast', { event: 'system_notice' }, (payload) => {
        if (!payload || !payload.payload) return;
        
        const type = payload.payload.type;
        const userId = payload.payload.userId || '';
        const username = payload.payload.username || 'user';
        const name = payload.payload.name || null;
        const avatarUrl = payload.payload.avatarUrl || `https://picsum.photos/seed/${userId}/100/100`;
        const displayName = name || (username ? `@${username}` : '@user');

        const systemMsg: Message = {
          id: `system_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          user_id: `system_${type}`,
          content: `SYSTEM_${type.toUpperCase()}:${displayName}`,
          created_at: new Date().toISOString(),
          profiles: {
            username,
            name,
            avatar_url: avatarUrl,
          }
        };

        setMessages((prev) => {
          if (prev.some(m => m.content === systemMsg.content)) return prev;
          if (prev.some(m => m.id === systemMsg.id)) return prev;
          const updated = [...prev, systemMsg];
          return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
        });
      });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && !isHost && currentUser) {
        // Send join notice broadcast
        channel.send({
          type: 'broadcast',
          event: 'system_notice',
          payload: {
            type: 'join',
            userId: currentUser.id,
            username: currentUserProfile?.username || currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'user',
            name: currentUserProfile?.name || currentUser.user_metadata?.name || null,
            avatarUrl: currentUserProfile?.avatar_url || currentUser.user_metadata?.avatar_url || null,
          }
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId, currentUser, t, isHost, currentUserProfile]);

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
    const isSystemJoin = msg.content.startsWith('SYSTEM_JOIN:');
    const isSystemLike = msg.content.startsWith('SYSTEM_LIKE:');

    if (isModAction) return null;

    if (isSystemJoin) {
      const displayName = msg.content.substring(12);
      return (
        <div 
          key={msg.id} 
          id={`msg-${msg.id}`}
          className="flex items-center gap-1.5 animate-in slide-in-from-left duration-500 fade-in py-1 px-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 my-1 max-w-max"
        >
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
            <span className="text-emerald-400 text-[10px]">🚀</span>
          </div>
          <span className="text-[11px] font-black text-emerald-400 drop-shadow-md drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            {displayName} {t('Entered the live', 'entrou na live')}
          </span>
        </div>
      );
    }

    if (isSystemLike) {
      const displayName = msg.content.substring(12);
      return (
        <div 
          key={msg.id} 
          id={`msg-${msg.id}`}
          className="flex items-center gap-1.5 animate-in slide-in-from-left duration-500 fade-in py-1 px-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 my-1 max-w-max"
        >
          <div className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
            <span className="text-purple-400 text-[10px]">💖</span>
          </div>
          <span className="text-[11px] font-black text-purple-400 drop-shadow-md drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            {displayName} {t('Liked the live', 'curtiu a live')}
          </span>
        </div>
      );
    }
    
    if (isGift) {
      const giftId = msg.content.split(':')[1];
      const gift = gifts[giftId];
      
      return (
        <div 
          key={msg.id} 
          id={`msg-${msg.id}`}
          onClick={() => handleUserClick(msg.user_id, msg.profiles?.username || 'user', msg.profiles?.avatar_url)}
          className="flex items-center gap-2 bg-gradient-to-r from-yellow-500/10 to-orange-600/10 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-sm animate-in slide-in-from-left duration-300 cursor-pointer active:scale-95 transition-all transition-all duration-500"
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
        id={`msg-${msg.id}`}
        className="flex items-start gap-1.5 max-w-full group animate-in fade-in slide-in-from-bottom-1 duration-300 py-0.5 rounded-xl transition-all duration-500"
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
      {activeNotification && (
        <div className="absolute top-4 left-4 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div 
            onClick={() => {
              scrollToMessage(activeNotification.messageId);
              setActiveNotification(null);
            }}
            className="p-3 bg-purple-950/90 border border-purple-500/40 backdrop-blur-xl rounded-2xl shadow-2xl flex items-start gap-2.5 cursor-pointer hover:bg-purple-900/95 active:scale-95 transition-all text-white"
          >
            <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-300 flex-shrink-0 mt-0.5">
              ↳
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-xs font-black text-purple-300">
                {activeNotification.senderName} {t('replied to you', 'respondeu ao seu comentário')}
              </span>
              <span className="block text-[11px] text-zinc-300 truncate font-semibold">
                &ldquo;{activeNotification.content}&rdquo;
              </span>
            </div>
          </div>
        </div>
      )}
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
        <div className="flex items-center gap-2 w-full min-w-0">
          {extraActions && (
            <div className="flex-shrink-0 flex items-center gap-2">
              {extraActions}
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
        </div>
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
