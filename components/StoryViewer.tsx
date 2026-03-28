
import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Story, StoryView, StoryReaction } from '../types';
import { X, ChevronLeft, ChevronRight, Loader2, Volume2, VolumeX, Heart, Flame, Laugh, Smile, ThumbsUp, Eye } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';

interface StoryViewerProps {
  userId: string;
  allUserIds?: string[];
  onNavigateToUser?: (userId: string) => void;
  onClose: () => void;
}

const StoryViewer: React.FC<StoryViewerProps> = ({ userId, allUserIds = [], onNavigateToUser, onClose }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewers, setViewers] = useState<StoryView[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [reactions, setReactions] = useState<StoryReaction[]>([]);
  const STORY_DURATION = 5000; // 5 seconds per image story

  const currentStory = stories[currentIndex];

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });
  }, []);

  // Record view
  useEffect(() => {
    if (currentStory && currentUser && currentStory.user_id !== currentUser.id) {
      const recordView = async () => {
        await supabase
          .from('story_views')
          .upsert({ 
            story_id: currentStory.id, 
            user_id: currentUser.id 
          }, { onConflict: 'story_id,user_id' });
      };
      recordView();
    }
  }, [currentStory, currentUser]);

  // Fetch viewers and reactions if owner
  useEffect(() => {
    if (currentStory && currentUser && currentStory.user_id === currentUser.id) {
      const fetchStats = async () => {
        const { data: viewsData } = await supabase
          .from('story_views')
          .select('*, profiles:user_id(*)')
          .eq('story_id', currentStory.id);
        
        if (viewsData) setViewers(viewsData);

        const { data: reactionsData } = await supabase
          .from('story_reactions')
          .select('*, profiles:user_id(*)')
          .eq('story_id', currentStory.id);
        
        if (reactionsData) setReactions(reactionsData);
      };
      fetchStats();
    }
  }, [currentStory, currentUser]);

  const handleReaction = async (type: string) => {
    if (!currentUser || !currentStory) return;

    const { error } = await supabase
      .from('story_reactions')
      .insert({
        story_id: currentStory.id,
        user_id: currentUser.id,
        type
      });

    if (!error) {
      // Optional: show a small animation or toast
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
      const { data } = await supabase
        .from('stories')
        .select('*, profiles:user_id(*)')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      
      if (data && data.length > 0) {
        setStories(data);
        setCurrentIndex(0);
        setProgress(0);
      } else {
        onClose();
      }
      setLoading(false);
    };

    fetchStories();
  }, [userId, onClose]);

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
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (stories.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
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
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20">
              {currentStory.profiles?.avatar_url ? (
                <img src={parseMediaUrl(currentStory.profiles.avatar_url)} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white text-xs font-black">
                  {currentStory.profiles?.username?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-white text-sm font-black drop-shadow-md">
              {currentStory.profiles?.name || `@${currentStory.profiles?.username}`}
            </span>
          </div>
          
          {currentStory.media_type === 'video' && (
            <button 
              onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
              className="p-2 text-white/80 hover:text-white transition-colors"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {currentUser && currentStory.user_id === currentUser.id && (
            <button 
              onClick={(e) => { e.stopPropagation(); setShowViewers(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/60 transition-all"
            >
              <Eye size={16} />
              <span className="text-xs font-black">{viewers.length}</span>
            </button>
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
            key={currentStory.id}
            src={parseMediaUrl(currentStory.media_url)} 
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

        {/* Navigation Overlays */}
        <div className="absolute inset-0 flex">
          <div className="w-1/3 h-full cursor-pointer" onClick={handlePrev} />
          <div className="w-1/3 h-full cursor-pointer" onClick={handleNext} />
          <div className="w-1/3 h-full cursor-pointer" onClick={handleNext} />
        </div>
      </div>

      {/* Footer / Reactions */}
      {currentUser && currentStory.user_id !== currentUser.id && (
        <div className="absolute bottom-10 left-0 right-0 px-4 flex justify-center gap-4 z-20">
          {[
            { icon: <Heart size={24} className="text-red-500 fill-red-500" />, type: '❤️' },
            { icon: <Flame size={24} className="text-orange-500 fill-orange-500" />, type: '🔥' },
            { icon: <Laugh size={24} className="text-yellow-500" />, type: '😂' },
            { icon: <Smile size={24} className="text-yellow-500" />, type: '😊' },
            { icon: <ThumbsUp size={24} className="text-blue-500 fill-blue-500" />, type: '👍' }
          ].map((reaction, i) => (
            <button 
              key={i}
              onClick={(e) => { e.stopPropagation(); handleReaction(reaction.type); }}
              className="p-3 bg-white/10 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/20 hover:scale-110 active:scale-90 transition-all"
            >
              {reaction.icon}
            </button>
          ))}
        </div>
      )}

      {/* Viewers Modal */}
      {showViewers && (
        <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-xl flex items-end justify-center">
          <div className="w-full max-w-md bg-zinc-900 rounded-t-3xl p-6 flex flex-col gap-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-lg font-black uppercase tracking-widest">Visualizações ({viewers.length})</h3>
              <button onClick={() => setShowViewers(false)} className="p-2 text-white/60 hover:text-white"><X size={24} /></button>
            </div>
            
            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
              {viewers.length > 0 ? viewers.map((view) => (
                <div key={view.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                      {view.profiles?.avatar_url ? (
                        <img src={parseMediaUrl(view.profiles.avatar_url)} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white text-sm font-black">
                          {view.profiles?.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-white text-sm font-black">{view.profiles?.name || `@${view.profiles?.username}`}</span>
                      <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                        {new Date(view.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  
                  {/* Show reaction if this user reacted */}
                  {reactions.find(r => r.user_id === view.user_id) && (
                    <span className="text-xl">{reactions.find(r => r.user_id === view.user_id)?.type}</span>
                  )}
                </div>
              )) : (
                <div className="py-10 text-center text-zinc-500 font-bold uppercase tracking-widest text-xs">
                  Ainda não há visualizações
                </div>
              )}
            </div>
          </div>
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
