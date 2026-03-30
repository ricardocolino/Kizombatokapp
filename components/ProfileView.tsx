import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Profile, Post } from '../types';
import { uploadToR2 } from '../services/uploadService';
import { AlertCircle, Plus, LogOut, X, Camera, Check, Loader2, Calendar, MapPin, BarChart3, Eye, MessageCircle, Heart, Users, TrendingUp, Wallet, Coins, ArrowUpCircle, ChevronLeft, Download, Share2 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { parseMediaUrl } from '../services/mediaUtils';

interface ProfileViewProps {
  userId: string;
  isOwnProfile?: boolean;
  onNavigateToPost?: (postId: string, filter?: { userId: string; userName: string; type: 'user' | 'liked' | 'reposted' }) => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ userId, isOwnProfile, onNavigateToPost }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, likes: 0, views: 0, comments: 0 });
  const [showDashboard, setShowDashboard] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState(10);
  const [activeTab, setActiveTab] = useState<'posts' | 'liked' | 'reposts'>('posts');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasStories, setHasStories] = useState(false);
  const [postsPage, setPostsPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<{ month: string, earnings: number, views: number }[]>([]);
  const [pendingEarnings, setPendingEarnings] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const PAGE_SIZE = 6;
  
  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    name: '',
    bio: '',
    avatar_url: '',
    cover_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = React.useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data);
    if (data) {
      setEditForm({
        username: data.username || '',
        name: data.name || '',
        bio: data.bio || '',
        avatar_url: data.avatar_url || '',
        cover_url: data.cover_url || ''
      });
    }
  }, [userId]);

  const checkFollowStatus = React.useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || isOwnProfile) return;

    const { data } = await supabase
      .from('follows')
      .select('*')
      .eq('follower_id', session.user.id)
      .eq('following_id', userId)
      .maybeSingle();

    setIsFollowing(!!data);
  }, [userId, isOwnProfile]);

  const checkStoriesStatus = React.useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from('stories')
      .select('id')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .limit(1);
    
    setHasStories(!!data && data.length > 0);
  }, [userId]);

  const fetchUserPosts = React.useCallback(async (page = 0) => {
    if (page === 0) {
      setPostsPage(0);
      setHasMorePosts(true);
    } else {
      setLoadingMore(true);
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!error && data) {
      if (page === 0) {
        setUserPosts(data || []);
      } else {
        setUserPosts(prev => [...prev, ...(data || [])]);
      }
      setHasMorePosts(data ? data.length === PAGE_SIZE : false);
    }
    
    if (page !== 0) setLoadingMore(false);
  }, [userId]);

  const fetchLikedPosts = React.useCallback(async () => {
    setTabLoading(true);
    try {
      const { data, error } = await supabase
        .from('reactions')
        .select('post_id, posts(*, profiles!user_id(*))')
        .eq('user_id', userId)
        .eq('type', 'like')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const posts = data.map(item => item.posts).filter(Boolean) as Post[];
        setLikedPosts(posts);
      }
    } catch (e) {
      console.error("Erro ao buscar curtidas:", e);
    } finally {
      setTabLoading(false);
    }
  }, [userId]);

  const fetchRepostedPosts = React.useCallback(async () => {
    setTabLoading(true);
    try {
      const { data, error } = await supabase
        .from('reposts')
        .select('post_id, posts(*, profiles!user_id(*))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const posts = data.map(item => item.posts).filter(Boolean) as Post[];
        setRepostedPosts(posts);
      }
    } catch (e) {
      console.error("Erro ao buscar republicados:", e);
    } finally {
      setTabLoading(false);
    }
  }, [userId]);

  const fetchStats = React.useCallback(async () => {
    const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
    const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
    
    const { data: posts } = await supabase.from('posts').select('id, views').eq('user_id', userId);
    let totalLikes = 0;
    let totalViews = 0;
    let totalComments = 0;

    if (posts && posts.length > 0) {
      const postIds = posts.map(p => p.id);
      totalViews = posts.reduce((acc, p) => acc + (p.views || 0), 0);

      const [{ count: likes }, { count: comments }] = await Promise.all([
        supabase
          .from('reactions')
          .select('*', { count: 'exact', head: true })
          .in('post_id', postIds)
          .eq('type', 'like'),
        supabase
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .in('post_id', postIds)
      ]);

      totalLikes = likes || 0;
      totalComments = comments || 0;
    }

    setStats({ 
      followers: followers || 0, 
      following: following || 0, 
      likes: totalLikes,
      views: totalViews,
      comments: totalComments
    });

    // Calcular ganhos pendentes (0.01 USD por view)
    const claimedViews = Number(localStorage.getItem(`claimed_views_${userId}`) || 0);
    const unclaimedViews = Math.max(0, totalViews - claimedViews);
    setPendingEarnings(Number((unclaimedViews * 0.01).toFixed(4)));

    // Gerar estatísticas mensais simuladas baseadas nos dados reais
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const currentMonthIndex = new Date().getMonth();
    const stats_data = [];
    
    for (let i = 5; i >= 0; i--) {
      const idx = (currentMonthIndex - i + 12) % 12;
      // Simulação: Earnings crescem conforme as views totais (em USD)
      const baseEarnings = (totalViews * 0.01) / 6;
      const randomFactor = 0.5 + Math.random();
      stats_data.push({
        month: months[idx],
        earnings: Number((baseEarnings * randomFactor).toFixed(2)),
        views: Math.floor((totalViews / 6) * randomFactor)
      });
    }
    setMonthlyStats(stats_data);
  }, [userId]);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchProfile(), fetchUserPosts(), fetchStats(), checkFollowStatus(), checkStoriesStatus()]);
    setLoading(false);
  }, [fetchProfile, fetchUserPosts, fetchStats, checkFollowStatus, checkStoriesStatus]);

  useEffect(() => {
    loadAll();
  }, [userId, loadAll]);

  useEffect(() => {
    if (activeTab === 'liked') {
      fetchLikedPosts();
    } else if (activeTab === 'reposts') {
      fetchRepostedPosts();
    }
  }, [activeTab, fetchLikedPosts, fetchRepostedPosts]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (activeTab !== 'posts' || !hasMorePosts || loadingMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      const nextPage = postsPage + 1;
      setPostsPage(nextPage);
      fetchUserPosts(nextPage);
    }
  };

  const handleLogout = async () => {
    setShowLogoutModal(false);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  const handleFollowToggle = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert('Faz login para seguires este vídeo!');
      return;
    }

    if (isFollowing) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', session.user.id)
        .eq('following_id', userId);
      
      if (!error) {
        setIsFollowing(false);
        fetchStats();
      }
    } else {
      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: session.user.id,
          following_id: userId
        });
      
      if (!error) {
        setIsFollowing(true);
        fetchStats();
      }
    }
  };

  const handleDeposit = async () => {
    setSaving(true);
    try {
      const newBalance = (profile?.balance || 0) + depositAmount;
      const { error } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);
      
      if (error) throw error;
      
      await fetchProfile();
      setShowDeposit(false);
    } catch (err) {
      console.error("Erro no depósito:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleClaimEarnings = async () => {
    if (pendingEarnings <= 0) return;
    
    setClaiming(true);
    try {
      // Converter USD para AngoCoins (1 USD = 100 AngoCoins)
      const earningsInCoins = Math.floor(pendingEarnings * 100);
      const newBalance = (profile?.balance || 0) + earningsInCoins;
      const { error } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Marcar estas views como resgatadas
      localStorage.setItem(`claimed_views_${userId}`, stats.views.toString());
      
      await fetchProfile();
      setPendingEarnings(0);
      alert(`Boa! Resgataste $${pendingEarnings.toFixed(2)} USD (${earningsInCoins} AngoCoins) para a tua carteira! 🇦🇴💰`);
    } catch (err) {
      console.error("Erro ao resgatar ganhos:", err);
      alert("Houve um erro ao resgatar os ganhos. Tenta de novo!");
    } finally {
      setClaiming(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setEditError(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: editForm.username,
          name: editForm.name,
          bio: editForm.bio,
          avatar_url: editForm.avatar_url,
          cover_url: editForm.cover_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;

      await fetchProfile();
      setIsEditing(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Erro ao atualizar o perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleCoverClick = () => {
    coverInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setEditError('A foto é muito pesada! Máximo 2MB.');
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const folder = type === 'avatar' ? 'avatars' : 'capa';

      const publicUrl = await uploadToR2(file, folder, fileName);

      if (type === 'avatar') {
        setEditForm(prev => ({ ...prev, avatar_url: publicUrl }));
      } else {
        setEditForm(prev => ({ ...prev, cover_url: publicUrl }));
      }
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Erro ao carregar a foto.');
    } finally {
      setSaving(false);
      if (e.target) e.target.value = '';
    }
  };

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center bg-black gap-4">
      <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!profile) return <div className="p-20 text-center text-zinc-600 uppercase font-black tracking-widest text-xs">Perfil não encontrado.</div>;

  const currentGridData = activeTab === 'posts' ? userPosts : (activeTab === 'liked' ? likedPosts : repostedPosts);

  return (
    <div 
      onScroll={handleScroll}
      className="h-full w-full bg-black overflow-y-auto pb-20 no-scrollbar relative"
    >
      {/* Top Navigation Overlay */}
      <header className="sticky top-0 bg-black/80 backdrop-blur-md flex items-center justify-between px-4 h-14 border-b border-zinc-900 z-50">
        <div className="flex flex-col">
          <h1 className="font-black text-sm">{profile.name || profile.username}</h1>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{userPosts.length} Vídeos</span>
        </div>
        <div className="flex gap-4">
          {isOwnProfile && (
            <button 
              onClick={() => setShowDashboard(true)}
              className="text-zinc-400 hover:text-red-600 transition-all p-1 flex flex-col items-center"
            >
              <BarChart3 size={20} />
              <span className="text-[8px] font-black uppercase tracking-tighter">Painel</span>
            </button>
          )}
          {isOwnProfile && (
            <button onClick={() => setShowLogoutModal(true)} className="text-zinc-400 hover:text-red-600 transition-all p-1">
              <LogOut size={20}/>
            </button>
          )}
        </div>
      </header>

      {/* Banner */}
      <div className="w-full h-32 bg-zinc-900 relative overflow-hidden">
        {profile.cover_url ? (
          <img src={parseMediaUrl(profile.cover_url)} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-zinc-800 to-zinc-900" />
        )}
      </div>

      {/* Profile Info Section (Estilo X) */}
      <div className="px-4 pb-4">
        <div className="flex justify-between items-start">
          <div className="relative -mt-10">
            <div className={`w-20 h-20 rounded-full bg-black p-1 ${hasStories ? 'ring-2 ring-red-600' : ''}`}>
              <div 
                onClick={() => hasStories && onNavigateToPost && onNavigateToPost('story:' + userId)}
                className={`w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden border-2 border-black ${hasStories ? 'cursor-pointer' : ''}`}
              >
                {profile.avatar_url ? (
                  <img src={parseMediaUrl(profile.avatar_url)} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span className="text-2xl font-black text-white">{profile.username[0].toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
          <div className="pt-3">
            {isOwnProfile ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="bg-black border border-zinc-700 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest hover:bg-zinc-900 transition-all"
              >
                Editar Perfil
              </button>
            ) : (
              <button 
                onClick={handleFollowToggle}
                className={`px-6 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                  isFollowing 
                    ? 'bg-black border border-zinc-700 text-white' 
                    : 'bg-white text-black hover:bg-zinc-200'
                }`}
              >
                {isFollowing ? 'A Seguir' : 'Seguir'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <h2 className="text-xl font-black text-white leading-tight">{profile.name || profile.username}</h2>
          <p className="text-sm text-zinc-500 font-medium">@{profile.username}</p>
        </div>

        {profile.bio && (
          <p className="text-[13px] text-zinc-100 mt-3 leading-relaxed break-words whitespace-pre-wrap">
            {profile.bio}
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-zinc-500">
          <div className="flex items-center gap-1.5">
            <MapPin size={14} />
            <span className="text-xs">Luanda, Angola 🇦🇴</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar size={14} />
            <span className="text-xs">Entrou em {new Date(profile.created_at).toLocaleDateString('pt-AO', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        <div className="flex gap-4 mt-4">
          <div className="flex gap-1 items-center">
            <span className="text-sm font-black text-white">{stats.following}</span>
            <span className="text-xs text-zinc-500">Seguindo</span>
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-sm font-black text-white">{stats.followers}</span>
            <span className="text-xs text-zinc-500">Seguidores</span>
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-sm font-black text-white">{stats.likes}</span>
            <span className="text-xs text-zinc-500">Likes</span>
          </div>
        </div>
      </div>

      {/* Tabs (Estilo X) */}
      <div className="flex border-b border-zinc-900 sticky top-14 bg-black/95 backdrop-blur-md z-40">
        {[ 
          { id: 'posts', label: 'Vídeos' }, 
          { id: 'liked', label: 'Curtidas' }, 
          { id: 'reposts', label: 'Republicados' } 
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'posts' | 'liked' | 'reposts')}
            className="flex-1 flex flex-col items-center justify-center pt-4 transition-all relative"
          >
            <span className={`text-[11px] font-black uppercase tracking-widest pb-3 ${activeTab === tab.id ? 'text-white' : 'text-zinc-500'}`}>
              {tab.label}
            </span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 w-12 h-[3px] bg-red-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="min-h-[300px] relative">
        {tabLoading ? (
          <div className="absolute inset-0 flex items-center justify-center py-20">
             <Loader2 size={24} className="animate-spin text-zinc-700" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {currentGridData.map(post => (
              <div 
                key={post.id} 
                onClick={() => onNavigateToPost && onNavigateToPost(post.id, { 
                  userId, 
                  userName: profile.name || profile.username, 
                  type: activeTab === 'posts' ? 'user' : (activeTab === 'liked' ? 'liked' : 'reposted') 
                })}
                className="aspect-[3/4] bg-zinc-900 relative group overflow-hidden active:brightness-75 transition-all cursor-pointer"
              >
                {post.media_type === 'video' ? (
                  <video 
                    src={parseMediaUrl(post.media_url)} 
                    className="w-full h-full object-cover" 
                    muted 
                    playsInline 
                    preload="metadata"
                    poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined} 
                  />
                ) : (
                  <img src={parseMediaUrl(post.media_url)} className="w-full h-full object-cover" />
                )}
                <div className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[9px] font-black text-white drop-shadow-md">
                  <span className="text-[7px]">▶</span> {post.views}
                </div>
              </div>
            ))}
            
            {loadingMore && (
              <div className="col-span-3 py-8 flex justify-center">
                <Loader2 size={20} className="animate-spin text-zinc-700" />
              </div>
            )}

            {currentGridData.length === 0 && (
              <div className="col-span-3 py-24 text-center text-zinc-600 flex flex-col items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">
                  {activeTab === 'posts' ? 'Nenhum post ainda' : (activeTab === 'liked' ? 'Sem curtidas' : 'Sem republicados')}
                </p>
                <p className="text-[9px] text-zinc-700 uppercase">A vibe de Angola começa aqui 🇦🇴</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowLogoutModal(false)} />
          <div className="relative bg-zinc-950 border border-zinc-800 w-full max-w-xs rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="p-8 flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-full bg-red-600/10 flex items-center justify-center text-red-600">
                <LogOut size={32} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-black uppercase tracking-widest text-white">Sair da Banda?</h3>
                <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                  Vais deixar a vibe de Angola por agora? Podes voltar quando quiseres!
                </p>
              </div>

              <div className="w-full space-y-3 pt-2">
                <button 
                  onClick={handleLogout}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95 shadow-lg shadow-red-600/20"
                >
                  Sim, Sair Agora
                </button>
                <button 
                  onClick={() => setShowLogoutModal(false)}
                  className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95"
                >
                  Ficar na Banda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Fullscreen View */}
      {showDashboard && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <header className="flex items-center justify-between px-6 h-20 border-b border-zinc-900 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
            <button 
              onClick={() => setShowDashboard(false)}
              className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <ChevronLeft size={24} />
              <span className="text-xs font-black uppercase tracking-widest">Voltar</span>
            </button>
            <div className="flex flex-col items-center">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Painel de Controlo</h2>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">Dados em Tempo Real</span>
              </div>
            </div>
            <button className="p-2 -mr-2 text-zinc-400 hover:text-white transition-colors">
              <Share2 size={20} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar pb-32">
            {/* Wallet Card - Modernized */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-red-600 rounded-[40px] blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-zinc-950 border border-zinc-900 p-8 rounded-[40px] flex flex-col gap-6 overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Wallet size={120} />
                </div>
                
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Saldo Disponível</p>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-5xl font-black text-white tracking-tighter">
                        {profile.balance?.toFixed(0) || '0'}
                      </h3>
                      <span className="text-sm font-black text-amber-500 uppercase tracking-widest">AngoCoins</span>
                    </div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                    <Coins size={28} />
                  </div>
                </div>

                <div className="flex gap-3 mt-2">
                  <button 
                    onClick={() => { setShowDashboard(false); setShowDeposit(true); }}
                    className="flex-1 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all active:scale-95"
                  >
                    <ArrowUpCircle size={16} />
                    Carregar
                  </button>
                  <button 
                    className="flex-1 py-4 bg-zinc-900 text-white border border-zinc-800 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all active:scale-95"
                  >
                    <Download size={16} />
                    Levantar
                  </button>
                </div>

                {/* Claim Earnings Section */}
                {pendingEarnings > 0 && (
                  <div className="mt-4 p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Ganhos de Conteúdo</p>
                        <p className="text-xl font-black text-white mt-0.5">${pendingEarnings.toFixed(2)} <span className="text-[10px] text-zinc-500 font-bold uppercase">USD Pendentes</span></p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                        <TrendingUp size={20} />
                      </div>
                    </div>
                    <button 
                      onClick={handleClaimEarnings}
                      disabled={claiming}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      {claiming ? <Loader2 size={14} className="animate-spin" /> : <Coins size={14} />}
                      Resgatar para a Carteira
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Monthly Results Chart */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Resultados Mensais (USD)</h3>
                <TrendingUp size={16} className="text-emerald-500" />
              </div>
              
              <div className="h-64 w-full bg-zinc-950 border border-zinc-900 rounded-[40px] p-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyStats}>
                    <defs>
                      <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#52525b', fontSize: 10, fontWeight: 900 }} 
                      dy={10}
                    />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '16px', fontSize: '10px', fontWeight: '900' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="earnings" 
                      stroke="#ef4444" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorEarnings)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-[32px] space-y-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                  <Eye size={20} />
                </div>
                <div>
                  <p className="text-2xl font-black text-white tracking-tighter">{stats.views.toLocaleString()}</p>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mt-1">Visualizações</p>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-[32px] space-y-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                  <Heart size={20} />
                </div>
                <div>
                  <p className="text-2xl font-black text-white tracking-tighter">{stats.likes.toLocaleString()}</p>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mt-1">Gostos Totais</p>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-[32px] space-y-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                  <MessageCircle size={20} />
                </div>
                <div>
                  <p className="text-2xl font-black text-white tracking-tighter">{stats.comments.toLocaleString()}</p>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mt-1">Comentários</p>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-[32px] space-y-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-2xl font-black text-white tracking-tighter">{stats.followers.toLocaleString()}</p>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mt-1">Seguidores</p>
                </div>
              </div>
            </div>

            {/* Monthly Breakdown List */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">Histórico de Ganhos</h3>
              <div className="bg-zinc-950 border border-zinc-900 rounded-[40px] overflow-hidden">
                {monthlyStats.slice().reverse().map((m, i) => (
                  <div key={m.month} className={`flex items-center justify-between p-6 ${i !== monthlyStats.length - 1 ? 'border-b border-zinc-900' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-[10px] font-black text-zinc-400 uppercase">
                        {m.month}
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">${m.earnings.toFixed(2)} USD</p>
                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter">{m.views.toLocaleString()} views</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-emerald-500">
                      <TrendingUp size={12} />
                      <span className="text-[10px] font-black">+{Math.floor(Math.random() * 20) + 5}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowDeposit(false)} />
          <div className="relative bg-zinc-950 border border-zinc-900 w-full max-w-sm rounded-[40px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="p-8 flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <ArrowUpCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Carregar AngoCoins</h3>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Aumenta o teu saldo na banda</p>
                  </div>
                </div>
                <button onClick={() => setShowDeposit(false)} className="p-2 text-zinc-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[40, 100, 500, 1000, 5000, 10000].map(amount => (
                  <button 
                    key={amount}
                    onClick={() => setDepositAmount(amount)}
                    className={`py-4 rounded-2xl font-black text-[10px] transition-all border ${
                      depositAmount === amount 
                        ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/20' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {amount} AC
                  </button>
                ))}
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-[32px] flex flex-col gap-2">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total a Pagar</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-white">${(depositAmount / 100).toFixed(2)}</p>
                  <p className="text-xs font-bold text-zinc-600 uppercase">USD</p>
                </div>
                <p className="text-[9px] text-zinc-700 font-medium mt-2">Pagamento seguro via Stripe / PayPal</p>
              </div>

              <button 
                onClick={handleDeposit}
                disabled={saving}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Confirmar Depósito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Drawer */}
      {isEditing && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !saving && setIsEditing(false)} />
          <div className="relative bg-zinc-950 rounded-t-[40px] h-[85%] flex flex-col shadow-2xl border-t border-zinc-800 animate-[slideUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)]">
            <div className="flex items-center justify-between p-6 border-b border-zinc-900">
              <button 
                onClick={() => setIsEditing(false)} 
                disabled={saving}
                className="p-2 text-zinc-500 hover:text-white transition-colors disabled:opacity-30"
              >
                <X size={24} />
              </button>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Editar Perfil</h2>
              <button 
                onClick={handleUpdateProfile}
                disabled={saving || !editForm.username}
                className="p-2 text-red-600 hover:text-red-500 transition-colors disabled:opacity-30 flex items-center gap-2"
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={24} />}
              </button>
            </div>

            <form onSubmit={handleUpdateProfile} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar pb-32">
              {/* Cover Photo Section */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-zinc-600 tracking-widest ml-1">Foto de Capa</label>
                <input 
                  type="file"
                  ref={coverInputRef}
                  onChange={(e) => handleFileChange(e, 'cover')}
                  accept="image/*"
                  className="hidden"
                />
                <div 
                  onClick={handleCoverClick}
                  className="relative w-full h-32 rounded-3xl bg-zinc-900 border border-zinc-800 overflow-hidden cursor-pointer group"
                >
                  {editForm.cover_url ? (
                    <img src={parseMediaUrl(editForm.cover_url)} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900/50">
                      <Plus className="text-zinc-700" size={24} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-white" size={24} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4">
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileChange(e, 'avatar')}
                  accept="image/*"
                  className="hidden"
                />
                <div 
                  className="relative group cursor-pointer"
                  onClick={handleAvatarClick}
                >
                  <div className="w-24 h-24 rounded-full overflow-hidden p-1 bg-zinc-800">
                    <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden">
                      {editForm.avatar_url ? (
                        <img src={parseMediaUrl(editForm.avatar_url)} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <span className="text-2xl font-black text-zinc-600 uppercase">{editForm.username[0] || '?'}</span>
                      )}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-white" size={24} />
                  </div>
                  {saving && (
                    <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                      <Loader2 className="text-white animate-spin" size={24} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button 
                    type="button"
                    onClick={handleAvatarClick}
                    className="text-[10px] font-black uppercase text-red-600 tracking-widest hover:text-red-500 transition-colors"
                  >
                    Mudar Foto
                  </button>
                  <input 
                    type="text" 
                    value={editForm.avatar_url}
                    onChange={(e) => setEditForm({...editForm, avatar_url: e.target.value})}
                    placeholder="Ou cola uma URL aqui..."
                    className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-[9px] text-center focus:ring-1 focus:ring-red-600 outline-none transition-all text-zinc-500"
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-600 tracking-widest ml-1">Nome</label>
                  <input 
                    type="text" 
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    placeholder="Como te chamam na banda?"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-red-600 outline-none transition-all text-white placeholder:text-zinc-700 shadow-inner"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-600 tracking-widest ml-1">Username</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600 font-bold">@</span>
                    <input 
                      type="text" 
                      value={editForm.username}
                      onChange={(e) => setEditForm({...editForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')})}
                      placeholder="teu_username"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-10 pr-5 text-sm focus:ring-2 focus:ring-red-600 outline-none transition-all text-white placeholder:text-zinc-700 shadow-inner"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-600 tracking-widest ml-1">Bio</label>
                  <textarea 
                    value={editForm.bio}
                    onChange={(e) => setEditForm({...editForm, bio: e.target.value.slice(0, 150)})}
                    placeholder="Conta algo sobre ti..."
                    className="w-full h-32 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-red-600 outline-none transition-all text-white placeholder:text-zinc-700 shadow-inner resize-none"
                  />
                  <div className="flex justify-end">
                    <span className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">{editForm.bio.length}/150</span>
                  </div>
                </div>
              </div>

              {editError && (
                <div className="bg-red-600/10 border border-red-600/20 p-4 rounded-2xl flex items-center gap-3 text-red-500 text-[10px] font-black uppercase tracking-widest">
                  <AlertCircle size={16} />
                  {editError}
                </div>
              )}
            </form>

            <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent">
              <button 
                onClick={handleUpdateProfile}
                disabled={saving || !editForm.username}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 ${
                  saving || !editForm.username ? 'bg-zinc-800 text-zinc-600' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/20'
                }`}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    A Atualizar...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Guardar Alterações
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ProfileView;