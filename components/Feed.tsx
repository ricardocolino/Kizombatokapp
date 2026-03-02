import React, { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Post, Profile } from '../types';
import PostCard from './PostCard';
import { appCache } from '../services/cache';

// Metadados de um post já calculados para o utilizador atual
export interface PostMetadata {
  likesCount: number;
  commentsCount: number;
  liked: boolean;
  isFollowing: boolean;
  isOwnPost: boolean;
}

interface FeedProps {
  onNavigateToProfile: (userId: string) => void;
  onNavigateToSound: (post: Post) => void;
  onRequireAuth?: () => void;
  initialPostId?: string | null;
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
  const [displayLimit, setDisplayLimit] = useState(5);
  // Mapa de postId -> metadados, partilhado por todos os PostCards
  const [metadataMap, setMetadataMap] = useState<Record<string, PostMetadata>>({});
  // Lista de quem o utilizador segue (para o drawer de partilha) — buscado uma vez
  const [followingList, setFollowingList] = useState<Profile[]>([]);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // FETCH BATCH: uma única ronda de queries para TODOS os posts do feed
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchBatchMetadata = React.useCallback(async (postList: Post[], currentUser: User | null) => {
    if (postList.length === 0) return;

    const postIds = postList.map(p => p.id);
    const authorIds = [...new Set(postList.map(p => p.user_id))];
    const userId = currentUser?.id;

    const cacheKey = `batch_metadata_${feedType}_${userId || 'guest'}_${postIds.join(',')}`;
    const cached = appCache.get(cacheKey);
    if (cached) {
      setMetadataMap(cached.metadataMap);
      setFollowingList(cached.followingList);
      return;
    }

    try {
      // ── Query 1: contagem de reações por post ──────────────────────────────
      const { data: allReactions } = await supabase
        .from('reactions')
        .select('post_id')
        .in('post_id', postIds);

      // ── Query 2: contagem de comentários por post ──────────────────────────
      const { data: allComments } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds);

      // ── Query 3 (só se logado): likes e follows do utilizador ──────────────
      let myLikedPostIds: Set<string> = new Set();
      let myFollowedAuthorIds: Set<string> = new Set();
      let newFollowingList: Profile[] = [];

      if (userId) {
        const [reactionsRes, followsRes, followingListRes] = await Promise.all([
          // posts que o utilizador curtiu
          supabase
            .from('reactions')
            .select('post_id')
            .in('post_id', postIds)
            .eq('user_id', userId),
          // autores que o utilizador segue (dentro deste feed)
          supabase
            .from('follows')
            .select('following_id')
            .in('following_id', authorIds)
            .eq('follower_id', userId),
          // lista completa de quem segue (para o drawer de partilha)
          supabase
            .from('follows')
            .select('following_id, profiles:following_id(*)')
            .eq('follower_id', userId),
        ]);

        myLikedPostIds = new Set((reactionsRes.data || []).map((r: { post_id: string }) => r.post_id));
        myFollowedAuthorIds = new Set((followsRes.data || []).map((f: { following_id: string }) => f.following_id));
        newFollowingList = (followingListRes.data || []).map((f: { profiles: Profile }) => f.profiles);
        setFollowingList(newFollowingList);
      }

      // ── Construir o mapa postId -> PostMetadata ────────────────────────────
      const likesPerPost: Record<string, number> = {};
      (allReactions || []).forEach((r: { post_id: string }) => {
        likesPerPost[r.post_id] = (likesPerPost[r.post_id] || 0) + 1;
      });

      const commentsPerPost: Record<string, number> = {};
      (allComments || []).forEach((c: { post_id: string }) => {
        commentsPerPost[c.post_id] = (commentsPerPost[c.post_id] || 0) + 1;
      });

      const newMetadataMap: Record<string, PostMetadata> = {};
      postList.forEach(p => {
        newMetadataMap[p.id] = {
          likesCount: likesPerPost[p.id] || 0,
          commentsCount: commentsPerPost[p.id] || 0,
          liked: myLikedPostIds.has(p.id),
          isFollowing: myFollowedAuthorIds.has(p.user_id),
          isOwnPost: userId === p.user_id,
        };
      });

      setMetadataMap(newMetadataMap);

      // Guardar no cache
      appCache.set(cacheKey, { metadataMap: newMetadataMap, followingList: newFollowingList });

    } catch (err) {
      console.error('Erro no batch metadata:', err);
    }
  }, [feedType]);

  // Callback para o PostCard atualizar localmente o metadataMap sem re-fetch
  const updatePostMetadata = React.useCallback((postId: string, patch: Partial<PostMetadata>) => {
    setMetadataMap(prev => ({
      ...prev,
      [postId]: { ...prev[postId], ...patch },
    }));
    // Invalida o cache batch para que na próxima sessão venha atualizado
    appCache.clear();
  }, []);

  const fetchPosts = React.useCallback(async () => {
    try {
      setLoading(true);

      const cacheKey = `feed_${feedType}_${user?.id || 'guest'}_${initialPostId || 'none'}`;
      const cachedPosts = appCache.get(cacheKey);
      if (cachedPosts) {
        console.log('📦 Usando posts do cache');
        setPosts(cachedPosts);
        setLoading(false);
        return cachedPosts as Post[];
      }

      console.log('🔄 Buscando posts do servidor');
      let query = supabase
        .from('posts')
        .select('*, profiles(*)')
        .order('created_at', { ascending: false })
        .limit(100); // Limite para não buscar tudo ilimitadamente

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
          return [];
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      let rawPosts = data || [];

      // Ordenação por "mais dublados"
      const dubbingCounts: Record<string, number> = {};
      rawPosts.forEach(p => {
        if (p.sound_id) {
          dubbingCounts[p.sound_id] = (dubbingCounts[p.sound_id] || 0) + 1;
        }
      });

      let sortedPosts = [...rawPosts].sort((a, b) => {
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

      const finalPosts = [...firstFive, ...remaining];
      setPosts(finalPosts);
      appCache.set(cacheKey, finalPosts);
      return finalPosts;
    } catch (error) {
      console.error('Error fetching posts:', error);
      return [];
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  }, [feedType, user, initialPostId]);

  useEffect(() => {
    fetchPosts().then(loadedPosts => {
      if (loadedPosts && loadedPosts.length > 0) {
        fetchBatchMetadata(loadedPosts, user);
      }
    });
    setDisplayLimit(5);
  }, [initialPostId, feedType, user, fetchPosts, fetchBatchMetadata]);

  // Infinite Scroll
  useEffect(() => {
    if (loading || displayLimit >= posts.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayLimit(prev => Math.min(prev + 5, posts.length));
        }
      },
      { threshold: 0, rootMargin: '100% 0px' }
    );

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [loading, displayLimit, posts.length]);

  const toggleMute = () => setIsMuted(m => !m);

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
              metadata={metadataMap[post.id]}
              followingList={followingList}
              onNavigateToProfile={onNavigateToProfile}
              onNavigateToSound={onNavigateToSound}
              isMuted={isMuted}
              onToggleMute={toggleMute}
              onRequireAuth={onRequireAuth}
              onUpdateMetadata={updatePostMetadata}
            />
          </div>
        ))}

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
