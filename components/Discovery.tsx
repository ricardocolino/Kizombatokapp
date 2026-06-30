
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Post, Profile } from '../types';
import { Search, TrendingUp, AlertCircle, UserCheck, Film, Layers } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';

interface DiscoveryProps {
  onNavigateToPost?: (postId: string) => void;
  onNavigateToProfile?: (userId: string) => void;
}

const Discovery: React.FC<DiscoveryProps> = ({ onNavigateToPost, onNavigateToProfile }) => {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(10);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSessionAndFollowing = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          setCurrentUserId(session.user.id);
          const { data: followsData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', session.user.id);
          
          if (followsData) {
            setFollowingIds(new Set(followsData.map(f => f.following_id)));
          }
        }
      } catch (err) {
        console.error('Error fetching session or following list:', err);
      }
    };
    fetchSessionAndFollowing();
  }, []);

  const handleFollowToggle = async (targetUserId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigating to profile when clicking follow button
    if (!currentUserId) {
      alert(t('Please login to follow') || 'Faz login para seguires este utilizador!');
      return;
    }

    const isCurrentlyFollowing = followingIds.has(targetUserId);

    if (isCurrentlyFollowing) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetUserId);
      
      if (!error) {
        setFollowingIds(prev => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
      }
    } else {
      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: currentUserId,
          following_id: targetUserId
        });
      
      if (!error) {
        setFollowingIds(prev => {
          const next = new Set(prev);
          next.add(targetUserId);
          return next;
        });
      }
    }
  };

  useEffect(() => {
    let active = true;

    const fetchTrending = async (query: string = '', limit: number) => {
      try {
        setLoading(true);
        const trimmedQuery = query.trim();

        // 🔹 1. Buscar usuários primeiro
        let matchedUsers: Profile[] = [];

        if (trimmedQuery) {
          const { data: usersData } = await supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${trimmedQuery}%,name.ilike.%${trimmedQuery}%`)
            .limit(10);

          matchedUsers = usersData || [];
          if (active) setUsers(matchedUsers);
        } else {
          if (active) setUsers([]);
          
          // Buscar sugestões de perfis em crescimento
          const { data: suggestedData } = await supabase
            .from('profiles')
            .select('*')
            .order('onboarding_completed', { ascending: false })
            .limit(50);

          if (active) {
            const list = suggestedData || [];
            const filtered = list.filter(u => {
              if (currentUserId && u.id === currentUserId) return false;
              if (followingIds.has(u.id)) return false;
              return true;
            });
            setSuggestedUsers(filtered.slice(0, 8));
          }
        }

        // 🔹 2. Buscar posts por conteúdo
        let postsByContent: Post[] = [];
        if (trimmedQuery) {
          const { data } = await supabase
            .from('posts')
            .select('*, profiles!user_id(*)')
            .ilike('content', `%${trimmedQuery}%`)
            .limit(limit);

          postsByContent = data || [];
        }

        // 🔹 3. Buscar posts dos usuários encontrados
        let postsByUsers: Post[] = [];
        if (matchedUsers.length > 0) {
          const userIds = matchedUsers.map(u => u.id);

          const { data } = await supabase
            .from('posts')
            .select('*, profiles!user_id(*)')
            .in('user_id', userIds)
            .limit(limit);

          postsByUsers = data || [];
        }

        // 🔹 4. Combinar e remover duplicados
        let combinedPosts: Post[] = [];

        if (trimmedQuery) {
          const allPosts = [...postsByContent, ...postsByUsers];

          const uniqueMap = new Map();
          allPosts.forEach(post => {
            uniqueMap.set(post.id, post);
          });

          combinedPosts = Array.from(uniqueMap.values());
        } else {
          // 🔹 Lógica: Buscar posts mais vistos
          const { data } = await supabase
            .from('posts')
            .select('*, profiles!user_id(*)')
            .order('is_ready', { ascending: false })
            .order('views', { ascending: false })
            .limit(limit);

          combinedPosts = data || [];
        }

        if (active) {
          let localPrivatePosts: string[] = [];
          try {
            localPrivatePosts = JSON.parse(localStorage.getItem('private_posts') || '[]');
          } catch { /* ignore */ }

          const filteredPosts = combinedPosts.filter(p => {
            const isAuthor = currentUserId && p.user_id === currentUserId;
            const isPrivate = p.is_private === true || localPrivatePosts.includes(p.id);
            if (isPrivate && !isAuthor) {
              return false;
            }
            return true;
          });
          setPosts(filteredPosts);
        }

      } catch (error) {
        console.error("Error loading discovery:", error);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchTrending(searchQuery, displayLimit);

    return () => {
      active = false; // Cancela atualizações de buscas que ficaram para trás
    };
  }, [searchQuery, displayLimit, currentUserId, followingIds]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      if (!loading && displayLimit < 100) {
        setDisplayLimit(prev => Math.min(100, prev + 10));
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full w-full bg-zinc-950 overflow-y-auto pb-20 no-scrollbar"
    >
      {/* Search Header */}
      <div className="sticky top-0 bg-zinc-950/90 backdrop-blur-md p-4 z-20 border-b border-zinc-900/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setDisplayLimit(10); 
            }}
            placeholder={t('Search')} 
            className="w-full bg-zinc-900 border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-600 transition-all outline-none text-white shadow-inner"
          />
        </div>
      </div>

      {searchQuery && users.length > 0 && (
        <div className="px-4 py-6 bg-zinc-950/50 border-b border-zinc-900/30">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-4 flex items-center gap-2">
            <UserCheck size={14} className="text-zinc-600" />
            {t('Found Profiles')}
          </h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {users.map(user => (
              <div 
                key={user.id} 
                onClick={() => onNavigateToProfile && onNavigateToProfile(user.id)}
                className="flex flex-col items-center gap-2 shrink-0 group cursor-pointer active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-zinc-800 bg-zinc-900 group-hover:border-purple-600 transition-colors">
                  {user.avatar_url ? (
                    <img src={parseMediaUrl(user.avatar_url)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-black text-zinc-600 text-lg">
                      {user.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-zinc-400 max-w-[70px] truncate">@{user.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!searchQuery && suggestedUsers.length > 0 && (
        <div className="px-4 py-6 bg-zinc-950/50 border-b border-zinc-900/30">
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {suggestedUsers.map(user => (
              <div 
                key={user.id} 
                onClick={() => onNavigateToProfile && onNavigateToProfile(user.id)}
                className="flex flex-col items-center gap-2 shrink-0 group cursor-pointer active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-zinc-800 bg-zinc-900 group-hover:border-purple-600 transition-colors">
                  {user.avatar_url ? (
                    <img src={parseMediaUrl(user.avatar_url)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-black text-zinc-600 text-lg">
                      {user.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-zinc-400 max-w-[70px] truncate">@{user.username}</span>
                {currentUserId && (
                  <button
                    onClick={(e) => handleFollowToggle(user.id, e)}
                    className={`w-[66px] py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center border ${
                      followingIds.has(user.id)
                        ? 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700'
                        : 'bg-purple-600 hover:bg-purple-700 text-white border-transparent shadow-lg shadow-purple-600/10'
                    }`}
                  >
                    {followingIds.has(user.id) ? t('Following') : t('Follow')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Post Grid Section */}

      {searchQuery && (
        <div className="px-4 py-2">
           <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 flex items-center gap-2">
            <TrendingUp size={14} className="text-zinc-600" />
            {t('Suggested Videos')}
          </h3>
        </div>
      )}

      {/* Post Grid */}
      <div className="grid grid-cols-3 gap-0.5 px-0.5 mt-2">
        {posts.map(post => (
          <div 
            key={post.id} 
            onClick={() => onNavigateToPost && onNavigateToPost(post.id)}
            className="aspect-[3/4] bg-zinc-900 relative group overflow-hidden cursor-pointer active:scale-95 transition-transform"
          >
            {post.media_url ? (
              <>
                <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                  <div className="bg-black/40 backdrop-blur-md text-white p-1 rounded-md border border-white/10 flex items-center justify-center w-6 h-6">
                    {(post.media_type || 'video') === 'video' ? (
                      <Film size={12} className="text-white" />
                    ) : (
                      <Layers size={12} className="text-white" />
                    )}
                  </div>
                </div>
                {(post.media_type || 'video') === 'video' ? (
                  <video 
                    src={parseMediaUrl(post.media_url)} 
                    className="w-full h-full object-cover" 
                    muted 
                    playsInline 
                    preload="metadata"
                    poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined}
                  />
                ) : (
                  <img 
                    src={parseMediaUrl((post.media_type === 'image' && post.media_url) ? post.media_url : (post.thumbnail_url || ''))} 
                    className="w-full h-full object-cover" 
                    alt="" 
                  />
                )}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/0 transition-colors duration-300" />
                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] text-white font-black drop-shadow-md">
                   <TrendingUp size={10} className="text-yellow-500" />
                   {post.views > 1000 ? `${(post.views / 1000).toFixed(1)}k` : post.views}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 text-zinc-600">
                <AlertCircle size={20} />
              </div>
            )}
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center p-12 gap-3">
          <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{t('Loading')}</span>
        </div>
      )}

      {posts.length === 0 && !loading && (
        <div className="py-20 text-center text-zinc-600 px-10">
           <p className="text-sm font-bold">{t('No videos found')} &quot;{searchQuery}&quot;.</p>
           <p className="text-[10px] uppercase mt-2 tracking-widest">{t('Try another search')}</p>
        </div>
      )}
    </div>
  );
};

export default Discovery;
