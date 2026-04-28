
import React, { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { ChevronLeft, PlusSquare } from 'lucide-react';
import { Post } from '../types';
import PostCard from './PostCard';
import { appCache } from '../services/cache';

interface FeedProps {
  onNavigateToProfile: (userId: string) => void;
  onRequireAuth?: () => void;
  onViewStories?: (userId: string, allUserIds?: string[]) => void;
  onJoinLive?: (liveId: string) => void;
  initialPostId?: string | null;
  isPaused?: boolean;
  feedFilter?: { userId: string; userName: string; type: 'user' | 'liked' | 'reposted' } | null;
  onClearFilter?: () => void;
}

export interface PostMetadata {
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  liked: boolean;
  reposted: boolean;
  hasStories: boolean;
  isLive?: string | null; // returns liveId if live
  isFollowing: boolean;
  isOwnPost: boolean;
}

const Feed: React.FC<FeedProps> = ({ onNavigateToProfile, onRequireAuth, onViewStories, onJoinLive, initialPostId, isPaused, feedFilter, onClearFilter }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [feedType, setFeedType] = useState<'for_you' | 'following' | 'education'>('for_you');
  const [user, setUser] = useState<User | null>(null);
  const [displayLimit, setDisplayLimit] = useState(15);
  const pageRef = React.useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 15;
  const [metadataMap, setMetadataMap] = useState<Record<string, PostMetadata>>({});
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  const fetchBatchMetadata = React.useCallback(async (postsToFetch: Post[]) => {
    if (postsToFetch.length === 0) return;
    
    const postIds = postsToFetch.map(p => p.id);
    const authorIds = [...new Set(postsToFetch.map(p => p.user_id))];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user.id;

      // 1. Buscar contagens de reações, reposts e stories ativos e lives ativas
      const [reactionsRes, repostsRes, storiesRes, livesRes] = await Promise.all([
        supabase.from('reactions').select('post_id').in('post_id', postIds),
        supabase.from('reposts').select('post_id').in('post_id', postIds),
        supabase.from('stories').select('user_id').in('user_id', authorIds).gt('expires_at', new Date().toISOString()),
        supabase.from('lives').select('id, host_id').in('host_id', authorIds).eq('status', 'active')
      ]);

      const reactionCounts: Record<string, number> = {};
      reactionsRes.data?.forEach(r => reactionCounts[r.post_id] = (reactionCounts[r.post_id] || 0) + 1);

      const repostCounts: Record<string, number> = {};
      repostsRes.data?.forEach(r => repostCounts[r.post_id] = (repostCounts[r.post_id] || 0) + 1);

      const usersWithStories: Set<string> = new Set(storiesRes.data?.map(s => s.user_id));
      const usersLiveMap: Record<string, string> = {};
      livesRes.data?.forEach(l => usersLiveMap[l.host_id] = l.id);

      // 2. Dados do utilizador logado (likes, follows e reposts)
      let userLikes: Set<string> = new Set();
      let userFollows: Set<string> = new Set();
      let userReposts: Set<string> = new Set();

      if (currentUserId) {
        const [likesRes, followsRes, userRepostsRes] = await Promise.all([
          supabase.from('reactions').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
          supabase.from('follows').select('following_id').eq('follower_id', currentUserId).in('following_id', authorIds),
          supabase.from('reposts').select('post_id').eq('user_id', currentUserId).in('post_id', postIds)
        ]);

        likesRes.data?.forEach(l => userLikes.add(l.post_id));
        followsRes.data?.forEach(f => userFollows.add(f.following_id));
        userRepostsRes.data?.forEach(r => userReposts.add(r.post_id));
      }

      // 4. Montar o mapa de metadados
      const newMetadata: Record<string, PostMetadata> = {};
      postsToFetch.forEach(p => {
        newMetadata[p.id] = {
          likesCount: reactionCounts[p.id] || 0,
          commentsCount: 0,
          repostsCount: repostCounts[p.id] || 0,
          liked: userLikes.has(p.id),
          reposted: userReposts.has(p.id),
          hasStories: usersWithStories.has(p.user_id),
          isLive: usersLiveMap[p.user_id] || null,
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

  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPosts = React.useCallback(async (isNextPage = false) => {
    try {
      if (!isNextPage) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      
      const currentPage = isNextPage ? pageRef.current + 1 : 0;
      pageRef.current = currentPage;
      
      // GERAR CHAVE ÚNICA PARA ESTE FEED (Apenas para a primeira página)
      const filterKey = feedFilter ? `${feedFilter.type}_${feedFilter.userId}` : 'none';
      const cacheKey = `feed_${feedType}_${user?.id || 'guest'}_${initialPostId || 'none'}_${filterKey}`;
      
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
        .order('is_ready', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (feedFilter) {
        if (feedFilter.type === 'user') {
          query = query.eq('user_id', feedFilter.userId);
        } else if (feedFilter.type === 'liked') {
          const { data: reactions } = await supabase
            .from('reactions')
            .select('post_id')
            .eq('user_id', feedFilter.userId)
            .eq('type', 'like');
          
          const likedPostIds = reactions?.map(r => r.post_id) || [];
          if (likedPostIds.length > 0) {
            query = query.in('id', likedPostIds);
          } else {
            setPosts([]);
            setLoading(false);
            return;
          }
        } else if (feedFilter.type === 'reposted') {
          const { data: reposts } = await supabase
            .from('reposts')
            .select('post_id')
            .eq('user_id', feedFilter.userId);
          
          const repostedPostIds = reposts?.map(r => r.post_id) || [];
          if (repostedPostIds.length > 0) {
            query = query.in('id', repostedPostIds);
          } else {
            setPosts([]);
            setLoading(false);
            return;
          }
        }
      } else if (feedType === 'following' && user) {
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
      } else if (feedType === 'education') {
        query = query.eq('is_education', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let rawPosts = data || [];
      setHasMore(rawPosts.length === PAGE_SIZE);

      let sortedPosts = [...rawPosts];
      if (currentPage === 0) {
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
      const message = error instanceof Error ? error.message : 'Erro ao carregar os vídeos. Verifica a tua ligação.';
      setError(message);
    } finally {
      if (!isNextPage) {
        setTimeout(() => setLoading(false), 800);
      } else {
        setLoadingMore(false);
      }
    }
  }, [feedType, user, initialPostId, fetchBatchMetadata, feedFilter]);

  useEffect(() => {
    fetchPosts();
    setDisplayLimit(15); // Reset limit when feed type or initial post changes
  }, [initialPostId, feedType, user, fetchPosts, feedFilter]);

  // Intersection Observer for Infinite Scroll - Only for internal displayLimit
  useEffect(() => {
    if (loading || displayLimit >= posts.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Increment limit internally, but don't fetch from network
          setDisplayLimit(prev => Math.min(prev + 15, posts.length));
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
  }, [loading, displayLimit, posts.length]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (loading) {
    return (
      <div className="feed-container h-full w-full bg-black">
        {[1, 2, 3].map(i => (
          <div key={i} className="feed-item h-full w-full bg-zinc-900 animate-pulse relative">
            <div className="absolute bottom-10 left-5 space-y-3 w-2/3">
              <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
              <div className="h-3 bg-zinc-800 rounded w-full"></div>
              <div className="h-3 bg-zinc-800 rounded w-3/4"></div>
            </div>
            <div className="absolute right-4 bottom-24 space-y-6">
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="w-12 h-12 bg-zinc-800 rounded-full"></div>
              ))}
            </div>
          </div>
        ))}
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
        <p className="font-bold text-lg mb-2">Ainda não há vídeos!</p>
        <p className="text-sm">Sê o primeiro a brilhar na banda. Publica um vídeo agora.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black relative overflow-hidden">
      {/* Feed Tabs or Filter Header */}
      {!feedFilter ? (
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
          <button 
            onClick={() => setFeedType('education')}
            className={`text-base sm:text-lg font-bold pointer-events-auto transition-all ${feedType === 'education' ? 'text-white scale-110' : 'text-white/60'}`}
          >
            Educação
            {feedType === 'education' && <div className="h-1 w-5 sm:w-6 bg-white mx-auto mt-1 rounded-full" />}
          </button>
        </div>
      ) : (
        <div className="absolute top-8 sm:top-12 left-0 w-full flex items-center px-4 z-50 pointer-events-none">
          <button 
            onClick={onClearFilter}
            className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white pointer-events-auto active:scale-90 transition-transform"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 flex justify-center pr-10">
            <span className="text-sm sm:text-base font-black uppercase tracking-widest text-white drop-shadow-lg">
              {feedFilter.type === 'user' && `Vídeos de ${feedFilter.userName}`}
              {feedFilter.type === 'liked' && `Vídeos curtidos por ${feedFilter.userName}`}
              {feedFilter.type === 'reposted' && `Vídeos republicados por ${feedFilter.userName}`}
            </span>
          </div>
        </div>
      )}

      <div className="feed-container h-full w-full no-scrollbar">
        {posts.slice(0, displayLimit).map((post) => (
          <div key={post.id} className="feed-item relative">
            <PostCard 
              post={post} 
              metadata={metadataMap[post.id] || { likesCount: 0, commentsCount: 0, repostsCount: 0, liked: false, reposted: false, hasStories: false, isFollowing: false, isOwnPost: false }}
              onUpdateMetadata={handleUpdateMetadata}
              onNavigateToProfile={onNavigateToProfile} 
              isMuted={isMuted}
              onToggleMute={toggleMute}
              onRequireAuth={onRequireAuth}
              onViewStories={onViewStories}
              onJoinLive={onJoinLive}
              isPaused={isPaused}
            />
          </div>
        ))}
        
        {/* Ver mais vídeos Button - Every 50 videos limit */}
        {displayLimit >= posts.length && hasMore && !loading && (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-black gap-6 px-10 text-center snap-start">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center text-white shadow-2xl border border-zinc-800">
              <PlusSquare size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black uppercase tracking-tighter">Chegaste ao fim da banda?</h3>
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest leading-loose">
                Vimos os primeiros {posts.length} vídeos. <br/> Queres ver o que mais está a bater?
              </p>
            </div>
            <button 
              onClick={() => fetchPosts(true)}
              disabled={loadingMore}
              className="mt-4 bg-white text-black px-12 py-4 rounded-full font-black uppercase text-xs tracking-[0.2em] shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-3"
            >
              {loadingMore ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Buscando...
                </>
              ) : (
                'Ver mais vídeos'
              )}
            </button>
          </div>
        )}

        {/* Sentinel invisível para carregar internamente os posts já baixados */}
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
