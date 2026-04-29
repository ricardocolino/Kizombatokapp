
import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Profile, Story } from '../types';
import { parseMediaUrl } from '../services/mediaUtils';
import { Bell, Camera, Hand, TrendingUp, Plus } from 'lucide-react';

interface MessageCenterProps {
  currentUser: User | null;
  onNavigateToPost: (postId: string) => void;
  onNavigateToProfile: (userId: string) => void;
  onNavigateToCreate: (isStory?: boolean) => void;
  onViewStories: (userId: string, allUserIds?: string[]) => void;
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

const MessageCenter: React.FC<MessageCenterProps> = ({ currentUser, onNavigateToPost, onNavigateToProfile, onNavigateToCreate, onViewStories }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = React.useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      
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

      // 5. Fetch Stories of followed users
      const { data: followsForStories } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUser.id);
      
      const followingIds = followsForStories?.map(f => f.following_id) || [];
      
      if (followingIds.length > 0) {
        const { data: storiesData } = await supabase
          .from('stories')
          .select('*, profiles:user_id(*)')
          .in('user_id', followingIds)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });
        
        // Agrupar por usuário (apenas o mais recente)
        const uniqueStories: Record<string, Story> = {};
        storiesData?.forEach(s => {
          if (!uniqueStories[s.user_id]) uniqueStories[s.user_id] = s;
        });
        setStories(Object.values(uniqueStories));
      }

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
        {/* Stories Section moved from Discovery */}
        <div className="px-4 py-6 border-b border-zinc-900/50 bg-zinc-950/20">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-zinc-600" />
            Historys de quem segues
          </h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {/* Add Story Button */}
            <div 
              onClick={() => onNavigateToCreate && onNavigateToCreate(true)}
              className="flex flex-col items-center gap-2 shrink-0 group cursor-pointer active:scale-95 transition-transform"
            >
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-dashed border-zinc-800 bg-zinc-900 flex items-center justify-center group-hover:border-red-600 transition-colors">
                <Plus size={20} className="text-zinc-600" />
              </div>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter text-center">Teu Story</span>
            </div>
            {stories.map(story => (
              <div 
                key={story.id} 
                onClick={() => onViewStories && onViewStories(story.user_id, stories.map(s => s.user_id))}
                className="flex flex-col items-center gap-2 shrink-0 group cursor-pointer active:scale-95 transition-transform"
              >
                <div className="w-14 h-14 rounded-full p-0.5 border-2 border-red-600 bg-zinc-950 overflow-hidden group-hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900">
                    {story.profiles?.avatar_url ? (
                      <img src={parseMediaUrl(story.profiles.avatar_url)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-zinc-600 text-sm">
                        {story.profiles?.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[9px] font-bold text-zinc-400 max-w-[60px] truncate text-center uppercase tracking-tighter">@{story.profiles?.username}</span>
              </div>
            ))}
            {stories.length === 0 && !loading && (
              <p className="text-[10px] text-zinc-700 italic flex items-center py-6">Nenhum history disponível agora...</p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-3">
            <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">A Carregar</span>
          </div>
        ) : (
          <div className="flex flex-col">
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
                      {notif.type === 'like' && 'Curtiu o teu vídeo'}
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
                 <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2">Sem novidades</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageCenter;
