import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  ShieldAlert, AlertTriangle, Trash2, CheckCircle, RefreshCw, 
  Loader2, ExternalLink, User, MessageSquare, Music, Image as ImageIcon,
  Eye
} from 'lucide-react';

interface PostItem {
  id: string;
  content?: string;
  audio_url?: string;
  photo_url?: string;
  created_at?: string;
  user_id?: string;
  author_username?: string;
  author_avatar?: string;
  report_reason?: string;
}

export const AdminModeration: React.FC = () => {
  const [postsList, setPostsList] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sqlMissing, setSqlMissing] = useState(false);

  const fetchAllPosts = async () => {
    setLoading(true);
    setNotice(null);
    try {
      // 1. Buscar denúncias em paralelo para associar o motivo caso o post esteja denunciado
      const { data: reportsData } = await supabase.from('reports').select('post_id, reason');
      const reportsMap = new Map<string, string>();
      if (reportsData) {
        reportsData.forEach((r: any) => {
          if (r.post_id) reportsMap.set(r.post_id, r.reason);
        });
      }

      // 2. Buscar todas as publicações não marcadas como vistas
      let { data: rawPosts, error } = await supabase
        .from('posts')
        .select('*, profiles!user_id (*)')
        .or('is_seen_by_admin.is.null,is_seen_by_admin.eq.false')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error && error.message?.includes('is_seen_by_admin')) {
        setSqlMissing(true);
        // Fallback caso a coluna ainda não tenha sido criada no banco
        const fb = await supabase
          .from('posts')
          .select('*, profiles!user_id (*)')
          .order('created_at', { ascending: false })
          .limit(50);
        rawPosts = fb.data;
      } else if (error) {
        throw error;
      } else {
        setSqlMissing(false);
      }

      if (rawPosts) {
        const formatted: PostItem[] = rawPosts.map((p: any) => ({
          id: p.id,
          content: p.content,
          audio_url: p.audio_url,
          photo_url: p.photo_url,
          created_at: p.created_at,
          user_id: p.user_id,
          author_username: p.profiles?.username || 'utilizador',
          author_avatar: p.profiles?.avatar_url,
          report_reason: reportsMap.get(p.id)
        }));
        setPostsList(formatted);
      } else {
        setPostsList([]);
      }
    } catch (err: any) {
      console.error('Erro ao carregar publicações:', err);
      setNotice('Erro ao carregar publicações do servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllPosts();
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
    } catch (err: any) {
      console.error('Erro ao apagar post:', err);
      alert('Não foi possível remover o post.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300 text-white">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <ShieldAlert className="w-7 h-7 text-rose-500" />
            Moderação de Conteúdo e Publicações
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Revisão geral de todas as publicações recentes da comunidade e denúncias
          </p>
        </div>
        <button
          onClick={fetchAllPosts}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-rose-600/20 active:scale-95"
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
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl flex items-center justify-between text-rose-300 text-sm">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline text-rose-400">Fechar</button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
          <span className="text-zinc-500 text-sm font-mono animate-pulse">Carregando todas as publicações...</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {postsList.map(post => (
            <div key={post.id} className="bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-6 flex flex-col justify-between space-y-4 transition-all">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {post.report_reason ? (
                      <span className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono text-xs font-bold rounded-lg uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Denúncia: {post.report_reason}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono text-xs font-medium rounded-lg flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" /> Publicação da Comunidade
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
                <div className="space-y-2 bg-zinc-800/20 p-4 rounded-xl border border-zinc-800/50 text-sm text-zinc-300">
                  {post.content && (
                    <p className="leading-relaxed break-words">{post.content}</p>
                  )}

                  {post.photo_url && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-zinc-700 max-h-48 flex items-center justify-center bg-black">
                      <img src={post.photo_url} alt="Conteúdo da publicação" className="max-h-48 w-auto object-contain" />
                    </div>
                  )}

                  {post.audio_url && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-purple-400 bg-purple-500/10 p-2.5 rounded-lg border border-purple-500/20 font-mono">
                      <Music className="w-4 h-4 shrink-0" />
                      <span>Mensagem de voz anexada</span>
                    </div>
                  )}

                  {!post.content && !post.photo_url && !post.audio_url && (
                    <span className="text-xs text-zinc-500 italic">Conteúdo textual não disponível.</span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
                <button
                  onClick={() => handleMarkAsSeen(post)}
                  disabled={actionLoading === post.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-emerald-600/10"
                >
                  {actionLoading === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  Visto (Ocultar)
                </button>

                <button
                  onClick={() => handleDeletePost(post)}
                  disabled={actionLoading === post.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-rose-600/10"
                >
                  {actionLoading === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Eliminar Publicação
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminModeration;

