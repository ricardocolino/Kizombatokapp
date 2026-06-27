import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Music, Trash2, RefreshCw, Loader2, Search, User, 
  AlertCircle, CheckCircle, Disc, Cloud, Database, AlertTriangle
} from 'lucide-react';

interface SongPost {
  id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  mp3_url: string | null;
  mp3_r2_url: string | null;
  is_seen_music_admin?: boolean | null;
  created_at: string;
  user_id: string;
  profiles?: {
    username: string;
    name: string | null;
    avatar_url: string | null;
  };
}

export const AdminSongsManager: React.FC = () => {
  const [songsList, setSongsList] = useState<SongPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'r2' | 'supabase'>('all');
  const [sqlMissing, setSqlMissing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);

  const fetchSongs = async () => {
    setLoading(true);
    setNotice(null);
    setSqlMissing(false);

    try {
      let { data, error } = await supabase
        .from('posts')
        .select('id, content, media_url, media_type, mp3_url, mp3_r2_url, is_seen_music_admin, created_at, user_id, profiles!user_id (*)')
        .or('mp3_url.not.is.null,mp3_r2_url.not.is.null')
        .or('is_seen_music_admin.is.null,is_seen_music_admin.eq.false')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error && error.message?.includes('is_seen_music_admin')) {
        setSqlMissing(true);
        // Fallback caso a coluna ainda não exista
        const fb = await supabase
          .from('posts')
          .select('id, content, media_url, media_type, mp3_url, mp3_r2_url, created_at, user_id, profiles!user_id (*)')
          .or('mp3_url.not.is.null,mp3_r2_url.not.is.null')
          .order('created_at', { ascending: false })
          .limit(200);
        
        if (fb.error) {
          const fb2 = await supabase
            .from('posts')
            .select('id, content, media_url, media_type, mp3_url, mp3_r2_url, created_at, user_id, profiles!user_id (*)')
            .order('created_at', { ascending: false })
            .limit(300);
          if (fb2.error) throw fb2.error;
          data = fb2.data;
        } else {
          data = fb.data;
        }
      } else if (error) {
        // Fallback caso dê erro na sintaxe do OR
        const fb = await supabase
          .from('posts')
          .select('id, content, media_url, media_type, mp3_url, mp3_r2_url, created_at, user_id, profiles!user_id (*)')
          .order('created_at', { ascending: false })
          .limit(300);
        
        if (fb.error) throw fb.error;
        data = fb.data;
      }

      const validSongs = (data || []).filter((p: any) => Boolean(p.mp3_url) || Boolean(p.mp3_r2_url));
      setSongsList(validSongs);
    } catch (err: any) {
      console.error('Erro ao buscar músicas:', err);
      setNotice({ type: 'error', text: 'Erro ao carregar a lista de músicas do servidor.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  const handleMarkAsSeen = async (postId: string) => {
    setActionLoading(postId);
    setNotice(null);

    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_seen_music_admin: true })
        .eq('id', postId);

      if (error && error.message?.includes('is_seen_music_admin')) {
        alert('A coluna "is_seen_music_admin" ainda não existe na sua base de dados. Execute o SQL fornecido!');
        return;
      }

      setNotice({ type: 'success', text: 'Música marcada como vista e ocultada dos pendentes!' });
      setSongsList(prev => prev.filter(s => s.id !== postId));
    } catch (err: any) {
      console.error('Erro ao marcar música como vista:', err);
      setNotice({ type: 'error', text: 'Erro ao marcar música como vista.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteMusic = async (postId: string) => {
    setActionLoading(postId);
    setNotice(null);

    try {
      // Tentar usar RPC seguro (contorna RLS) com fallback para update padrão
      const { error: rpcError } = await supabase.rpc('admin_remove_post_song', {
        target_post_id: postId
      });

      if (rpcError) {
        // Fallback caso a função RPC ainda não tenha sido criada no SQL
        const { error: updateError } = await supabase
          .from('posts')
          .update({ mp3_url: null, mp3_r2_url: null })
          .eq('id', postId);

        if (updateError) throw updateError;
      }

      setNotice({ 
        type: 'success', 
        text: 'Música eliminada com sucesso! A publicação e seus comentários/curtidas foram mantidos sem o áudio.' 
      });
      setSongsList(prev => prev.filter(s => s.id !== postId));
    } catch (err: any) {
      console.error('Erro ao eliminar música:', err);
      setNotice({ 
        type: 'error', 
        text: `Erro ao eliminar música: ${err.message || 'Falha na operação no banco de dados.'}` 
      });
    } finally {
      setActionLoading(null);
      setConfirmDeleteId(null);
    }
  };

  // Filtragem local por busca e tipo de armazenamento
  const filteredSongs = songsList.filter(song => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      (song.content && song.content.toLowerCase().includes(query)) ||
      (song.profiles?.username && song.profiles.username.toLowerCase().includes(query)) ||
      (song.profiles?.name && song.profiles.name.toLowerCase().includes(query)) ||
      song.id.toLowerCase().includes(query);

    let matchesFilter = true;
    if (filterType === 'r2') {
      matchesFilter = Boolean(song.mp3_r2_url);
    } else if (filterType === 'supabase') {
      matchesFilter = Boolean(song.mp3_url) && !song.mp3_r2_url;
    }

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Info */}
      <div className="bg-zinc-900/60 border border-zinc-800 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-pink-600/20 text-pink-400 border border-pink-500/30 rounded-2xl shadow-lg shadow-pink-600/10">
            <Disc className="w-7 h-7 animate-spin-slow" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              Gestão de Músicas e Áudios
              <span className="text-xs px-2.5 py-0.5 bg-pink-500/20 text-pink-300 font-mono rounded-full border border-pink-500/30">
                {songsList.length} áudios
              </span>
            </h3>
            <p className="text-xs text-zinc-400 max-w-xl mt-1 leading-relaxed">
              Controlo geral de todas as músicas anexadas às publicações. Ao clicar em <strong className="text-rose-400">Eliminar Música</strong>, o sistema limpa estritamente as colunas <code className="text-pink-300 bg-zinc-800 px-1 rounded">mp3_url</code> e <code className="text-pink-300 bg-zinc-800 px-1 rounded">mp3_r2_url</code>, preservando a publicação original.
            </p>
          </div>
        </div>

        <button
          onClick={fetchSongs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 border border-zinc-700/80 rounded-xl text-xs font-bold transition-all shrink-0 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-400' : ''}`} />
          Atualizar Lista
        </button>
      </div>

      {/* SQL Missing Alert */}
      {sqlMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 text-amber-300 text-xs font-mono animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Aviso SQL Supabase:</span> A coluna `is_seen_music_admin` ainda não foi adicionada à tabela de publicações (`posts`). Execute o código SQL fornecido no Supabase para ativar a marcação de músicas vistas.
          </div>
        </div>
      )}

      {/* Notice Alert */}
      {notice && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm animate-fade-in ${
          notice.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {notice.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="font-medium">{notice.text}</span>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800/80">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por legenda, @usuário ou ID do post..."
            className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-pink-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800/80">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'all' ? 'bg-pink-600 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Todos ({songsList.length})
          </button>
          <button
            onClick={() => setFilterType('r2')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterType === 'r2' ? 'bg-pink-600 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            R2 Cloud ({songsList.filter(s => Boolean(s.mp3_r2_url)).length})
          </button>
          <button
            onClick={() => setFilterType('supabase')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterType === 'supabase' ? 'bg-pink-600 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Supabase ({songsList.filter(s => Boolean(s.mp3_url) && !s.mp3_r2_url).length})
          </button>
        </div>
      </div>

      {/* Grid of Songs */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-500">
          <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
          <p className="text-xs font-mono">Carregando músicas e áudios...</p>
        </div>
      ) : filteredSongs.length === 0 ? (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500 max-w-lg mx-auto">
          <Music className="w-12 h-12 mx-auto mb-3 text-zinc-600 stroke-[1.5]" />
          <p className="text-sm font-bold text-zinc-300">Nenhuma música encontrada</p>
          <p className="text-xs mt-1">
            {searchQuery ? 'Tente ajustar os termos da sua busca.' : 'Nenhuma publicação com áudio anexado foi encontrada no banco de dados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSongs.slice(0, visibleCount).map((song) => {
              const authorName = song.profiles?.name || song.profiles?.username || 'Usuário';
            const authorUser = song.profiles?.username ? `@${song.profiles.username}` : song.user_id.slice(0, 8);
            const audioSrc = song.mp3_r2_url || song.mp3_url || '';
            const isR2 = Boolean(song.mp3_r2_url);

            return (
              <div 
                key={song.id} 
                className="bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-5 flex flex-col justify-between transition-all group"
              >
                <div>
                  {/* Card Header: Author & Storage */}
                  <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-zinc-800/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {song.profiles?.avatar_url ? (
                        <img 
                          src={song.profiles.avatar_url} 
                          alt={authorUser} 
                          className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0" 
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0 border border-zinc-700">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{authorName}</p>
                        <p className="text-[10px] font-mono text-zinc-400 truncate">{authorUser}</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border shrink-0 flex items-center gap-1 ${
                      isR2 
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' 
                        : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                    }`}>
                      {isR2 ? <Cloud className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
                      {isR2 ? 'R2 Storage' : 'Supabase'}
                    </span>
                  </div>

                  {/* Post Content */}
                  <div className="mb-4">
                    <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed break-words font-sans">
                      {song.content || <span className="text-zinc-500 italic">Legenda vazia (post apenas de áudio/mídia)</span>}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-500 mt-2">
                      Publicado em: {new Date(song.created_at).toLocaleDateString('pt-BR')} às {new Date(song.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Audio Preview */}
                  {audioSrc && (
                    <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80 mb-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 mb-2 truncate">
                        <Music className="w-3 h-3 text-pink-400 shrink-0 animate-pulse" />
                        <span className="truncate">{audioSrc}</span>
                      </div>
                      <audio 
                        controls 
                        src={audioSrc} 
                        className="w-full h-8 accent-pink-500" 
                      />
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div>
                  {confirmDeleteId === song.id ? (
                    <div className="pt-3 border-t border-zinc-800 bg-rose-500/10 p-3 rounded-xl space-y-2.5 animate-fade-in">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                        <Trash2 className="w-3.5 h-3.5 shrink-0 animate-bounce" />
                        <span>Confirmar exclusão apenas do áudio?</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteMusic(song.id)}
                          disabled={actionLoading === song.id}
                          className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-md shadow-rose-600/20"
                        >
                          {actionLoading === song.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Sim, eliminar
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={actionLoading === song.id}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80 mt-2 gap-2">
                      <span className="text-[10px] font-mono text-zinc-600 uppercase truncate" title={song.id}>
                        ID: {song.id.slice(0, 6)}..
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleMarkAsSeen(song.id)}
                          disabled={actionLoading === song.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 rounded-xl text-xs font-bold transition-all active:scale-95"
                          title="Marcar música como vista e ocultar dos pendentes"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Música Vista
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(song.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 group-hover:border-rose-500/50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>

          {visibleCount < filteredSongs.length && (
            <div className="flex justify-center pt-2 pb-6">
              <button
                onClick={() => setVisibleCount(prev => prev + 5)}
                className="px-6 py-3 bg-zinc-800 hover:bg-pink-600 active:scale-95 text-zinc-200 hover:text-white font-bold text-xs rounded-xl border border-zinc-700/80 hover:border-pink-500 shadow-lg transition-all flex items-center gap-2"
              >
                Mostrar mais 5 áudios ({filteredSongs.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminSongsManager;
