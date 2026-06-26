import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { parseMediaUrl } from '../services/mediaUtils';
import { 
  ShieldAlert, AlertTriangle, Trash2, CheckCircle, RefreshCw, 
  Loader2, ExternalLink, User, MessageSquare, Music, Image as ImageIcon,
  Eye, Video, X
} from 'lucide-react';

interface PostItem {
  id: string;
  content?: string;
  media_url?: string;
  media_type?: string;
  thumbnail_url?: string;
  audio_url?: string;
  created_at?: string;
  user_id?: string;
  author_username?: string;
  author_avatar?: string;
  report_reason?: string;
}

export const AdminModeration: React.FC = () => {
  const [postsList, setPostsList] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sqlMissing, setSqlMissing] = useState(false);
  const [selectedMediaPost, setSelectedMediaPost] = useState<PostItem | null>(null);

  const fetchPosts = async (reset = true) => {
    if (reset) {
      setLoading(true);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    setNotice(null);

    try {
      const fromIndex = reset ? 0 : postsList.length;
      const toIndex = fromIndex + 9; // Mantendo os 10 itens configurados antes

      const { data: reportsData } = await supabase.from('reports').select('post_id, reason');
      const reportsMap = new Map<string, string>();
      if (reportsData) {
        reportsData.forEach((r: any) => {
          if (r.post_id) reportsMap.set(r.post_id, r.reason);
        });
      }

      let { data: rawPosts, error } = await supabase
        .from('posts')
        .select('*, profiles!user_id (*)')
        .or('is_seen_by_admin.is.null,is_seen_by_admin.eq.false')
        .order('created_at', { ascending: false })
        .range(fromIndex, toIndex);

      if (error && error.message?.includes('is_seen_by_admin')) {
        setSqlMissing(true);
        const fb = await supabase
          .from('posts')
          .select('*, profiles!user_id (*)')
          .order('created_at', { ascending: false })
          .range(fromIndex, toIndex);
        rawPosts = fb.data;
      } else if (error) {
        throw error;
      } else {
        setSqlMissing(false);
      }

      if (rawPosts && rawPosts.length > 0) {
        const formatted: PostItem[] = rawPosts.map((p: any) => ({
          id: p.id,
          content: p.content,
          media_url: parseMediaUrl(p.media_url),
          media_type: p.media_type,
          thumbnail_url: p.thumbnail_url ? parseMediaUrl(p.thumbnail_url) : undefined,
          audio_url: p.audio_url || p.mp3_url,
          created_at: p.created_at,
          user_id: p.user_id,
          author_username: p.profiles?.username || 'utilizador',
          author_avatar: p.profiles?.avatar_url,
          report_reason: reportsMap.get(p.id)
        }));

        if (rawPosts.length < 10) {
          setHasMore(false);
        }

        if (reset) {
          setPostsList(formatted);
        } else {
          setPostsList(prev => [...prev, ...formatted]);
        }
      } else {
        if (reset) setPostsList([]);
        setHasMore(false);
      }
    } catch (err: any) {
      console.error('Erro ao carregar publicações:', err);
      setNotice('Erro ao carregar publicações do servidor.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPosts(true);
  }, []);

  const handleMarkAsSeen = async (post: PostItem) => {
    setActionLoading(post.id);
    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_seen_by_admin: true })
        .eq('id', post.id);

      if (error && error.message?.includes('is_seen_by_admin')) {
        alert('A coluna "is_seen_by_admin" ainda não existe na sua base de dados. Execute o SQL fornecido!');
        return;
      }

      setPostsList(prev => prev.filter(p => p.id !== post.id));
      setNotice('Publicação marcada como vista.');
    } catch (err: any) {
      console.error('Erro ao marcar publicação como vista:', err);
      alert('Erro ao processar a ação.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePost = async (post: PostItem) => {
    if (!window.confirm(`Tem a certeza que deseja APAGAR este post do utilizador @${post.author_username || 'desconhecido'}? Esta ação é irreversível.`)) {
      return;
    }

    setActionLoading(post.id);
    try {
      await supabase.from('posts').delete().eq('id', post.id);
      await supabase.from('reports').delete().eq('post_id', post.id);

      setPostsList(prev => prev.filter(p => p.id !== post.id));
      setNotice('Publicação removida com sucesso.');
      if (selectedMediaPost?.id === post.id) {
        setSelectedMediaPost(null);
      }
    } catch (err: any) {
      console.error('Erro ao apagar post:', err);
      alert('Não foi possível remover o post.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6 text-white pb-20 contain-intrinsic-size">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <ShieldAlert className="w-7 h-7 text-rose-500" />
            Moderação de Conteúdo e Publicações
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Revisão geral de todas as publicações recentes (apresentando 10 por vez)
          </p>
        </div>
        <button
          onClick={() => fetchPosts(true)}
          disabled={loading || loadingMore}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-rose-600/20 active:scale-95 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recarregar Publicações
        </button>
      </div>

      {sqlMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 text-amber-300 text-xs font-mono">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Aviso SQL Supabase:</span> A coluna `is_seen_by_admin` ainda não foi adicionada à tabela de publicações (`posts`). Execute o código SQL fornecido no Supabase para ativar a filtragem de posts vistos.
          </div>
        </div>
      )}

      {notice && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl flex items-center justify-between text-rose-300 text-smSub">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline text-rose-400">Fechar</button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
          <span className="text-zinc-500 text-sm font-mono animate-pulse">Carregando primeiras 10 publicações...</span>
        </div>
      ) : postsList.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 text-zinc-500 flex flex-col items-center gap-3">
          <CheckCircle className="w-12 h-12 text-emerald-500/40" />
          <div>
            <p className="text-base font-bold text-zinc-400">Tudo limpo!</p>
            <p className="text-xs font-mono mt-1">Todas as publicações recentes já foram revistas por si.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Adicionado grid-auto-rows para estabilizar altura inicial e conter quebras visuais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr">
            {postsList.map(post => (
              <div 
                key={post.id} 
                className="bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-6 flex flex-col justify-between space-y-4 transition-colors overflow-hidden h-full will-change-transform"
              >
                <div className="space-y-4 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {post.report_reason ? (
                        <span className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono text-xs font-bold rounded-lg uppercase tracking-wider flex items-center gap-1.5 truncate">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Denúncia: {post.report_reason}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono text-xs font-medium rounded-lg flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 shrink-0" /> Publicação da Comunidade
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                      ID: {post.id?.slice(0, 8)}...
                    </span>
                  </div>

                  {/* Info do Autor do Post */}
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 flex items-center gap-3">
                    <img 
                      src={post.author_avatar || `https://api.dicebear.com/7.x/avatars/svg?seed=${post.author_username || 'user'}`}
                      alt="Autor"
                      className="w-9 h-9 rounded-full object-cover bg-zinc-800 shrink-0"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">
                        {post.author_username ? `@${post.author_username}` : 'Autor Desconhecido'}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Postado em {post.created_at ? new Date(post.created_at).toLocaleString('pt-PT') : 'Data desconhecida'}
                      </div>
                    </div>
                  </div>

                  {/* Conteúdo do Post */}
                  <div className="space-y-2 bg-zinc-800/20 p-4 rounded-xl border border-zinc-800/50 text-sm text-zinc-300 min-w-0">
                    {post.content && (
                      <p className="leading-relaxed break-words line-clamp-4 whitespace-pre-wrap">{post.content}</p>
                    )}

                    {post.media_url && (
                      /* Correção do bug de scroll: Forçando tamanho de aspecto fixo para evitar saltos de layout (Layout Shift) */
                      <div className="mt-2 rounded-lg overflow-hidden border border-zinc-700 h-40 w-full flex items-center justify-center bg-black relative aspect-video shrink-0">
                        {post.media_type === 'video' || post.media_url.match(/\.(mp4|webm|mov|ogg)$/i) ? (
                          <video src={post.media_url} className="h-full w-full object-cover opacity-80" muted preload="metadata" />
                        ) : (
                          <img src={post.media_url} alt="Conteúdo da publicação" className="h-full w-full object-cover opacity-80" loading="lazy" />
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono z-10">Pré-visualização</span>
                      </div>
                    )}

                    {post.audio_url && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-purple-400 bg-purple-500/10 p-2.5 rounded-lg border border-purple-500/20 font-mono shrink-0">
                        <Music className="w-4 h-4 shrink-0" />
                        <span className="truncate">Mensagem de voz anexada</span>
                      </div>
                    )}

                    {!post.content && !post.media_url && !post.audio_url && (
                      <span className="text-xs text-zinc-500 italic block">Conteúdo textual não disponível.</span>
                    )}
                  </div>
                </div>

                {/* Seção de Botões */}
                <div className="space-y-2 pt-2 border-t border-zinc-800/80 shrink-0">
                  <button
                    onClick={() => setSelectedMediaPost(post)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                  >
                    <Video className="w-4 h-4 text-indigo-400" />
                    Ver vídeo ou imagem
                  </button>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => handleMarkAsSeen(post)}
                      disabled={actionLoading === post.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-emerald-600/10"
                    >
                      {actionLoading === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                      Visto
                    </button>

                    <button
                      onClick={() => handleDeletePost(post)}
                      disabled={actionLoading === post.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-rose-600/10"
                    >
                      {actionLoading === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Botão Ver mais */}
          {hasMore && (
            <div className="flex justify-center pt-6">
              <button
                onClick={() => fetchPosts(false)}
                disabled={loadingMore}
                className="flex items-center gap-3 px-8 py-3.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold text-sm rounded-2xl border border-zinc-700 shadow-xl transition-all active:scale-95 hover:border-zinc-500"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                    <span>Carregando mais 10 publicações...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5 text-rose-500" />
                    <span>Ver mais publicações</span>
                    <span className="text-xs font-mono bg-zinc-900 px-2 py-0.5 rounded text-zinc-400">+{postsList.length} carregadas</span>
                  </>
                )}
              </button>
            </div>
          )}

          {!hasMore && postsList.length > 0 && (
            <div className="text-center py-6 text-zinc-500 text-xs font-mono border-t border-zinc-800">
              Fim da fila — Não há mais publicações recentes para mostrar.
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {selectedMediaPost && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src={selectedMediaPost.author_avatar || `https://api.dicebear.com/7.x/avatars/svg?seed=${selectedMediaPost.author_username || 'user'}`}
                  alt="Autor"
                  className="w-8 h-8 rounded-full object-cover bg-zinc-800"
                />
                <div>
                  <h4 className="text-sm font-bold text-white">@{selectedMediaPost.author_username}</h4>
                  <p className="text-[10px] text-zinc-500 font-mono">Visualizador de Mídia e Conteúdo</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedMediaPost(null)}
                className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 flex flex-col items-center justify-center">
              {selectedMediaPost.media_url ? (
                <div className="w-full flex flex-col items-center gap-3">
                  {selectedMediaPost.media_type === 'video' || selectedMediaPost.media_url.match(/\.(mp4|webm|mov|ogg)$/i) ? (
                    <video 
                      src={selectedMediaPost.media_url} 
                      controls 
                      autoPlay 
                      className="max-h-[60vh] w-auto rounded-2xl border border-zinc-700 bg-black shadow-lg" 
                    />
                  ) : (
                    <img 
                      src={selectedMediaPost.media_url} 
                      alt="Mídia da publicação" 
                      className="max-h-[60vh] w-auto rounded-2xl border border-zinc-700 bg-black object-contain shadow-lg" 
                    />
                  )}
                  <a 
                    href={selectedMediaPost.media_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-mono"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir mídia original em nova aba
                  </a>
                </div>
              ) : selectedMediaPost.audio_url ? (
                <div className="w-full bg-zinc-800/60 p-6 rounded-2xl border border-zinc-700 flex flex-col items-center gap-4 max-w-md">
                  <Music className="w-12 h-12 text-purple-400" />
                  <p className="text-sm font-bold text-white">Mensagem de Voz</p>
                  <audio src={selectedMediaPost.audio_url} controls autoPlay className="w-full" />
                </div>
              ) : (
                <div className="py-12 text-center text-zinc-500 space-y-2">
                  <ImageIcon className="w-12 h-12 mx-auto opacity-30" />
                  <p className="text-sm font-medium">Esta publicação não possui ficheiros de vídeo ou imagem anexados.</p>
                  <p className="text-xs font-mono">Apenas conteúdo de texto abaixo.</p>
                </div>
              )}

              {selectedMediaPost.content && (
                <div className="w-full bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-zinc-200 text-sm break-words">
                  <p className="text-xs text-zinc-500 font-mono mb-2 uppercase tracking-wider">Texto da Publicação:</p>
                  <p className="leading-relaxed whitespace-pre-wrap">{selectedMediaPost.content}</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => handleDeletePost(selectedMediaPost!)}
                className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar Publicação
              </button>
              <button
                onClick={() => setSelectedMediaPost(null)}
                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminModeration;
