
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Post, Profile } from '../types';
import { Search, TrendingUp, AlertCircle, UserCheck, Layers, Heart, Play } from 'lucide-react';
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
      {(() => {
        const leftColumnPosts = posts.filter((_, idx) => idx % 2 === 0);
        const rightColumnPosts = posts.filter((_, idx) => idx % 2 !== 0);

        return (
          <div className="grid grid-cols-2 gap-3.5 px-3.5 mt-2">
            {/* Left Column */}
            <div className="flex flex-col">
              {leftColumnPosts.map(post => {
                const idHash = post.id.split('-').join('');
                const numericId = idHash ? parseInt(idHash.slice(0, 4), 16) : 0;
                const likesCount = Math.max(2, Math.floor((post.views || 0) * 0.15 + (numericId % 15 || 3)));
                const formattedLikes = likesCount >= 1000 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount;
                const isTall = (numericId % 3) === 0;
                const cardHeightClass = isTall ? 'aspect-[3/4.6]' : 'aspect-[3/4.1]';

                return (
                  <div 
                    key={post.id} 
                    onClick={() => onNavigateToPost?.(post.id)}
                    className="flex flex-col mb-4.5 cursor-pointer active:scale-[0.98] transition-all group"
                  >
                    <div className={`relative ${cardHeightClass} w-full rounded-[20px] overflow-hidden bg-zinc-900 border border-zinc-800/10 shadow-lg shadow-black/20`}>
                      {post.media_url ? (
                        <>
                          <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                            <div className="bg-black/35 backdrop-blur-md text-white p-1.5 rounded-full flex items-center justify-center w-7 h-7 border border-white/5">
                              {(post.media_type || 'video') === 'video' ? (
                                <Play size={10} className="fill-white text-white ml-0.5" />
                              ) : (
                                <Layers size={10} className="text-white" />
                              )}
                            </div>
                          </div>
                          {(post.media_type || 'video') === 'video' ? (
                            <video 
                              src={parseMediaUrl(post.media_url)} 
                              className="w-full h-full object-cover pointer-events-none" 
                              muted 
                              playsInline 
                              preload="metadata"
                              poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined}
                            />
                          ) : (
                            <img 
                              src={parseMediaUrl((post.media_type === 'image' && post.media_url) ? post.media_url : (post.thumbnail_url || ''))} 
                              className="w-full h-full object-cover pointer-events-none" 
                              alt="" 
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10 group-hover:from-black/15 transition-colors duration-300" />
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 text-zinc-600">
                          <AlertCircle size={20} />
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 px-1 flex items-center justify-between gap-2">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToProfile?.(post.user_id);
                        }}
                        className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-800 bg-zinc-900 shrink-0">
                          {post.profiles?.avatar_url ? (
                            <img src={parseMediaUrl(post.profiles.avatar_url)} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-black text-zinc-500 text-[10px] bg-zinc-800">
                              {post.profiles?.username?.[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center min-w-0">
                          <span className="text-xs font-semibold text-zinc-300 truncate tracking-tight">
                            {post.profiles?.username || 'User'}
                          </span>
                          {(post.profiles?.monetization_status === 'approved' || numericId % 4 === 0) && (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-purple-600 text-white shrink-0 ml-1 shadow-md shadow-purple-600/15" title="Verificado">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="w-2 h-2">
                                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 text-zinc-400">
                        <Heart size={13} className="text-zinc-400 hover:text-red-500 transition-colors" />
                        <span className="text-xs font-semibold tracking-tight text-zinc-400">
                          {formattedLikes}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column */}
            <div className="flex flex-col">
              {rightColumnPosts.map(post => {
                const idHash = post.id.split('-').join('');
                const numericId = idHash ? parseInt(idHash.slice(0, 4), 16) : 0;
                const likesCount = Math.max(2, Math.floor((post.views || 0) * 0.15 + (numericId % 15 || 3)));
                const formattedLikes = likesCount >= 1000 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount;
                const isTall = (numericId % 3) === 1;
                const cardHeightClass = isTall ? 'aspect-[3/4.6]' : 'aspect-[3/4.1]';

                return (
                  <div 
                    key={post.id} 
                    onClick={() => onNavigateToPost?.(post.id)}
                    className="flex flex-col mb-4.5 cursor-pointer active:scale-[0.98] transition-all group"
                  >
                    <div className={`relative ${cardHeightClass} w-full rounded-[20px] overflow-hidden bg-zinc-900 border border-zinc-800/10 shadow-lg shadow-black/20`}>
                      {post.media_url ? (
                        <>
                          <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                            <div className="bg-black/35 backdrop-blur-md text-white p-1.5 rounded-full flex items-center justify-center w-7 h-7 border border-white/5">
                              {(post.media_type || 'video') === 'video' ? (
                                <Play size={10} className="fill-white text-white ml-0.5" />
                              ) : (
                                <Layers size={10} className="text-white" />
                              )}
                            </div>
                          </div>
                          {(post.media_type || 'video') === 'video' ? (
                            <video 
                              src={parseMediaUrl(post.media_url)} 
                              className="w-full h-full object-cover pointer-events-none" 
                              muted 
                              playsInline 
                              preload="metadata"
                              poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined}
                            />
                          ) : (
                            <img 
                              src={parseMediaUrl((post.media_type === 'image' && post.media_url) ? post.media_url : (post.thumbnail_url || ''))} 
                              className="w-full h-full object-cover pointer-events-none" 
                              alt="" 
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10 group-hover:from-black/15 transition-colors duration-300" />
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 text-zinc-600">
                          <AlertCircle size={20} />
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 px-1 flex items-center justify-between gap-2">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToProfile?.(post.user_id);
                        }}
                        className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-800 bg-zinc-900 shrink-0">
                          {post.profiles?.avatar_url ? (
                            <img src={parseMediaUrl(post.profiles.avatar_url)} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-black text-zinc-500 text-[10px] bg-zinc-800">
                              {post.profiles?.username?.[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center min-w-0">
                          <span className="text-xs font-semibold text-zinc-300 truncate tracking-tight">
                            {post.profiles?.username || 'User'}
                          </span>
                          {(post.profiles?.monetization_status === 'approved' || numericId % 4 === 0) && (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-purple-600 text-white shrink-0 ml-1 shadow-md shadow-purple-600/15" title="Verificado">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="w-2 h-2">
                                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 text-zinc-400">
                        <Heart size={13} className="text-zinc-400 hover:text-red-500 transition-colors" />
                        <span className="text-xs font-semibold tracking-tight text-zinc-400">
                          {formattedLikes}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
