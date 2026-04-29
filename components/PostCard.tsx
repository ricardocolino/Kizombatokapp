
/* eslint-disable react/prop-types */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Post, Comment, Profile } from '../types';
import { ThumbsUp, MessageCircle, Share2, Repeat, Play, VolumeX, Send, X, CornerDownRight, ChevronDown, ChevronUp, CheckCircle2, Flag, Download, Link, Facebook, Twitter, MessageSquare, Gift, Loader2, AlertCircle, Image, Smile, AtSign } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { appCache } from '../services/cache';
import { PostMetadata } from './Feed';
import { parseMediaUrl } from '../services/mediaUtils';

interface PostCardProps {
  post: Post;
  metadata: PostMetadata;
  onUpdateMetadata: (postId: string, updates: Partial<PostMetadata>) => void;
  onNavigateToProfile: (userId: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onRequireAuth?: () => void;
  onViewStories?: (userId: string, allUserIds?: string[]) => void;
  onJoinLive?: (liveId: string) => void;
  isPaused?: boolean;
}

type EnhancedComment = Comment & { 
  likes_count: number; 
  liked_by_me: boolean;
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
  isPaused
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [uiVisible, setUiVisible] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [netSpeed, setNetSpeed] = useState<'slow' | 'normal'>('normal');

  const [isNearScreen, setIsNearScreen] = useState(false);
  const [isFullyVisible, setIsFullyVisible] = useState(false);

  // Handle media_url that might be a JSON array string
  const mediaUrl = useMemo(() => parseMediaUrl(post.media_url), [post.media_url]);

  // Detect network speed to adjust resolution (144p to 240p)
  useEffect(() => {
    interface NetworkInfo {
      effectiveType: string;
      saveData: boolean;
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    }
    const nav = navigator as unknown as { connection?: NetworkInfo; mozConnection?: NetworkInfo; webkitConnection?: NetworkInfo };
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

    if (conn) {
      const updateConnection = () => {
        const type = conn.effectiveType;
        // Consider slow if type is 2g, 3g or if saveData is on
        const isSlow = type === 'slow-2g' || type === '2g' || type === '3g' || conn.saveData;
        setNetSpeed(isSlow ? 'slow' : 'normal');
      };
      
      conn.addEventListener('change', updateConnection);
      updateConnection();
      return () => conn.removeEventListener('change', updateConnection);
    }
  }, []);

  const optimizedUrl = useMemo(() => {
    if (!mediaUrl) return '';
    if (!mediaUrl.startsWith('http')) return mediaUrl;
    
    // Target resolutions: 144p (slow) or 240p (normal)
    const res = netSpeed === 'slow' ? '144p' : '240p';
    const width = netSpeed === 'slow' ? 256 : 426;

    try {
      const url = new URL(mediaUrl);
      url.searchParams.set('res', res);
      url.searchParams.set('w', width.toString());
      // Common CDN parameter for quality
      url.searchParams.set('quality', netSpeed === 'slow' ? 'low' : 'medium');
      return url.toString();
    } catch {
      return mediaUrl;
    }
  }, [mediaUrl, netSpeed]);

  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [sendingGift, setSendingGift] = useState(false);
  const [comments, setComments] = useState<EnhancedComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<EnhancedComment | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<number, boolean>>({});
  useEffect(() => {
    setVideoError(false);
    setIsLoading(true);
    setIsPlaying(false);
    if (videoRef.current) {
      if (videoRef.current.readyState >= 1) {
        videoRef.current.currentTime = 0;
      }
      // Force stop buffering when URL changes or unmounts
      if (!isNearScreen) {
        videoRef.current.src = "";
        videoRef.current.load();
      } else {
        videoRef.current.src = optimizedUrl;
      }
    }
  }, [optimizedUrl, isNearScreen]);

  useEffect(() => {
    // Mostrar a UI com um pequeno delay para dar prioridade ao vídeo
    const timer = setTimeout(() => {
      setUiVisible(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);
  const viewCountedRef = useRef<boolean>(false);
  const viewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlaying = () => setIsPlaying(true);
    const handlePauseEvent = () => setIsPlaying(false);
    const handleCanPlay = () => setIsLoading(false);

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePauseEvent);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', () => setIsLoading(true));

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePauseEvent);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

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

  const fetchComments = async () => {
    const cacheKey = `post_comments_${post.id}`;
    
    // VERIFICAR CACHE
    const cachedComments = appCache.get(cacheKey);
    if (cachedComments) {
      console.log(`📦 Comentários do post ${post.id}: usando cache`);
      setComments(cachedComments);
      onUpdateMetadata(post.id, { commentsCount: cachedComments.length });
      return;
    }

    console.log(`🔄 Comentários do post ${post.id}: buscando do servidor`);
    const { data: { session } } = await supabase.auth.getSession();
    const { data } = await supabase.from('comments').select('*, profiles!user_id(*)').eq('post_id', post.id).order('created_at', { ascending: false });
    
    if (data) {
      const commentsWithMetadata = await Promise.all(data.map(async (c) => {
        const { count } = await supabase.from('comment_reactions').select('*', { count: 'exact', head: true }).eq('comment_id', c.id);
        let likedByMe = false;
        if (session) {
          const { data: userLike } = await supabase.from('comment_reactions').select('*').eq('comment_id', c.id).eq('user_id', session.user.id).maybeSingle();
          likedByMe = !!userLike;
        }
        return { ...c, likes_count: count || 0, liked_by_me: likedByMe };
      }));
      setComments(commentsWithMetadata as EnhancedComment[]);
      onUpdateMetadata(post.id, { commentsCount: data.length });
      
      // SALVAR NO CACHE
      appCache.set(cacheKey, commentsWithMetadata);
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
        return {
          ...c,
          liked_by_me: !currentlyLiked,
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
      
      // Optimistic Update do contador
      onUpdateMetadata(post.id, { 
        commentsCount: metadata.commentsCount + 1 
      });
      
      fetchComments();
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(link);
    alert('Link copiado para a área de transferência!');
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
      alert('Erro ao descarregar o vídeo. Tenta novamente.');
    }
  };

  const handleReport = async () => {
    const reason = prompt('Por que queres denunciar este vídeo?');
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
      alert('Denúncia enviada. A nossa equipa irá analisar o vídeo.');
    } else {
      alert('Denúncia enviada com sucesso.');
    }
  };

  const handleSocialShare = (platform: string) => {
    const url = encodeURIComponent(`${window.location.origin}/post/${post.id}`);
    const text = encodeURIComponent(`Olha este vídeo no AngoChat!`);
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
      alert('Não podes enviar presentes a ti mesmo!');
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
          alert('Não tens AngoCoins suficientes! Carrega o teu saldo no perfil.');
        } else {
          throw error;
        }
      } else {
        alert(`Enviaste ${amount} AngoCoins para ${post.profiles?.name || post.profiles?.username}! 🔥`);
        setShowGifts(false);
      }
    } catch (err: unknown) {
      console.error("Erro ao enviar presente:", err);
      const errorMsg = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Erro desconhecido');
      alert(`Erro ao enviar presente: ${errorMsg}`);
    } finally {
      setSendingGift(false);
    }
  };

