
import React, { useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Hls from 'hls.js';
import { supabase } from '../supabaseClient';
import { Story, Post } from '../types';
import { X, ChevronLeft, ChevronRight, Loader2, Heart, Music } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';

interface StoryViewerProps {
  userId: string;
  currentUser: User | null;
  allUserIds?: string[];
  onNavigateToUser?: (userId: string) => void;
  onClose: () => void;
  onViewAudio?: (audioPostId: string) => void;
  highlightStories?: Story[];
}

const StoryViewer: React.FC<StoryViewerProps> = ({ 
  userId, 
  currentUser, 
  allUserIds = [], 
  onNavigateToUser, 
  onClose, 
  onViewAudio,
  highlightStories
}) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const isMuted = false;
  const [viewError, setViewError] = useState<string | null>(null);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const STORY_DURATION = 5000; // 5 seconds per image story

  const currentStory = stories[currentIndex];
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const checkLikeStatus = async () => {
      if (!currentUser || !currentStory) {
        setHasLiked(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('story_reactions')
          .select('id')
          .eq('story_id', currentStory.id)
          .eq('user_id', currentUser.id);
        
        if (!error && data && data.length > 0) {
          setHasLiked(true);
        } else {
          setHasLiked(false);
        }
      } catch (err) {
        console.error('Error checking like status:', err);
        setHasLiked(false);
      }
    };

    checkLikeStatus();
  }, [currentStory, currentUser]);

  useEffect(() => {
    // Ensure the audio instance is created
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;

    // Check if currentStory is image and has dubbed_from
    if (currentStory && currentStory.media_type === 'image' && currentStory.dubbed_from_id) {
      const dbFrom = currentStory.dubbed_from;
      const rawAudioUrl = dbFrom?.mp3_r2_url || dbFrom?.mp3_url || '';
      if (rawAudioUrl) {
        const audioUrl = parseMediaUrl(rawAudioUrl);
        audio.src = audioUrl;
        audio.muted = isMuted;
        audio.loop = true;
        audio.play().catch(err => {
          console.warn('Auto-play of background audio failed:', err);
        });
      } else {
        audio.pause();
        audio.src = '';
      }
    } else {
      audio.pause();
      audio.src = '';
    }

    return () => {
      audio.pause();
    };
  }, [currentIndex, currentStory, isMuted]);

  // Handle mute update for background audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentStory || currentStory.media_type !== 'video') return;

    const mediaUrl = parseMediaUrl(currentStory.media_url);

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (mediaUrl.toLowerCase().includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          capLevelToPlayerSize: true,
          autoStartLoad: true,
        });
        hls.loadSource(mediaUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = mediaUrl;
      }
    } else {
      video.src = mediaUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentIndex, stories, currentStory]);

  // Record view
  useEffect(() => {
    if (currentStory?.id && currentUser?.id && currentStory.user_id !== currentUser.id) {
      const recordView = async () => {
        try {
          console.log(`Attempting to record view for story ${currentStory.id} by user ${currentUser.id}`);
          const { error } = await supabase
            .from('story_views')
            .upsert({ 
              story_id: currentStory.id, 
              user_id: currentUser.id 
            }, { onConflict: 'story_id,user_id' });
          
          if (error) {
            console.error('Supabase error recording story view:', error);
            setViewError(`Erro Supabase: ${error.message} (${error.code})`);
          } else {
            console.log('Story view recorded successfully');
            setViewError(null);
          }
        } catch (err) {
          console.error('Failed to record story view:', err);
          setViewError(`Falha na execução: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      recordView();
    } else if (currentStory?.id && !currentUser?.id) {
      console.warn('Cannot record view: User not authenticated');
    }
  }, [currentStory?.id, currentStory?.user_id, currentUser?.id]);

  const handleReaction = async (type: string) => {
    if (!currentUser || !currentStory) return;

    if (hasLiked) {
      const { error } = await supabase
        .from('story_reactions')
        .delete()
        .eq('story_id', currentStory.id)
        .eq('user_id', currentUser.id);
      
      if (!error) {
        setHasLiked(false);
      }
    } else {
      const { error } = await supabase
        .from('story_reactions')
        .insert({
          story_id: currentStory.id,
          user_id: currentUser.id,
          type
        });

      if (!error) {
        setHasLiked(true);
      }
    }
  };

  const handleNext = React.useCallback(() => {
    setProgress(0);
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Check if there's a next user
      const currentUserIndex = allUserIds.indexOf(userId);
      if (currentUserIndex !== -1 && currentUserIndex < allUserIds.length - 1 && onNavigateToUser) {
        onNavigateToUser(allUserIds[currentUserIndex + 1]);
      } else {
        onClose();
      }
    }
  }, [currentIndex, stories.length, userId, allUserIds, onNavigateToUser, onClose]);

  useEffect(() => {
    const fetchStories = async () => {
      setLoading(true);
      
      if (highlightStories && highlightStories.length > 0) {
        setStories(highlightStories);
        setCurrentIndex(0);
        setProgress(0);
        setLoading(false);
        return;
      }
      
      // Tentar a query ideal com os joins de áudio / dublagem
      let { data, error } = await supabase
        .from('stories')
        .select('*, profiles:user_id(*), dubbed_from:dubbed_from_id(*, profiles!user_id(*))')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
        
      // Se falhar (por exemplo, porque a coluna deve ser criada na base de dados),
      // fazemos fallback para a query original
      if (error) {
        console.warn('Falha na query com joins de áudio. Fazendo fallback:', error);
        const fallbackRes = await supabase
          .from('stories')
          .select('*, profiles:user_id(*)')
          .eq('user_id', userId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: true });
        data = fallbackRes.data;
      }
      
      if (data && data.length > 0) {
        // Fetch dubbed_from for any stories that have dubbed_from_id but don't have dubbed_from relations populated
        const enrichedStories = await Promise.all((data as Story[]).map(async (story: Story) => {
          if (story.dubbed_from_id && !story.dubbed_from) {
            try {
              const { data: postData } = await supabase
                .from('posts')
                .select('*, profiles:user_id(*)')
                .eq('id', story.dubbed_from_id)
                .single();
              if (postData) {
                return { ...story, dubbed_from: postData as Post };
              }
            } catch (err) {
              console.error('Error fetching dubbed_from for story:', err);
            }
          }
          return story;
        }));
        setStories(enrichedStories);
        setCurrentIndex(0);
        setProgress(0);
      } else {
        onClose();
      }
      setLoading(false);
    };

    fetchStories();
  }, [userId, onClose, highlightStories]);

  useEffect(() => {
    if (stories.length === 0 || loading || !currentStory || currentStory.media_type === 'video') return;

    const intervalTime = 50;
    const step = (intervalTime / STORY_DURATION) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          handleNext();
          return 100;
        }
        return prev + step;
      });
    }, intervalTime);

    return () => {
      clearInterval(timer);
    };
  }, [currentIndex, stories.length, loading, currentStory, STORY_DURATION, handleNext]);

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.duration) {
      setProgress((video.currentTime / video.duration) * 100);
    }
  };

  const handlePrev = () => {
    setProgress(0);
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      // Check if there's a previous user
      const currentUserIndex = allUserIds.indexOf(userId);
      if (currentUserIndex !== -1 && currentUserIndex > 0 && onNavigateToUser) {
        onNavigateToUser(allUserIds[currentUserIndex - 1]);
      } else {
        setCurrentIndex(0);
        setProgress(0);
      }
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[99999] bg-black flex items-center justify-center">
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (stories.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black flex flex-col items-center justify-center">
      {/* Progress Bars */}
      <div className="absolute top-4 left-0 right-0 px-2 flex gap-1 z-20">
        {stories.map((_, index) => (
          <div key={index} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white transition-all duration-50"
              style={{ 
                width: index < currentIndex ? '100%' : (index === currentIndex ? `${progress}%` : '0%') 
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-8 left-0 right-0 px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl overflow-hidden border border-white/20">
              {currentStory.profiles?.avatar_url ? (
                <img src={parseMediaUrl(currentStory.profiles.avatar_url)} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white text-xs font-black">
                  {currentStory.profiles?.username?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-white text-sm font-black drop-shadow-md">
                {currentStory.profiles?.name || `@${currentStory.profiles?.username}`}
              </span>
              {currentStory.dubbed_from_id && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onViewAudio) {
                      onViewAudio(currentStory.dubbed_from_id!);
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] text-purple-300 hover:text-purple-200 transition-colors bg-purple-950/40 backdrop-blur-sm px-1.5 py-0.5 rounded-full border border-purple-500/20 w-fit cursor-pointer pointer-events-auto mt-0.5"
                >
                  <Music size={10} className="text-purple-400 shrink-0" />
                  <span className="max-w-[120px] truncate block font-bold">
                    {currentStory.dubbed_from?.content || 'Áudio Dublado'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {viewError && (
            <div className="px-3 py-1 bg-purple-600/80 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-widest text-white border border-purple-500/50">
              {viewError}
            </div>
          )}
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {currentStory.media_type === 'video' ? (
          <video 
            ref={videoRef}
            key={currentStory.id}
            className="w-full h-full object-contain"
            autoPlay
            muted={isMuted}
            playsInline
            onEnded={handleNext}
            onTimeUpdate={handleVideoTimeUpdate}
          />
        ) : (
          <img 
            key={currentStory.id}
            src={parseMediaUrl(currentStory.media_url)} 
            className="w-full h-full object-contain"
            alt=""
          />
        )}

        {/* Dynamic Text Overlay */}
        {currentStory.text_overlay && (
          <div className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[85%] text-center px-5 py-3 bg-black/55 backdrop-blur-md rounded-2xl border border-white/10 text-white font-extrabold text-lg tracking-wide shadow-2xl z-[30] select-none pointer-events-none break-words">
            {currentStory.text_overlay}
          </div>
        )}

        {/* Navigation Overlays */}
        <div className="absolute inset-0 flex">
          <div className="w-1/3 h-full cursor-pointer" onClick={handlePrev} />
          <div className="w-1/3 h-full cursor-pointer" onClick={handleNext} />
          <div className="w-1/3 h-full cursor-pointer" onClick={handleNext} />
        </div>
      </div>

      {/* Footer / Reactions */}
      {currentUser && currentStory.user_id !== currentUser.id && (
        <div className="absolute bottom-10 left-0 right-0 px-4 flex justify-center z-20">
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); handleReaction('💜'); }}
            className={`p-3 bg-white/10 backdrop-blur-md rounded-full border hover:bg-white/20 hover:scale-110 active:scale-90 transition-all cursor-pointer ${
              hasLiked ? 'border-purple-500' : 'border-white/10'
            }`}
          >
            <Heart 
              size={24} 
              className={hasLiked ? 'text-purple-500 fill-purple-500' : 'text-white'} 
            />
          </button>
        </div>
      )}

      {/* Desktop Navigation Buttons */}
      <div className="hidden md:flex absolute inset-x-0 top-1/2 -translate-y-1/2 justify-between px-4 pointer-events-none">
        <button 
          onClick={handlePrev} 
          className="p-2 bg-black/20 hover:bg-black/40 rounded-full text-white pointer-events-auto transition-colors"
        >
          <ChevronLeft size={32} />
        </button>
        <button 
          onClick={handleNext} 
          className="p-2 bg-black/20 hover:bg-black/40 rounded-full text-white pointer-events-auto transition-colors"
        >
          <ChevronRight size={32} />
        </button>
      </div>
    </div>
  );
};

export default StoryViewer;
