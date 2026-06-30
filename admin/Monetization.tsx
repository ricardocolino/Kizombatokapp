import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Profile } from '../types';
import { Check, X, Users, Play, Loader2, Award, Film } from 'lucide-react';

interface ProfileWithStats extends Profile {
  followersCount: number;
  postsCount: number;
  viewsCount: number;
}

export const AdminMonetization: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileWithStats[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchProfilesAndStats = async () => {
    setLoading(true);
    try {
      // 1. Carregar perfis de acordo com o filtro
      let query = supabase.from('profiles').select('*');
      
      if (filter === 'pending') {
        query = query.eq('monetization_status', 'pending');
      } else if (filter === 'approved') {
        query = query.eq('monetization_status', 'approved');
      } else if (filter === 'rejected') {
        query = query.eq('monetization_status', 'rejected');
      } else {
        query = query.neq('monetization_status', 'not_applied').is('monetization_status', 'notnull');
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      // 2. Carregar estatísticas para cada perfil em paralelo
      const profilesStatsPromises = data.map(async (profile: any) => {
        // Seguidores
        const { count: followersCount } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', profile.id);

        // Posts
        const { count: postsCount } = await supabase
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id);

        // Soma de visualizações de posts
        const { data: postsData } = await supabase
          .from('posts')
          .select('views')
          .eq('user_id', profile.id);

        const viewsCount = postsData ? postsData.reduce((acc, curr) => acc + (curr.views || 0), 0) : 0;

        return {
          ...profile,
          followersCount: followersCount || 0,
          postsCount: postsCount || 0,
          viewsCount: viewsCount || 0
        } as ProfileWithStats;
      });

      const enrichedProfiles = await Promise.all(profilesStatsPromises);
      setProfiles(enrichedProfiles);
    } catch (err) {
      console.error("Erro ao carregar solicitações de monetização:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfilesAndStats();
  }, [filter]);

  const handleUpdateStatus = async (userId: string, newStatus: 'approved' | 'rejected') => {
    setActionLoadingId(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ monetization_status: newStatus })
        .eq('id', userId);

      if (error) throw error;

      // Notificar usuário se quiser ou apenas atualizar a lista local
      setProfiles(prev => prev.filter(p => p.id !== userId));
      alert(`Solicitação ${newStatus === 'approved' ? 'APROVADA' : 'RECUSADA'} com sucesso!`);
    } catch (err) {
      console.error("Erro ao atualizar status de monetização:", err);
      alert("Ocorreu um erro ao processar a ação.");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-purple-500" />
            Monetização de Visualizações
          </h3>
          <p className="text-xs text-zinc-400 font-mono">
            Apenas utilizadores com 100+ seguidores e 1000+ views totais podem aderir ao programa de ganhos por views.
          </p>
        </div>

        {/* Filtros */}
        <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl self-start">
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filter === 'pending'
                ? 'bg-purple-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Pendentes
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filter === 'approved'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Aprovados
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filter === 'rejected'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Recusados
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filter === 'all'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2">
          <Loader2 className="animate-spin text-purple-600" size={28} />
          <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">A carregar solicitações...</p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-zinc-850 flex items-center justify-center text-zinc-600">
            <Award size={24} />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-zinc-300">Nenhum pedido encontrado</h4>
            <p className="text-xs text-zinc-500 max-w-sm">
              Não existem perfis com o status <span className="text-purple-400 font-bold uppercase">{filter}</span> no momento.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl hover:border-zinc-700/60 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold bg-zinc-800 uppercase">
                      {profile.username.slice(0, 2)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black text-white truncate flex items-center gap-1.5">
                    {profile.name || profile.username}
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                      @{profile.username}
                    </span>
                  </h4>
                  <p className="text-[10px] text-zinc-500 font-mono truncate">{profile.id}</p>
                </div>

                {/* Status Badge */}
                <div className="shrink-0">
                  {profile.monetization_status === 'pending' && (
                    <span className="text-[9px] uppercase font-mono px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
                      Pendente
                    </span>
                  )}
                  {profile.monetization_status === 'approved' && (
                    <span className="text-[9px] uppercase font-mono px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                      Aprovado
                    </span>
                  )}
                  {profile.monetization_status === 'rejected' && (
                    <span className="text-[9px] uppercase font-mono px-2.5 py-1 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/20">
                      Recusado
                    </span>
                  )}
                </div>
              </div>

              {/* Estatísticas de Monetização */}
              <div className="grid grid-cols-3 gap-2 bg-zinc-950 p-3 rounded-xl border border-zinc-800/80">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="flex items-center gap-1 text-zinc-400">
                    <Users size={12} className="text-blue-400" />
                    <span className="text-[8px] font-mono uppercase font-bold tracking-wider">Seguidores</span>
                  </div>
                  <span className={`text-sm font-black mt-1 ${profile.followersCount >= 100 ? 'text-green-400' : 'text-zinc-300'}`}>
                    {profile.followersCount}
                  </span>
                  <span className="text-[8px] text-zinc-500 font-medium">Meta: 100</span>
                </div>

                <div className="flex flex-col items-center justify-center text-center border-x border-zinc-800">
                  <div className="flex items-center gap-1 text-zinc-400">
                    <Play size={12} className="text-purple-400" />
                    <span className="text-[8px] font-mono uppercase font-bold tracking-wider">Views Totais</span>
                  </div>
                  <span className={`text-sm font-black mt-1 ${profile.viewsCount >= 1000 ? 'text-green-400' : 'text-zinc-300'}`}>
                    {profile.viewsCount}
                  </span>
                  <span className="text-[8px] text-zinc-500 font-medium">Meta: 1000</span>
                </div>

                <div className="flex flex-col items-center justify-center text-center">
                  <div className="flex items-center gap-1 text-zinc-400">
                    <Film size={12} className="text-pink-400" />
                    <span className="text-[8px] font-mono uppercase font-bold tracking-wider">Vídeos</span>
                  </div>
                  <span className="text-sm font-black text-zinc-300 mt-1">
                    {profile.postsCount}
                  </span>
                  <span className="text-[8px] text-zinc-500 font-medium">Publicados</span>
                </div>
              </div>

              {/* Botões de Ação */}
              {profile.monetization_status === 'pending' && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-800">
                  <button
                    disabled={actionLoadingId !== null}
                    onClick={() => handleUpdateStatus(profile.id, 'rejected')}
                    className="flex-1 h-9 bg-zinc-800 hover:bg-rose-500/15 border border-zinc-700 hover:border-rose-500/30 text-rose-400 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                  >
                    {actionLoadingId === profile.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <X size={12} />
                        Recusar Pedido
                      </>
                    )}
                  </button>
                  <button
                    disabled={actionLoadingId !== null}
                    onClick={() => handleUpdateStatus(profile.id, 'approved')}
                    className="flex-1 h-9 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/25"
                  >
                    {actionLoadingId === profile.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        <Check size={12} />
                        Aprovar Ganhos
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Opção para reverter decisões em perfis já aprovados/recusados */}
              {profile.monetization_status !== 'pending' && (
                <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-zinc-800">
                  <button
                    disabled={actionLoadingId !== null}
                    onClick={() => handleUpdateStatus(profile.id, 'pending')}
                    className="px-3 h-8 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white font-bold text-[9px] uppercase tracking-wider rounded-lg transition-all active:scale-[0.98] flex items-center justify-center gap-1"
                  >
                    Reavaliar Pedido
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminMonetization;