  const renderCommentItem = (c: EnhancedComment, isReply: boolean = false) => {
    const isPostAuthor = c.user_id === post.user_id;
    return (
      <div key={c.id} className={`relative flex gap-3 items-start py-3 px-2 rounded-2xl transition-colors hover:bg-zinc-50 group ${isReply ? 'ml-10' : ''}`}>
        {isReply && (
          <div className="absolute -left-5 top-0 bottom-0 w-px bg-zinc-100 flex items-center">
            <div className="absolute top-1/2 left-0 w-4 h-px bg-zinc-100" />
          </div>
        )}

        <div 
          onClick={() => onNavigateToProfile(c.user_id)}
          className={`${isReply ? 'w-7 h-7' : 'w-10 h-10'} rounded-full bg-zinc-100 shrink-0 overflow-hidden border border-zinc-100 shadow-sm cursor-pointer hover:brightness-95 active:scale-95 transition-all`}
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
              onClick={() => onNavigateToProfile(c.user_id)}
              className="text-[12px] font-black text-zinc-500 cursor-pointer hover:text-black transition-colors flex items-center gap-1"
            >
              {c.profiles?.name || `@${c.profiles?.username}`}
              <CheckCircle2 size={12} className="text-blue-500 fill-blue-500/10" />
            </span>
            {isPostAuthor && <span className="text-[8px] bg-black text-white font-black px-1.5 py-0.5 rounded uppercase">Autor</span>}
          </div>
          <p className="text-[14px] text-zinc-800 leading-normal tracking-tight">
            {isReply && <span className="text-zinc-400 font-bold mr-1 text-[12px]">@resposta</span>}
            {c.content}
          </p>
          <div className="flex items-center gap-4 mt-2">
            <button 
              onClick={() => handleReply(c)}
              className="text-[10px] text-zinc-400 font-black uppercase tracking-widest hover:text-black transition-colors flex items-center gap-1"
            >
              <CornerDownRight size={10} />
              Responder
            </button>
          </div>
        </div>

        <button 
          onClick={() => toggleCommentLike(c.id, !!c.liked_by_me)}
          className="flex flex-col items-center gap-0.5 pt-1.5 group/like"
        >
          <ThumbsUp 
            size={16} 
            className={`transition-all duration-300 group-active/like:scale-150 ${c.liked_by_me ? 'text-red-500 fill-red-500' : 'text-zinc-200 hover:text-zinc-400'}`} 
          />
          <span className={`text-[10px] font-black ${c.liked_by_me ? 'text-red-500' : 'text-zinc-300'}`}>{c.likes_count || 0}</span>
        </button>
      </div>
    );
  };

