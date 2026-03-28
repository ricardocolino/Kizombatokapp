
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Story, StoryView, StoryReaction } from '../types';
import { X, Eye, Heart, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';

interface StoryStatsProps {
  userId: string;
  onClose: () => void;
}

const StoryStats: React.FC<StoryStatsProps> = ({ userId, onClose }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewers, setViewers] = useState<StoryView[]>([]);
  const [reactions, setReactions] = useState<StoryReaction[]>([]);

  const currentStory = stories[currentIndex];

  useEffect(() => {
    const fetchStories = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      
      if (data && data.length > 0) {
        setStories(data);
        setCurrentIndex(0);
      } else {
        onClose();
      }
      setLoading(false);
    };

    fetchStories();
  }, [userId, onClose]);

  const fetchStats = React.useCallback(async () => {
    if (!currentStory) return;

    const { data: viewsData } = await supabase
      .from('story_views')
      .select('*, profiles:user_id(*)')
      .eq('story_id', currentStory.id)
      .order('created_at', { ascending: false });
    
    if (viewsData) setViewers(viewsData);

    const { data: reactionsData } = await supabase
      .from('story_reactions')
      .select('*, profiles:user_id(*)')
      .eq('story_id', currentStory.id);
    
    if (reactionsData) setReactions(reactionsData);
  }, [currentStory]);

  useEffect(() => {
    if (currentStory) {
      const initStats = async () => {
        await fetchStats();
      };
      initStats();

      const viewsChannel = supabase
        .channel(`story_views_stats_${currentStory.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'story_views', filter: `story_id=eq.${currentStory.id}` },
          () => fetchStats()
        )
        .subscribe();

      const reactionsChannel = supabase
        .channel(`story_reactions_stats_${currentStory.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'story_reactions', filter: `story_id=eq.${currentStory.id}` },
          () => fetchStats()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(viewsChannel);
        supabase.removeChannel(reactionsChannel);
      };
    }
  }, [currentStory, fetchStats]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[120] bg-black flex items-center justify-center">
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (stories.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black flex flex-col md:flex-row">
      {/* Left Side: Story Preview */}
      <div className="relative flex-1 bg-zinc-950 flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-zinc-800">
        <div className="absolute top-8 left-4 right-4 flex items-center justify-between z-20">
          <div className="flex gap-1 flex-1 px-2">
            {stories.map((_, index) => (
              <div key={index} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                <div className={`h-full bg-white ${index === currentIndex ? 'w-full' : (index < currentIndex ? 'w-full' : 'w-0')}`} />
              </div>
            ))}
          </div>
          <button onClick={onClose} className="md:hidden p-2 text-white/60 hover:text-white ml-4">
            <X size={24} />
          </button>
        </div>

        <div className="w-full h-full max-w-lg mx-auto flex items-center justify-center p-4">
          <div className="relative w-full aspect-[9/16] bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800">
            {currentStory.media_type === 'video' ? (
              <video 
                key={currentStory.id}
                src={parseMediaUrl(currentStory.media_url)} 
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img 
                key={currentStory.id}
                src={parseMediaUrl(currentStory.media_url)} 
                className="w-full h-full object-cover"
                alt=""
              />
            ) || <div className="w-full h-full flex items-center justify-center text-zinc-700 font-black uppercase tracking-widest text-xs">Mídia Indisponível</div>}
            
            {/* Navigation Overlays */}
            <div className="absolute inset-0 flex">
              <div className="w-1/2 h-full cursor-pointer" onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} />
              <div className="w-1/2 h-full cursor-pointer" onClick={() => setCurrentIndex(prev => Math.min(stories.length - 1, prev + 1))} />
            </div>

            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
              <button 
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(prev => Math.max(0, prev - 1)); }}
                className={`p-1.5 bg-black/40 rounded-full text-white pointer-events-auto transition-opacity ${currentIndex === 0 ? 'opacity-0' : 'opacity-100'}`}
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(prev => Math.min(stories.length - 1, prev + 1)); }}
                className={`p-1.5 bg-black/40 rounded-full text-white pointer-events-auto transition-opacity ${currentIndex === stories.length - 1 ? 'opacity-0' : 'opacity-100'}`}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Insights */}
      <div className="w-full md:w-[400px] bg-zinc-900 flex flex-col h-[50vh] md:h-full">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-white text-xl font-black uppercase tracking-widest">Insights</h2>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Estatísticas do Story</p>
          </div>
          <button onClick={onClose} className="hidden md:block p-2 text-white/60 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 no-scrollbar">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800/50 p-4 rounded-2xl border border-zinc-800 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-zinc-500">
                <Eye size={14} />
                <span className="text-[10px] font-black uppercase tracking-wider">Vistas</span>
              </div>
              <span className="text-2xl font-black text-white">{viewers.length}</span>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded-2xl border border-zinc-800 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-zinc-500">
                <Heart size={14} />
                <span className="text-[10px] font-black uppercase tracking-wider">Reações</span>
              </div>
              <span className="text-2xl font-black text-white">{reactions.length}</span>
            </div>
          </div>

          {/* Viewers List */}
          <div className="flex flex-col gap-4">
            <h3 className="text-zinc-400 text-xs font-black uppercase tracking-widest">Visualizadores</h3>
            <div className="flex flex-col gap-3">
              {viewers.length > 0 ? viewers.map((view) => (
                <div key={view.id} className="flex items-center justify-between bg-zinc-800/30 p-3 rounded-xl border border-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-zinc-800">
                      {view.profiles?.avatar_url ? (
                        <img src={parseMediaUrl(view.profiles.avatar_url)} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-sm font-black">
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
                    <div className="w-8 h-8 bg-zinc-700/50 rounded-full flex items-center justify-center text-lg">
                      {reactions.find(r => r.user_id === view.user_id)?.type}
                    </div>
                  )}
                </div>
              )) : (
                <div className="py-10 text-center text-zinc-600 font-bold uppercase tracking-widest text-[10px] border-2 border-dashed border-zinc-800 rounded-2xl">
                  Ninguém viu ainda
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryStats;
