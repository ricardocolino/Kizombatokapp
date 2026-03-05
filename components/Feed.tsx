
import React, { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Post, Profile } from '../types';
import PostCard from './PostCard';
import { appCache } from '../services/cache';

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
  const [loading, setLoading] = useState(true);
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
          .select('*, profiles(*)')
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
      if (!isNextPage) setLoading(true);
      
      const currentPage = isNextPage ? pageRef.current + 1 : 0;
      pageRef.current = currentPage;
      
      // GERAR CHAVE ÚNICA PARA ESTE FEED (Apenas para a primeira página)
      const cacheKey = `feed_${feedType}_${user?.id || 'guest'}_${initialPostId || 'none'}`;
      
      if (!isNextPage) {
        // VERIFICAR CACHE PRIMEIRO
        const cachedPosts = appCache.get(cacheKey);
        if (cachedPosts && cachedPosts.length > 0) {
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
        .select(`*, profiles (*)`)
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
        // ... ordenação existente ...
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

      // BUSCAR METADADOS EM LOTE
      fetchBatchMetadata(sortedPosts);

      setPosts(prevPosts => isNextPage ? [...prevPosts, ...sortedPosts] : sortedPosts);
      
      // SÓ GUARDAR NO CACHE SE HOUVER POSTS
      if (currentPage === 0 && sortedPosts.length > 0) {
        appCache.set(cacheKey, sortedPosts);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
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

      <div className="feed-container h-full w-full">
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
