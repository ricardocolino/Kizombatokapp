
/* eslint-disable react/prop-types */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Hls from 'hls.js';
import { Post, Comment, Profile } from '../types';
import { ThumbsUp, MessageCircle, Share2, Repeat, Play, VolumeX, Send, X, CornerDownRight, ChevronDown, ChevronUp, CheckCircle2, Flag, Download, Link, Facebook, Twitter, MessageSquare, Gift, Loader2, AlertCircle, Heart, Music, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { appCache } from '../services/cache';
import AngoCoinIcon from './AngoCoinIcon';
import RechargeModal from './RechargeModal';
import { PostMetadata } from './Feed';
import { parseMediaUrl } from '../services/mediaUtils';

interface PostCardProps {
  post: Post;
  metadata: PostMetadata;
  onUpdateMetadata: (postId: string, updates: Partial<PostMetadata>) => void;
  onNavigateToProfile: (userId: string, action?: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onRequireAuth?: () => void;
  onViewStories?: (userId: string, allUserIds?: string[]) => void;
  onJoinLive?: (liveId: string) => void;
  isPaused?: boolean;
  onDub?: (mp3Url: string, originalPostId: string) => void;
  onViewAudio?: (audioPostId: string) => void;
}

type EnhancedComment = Comment & { 
  likes_count: number; 
  liked_by_me: boolean;
  liked_by_author: boolean;
  profiles?: Profile;
};

const PostCard: React.FC<PostCardProps> = React.memo(function PostCard({ 
  post, 
  metadata, 
  onUpdateMetadata,
  onNavigateToProfile, 
  isMuted, 
  onToggleMute, 
  onRequireAuth,
  onViewStories,
  onJoinLive,
  isPaused,
  onDub,
  onViewAudio
}) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [uiVisible, setUiVisible] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - touchEndX.current;
    const minDistance = 40; // threshold for a swipe
    if (Math.abs(diff) > minDistance) {
      e.stopPropagation();
      if (diff > 0) {
        // Swipe left -> next image
        if (currentImageIndex < allMediaUrls.length - 1) {
          setCurrentImageIndex(prev => prev + 1);
        }
      } else {
        // Swipe right -> previous image
        if (currentImageIndex > 0) {
          setCurrentImageIndex(prev => prev - 1);
        }
      }
    }
  };

  const [isNearScreen, setIsNearScreen] = useState(false);
  const [isFullyVisible, setIsFullyVisible] = useState(false);

  const formatPublishedTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 0) return 'há poucos segundos atrás';

    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (secs < 60) {
      return 'há poucos segundos atrás';
    } else if (mins < 60) {
      return `há ${mins} ${mins === 1 ? 'minuto' : 'minutos'} atrás`;
    } else if (hours < 24) {
      return `há ${hours} ${hours === 1 ? 'hora' : 'horas'} atrás`;
    } else if (days < 7) {
      return `há ${days} ${days === 1 ? 'dia' : 'dias'} atrás`;
    } else if (days < 30) {
      return `há ${weeks} ${weeks === 1 ? 'semana' : 'semanas'} atrás`;
    } else if (days < 365) {
      return `há ${months} ${months === 1 ? 'mês' : 'meses'} atrás`;
    } else {
      return `há ${years} ${years === 1 ? 'ano' : 'anos'} atrás`;
    }
  };

  const [originalPost, setOriginalPost] = useState<Post | null>(null);
  const [showAudioDetails, setShowAudioDetails] = useState(false);
  const [audioDubs, setAudioDubs] = useState<Post[]>([]);
  const [loadingDubs, setLoadingDubs] = useState(false);

  // Handle media_url that might be a JSON array string
  const mediaUrl = useMemo(() => parseMediaUrl(post.media_url), [post.media_url]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loadedIndices, setLoadedIndices] = useState<number[]>([0]);

  useEffect(() => {
    setLoadedIndices([0]);
    setCurrentImageIndex(0);
  }, [post.id]);

  useEffect(() => {
    setLoadedIndices(prev => {
      if (!prev.includes(currentImageIndex)) {
        return [...prev, currentImageIndex];
      }
      return prev;
    });
  }, [currentImageIndex]);

  const allMediaUrls = useMemo(() => {
    const urls: string[] = [];
    const workerUrl = import.meta.env.VITE_R2_WORKER_URL;

    const processUrl = (urlStr: string | null | undefined): string | null => {
      if (!urlStr) return null;
      const parsed = parseMediaUrl(urlStr);
      if (!parsed) return null;
      if (workerUrl && parsed.includes('r2.dev')) {
        try {
          const u = new URL(parsed);
          if (u.hostname.includes('r2.dev')) {
            return `${workerUrl.replace(/\/$/, '')}${u.pathname}${u.search}`;
          }
        } catch {
          // Ignore
        }
      }
      return parsed;
    };

    // If it's a JSON array string, parse it first (legacy support)
    if (post.media_url && post.media_url.trim().startsWith('[') && post.media_url.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(post.media_url);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((item: string) => {
            const processed = processUrl(item);
            if (processed) urls.push(processed);
          });
          if (urls.length > 0) {
            return urls;
          }
        }
      } catch {
        // Fallback
      }
    }

    // Otherwise, collect from individual columns
    const urlMain = processUrl(post.media_url);
    if (urlMain) urls.push(urlMain);

    const url1 = processUrl(post.media_url1);
    if (url1) urls.push(url1);

    const url2 = processUrl(post.media_url2);
    if (url2) urls.push(url2);

    return urls;
  }, [post.media_url, post.media_url1, post.media_url2]);

  const mediaType = useMemo(() => post.media_type || 'video', [post.media_type]);

  const optimizedUrl = useMemo(() => {
    if (mediaType !== 'video') {
      // Se o post for uma foto, áudio ou texto dublado (ou com áudio), o tocador em background usará automaticamente o áudio contido nas colunas mp3_r2_url (do R2) nunca usar o mp3_url (do Supabase), tanto do post atual quanto do post original (se for dublado a partir de outra música/som).
      return post.mp3_r2_url || originalPost?.mp3_r2_url || '';
    }
    if (allMediaUrls.length > 1) {
      return allMediaUrls[currentImageIndex] || '';
    }
    return mediaUrl || '';
  }, [mediaUrl, mediaType, post.mp3_r2_url, originalPost?.mp3_r2_url, allMediaUrls, currentImageIndex]);

  useEffect(() => {
    if (mediaType !== 'video' && !optimizedUrl) {
      setIsLoading(false);
    }
  }, [mediaType, optimizedUrl]);

  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [sendingGift, setSendingGift] = useState(false);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);

  const [showErrorExplanation, setShowErrorExplanation] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isNearScreen && isLoading && mediaType === 'video' && !videoError) {
      timer = setTimeout(() => {
        setShowErrorExplanation(true);
      }, 6000); // Se após 6 segundos de exibição ativa continuar carregando (tudo preto / travado)
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isNearScreen, isLoading, mediaType, videoError]);

  useEffect(() => {
    if (videoError) {
      setShowErrorExplanation(true);
    }
  }, [videoError]);

  useEffect(() => {
    if (post.dubbed_from_id) {
      const fetchOriginalPost = async () => {
        try {
          const { data, error } = await supabase
            .from('posts')
            .select('*, profiles!user_id(*)')
            .eq('id', post.dubbed_from_id)
            .maybeSingle();
          if (!error && data) {
            setOriginalPost(data as Post);
          }
        } catch (err) {
          console.error("Error fetching original post:", err);
        }
      };
      fetchOriginalPost();
    } else {
      setOriginalPost(null);
    }
  }, [post.dubbed_from_id]);

  const fetchAudioDubs = async (audioPostId: string) => {
    setLoadingDubs(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles!user_id(*)')
        .eq('dubbed_from_id', audioPostId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setAudioDubs(data as Post[]);
      }
    } catch (err) {
      console.error("Error fetching audio dubs:", err);
    } finally {
      setLoadingDubs(false);
    }
  };

  useEffect(() => {
    if (showAudioDetails) {
      const audioPostId = post.dubbed_from_id || post.id;
      fetchAudioDubs(audioPostId);
    }
  }, [showAudioDetails, post.dubbed_from_id, post.id]);

  useEffect(() => {
    setIsCaptionExpanded(false);
  }, [post.id]);
  const [comments, setComments] = useState<EnhancedComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<EnhancedComment | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<number, boolean>>({});
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const commentsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isAnyPopupOpen = showComments || showGifts || showShare || showRecharge || showAudioDetails;
    const feed = document.querySelector('.feed-container') as HTMLElement;
    if (!feed) return;
    
    if (isAnyPopupOpen) {
      feed.style.setProperty('overflow-y', 'hidden', 'important');
      feed.style.setProperty('touch-action', 'none', 'important');
    } else {
      feed.style.setProperty('overflow-y', 'scroll', 'important');
      feed.style.setProperty('touch-action', 'auto', 'important');
    }
    
    return () => {
      feed.style.setProperty('overflow-y', 'scroll', 'important');
      feed.style.setProperty('touch-action', 'auto', 'important');
    };
  }, [showComments, showGifts, showShare, showRecharge, showAudioDetails]);

  useEffect(() => {
    if (showGifts) {
      document.body.classList.add('gifts-open');
    } else {
      document.body.classList.remove('gifts-open');
    }
    return () => {
      document.body.classList.remove('gifts-open');
    };
  }, [showGifts]);

  useEffect(() => {
    if (showRecharge) {
      document.body.classList.add('recharge-open');
    } else {
      document.body.classList.remove('recharge-open');
    }
    return () => {
      document.body.classList.remove('recharge-open');
    };
  }, [showRecharge]);

  const handleCommentsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (loadingMoreComments || !hasMoreComments) return;
    
    const threshold = 100; // pixels from the bottom
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    
    if (isNearBottom) {
      fetchComments(false);
    }
  };

  useEffect(() => {
    let active = true;
    const checkAuthStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (active) {
          setIsLoggedIn(!!session);
        }
      } catch (err) {
        console.error('Error checking auth state in PostCard:', err);
      }
    };
    checkAuthStatus();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setIsLoggedIn(!!session);
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setVideoError(false);
    setIsLoading(true);
    setIsPlaying(false);
    
    const video = videoRef.current;
    if (!video) return;

    const previousTime = video.currentTime || 0;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (optimizedUrl && isNearScreen) {
      if (optimizedUrl.toLowerCase().includes('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            capLevelToPlayerSize: true,
            autoStartLoad: true,
          });
          hls.loadSource(optimizedUrl);
          hls.attachMedia(video);
          hlsRef.current = hls;
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setTimeout(() => {
              try {
                if (previousTime > 0 && videoRef.current) {
                  videoRef.current.currentTime = previousTime;
                }
              } catch (err) {
                console.warn("Could not restore HLS currentTime:", err);
              }
              if (isFullyVisible && !isPaused && videoRef.current) {
                videoRef.current.play().catch(() => {});
              }
            }, 50);
          });
          
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  setVideoError(true);
                  hls.destroy();
                  break;
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = optimizedUrl;
          setTimeout(() => {
            try {
              if (previousTime > 0 && videoRef.current) {
                videoRef.current.currentTime = previousTime;
              }
            } catch (err) {
              console.warn("Could not restore HLS native currentTime:", err);
            }
          }, 50);
        }
      } else {
        // Fallback to MP4
        video.src = optimizedUrl;
        
        const onMetadata = () => {
          setTimeout(() => {
            try {
              if (previousTime > 0 && videoRef.current) {
                videoRef.current.currentTime = previousTime;
              }
            } catch (err) {
              console.warn("Could not restore MP4 currentTime:", err);
            }
            if (isFullyVisible && !isPaused && videoRef.current) {
              videoRef.current.play().catch(() => {});
            }
          }, 50);
          video.removeEventListener('loadedmetadata', onMetadata);
        };
        video.addEventListener('loadedmetadata', onMetadata);
        video.load();
      }
    } else {
      video.src = "";
      video.load();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [optimizedUrl, isNearScreen, isFullyVisible, isPaused]);

  useEffect(() => {
    // Mostrar a UI com um pequeno delay para dar prioridade ao vídeo
    const timer = setTimeout(() => {
      setUiVisible(true);
    }, 300);
    return () => {
      clearTimeout(timer);
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);
  const viewCountedRef = useRef<boolean>(false);
  const viewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [doubleTapHearts, setDoubleTapHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const lastClickRef = useRef<number>(0);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showComments) return;
    
    const feedContainer = document.querySelector('.feed-container');
    const originalOverflow = feedContainer ? (feedContainer as HTMLElement).style.overflowY : '';
    
    if (feedContainer) {
      (feedContainer as HTMLElement).style.overflowY = 'hidden';
    }
    
    document.body.classList.add('comments-open');
    
    return () => {
      if (feedContainer) {
        (feedContainer as HTMLElement).style.overflowY = originalOverflow || 'scroll';
      }
      document.body.classList.remove('comments-open');
    };
  }, [showComments]);

  const handlePause = React.useCallback(() => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      // Optimization: if not near screen anymore, release resources
      if (!isNearScreen) {
        videoRef.current.src = "";
        videoRef.current.load();
      }
    }
    setIsPlaying(false);
    if (viewTimeoutRef.current) {
      clearTimeout(viewTimeoutRef.current);
      viewTimeoutRef.current = null;
    }
  }, [isNearScreen]);

  const incrementView = React.useCallback(async () => {
    if (viewCountedRef.current) return;
    viewCountedRef.current = true;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Não contar view se for o próprio autor a ver o seu post
      if (session?.user.id === post.user_id) {
        return;
      }

      // Incrementar views do post
      await supabase.rpc('increment_post_views', { target_post_id: post.id });
      
      // NOTA: O balanço agora é resgatado manualmente no Painel do Perfil
      // para evitar ganhos automáticos confusos e garantir que o utilizador
      // veja o progresso dos seus vídeos.
    } catch (e) {
      console.error("Erro ao incrementar views:", e);
      viewCountedRef.current = false;
    }
  }, [post.id, post.user_id]);

  const handlePlay = React.useCallback(() => {
    if (videoRef.current && videoRef.current.paused) {
      // Activa o som automaticamente ao dar autoplay, se estiver mutado
      if (isMuted) {
        onToggleMute();
      }

      // Se houve erro anterior, tentamos recarregar
      if (videoError) {
        setVideoError(false);
        if (videoRef.current.readyState >= 1) {
          videoRef.current.currentTime = 0;
        }
      }

      // Prioridade máxima: Tentar reproduzir imediatamente
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
          // Deferir o incremento de views para não competir com a reprodução inicial
          if (!viewCountedRef.current && !viewTimeoutRef.current) {
            viewTimeoutRef.current = setTimeout(() => {
              incrementView();
              viewTimeoutRef.current = null;
            }, 2000);
          }
        }).catch((err) => {
          // Se falhou por interrupção (ex: scroll rápido), não logamos como erro grave
          if (err.name !== 'AbortError') {
            console.error("Playback failed:", err);
            // Não marcamos videoError aqui para permitir novas tentativas ao scrollar
          }
          setIsPlaying(false);
        });
      }
    }
  }, [videoError, incrementView, isMuted, onToggleMute]);

  useEffect(() => {
    // Observer for "Near Screen" (Preloading)
    const nearObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsNearScreen(entry.isIntersecting);
        });
      },
      { rootMargin: '400px' } // Preload when 400px away
    );

    // Observer for "Visibility" (Playing)
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
          setIsFullyVisible(visible);
          
          if (visible && !isPaused) {
            // Debounce playback more aggressively during fast scrolls
            if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
            playTimeoutRef.current = setTimeout(() => {
              handlePlay();
              playTimeoutRef.current = null;
            }, 250); // 250ms delay to confirm user stopped scrolling
          } else {
            handlePause();
          }
        });
      },
      { 
        threshold: [0, 0.6, 0.7, 1.0],
        rootMargin: '0px' 
      }
    );

    if (containerRef.current) {
      nearObserver.observe(containerRef.current);
      observerRef.current.observe(containerRef.current);
    }

    return () => {
      nearObserver.disconnect();
      observerRef.current?.disconnect();
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    };
  }, [handlePlay, handlePause, isPaused]);

  useEffect(() => {
    if (isPaused) {
      handlePause();
    }
  }, [isPaused, handlePause]);

  const handleScrubStart = () => {
    setIsScrubbing(true);
  };

  const handleScrubMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isScrubbing || !videoRef.current || !duration) return;
    const rect = scrubRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setCurrentTime(progress * duration);
  };

  const handleScrubEnd = () => {
    if (videoRef.current && isScrubbing) {
      videoRef.current.currentTime = currentTime;
      setIsScrubbing(false);
      if (!isPaused) handlePlay();
    }
  };

  const scrubRef = useRef<HTMLDivElement>(null);

  const fetchComments = async (isInitial: boolean = false) => {
    if (loadingMoreComments) return;
    
    setLoadingMoreComments(true);
    
    if (isInitial) {
      setHasMoreComments(true);
    }

    const cacheKey = `post_comments_paginated_${post.id}`;
    
    // VERIFICAR CACHE (APENAS PARA O CARREGAMENTO INICIAL)
    if (isInitial) {
      const cachedComments = appCache.get(cacheKey) as EnhancedComment[] | undefined;
      if (cachedComments) {
        console.log(`📦 Comentários do post ${post.id}: usando cache`);
        setComments(cachedComments);
        const parentCachedCount = cachedComments.filter((c: EnhancedComment) => !c.parent_id).length;
        setHasMoreComments(parentCachedCount >= 15);
        onUpdateMetadata(post.id, { commentsCount: cachedComments.length });
        setLoadingMoreComments(false);
        return;
      }
    }

    console.log(`🔄 Comentários do post ${post.id}: buscando do servidor (isInitial: ${isInitial})`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Determine range
      const currentParentsCount = isInitial ? 0 : comments.filter(c => !c.parent_id).length;
      const startRange = currentParentsCount;
      const endRange = startRange + 14; // 15 items: e.g. 0 to 14

      // Query parent comments with range and order
      const { data: parentData, error: parentError } = await supabase
        .from('comments')
        .select('*, profiles!user_id(*)')
        .eq('post_id', post.id)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .range(startRange, endRange);

      if (parentError) throw parentError;

      if (parentData) {
        const hasMore = parentData.length === 15;
        setHasMoreComments(hasMore);

        let allFetchedComments: Array<Comment & { profiles?: Profile }> = [...(parentData as Array<Comment & { profiles?: Profile }>)];

        if (parentData.length > 0) {
          const parentIds = parentData.map(c => c.id);
          
          // Get replies for these parent comments
          const { data: repliesData } = await supabase
            .from('comments')
            .select('*, profiles!user_id(*)')
            .in('parent_id', parentIds)
            .order('created_at', { ascending: false });

          if (repliesData) {
            allFetchedComments = [...allFetchedComments, ...(repliesData as Array<Comment & { profiles?: Profile }>)];
          }
        }

        const commentsWithMetadata = await Promise.all(allFetchedComments.map(async (c) => {
          const { count } = await supabase.from('comment_reactions').select('*', { count: 'exact', head: true }).eq('comment_id', c.id);
          let likedByMe = false;
          let likedByAuthor = false;
          
          if (session) {
            const { data: userLike } = await supabase.from('comment_reactions').select('*').eq('comment_id', c.id).eq('user_id', session.user.id).maybeSingle();
            likedByMe = !!userLike;
          }
          
          if (session && session.user.id === post.user_id) {
            likedByAuthor = likedByMe;
          } else {
            const { data: authorLike } = await supabase.from('comment_reactions').select('*').eq('comment_id', c.id).eq('user_id', post.user_id).maybeSingle();
            likedByAuthor = !!authorLike;
          }

          return { 
            ...c, 
            likes_count: count || 0, 
            liked_by_me: likedByMe, 
            liked_by_author: likedByAuthor 
          };
        }));

        let newCommentsList: EnhancedComment[] = [];
        if (isInitial) {
          newCommentsList = commentsWithMetadata as EnhancedComment[];
        } else {
          // Merge avoiding duplicates
          const existingIds = new Set(comments.map(c => c.id));
          const uniqueNew = commentsWithMetadata.filter(c => !existingIds.has(c.id));
          newCommentsList = [...comments, ...uniqueNew] as EnhancedComment[];
        }

        setComments(newCommentsList);

        // Get total count of comments for the metadata count
        const { count: totalCommentsCount } = await supabase
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', post.id);

        onUpdateMetadata(post.id, { commentsCount: totalCommentsCount || newCommentsList.length });
        
        // SALVAR NO CACHE
        appCache.set(cacheKey, newCommentsList);
      }
    } catch (err) {
      console.error('Erro ao buscar comentários paginados:', err);
    } finally {
      setLoadingMoreComments(false);
    }
  };

  const toggleCommentLike = async (commentId: number, currentlyLiked: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }

    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        const isAuthorMe = session.user.id === post.user_id;
        return {
          ...c,
          liked_by_me: !currentlyLiked,
          liked_by_author: isAuthorMe ? !currentlyLiked : (c.liked_by_author || false),
          likes_count: (c.likes_count || 0) + (currentlyLiked ? -1 : 1)
        };
      }
      return c;
    }));

    if (currentlyLiked) {
      await supabase.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', session.user.id);
    } else {
      await supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: session.user.id });
    }
  };

  const toggleThread = (parentId: number) => {
    setExpandedThreads(prev => ({
      ...prev,
      [parentId]: !prev[parentId]
    }));
  };

  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }

    // Optimistic Update
    const newLiked = !metadata.liked;
    const newLikesCount = metadata.likesCount + (newLiked ? 1 : -1);
    
    onUpdateMetadata(post.id, { 
      liked: newLiked, 
      likesCount: newLikesCount 
    });

    if (metadata.liked) {
      await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('reactions').insert({ post_id: post.id, user_id: session.user.id, type: 'like' });
    }
  };

  const forceLike = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }

    if (!metadata.liked) {
      // Optimistic Update
      const newLiked = true;
      const newLikesCount = metadata.likesCount + 1;
      
      onUpdateMetadata(post.id, { 
        liked: newLiked, 
        likesCount: newLikesCount 
      });

      await supabase.from('reactions').insert({ post_id: post.id, user_id: session.user.id, type: 'like' });
    }
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }
    if (metadata.isOwnPost) return;

    // Optimistic Update
    onUpdateMetadata(post.id, { isFollowing: true });

    const { error } = await supabase.from('follows').insert({
      follower_id: session.user.id,
      following_id: post.user_id
    });

    if (error) {
      onUpdateMetadata(post.id, { isFollowing: false });
    }
  };

  const toggleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }

    // Optimistic Update
    const newReposted = !metadata.reposted;
    const newRepostsCount = metadata.repostsCount + (newReposted ? 1 : -1);
    
    onUpdateMetadata(post.id, { 
      reposted: newReposted, 
      repostsCount: newRepostsCount 
    });

    if (metadata.reposted) {
      await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('reposts').insert({ post_id: post.id, user_id: session.user.id });
    }
  };

  const handleReply = (comment: EnhancedComment) => {
    setReplyingTo(comment);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }

    const { error } = await supabase.from('comments').insert({
      post_id: post.id,
      user_id: session.user.id,
      content: newComment.trim(),
      parent_id: replyingTo?.id || null
    });

    if (!error) {
      setNewComment('');
      setReplyingTo(null);
      
      // INVALIDAR COMENTÁRIOS NO CACHE
      appCache.invalidate(`post_comments_${post.id}`);
      appCache.invalidate(`post_comments_paginated_${post.id}`);
      
      // Optimistic Update do contador
      onUpdateMetadata(post.id, { 
        commentsCount: metadata.commentsCount + 1 
      });
      
      fetchComments(true);
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(link);
    alert(t('Link copied'));
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kizombatok_${post.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert(t('Error downloading video'));
    }
  };

  const handleReport = async () => {
    const reason = prompt(t('Report reason prompt'));
    if (!reason) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }

    const { error } = await supabase.from('reports').insert({
      post_id: post.id,
      user_id: session.user.id,
      reason: reason
    });

    if (!error) {
      alert(t('Report sent review'));
    } else {
      alert(t('Report sent success'));
    }
  };

  const handleSocialShare = (platform: string) => {
    const url = encodeURIComponent(`${window.location.origin}/post/${post.id}`);
    const text = encodeURIComponent(t('Check this video out'));
    let shareUrl = '';

    switch (platform) {
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${text}%20${url}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
        break;
    }

    if (shareUrl) window.open(shareUrl, '_blank');
  };

  const handleSendGift = async (amount: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }

    if (session.user.id === post.user_id) {
      alert(t('Cannot gift self'));
      return;
    }

    setSendingGift(true);
    try {
      const { error } = await supabase.rpc('send_gift', {
        p_sender_id: session.user.id,
        p_receiver_id: post.user_id,
        p_amount: amount,
        p_post_id: post.id
      });

      if (error) {
        if (error.message.includes('insufficient balance')) {
          if (confirm(t('Insufficient balance. Would you like to recharge?'))) {
            setShowGifts(false);
            setShowRecharge(true);
          }
        } else {
          throw error;
        }
      } else {
        alert(t('Sent gifts message', { amount, name: post.profiles?.name || post.profiles?.username }));
        setShowGifts(false);
      }
    } catch (err: unknown) {
      console.error("Erro ao enviar presente:", err);
      const errorMsg = err instanceof Error ? err.message : (typeof err === 'string' ? err : t('Unknown error'));
      alert(`${t('Error sending gift')}: ${errorMsg}`);
    } finally {
      setSendingGift(false);
    }
  };

  const renderCommentItem = (c: EnhancedComment, isReply: boolean = false) => {
    const isPostAuthor = c.user_id === post.user_id;
    return (
      <div 
        key={c.id} 
        onClick={() => handleReply(c)}
        className={`relative flex gap-3 items-start py-3 px-2 rounded-2xl transition-colors hover:bg-zinc-50 cursor-pointer group ${isReply ? 'ml-10' : ''}`}
      >
        {isReply && (
          <div className="absolute -left-5 top-0 bottom-0 w-px bg-zinc-100 flex items-center">
            <div className="absolute top-1/2 left-0 w-4 h-px bg-zinc-100" />
          </div>
        )}

        <div 
          onClick={(e) => { e.stopPropagation(); onNavigateToProfile(c.user_id); }}
          className={`${isReply ? 'w-7 h-7' : 'w-10 h-10'} rounded-xl bg-zinc-100 shrink-0 overflow-hidden border border-zinc-100 shadow-sm cursor-pointer hover:brightness-95 active:scale-95 transition-all`}
        >
          {c.profiles?.avatar_url ? (
            <img src={parseMediaUrl(c.profiles.avatar_url)} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-black text-zinc-400 uppercase text-[10px]">{c.profiles?.name?.[0] || c.profiles?.username?.[0]}</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span 
              onClick={(e) => { e.stopPropagation(); onNavigateToProfile(c.user_id); }}
              className="text-[13px] font-bold text-zinc-900 cursor-pointer hover:text-black transition-colors flex items-center gap-1"
            >
              {c.profiles?.name || `@${c.profiles?.username}`}
              <CheckCircle2 size={12} className="text-blue-500 fill-blue-500/10" />
            </span>
            {isPostAuthor && <span className="text-[8px] bg-black text-white font-black px-1.5 py-0.5 rounded uppercase">{t('Author')}</span>}
          </div>
          <p className="text-[15px] font-semibold text-zinc-950 leading-normal tracking-tight">
            {isReply && <span className="text-zinc-600 font-extrabold mr-1.5 text-[12px]">@resposta</span>}
            {c.content}
          </p>
          <div className="flex items-center gap-4 mt-2">
            <button 
              onClick={(e) => { e.stopPropagation(); handleReply(c); }}
              className="text-[11px] text-zinc-500 font-black uppercase tracking-widest hover:text-black transition-colors flex items-center gap-1"
            >
              <CornerDownRight size={11} />
              {t('Reply')}
            </button>
            {c.liked_by_author && (
              <div 
                onClick={(e) => { e.stopPropagation(); onNavigateToProfile(post.user_id); }}
                className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100/80 border border-rose-100 rounded-full px-2 py-0.5 text-rose-500 cursor-pointer active:scale-95 transition-all animate-[heartPop_0.3s_ease-out]"
              >
                <Heart size={10} className="fill-rose-500 stroke-rose-500" />
                <div className="w-4 h-4 rounded-full overflow-hidden bg-zinc-100 shrink-0 border border-rose-200">
                  {post.profiles?.avatar_url ? (
                    <img src={parseMediaUrl(post.profiles.avatar_url)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-black text-rose-400 uppercase text-[8px]">{post.profiles?.name?.[0] || post.profiles?.username?.[0]}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <button 
          onClick={(e) => { e.stopPropagation(); toggleCommentLike(c.id, !!c.liked_by_me); }}
          className="flex flex-col items-center gap-0.5 pt-1.5 group/like"
        >
          <ThumbsUp 
            size={16} 
            className={`transition-all duration-300 group-active/like:scale-150 ${c.liked_by_me ? 'text-purple-600 fill-purple-600' : 'text-zinc-400 hover:text-zinc-600'}`} 
          />
          <span className={`text-[10px] font-black ${c.liked_by_me ? 'text-purple-600' : 'text-zinc-500'}`}>{c.likes_count || 0}</span>
        </button>
      </div>
    );
  };

  const parentComments = useMemo(() => {
    const parents = comments.filter(c => !c.parent_id);
    return [...parents].sort((a, b) => {
      // 1. Post author's comments first
      const isAuthorA = a.user_id === post.user_id ? 1 : 0;
      const isAuthorB = b.user_id === post.user_id ? 1 : 0;
      if (isAuthorA !== isAuthorB) {
        return isAuthorB - isAuthorA;
      }

      // 2. Comments liked by the post author
      const isLikedByAuthorA = a.liked_by_author ? 1 : 0;
      const isLikedByAuthorB = b.liked_by_author ? 1 : 0;
      if (isLikedByAuthorA !== isLikedByAuthorB) {
        return isLikedByAuthorB - isLikedByAuthorA;
      }

      // 3. Comments with more likes
      const likesA = a.likes_count || 0;
      const likesB = b.likes_count || 0;
      if (likesA !== likesB) {
        return likesB - likesA;
      }

      // Fallback: newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [comments, post.user_id]);

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (showComments) return;

    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (now - lastClickRef.current < DOUBLE_PRESS_DELAY) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      forceLike();

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const newHeart = { id: Date.now() + Math.random(), x, y };
      
      setDoubleTapHearts(prev => [...prev, newHeart]);

      setTimeout(() => {
        setDoubleTapHearts(prev => prev.filter(h => h.id !== newHeart.id));
      }, 800);
    } else {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      if (mediaType !== 'video' && !optimizedUrl) {
        // Se for post simples sem som, não há ação de reprodução
        clickTimeoutRef.current = null;
      } else {
        clickTimeoutRef.current = setTimeout(() => {
          if (isPlaying) {
            handlePause();
          } else {
            handlePlay();
          }
          clickTimeoutRef.current = null;
        }, DOUBLE_PRESS_DELAY);
      }
    }
    lastClickRef.current = now;
  };

  return (
    <div 
      ref={containerRef} 
      className={`relative h-full w-full bg-black flex flex-col items-center ${
        showComments ? 'justify-start comments-active-postcard' : 'justify-center'
      } ${showGifts ? 'gifts-active-postcard' : ''} ${showRecharge ? 'recharge-active-postcard' : ''} overflow-hidden will-change-transform`}
    >
      {/* Video Content */}
      <div 
        className={`w-full relative cursor-pointer transition-all duration-300 ${showComments ? 'h-[30vh] min-h-[220px] bg-black shrink-0' : 'h-full'}`} 
        onClick={handleVideoClick}
        onTouchStart={allMediaUrls.length > 1 ? handleTouchStart : undefined}
        onTouchMove={allMediaUrls.length > 1 ? handleTouchMove : undefined}
        onTouchEnd={allMediaUrls.length > 1 ? handleTouchEnd : undefined}
      >
          {/* Visual representations for non-video posts ('image', 'audio', 'text') */}
          {mediaType !== 'video' && (
            <div className="absolute inset-0 z-0">
              {mediaType === 'image' && allMediaUrls.length > 0 ? (
                <div className="w-full h-full overflow-hidden relative">
                  <div 
                    className="flex w-full h-full transition-transform duration-300 ease-out"
                    style={{ 
                      transform: `translateX(-${currentImageIndex * 100}%)`,
                      display: 'flex',
                      flexDirection: 'row',
                      width: '100%',
                      height: '100%',
                      flexWrap: 'nowrap'
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                     {allMediaUrls.map((url, index) => {
                       const isLoaded = index === 0 || loadedIndices.includes(index);
                        console.log('allMediaUrls', allMediaUrls);
                        console.log('current image', allMediaUrls[currentImageIndex]);
                       return (
                         <div 
                           key={index} 
                           className="w-full h-full shrink-0 relative bg-black flex items-center justify-center animate-[fade-in_0.3s_ease]"
                           style={{
                             width: '100%',
                             height: '100%',
                             flexShrink: 0,
                             flexGrow: 0
                           }}
                         >
                           {isLoaded ? (
                             <img 
                               src={url} 
                               className={`w-full h-full transition-all duration-300 ${showComments ? 'object-contain' : 'object-cover'}`}
                               alt=""
                               referrerPolicy="no-referrer"
                               style={{
                                 filter: post.filter ? post.filter.split('|')[0] : undefined,
                               }}
                             />
                           ) : (
                             <div className="absolute inset-0 flex items-center justify-center bg-black">
                               <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                             </div>
                           )}
                         </div>
                       );
                     })}
                  </div>
                  
                  {/* Left / Right arrows for web/desktop */}
                  {allMediaUrls.length > 1 && (
                    <>
                      {currentImageIndex > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIndex(prev => prev - 1);
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/45 backdrop-blur-md rounded-full text-white z-[120] hover:bg-black/65 transition-all active:scale-95 border border-white/10"
                        >
                          <ChevronLeft size={22} />
                        </button>
                      )}
                      {currentImageIndex < allMediaUrls.length - 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIndex(prev => prev + 1);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/45 backdrop-blur-md rounded-full text-white z-[120] hover:bg-black/65 transition-all active:scale-95 border border-white/10"
                        >
                          <ChevronRight size={22} />
                        </button>
                      )}

                      {/* Pages/Dots similar to TikTok Carousel */}
                      <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-2 py-1 rounded-full text-white text-[10px] font-black z-[120] tracking-widest border border-white/5 pointer-events-none">
                        {currentImageIndex + 1}/{allMediaUrls.length}
                      </div>

                      <div className="absolute bottom-4 left-0 w-full flex justify-center gap-1.5 z-[120] pointer-events-none">
                        {allMediaUrls.map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentImageIndex ? 'bg-purple-600 w-4 shadow-[0_0_8px_rgba(147,51,234,0.6)]' : 'bg-white/45 w-1.5'}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : post.thumbnail_url ? (
                <img 
                  src={parseMediaUrl(post.thumbnail_url)} 
                  className={`w-full h-full transition-all duration-300 ${showComments ? 'object-contain' : 'object-cover'}`}
                  alt=""
                  style={{
                    filter: post.filter ? post.filter.split('|')[0] : undefined,
                  }}
                />
              ) : (
                /* Fallback for audio or text with no custom image: a beautiful styled visual bg with gradient */
                <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-zinc-950 via-purple-950/40 to-black select-none">
                  <div className="w-20 h-20 rounded-full bg-purple-600/15 flex items-center justify-center mb-4 border border-purple-500/20 shadow-[0_0_50px_rgba(147,51,234,0.15)]">
                    <Music size={32} className="text-purple-400" />
                  </div>
                  <p className="text-zinc-500 text-[10px] tracking-widest uppercase font-mono">Huzty Audio</p>
                </div>
              )}
            </div>
          )}

          {isNearScreen && (
            <video
              ref={videoRef}
              src={optimizedUrl}
              className={mediaType === 'video' ? `w-full h-full bg-black transition-all duration-300 ${showComments ? 'object-contain' : 'object-cover'}` : "absolute pointer-events-none opacity-0 w-1 h-1"}
              style={mediaType === 'video' ? { 
                filter: post.filter ? post.filter.split('|')[0] : undefined,
                opacity: isPlaying ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out'
              } : {}}
              loop
              muted={isMuted}
              playsInline
              preload={isFullyVisible ? "auto" : "metadata"}
              disablePictureInPicture
              disableRemotePlayback
              onTimeUpdate={() => {
                if (videoRef.current && !isScrubbing) {
                  setCurrentTime(videoRef.current.currentTime);
                }
              }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
              }
            }}
            onLoadStart={() => {
              if (mediaType === 'video') setIsLoading(true);
            }}
            onWaiting={() => {
              if (mediaType === 'video') setIsLoading(true);
            }}
            onPlaying={() => {
              setIsPlaying(true);
              setIsLoading(false);
            }}
            onPause={() => setIsPlaying(false)}
            onCanPlay={() => {
              setIsLoading(false);
            }}
            onError={(e) => {
              if (optimizedUrl && isNearScreen && mediaType === 'video') {
                console.error("Playback failed for URL:", optimizedUrl, e);
                setVideoError(true);
                setIsLoading(false);
              }
            }}
            poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined}
          />
          )}

          {/* Controls Overlay for multiple videos */}
          {mediaType === 'video' && allMediaUrls.length > 1 && (
            <>
              {/* Left / Right arrows for web/desktop */}
              {currentImageIndex > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex(prev => prev - 1);
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/45 backdrop-blur-md rounded-full text-white z-[120] hover:bg-black/65 transition-all active:scale-95 border border-white/10"
                >
                  <ChevronLeft size={22} />
                </button>
              )}
              {currentImageIndex < allMediaUrls.length - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex(prev => prev + 1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/45 backdrop-blur-md rounded-full text-white z-[120] hover:bg-black/65 transition-all active:scale-95 border border-white/10"
                >
                  <ChevronRight size={22} />
                </button>
              )}

              {/* Pages/Dots similar to TikTok Carousel */}
              <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-2 py-1 rounded-full text-white text-[10px] font-black z-[120] tracking-widest border border-white/5 pointer-events-none">
                {currentImageIndex + 1}/{allMediaUrls.length}
              </div>

              <div className="absolute bottom-14 left-0 w-full flex justify-center gap-1.5 z-[120] pointer-events-none">
                {allMediaUrls.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentImageIndex ? 'bg-purple-600 w-4 shadow-[0_0_8px_rgba(147,51,234,0.6)]' : 'bg-white/45 w-1.5'}`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Placeholder/Poster for videos when not near or loading */}
          {post.thumbnail_url && mediaType === 'video' && (
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                opacity: isPlaying ? 0 : 1,
                transition: 'opacity 0.3s ease-in-out'
              }}
            >
               <img 
                 src={parseMediaUrl(post.thumbnail_url)} 
                 className={`w-full h-full transition-all duration-300 ${showComments ? 'object-contain' : 'object-cover'}`}
                 alt=""
               />
            </div>
          )}

        {/* Text Overlay */}
        {post.text_overlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <span className={`text-white font-black text-center px-10 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] break-words max-w-full transition-all duration-300 ${showComments ? 'text-sm sm:text-base px-4' : 'text-3xl sm:text-4xl'}`}>
              {post.text_overlay}
            </span>
          </div>
        )}
        
        {!isPlaying && !videoError && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <Play size={64} className="text-white opacity-60" fill="white" />
          </div>
        )}

        {showErrorExplanation && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-40 p-6">
            <div className="w-full max-w-[320px] bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl flex flex-col relative text-left select-none animate-[fade-in_0.2s_ease-out]">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowErrorExplanation(false);
                  setVideoError(false);
                }}
                className="absolute top-3 right-3 text-zinc-400 hover:text-white transition-colors"
                id="close-error-popup-btn"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="text-purple-400" size={20} />
                <h4 className="text-white text-sm font-bold">Diagnóstico do Ecrã Preto</h4>
              </div>

              <div className="space-y-3 text-zinc-300 text-xs mb-5">
                <p>
                  Detetámos que o player poderá estar com dificuldades em iniciar a reprodução:
                </p>
                <div className="space-y-2 bg-black/35 p-2 rounded-lg border border-zinc-800">
                  <p><span className="text-purple-400 font-semibold">• Permissões de Som:</span> Muitos browsers bloqueiam vídeos com áudio por predefinição.</p>
                  <p><span className="text-purple-400 font-semibold">• Conectividade:</span> Problema temporário de rede ou atraso do servidor de media.</p>
                  <p><span className="text-purple-400 font-semibold">• Normalização Retroativa:</span> Convertemos as publicações legadas sem tipo formatado para o formato padrão.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowErrorExplanation(false);
                    setVideoError(false);
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                      handlePlay();
                    }
                  }}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  Tentar de novo (Forçar Play)
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowErrorExplanation(false);
                  }}
                  className="w-full py-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-xl text-xs font-bold transition-all"
                >
                  Continuar a Navegar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ThumbsUp animations for double tap */}
        {doubleTapHearts.map(heart => (
          <div 
            key={heart.id} 
            className="absolute pointer-events-none z-50 animate-[heartPop_0.8s_ease-out_forwards]"
            style={{
              left: `${heart.x - 40}px`,
              top: `${heart.y - 40}px`
            }}
          >
            <ThumbsUp size={80} className="text-purple-500 fill-purple-500 drop-shadow-[0_0_15px_rgba(168,85,247,0.7)]" />
          </div>
        ))}

        <style>{`
          body.comments-open nav {
            display: none !important;
          }
          @keyframes heartPop {
            0% {
              transform: scale(0) rotate(-15deg);
              opacity: 0;
            }
            15% {
              transform: scale(1.2) rotate(10deg);
              opacity: 0.9;
            }
            30% {
              transform: scale(1) rotate(-5deg);
              opacity: 1;
            }
            80% {
              transform: scale(1.1) translateY(-40px) rotate(5deg);
              opacity: 0.8;
            }
            100% {
              transform: scale(0.6) translateY(-80px) rotate(15deg);
              opacity: 0;
            }
          }
        `}</style>
      </div>

      {/* Sidebar Controls */}
      {uiVisible && !showComments && (
        <div className="absolute right-2 sm:right-4 bottom-16 sm:bottom-10 flex flex-col gap-3 sm:gap-5 items-center z-30">
          <div className="relative mb-1 sm:mb-2">
            <div 
              onClick={() => {
                if (metadata.isLive && onJoinLive) {
                  onJoinLive(metadata.isLive);
                } else if (metadata.hasStories && onViewStories) {
                  onViewStories(post.user_id, [post.user_id]);
                } else {
                  onNavigateToProfile(post.user_id);
                }
              }}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden shadow-2xl bg-zinc-800 cursor-pointer hover:scale-105 active:scale-95 transition-all ${metadata.isLive ? 'border-2 border-purple-600 animate-pulse' : (metadata.hasStories ? 'border-2 border-purple-600' : '')}`}
            >
               {post.profiles?.avatar_url ? (
                 <img src={parseMediaUrl(post.profiles.avatar_url)} className="w-full h-full object-cover" loading="lazy" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center font-black text-white uppercase text-xs sm:text-sm">{post.profiles?.name?.[0] || post.profiles?.username?.[0]}</div>
               )}
            </div>
            {metadata.isLive && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[7px] font-black px-1 rounded-sm border border-black uppercase tracking-tighter">
                Live
              </div>
            )}
            {!metadata.isLive && !metadata.isFollowing && !metadata.isOwnPost && (
              <button 
                onClick={handleFollow}
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-purple-600 text-white rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-[10px] sm:text-xs font-bold border-2 border-black active:scale-90 transition-all shadow-lg"
              >
                +
              </button>
            )}
          </div>

          <button onClick={toggleLike} className="flex flex-col items-center group">
            <div className="p-1.5 sm:p-2 transition-transform group-active:scale-125">
              <ThumbsUp size={28} className={`sm:w-[34px] sm:h-[34px] drop-shadow-xl transition-all ${metadata.liked ? 'text-purple-500 fill-purple-500' : 'text-white fill-white'}`} />
            </div>
            <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{metadata.likesCount}</span>
          </button>

          <button onClick={() => { setShowComments(true); fetchComments(true); }} className="flex flex-col items-center group">
            <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110">
              <MessageCircle size={28} className="sm:w-[34px] sm:h-[34px] text-white fill-white drop-shadow-xl" />
            </div>
            <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{metadata.commentsCount}</span>
          </button>

          <button onClick={() => setShowShare(true)} className="flex flex-col items-center group">
            <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110">
              <Share2 size={28} className="sm:w-[34px] sm:h-[34px] text-white fill-white drop-shadow-xl" />
            </div>
          </button>

          <button onClick={toggleRepost} className="flex flex-col items-center group">
            <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110 relative flex items-center justify-center">
              <Repeat size={28} className={`sm:w-[34px] sm:h-[34px] drop-shadow-xl transition-all ${metadata.reposted ? 'text-purple-400' : 'text-white'}`} />
              {metadata.reposted && (
                <div className="absolute inset-0 flex items-center justify-center mb-1">
                  <span className="text-[10px] sm:text-[14px] font-black text-white drop-shadow-md">✓</span>
                </div>
              )}
            </div>
            <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{metadata.repostsCount}</span>
          </button>

          {(post.mp3_url || post.dubbed_from_id) && (
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (onViewAudio) {
                  onViewAudio(post.dubbed_from_id || post.id);
                } else {
                  setShowAudioDetails(true);
                }
              }} 
              className="flex flex-col items-center group relative mt-1 shrink-0"
              title="Ver detalhes do áudio"
            >
              <div className="w-[38px] h-[38px] sm:w-[44px] sm:h-[44px] bg-purple-600 rounded-full animate-[spin_8s_linear_infinite] hover:scale-110 active:scale-95 transition-all shadow-lg border-2 border-white/40 flex items-center justify-center">
                <Music size={18} className="text-white fill-white" />
              </div>
              <span className="text-[8px] sm:text-[10px] font-black text-purple-400 drop-shadow-md tracking-tighter uppercase mt-1">Áudio</span>
            </button>
          )}


        </div>
      )}

        {/* Caption Area */}
        {uiVisible && !showComments && (
          <div className="absolute left-0 bottom-0 w-full p-4 sm:p-6 pb-12 sm:pb-14 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none z-20">
            <h3 className="font-black text-base sm:text-lg text-white pointer-events-auto drop-shadow-md flex items-center gap-2 flex-wrap">
              <span 
                onClick={() => onNavigateToProfile(post.user_id)}
                className="cursor-pointer hover:underline underline-offset-4 flex items-center gap-1.5"
              >
                {post.profiles?.name || `@${post.profiles?.username}`}
                <CheckCircle2 size={16} className="sm:w-[18px] sm:h-[18px] text-blue-500 fill-blue-500/10" />
              </span>
              {(post.media_url1 || post.media_url2 || allMediaUrls.length > 1) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-600/80 backdrop-blur-md rounded-full text-[9px] font-black uppercase text-white shadow-sm border border-purple-400">
                  <ImageIcon size={10} className="fill-white/10" />
                  Múltiplas Imagens
                </span>
              )}
              <span className="text-zinc-300/80 font-normal text-[11px] sm:text-xs">
                • {formatPublishedTime(post.created_at)}
              </span>
            </h3>
            <p 
              onClick={() => setIsCaptionExpanded(!isCaptionExpanded)}
              className={`text-xs sm:text-sm text-zinc-100 mt-1 sm:mt-1.5 pointer-events-auto drop-shadow-md max-w-[85%] leading-snug cursor-pointer transition-all ${
                isCaptionExpanded ? 'line-clamp-none max-h-[160px] overflow-y-auto no-scrollbar' : 'line-clamp-2'
              }`}
            >
              {post.content}
            </p>
          </div>
        )}

        {/* Progress Bar Container */}
        {uiVisible && !showComments && duration > 0 && (
          <div 
            className="absolute bottom-0 left-0 w-full h-8 z-40 flex items-end cursor-pointer pointer-events-auto"
            onTouchStart={handleScrubStart}
            onTouchMove={handleScrubMove}
            onTouchEnd={handleScrubEnd}
            onMouseDown={handleScrubStart}
            onMouseMove={handleScrubMove}
            onMouseUp={handleScrubEnd}
            onMouseLeave={handleScrubEnd}
          >
            <div ref={scrubRef} className="w-full h-[2px] bg-white/20 relative overflow-hidden group hover:h-[4px] transition-all">
              <div 
                className="absolute top-0 left-0 h-full bg-zinc-600 transition-all"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              <div 
                className={`absolute top-1/2 -translate-y-1/2 h-3 w-3 bg-white rounded-full transition-opacity ${isScrubbing ? 'opacity-100' : 'opacity-0 focus:opacity-100 group-hover:opacity-100'}`}
                style={{ left: `calc(${(currentTime / duration) * 100}% - 6px)` }}
              />
            </div>
          </div>
        )}

      {/* Professional Comments Drawer */}
      {showComments && (
        <div 
          className="fixed inset-0 z-[9999] flex flex-col justify-end touch-none"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 bg-transparent" onClick={() => { setShowComments(false); setReplyingTo(null); }} />
          <div className="relative bg-white h-[70vh] flex flex-col rounded-t-3xl shadow-2xl animate-[slideUp_0.3s_ease-out] overflow-hidden text-black">
            <div className="relative flex items-center justify-center py-3.5 px-4 border-b border-zinc-100 shrink-0">
               <span className="text-sm font-bold text-zinc-800 tracking-tight">
                 {metadata.commentsCount} {t('Comments')}
               </span>
               <button 
                 onClick={() => { setShowComments(false); setReplyingTo(null); }} 
                 className="absolute right-4 w-8 h-8 flex items-center justify-center hover:bg-zinc-100 rounded-full text-zinc-500 transition-colors"
               >
                 <X size={18} strokeWidth={2.5} />
               </button>
            </div>
            
            <div 
              ref={commentsScrollRef}
              onScroll={handleCommentsScroll}
              className="flex-1 overflow-y-auto p-4 space-y-1 no-scrollbar overscroll-contain touch-pan-y"
            >
              {parentComments.map(parent => {
                const replies = comments.filter(c => c.parent_id === parent.id).reverse();
                const isExpanded = expandedThreads[parent.id];
                const displayedReplies = isExpanded ? replies : replies.slice(0, 3);
                
                return (
                  <div key={parent.id} className="mb-2">
                    {renderCommentItem(parent)}
                    {displayedReplies.map(reply => renderCommentItem(reply, true))}
                    {replies.length > 3 && (
                      <div className="ml-20 mt-1 mb-4">
                        <button 
                          onClick={() => toggleThread(parent.id)}
                          className="flex items-center gap-1.5 text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em] hover:text-black transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp size={12} />
                              Ver menos
                            </>
                          ) : (
                            <>
                              <ChevronDown size={12} />
                              Ver mais {replies.length - 3} respostas
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {comments.length === 0 && !loadingMoreComments && (
                <div className="flex flex-col items-center justify-center py-20 opacity-30 grayscale">
                  <MessageCircle size={48} className="text-zinc-300 mb-4" />
                  <p className="text-xs uppercase font-black tracking-[0.3em] text-zinc-400">{t('No comments yet')}</p>
                </div>
              )}
              {loadingMoreComments && (
                <div className="flex justify-center items-center py-4">
                  <Loader2 className="animate-spin text-zinc-500" size={24} />
                </div>
              )}
            </div>

            <div className="bg-white border-t border-zinc-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,20px))] sm:pb-8 flex flex-col gap-3">
              {replyingTo && (
                <div className="px-4 py-2 bg-zinc-50 rounded-xl flex items-center justify-between border border-zinc-100">
                   <div className="flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-black rounded-full" />
                     <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                       A responder a <span className="text-black">@{replyingTo.profiles?.username}</span>
                     </p>
                   </div>
                   <button onClick={() => setReplyingTo(null)} className="text-zinc-400 hover:text-black transition-colors"><X size={14}/></button>
                </div>
              )}
              <form onSubmit={postComment} className="flex items-center gap-2">
                {isLoggedIn && !metadata.isOwnPost && (
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowComments(false);
                      setShowGifts(true);
                    }} 
                    className="w-[38px] h-[38px] sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 transition-all bg-zinc-100 hover:bg-zinc-200 text-purple-600 active:scale-90"
                    title={t('Send Gift', 'Enviar Presente')}
                  >
                    <Gift size={18} className="fill-purple-600/10" />
                  </button>
                )}
                <div className="flex-1 bg-zinc-50 rounded-full pl-4 pr-1 py-1 flex items-center justify-between gap-2 border border-zinc-100 focus-within:border-zinc-200 transition-all min-w-0">
                  <input 
                    ref={inputRef}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value.slice(0, 150))}
                    maxLength={150}
                    placeholder={t('Add comment placeholder')}
                    className="flex-1 bg-transparent text-sm outline-none text-black placeholder:text-zinc-400 py-1 pl-1 min-w-0"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[8px] sm:text-[9px] font-black tracking-tighter text-zinc-400 select-none bg-zinc-200/50 px-1.5 py-0.5 rounded-full">
                      {newComment.length}/150
                    </span>
                    <button 
                      type="submit" 
                      disabled={!newComment.trim()}
                      className={`w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 transition-all ${newComment.trim() ? 'text-purple-600 active:scale-90' : 'text-zinc-300 pointer-events-none'}`}
                    >
                      <Send size={16} className={newComment.trim() ? 'fill-purple-600' : ''} />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Share Drawer */}
      {showShare && (
        <div 
          className="fixed inset-0 z-[9999] flex flex-col justify-end touch-none"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setShowShare(false)} />
          <div className="relative bg-zinc-950 rounded-t-[40px] p-6 flex flex-col shadow-2xl border-t border-zinc-800/50 animate-[slideUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)]">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-black text-white uppercase tracking-widest">{t('Share Video')}</span>
              <button onClick={() => setShowShare(false)} className="p-2 bg-zinc-900 rounded-full text-zinc-400"><X size={20}/></button>
            </div>

            {/* Social Share Options */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <button onClick={() => handleSocialShare('whatsapp')} className="flex flex-col items-center gap-2 group">
                <div className="w-12 h-12 bg-green-600/20 rounded-2xl flex items-center justify-center text-green-500 group-active:scale-90 transition-transform">
                  <MessageSquare size={24} />
                </div>
                <span className="text-[9px] font-black text-zinc-500 uppercase">WhatsApp</span>
              </button>
              <button onClick={() => handleSocialShare('facebook')} className="flex flex-col items-center gap-2 group">
                <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center text-blue-500 group-active:scale-90 transition-transform">
                  <Facebook size={24} />
                </div>
                <span className="text-[9px] font-black text-zinc-500 uppercase">Facebook</span>
              </button>
              <button onClick={() => handleSocialShare('twitter')} className="flex flex-col items-center gap-2 group">
                <div className="w-12 h-12 bg-sky-500/20 rounded-2xl flex items-center justify-center text-sky-400 group-active:scale-90 transition-transform">
                  <Twitter size={24} />
                </div>
                <span className="text-[9px] font-black text-zinc-500 uppercase">Twitter</span>
              </button>
              <button onClick={() => handleCopyLink()} className="flex flex-col items-center gap-2 group">
                <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-white group-active:scale-90 transition-transform">
                  <Link size={24} />
                </div>
                <span className="text-[9px] font-black text-zinc-500 uppercase">{t('Copy')}</span>
              </button>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button 
                onClick={handleDownload}
                className="flex items-center justify-center gap-3 bg-zinc-900 hover:bg-zinc-800 py-4 rounded-2xl text-white transition-colors"
              >
                <Download size={20} />
                <span className="text-xs font-black uppercase tracking-widest">{t('Download')}</span>
              </button>
              <button 
                onClick={handleReport}
                className="flex items-center justify-center gap-3 bg-purple-600/10 hover:bg-purple-600/20 py-4 rounded-2xl text-purple-600 transition-colors border border-purple-600/20"
              >
                <Flag size={20} />
                <span className="text-xs font-black uppercase tracking-widest">{t('Report')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gifts Drawer */}
      {showGifts && (
        <div 
          className="fixed inset-0 z-[9999] flex flex-col justify-end touch-none"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => !sendingGift && setShowGifts(false)} />
          <div className="relative bg-white rounded-t-[40px] p-8 flex flex-col shadow-2xl animate-[slideUp_0.3s_ease-out] overflow-hidden text-black">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                   <Gift size={24} />
                 </div>
                 <div>
                   <h3 className="text-sm font-black uppercase tracking-widest">{t('Send Gift', 'Enviar Presente')}</h3>
                 </div>
               </div>
               <button onClick={() => !sendingGift && setShowGifts(false)} className="w-10 h-10 flex items-center justify-center bg-zinc-50 rounded-full text-zinc-400 hover:bg-zinc-100 transition-colors">
                 <X size={20} strokeWidth={2.5}/>
               </button>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-8">
              {[
                { amount: 1 },
                { amount: 5 },
                { amount: 10 },
                { amount: 20 },
                { amount: 50 },
                { amount: 100 }
              ].map(({ amount }) => (
                <button 
                  key={amount}
                  onClick={() => handleSendGift(amount)}
                  disabled={sendingGift}
                  className="flex items-center justify-center p-6 bg-zinc-50 border border-zinc-100 rounded-3xl hover:border-amber-500/30 transition-all active:scale-95 disabled:opacity-55"
                >
                  <span className="text-sm font-black text-amber-500 uppercase flex items-center gap-1.5">
                    {amount} <AngoCoinIcon size={14} />
                  </span>
                </button>
              ))}
            </div>

            {sendingGift && (
              <div className="flex items-center justify-center py-4 gap-3 text-amber-600">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t('Sending gift')}...</span>
              </div>
            )}

            <div className="bg-zinc-50 p-4 rounded-2xl flex flex-col gap-4">
              <button 
                onClick={() => {
                  setShowGifts(false);
                  setShowRecharge(true);
                }}
                className="w-full py-4 bg-zinc-900 text-white rounded-full text-xs font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95"
              >
                {t('Recharge Coins')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAudioDetails && (
        <div 
          className="fixed inset-0 z-[1000] flex flex-col justify-end touch-none text-zinc-950 font-sans"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" 
            onClick={() => setShowAudioDetails(false)} 
          />
          <div className="relative bg-white rounded-t-[40px] p-6 sm:p-8 flex flex-col shadow-2xl animate-[slideUp_0.3s_ease-out] overflow-hidden">
            <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black uppercase tracking-wider text-purple-600 flex items-center gap-1.5">
                <Music size={16} />
                {t('Audio Track', 'Faixa de Áudio')}
              </h3>
              <button 
                onClick={() => setShowAudioDetails(false)} 
                className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors"
                id="btn-close-audio-details"
              >
                <X size={18} strokeWidth={2.5}/>
              </button>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 bg-zinc-50 border border-zinc-100 p-4 sm:p-5 rounded-3xl mb-6">
              <div className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-2xl bg-zinc-200 border border-zinc-100 relative shadow-md overflow-hidden shrink-0">
                {((post.dubbed_from_id ? originalPost : post)?.profiles?.avatar_url) ? (
                  <img 
                    src={(post.dubbed_from_id ? originalPost : post)?.profiles?.avatar_url || ''} 
                    alt="Audio Creator" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-purple-100 text-purple-600 flex items-center justify-center">
                    <Music size={32} />
                  </div>
                )}
                <div className="absolute top-1 right-1 bg-purple-600 text-white p-1 rounded-full scale-75 animate-[pulse_2s_infinite]">
                  <Music size={12} className="fill-white" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-extrabold text-base sm:text-lg text-zinc-900 leading-tight truncate">
                  {t('Original Sound', 'Som Original')} - {(post.dubbed_from_id ? originalPost : post)?.profiles?.name || (post.dubbed_from_id ? originalPost : post)?.profiles?.username}
                </h4>
                <p 
                  onClick={() => {
                    const audUser = (post.dubbed_from_id ? originalPost : post)?.user_id;
                    if (audUser) {
                      setShowAudioDetails(false);
                      onNavigateToProfile(audUser);
                    }
                  }}
                  className="text-xs font-bold text-zinc-500 mt-1 cursor-pointer hover:underline flex items-center gap-1"
                >
                  @{((post.dubbed_from_id ? originalPost : post)?.profiles?.username) || 'poster'}
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100/50 rounded-full mt-2.5">
                  <span className="text-[10px] font-black text-purple-700 uppercase tracking-wider">
                    {audioDubs.length} {audioDubs.length === 1 ? t('dubbing', 'dublagem') : t('dubbings', 'dublagens')}
                  </span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => {
                const originalTarget = post.dubbed_from_id ? originalPost : post;
                if (onDub && originalTarget?.mp3_url) {
                  onDub(originalTarget.mp3_url, originalTarget.id);
                  setShowAudioDetails(false);
                }
              }}
              className="w-full py-4.5 mb-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full text-sm font-black uppercase tracking-widest hover:shadow-lg hover:shadow-purple-500/20 shadow-md flex items-center justify-center gap-2.5 transition-all outline-none"
              id="btn-dub-with-audio"
            >
              <Music size={16} className="text-white fill-white" />
              {t('Dub with this audio', 'Dublar com este Áudio')}
            </button>

            <div className="flex flex-col flex-1 min-h-[180px] max-h-[300px] overflow-hidden">
              <h5 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                {t('Dubs created', 'Vídeos Dublados')}
              </h5>

              {loadingDubs ? (
                <div className="flex flex-col items-center justify-center flex-1 py-8 gap-2">
                  <Loader2 className="animate-spin text-purple-600" size={24} />
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t('Loading dubs')}...</p>
                </div>
              ) : audioDubs.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-zinc-200 rounded-3xl p-6 text-center">
                  <p className="text-xs font-medium text-zinc-400">
                    {t('No dubs yet. Be the first to use this sound!', 'Ainda não há dublagens para este áudio. Seja o primeiro!')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 overflow-y-auto pb-4 no-scrollbar">
                  {audioDubs.map((dub) => (
                    <div 
                      key={dub.id} 
                      className="aspect-[9/16] relative bg-zinc-150 rounded-2xl overflow-hidden group shadow-sm border border-zinc-100"
                    >
                      <img 
                        src={dub.thumbnail_url || dub.media_url || ''} 
                        alt={dub.content || "Dub"} 
                        className="w-full h-full object-cover"
                      />
                      
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2 flex items-center gap-1.5 pointer-events-none">
                        <div className="w-5 h-5 rounded-full border border-white/40 overflow-hidden pointer-events-auto cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAudioDetails(false);
                            onNavigateToProfile(dub.user_id);
                          }}
                        >
                          <img 
                            src={dub.profiles?.avatar_url || ''} 
                            alt="Creator" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <span className="text-[9px] font-extrabold text-white truncate drop-shadow">
                          @{dub.profiles?.username}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isMuted && (
        <div className="absolute top-0 left-0 w-full p-5 pt-12 flex justify-end items-start bg-gradient-to-b from-black/70 to-transparent z-30 pointer-events-none">
          <button onClick={onToggleMute} className="p-3 bg-black/30 backdrop-blur-2xl rounded-2xl text-white border border-white/10 pointer-events-auto hover:bg-black/50 transition-colors">
            <VolumeX size={20}/>
          </button>
        </div>
      )}

      {showRecharge && (
        <RechargeModal onClose={() => setShowRecharge(false)} />
      )}
    </div>
  );
});

export default PostCard;
