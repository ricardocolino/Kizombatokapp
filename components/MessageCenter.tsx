
import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Profile, LiveStream as LiveStreamType } from '../types';
import { parseMediaUrl } from '../services/mediaUtils';
import { Bell, Camera, Hand } from 'lucide-react';
import ViewerLive from './ViewerLive';

interface MessageCenterProps {
  currentUser: User | null;
  onNavigateToPost: (postId: string) => void;
  onNavigateToProfile: (userId: string) => void;
}

type NotificationType = 'like' | 'follow' | 'comment' | 'mention' | 'message';

interface NotificationItem {
  id: string;
  type: NotificationType;
  user: Profile;
  created_at: string;
  content?: string;
  postId?: string;
  read?: boolean;
}

const MessageCenter: React.FC<MessageCenterProps> = ({ currentUser, onNavigateToPost, onNavigateToProfile }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeLives, setActiveLives] = useState<LiveStreamType[]>([]);
  const [activeLive, setActiveLive] = useState<LiveStreamType | null>(null);
  const [loading, setLoading] = useState(true);

  const handleCloseLive = React.useCallback(() => {
    setActiveLive(null);
  }, []);

  const fetchNotifications = React.useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      
      // Fetch Active Lives - Ensure unique users
      const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
      const { data: lives } = await supabase
        .from('lives')
        .select('*, profiles(*)')
        .eq('is_active', true)
        .gt('updated_at', twoMinutesAgo)
        .order('started_at', { ascending: false })
        .limit(50);
      
      if (lives) {
        // Filter unique users for lives
        const uniqueLivesMap = new Map();
        lives.forEach(live => {
          if (!uniqueLivesMap.has(live.user_id)) {
            uniqueLivesMap.set(live.user_id, live);
          }
        });
        setActiveLives(Array.from(uniqueLivesMap.values()).slice(0, 10));
      }

      // 1. Fetch Follows
      const { data: follows } = await supabase
        .from('follows')
        .select('*, profiles:follower_id(*)')
        .eq('following_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(10);

      // 2. Fetch Reactions (Likes) on user's posts
      const { data: reactions } = await supabase
        .from('reactions')
        .select('*, profiles:user_id(*), posts!inner(user_id)')
        .eq('posts.user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(10);

      // 3. Fetch Comments on user's posts
      const { data: comments } = await supabase
        .from('comments')
        .select('*, profiles:user_id(*), posts!inner(user_id)')
        .eq('posts.user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(10);

      // 4. Fetch Messages
      const { data: messages } = await supabase
        .from('messages')
        .select('*, profiles:sender_id(*)')
        .eq('receiver_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const aggregated: NotificationItem[] = [
        ...(follows?.map(f => ({
          id: `follow-${f.follower_id}-${f.created_at}`,
          type: 'follow' as const,
          user: f.profiles,
          created_at: f.created_at
        })) || []),
        ...(reactions?.map(r => ({
          id: `like-${r.id}`,
          type: 'like' as const,
          user: r.profiles,
          created_at: r.created_at,
          postId: r.post_id
        })) || []),
        ...(comments?.map(c => ({
          id: `comment-${c.id}`,
          type: 'comment' as const,
          user: c.profiles,
          created_at: c.created_at,
          content: c.content,
          postId: c.post_id
        })) || []),
        ...(messages?.map(m => ({
          id: `msg-${m.id}`,
          type: 'message' as const,
          user: m.profiles,
          created_at: m.created_at,
          content: m.content,
          read: m.read
        })) || [])
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setNotifications(aggregated);
    } catch (e) {
      console.error("Erro ao buscar notificações:", e);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchNotifications();

    const fetchActiveLives = async () => {
      const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
      const { data: lives } = await supabase
        .from('lives')
        .select('*, profiles(*)')
        .eq('is_active', true)
        .gt('updated_at', twoMinutesAgo)
        .order('started_at', { ascending: false })
        .limit(50);
      
      if (lives) {
        const uniqueLivesMap = new Map();
        lives.forEach(live => {
          if (!uniqueLivesMap.has(live.user_id)) {
            uniqueLivesMap.set(live.user_id, live);
          }
        });
        setActiveLives(Array.from(uniqueLivesMap.values()).slice(0, 10));
      } else {
        setActiveLives([]);
      }
    };

    fetchActiveLives();

    // Subscribe to lives changes
    const livesSubscription = supabase
      .channel('lives_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lives'
        },
        async () => {
          // Re-fetch lives when any change occurs
          const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
          const { data: lives } = await supabase
            .from('lives')
            .select('*, profiles(*)')
            .eq('is_active', true)
            .gt('updated_at', twoMinutesAgo)
            .order('started_at', { ascending: false })
            .limit(50);
          
          if (lives) {
            const uniqueLivesMap = new Map();
            lives.forEach(live => {
              if (!uniqueLivesMap.has(live.user_id)) {
                uniqueLivesMap.set(live.user_id, live);
              }
            });
            setActiveLives(Array.from(uniqueLivesMap.values()).slice(0, 10));
          } else {
            setActiveLives([]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(livesSubscription);
    };
  }, [fetchNotifications]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    if (notif.type === 'follow' && notif.user) {
      onNavigateToProfile(notif.user.id);
    } else if ((notif.type === 'like' || notif.type === 'comment') && notif.postId) {
      onNavigateToPost(notif.postId);
    } else if (notif.type === 'message' && notif.user) {
      onNavigateToProfile(notif.user.id);
    }
  };

  return (
    <div className="h-full flex flex-col bg-black overflow-hidden text-white">
      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
      {activeLive && (
        <ViewerLive 
          channelName={activeLive.channel_name}
          onClose={handleCloseLive}
          hostProfile={activeLive.profiles}
          hostId={activeLive.user_id}
        />
      )}

        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-3">
            <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">A Carregar</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Top Horizontal List (Stories/Lives) */}
            <div className="flex gap-4 px-4 py-4 overflow-x-auto no-scrollbar border-b border-zinc-900">
              {/* Active Lives */}
              {activeLives.map((live) => (
                <div 
                  key={live.id}
                  onClick={() => setActiveLive(live)}
                  className="flex flex-col items-center gap-2 shrink-0 cursor-pointer"
                >
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-[#fe2c55] to-[#ff0050]">
                      <div className="w-full h-full rounded-full border-2 border-black overflow-hidden bg-zinc-900">
                        {live.profiles?.avatar_url ? (
                          <img src={parseMediaUrl(live.profiles.avatar_url)} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
                            {live.profiles?.username?.[0].toUpperCase() || 'A'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#fe2c55] rounded-sm px-1 py-0.5 flex items-center justify-center border border-black">
                      <div className="flex items-end gap-[1px] h-2">
                        <div className="w-[1.5px] h-full bg-white animate-[pulse_1s_infinite]" />
                        <div className="w-[1.5px] h-2/3 bg-white animate-[pulse_1.2s_infinite]" />
                        <div className="w-[1.5px] h-full bg-white animate-[pulse_0.8s_infinite]" />
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-white truncate max-w-[64px]">
                    {live.profiles?.username}
                  </span>
                </div>
              ))}
            </div>

            {/* Notification List */}
            <div className="flex flex-col">
              {notifications.map((notif) => (
                <div 
                  key={notif.id} 
                  onClick={() => handleNotificationClick(notif)}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-900/50 transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                    {notif.user?.avatar_url ? (
                      <img src={parseMediaUrl(notif.user.avatar_url)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 font-bold">
                        {notif.user?.username?.[0].toUpperCase() || '?'}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 py-2">
                    <div className="flex items-center justify-between pr-2">
                      <h3 className="text-[15px] font-bold truncate text-white">{notif.user?.username}</h3>
                      {notif.type === 'message' && !notif.read && (
                        <div className="w-5 h-5 bg-[#fe2c55] rounded-full flex items-center justify-center text-[10px] font-bold text-white">4</div>
                      )}
                    </div>
                    <p className="text-[13px] text-zinc-400 truncate">
                      {notif.type === 'like' && 'Curtiu o teu mambo'}
                      {notif.type === 'follow' && 'Começou a seguir-te'}
                      {notif.type === 'comment' && `Comentou: ${notif.content}`}
                      {notif.type === 'message' && notif.content}
                      <span className="mx-1">·</span>
                      {formatTime(notif.created_at)}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {notif.type === 'follow' ? (
                      <Hand size={20} className="text-amber-400" />
                    ) : (
                      <Camera size={20} className="text-zinc-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {notifications.length === 0 && !loading && (
              <div className="py-24 flex flex-col items-center justify-center opacity-20 grayscale text-center">
                 <Bell size={48} className="text-zinc-500 mb-6" />
                 <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2">Sem mambos novos</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageCenter;
