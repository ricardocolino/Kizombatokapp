import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Post, FeedFilter } from '../types';
import { ArrowLeft, Loader2, Music } from 'lucide-react';

interface AudioDetailsPageProps {
  postId: string;
  onBack: () => void;
  onDub?: (mp3Url: string, originalPostId: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToPost?: (postId: string, filter?: FeedFilter) => void;
}

const AudioDetailsPage: React.FC<AudioDetailsPageProps> = ({
  postId,
  onBack,
  onDub,
  onNavigateToProfile,
  onNavigateToPost,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<Post | null>(null);
  const [originalPost, setOriginalPost] = useState<Post | null>(null);
  const [audioDubs, setAudioDubs] = useState<Post[]>([]);
  const [loadingDubs, setLoadingDubs] = useState(false);

  useEffect(() => {
    const fetchAudioData = async () => {
      setLoading(true);
      try {
        // 1. Fetch current post
        const { data: postData, error: postError } = await supabase
          .from('posts')
          .select('*, profiles!user_id(*)')
          .eq('id', postId)
          .maybeSingle();

        if (postError) throw postError;
        if (!postData) {
          setLoading(false);
          return;
        }

        const currentPost = postData as Post;
        setPost(currentPost);

        // 2. Determine and fetch original post
        let original = currentPost;
        if (currentPost.dubbed_from_id) {
          const { data: origData, error: origError } = await supabase
            .from('posts')
            .select('*, profiles!user_id(*)')
            .eq('id', currentPost.dubbed_from_id)
            .maybeSingle();

          if (!origError && origData) {
            original = origData as Post;
          }
        }
        setOriginalPost(original);

        // 3. Fetch all dubs of the original audio
        setLoadingDubs(true);
        const { data: dubsData, error: dubsError } = await supabase
          .from('posts')
          .select('*, profiles!user_id(*)')
          .eq('dubbed_from_id', original.id)
          .order('created_at', { ascending: false });

        if (!dubsError && dubsData) {
          setAudioDubs(dubsData as Post[]);
        }
      } catch (err) {
        console.error('Error fetching audio page details:', err);
      } finally {
        setLoading(false);
        setLoadingDubs(false);
      }
    };

    fetchAudioData();
  }, [postId]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white text-zinc-900 p-6">
        <Loader2 className="animate-spin text-purple-600 mb-2" size={32} />
        <p className="text-xs font-black uppercase tracking-widest text-zinc-400">
          {t('Loading sound database', 'Carregando banco de áudio')}...
        </p>
      </div>
    );
  }

  if (!post || !originalPost) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white text-zinc-900 p-6 text-center">
        <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4 text-purple-500 border border-zinc-200">
          <Music size={28} />
        </div>
        <h3 className="text-lg font-black">{t('Sound not found', 'Som não encontrado')}</h3>
        <p className="text-zinc-500 text-xs mt-2 max-w-xs">
          {t('The audio track or original post is no longer available.', 'A faixa de áudio ou o post original não está mais disponível.')}
        </p>
        <button
          onClick={onBack}
          className="mt-6 px-6 py-2.5 bg-zinc-900 text-white rounded-full font-bold text-xs uppercase tracking-wider hover:bg-zinc-805 transition"
        >
          {t('Go back', 'Voltar')}
        </button>
      </div>
    );
  }

  const audioCreatorName = originalPost.profiles?.name || originalPost.profiles?.username || 'user';
  const audioCreatorUsername = originalPost.profiles?.username || 'user';

  interface GridPost extends Post {
    isModel?: boolean;
  }

  // Combine Model and Dubs
  const gridItems: GridPost[] = [];
  if (originalPost) {
    gridItems.push({
      ...originalPost,
      isModel: true
    });
  }
  
  audioDubs.forEach(dub => {
    if (dub.id !== originalPost.id) {
      gridItems.push({
        ...dub,
        isModel: false
      });
    }
  });

  return (
    <div className="h-full flex flex-col bg-white text-zinc-900 font-sans overflow-hidden">
      {/* Header */}
      <header className="h-[56px] px-4 flex items-center justify-between border-b border-zinc-150 shrink-0 bg-white/80 backdrop-blur">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-650 hover:bg-zinc-200 active:scale-95 transition-all outline-none"
          id="btn-audio-back"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-850">
          {t('Audio details', 'Detalhes do Áudio')}
        </h2>
        <div className="w-10" /> {/* Spacer */}
      </header>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-24 no-scrollbar border-t border-zinc-50">
        {/* Core Info - Simple layout, square card removed */}
        <div className="flex items-center gap-4 py-3 border-b border-zinc-100">
          <div className="w-[64px] h-[64px] rounded-full bg-zinc-100 border border-zinc-200 relative overflow-hidden shrink-0">
            {originalPost.profiles?.avatar_url ? (
              <img
                src={originalPost.profiles.avatar_url}
                alt="Audio Creator"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-purple-50 text-purple-600 flex items-center justify-center">
                <Music size={24} />
              </div>
            )}
            <div className="absolute bottom-0 right-0 bg-purple-600 border border-white p-1 rounded-full shadow-md">
              <Music size={10} className="text-white fill-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-base text-zinc-900 tracking-tight leading-snug">
              {t('Original Sound', 'Som Original')}
            </h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-600">
              by {audioCreatorName}
            </span>
            
            <p
              onClick={() => onNavigateToProfile && onNavigateToProfile(originalPost.user_id)}
              className="text-xs font-semibold text-zinc-550 mt-1 hover:text-purple-600 hover:underline cursor-pointer transition-colors"
            >
              @{audioCreatorUsername}
            </p>
          </div>
        </div>

        {/* Action Button */}
        {(originalPost.media_url || originalPost.mp3_url) && onDub && (
          <button
            onClick={() => onDub(originalPost.media_url || originalPost.mp3_url!, originalPost.id)}
            className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-[0.98] text-white rounded-full text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-purple-500/10 shadow-sm flex items-center justify-center gap-2 transition-all outline-none"
            id="btn-dub-page-action"
          >
            <Music size={14} className="text-white fill-white" />
            {t('Dub with this audio', 'Dublar com este Áudio')}
          </button>
        )}

        {/* Grid/Feed Section of Dubbed Videos */}
        <div className="flex flex-col space-y-4 pt-2">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
            {t('Dubs collection', 'Galeria de Dublagens')} ({gridItems.length})
          </h4>

          {loadingDubs ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="animate-spin text-purple-600" size={24} />
              <p className="text-[10px] font-black text-zinc-500 tracking-wider uppercase">{t('Filtering list')}</p>
            </div>
          ) : gridItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-zinc-250 rounded-[2rem] text-center p-6 bg-zinc-50/50">
              <p className="text-xs font-semibold text-zinc-500 max-w-xs">
                {t('No videos yet. Tap above to be the first to dub this audio!', 'Sem vídeos ainda. Toque acima para ser o primeiro a dublar!')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gridItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (onNavigateToPost) {
                      onNavigateToPost(item.id, {
                        type: 'audio',
                        dubbedFromId: originalPost.id,
                        audioName: audioCreatorUsername ? `@${audioCreatorUsername}` : 'Áudio Original'
                      });
                    }
                  }}
                  className="aspect-[3/4] relative bg-zinc-50 border border-zinc-150 rounded-2xl overflow-hidden group shadow-sm hover:border-purple-400 hover:shadow-md transition-all cursor-pointer"
                >
                  <img
                    src={item.thumbnail_url || item.media_url || ''}
                    alt={item.content || "Dub"}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  
                  {/* Model badge marker */}
                  {item.isModel && (
                    <div className="absolute top-2.5 left-2.5 bg-black/85 backdrop-blur-sm text-yellow-400 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md z-10 border border-yellow-400/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-ping shrink-0" />
                      {t('Original Model', 'Modelo Original')}
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-3 flex items-center gap-2">
                    <div 
                      className="w-6 h-6 rounded-full border border-white/20 overflow-hidden shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onNavigateToProfile) onNavigateToProfile(item.user_id);
                      }}
                    >
                      <img
                        src={item.profiles?.avatar_url || ''}
                        alt="@username"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="text-[10px] font-extrabold text-white truncate drop-shadow">
                      @{item.profiles?.username || 'user'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioDetailsPage;
