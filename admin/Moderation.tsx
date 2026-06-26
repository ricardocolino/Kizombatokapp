import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  ShieldAlert, AlertTriangle, Trash2, CheckCircle, RefreshCw, 
  Loader2, ExternalLink, User, MessageSquare, Music, Image as ImageIcon
} from 'lucide-react';

interface ReportItem {
  id: string;
  post_id: string;
  reason: string;
  created_at?: string;
  reporter_id?: string;
  post_content?: string;
  post_audio_url?: string;
  post_photo_url?: string;
  author_id?: string;
  author_username?: string;
  author_avatar?: string;
}

export const AdminModeration: React.FC = () => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sqlMissing, setSqlMissing] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_reports');

      if (!rpcError && rpcData) {
        setReports(rpcData as ReportItem[]);
        setSqlMissing(false);
      } else {
        setSqlMissing(true);
        // Fallback direto via Supabase client
        const { data, error } = await supabase
          .from('reports')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setReports(data || []);
      }
    } catch (err: any) {
      console.error('Erro ao buscar denúncias:', err);
      setNotice('Erro ao carregar denúncias. Verifique as permissões SQL no Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDeletePost = async (report: ReportItem) => {
    if (!window.confirm(`Tem a certeza que deseja APAGAR este post do utilizador @${report.author_username || 'desconhecido'}? Esta ação é irreversível.`)) {
      return;
    }

    setActionLoading(report.id);
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_reported_post', {
        target_post_id: report.post_id
      });

      if (rpcError) {
        // Fallback
        await supabase.from('posts').delete().eq('id', report.post_id);
        await supabase.from('reports').delete().eq('post_id', report.post_id);
      }

      setReports(prev => prev.filter(r => r.post_id !== report.post_id));
      setNotice('Post removido e denúncias associadas encerradas com sucesso.');
    } catch (err: any) {
      console.error('Erro ao apagar post denunciado:', err);
      alert('Não foi possível remover o post. Execute o script admin_moderation.sql no Supabase.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDismissReport = async (report: ReportItem) => {
    setActionLoading(report.id);
    try {
      const { error: rpcError } = await supabase.rpc('admin_dismiss_report', {
        report_id: report.id
      });

      if (rpcError) {
        await supabase.from('reports').delete().eq('id', report.id);
      }

      setReports(prev => prev.filter(r => r.id !== report.id));
      setNotice('Denúncia dispensada/ignorada com sucesso.');
    } catch (err: any) {
      console.error('Erro ao dispensar denúncia:', err);
      alert('Erro ao fechar denúncia.');
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
            Moderação de Conteúdo e Denúncias
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Analise reportes de utilizadores e elimine publicações que violam os termos
          </p>
        </div>
        <button
          onClick={fetchReports}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-rose-600/20 active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recarregar Denúncias
        </button>
      </div>

      {sqlMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 text-amber-300 text-xs font-mono">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Aviso SQL Supabase:</span> A função RPC `admin_get_reports` ainda não está ativa. A trazer apenas IDs básicos via fallback. Execute o código do arquivo <code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-200">admin_moderation.sql</code> no Supabase para visualizar o texto, fotos e autores dos posts denunciados.
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
          <span className="text-zinc-500 text-sm font-mono animate-pulse">Carregando fila de moderação...</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 text-zinc-500 flex flex-col items-center gap-3">
          <CheckCircle className="w-12 h-12 text-emerald-500/40" />
          <div>
            <p className="text-base font-bold text-zinc-400">Fila de moderação vazia!</p>
            <p className="text-xs font-mono mt-1">Nenhuma publicação denunciada pendente de revisão no momento.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map(report => (
            <div key={report.id} className="bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-6 flex flex-col justify-between space-y-4 transition-all">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono text-xs font-bold rounded-lg uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Motivo: {report.reason}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                    Post ID: {report.post_id?.slice(0, 8)}...
                  </span>
                </div>

                {/* Info do Autor do Post */}
                <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 flex items-center gap-3">
                  <img 
                    src={report.author_avatar || `https://api.dicebear.com/7.x/avatars/svg?seed=${report.author_username || 'user'}`}
                    alt="Autor"
                    className="w-9 h-9 rounded-full object-cover bg-zinc-800 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">
                      {report.author_username ? `@${report.author_username}` : 'Autor Desconhecido'}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">Autor da publicação denunciada</div>
                  </div>
                </div>

                {/* Conteúdo do Post */}
                <div className="space-y-2 bg-zinc-800/20 p-4 rounded-xl border border-zinc-800/50 text-sm text-zinc-300">
                  {report.post_content && (
                    <p className="leading-relaxed break-words">{report.post_content}</p>
                  )}

                  {report.post_photo_url && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-zinc-700 max-h-48 flex items-center justify-center bg-black">
                      <img src={report.post_photo_url} alt="Conteúdo denunciado" className="max-h-48 w-auto object-contain" />
                    </div>
                  )}

                  {report.post_audio_url && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-purple-400 bg-purple-500/10 p-2.5 rounded-lg border border-purple-500/20 font-mono">
                      <Music className="w-4 h-4 shrink-0" />
                      <span>Mensagem de voz anexada</span>
                    </div>
                  )}

                  {!report.post_content && !report.post_photo_url && !report.post_audio_url && (
                    <span className="text-xs text-zinc-500 italic">Conteúdo textual não disponível (possível story ou post já excluído).</span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
                <button
                  onClick={() => handleDismissReport(report)}
                  disabled={actionLoading === report.id}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all"
                >
                  {actionLoading === report.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Dispensar Denúncia'}
                </button>

                <button
                  onClick={() => handleDeletePost(report)}
                  disabled={actionLoading === report.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-rose-600/10"
                >
                  {actionLoading === report.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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