  const parentComments = useMemo(() => comments.filter(c => !c.parent_id), [comments]);

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black flex flex-col items-center justify-center overflow-hidden will-change-transform">
      {/* Video Content */}
      <div className="w-full h-full relative cursor-pointer" onClick={() => !showComments && (isPlaying ? handlePause() : handlePlay())}>
          {isNearScreen && (
            <video
              ref={videoRef}
              src={optimizedUrl}
              className="w-full h-full object-cover bg-black"
              style={{ 
                filter: post.filter ? post.filter.split('|')[0] : undefined,
                opacity: isPlaying ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out'
              }}
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
            onLoadStart={() => setIsLoading(true)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onCanPlay={() => setIsLoading(false)}
            onError={(e) => {
              // Só marcamos erro se o src for válido e falhou mesmo
              if (optimizedUrl && isNearScreen) {
                console.error("Playback failed for URL:", optimizedUrl, e);
                setVideoError(true);
                setIsLoading(false);
              }
            }}
            poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined}
          />
          )}

          {/* Placeholder/Poster when not near or loading */}
          {(!isNearScreen || (!isPlaying && post.thumbnail_url)) && (
            <div className="absolute inset-0 z-0">
               <img 
                 src={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : ''} 
                 className="w-full h-full object-cover blur-[2px] opacity-50 transition-opacity duration-500"
                 alt=""
               />
            </div>
          )}

