
import React, { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Post } from '../types';
import PostCard from './PostCard';
import { appCache } from '../services/cache';

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
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  const fetchPosts = React.useCallback(async () => {
    try {
      setLoading(true);
      
      // GERAR CHAVE ÚNICA PARA ESTE FEED
      const cacheKey = `feed_${feedType}_${user?.id || 'guest'}_${initialPostId || 'none'}`;
      
      // VERIFICAR CACHE PRIMEIRO
      const cachedPosts = appCache.get(cacheKey);
      if (cachedPosts) {
        console.log('📦 Usando posts do cache');
        setPosts(cachedPosts);
        setLoading(false);
        return;
      }

      console.log('🔄 Buscando posts do servidor');
      let query = supabase
        .from('posts')
        .select(`*, profiles (*)`)
        .order('created_at', { ascending: false });

      if (feedType === 'following' && user) {
        // Buscar IDs de quem o utilizador segue
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        
        const followingIds = follows?.map(f => f.following_id) || [];
        if (followingIds.length > 0) {
          query = query.in('user_id', followingIds);
        } else {
          // Se não segue ninguém, retorna vazio ou sugere algo
          setPosts([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      
      let rawPosts = data || [];

      // Lógica para ordenar por "Mais Dublados"
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

      // Se houver um ID inicial vindo da Pesquisa/Explorar, coloca-o no topo
      if (initialPostId) {
        const targetPost = sortedPosts.find(p => p.id === initialPostId);
        if (targetPost) {
          sortedPosts = [targetPost, ...sortedPosts.filter(p => p.id !== initialPostId)];
        }
      }

      // Lógica de Aleatoriedade: Manter os primeiros 5 (ou o inicial) e baralhar o resto
      const firstFive = sortedPosts.slice(0, 5);
      const remaining = sortedPosts.slice(5);
      
      // Fisher-Yates shuffle para o resto
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }

      setPosts([...firstFive, ...remaining]);
      
      // SALVAR NO CACHE
      appCache.set(cacheKey, [...firstFive, ...remaining]);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  }, [feedType, user, initialPostId]);

  useEffect(() => {
    fetchPosts();
    setDisplayLimit(5); // Reset limit when feed type or initial post changes
  }, [initialPostId, feedType, user, fetchPosts]);

  // Intersection Observer for Infinite Scroll
  useEffect(() => {
    if (loading || displayLimit >= posts.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Carregar mais cedo para evitar o "atraso" percebido
          setDisplayLimit(prev => Math.min(prev + 5, posts.length));
        }
      },
      { 
        threshold: 0,
        rootMargin: '100% 0px' // Gatilha quando o sentinel estiver a 1 tela de distância
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
