import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Profile, Post } from '../types';
import { uploadToR2 } from '../services/uploadService';
import { AlertCircle, LogOut, X, Camera, Check, Loader2, Wallet, ArrowUpCircle, ChevronLeft, ChevronRight, Download, Menu, Box, CheckCircle2, Smartphone, Settings, CreditCard, Layers, ChevronDown } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';
import { Browser } from '@capacitor/browser';

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
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showAirTMModal, setShowAirTMModal] = useState(false);
  const [withdrawalMethod, setWithdrawalMethod] = useState<'usdt' | 'airtm'>('airtm');
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newAirTMEmail, setNewAirTMEmail] = useState('');
  const [showDeposit, setShowDeposit] = useState(false);
  const [showExternalUrl, setShowExternalUrl] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('https://angochatpayments.vercel.app');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState(10);
  const [activeTab, setActiveTab] = useState<'posts' | 'liked' | 'reposts'>('posts');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasStories, setHasStories] = useState(false);
  const [postsPage, setPostsPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingEarnings, setPendingEarnings] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const PAGE_SIZE = 6;

  // Ouvir mensagens do iframe de pagamentos
  useEffect(() => {
    const handlePaymentMessage = async (event: MessageEvent) => {
      // Verificamos se a mensagem vem do nosso domínio de pagamentos
      // e se tem o formato que definiste
      if (event.data && event.data.type === 'OPEN_URL' && event.data.url) {
        try {
          console.log("A abrir gateway de pagamento externo:", event.data.url);
          await Browser.open({ 
            url: event.data.url,
            toolbarColor: '#09090b', // Cor zinc-950 da App
            presentationStyle: 'fullscreen'
          });
        } catch (err) {
          console.error("Erro ao abrir navegador nativo:", err);
          // Fallback simples se o Browser.open falhar
          window.open(event.data.url, '_blank');
        }
      }
    };

    window.addEventListener('message', handlePaymentMessage);
    return () => window.removeEventListener('message', handlePaymentMessage);
  }, []);
  
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
  const [showMenu, setShowMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      .order('is_ready', { ascending: false })
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

    // Calcular ganhos pendentes (0.01 USD por 100 views)
    const { data: profileData } = await supabase.from('profiles').select('claimed_views').eq('id', userId).single();
    const claimedViews = profileData?.claimed_views || 0;
    const unclaimedViews = Math.max(0, totalViews - claimedViews);
    setPendingEarnings(Number((unclaimedViews * 0.0001).toFixed(6)));
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

  const handleOpenExternalDeposit = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let finalUrl = 'https://angochatpayments.vercel.app';
      
      if (session) {
        const authParams = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=${session.expires_in}&token_type=bearer&type=recovery`;
        finalUrl = `${finalUrl}/#${authParams}`;
      }
      
      setIframeLoading(true);
      setIframeUrl(finalUrl);
      setShowExternalUrl(true);
    } catch (err) {
      console.error("Erro ao obter sessão para o navegador interno:", err);
      setIframeLoading(true);
      setIframeUrl('https://angochatpayments.vercel.app');
      setShowExternalUrl(true);
    }
  };

  const handleDeposit = async () => {
    setSaving(true);
    try {
      const usdAmount = depositAmount / 100;
      
      // Para pagamentos, usamos o servidor principal (App URL), não o Worker
      // Isto é necessário porque o Worker não tem as rotas de pagamento
      const endpoint = 'https://ais-dev-zrifqkgbujknyfw6lb6hhi-7031768075.europe-west2.run.app/api/payments/create';

      console.log(`>>> [DEPOSIT] Chamando endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          amount: usdAmount,
          currency: 'usdttrc20'
        }),
      });

      // Se a resposta não for OK, tentamos ler o texto para depuração
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro do Servidor (Texto):", errorText);
        
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || "Erro desconhecido no servidor");
        } catch {
          throw new Error(`O servidor respondeu com um erro (Status ${response.status}). Verifica os logs do servidor.`);
        }
      }

      const data = await response.json();

      if (data.invoice_url) {
        window.open(data.invoice_url, '_blank');
        alert("Fatura criada! Completa o pagamento no separador que abriu. O teu saldo será atualizado automaticamente assim que o pagamento for confirmado pela rede USDT.");
      }
      
      setShowDeposit(false);
    } catch (err) {
      console.error("Erro detalhado no depósito:", err);
      alert(err instanceof Error ? err.message : "Erro ao processar depósito");
    } finally {
      setSaving(false);
    }
  };

  const handleClaimEarnings = async () => {
    const earningsInCoins = Math.floor(pendingEarnings * 100);
    if (earningsInCoins <= 0) return;
    
    setClaiming(true);
    try {
      const newRedeemableBalance = (profile?.redeemable_balance || 0) + earningsInCoins;
      const { error } = await supabase
        .from('profiles')
        .update({ redeemable_balance: newRedeemableBalance })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Marcar estas views como resgatadas no banco de dados
      const { error: updateViewsError } = await supabase
        .from('profiles')
        .update({ claimed_views: stats.views })
        .eq('id', userId);
      
      if (updateViewsError) throw updateViewsError;
      
      await fetchProfile();
      setPendingEarnings(0);
      alert(`Boa! Resgataste $${pendingEarnings.toFixed(2)} USD (${earningsInCoins} AngoCoins) para o teu saldo de resgate! 🇦🇴💰`);
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

  const handleSaveWallet = async () => {
    if (!newWalletAddress.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ wallet_address: newWalletAddress.trim() })
        .eq('id', userId);
      
      if (error) throw error;
      
      await fetchProfile();
      setShowWalletModal(false);
      alert("Carteira USDT (BEP-20) guardada com sucesso! 🇦🇴🚀");
    } catch (err) {
      console.error("Erro ao guardar carteira:", err);
      alert("Erro ao guardar carteira. Tenta de novo!");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAirTM = async () => {
    if (!newAirTMEmail.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ airtm_email: newAirTMEmail.trim() })
        .eq('id', userId);
      
      if (error) throw error;
      
      await fetchProfile();
      setShowAirTMModal(false);
      alert("E-mail AirTM guardado com sucesso! 🇦🇴🚀");
    } catch (err) {
      console.error("Erro ao guardar e-mail AirTM:", err);
      alert("Erro ao guardar e-mail AirTM. Tenta de novo!");
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async () => {
    const amountCoins = profile?.redeemable_balance || 0;
    const amountUSD = amountCoins / 100;

    if (amountCoins <= 0) {
      alert("Não tens saldo suficiente para levantar.");
      return;
    }

    if (withdrawalMethod === 'usdt') {
      if (amountUSD < 1) {
        alert("O valor mínimo para levantamento via USDT (BEP-20) é $1.00 USD (100 AngoCoins).");
        return;
      }
      if (!profile?.wallet_address) {
        alert("Precisas de cadastrar a tua carteira primeiro!");
        setShowWalletModal(true);
        return;
      }
    }

    if (withdrawalMethod === 'airtm') {
      if (amountUSD < 0.5) {
        alert("O valor mínimo para levantamento via AirTM é $0.50 USD (50 AngoCoins).");
        return;
      }
      if (!profile?.airtm_email) {
        alert("Precisas de cadastrar o teu e-mail AirTM primeiro!");
        setShowAirTMModal(true);
        return;
      }
    }

    setSaving(true);
    try {
      // 0. Verificar se já fez levantamento hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count, error: countError } = await supabase
        .from('withdrawals')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', today.toISOString());

      if (countError) throw countError;

      if (count !== null && count > 0) {
        alert("Apenas podes realizar um levantamento por dia. Tenta de novo amanhã! 🇦🇴⏳");
        setShowWithdrawModal(false);
        return;
      }

      // 1. Criar pedido de levantamento
      const { error: withdrawError } = await supabase
        .from('withdrawals')
        .insert({
          user_id: userId,
          amount: amountCoins,
          wallet_address: withdrawalMethod === 'usdt' ? profile.wallet_address : null,
          airtm_email: withdrawalMethod === 'airtm' ? profile.airtm_email : null,
          method: withdrawalMethod,
          status: 'pending'
        });

      if (withdrawError) throw withdrawError;

      // 2. Deduzir do saldo de resgate
      const newRedeemableBalance = (profile.redeemable_balance || 0) - amountCoins;
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ redeemable_balance: newRedeemableBalance })
        .eq('id', userId);

      if (balanceError) throw balanceError;

      await fetchProfile();
      setShowWithdrawModal(false);
      alert("Pedido de levantamento enviado com sucesso! A administração irá processar o teu pagamento em breve. 🇦🇴💰");
    } catch (err) {
      console.error("Erro ao processar levantamento:", err);
      alert("Erro ao processar levantamento. Tenta de novo!");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const folder = 'avatars';

      const publicUrl = await uploadToR2(file, folder, fileName);
      setEditForm(prev => ({ ...prev, avatar_url: publicUrl }));
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
            <div className="relative">
              <button 
                onClick={() => setShowMenu(true)} 
                className="text-white hover:opacity-70 transition-all p-1"
              >
                <Menu size={24}/>
              </button>
            </div>
          )}
        </div>
      </header>

      {showMenu && (
        <div className="fixed inset-0 z-[999] bg-white flex flex-col text-zinc-950">
          <div className="flex items-center justify-end px-6 h-16 border-b border-zinc-100">
            <button 
              onClick={() => setShowMenu(false)}
              className="w-10 h-10 flex items-center justify-center bg-zinc-100 rounded-lg text-zinc-900 border border-zinc-200 hover:bg-zinc-200 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-6 py-6 border-b border-zinc-100 mb-6">
            <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-200 flex items-center justify-center overflow-hidden">
                  {profile.avatar_url ? (
                    <img src={parseMediaUrl(profile.avatar_url)} className="w-full h-full object-cover" />
                  ) : (
                      <span className="font-bold text-zinc-400">{profile.username[0].toUpperCase()}</span>
                  )}
                </div>
                <span className="font-semibold text-sm text-zinc-800">Conta Pessoal</span>
              </div>
              <ChevronDown size={18} className="text-zinc-400" />
            </div>
          </div>

          <div className="flex-1 px-6 space-y-6 overflow-y-auto">
            {[
              { icon: <Layers size={22} />, label: 'Minhas Coleções' },
              { icon: <CheckCircle2 size={22} />, label: 'Estatísticas' },
              { icon: <Box size={22} />, label: 'Novidades (OTA)' },
              { icon: <Smartphone size={22} />, label: 'Pré-visualizar App' },
              { icon: <Settings size={22} />, label: 'Configurações' },
              { icon: <CreditCard size={22} />, label: 'Faturamento & Saldo' },
            ].map((item, idx) => (
              <button key={idx} className="w-full flex items-center gap-4 text-zinc-800 group">
                  <div className="text-zinc-900 opacity-80 group-hover:opacity-100 transition-opacity">{item.icon}</div>
                  <span className="text-lg font-medium tracking-tight">{item.label}</span>
              </button>
            ))}
          </div>

          <div className="p-8 border-t border-zinc-100 mt-auto">
            <div className="flex items-center justify-center gap-2 mb-8 scale-75 opacity-20">
                <div className="w-12 h-12 bg-red-600 rounded-lg"></div>
                <div className="w-4 h-12 bg-red-600 rounded-lg"></div>
                <div className="w-2 h-12 bg-red-600 rounded-lg"></div>
            </div>
            <button
              onClick={() => {
                setShowMenu(false);
                setShowLogoutModal(true);
              }}
              className="w-full h-14 bg-zinc-100 hover:bg-zinc-200 transition-colors rounded-xl flex items-center justify-center gap-2 font-bold text-zinc-900 border border-zinc-200"
            >
              Log out
              <LogOut size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* Profile Info Section (Centralizado) */}
      <div className="px-4 pb-6 pt-8 flex flex-col items-center text-center">
        <div className="relative">
          <div className={`w-24 h-24 rounded-full bg-black p-1 ${hasStories ? 'ring-2 ring-red-600' : ''}`}>
            <div 
              onClick={() => hasStories && onNavigateToPost && onNavigateToPost('story:' + userId)}
              className={`w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden border-2 border-black ${hasStories ? 'cursor-pointer' : ''}`}
            >
              {profile.avatar_url ? (
                <img src={parseMediaUrl(profile.avatar_url)} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-3xl font-black text-white">{profile.username[0].toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <h2 className="text-2xl font-black text-white leading-tight">{profile.name || profile.username}</h2>
          <p className="text-sm text-zinc-500 font-medium">@{profile.username}</p>
        </div>

        {profile.bio && (
          <p className="text-[13px] text-zinc-100 mt-3 leading-relaxed break-words whitespace-pre-wrap max-w-xs">
            {profile.bio}
          </p>
        )}


        <div className="flex gap-3 mt-6 w-full max-w-xs">
          {isOwnProfile ? (
            <>
              <button 
                onClick={() => setIsEditing(true)}
                className="flex-1 bg-zinc-900 border border-zinc-800 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all active:scale-95"
              >
                Editar Perfil
              </button>
              <button 
                onClick={() => setShowDashboard(true)}
                className="flex-1 bg-red-600 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Wallet size={14} />
                Saldo
              </button>
            </>
          ) : (
            <button 
              onClick={handleFollowToggle}
              className={`w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                isFollowing 
                  ? 'bg-zinc-900 border border-zinc-800 text-white' 
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              {isFollowing ? 'A Seguir' : 'Seguir'}
            </button>
          )}
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
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-right duration-300 text-black">
          {/* Header */}
          <header className="flex items-center px-6 h-16 border-b border-zinc-100 bg-white sticky top-0 z-10 shrink-0">
            <button 
              onClick={() => setShowDashboard(false)}
              className="p-2 -ml-2 text-zinc-900 transition-colors flex items-center gap-2"
            >
              <ChevronLeft size={24} />
              <span className="text-xs font-black uppercase tracking-widest">Carteira</span>
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-8 space-y-12 no-scrollbar pb-32">
            {/* 1. Ganhos Section */}
            <section className="space-y-8">
              <div className="pb-4 border-b border-zinc-100">
                <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Meus Ganhos</h2>
                <div className="flex items-baseline justify-between mt-4">
                  <div>
                    <h3 className="text-4xl font-black tracking-tighter">
                      ${pendingEarnings.toFixed(2)}
                    </h3>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Pendentes por visualizações</p>
                  </div>
                  {pendingEarnings >= 0.01 && (
                    <button 
                      onClick={handleClaimEarnings}
                      disabled={claiming}
                      className="text-[11px] font-black underline uppercase tracking-widest"
                    >
                      {claiming ? 'A Processar...' : 'Resgatar'}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Saldo Disponível</h2>
                <div className="flex items-baseline justify-between mt-4">
                  <div>
                    <div className="flex items-baseline gap-2">
                       <h3 className="text-4xl font-black tracking-tighter">
                         {profile.redeemable_balance?.toFixed(0) || '0'}
                       </h3>
                       <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">AngoCoins</span>
                    </div>
                    <p className="text-[10px] font-bold text-zinc-400 mt-1 uppercase tracking-widest">
                       Equivalente a <span className="text-black font-black">${((profile.redeemable_balance || 0) / 100).toFixed(2)} USD</span>
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowWithdrawModal(true)}
                    className="h-10 w-10 flex items-center justify-center text-black border border-zinc-200 rounded-lg"
                  >
                    <Download size={20} />
                  </button>
                </div>
              </div>
            </section>

            {/* 2. Gift Balance Section */}
            <section className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Saldo de Presentes</h2>
              </div>

              <div className="py-6 border-y border-zinc-100">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-4xl font-black tracking-tighter">
                        {profile.balance?.toFixed(0) || '0'}
                      </h3>
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">AngoCoins</span>
                    </div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Para enviares presentes à banda</p>
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <button 
                    onClick={handleOpenExternalDeposit}
                    className="flex-1 h-14 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                  >
                    <ArrowUpCircle size={16} />
                    Carregar
                  </button>
                  <button 
                    onClick={() => setShowWithdrawModal(true)}
                    className="flex-1 h-14 border border-zinc-200 text-black rounded-xl font-black uppercase tracking-widest text-[10px]"
                  >
                    Levantar
                  </button>
                </div>
              </div>
            </section>

            {/* 3. Métodos - List style */}
            <section className="space-y-6">
              <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Métodos de Recebimento</h2>
              
              <div className="divide-y divide-zinc-100 border-y border-zinc-100">
                {/* USDT */}
                <button 
                  onClick={() => {
                    setNewWalletAddress(profile?.wallet_address || '');
                    setShowWalletModal(true);
                  }}
                  className="w-full flex items-center justify-between py-6 group"
                >
                  <div className="flex items-center gap-4">
                    <Wallet size={20} className="text-zinc-900" />
                    <div className="flex flex-col items-start">
                      <span className="text-[12px] font-black uppercase tracking-widest">USDT (BEP-20)</span>
                      <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">
                        {profile?.wallet_address || 'Configurar endereço'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300" />
                </button>

                {/* AirTM */}
                <button 
                  onClick={() => {
                    setNewAirTMEmail(profile?.airtm_email || '');
                    setShowAirTMModal(true);
                  }}
                  className="w-full flex items-center justify-between py-6 group"
                >
                  <div className="flex items-center gap-4">
                    <Download size={20} className="text-zinc-900" />
                    <div className="flex flex-col items-start">
                      <span className="text-[12px] font-black uppercase tracking-widest">AirTM</span>
                      <span className="text-[10px] text-zinc-500">
                        {profile?.airtm_email || 'Configurar e-mail'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300" />
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Navegador Interno Personalizado */}
      {showExternalUrl && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-500 text-black">
          <header className="h-20 bg-white border-b border-zinc-100 flex items-center px-6 shrink-0 gap-4 pt-4">
            <button 
              onClick={() => setShowExternalUrl(false)}
              className="w-12 h-12 rounded-xl bg-zinc-50 flex items-center justify-center text-black active:scale-90 transition-all border border-zinc-100"
            >
              <ChevronLeft size={28} />
            </button>
            <div className="flex flex-col">
              <span className="text-sm font-black uppercase tracking-widest">Pagamento Seguro</span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-900 animate-pulse" />
                <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">AngoChat Payments</span>
              </div>
            </div>
          </header>
          
          <div className="flex-1 relative bg-white">
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <Loader2 className="text-zinc-900 animate-spin mb-4" size={32} />
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest animate-pulse">A carregar gateway...</span>
              </div>
            )}
            <iframe 
              src={iframeUrl} 
              onLoad={() => setIframeLoading(false)}
              className="w-full h-full border-none"
              title="Carregar Angocoins"
              allow="payment; camera; microphone; geolocation; clipboard-read; clipboard-write"
              sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin allow-top-navigation allow-top-navigation-by-user-activation"
            />
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md" onClick={() => setShowDeposit(false)} />
          <div className="relative bg-white border border-zinc-100 w-full max-w-sm rounded-2xl overflow-hidden shadow-xl animate-in fade-in zoom-in duration-300 text-black">
            <div className="p-8 flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest">Carregar AngoCoins</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">Escolhe o valor</p>
                </div>
                <button onClick={() => setShowDeposit(false)} className="p-2 text-zinc-400 hover:text-black transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[40, 100, 500, 1000, 5000, 10000].map(amount => (
                  <button 
                    key={amount}
                    onClick={() => setDepositAmount(amount)}
                    className={`py-4 rounded-xl font-black text-[10px] transition-all border ${
                      depositAmount === amount 
                        ? 'bg-black border-black text-white' 
                        : 'bg-zinc-50 border-zinc-100 text-zinc-400 hover:border-zinc-200'
                    }`}
                  >
                    {amount} AC
                  </button>
                ))}
              </div>

              <div className="py-6 border-y border-zinc-100 flex flex-col gap-2">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total a Pagar</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black">${(depositAmount / 100).toFixed(2)}</p>
                  <p className="text-xs font-bold text-zinc-400 uppercase">USD</p>
                </div>
              </div>

              <button 
                onClick={handleDeposit}
                disabled={saving}
                className="w-full h-14 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-3"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar Depósito'}
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
              <div className="flex flex-col items-center gap-4">
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
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
      {/* Wallet Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md" onClick={() => setShowWalletModal(false)} />
          <div className="relative bg-white border border-zinc-100 w-full max-w-sm rounded-2xl overflow-hidden shadow-xl animate-in fade-in zoom-in duration-300 text-black">
            <div className="p-8 flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest">Configurar Carteira</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">USDT (Rede BEP-20)</p>
                </div>
                <button onClick={() => setShowWalletModal(false)} className="p-2 text-zinc-400 hover:text-black transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <input 
                  type="text" 
                  value={newWalletAddress}
                  onChange={(e) => setNewWalletAddress(e.target.value)}
                  placeholder="Endereço BEP-20"
                  className="w-full bg-zinc-50 border-b border-zinc-100 px-0 py-4 text-sm focus:border-black outline-none transition-all text-black placeholder:text-zinc-300"
                />
                <p className="text-[9px] text-zinc-400 font-bold uppercase leading-relaxed">
                  ⚠️ Certifica-te que o endereço é da rede BEP-20.
                </p>
              </div>

              <button 
                onClick={handleSaveWallet}
                disabled={saving || !newWalletAddress.trim()}
                className="w-full h-14 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Carteira'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end">
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md" onClick={() => setShowWithdrawModal(false)} />
          <div className="relative bg-white border-t border-zinc-100 w-full rounded-t-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300 text-black">
            <div className="p-8 flex flex-col gap-8 pb-12">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest leading-none mb-1">Levantar Ganhos</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">Escolhe o método</p>
                </div>
                <button onClick={() => setShowWithdrawModal(false)} className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 hover:text-black transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                {/* Method Selector */}
                <div className="flex border-b border-zinc-100">
                  <button 
                    onClick={() => setWithdrawalMethod('airtm')}
                    className={`flex-1 py-4 text-[10px] font-black uppercase transition-all relative ${withdrawalMethod === 'airtm' ? 'text-black' : 'text-zinc-300'}`}
                  >
                    AirTM
                    {withdrawalMethod === 'airtm' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />}
                  </button>
                  <button 
                    onClick={() => setWithdrawalMethod('usdt')}
                    className={`flex-1 py-4 text-[10px] font-black uppercase transition-all relative ${withdrawalMethod === 'usdt' ? 'text-black' : 'text-zinc-300'}`}
                  >
                    USDT (BEP-20)
                    {withdrawalMethod === 'usdt' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black" />}
                  </button>
                </div>

                <div className="space-y-8">
                  {/* Saldo Information */}
                  <div className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Disponível</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-4xl font-black tracking-tighter leading-none">{profile?.redeemable_balance?.toFixed(0) || '0'}</p>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">AC</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-zinc-400 uppercase mb-2">Valor</p>
                      <p className="text-xl font-black">≈ ${((profile?.redeemable_balance || 0) / 100).toFixed(2)}</p>
                    </div>
                  </div>
                  
                  {/* Destination Info */}
                  <div className="space-y-4">
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                      Destino:
                    </p>
                    <p className="text-sm font-medium text-black break-all pb-2 border-b border-zinc-100">
                      {(withdrawalMethod === 'usdt' ? profile?.wallet_address : profile?.airtm_email) || 'Não configurado'}
                    </p>
                    {((withdrawalMethod === 'airtm' && !profile?.airtm_email) || (withdrawalMethod === 'usdt' && !profile?.wallet_address)) && (
                      <p className="text-[9px] text-zinc-400 font-bold uppercase">
                        ⚠️ Precisas de configurar este método primeiro
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <button 
                onClick={handleWithdraw}
                disabled={saving || (profile?.redeemable_balance || 0) < (withdrawalMethod === 'usdt' ? 100 : 50)}
                className="w-full h-16 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-3 disabled:opacity-10"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Levantamento'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* AirTM Modal */}
      {showAirTMModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md" onClick={() => setShowAirTMModal(false)} />
          <div className="relative bg-white border border-zinc-100 w-full max-w-sm rounded-2xl overflow-hidden shadow-xl animate-in fade-in zoom-in duration-300 text-black">
            <div className="p-8 flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest">Configurar AirTM</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">E-mail de Levantamento</p>
                </div>
                <button onClick={() => setShowAirTMModal(false)} className="p-2 text-zinc-400 hover:text-black transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <input 
                  type="email" 
                  value={newAirTMEmail}
                  onChange={(e) => setNewAirTMEmail(e.target.value)}
                  placeholder="teu-email@exemplo.com"
                  className="w-full bg-zinc-50 border-b border-zinc-100 px-0 py-4 text-sm focus:border-black outline-none transition-all text-black placeholder:text-zinc-300"
                />
              </div>

              <button 
                onClick={handleSaveAirTM}
                disabled={saving || !newAirTMEmail.trim()}
                className="w-full h-14 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Guardar E-mail'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileView;
