import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { parseMediaUrl } from '../services/mediaUtils';
import { 
  Radio, ShieldAlert, RefreshCw, Loader2, Users, Heart, Clock, 
  AlertTriangle, PowerOff, CheckCircle2, Video
} from 'lucide-react';

interface ActiveLive {
  id: string;
  title: string;
  host_id: string;
  status: string;
  viewer_count?: number;
  likes?: number;
  created_at?: string;
  host_username?: string;
  host_avatar?: string;
}

export const AdminLiveRooms: React.FC = () => {
  const [lives, setLives] = useState<ActiveLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchActiveLives = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const { data: rawList, error } = await supabase
        .from('lives')
        .select('*, profiles!host_id (username, avatar_url)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (rawList) {
        const formatted: ActiveLive[] = rawList.map((l: any) => ({
          id: l.id,
          title: l.title || 'Sem Título',
          host_id: l.host_id,
          status: l.status,
          viewer_count: l.viewer_count || 0,
          likes: l.likes || 0,
          created_at: l.created_at,
          host_username: l.profiles?.username || 'anfitrião',
          host_avatar: l.profiles?.avatar_url
        }));
        setLives(formatted);
      } else {
        setLives([]);
      }
    } catch (err: any) {
      console.error('Erro ao buscar salas de live:', err);
      setNotice('Erro ao carregar salas ao vivo ativas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveLives();

    // Subscrição em tempo real para atualizar o painel automaticamente
    const channel = supabase
      .channel('admin_active_lives')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lives' },
        () => {
          fetchActiveLives();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleShutdownLive = async (item: ActiveLive) => {
    if (!window.confirm(`ATENÇÃO: Deseja realmente encerrar forçadamente a transmissão ao vivo de @${item.host_username}? Todos os ouvintes serão desconectados imediatamente.`)) {
      return;
    }

    setActionLoading(item.id);
    try {
      const { error } = await supabase
        .from('lives')
        .update({ 
          status: 'ended', 
          ended_at: new Date().toISOString() 
        })
        .eq('id', item.id);

      if (error) {
        throw error;
      }

      // Remover da lista imediatamente
      setLives(prev => prev.filter(l => l.id !== item.id));
      setNotice(`Transmissão de @${item.host_username} encerrada com sucesso pela moderação.`);
    } catch (err: any) {
      console.error('Erro ao derrubar live:', err);
      alert('Não foi possível encerrar a live. Verifique se as políticas SQL (admin_lives.sql) foram aplicadas.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300 text-white pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Radio className="w-7 h-7 text-amber-500 animate-pulse" />
            Gestão de Salas ao Vivo (Real-Time)
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Painel monitorando transmissões de rádio e áudio ativas. Derrube lives que violem as regras da comunidade.
          </p>
        </div>
        <button
          onClick={fetchActiveLives}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-amber-600/20 active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Lista
        </button>
      </div>

      {notice && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-amber-300 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{notice}</span>
        </div>
      )}

      <div className="bg-zinc-900/30 border border-zinc-800/80 p-4 rounded-xl flex items-start gap-3 text-zinc-400 text-xs">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-zinc-300">Dica de Moderação:</span> Ao derrubar uma transmissão, o servidor altera o status para <code className="bg-black/50 px-1 py-0.5 rounded text-amber-300">ended</code>. Os clientes de todos os ouvintes e do anfitrião detectarão o encerramento via WebSocket e fecharão a sala automaticamente. Caso enfrente erro de permissão, execute <code className="bg-black/50 px-1 py-0.5 rounded text-amber-300">admin_lives.sql</code> no Supabase.
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
          <span className="text-zinc-500 text-sm font-mono animate-pulse">Carregando salas ao vivo ativas...</span>
        </div>
      ) : lives.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 text-zinc-500 flex flex-col items-center gap-3">
          <Video className="w-12 h-12 text-zinc-700" />
          <div>
            <p className="text-base font-bold text-zinc-400">Nenhuma sala ao vivo ativa!</p>
            <p className="text-xs font-mono mt-1">No momento não há utilizadores transmitindo áudio na plataforma.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lives.map(item => (
            <div key={item.id} className="bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-6 flex flex-col justify-between space-y-5 transition-all shadow-xl relative overflow-hidden group">
              {/* Indicador AO VIVO pulsante */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 animate-pulse" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-black rounded-lg uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    AO VIVO AGORA
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {item.created_at ? new Date(item.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : 'Recente'}
                  </span>
                </div>

                {/* Info do Anfitrião */}
                <div className="flex items-center gap-3">
                  <img 
                    src={item.host_avatar ? parseMediaUrl(item.host_avatar) : `https://api.dicebear.com/7.x/avatars/svg?seed=${item.host_username}`}
                    alt="Host"
                    className="w-12 h-12 rounded-full object-cover bg-zinc-800 border-2 border-amber-500/50 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white truncate group-hover:text-amber-400 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-zinc-400 font-mono truncate">
                      @{item.host_username}
                    </p>
                  </div>
                </div>

                {/* Métricas da Live */}
                <div className="grid grid-cols-2 gap-2 py-2 bg-zinc-950/60 rounded-xl border border-zinc-800/80 px-4 text-center">
                  <div className="flex flex-col items-center justify-center py-1.5 border-r border-zinc-800">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono">
                      <Users className="w-3.5 h-3.5 text-blue-400" />
                      <span>Ouvintes</span>
                    </div>
                    <span className="text-lg font-black text-white font-mono mt-0.5">
                      {item.viewer_count}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center py-1.5">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono">
                      <Heart className="w-3.5 h-3.5 text-rose-400" />
                      <span>Curtidas</span>
                    </div>
                    <span className="text-lg font-black text-white font-mono mt-0.5">
                      {item.likes}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botão Derrubar Live */}
              <div className="pt-2 border-t border-zinc-800/80">
                <button
                  onClick={() => handleShutdownLive(item)}
                  disabled={actionLoading === item.id}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-rose-600/20 active:scale-95 disabled:opacity-50"
                >
                  {actionLoading === item.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Encerrando...</span>
                    </>
                  ) : (
                    <>
                      <PowerOff className="w-4 h-4 text-rose-200" />
                      <span>Derrubar Live (Encerrar)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminLiveRooms;
