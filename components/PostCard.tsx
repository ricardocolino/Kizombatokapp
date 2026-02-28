
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Post, Comment, Profile } from '../types';
import { Heart, MessageCircle, Share2, Play, Volume2, VolumeX, Music2, Send, X, CornerDownRight, ChevronDown, ChevronUp, CheckCircle2, Eye, Flag, Download, Link, Facebook, Twitter, MessageSquare } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface PostCardProps {
  post: Post;
  onNavigateToProfile: (userId: string) => void;
  onNavigateToSound: (post: Post) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onRequireAuth?: () => void;
}

type EnhancedComment = Comment & { 
  likes_count: number; 
  liked_by_me: boolean;
  profiles?: any;
};

const PostCard: React.FC<PostCardProps> = ({ post, onNavigateToProfile, onNavigateToSound, isMuted, onToggleMute, onRequireAuth }) => {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwnPost, setIsOwnPost] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const mediaUrls = useMemo(() => {
    try {
      const parsed = JSON.parse(post.media_url);
      return Array.isArray(parsed) ? parsed : [post.media_url];
    } catch {
      return [post.media_url];
    }
  }, [post.media_url]);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [comments, setComments] = useState<EnhancedComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<EnhancedComment | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<number, boolean>>({});
  const [originalPost, setOriginalPost] = useState<Post | null>(null);
  const [originalProfile, setOriginalProfile] = useState<Profile | null>(null);
  const [viewCounted, setViewCounted] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem(`viewed_${post.id}`);
    }
    return false;
  });
  const [currentViews, setCurrentViews] = useState(post.views || 0);
  const [followingList, setFollowingList] = useState<Profile[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStartRef.current - touchEnd;

    if (Math.abs(diff) > 50) { // Threshold for swipe
      if (diff > 0) {
        // Swipe left -> next image
        setCurrentImageIndex(prev => (prev < mediaUrls.length - 1 ? prev + 1 : 0));
      } else {
        // Swipe right -> previous image
        setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : mediaUrls.length - 1));
      }
    }
    touchStartRef.current = null;
  };

  const handlePause = React.useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  const incrementView = React.useCallback(async () => {
    if (viewCounted) return;
    
    if (localStorage.getItem(`viewed_${post.id}`)) {
      setViewCounted(true);
      return;
    }

    try {
      await supabase.rpc('increment_post_views', { target_post_id: post.id });
      localStorage.setItem(`viewed_${post.id}`, 'true');
      setViewCounted(true);
      setCurrentViews(prev => prev + 1);
    } catch (e) {
      console.error("Erro ao incrementar views:", e);
    }
  }, [post.id, viewCounted]);

  const handlePlay = React.useCallback(() => {
    let playPromise: Promise<void> | null = null;

    if (post.media_type === 'video' && videoRef.current && !videoError) {
      playPromise = videoRef.current.play();
    }

    const hasAudio = !!post.audio_url || (post.media_type === 'image' && !!post.sound_id);
    if (hasAudio && audioRef.current) {
      // Sync audio time with video time before playing
      if (videoRef.current) {
        audioRef.current.currentTime = videoRef.current.currentTime;
      }
      const audioPromise = audioRef.current.play();
      if (!playPromise) playPromise = audioPromise;
    } else if (post.media_type === 'image' && !playPromise) {
      // For images without sound, we still want to mark as playing for view count
      setIsPlaying(true);
      if (!viewCounted) incrementView();
      return;
    }

    if (playPromise) {
      playPromise.then(() => {
        setIsPlaying(true);
        if (!viewCounted) {
          incrementView();
        }
      }).catch((err) => {
        console.error("Playback failed:", err);
        setIsPlaying(false);
      });
    }
  }, [post.media_type, post.sound_id, post.audio_url, videoError, viewCounted, incrementView]);

  const fetchOriginalPost = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles(*)')
        .eq('id', post.sound_id)
        .maybeSingle();
      
      if (data && !error) {
        setOriginalPost(data as Post);
        if (data.profiles) {
          setOriginalProfile(data.profiles as Profile);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar post original do som:", e);
    }
  }, [post.sound_id]);

  const fetchMetadata = React.useCallback(async () => {
    try {
      const { count: reactionCount } = await supabase.from('reactions').select('*', { count: 'exact', head: true }).eq('post_id', post.id);
      const { count: commentCount } = await supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', post.id);
      setLikesCount(reactionCount || 0);
      setCommentsCount(commentCount || 0);

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsOwnPost(session.user.id === post.user_id);
        const { data: likeData } = await supabase.from('reactions').select('*').eq('post_id', post.id).eq('user_id', session.user.id).maybeSingle();
        setLiked(!!likeData);

        const { data: followData } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', session.user.id)
          .eq('following_id', post.user_id)
          .maybeSingle();
        setIsFollowing(!!followData);

        const { data: follows } = await supabase
          .from('follows')
          .select('following_id, profiles:following_id(*)')
          .eq('follower_id', session.user.id);
        
        if (follows) {
          setFollowingList(follows.map((f: any) => f.profiles) as Profile[]);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar metadados:", e);
    }
  }, [post.id, post.user_id]);

  useEffect(() => {
    setTimeout(() => {
      fetchMetadata();
      if (post.sound_id) {
        fetchOriginalPost();
      }
    }, 0);
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) handlePlay();
          else handlePause();
        });
      },
      { threshold: 0.6 }
    );

    if (containerRef.current) observerRef.current.observe(containerRef.current);
    return () => observerRef.current?.disconnect();
  }, [post.id, videoError, post.sound_id, fetchMetadata, fetchOriginalPost, handlePlay, handlePause]);

  useEffect(() => {
    const currentAudioSource = post.audio_url || (post.media_type === 'image' ? (originalPost?.audio_url || originalPost?.media_url) : null);
    if (isPlaying && currentAudioSource && audioRef.current) {
      if (videoRef.current) {
        audioRef.current.currentTime = videoRef.current.currentTime % (audioRef.current.duration || 1);
      }
      audioRef.current.play().catch(() => {});
    }
  }, [post.audio_url, post.media_type, originalPost?.audio_url, originalPost?.media_url, isPlaying]);

  const fetchComments = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data } = await supabase.from('comments').select('*, profiles(*)').eq('post_id', post.id).order('created_at', { ascending: false });
    
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

    if (liked) {
      await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', session.user.id);
      setLikesCount(prev => Math.max(0, prev - 1));
    } else {
      await supabase.from('reactions').insert({ post_id: post.id, user_id: session.user.id, type: 'like' });
      setLikesCount(prev => prev + 1);
    }
    setLiked(!liked);
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }
    if (isOwnPost) return;

    const { error } = await supabase.from('follows').insert({
      follower_id: session.user.id,
      following_id: post.user_id
    });

    if (!error) setIsFollowing(true);
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
      fetchComments();
      setCommentsCount(prev => prev + 1);
    }
  };

  const handleShareToUser = async (targetUserId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onRequireAuth?.();
      return;
    }

    const shareMessage = `Olha este mambo: ${window.location.origin}/post/${post.id}`;
    
    const { error } = await supabase.from('messages').insert({
      sender_id: session.user.id,
      receiver_id: targetUserId,
      content: shareMessage
    });

    if (!error) {
      alert('Mambo partilhado com sucesso!');
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(link);
    alert('Link copiado para a área de transferência!');
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(post.media_url);
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
      alert('Denúncia enviada. A nossa equipa irá analisar o mambo.');
    } else {
      alert('Denúncia enviada com sucesso.');
    }
  };

  const handleSocialShare = (platform: string) => {
    const url = encodeURIComponent(`${window.location.origin}/post/${post.id}`);
    const text = encodeURIComponent(`Olha este mambo no KizombaTok!`);
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

  const renderCommentItem = (c: EnhancedComment, isReply: boolean = false) => {
    const isPostAuthor = c.user_id === post.user_id;
    return (
      <div key={c.id} className={`relative flex gap-3 items-start py-3 px-2 rounded-2xl transition-colors hover:bg-zinc-900/30 group ${isReply ? 'ml-10' : ''}`}>
        {isReply && (
          <div className="absolute -left-5 top-0 bottom-0 w-px bg-zinc-800 flex items-center">
            <div className="absolute top-1/2 left-0 w-4 h-px bg-zinc-800" />
          </div>
        )}

        <div 
          onClick={() => onNavigateToProfile(c.user_id)}
          className={`${isReply ? 'w-7 h-7' : 'w-10 h-10'} rounded-full bg-zinc-900 shrink-0 overflow-hidden border border-zinc-800 shadow-lg cursor-pointer hover:brightness-110 active:scale-95 transition-all`}
        >
          {c.profiles?.avatar_url ? (
            <img src={c.profiles.avatar_url} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-black text-zinc-500 uppercase text-[10px]">{c.profiles?.name?.[0] || c.profiles?.username?.[0]}</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span 
              onClick={() => onNavigateToProfile(c.user_id)}
              className="text-[12px] font-black text-zinc-400 cursor-pointer hover:text-white transition-colors flex items-center gap-1"
            >
              {c.profiles?.name || `@${c.profiles?.username}`}
              <CheckCircle2 size={12} className="text-blue-500 fill-blue-500/10" />
            </span>
            {isPostAuthor && <span className="text-[8px] bg-red-600/20 text-red-500 font-black px-1.5 py-0.5 rounded uppercase border border-red-500/20">Autor</span>}
          </div>
          <p className="text-[14px] text-zinc-100 leading-normal tracking-tight">
            {isReply && <span className="text-red-500 font-black mr-1 text-[12px]">@resposta</span>}
            {c.content}
          </p>
          <div className="flex items-center gap-4 mt-2">
            <button 
              onClick={() => handleReply(c)}
              className="text-[10px] text-zinc-600 font-black uppercase tracking-widest hover:text-white transition-colors flex items-center gap-1"
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
          <Heart 
            size={16} 
            className={`transition-all duration-300 group-active/like:scale-150 ${c.liked_by_me ? 'text-red-500 fill-red-500' : 'text-zinc-700 hover:text-zinc-500'}`} 
          />
          <span className={`text-[10px] font-black ${c.liked_by_me ? 'text-red-500' : 'text-zinc-700'}`}>{c.likes_count || 0}</span>
        </button>
      </div>
    );
  };

  const parentComments = useMemo(() => comments.filter(c => !c.parent_id), [comments]);

  // Music avatar logic - use the original sound owner profile if sound_id exists
  const musicProfile = originalProfile || post.profiles;

  // Helper to navigate to the correct sound (original or current)
  const handleSoundClick = () => {
    onNavigateToSound(originalPost || post);
  };

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Audio for external sounds or images */}
      {(post.audio_url || (post.media_type === 'image' && (originalPost?.audio_url || originalPost?.media_url))) && (
        <audio 
          ref={audioRef} 
          src={post.audio_url || originalPost?.audio_url || originalPost?.media_url} 
          loop 
          muted={isMuted}
        />
      )}

      {/* Video Content */}
      <div className="w-full h-full relative cursor-pointer" onClick={() => !showComments && (isPlaying ? handlePause() : handlePlay())}>
        {post.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={post.media_url}
            className="w-full h-full object-cover"
            style={{ filter: post.filter || undefined }}
            loop
            muted={isMuted || !!post.audio_url}
            playsInline
            autoPlay
            preload="metadata"
            crossOrigin="anonymous"
            onError={() => setVideoError(true)}
            poster={post.thumbnail_url || undefined}
            onPlay={() => {
              if (post.audio_url && audioRef.current) {
                audioRef.current.currentTime = videoRef.current?.currentTime || 0;
                audioRef.current.play().catch(() => {});
              }
            }}
            onPause={() => {
              if (post.audio_url && audioRef.current) {
                audioRef.current.pause();
              }
            }}
            onSeeking={() => {
              if (post.audio_url && audioRef.current && videoRef.current) {
                audioRef.current.currentTime = videoRef.current.currentTime;
              }
            }}
            onTimeUpdate={() => {
              if (post.audio_url && audioRef.current && videoRef.current) {
                const video = videoRef.current;
                const audio = audioRef.current;

                // Ensure audio is playing if video is playing and not muted
                if (!video.paused && audio.paused && isPlaying && !isMuted) {
                  audio.play().catch(() => {});
                } else if (video.paused && !audio.paused) {
                  audio.pause();
                }

                // Sync if they drift by more than 0.3 seconds
                if (audio.duration) {
                  const targetTime = video.currentTime % audio.duration;
                  if (Math.abs(audio.currentTime - targetTime) > 0.3) {
                    audio.currentTime = targetTime;
                  }
                }
              }
            }}
          />
        ) : (
          <div 
            className="w-full h-full relative group/carousel"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <img 
              src={mediaUrls[currentImageIndex]} 
              className="w-full h-full object-cover transition-opacity duration-300" 
              style={{ filter: post.filter || undefined }}
              alt="" 
              crossOrigin="anonymous" 
            />
            
            {mediaUrls.length > 1 && (
              <>
                {/* Carousel Indicators */}
                <div className="absolute top-4 left-0 w-full flex justify-center gap-1.5 z-30 px-4">
                  {mediaUrls.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`h-1 rounded-full transition-all duration-300 ${idx === currentImageIndex ? 'bg-white w-6' : 'bg-white/40 w-2'}`}
                    />
                  ))}
                </div>
              </>
            )}
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
        
        {!isPlaying && post.media_type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <Play size={64} className="text-white opacity-60" fill="white" />
          </div>
        )}
      </div>

      {/* Sidebar Controls */}
      <div className="absolute right-2 sm:right-3 bottom-20 sm:bottom-10 flex flex-col gap-3 sm:gap-5 items-center z-30">
        <div className="relative mb-1 sm:mb-2">
          <div 
            onClick={() => onNavigateToProfile(post.user_id)}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-white overflow-hidden shadow-2xl bg-zinc-800 ring-2 ring-black/50 cursor-pointer hover:scale-105 active:scale-95 transition-all"
          >
             {post.profiles?.avatar_url ? (
               <img src={post.profiles.avatar_url} className="w-full h-full object-cover" />
             ) : (
               <div className="w-full h-full flex items-center justify-center font-black text-white uppercase text-xs sm:text-sm">{post.profiles?.name?.[0] || post.profiles?.username?.[0]}</div>
             )}
          </div>
          {!isFollowing && !isOwnPost && (
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
            <Heart size={28} className={`sm:w-[34px] sm:h-[34px] drop-shadow-xl transition-all ${liked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
          </div>
          <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{likesCount}</span>
        </button>

        <button onClick={() => { setShowComments(true); fetchComments(); }} className="flex flex-col items-center group">
          <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110">
            <MessageCircle size={28} className="sm:w-[34px] sm:h-[34px] text-white drop-shadow-xl" />
          </div>
          <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{commentsCount}</span>
        </button>

        <button onClick={() => setShowShare(true)} className="flex flex-col items-center group">
          <div className="p-1.5 sm:p-2 transition-transform group-active:scale-110">
            <Share2 size={28} className="sm:w-[34px] sm:h-[34px] text-white drop-shadow-xl" />
          </div>
          <span className="text-[9px] sm:text-[10px] font-black text-white uppercase drop-shadow-md tracking-widest">Partilha</span>
        </button>

        <div className="flex flex-col items-center opacity-80">
          <div className="p-1.5 sm:p-2">
            <Eye size={24} className="sm:w-[28px] sm:h-[28px] text-white drop-shadow-xl" />
          </div>
          <span className="text-[10px] sm:text-[12px] font-black text-white drop-shadow-md tracking-tighter">{currentViews}</span>
        </div>

        {/* Spinning Music Avatar */}
        <div className="relative mt-1 sm:mt-2 p-1 sm:p-1.5 cursor-pointer" onClick={handleSoundClick}>
           <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-zinc-950 border-[4px] sm:border-[6px] border-zinc-900/80 flex items-center justify-center overflow-hidden shadow-2xl animate-[spin_4s_linear_infinite]">
              {musicProfile?.avatar_url ? (
                <img src={musicProfile.avatar_url} className="w-[60%] h-[60%] rounded-full object-cover border border-zinc-800" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                  <Music2 size={16} className="sm:w-[20px] sm:h-[20px] text-zinc-600" />
                </div>
              )}
           </div>
           <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-zinc-800 rounded-full shadow-inner" />
           </div>
        </div>
      </div>

      {/* Caption Area */}
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
        <div 
          onClick={handleSoundClick}
          className="flex items-center gap-2 mt-3 sm:mt-4 bg-white/10 backdrop-blur-xl w-fit px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-white/20 pointer-events-auto group cursor-pointer hover:bg-white/20 transition-all"
        >
          <Music2 size={10} className="sm:w-[12px] sm:h-[12px] text-white animate-pulse" />
          <span className="text-[9px] sm:text-[10px] text-white font-black uppercase tracking-widest overflow-hidden whitespace-nowrap max-w-[120px] sm:max-w-[150px]">
            Som Original - {musicProfile?.name || musicProfile?.username}
          </span>
        </div>
      </div>

      {/* Professional Comments Drawer */}
      {showComments && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => { setShowComments(false); setReplyingTo(null); }} />
          <div className="relative bg-zinc-950 rounded-t-[40px] h-[72%] flex flex-col shadow-2xl border-t border-zinc-800/50 animate-[slideUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)]">
            <div className="flex items-center justify-between p-5 border-b border-zinc-900/50">
               <div className="flex flex-col">
                 <span className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Comentários</span>
                 <span className="text-sm font-black text-white tracking-tighter">{commentsCount} Mambos</span>
               </div>
               <button onClick={() => { setShowComments(false); setReplyingTo(null); }} className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
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
                          className="flex items-center gap-1.5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em] hover:text-red-500 transition-colors"
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
                  <MessageCircle size={48} className="text-zinc-500 mb-4" />
                  <p className="text-xs uppercase font-black tracking-[0.3em]">O mambo está calmo...</p>
                </div>
              )}
            </div>

            <div className="bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-900/50 p-4 pb-8">
              {replyingTo && (
                <div className="mb-3 px-4 py-2.5 bg-red-600/5 rounded-xl flex items-center justify-between border border-red-600/10">
                   <div className="flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
                     <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                       A responder a <span className="text-red-600">@{replyingTo.profiles?.username}</span>
                     </p>
                   </div>
                   <button onClick={() => setReplyingTo(null)} className="text-zinc-500 hover:text-white transition-colors"><X size={14}/></button>
                </div>
              )}
              <form onSubmit={postComment} className="flex gap-3">
                <div className="flex-1 relative">
                  <input 
                    ref={inputRef}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={replyingTo ? `Diz algo para @${replyingTo.profiles?.username}...` : "Comenta este mambo..."}
                    className="w-full bg-zinc-900/50 rounded-2xl px-5 py-3.5 text-sm outline-none border border-zinc-800/50 focus:border-red-600/50 transition-all placeholder:text-zinc-600"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={!newComment.trim()}
                  className={`p-3.5 rounded-2xl text-white transition-all shadow-xl active:scale-90 ${newComment.trim() ? 'bg-red-600' : 'bg-zinc-800 text-zinc-600'}`}
                >
                  <Send size={20} />
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
              <span className="text-sm font-black text-white uppercase tracking-widest">Partilhar Mambo</span>
              <button onClick={() => setShowShare(false)} className="p-2 bg-zinc-900 rounded-full text-zinc-400"><X size={20}/></button>
            </div>

            {/* Share to Following */}
            <div className="mb-8">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Enviar para amigos</p>
              <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                {followingList.map(friend => (
                  <button 
                    key={friend.id}
                    onClick={() => handleShareToUser(friend.id)}
                    className="flex flex-col items-center gap-2 shrink-0 group"
                  >
                    <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden group-active:scale-90 transition-transform">
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 font-black uppercase text-xs">{friend.name?.[0] || friend.username?.[0]}</div>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 font-medium truncate w-14 text-center">{friend.name || friend.username}</span>
                  </button>
                ))}
                {followingList.length === 0 && (
                  <p className="text-[10px] text-zinc-600 italic">Segue alguém para partilhares mambos diretamente!</p>
                )}
              </div>
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

      {/* Top Header Overlays */}
      <div className="absolute top-0 left-0 w-full p-5 pt-12 flex justify-end items-start bg-gradient-to-b from-black/70 to-transparent z-30 pointer-events-none">
        {post.media_type === 'video' && (
          <button onClick={onToggleMute} className="p-3 bg-black/30 backdrop-blur-2xl rounded-2xl text-white border border-white/10 pointer-events-auto hover:bg-black/50 transition-colors">
            {isMuted ? <VolumeX size={20}/> : <Volume2 size={20}/>}
          </button>
        )}
      </div>
    </div>
  );
};

export default PostCard;
