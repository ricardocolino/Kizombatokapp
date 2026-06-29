import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { parseMediaUrl } from '../services/mediaUtils';
import { 
  Users, Check, X, Loader2, Award, Eye, Film
} from 'lucide-react';

interface MonetizationProfile {
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  monetization_status: 'not_applied' | 'pending' | 'approved' | 'rejected';
  followers_count: number;
  views_count: number;
  videos_count: number;
}

export const AdminMonetizationManager: React.FC = () => {
  const [profiles, setProfiles] = useState<MonetizationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const fetchMonetizationData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch profiles matching activeTab status
      const { data: rawProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, name, avatar_url, monetization_status')
        .eq('monetization_status', activeTab)
        .order('username', { ascending: true });

      if (profilesError) throw profilesError;

      if (!rawProfiles || rawProfiles.length === 0) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      // 2. For each profile, fetch stats (followers, views, videos)
      const enrichedProfiles = await Promise.all(
        rawProfiles.map(async (p) => {
          // Followers count
          const { count: followersCount } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', p.id);

          // Posts (Videos) stats
          const { data: postsData } = await supabase
            .from('posts')
            .select('views')
            .eq('user_id', p.id);

          const videosCount = postsData ? postsData.length : 0;
          const viewsCount = postsData ? postsData.reduce((sum, post) => sum + (post.views || 0), 0) : 0;

          return {
            id: p.id,
            username: p.username || 'user',
            name: p.name,
            avatar_url: p.avatar_url,
            monetization_status: (p.monetization_status || 'not_applied') as 'not_applied' | 'pending' | 'approved' | 'rejected',
            followers_count: followersCount || 0,
            views_count: viewsCount,
            videos_count: videosCount
          };
        })
      );

      setProfiles(enrichedProfiles);
    } catch (err) {
      console.error("Error fetching monetization data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchMonetizationData();
  }, [fetchMonetizationData]);

  const handleUpdateStatus = async (profileId: string, newStatus: 'approved' | 'rejected') => {
    setActionLoading(profileId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ monetization_status: newStatus })
        .eq('id', profileId);

      if (error) throw error;

      alert(newStatus === 'approved' ? 'Monetização aprovada com sucesso!' : 'Monetização recusada.');
      setProfiles(prev => prev.filter(p => p.id !== profileId));
    } catch (err) {
      console.error("Error updating monetization status:", err);
      alert('Erro ao atualizar estado da monetização.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
            <Award size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Monetização por Visualizações</h3>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">Gerencie os pedidos de monetização (Requisitos: 100 seguidores e 1000 views)</p>
          </div>
        </div>

        {/* Tab selection */}
        <div className="flex gap-2 p-1 bg-zinc-950 border border-zinc-800 rounded-2xl w-full sm:w-fit mt-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'pending'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Pedidos Pendentes
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'approved'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Aprovados
          </button>
          <button
            onClick={() => setActiveTab('rejected')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'rejected'
                ? 'bg-rose-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Recusados
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-purple-500" size={32} />
          <span className="text-xs text-zinc-400 uppercase tracking-widest font-bold">A carregar dados...</span>
        </div>
      ) : profiles.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center text-zinc-500">
            <Users size={28} />
          </div>
          <div>
            <h4 className="font-bold text-white uppercase tracking-wider text-xs">Nenhum perfil encontrado</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
              {activeTab === 'pending' 
                ? 'De momento não existem pedidos de monetização pendentes de aprovação.' 
                : activeTab === 'approved' 
                ? 'Ainda não existem perfis aprovados para ganhos por views.'
                : 'Nenhum pedido foi recusado ainda.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((p) => (
            <div 
              key={p.id}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-6 justify-between hover:border-zinc-700 transition-all shadow-xl"
            >
              {/* User Header */}
              <div className="flex items-center gap-4">
                <div className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700">
                  {p.avatar_url ? (
                    <img 
                      src={parseMediaUrl(p.avatar_url)} 
                      alt={p.username} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold uppercase">
                      {p.username.slice(0, 2)}
                    </div>
                  )}
                </div>
                <div className="overflow-hidden">
                  <h4 className="font-black text-white text-sm truncate">@{p.username}</h4>
                  <p className="text-xs text-zinc-400 truncate">{p.name || 'Sem nome público'}</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 bg-zinc-950 border border-zinc-800/50 p-4 rounded-2xl">
                <div className="flex flex-col items-center text-center">
                  <div className="text-zinc-500 mb-1">
                    <Users size={14} />
                  </div>
                  <span className="text-xs font-black text-white">{p.followers_count}</span>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-tight">Seguidores</span>
                </div>

                <div className="flex flex-col items-center text-center border-x border-zinc-800/80">
                  <div className="text-zinc-500 mb-1">
                    <Eye size={14} />
                  </div>
                  <span className="text-xs font-black text-white">{p.views_count}</span>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-tight">Views</span>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="text-zinc-500 mb-1">
                    <Film size={14} />
                  </div>
                  <span className="text-xs font-black text-white">{p.videos_count}</span>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-tight">Vídeos</span>
                </div>
              </div>

              {/* Requirements Status indicators for Pending */}
              {p.monetization_status === 'pending' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Seguidores (mín. 100):</span>
                    <span className={`font-black ${p.followers_count >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {p.followers_count}/100 {p.followers_count >= 100 ? '✓' : '✗'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Views (mín. 1000):</span>
                    <span className={`font-black ${p.views_count >= 1000 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {p.views_count}/1000 {p.views_count >= 1000 ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              {p.monetization_status === 'pending' ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleUpdateStatus(p.id, 'rejected')}
                    disabled={actionLoading !== null}
                    className="flex-1 py-3 bg-zinc-800 hover:bg-rose-950 hover:text-rose-400 border border-zinc-700 hover:border-rose-900 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 text-zinc-300"
                  >
                    <X size={14} />
                    Recusar
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(p.id, 'approved')}
                    disabled={actionLoading !== null}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    {actionLoading === p.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    Aceitar
                  </button>
                </div>
              ) : (
                <div className="text-center py-2 bg-zinc-950 border border-zinc-800 rounded-xl">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                    p.monetization_status === 'approved' ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {p.monetization_status === 'approved' ? 'Monetização Ativa' : 'Monetização Recusada'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