        {/* Text Overlay */}
        {post.text_overlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <span className="text-white text-3xl sm:text-4xl font-black text-center px-10 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] break-words max-w-full">
              {post.text_overlay}
            </span>
          </div>
        )}

        {isLoading && !videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/40 backdrop-blur-[2px] z-10">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-zinc-800 border-t-zinc-400 rounded-full animate-spin"></div>
              <Play size={24} className="text-zinc-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20" fill="currentColor" />
            </div>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em] mt-6 animate-pulse">A carregar...</p>
          </div>
        )}
        
        {!isPlaying && !videoError && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <Play size={64} className="text-white opacity-60" fill="white" />
          </div>
        )}

        {videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20 p-6 text-center">
            <AlertCircle size={48} className="text-zinc-400 mb-3" />
            <p className="text-white text-sm font-medium mb-4">Falha ao carregar o vídeo</p>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setVideoError(false);
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  handlePlay();
                }
              }}
              className="px-6 py-2 bg-white text-black rounded-full text-sm font-bold active:scale-95 transition-all"
            >
              Tentar de novo
            </button>
          </div>
        )}
      </div>

      {/* Sidebar Controls */}
      {uiVisible && (
        <div className="absolute right-2 sm:right-3 bottom-12 sm:bottom-6 flex flex-col gap-3 sm:gap-5 items-center z-30">
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
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 overflow-hidden shadow-2xl bg-zinc-800 ring-2 ring-black/50 cursor-pointer hover:scale-105 active:scale-95 transition-all ${metadata.isLive ? 'border-red-600 animate-pulse' : (metadata.hasStories ? 'border-red-600' : 'border-white')}`}
            >
               {post.profiles?.avatar_url ? (
                 <img src={parseMediaUrl(post.profiles.avatar_url)} className="w-full h-full object-cover" loading="lazy" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center font-black text-white uppercase text-xs sm:text-sm">{post.profiles?.name?.[0] || post.profiles?.username?.[0]}</div>
               )}
            </div>
            {metadata.isLive && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[7px] font-black px-1 rounded-sm border border-black uppercase tracking-tighter">
                Live
              </div>
            )}
            {!metadata.isLive && !metadata.isFollowing && !metadata.isOwnPost && (
              <button 
                onClick={handleFollow}
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-red-600 text-white rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-[10px] sm:text-xs font-bold border-2 border-black active:scale-90 transition-all shadow-lg"
              >
                +
              </button>
            )}
          </div>

          <button onClick={toggleLike} className="flex flex-col items-center group">
            <div className="p-1.5 sm:p-2 transition-transform group-active:scale-125">
              <ThumbsUp size={28} className={`sm:w-[34px] sm:h-[34px] drop-shadow-xl transition-all ${metadata.liked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
            </div>
            <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{metadata.likesCount}</span>
          </button>

          <button onClick={() => { setShowComments(true); fetchComments(); }} className="flex flex-col items-center group">
            <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110">
              <MessageCircle size={28} className="sm:w-[34px] sm:h-[34px] text-white drop-shadow-xl" />
            </div>
            <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{metadata.commentsCount}</span>
          </button>

          <button onClick={() => setShowShare(true)} className="flex flex-col items-center group">
            <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110">
              <Share2 size={28} className="sm:w-[34px] sm:h-[34px] text-white drop-shadow-xl" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-black text-white uppercase drop-shadow-md tracking-widest">Partilha</span>
          </button>

          <button onClick={toggleRepost} className="flex flex-col items-center group">
            <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110 relative flex items-center justify-center">
              <Repeat size={28} className="sm:w-[34px] sm:h-[34px] drop-shadow-xl transition-all text-white" />
              {metadata.reposted && (
                <div className="absolute inset-0 flex items-center justify-center mb-1">
                  <span className="text-[10px] sm:text-[14px] font-black text-white drop-shadow-md">✓</span>
                </div>
              )}
            </div>
            <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{metadata.repostsCount}</span>
          </button>

          {!metadata.isOwnPost && (
            <button onClick={() => setShowGifts(true)} className="flex flex-col items-center group">
              <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110">
                <Gift size={28} className="sm:w-[34px] sm:h-[34px] text-white drop-shadow-xl" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-black text-white uppercase drop-shadow-md tracking-widest">Presente</span>
            </button>
          )}
        </div>
      )}

        {/* Caption Area */}
        {uiVisible && (
          <div className="absolute left-0 bottom-0 w-full p-4 sm:p-5 pb-6 sm:pb-8 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none z-20">
            <h3 className="font-black text-base sm:text-lg text-white pointer-events-auto drop-shadow-md flex items-center gap-2">
              <span 
                onClick={() => onNavigateToProfile(post.user_id)}
                className="cursor-pointer hover:underline underline-offset-4 flex items-center gap-1.5"
              >
                {post.profiles?.name || `@${post.profiles?.username}`}
                <CheckCircle2 size={16} className="sm:w-[18px] sm:h-[18px] text-blue-500 fill-blue-500/10" />
              </span>
            </h3>
            <p className="text-xs sm:text-sm text-zinc-100 line-clamp-2 mt-1 sm:mt-1.5 pointer-events-auto drop-shadow-md max-w-[75%] sm:max-w-[80%] leading-snug">
              {post.content}
            </p>
          </div>
        )}

        {/* Progress Bar Container */}
        {uiVisible && duration > 0 && (
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
            <div ref={scrubRef} className="w-full h-1.5 bg-white/20 relative overflow-hidden group hover:h-2 transition-all">
              <div 
                className="absolute top-0 left-0 h-full bg-red-600 transition-all"
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
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => { setShowComments(false); setReplyingTo(null); }} />
          <div className="relative bg-white h-full flex flex-col shadow-2xl animate-[slideUp_0.3s_ease-out] overflow-hidden text-black">
            <div className="flex items-center justify-between p-5 border-b border-zinc-50">
               <div className="flex flex-col">
                 <span className="text-sm font-black tracking-tighter leading-tight">{metadata.commentsCount} Comentários</span>
               </div>
               <button onClick={() => { setShowComments(false); setReplyingTo(null); }} className="w-10 h-10 flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors">
                 <X size={20} strokeWidth={2.5} />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-1 no-scrollbar">
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
              {comments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-30 grayscale">
                  <MessageCircle size={48} className="text-zinc-300 mb-4" />
                  <p className="text-xs uppercase font-black tracking-[0.3em] text-zinc-400">Ainda não há comentários...</p>
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
              <form onSubmit={postComment} className="flex items-center gap-3">
                <div className="flex-1 bg-zinc-50 rounded-full px-6 py-3 flex items-center gap-3 border border-zinc-100 focus-within:border-zinc-200 transition-all">
                  <input 
                    ref={inputRef}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Adicionar comentário..."
                    className="flex-1 bg-transparent text-sm outline-none text-black placeholder:text-zinc-400"
                  />
                  <div className="flex items-center gap-2 text-zinc-400">
                    <button type="button" className="hover:text-black w-6 h-6 flex items-center justify-center">
                      <Image size={18} />
                    </button>
                    <button type="button" className="hover:text-black w-6 h-6 flex items-center justify-center">
                      <Smile size={18} />
                    </button>
                    <button type="button" className="hover:text-black w-6 h-6 flex items-center justify-center">
                      <AtSign size={18} />
                    </button>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={!newComment.trim()}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${newComment.trim() ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-300'}`}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Share Drawer */}
      {showShare && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setShowShare(false)} />
          <div className="relative bg-zinc-950 rounded-t-[40px] p-6 flex flex-col shadow-2xl border-t border-zinc-800/50 animate-[slideUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)]">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-black text-white uppercase tracking-widest">Partilhar Vídeo</span>
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
                <span className="text-[9px] font-black text-zinc-500 uppercase">Copiar</span>
              </button>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button 
                onClick={handleDownload}
                className="flex items-center justify-center gap-3 bg-zinc-900 hover:bg-zinc-800 py-4 rounded-2xl text-white transition-colors"
              >
                <Download size={20} />
                <span className="text-xs font-black uppercase tracking-widest">Descarregar</span>
              </button>
              <button 
                onClick={handleReport}
                className="flex items-center justify-center gap-3 bg-red-600/10 hover:bg-red-600/20 py-4 rounded-2xl text-red-500 transition-colors border border-red-600/20"
              >
                <Flag size={20} />
                <span className="text-xs font-black uppercase tracking-widest">Denunciar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gifts Drawer */}
      {showGifts && (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => !sendingGift && setShowGifts(false)} />
          <div className="relative bg-white rounded-t-[40px] p-8 flex flex-col shadow-2xl animate-[slideUp_0.3s_ease-out] overflow-hidden text-black">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                   <Gift size={24} />
                 </div>
                 <div>
                   <h3 className="text-sm font-black uppercase tracking-widest">Enviar Presente</h3>
                   <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Apoia o criador com AngoCoins</p>
                 </div>
               </div>
               <button onClick={() => !sendingGift && setShowGifts(false)} className="w-10 h-10 flex items-center justify-center bg-zinc-50 rounded-full text-zinc-400 hover:bg-zinc-100 transition-colors">
                 <X size={20} strokeWidth={2.5}/>
               </button>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-8">
              {[
                { amount: 1, img: "https://cdn-icons-png.flaticon.com/512/1087/1087420.png", label: 'Flor' },
                { amount: 5, img: "https://cdn-icons-png.flaticon.com/512/2107/2107845.png", label: 'Coração' },
                { amount: 10, img: "https://cdn-icons-png.flaticon.com/512/1828/1828884.png", label: 'Estrela' },
                { amount: 20, img: "https://cdn-icons-png.flaticon.com/512/426/426833.png", label: 'Fogo' },
                { amount: 50, img: "https://cdn-icons-png.flaticon.com/512/3112/3112946.png", label: 'Troféu' },
                { amount: 100, img: "https://cdn-icons-png.flaticon.com/512/1071/1071985.png", label: 'Diamante' }
              ].map(({ amount, img, label }) => (
                <button 
                  key={amount}
                  onClick={() => handleSendGift(amount)}
                  disabled={sendingGift}
                  className="flex flex-col items-center gap-3 p-4 bg-zinc-50 border border-zinc-100 rounded-3xl hover:border-amber-500/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  <div className="w-14 h-14 flex items-center justify-center">
                    <img src={img} alt={label} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[11px] font-black uppercase tracking-tighter">{label}</span>
                    <span className="text-[10px] font-black text-amber-500 uppercase">{amount} AC</span>
                  </div>
                </button>
              ))}
            </div>

            {sendingGift && (
              <div className="flex items-center justify-center py-4 gap-3 text-amber-600">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest">A enviar presente...</span>
              </div>
            )}

            <div className="bg-zinc-50 p-4 rounded-2xl">
              <p className="text-[9px] text-zinc-500 text-center uppercase tracking-widest font-black leading-relaxed">
                O valor será descontado do teu saldo e enviado para o autor. <br/>
                AngoChat • Apoio ao Criador
              </p>
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
    </div>
  );
});

export default PostCard;
