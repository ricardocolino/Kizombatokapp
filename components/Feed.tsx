
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { ChevronLeft, ChevronDown, ChevronUp, Gamepad2, Loader2, X } from 'lucide-react';
import { Post, FeedFilter } from '../types';
import PostCard from './PostCard';
import { appCache } from '../services/cache';

interface FeedProps {
  onNavigateToProfile: (userId: string, action?: string) => void;
  onRequireAuth?: () => void;
  onViewStories?: (userId: string, allUserIds?: string[]) => void;
  onJoinLive?: (liveId: string) => void;
  initialPostId?: string | null;
  isPaused?: boolean;
  feedFilter?: FeedFilter | null;
  onClearFilter?: () => void;
  refreshTrigger?: number;
  onDub?: (mp3Url: string, originalPostId: string) => void;
  onViewAudio?: (audioPostId: string) => void;
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

const Feed: React.FC<FeedProps> = ({ onNavigateToProfile, onRequireAuth, onViewStories, onJoinLive, initialPostId, isPaused, feedFilter, onClearFilter, refreshTrigger, onDub, onViewAudio }) => {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [feedType, setFeedType] = useState<'for_you' | 'following'>('for_you');
  const [user, setUser] = useState<User | null>(null);
  const [displayLimit, setDisplayLimit] = useState(70);
  const pageRef = React.useRef(0);
  const [metadataMap, setMetadataMap] = useState<Record<string, PostMetadata>>({});
  const allPostsPoolRef = React.useRef<Post[]>([]);
  const seenPostIdsRef = React.useRef<Set<string>>(new Set());
  const loadMoreSentinelRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const viewedIndices = React.useRef<Set<number>>(new Set());

  const [showExternalUrl, setShowExternalUrl] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [showGameIntro, setShowGameIntro] = useState(false);

  const videoScrollCountRef = React.useRef<number>(0);
  const lastViewedIndexRef = React.useRef<number | null>(null);
  const isAdActiveRef = React.useRef<boolean>(false);

  const fallbackInAppBrowser = (url: string) => {
    try {
      const gWindow = window as unknown as {
        cordova?: {
          InAppBrowser?: {
            open: (url: string, target: string, options: string) => { close: () => void } | null;
          };
        };
        open?: (url: string, target: string, options: string) => { close: () => void } | Window | null;
      };

      let browserRef: { close: () => void } | Window | null = null;

      if (gWindow.cordova?.InAppBrowser?.open) {
        browserRef = gWindow.cordova.InAppBrowser.open(url, '_blank', 'hidden=yes,location=no,clearcache=yes,clearsessioncache=yes');
        console.log(">>> [InAppBrowser] Fallback usado com sucesso (cordova.InAppBrowser) em background!");
      } else if (gWindow.open) {
        browserRef = gWindow.open(url, '_blank', 'hidden=yes,location=no,clearcache=yes,clearsessioncache=yes');
        console.log(">>> [InAppBrowser] Fallback usado com window.open em background!");
      }

      if (browserRef) {
        setTimeout(() => {
          try {
            console.log(">>> [InAppBrowser] Fechando janela fallback após 15 segundos...");
            browserRef!.close();
          } catch (closeErr) {
            console.error(">>> [InAppBrowser] Erro ao fechar janela fallback:", closeErr);
          } finally {
            isAdActiveRef.current = false;
          }
        }, 15000);
      } else {
        isAdActiveRef.current = false;
      }
    } catch (e) {
      console.error(">>> [InAppBrowser] Erro em todas as tentativas de fallback:", e);
      isAdActiveRef.current = false;
    }
  };

  const triggerAdvertisement = React.useCallback(() => {
    if (isAdActiveRef.current) {
      console.log(">>> [InAppBrowser] Chamada de publicidade bloqueada (já existe uma publicidade ativa ou em contagem).");
      return;
    }

    if (Capacitor.isNativePlatform()) {
      isAdActiveRef.current = true;
      try {
        const adUrl = 'https://www.effectivecpmnetwork.com/cr9zx6yb?key=403ac45601fac5c99cc670a4ef08aaf1';
        console.log(">>> [InAppBrowser] A inicializar janela em segundo plano (background) com o link de publicidade:", adUrl);
        
        // Tentativa de usar @awesome-cordova-plugins/in-app-browser
        import('@awesome-cordova-plugins/in-app-browser').then(({ InAppBrowser }) => {
          try {
            const browser = InAppBrowser.create(adUrl, '_blank', {
              hidden: 'yes',
              location: 'no',
              clearcache: 'yes',
              clearsessioncache: 'yes'
            });
            console.log(">>> [InAppBrowser] Janela em segundo plano (background) criada com sucesso!");
            
            // Fecha o anúncio automaticamente após 15 segundos
            setTimeout(() => {
              try {
                console.log(">>> [InAppBrowser] Fechando janela após 15 segundos...");
                browser.close();
              } catch (closeErr) {
                console.error(">>> [InAppBrowser] Erro ao fechar janela:", closeErr);
              } finally {
                isAdActiveRef.current = false;
              }
            }, 15000);
          } catch (innerError) {
            console.error(">>> [InAppBrowser] Erro ao instanciar via Awesome Cordova Plugins:", innerError);
            fallbackInAppBrowser(adUrl);
          }
        }).catch((err) => {
          console.error(">>> [InAppBrowser] Erro ao carregar o módulo InAppBrowser:", err);
          fallbackInAppBrowser(adUrl);
        });
      } catch (error) {
        console.error(">>> [InAppBrowser] Erro geral ao inicializar:", error);
        isAdActiveRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    triggerAdvertisement();
  }, [triggerAdvertisement]);

  const handleOpenGame = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let finalUrl = 'https://minimax-six.vercel.app';
      
      if (session) {
        const authParams = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=${session.expires_in}&token_type=bearer&type=recovery`;
        finalUrl = `${finalUrl}/#${authParams}`;
      }
      
      setIframeLoading(true);
      setIframeUrl(finalUrl);
      setShowExternalUrl(true);
    } catch (err) {
      console.error("Erro ao obter sessão para o navegador interno:", err);
      setIframeLoading(true);
      setIframeUrl('https://minimax-six.vercel.app');
      setShowExternalUrl(true);
    }
  };

  const handleNextPost = React.useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ top: scrollContainerRef.current.clientHeight, behavior: 'smooth' });
    }
  }, []);

  const handlePrevPost = React.useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ top: -scrollContainerRef.current.clientHeight, behavior: 'smooth' });
    }
  }, []);

  // Intersection Observer to track active post index
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = Number(entry.target.getAttribute('data-index'));
            if (!isNaN(index)) {
              // A cada 10 vídeos, apresentar a publicidade
              if (lastViewedIndexRef.current !== index) {
                lastViewedIndexRef.current = index;
                videoScrollCountRef.current += 1;
                console.log(`>>> [InAppBrowser] Vídeo visto: ${videoScrollCountRef.current}/10`);
                if (videoScrollCountRef.current >= 10) {
                  videoScrollCountRef.current = 0;
                  console.log(">>> [InAppBrowser] Atingiu 10 vídeos! Disparando publicidade...");
                  triggerAdvertisement();
                }
              }

              // Se o usuário não tiver logado depois de 3 vídeos ir a página de login automaticamente
              if (sessionLoaded && !user) {
                viewedIndices.current.add(index);
                if (viewedIndices.current.size > 3) {
                  if (onRequireAuth) {
                    onRequireAuth();
                    return;
                  }
                }
              }
            }
          }
        });
      },
      { 
        threshold: 0.6 
      }
    );

    // Observe all post items - using a short delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const items = document.querySelectorAll('.feed-item[data-index]');
      items.forEach(item => observer.observe(item));
    }, 1000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [posts, sessionLoaded, user, onRequireAuth, triggerAdvertisement]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSessionLoaded(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setSessionLoaded(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (showExternalUrl) {
      document.body.classList.add('game-open');
    } else {
      document.body.classList.remove('game-open');
    }
    return () => {
      document.body.classList.remove('game-open');
    };
  }, [showExternalUrl]);

  const fetchBatchMetadata = React.useCallback(async (postsToFetch: Post[]) => {
    if (postsToFetch.length === 0) return;
    
    const postIds = postsToFetch.map(p => p.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user.id;

      // Chama a função RPC otimizada get_posts_metadata no Supabase para agregar 8 consultas numa chamada única
      const { data, error } = await supabase.rpc('get_posts_metadata', {
        p_post_ids: postIds,
        p_current_user_id: currentUserId || null
      });

      if (error) {
        console.error("Erro ao chamar RPC get_posts_metadata, utilizando fallback local:", error);
        // Fallback se a RPC falhar por qualquer razão (garante resiliência)
        const authorIds = [...new Set(postsToFetch.map(p => p.user_id))];
        const [reactionsRes, repostsRes, storiesRes, livesRes, commentsRes] = await Promise.all([
          supabase.from('reactions').select('post_id').in('post_id', postIds),
          supabase.from('reposts').select('post_id').in('post_id', postIds),
          supabase.from('stories').select('user_id').in('user_id', authorIds).gt('expires_at', new Date().toISOString()),
          supabase.from('lives').select('id, host_id').in('host_id', authorIds).eq('status', 'active'),
          supabase.from('comments').select('post_id').in('post_id', postIds)
        ]);

        const reactionCounts: Record<string, number> = {};
        reactionsRes.data?.forEach(r => reactionCounts[r.post_id] = (reactionCounts[r.post_id] || 0) + 1);

        const repostCounts: Record<string, number> = {};
        repostsRes.data?.forEach(r => repostCounts[r.post_id] = (repostCounts[r.post_id] || 0) + 1);

        const commentCounts: Record<string, number> = {};
        commentsRes.data?.forEach(c => commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1);

        const usersWithStories: Set<string> = new Set(storiesRes.data?.map(s => s.user_id));
        const usersLiveMap: Record<string, string> = {};
        livesRes.data?.forEach(l => usersLiveMap[l.host_id] = l.id);

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

        const fallbackMetadata: Record<string, PostMetadata> = {};
        postsToFetch.forEach(p => {
          fallbackMetadata[p.id] = {
            likesCount: reactionCounts[p.id] || 0,
            commentsCount: commentCounts[p.id] || 0,
            repostsCount: repostCounts[p.id] || 0,
            liked: userLikes.has(p.id),
            reposted: userReposts.has(p.id),
            hasStories: usersWithStories.has(p.user_id),
            isLive: usersLiveMap[p.user_id] || null,
            isFollowing: userFollows.has(p.user_id),
            isOwnPost: currentUserId === p.user_id
          };
        });

        setMetadataMap(prev => ({ ...prev, ...fallbackMetadata }));
        return;
      }

      if (data) {
        setMetadataMap(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.error("Erro geral no fetchBatchMetadata:", e);
    }
  }, []);

  const handleUpdateMetadata = React.useCallback((postId: string, updates: Partial<PostMetadata>) => {
    setMetadataMap(prev => ({
      ...prev,
      [postId]: { ...prev[postId], ...updates }
    }));
  }, []);

  const loadNextBatchOfVideos = React.useCallback(() => {
    if (allPostsPoolRef.current.length === 0) return;

    // Get unseen posts from the pool
    let unseenPosts = allPostsPoolRef.current.filter(p => !seenPostIdsRef.current.has(p.id));

    let selected: Post[] = [];

    if (unseenPosts.length >= 70) {
      // Pick a random post to be first
      const randomIndex = Math.floor(Math.random() * unseenPosts.length);
      const firstPost = unseenPosts[randomIndex];
      selected.push(firstPost);
      seenPostIdsRef.current.add(firstPost.id);

      // Remaining are sorted by created_at desc (newest first)
      const otherPosts = unseenPosts.filter(p => p.id !== firstPost.id);
      otherPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const fillPosts = otherPosts.slice(0, 69);
      fillPosts.forEach(p => seenPostIdsRef.current.add(p.id));
      selected = [...selected, ...fillPosts];
    } else {
      // We don't have enough unseen posts! That means we have exhausted the pool.
      // So we take all remaining unseen posts first
      let candidates = [...unseenPosts];
      
      // Reset seen list to allow repetition
      seenPostIdsRef.current.clear();
      
      // Fill the remaining slots from the full pool
      const remainingSlots = 70 - candidates.length;
      if (remainingSlots > 0 && allPostsPoolRef.current.length > 0) {
        const poolExcludingCandidates = allPostsPoolRef.current.filter(p => !candidates.some(c => c.id === p.id));
        const poolToPickFrom = poolExcludingCandidates.length > 0 ? poolExcludingCandidates : allPostsPoolRef.current;
        
        const sortedPool = [...poolToPickFrom];
        sortedPool.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        const fillPosts = sortedPool.slice(0, remainingSlots);
        candidates = [...candidates, ...fillPosts];
      }

      // Now we have candidates. Let's make the first random and the rest sorted newest to oldest.
      if (candidates.length > 0) {
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const firstPost = candidates[randomIndex];
        selected.push(firstPost);
        seenPostIdsRef.current.add(firstPost.id);

        const otherPosts = candidates.filter(p => p.id !== firstPost.id);
        otherPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        otherPosts.forEach(p => seenPostIdsRef.current.add(p.id));
        selected = [...selected, ...otherPosts];
      }
    }

    // Update posts and metadata
    setPosts(selected);
    fetchBatchMetadata(selected);
    setDisplayLimit(70);

    // Reset scroll to top
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [fetchBatchMetadata]);

  const fetchPosts = React.useCallback(async (isNextPage = false) => {
    try {
      if (!isNextPage) {
        setLoading(true);
        setError(null);
      }
      
      const currentPage = isNextPage ? pageRef.current + 1 : 0;
      pageRef.current = currentPage;
      
      // GERAR CHAVE ÚNICA PARA ESTE FEED (Apenas para a primeira página)
      const filterKey = feedFilter ? `${feedFilter.type}_${feedFilter.userId || feedFilter.dubbedFromId || 'none'}` : 'none';
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

      console.log(`🔄 Buscando posts do servidor`);
      
      let query = supabase
        .from('posts')
        .select(`*, profiles!user_id (*)`)
        .order('is_ready', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000);

      if (feedFilter) {
        if (feedFilter.type === 'user' || feedFilter.type === 'private') {
          query = query.eq('user_id', feedFilter.userId);
        } else if (feedFilter.type === 'audio') {
          query = query.or(`id.eq.${feedFilter.dubbedFromId},dubbed_from_id.eq.${feedFilter.dubbedFromId}`);
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
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let rawPosts = data || [];
      
      // Se tivermos um initialPostId e for a primeira página, garantir que ele está nos posts
      if (initialPostId) {
        const hasTarget = rawPosts.some(p => p.id === initialPostId);
        if (!hasTarget) {
          try {
            const { data: targetData } = await supabase
              .from('posts')
              .select(`*, profiles!user_id (*)`)
              .eq('id', initialPostId)
              .maybeSingle(); // Usar maybeSingle para não disparar erro se não encontrar
            
            if (targetData) {
              rawPosts = [targetData, ...rawPosts];
            }
          } catch (err) {
            console.error("Erro ao buscar post alvo:", err);
          }
        }
      }

      let sortedPosts = [...rawPosts];
      
      // Filter out posts that are private (unless we are the author)
      let localPrivatePosts: string[] = [];
      try {
        localPrivatePosts = JSON.parse(localStorage.getItem('private_posts') || '[]');
      } catch { /* ignore */ }

      sortedPosts = sortedPosts.filter(p => {
        const isAuthor = user && p.user_id === user.id;
        const isPrivate = p.is_private === true || localPrivatePosts.includes(p.id);
        if (isPrivate && !isAuthor) {
          return false;
        }
        if (feedFilter) {
          if (feedFilter.type === 'private') {
            return isPrivate;
          } else if (feedFilter.type === 'user') {
            return !isPrivate;
          }
        }
        return true;
      });

      // Save to pool and clear seen list
      allPostsPoolRef.current = sortedPosts;
      seenPostIdsRef.current.clear();

      let selected: Post[] = [];

      if (initialPostId) {
        const targetPost = sortedPosts.find(p => p.id === initialPostId);
        if (targetPost) {
          selected.push(targetPost);
          seenPostIdsRef.current.add(targetPost.id);
        }
        
        const otherPosts = sortedPosts.filter(p => p.id !== initialPostId);
        otherPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        const fillCount = Math.min(69, otherPosts.length);
        const fillPosts = otherPosts.slice(0, fillCount);
        fillPosts.forEach(p => seenPostIdsRef.current.add(p.id));
        selected = [...selected, ...fillPosts];
      } else {
        if (sortedPosts.length > 0) {
          const randomIndex = Math.floor(Math.random() * sortedPosts.length);
          const firstPost = sortedPosts[randomIndex];
          selected.push(firstPost);
          seenPostIdsRef.current.add(firstPost.id);
          
          const otherPosts = sortedPosts.filter(p => p.id !== firstPost.id);
          otherPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          
          const fillCount = Math.min(69, otherPosts.length);
          const fillPosts = otherPosts.slice(0, fillCount);
          fillPosts.forEach(p => seenPostIdsRef.current.add(p.id));
          selected = [...selected, ...fillPosts];
        }
      }

      // BUSCAR METADADOS EM LOTE (Apenas para os novos posts)
      fetchBatchMetadata(selected);

      setPosts(selected);
      appCache.set(cacheKey, selected);
    } catch (error: unknown) {
      console.error('Error fetching posts:', error);
      const message = error instanceof Error ? error.message : t('Error loading video connection');
      setError(message);
    } finally {
      if (!isNextPage) {
        setTimeout(() => setLoading(false), 800);
      }
    }
  }, [feedType, user, initialPostId, fetchBatchMetadata, feedFilter, t]);

  useEffect(() => {
    // Se o refreshTrigger mudar, limpamos o cache para este feed específico para garantir novo random
    if (refreshTrigger) {
      appCache.clear(); // Limpa tudo para garantir fresh start
    }
    fetchPosts();
    setDisplayLimit(70); 

    // Ao sair da página de reels (componente Feed desmonta), limpamos o cache dos feeds
    // para que a próxima entrada carregue do zero com nova randomização (como se estivesse abrindo o APP agora)
    return () => {
      console.log(">>> [Feed.tsx] Unmounting Feed: invalidating feed caches for a fresh start next time");
      appCache.clearFeedCache();
    };
  }, [initialPostId, feedType, user, fetchPosts, feedFilter, refreshTrigger]);

  // Reset scroll container to top when posts change to ensure the first video starts playing immediately
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [posts]);

  // Intersection Observer for Automatic Endless Reels Loading
  useEffect(() => {
    if (loading || posts.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          console.log("Sentinel intersected! Loading next batch...");
          loadNextBatchOfVideos();
        }
      },
      { 
        threshold: 0.1,
        root: scrollContainerRef.current
      }
    );

    const currentSentinel = loadMoreSentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
      observer.disconnect();
    };
  }, [loading, posts, loadNextBatchOfVideos]);

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
                <div key={j} className="w-12 h-12 bg-zinc-800 rounded-xl"></div>
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
        <div className="w-16 h-16 bg-purple-600/10 rounded-full flex items-center justify-center text-purple-600 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <p className="font-bold text-white text-lg mb-2">{t('Oops, something went wrong')}</p>
        <p className="text-sm mb-8 max-w-xs">{error}</p>
        <button 
          onClick={() => fetchPosts()}
          className="bg-white text-black px-8 py-3 rounded-full font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all"
        >
          {t('Reply')}
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-zinc-500 p-10 text-center">
        <p className="font-bold text-lg mb-2 text-white">{t('No videos here yet')}</p>
        <p className="text-sm">{t('Be the first to shine')}</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black relative overflow-hidden flex flex-col">
      <style>{`
        body.comments-open .feed-navigation-tabs,
        body.gifts-open .feed-navigation-tabs,
        body.recharge-open .feed-navigation-tabs,
        body.game-open .feed-navigation-tabs {
          display: none !important;
        }
        body.gifts-open nav,
        body.recharge-open nav,
        body.game-open nav {
          display: none !important;
        }
        body.comments-open .feed-item:not(:has(.comments-active-postcard)),
        body.gifts-open .feed-item:not(:has(.gifts-active-postcard)),
        body.recharge-open .feed-item:not(:has(.recharge-active-postcard)) {
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}</style>
      {/* Feed Tabs or Filter Header */}
      {!feedFilter ? (
        <div className="feed-navigation-tabs h-11 sm:h-14 w-full bg-black flex items-center justify-between z-50 shrink-0 select-none px-4 sm:px-6">
          {/* Left: Balanced spacing spacer */}
          <div className="min-w-[75px]" />

          {/* Center: Tabs */}
          <div className="flex items-center gap-4 sm:gap-6">
            <button 
              onClick={() => setFeedType('following')}
              className={`text-xs sm:text-xs font-black uppercase tracking-widest transition-all ${feedType === 'following' ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
            >
              {t('Following')}
              {feedType === 'following' && <div className="h-0.5 w-4 bg-white mx-auto mt-1 rounded-full" />}
            </button>
            <button 
              onClick={() => setFeedType('for_you')}
              className={`text-xs sm:text-xs font-black uppercase tracking-widest transition-all ${feedType === 'for_you' ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
            >
              {t('For You')}
              {feedType === 'for_you' && <div className="h-0.5 w-4 bg-white mx-auto mt-1 rounded-full" />}
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center justify-end min-w-[75px]">
          </div>
        </div>
      ) : (
        <div className="feed-navigation-tabs h-11 sm:h-14 w-full bg-black flex items-center px-4 z-50 shrink-0 select-none">
          <button 
            onClick={onClearFilter}
            className="p-1.5 bg-white/10 rounded-full text-white active:scale-90 transition-transform"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 flex justify-center pr-8">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-white text-center px-4">
              {feedFilter.type === 'user' && `${t('Videos from')} ${feedFilter.userName}`}
              {feedFilter.type === 'private' && `${t('Private Videos of', 'Vídeos privados de')} ${feedFilter.userName}`}
              {feedFilter.type === 'reposted' && `${t('Videos reposted by')} ${feedFilter.userName}`}
              {feedFilter.type === 'audio' && `${t('Dubs of', 'Dublagens de')} ${feedFilter.audioName}`}
            </span>
          </div>
        </div>
      )}

      {/* Desktop Navigation Controls - Only on Laptop/TV */}
      <div className="hidden lg:flex fixed right-32 top-1/2 -translate-y-1/2 flex-col gap-6 z-[60]">
        <button 
          onClick={handlePrevPost}
          className="p-4 bg-white/10 backdrop-blur-xl rounded-full text-white hover:bg-purple-600 hover:scale-110 active:scale-90 transition-all border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] group"
          title={t('Up')}
        >
          <ChevronUp size={32} className="group-hover:-translate-y-1 transition-transform" />
        </button>
        <button 
          onClick={handleNextPost}
          className="p-4 bg-white/10 backdrop-blur-xl rounded-full text-white hover:bg-purple-600 hover:scale-110 active:scale-90 transition-all border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] group"
          title={t('Down')}
        >
          <ChevronDown size={32} className="group-hover:translate-y-1 transition-transform" />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <div ref={scrollContainerRef} className="feed-container h-full w-full no-scrollbar">
        {posts.slice(0, displayLimit).map((post, index) => (
          <div key={post.id} className="feed-item relative h-full w-full" data-index={index}>
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
              isPaused={isPaused || showExternalUrl || showGameIntro}
              onDub={onDub}
              onViewAudio={onViewAudio}
            />
          </div>
        ))}
        
        {/* Auto-load Sentinel */}
        {!loading && posts.length > 0 && (
          <div ref={loadMoreSentinelRef} className="h-1 w-full bg-transparent snap-start" />
        )}
      </div>
    </div>

      {showGameIntro && (
        <div className="fixed inset-0 z-[190] bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0">
          {/* Backdrop Click to Close */}
          <div className="absolute inset-0" onClick={() => setShowGameIntro(false)} />
          
          {/* Mobile Shell Card */}
          <div className="relative bg-white w-full h-[85vh] sm:h-[680px] sm:max-w-md sm:rounded-[32px] rounded-t-[32px] flex flex-col shadow-2xl animate-in slide-in-from-bottom-10 duration-300 text-black overflow-hidden z-10">
            {/* Header */}
            <header className="h-14 bg-white border-b border-zinc-100 flex items-center px-4 shrink-0 justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowGameIntro(false)}
                  className="w-10 h-10 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-800 active:scale-95 transition-all border border-zinc-100/60"
                >
                  <ChevronLeft size={22} strokeWidth={2.5} />
                </button>
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-950">{t('Games', 'Jogos')}</h2>
              </div>
              <button 
                onClick={() => setShowGameIntro(false)}
                className="w-10 h-10 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </header>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col justify-between no-scrollbar">
              <div>
                {/* Promo Info */}
                <div className="text-center mb-6 mt-2">
                  <div className="w-14 h-14 bg-amber-100/80 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm animate-pulse-slow">
                    <Gamepad2 size={32} className="text-amber-500 animate-[bounce_2s_infinite]" />
                  </div>
                  <h1 className="text-xl font-black text-zinc-950 uppercase tracking-tight mb-2">
                    Ganhe Moedas a Jogar! 🪙
                  </h1>
                  <p className="text-xs font-semibold text-zinc-500 leading-relaxed max-w-sm mx-auto">
                    Diverte-te com os nossos jogos favoritos e acumula <span className="font-extrabold text-amber-500 text-sm">Angochat Coins</span> reais diretamente no teu saldo de forma simples!
                  </p>
                </div>

                {/* Game Cards Section */}
                <div className="space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400 block mb-1">
                    {t('Featured Game', 'Jogo em Destaque')}
                  </span>

                  {/* Card do Jogo de Dama */}
                  <button
                    onClick={() => {
                      setShowGameIntro(false);
                      handleOpenGame();
                    }}
                    className="w-full text-left bg-gradient-to-br from-zinc-50 to-zinc-100/50 hover:from-white hover:to-white border border-zinc-200/80 hover:border-purple-500/40 rounded-3xl p-4 flex items-center justify-between gap-4 transition-all hover:shadow-lg hover:shadow-zinc-100 active:scale-98 group cursor-pointer"
                  >
                    <div className="flex-1">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-[8px] font-black uppercase text-purple-600 tracking-wider mb-2">
                        🔥 {t('Active Reward', 'Recompensa Ativa')}
                      </div>
                      <h3 className="text-base font-black text-zinc-950 uppercase tracking-tight leading-none group-hover:text-purple-600 transition-colors">
                        Dama
                      </h3>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        Jogo de Tabuleiro
                      </p>
                      <p className="text-xs font-medium text-zinc-500 leading-relaxed line-clamp-2">
                        Desafia o teu raciocínio no clássico tabuleiro e converte as tuas pontuações em moedas reais!
                      </p>
                    </div>

                    {/* Icon/Mini-board Draw for Checkers/Dama */}
                    <div className="shrink-0 relative">
                      <div className="w-16 h-16 grid grid-cols-4 grid-rows-4 border border-zinc-300 rounded-xl overflow-hidden shadow-sm">
                        {Array.from({ length: 16 }).map((_, i) => {
                          const row = Math.floor(i / 4);
                          const col = i % 4;
                          const isDark = (row + col) % 2 === 1;
                          return (
                            <div
                              key={i}
                              className={`relative flex items-center justify-center ${isDark ? 'bg-zinc-800' : 'bg-zinc-200'}`}
                            >
                              {isDark && (i === 1 || i === 7) && (
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-700 shadow-sm" />
                              )}
                              {isDark && (i === 8 || i === 14) && (
                                <div className="w-2.5 h-2.5 rounded-full bg-zinc-100 border border-zinc-400 shadow-sm" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-purple-600 text-white rounded-full flex items-center justify-center font-black text-[10px] border border-white shadow-md">
                        →
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Footer Notice */}
              <div className="text-center mt-8 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                ⚡ Angochat Play • {t('Earn by Playing', 'Joga e Ganha')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navegador Interno Personalizado para Jogos (Minimax) */}
      {showExternalUrl && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-500 text-black">
          <header className="h-14 bg-white border-b border-zinc-100 flex items-center px-4 shrink-0 gap-3">
            <button 
              onClick={() => setShowExternalUrl(false)}
              className="w-9 h-9 rounded-lg bg-zinc-50 flex items-center justify-center text-black active:scale-90 transition-all border border-zinc-100"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-950">{t('Games', 'Jogos')}</span>
          </header>
          
          <div className="flex-1 relative bg-white">
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <Loader2 className="text-zinc-900 animate-spin mb-4" size={32} />
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest animate-pulse">{t('Loading')}...</span>
              </div>
            )}
            <iframe 
              src={iframeUrl} 
              onLoad={() => setIframeLoading(false)}
              className="w-full h-full border-none"
              title={t('Games', 'Jogos')}
              allow="payment; camera; microphone; geolocation; clipboard-read; clipboard-write"
              sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin allow-top-navigation allow-top-navigation-by-user-activation"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Feed;
