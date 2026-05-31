import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Post } from '../types';
import { ArrowLeft, Loader2, Music } from 'lucide-react';

interface AudioDetailsPageProps {
  postId: string;
  onBack: () => void;
  onDub?: (mp3Url: string, originalPostId: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToPost?: (postId: string) => void;
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
      <div className="h-full flex flex-col items-center justify-center bg-black text-white p-6">
        <Loader2 className="animate-spin text-purple-600 mb-2" size={32} />
        <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
          {t('Loading sound database', 'Carregando banco de áudio')}...
        </p>
      </div>
    );
  }

  if (!post || !originalPost) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-white p-6 text-center">
        <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4 text-purple-500 border border-zinc-800">
          <Music size={28} />
        </div>
        <h3 className="text-lg font-black">{t('Sound not found', 'Som não encontrado')}</h3>
        <p className="text-zinc-400 text-xs mt-2 max-w-xs">
          {t('The audio track or original post is no longer available.', 'A faixa de áudio ou o post original não está mais disponível.')}
        </p>
        <button
          onClick={onBack}
          className="mt-6 px-6 py-2.5 bg-zinc-800 text-white rounded-full font-bold text-xs uppercase tracking-wider hover:bg-zinc-700 transition"
        >
          {t('Go back', 'Voltar')}
        </button>
      </div>
    );
  }

  const audioCreatorName = originalPost.profiles?.name || originalPost.profiles?.username || 'user';
  const audioCreatorUsername = originalPost.profiles?.username || 'user';

  return (
    <div className="h-full flex flex-col bg-black text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="h-[56px] px-4 flex items-center justify-between border-b border-white/5 shrink-0 bg-zinc-950/40 backdrop-blur">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-300 hover:bg-zinc-800 active:scale-95 transition-all outline-none"
          id="btn-audio-back"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-sm font-black uppercase tracking-wider text-white">
          {t('Audio details', 'Detalhes do Áudio')}
        </h2>
        <div className="w-10" /> {/* Spacer */}
      </header>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-24 no-scrollbar">
        {/* Core Info Banner */}
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 p-5 rounded-[2.5rem] flex flex-col md:flex-row items-center md:items-start gap-5 shadow-2xl">
          <div className="w-[96px] h-[96px] rounded-3xl bg-zinc-800 border-2 border-white/10 relative shadow-xl overflow-hidden shrink-0 group">
            {originalPost.profiles?.avatar_url ? (
              <img
                src={originalPost.profiles.avatar_url}
                alt="Audio Creator"
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-purple-900/30 text-purple-400 flex items-center justify-center">
                <Music size={40} />
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 bg-purple-600 border border-black p-1.5 rounded-full shadow-lg">
              <Music size={12} className="text-white fill-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0 text-center md:text-left flex flex-col items-center md:items-start">
            <h3 className="font-black text-lg sm:text-xl text-white tracking-tight leading-tight">
              {t('Original Sound', 'Som Original')}
            </h3>
            <span className="text-[11px] font-black uppercase tracking-widest text-purple-400 mt-0.5">
              by {audioCreatorName}
            </span>
            
            <p
              onClick={() => onNavigateToProfile && onNavigateToProfile(originalPost.user_id)}
              className="text-xs font-semibold text-zinc-400 mt-2 hover:text-white hover:underline cursor-pointer transition-colors"
            >
              @{audioCreatorUsername}
            </p>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-950/60 border border-purple-800/50 rounded-full mt-4 self-center md:self-start">
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                {audioDubs.length} {audioDubs.length === 1 ? t('video created', 'vídeo criado') : t('videos created', 'vídeos criados')}
              </span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {originalPost.mp3_url && onDub && (
          <button
            onClick={() => onDub(originalPost.mp3_url!, originalPost.id)}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-[0.98] text-white rounded-[1.75rem] text-sm font-black uppercase tracking-widest hover:shadow-lg hover:shadow-purple-500/20 shadow-md flex items-center justify-center gap-2.5 transition-all outline-none"
            id="btn-dub-page-action"
          >
            <Music size={16} className="text-white fill-white" />
            {t('Dub with this audio', 'Dublar com este Áudio')}
          </button>
        )}

        {/* Grid/Feed Section of Dubbed Videos */}
        <div className="flex flex-col space-y-4 pt-2">
          <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
            {t('Dubs collection', 'Galeria de Dublagens')}
          </h4>

          {loadingDubs ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="animate-spin text-purple-600" size={24} />
              <p className="text-[10px] font-black text-zinc-650 tracking-wider uppercase">{t('Filtering list')}</p>
            </div>
          ) : audioDubs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-zinc-800 rounded-[2rem] text-center p-6 bg-zinc-950/20">
              <p className="text-xs font-semibold text-zinc-500 max-w-xs">
                {t('No videos yet. Tap above to be the first to dub this audio!', 'Sem vídeos ainda. Toque acima para ser o primeiro a dublar!')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {audioDubs.map((dub) => (
                <div
                  key={dub.id}
                  onClick={() => onNavigateToPost && onNavigateToPost(dub.id)}
                  className="aspect-[9/16] relative bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden group shadow-md hover:border-zinc-750 transition-all cursor-pointer"
                >
                  <img
                    src={dub.thumbnail_url || dub.media_url || ''}
                    alt={dub.content || "Dub"}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  
                  {/* Hover Overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-3 flex items-center gap-2">
                    <div 
                      className="w-6 h-6 rounded-full border border-white/20 overflow-hidden shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onNavigateToProfile) onNavigateToProfile(dub.user_id);
                      }}
                    >
                      <img
                        src={dub.profiles?.avatar_url || ''}
                        alt="@username"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="text-[10px] font-extrabold text-white truncate drop-shadow">
                      @{dub.profiles?.username || 'user'}
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
