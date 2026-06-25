import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Users, DollarSign, FileText, Film, Radio, 
  MessageSquare, Heart, AlertTriangle, RefreshCw, Loader2, 
  TrendingUp, BarChart3, Activity
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';

interface AnalyticsData {
  total_users: number;
  total_balance: number;
  total_posts: number;
  total_views: number;
  total_stories: number;
  total_lives: number;
  active_lives: number;
  total_comments: number;
  total_reactions: number;
  total_reports: number;
}

export const AdminAnalytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sqlNotice, setSqlNotice] = useState(false);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Tenta buscar através da função RPC segura (SQL fornecido ao utilizador)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_analytics');

      if (!rpcError && rpcData) {
        setData(rpcData as AnalyticsData);
        setSqlNotice(false);
      } else {
        // Fallback: Se a função SQL ainda não foi executada no Supabase, faz consultas diretas
        setSqlNotice(true);
        const [
          usersRes, postsRes, storiesRes, livesRes, 
          activeLivesRes, commentsRes, reactionsRes, reportsRes
        ] = await Promise.all([
          supabase.from('profiles').select('balance', { count: 'exact' }),
          supabase.from('posts').select('views', { count: 'exact' }),
          supabase.from('stories').select('*', { count: 'exact', head: true }),
          supabase.from('lives').select('*', { count: 'exact', head: true }),
          supabase.from('lives').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('comments').select('*', { count: 'exact', head: true }),
          supabase.from('reactions').select('*', { count: 'exact', head: true }),
          supabase.from('reports').select('*', { count: 'exact', head: true })
        ]);

        const totalBalance = usersRes.data ? usersRes.data.reduce((acc: number, u: any) => acc + (Number(u.balance) || 0), 0) : 0;
        const totalViews = postsRes.data ? postsRes.data.reduce((acc: number, p: any) => acc + (Number(p.views) || 0), 0) : 0;

        setData({
          total_users: usersRes.count || 0,
          total_balance: totalBalance,
          total_posts: postsRes.count || 0,
          total_views: totalViews,
          total_stories: storiesRes.count || 0,
          total_lives: livesRes.count || 0,
          active_lives: activeLivesRes.count || 0,
          total_comments: commentsRes.count || 0,
          total_reactions: reactionsRes.count || 0,
          total_reports: reportsRes.count || 0
        });
      }
    } catch (err: any) {
      console.error('Erro ao buscar métricas admin:', err);
      setError(err.message || 'Erro ao carregar dados estatísticos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const chartData = data ? [
    { name: 'Posts', value: data.total_posts },
    { name: 'Stories', value: data.total_stories },
    { name: 'Lives', value: data.total_lives },
    { name: 'Comentários', value: data.total_comments },
    { name: 'Curtidas', value: data.total_reactions },
    { name: 'Denúncias', value: data.total_reports },
  ] : [];

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-300 text-white">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-purple-500" />
            Visão Geral e Métricas
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Estatísticas globais e monitorização da plataforma Angochat
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-purple-600/20 active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Métricas
        </button>
      </div>

      {sqlNotice && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 text-amber-300 text-xs font-mono">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Aviso SQL Supabase:</span> A função RPC `get_admin_analytics` ainda não foi detetada. Estamos a calcular via fallback no navegador. Execute o código do arquivo <code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-200">admin_analytics.sql</code> no SQL Editor do Supabase para máxima velocidade e agregação exata.
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-red-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
          <span className="text-zinc-500 text-sm font-mono animate-pulse">Carregando métricas globais...</span>
        </div>
      ) : data ? (
        <>
          {/* Grid de Cards Numéricos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <MetricCard 
              title="Total de Usuários" 
              value={data.total_users} 
              icon={<Users className="w-5 h-5 text-blue-400" />} 
              bg="bg-blue-500/10 border-blue-500/20"
            />
            <MetricCard 
              title="Saldo Total (Kz)" 
              value={`${data.total_balance.toLocaleString('pt-AO')} Kz`} 
              icon={<DollarSign className="w-5 h-5 text-emerald-400" />} 
              bg="bg-emerald-500/10 border-emerald-500/20"
            />
            <MetricCard 
              title="Total de Posts" 
              value={data.total_posts} 
              subValue={`${data.total_views.toLocaleString()} visualizações`}
              icon={<FileText className="w-5 h-5 text-purple-400" />} 
              bg="bg-purple-500/10 border-purple-500/20"
            />
            <MetricCard 
              title="Stories Publicados" 
              value={data.total_stories} 
              icon={<Film className="w-5 h-5 text-pink-400" />} 
              bg="bg-pink-500/10 border-pink-500/20"
            />
            <MetricCard 
              title="Lives Transmitidas" 
              value={data.total_lives} 
              subValue={`${data.active_lives} ao vivo agora`}
              icon={<Radio className="w-5 h-5 text-red-400" />} 
              bg="bg-red-500/10 border-red-500/20"
            />
            <MetricCard 
              title="Comentários" 
              value={data.total_comments} 
              icon={<MessageSquare className="w-5 h-5 text-amber-400" />} 
              bg="bg-amber-500/10 border-amber-500/20"
            />
            <MetricCard 
              title="Reações (Curtidas)" 
              value={data.total_reactions} 
              icon={<Heart className="w-5 h-5 text-rose-400" />} 
              bg="bg-rose-500/10 border-rose-500/20"
            />
            <MetricCard 
              title="Denúncias Registadas" 
              value={data.total_reports} 
              icon={<AlertTriangle className="w-5 h-5 text-orange-400" />} 
              bg="bg-orange-500/10 border-orange-500/20"
            />
          </div>

          {/* Gráficos Recharts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
            <div className="lg:col-span-2 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                  Distribuição de Conteúdo na Plataforma
                </h3>
              </div>
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={12} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '0.75rem', color: '#fff' }}
                      itemStyle={{ color: '#c084fc' }}
                    />
                    <Bar dataKey="value" fill="#9333ea" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-between space-y-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  Saúde do Sistema
                </h3>
                <div className="space-y-4 font-mono text-sm">
                  <div className="flex justify-between p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <span className="text-zinc-400">Banco de Dados:</span>
                    <span className="text-emerald-400 font-bold">CONECTADO</span>
                  </div>
                  <div className="flex justify-between p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <span className="text-zinc-400">Servidor API:</span>
                    <span className="text-emerald-400 font-bold">ATIVO</span>
                  </div>
                  <div className="flex justify-between p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <span className="text-zinc-400">Média Engajamento:</span>
                    <span className="text-purple-400 font-bold">
                      {data.total_users > 0 ? ((data.total_reactions + data.total_comments) / data.total_users).toFixed(1) : 0} / user
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 leading-relaxed">
                <span className="font-bold uppercase text-purple-400 block mb-1">Dica de Gestão:</span>
                Mantenha as denúncias monitoradas diariamente para garantir um ambiente saudável no Angochat.
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

interface MetricCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  bg: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subValue, icon, bg }) => (
  <div className={`p-6 rounded-2xl border bg-zinc-900/40 backdrop-blur-md transition-all hover:border-zinc-700 flex flex-col justify-between ${bg}`}>
    <div className="flex items-center justify-between mb-4">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</span>
      <div className="p-2.5 bg-zinc-950/80 rounded-xl shadow-inner">
        {icon}
      </div>
    </div>
    <div>
      <div className="text-2xl md:text-3xl font-black text-white tracking-tight">{value}</div>
      {subValue && <div className="text-xs text-zinc-400 mt-1 font-mono">{subValue}</div>}
    </div>
  </div>
);

export default AdminAnalytics;
