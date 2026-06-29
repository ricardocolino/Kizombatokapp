
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Post, Profile } from '../types';
import { Search, TrendingUp, AlertCircle, UserCheck, Heart, Play } from 'lucide-react';
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
  const [likesMap, setLikesMap] = useState<Record<string, number>>({});
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

  // 🚀 Preload/Pre-warm the first few video files in the background so they play instantly when clicked
  useEffect(() => {
    if (!posts || posts.length === 0) return;

    // Filter first 6 video URLs
    const videoUrlsToPreload = posts
      .filter(p => (p.media_type || 'video') === 'video' && p.media_url)
      .slice(0, 6)
      .map(p => parseMediaUrl(p.media_url));

    const head = document.head;
    const elements: HTMLLinkElement[] = [];

    videoUrlsToPreload.forEach(url => {
      if (!url) return;

      // 1. Prefetch link element to invoke browser cache system
      if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'video';
        link.href = url;
        head.appendChild(link);
        elements.push(link);
      }

      // 2. Fetch as a reliable fallback for mobile webviews/Capacitor
      try {
        fetch(url, { method: 'GET', credentials: 'omit' }).catch(() => {});
      } catch { /* ignore fallback errors */ }
    });

    return () => {
      // Cleanup prefetch links from DOM on unmount or updates
      elements.forEach(el => {
        if (head.contains(el)) {
          head.removeChild(el);
        }
      });
    };
  }, [posts]);

  // Fetch real likes count from the database
  useEffect(() => {
    if (!posts || posts.length === 0) return;
    const fetchLikes = async () => {
      try {
        const postIds = posts.map(p => p.id);
        const { data, error } = await supabase
          .from('reactions')
          .select('post_id')
          .in('post_id', postIds)
          .eq('type', 'like');

        if (!error && data) {
          const counts: Record<string, number> = {};
          data.forEach(r => {
            counts[r.post_id] = (counts[r.post_id] || 0) + 1;
          });
          setLikesMap(counts);
        }
      } catch (err) {
        console.error('Error fetching post likes:', err);
      }
    };
    fetchLikes();
  }, [posts]);

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
      <div className="grid grid-cols-2 gap-3 px-3 mt-2">
        {/* Left Column */}
        <div className="flex flex-col gap-3">
          {posts.filter((_, idx) => idx % 2 === 0).map((post, idx) => {
            const actualIndex = idx * 2;
            const aspectClass = (actualIndex % 4 === 0) ? 'aspect-[3/4.2]' : (actualIndex % 4 === 2) ? 'aspect-[3/3.8]' : 'aspect-[3/5]';
            return (
              <div 
                key={post.id} 
                onClick={() => onNavigateToPost && onNavigateToPost(post.id)}
                className="flex flex-col cursor-pointer group active:scale-[0.98] transition-transform"
              >
                <div className={`relative ${aspectClass} w-full bg-zinc-900 rounded-2xl overflow-hidden shadow-lg border border-zinc-900/40`}>
                  {post.media_url ? (
                    <>
                      {(post.media_type || 'video') === 'video' ? (
                        <>
                          <video 
                            src={parseMediaUrl(post.media_url)} 
                            className="w-full h-full object-cover rounded-2xl" 
                            muted 
                            playsInline 
                            preload="metadata"
                            poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined}
                          />
                          <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md rounded-full w-7 h-7 flex items-center justify-center border border-white/10 z-10">
                            <Play size={11} className="text-white fill-white translate-x-[0.5px]" />
                          </div>
                        </>
                      ) : (
                        <img 
                          src={parseMediaUrl((post.media_type === 'image' && post.media_url) ? post.media_url : (post.thumbnail_url || ''))} 
                          className="w-full h-full object-cover rounded-2xl" 
                          alt="" 
                        />
                      )}
                      
                      {post.content && (
                        <div className="absolute bottom-0 left-0 w-full p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none">
                          <p className="text-[10px] font-semibold text-white/95 line-clamp-2 leading-snug drop-shadow-sm">
                            {post.content}
                          </p>
                        </div>
                      )}
                      
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors duration-300 rounded-2xl" />
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 text-zinc-600 rounded-2xl">
                      <AlertCircle size={20} />
                    </div>
                  )}
                </div>

                {/* Metadata Row below card */}
                <div className="flex items-center justify-between mt-2 px-1 pb-2">
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateToProfile) {
                        onNavigateToProfile(post.user_id);
                      }
                    }}
                    className="flex items-center gap-1.5 overflow-hidden flex-1 cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-850 shrink-0 border border-zinc-900 shadow-sm">
                      {post.profiles?.avatar_url ? (
                        <img src={parseMediaUrl(post.profiles.avatar_url)} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-400 font-extrabold text-[9px] uppercase">
                          {post.profiles?.username?.[0] || 'U'}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-zinc-300 truncate max-w-[85px] hover:text-white transition-colors">
                      {post.profiles?.username || 'user'}
                    </span>
                    {post.profiles?.onboarding_completed && (
                      <div className="w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[8px] font-black text-black scale-90 select-none flex-shrink-0">
                        ✓
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 text-zinc-400 font-bold text-[11px] shrink-0">
                    <Heart size={12} className="text-zinc-400 hover:text-rose-500 transition-colors" />
                    <span>
                      {likesMap[post.id] !== undefined 
                        ? likesMap[post.id] 
                        : (post.views > 0 ? Math.floor(post.views * 0.15) : 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-3">
          {posts.filter((_, idx) => idx % 2 === 1).map((post, idx) => {
            const actualIndex = idx * 2 + 1;
            const aspectClass = (actualIndex % 4 === 1) ? 'aspect-[3/5]' : (actualIndex % 4 === 3) ? 'aspect-[3/4.6]' : 'aspect-[3/4]';
            return (
              <div 
                key={post.id} 
                onClick={() => onNavigateToPost && onNavigateToPost(post.id)}
                className="flex flex-col cursor-pointer group active:scale-[0.98] transition-transform"
              >
                <div className={`relative ${aspectClass} w-full bg-zinc-900 rounded-2xl overflow-hidden shadow-lg border border-zinc-900/40`}>
                  {post.media_url ? (
                    <>
                      {(post.media_type || 'video') === 'video' ? (
                        <>
                          <video 
                            src={parseMediaUrl(post.media_url)} 
                            className="w-full h-full object-cover rounded-2xl" 
                            muted 
                            playsInline 
                            preload="metadata"
                            poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined}
                          />
                          <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md rounded-full w-7 h-7 flex items-center justify-center border border-white/10 z-10">
                            <Play size={11} className="text-white fill-white translate-x-[0.5px]" />
                          </div>
                        </>
                      ) : (
                        <img 
                          src={parseMediaUrl((post.media_type === 'image' && post.media_url) ? post.media_url : (post.thumbnail_url || ''))} 
                          className="w-full h-full object-cover rounded-2xl" 
                          alt="" 
                        />
                      )}
                      
                      {post.content && (
                        <div className="absolute bottom-0 left-0 w-full p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none">
                          <p className="text-[10px] font-semibold text-white/95 line-clamp-2 leading-snug drop-shadow-sm">
                            {post.content}
                          </p>
                        </div>
                      )}
                      
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors duration-300 rounded-2xl" />
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 text-zinc-600 rounded-2xl">
                      <AlertCircle size={20} />
                    </div>
                  )}
                </div>

                {/* Metadata Row below card */}
                <div className="flex items-center justify-between mt-2 px-1 pb-2">
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateToProfile) {
                        onNavigateToProfile(post.user_id);
                      }
                    }}
                    className="flex items-center gap-1.5 overflow-hidden flex-1 cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-850 shrink-0 border border-zinc-900 shadow-sm">
                      {post.profiles?.avatar_url ? (
                        <img src={parseMediaUrl(post.profiles.avatar_url)} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-400 font-extrabold text-[9px] uppercase">
                          {post.profiles?.username?.[0] || 'U'}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-zinc-300 truncate max-w-[85px] hover:text-white transition-colors">
                      {post.profiles?.username || 'user'}
                    </span>
                    {post.profiles?.onboarding_completed && (
                      <div className="w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[8px] font-black text-black scale-90 select-none flex-shrink-0">
                        ✓
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 text-zinc-400 font-bold text-[11px] shrink-0">
                    <Heart size={12} className="text-zinc-400 hover:text-rose-500 transition-colors" />
                    <span>
                      {likesMap[post.id] !== undefined 
                        ? likesMap[post.id] 
                        : (post.views > 0 ? Math.floor(post.views * 0.15) : 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
