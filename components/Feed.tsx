
import React, { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Post, Profile, LiveStream as LiveStreamType } from '../types';
import PostCard from './PostCard';
import { appCache } from '../services/cache';
import { Radio, Users, ChevronRight, X } from 'lucide-react';
import ViewerLive from './ViewerLive';

interface FeedProps {
  onNavigateToProfile: (userId: string) => void;
  onNavigateToSound: (post: Post) => void;
  onRequireAuth?: () => void;
  initialPostId?: string | null;
}

export interface PostMetadata {
  likesCount: number;
  commentsCount: number;
  liked: boolean;
  isFollowing: boolean;
  isOwnPost: boolean;
}

const PostSkeleton = () => (
  <div className="feed-item h-full w-full bg-zinc-900 animate-pulse relative">
    <div className="absolute bottom-10 left-5 space-y-3 w-2/3">
      <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
      <div className="h-3 bg-zinc-800 rounded w-full"></div>
      <div className="h-3 bg-zinc-800 rounded w-3/4"></div>
    </div>
    <div className="absolute right-4 bottom-24 space-y-6">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="w-12 h-12 bg-zinc-800 rounded-full"></div>
      ))}
    </div>
  </div>
);

const Feed: React.FC<FeedProps> = ({ onNavigateToProfile, onNavigateToSound, onRequireAuth, initialPostId }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeLives, setActiveLives] = useState<LiveStreamType[]>([]);
  const [selectedLive, setSelectedLive] = useState<LiveStreamType | null>(null);
  const [showLivesOverlay, setShowLivesOverlay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [feedType, setFeedType] = useState<'for_you' | 'following'>('for_you');
  const [user, setUser] = useState<User | null>(null);
  const [displayLimit, setDisplayLimit] = useState(20);
  const pageRef = React.useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;
  const [metadataMap, setMetadataMap] = useState<Record<string, PostMetadata>>({});
  const [followingList, setFollowingList] = useState<Profile[]>([]);
  const [originalPostsMap, setOriginalPostsMap] = useState<Record<string, { post: Post, profile: Profile }>>({});
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    const fetchLives = async () => {
      const { data } = await supabase
        .from('lives')
        .select('*, profiles(*)')
        .eq('is_active', true)
        .order('started_at', { ascending: false });
      if (data) setActiveLives(data);
    };
    fetchLives();
  }, []);

  const fetchBatchMetadata = React.useCallback(async (postsToFetch: Post[]) => {
    if (postsToFetch.length === 0) return;
    
    const postIds = postsToFetch.map(p => p.id);
    const authorIds = [...new Set(postsToFetch.map(p => p.user_id))];
    const soundIds = postsToFetch.map(p => p.sound_id).filter(Boolean) as string[];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user.id;

      // 1. Buscar contagens de reações
      const [reactionsRes] = await Promise.all([
        supabase.from('reactions').select('post_id').in('post_id', postIds)
      ]);

      const reactionCounts: Record<string, number> = {};
      reactionsRes.data?.forEach(r => reactionCounts[r.post_id] = (reactionCounts[r.post_id] || 0) + 1);

      // 2. Dados do utilizador logado (likes e follows)
      let userLikes: Set<string> = new Set();
      let userFollows: Set<string> = new Set();
      let currentFollowingList: Profile[] = [];

      if (currentUserId) {
        const [likesRes, followsRes, followingListRes] = await Promise.all([
          supabase.from('reactions').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
          supabase.from('follows').select('following_id').eq('follower_id', currentUserId).in('following_id', authorIds),
          supabase.from('follows').select('following_id, profiles:following_id(*)').eq('follower_id', currentUserId)
        ]);

        likesRes.data?.forEach(l => userLikes.add(l.post_id));
        followsRes.data?.forEach(f => userFollows.add(f.following_id));
        
        if (followingListRes.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentFollowingList = followingListRes.data.map((f: any) => f.profiles).filter(Boolean);
          setFollowingList(currentFollowingList);
        }
      }

      // 3. Buscar posts originais para dublagens
      if (soundIds.length > 0) {
        const { data: sounds } = await supabase
          .from('posts')
          .select('*, profiles!user_id(*)')
          .in('id', soundIds);
        
        if (sounds) {
          const newOriginals: Record<string, { post: Post, profile: Profile }> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sounds.forEach((s: any) => {
            if (s.profiles) {
              newOriginals[s.id] = { post: s as Post, profile: s.profiles as Profile };
            }
          });
          setOriginalPostsMap(prev => ({ ...prev, ...newOriginals }));
        }
      }

      // 4. Montar o mapa de metadados
      const newMetadata: Record<string, PostMetadata> = {};
      postsToFetch.forEach(p => {
        newMetadata[p.id] = {
          likesCount: reactionCounts[p.id] || 0,
          commentsCount: 0, // Não buscar contagem até o utilizador clicar
          liked: userLikes.has(p.id),
          isFollowing: userFollows.has(p.user_id),
          isOwnPost: currentUserId === p.user_id
        };
      });

      setMetadataMap(prev => ({ ...prev, ...newMetadata }));
    } catch (e) {
      console.error("Erro ao carregar batch metadata:", e);
    }
  }, []);

  const handleUpdateMetadata = React.useCallback((postId: string, updates: Partial<PostMetadata>) => {
    setMetadataMap(prev => ({
      ...prev,
      [postId]: { ...prev[postId], ...updates }
    }));
  }, []);

  const fetchPosts = React.useCallback(async (isNextPage = false) => {
    try {
      if (!isNextPage) {
        setLoading(true);
        setError(null);
      }
      
      const currentPage = isNextPage ? pageRef.current + 1 : 0;
      pageRef.current = currentPage;
      
      // GERAR CHAVE ÚNICA PARA ESTE FEED (Apenas para a primeira página)
      const cacheKey = `feed_${feedType}_${user?.id || 'guest'}_${initialPostId || 'none'}`;
      
      if (!isNextPage) {
        // VERIFICAR CACHE PRIMEIRO
        const cachedPosts = appCache.get(cacheKey);
        if (cachedPosts) {
          console.log('📦 Usando posts do cache');
          setPosts(cachedPosts);
          fetchBatchMetadata(cachedPosts);
          setLoading(false);
          return;
        }
      }

      console.log(`🔄 Buscando posts do servidor (página ${currentPage})`);
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      let query = supabase
        .from('posts')
        .select(`*, profiles!user_id (*)`)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (feedType === 'following' && user) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        
        const followingIds = follows?.map(f => f.following_id) || [];
        if (followingIds.length > 0) {
          query = query.in('user_id', followingIds);
        } else {
          setPosts([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let rawPosts = data || [];
      setHasMore(rawPosts.length === PAGE_SIZE);

      let sortedPosts = [...rawPosts];
      if (currentPage === 0) {
        const dubbingCounts: Record<string, number> = {};
        rawPosts.forEach(p => {
          if (p.sound_id) {
            dubbingCounts[p.sound_id] = (dubbingCounts[p.sound_id] || 0) + 1;
          }
        });

        sortedPosts.sort((a, b) => {
          const countA = dubbingCounts[a.id] || 0;
          const countB = dubbingCounts[b.id] || 0;
          if (countB !== countA) return countB - countA;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        if (initialPostId) {
          const targetPost = sortedPosts.find(p => p.id === initialPostId);
          if (targetPost) {
            sortedPosts = [targetPost, ...sortedPosts.filter(p => p.id !== initialPostId)];
          }
        }

        const firstFive = sortedPosts.slice(0, 5);
        const remaining = sortedPosts.slice(5);
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        sortedPosts = [...firstFive, ...remaining];
      }

      // BUSCAR METADADOS EM LOTE (Apenas para os novos posts)
      fetchBatchMetadata(sortedPosts);

      setPosts(prevPosts => isNextPage ? [...prevPosts, ...sortedPosts] : sortedPosts);
      
      if (currentPage === 0) {
        appCache.set(cacheKey, sortedPosts);
      }
    } catch (error: unknown) {
      console.error('Error fetching posts:', error);
      const message = error instanceof Error ? error.message : 'Erro ao carregar os mambos. Verifica a tua ligação.';
      setError(message);
    } finally {
      if (!isNextPage) setTimeout(() => setLoading(false), 800);
    }
  }, [feedType, user, initialPostId, fetchBatchMetadata]);

  useEffect(() => {
    fetchPosts();
    setDisplayLimit(20); // Reset limit when feed type or initial post changes
  }, [initialPostId, feedType, user, fetchPosts]);

  // Intersection Observer for Infinite Scroll
  useEffect(() => {
    if (loading || displayLimit >= posts.length) {
      if (!loading && hasMore && displayLimit >= posts.length) {
        fetchPosts(true);
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayLimit(prev => Math.min(prev + 20, posts.length));
        }
      },
      { 
        threshold: 0,
        rootMargin: '100% 0px'
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [loading, displayLimit, posts.length, hasMore, fetchPosts]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (loading) {
    return (
      <div className="feed-container h-full w-full bg-black">
        {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-zinc-500 p-10 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <p className="font-bold text-white text-lg mb-2">Eish, algo correu mal!</p>
        <p className="text-sm mb-8 max-w-xs">{error}</p>
        <button 
          onClick={() => fetchPosts()}
          className="bg-white text-black px-8 py-3 rounded-full font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-zinc-500 p-10 text-center">
        <p className="font-bold text-lg mb-2">O mambo está vazio!</p>
        <p className="text-sm">Sê o primeiro a brilhar na banda. Publica um vídeo agora.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black relative overflow-hidden">
      {/* Feed Tabs */}
      <div className="absolute top-8 sm:top-12 left-0 w-full flex justify-center items-center gap-4 sm:gap-6 z-50 pointer-events-none">
        <button 
          onClick={() => setFeedType('following')}
          className={`text-base sm:text-lg font-bold pointer-events-auto transition-all ${feedType === 'following' ? 'text-white scale-110' : 'text-white/60'}`}
        >
          A seguir
          {feedType === 'following' && <div className="h-1 w-5 sm:w-6 bg-white mx-auto mt-1 rounded-full" />}
        </button>
        <button 
          onClick={() => setFeedType('for_you')}
          className={`text-base sm:text-lg font-bold pointer-events-auto transition-all ${feedType === 'for_you' ? 'text-white scale-110' : 'text-white/60'}`}
        >
          Para ti
          {feedType === 'for_you' && <div className="h-1 w-5 sm:w-6 bg-white mx-auto mt-1 rounded-full" />}
        </button>
      </div>

      {/* Lives Button */}
      <div className="absolute top-8 sm:top-12 left-4 z-50">
        <button 
          onClick={() => setShowLivesOverlay(true)}
          className="flex items-center gap-2 text-base sm:text-lg font-bold text-white/60 hover:text-white transition-all pointer-events-auto"
        >
          <Radio size={20} className="text-red-600 animate-pulse" />
          <span>Lives</span>
          {activeLives.length > 0 && (
            <span className="bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-black">
              {activeLives.length}
            </span>
          )}
        </button>
      </div>

      {showLivesOverlay && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="h-full flex flex-col">
            <header className="pt-16 px-6 pb-6 flex items-center justify-between border-b border-white/5">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tighter text-white">Lives Ativas</h2>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Vibe em Direto da Banda 🇦🇴</p>
              </div>
              <button 
                onClick={() => setShowLivesOverlay(false)}
                className="p-2 bg-white/5 rounded-full text-white"
              >
                <X size={24} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
              {activeLives.length > 0 ? (
                activeLives.map(live => (
                  <div 
                    key={live.id}
                    onClick={() => {
                      setSelectedLive(live);
                      setShowLivesOverlay(false);
                    }}
                    className="bg-zinc-900/50 border border-white/5 p-5 rounded-[32px] flex items-center justify-between group active:scale-95 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full border-2 border-red-600 p-1">
                          <div className="w-full h-full rounded-full overflow-hidden bg-zinc-800">
                            {live.profiles?.avatar_url ? (
                              <img src={live.profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-lg font-black">
                                {live.profiles?.username?.[0].toUpperCase() || 'A'}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-red-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter border-2 border-black shadow-lg">Live</div>
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">@{live.profiles?.username}</p>
                        <p className="text-[11px] text-zinc-400 font-medium mt-1 line-clamp-1">{live.title}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-bold">
                            <Users size={12} className="text-red-600" />
                            {live.viewer_count} a ver
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 group-hover:text-white transition-colors">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-30 grayscale py-20">
                  <Radio size={64} className="text-zinc-500 mb-6" />
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-center">Ninguém em direto agora</p>
                  <p className="text-[10px] text-center mt-2 max-w-[200px]">Sê o primeiro a entrar em direto e mostra a tua vibe!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedLive && (
        <ViewerLive 
          channelName={selectedLive.channel_name}
          onClose={() => setSelectedLive(null)}
          hostProfile={selectedLive.profiles}
        />
      )}

      <div className="feed-container h-full w-full no-scrollbar">
        {posts.slice(0, displayLimit).map((post) => (
          <div key={post.id} className="feed-item relative">
            <PostCard 
              post={post} 
              metadata={metadataMap[post.id] || { likesCount: 0, commentsCount: 0, liked: false, isFollowing: false, isOwnPost: false }}
              followingList={followingList}
              originalSoundData={post.sound_id ? originalPostsMap[post.sound_id] : undefined}
              onUpdateMetadata={handleUpdateMetadata}
              onNavigateToProfile={onNavigateToProfile} 
              onNavigateToSound={onNavigateToSound}
              isMuted={isMuted}
              onToggleMute={toggleMute}
              onRequireAuth={onRequireAuth}
            />
          </div>
        ))}
        
        {/* Sentinel invisível para carregar mais sem interromper o scroll */}
        {displayLimit < posts.length && (
          <div ref={loadMoreRef} className="h-20 w-full flex items-center justify-center bg-black">
            <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin opacity-20"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Feed;
