
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Profile } from '../types';
import { Search, Heart, UserPlus, MessageSquare, Bell } from 'lucide-react';

interface MessageCenterProps {
  currentUser: any;
  onNavigateToPost: (postId: string) => void;
  onNavigateToProfile: (userId: string) => void;
}

type NotificationType = 'like' | 'follow' | 'comment' | 'mention';

interface NotificationItem {
  id: string;
  type: NotificationType;
  user: Profile;
  created_at: string;
  content?: string;
  postId?: string;
}

const MessageCenter: React.FC<MessageCenterProps> = ({ currentUser, onNavigateToPost, onNavigateToProfile }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'Tudo' | 'Likes' | 'Comentários' | 'Seguidores'>('Tudo');

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      // 1. Fetch Follows
      const { data: follows } = await supabase
        .from('follows')
        .select('*, profiles:follower_id(*)')
        .eq('following_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(20);

      // 2. Fetch Reactions (Likes) on user's posts
      const { data: reactions } = await supabase
        .from('reactions')
        .select('*, profiles:user_id(*), posts!inner(user_id)')
        .eq('posts.user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(20);

      // 3. Fetch Comments on user's posts
      const { data: comments } = await supabase
        .from('comments')
        .select('*, profiles:user_id(*), posts!inner(user_id)')
        .eq('posts.user_id', currentUser.id)
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
        })) || [])
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setNotifications(aggregated);
    } catch (e) {
      console.error("Erro ao buscar notificações:", e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    if (notif.type === 'follow' && notif.user) {
      onNavigateToProfile(notif.user.id);
    } else if ((notif.type === 'like' || notif.type === 'comment') && notif.postId) {
      onNavigateToPost(notif.postId);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'Tudo') return true;
    if (filter === 'Likes') return n.type === 'like';
    if (filter === 'Comentários') return n.type === 'comment';
    if (filter === 'Seguidores') return n.type === 'follow';
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-black overflow-hidden">
      <header className="pt-12 px-6 flex flex-col gap-6 bg-black/90 backdrop-blur-md sticky top-0 z-10 border-b border-zinc-900 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">Atividades</h1>
          <div className="flex gap-4">
            <button className="p-2 bg-zinc-900 rounded-full text-zinc-400">
               <Search size={20} />
            </button>
          </div>
        </div>

        {/* Filtros de Notificações */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {['Tudo', 'Likes', 'Comentários', 'Seguidores'].map((f) => (
            <button 
              key={f} 
              onClick={() => setFilter(f as any)}
              className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all shrink-0 ${
                filter === f 
                ? 'bg-white text-black border-white shadow-lg' 
                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24 p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-3">
            <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">A Carregar</span>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredNotifications.map((notif) => (
              <div 
                key={notif.id} 
                onClick={() => handleNotificationClick(notif)}
                className="flex items-center gap-4 py-4 group animate-[slideUp_0.3s_ease-out] hover:bg-zinc-900/30 rounded-2xl px-2 transition-colors cursor-pointer"
              >
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-zinc-800 bg-zinc-900">
                    {notif.user?.avatar_url ? (
                      <img src={notif.user.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 font-black text-sm uppercase">
                        {notif.user?.username?.[0] || '?'}
                      </div>
                    )}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-black shadow-lg ${
                    notif.type === 'like' ? 'bg-red-600' : 
                    notif.type === 'follow' ? 'bg-blue-600' : 
                    'bg-yellow-500'
                  }`}>
                    {notif.type === 'like' && <Heart size={10} fill="white" className="text-white" />}
                    {notif.type === 'follow' && <UserPlus size={10} className="text-white" />}
                    {notif.type === 'comment' && <MessageSquare size={10} fill="white" className="text-white" />}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-zinc-400 leading-tight">
                    <span className="font-black text-white mr-1.5">@{notif.user?.username}</span>
                    {notif.type === 'like' && 'curtiu o teu mambo.'}
                    {notif.type === 'follow' && 'começou a seguir-te.'}
                    {notif.type === 'comment' && 'comentou no teu vídeo.'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-zinc-700 font-black uppercase tracking-tighter">{formatTime(notif.created_at)}</span>
                  </div>
                  {notif.content && (
                    <p className="text-[11px] text-zinc-500 mt-1.5 italic line-clamp-1 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/30">
                      "{notif.content}"
                    </p>
                  )}
                </div>

                {notif.type === 'follow' ? (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onNavigateToProfile(notif.user.id); }}
                    className="px-5 py-2 bg-red-600 text-white text-[9px] font-black uppercase rounded-xl shadow-lg active:scale-95 transition-all"
                  >
                    Seguir
                  </button>
                ) : (
                  <div className="w-12 h-12 bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shrink-0 opacity-40 hover:opacity-100 transition-opacity">
                    <div className="w-full h-full flex items-center justify-center"><Bell size={14} className="text-zinc-700"/></div>
                  </div>
                )}
              </div>
            ))}

            {filteredNotifications.length === 0 && !loading && (
              <div className="py-24 flex flex-col items-center justify-center opacity-20 grayscale text-center">
                 <Bell size={48} className="text-zinc-500 mb-6" />
                 <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2">Sem mambos novos por aqui</p>
                 <p className="text-[9px] max-w-[200px] leading-relaxed">Continua a brilhar na banda para receberes novas notificações!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageCenter;
