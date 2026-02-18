
import React, { useState, useEffect } from 'react';
import { Post } from '../types';
import { ArrowLeft, Play, Music2, Share2, Grid, Bookmark, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface SoundDetailProps {
  post: Post;
  onBack: () => void;
  onUseSound: (post: Post) => void;
}

const SoundDetail: React.FC<SoundDetailProps> = ({ post, onBack, onUseSound }) => {
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [useCount, setUseCount] = useState(0);

  useEffect(() => {
    fetchRelatedPosts();
  }, [post.id]);

  const fetchRelatedPosts = async () => {
    try {
      // Buscar posts onde o sound_id é igual ao ID do post atual
      const { data, count } = await supabase
        .from('posts')
        .select('*', { count: 'exact' })
        .eq('sound_id', post.id)
        .order('views', { ascending: false });

      setRelatedPosts(data || []);
      setUseCount(count || 0);
    } catch (error) {
      console.error("Erro ao carregar dublagens:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-black flex flex-col overflow-y-auto no-scrollbar">
      {/* Header */}
      <header className="sticky top-0 p-4 flex items-center justify-between bg-black/90 backdrop-blur-md z-30 border-b border-zinc-900">
        <button onClick={onBack} className="p-2 text-white hover:bg-zinc-900 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <span className="font-black text-xs uppercase tracking-[0.2em] text-zinc-400">Som Original</span>
        <button className="p-2 text-white hover:bg-zinc-900 rounded-full transition-colors">
          <Share2 size={24} />
        </button>
      </header>

      {/* Sound Info Section */}
      <div className="p-6 flex flex-col items-center gap-6">
        <div className="relative group">
          <div className="w-40 h-40 bg-zinc-950 rounded-full border-[10px] border-zinc-900 flex items-center justify-center overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.2)] animate-[spin_8s_linear_infinite]">
             {post.profiles?.avatar_url ? (
               <img src={post.profiles.avatar_url} className="w-[65%] h-[65%] rounded-full object-cover border-2 border-zinc-800" />
             ) : (
               <div className="w-full h-full flex items-center justify-center">
                 <Music2 size={60} className="text-zinc-800" />
               </div>
             )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2 h-2 bg-zinc-800 rounded-full" />
          </div>
        </div>

        <div className="text-center flex flex-col items-center gap-2">
           <h2 className="text-2xl font-black italic text-white leading-tight">Som Original - @{post.profiles?.username}</h2>
           <div className="flex items-center gap-1 text-blue-500">
             <CheckCircle2 size={16} fill="currentColor" className="text-blue-500 fill-blue-500/10" />
             <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Verificado</span>
           </div>
           <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">
             {useCount > 0 ? `${useCount} vídeos criados com este mambo` : 'Sê o primeiro a dublar este mambo!'}
           </p>
        </div>

        <div className="flex gap-4 w-full">
           <button className="flex-1 bg-zinc-900 border border-zinc-800 py-4 rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-all">
             <Bookmark size={18} />
             Favoritar
           </button>
        </div>
      </div>

      {/* Grid Tabs */}
      <div className="flex border-b border-zinc-900">
        <button className="flex-1 flex justify-center py-4 border-b-2 border-white text-white">
          <Grid size={20} />
        </button>
      </div>

      {/* Related Posts Grid */}
      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {relatedPosts.map(p => (
          <div key={p.id} className="aspect-[3/4] bg-zinc-900 relative group overflow-hidden cursor-pointer">
            {p.media_type === 'video' ? (
              <video src={p.media_url} className="w-full h-full object-cover" muted playsInline poster={p.thumbnail_url || undefined} />
            ) : (
              <img src={p.media_url} className="w-full h-full object-cover" />
            )}
            <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[9px] font-black text-white drop-shadow-md">
              <Play size={8} fill="white" /> {p.views > 1000 ? `${(p.views / 1000).toFixed(1)}k` : p.views}
            </div>
          </div>
        ))}
      </div>

      {relatedPosts.length === 0 && !loading && (
        <div className="py-20 flex flex-col items-center opacity-20 italic">
          <Music2 size={40} className="mb-2" />
          <p className="text-xs font-black uppercase tracking-widest">Nenhuma dublagem ainda</p>
        </div>
      )}

      {/* Sticky Call to Action */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-[280px] z-50">
        <button 
          onClick={() => onUseSound(post)}
          className="w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-full flex items-center justify-center gap-3 font-black uppercase tracking-[0.2em] text-[10px] shadow-[0_10px_40px_rgba(220,38,38,0.5)] active:scale-95 transition-all animate-bounce"
        >
          <Music2 size={18} />
          Usar este Som
        </button>
      </div>

      {loading && (
        <div className="p-12 flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">A Carregar</span>
        </div>
      )}
    </div>
  );
};

export default SoundDetail;
