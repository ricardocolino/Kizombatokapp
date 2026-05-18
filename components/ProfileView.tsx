import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Profile, Post } from '../types';
import { uploadToR2 } from '../services/uploadService';
import { AlertCircle, LogOut, X, Camera, Check, Loader2, Wallet, ChevronLeft, ChevronRight, Menu, Box, Settings } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';
import { Browser } from '@capacitor/browser';
import AngoCoinIcon from './AngoCoinIcon';

interface ProfileViewProps {
  userId: string;
  isOwnProfile?: boolean;
  initialAction?: string | null;
  onClearAction?: () => void;
  onNavigateToPost?: (postId: string, filter?: { userId: string; userName: string; type: 'user' | 'reposted' }) => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ 
  userId, 
  isOwnProfile, 
  initialAction, 
  onClearAction, 
  onNavigateToPost 
}) => {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, likes: 0, views: 0, comments: 0 });
  const [showDashboard, setShowDashboard] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [showDeposit, setShowDeposit] = useState(false);
  const [showExternalUrl, setShowExternalUrl] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('https://angochatpayments.vercel.app');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState(10);
  const [activeTab, setActiveTab] = useState<'posts' | 'reposts'>('posts');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasStories, setHasStories] = useState(false);
  const [postsPage, setPostsPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
  
  useEffect(() => {
    if (initialAction === 'recharge') {
      handleOpenExternalDeposit();
      onClearAction?.();
    }
  }, [initialAction, onClearAction]);

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
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
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
  }, [userId]);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchProfile(), fetchUserPosts(), fetchStats(), checkFollowStatus(), checkStoriesStatus()]);
    setLoading(false);
  }, [fetchProfile, fetchUserPosts, fetchStats, checkFollowStatus, checkStoriesStatus]);

  useEffect(() => {
    loadAll();

    const channel = supabase
      .channel(`profile_realtime_${userId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles', 
        filter: `id=eq.${userId}` 
      }, (payload) => {
        setProfile(payload.new as Profile);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadAll]);

  useEffect(() => {
    if (activeTab === 'reposts') {
      fetchRepostedPosts();
    }
  }, [activeTab, fetchRepostedPosts]);

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
      alert(t('Wallet saved success'));
    } catch (err) {
      console.error("Erro ao guardar carteira:", err);
      alert(t('Error saving wallet'));
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async () => {
    const amountCoins = profile?.redeemable_balance || 0;
    const amountUSD = amountCoins / 100;

    if (amountCoins <= 0) {
      alert(t('Insufficient balance withdraw'));
      return;
    }

    if (amountUSD < 1) {
      alert(t('Min withdraw amount'));
      return;
    }
    
    if (!profile?.wallet_address) {
      alert(t('Register wallet first'));
      setShowWalletModal(true);
      return;
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
        alert(t('One withdraw per day'));
        setShowWithdrawModal(false);
        return;
      }

      // 1. Criar pedido de levantamento
      const { error: withdrawError } = await supabase
        .from('withdrawals')
        .insert({
          user_id: userId,
          amount: amountCoins,
          wallet_address: profile.wallet_address,
          method: 'usdt',
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
      alert(t('Withdraw success message'));
    } catch (err) {
      console.error("Erro ao processar levantamento:", err);
      alert(t('Error processing withdraw'));
    } finally {
      setSaving(false);
    }
  };

  const handleClaimEarnings = React.useCallback(async (silent = false) => {
    if (!profile) return;
    
    // Taxa: 1 visualização = 1 AngoCoin ($0.01)
    const VIEW_RATE = 1; 
    const unclaimedViews = stats.views - (profile.claimed_views || 0);
    
    if (unclaimedViews <= 0) {
      if (!silent) alert(t('No earnings to claim'));
      return;
    }

    const earningsToClaim = Math.floor(unclaimedViews * VIEW_RATE);
    
    if (earningsToClaim <= 0) {
        if (!silent) {
          const required = Math.ceil(1 / VIEW_RATE);
          alert(t('Minimum views required', { count: required - unclaimedViews }));
        }
        return;
    }

    // Se estiver em modo automático e estivermos a carregar algo, ignoramos para evitar conflitos
    if (silent && saving) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          redeemable_balance: (profile.redeemable_balance || 0) + earningsToClaim,
          claimed_views: (profile.claimed_views || 0) + (Math.floor(earningsToClaim / VIEW_RATE))
        })
        .eq('id', userId);

      if (error) throw error;

      await fetchProfile();
      if (!silent) alert(t('Earnings claimed success', { amount: earningsToClaim }));
    } catch (err) {
      console.error('Error claiming views:', err);
      if (!silent) alert(t('Error claiming earnings'));
    } finally {
      setSaving(false);
    }
  }, [profile, stats.views, t, userId, fetchProfile, saving]);

  // Resgate Automático de Ganhos
  useEffect(() => {
    if (isOwnProfile && profile && stats.views > (profile.claimed_views || 0)) {
      const unclaimed = stats.views - (profile.claimed_views || 0);
      if (unclaimed >= 1 && !saving) {
        handleClaimEarnings(true);
      }
    }
  }, [stats.views, profile, isOwnProfile, saving, handleClaimEarnings]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setEditError(t('Photo too heavy'));
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
      setEditError(err instanceof Error ? err.message : t('Error uploading photo'));
    } finally {
      setSaving(false);
      if (e.target) e.target.value = '';
    }
  };

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center bg-black gap-4">
      <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!profile) return <div className="p-20 text-center text-zinc-600 uppercase font-black tracking-widest text-xs">{t('Profile not found')}</div>;

  const currentGridData = activeTab === 'posts' ? userPosts : repostedPosts;

  return (
    <div 
      onScroll={handleScroll}
      className="h-full w-full bg-white overflow-y-auto pb-20 no-scrollbar relative text-black"
    >
      {/* Top Navigation Overlay */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-md flex items-center justify-between px-4 h-14 border-b border-zinc-100 z-50">
        <div className="flex flex-col">
          <h1 className="font-bold text-sm text-black">{profile.name || profile.username}</h1>
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{userPosts.length} {t('Posts')}</span>
        </div>
        <div className="flex gap-4">
          {isOwnProfile && (
            <div className="relative">
              <button 
                onClick={() => setShowMenu(true)} 
                className="text-black hover:opacity-70 transition-all p-1"
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

          <div className="flex-1 px-6 py-12 space-y-8 overflow-y-auto">
            <button 
              onClick={() => {
                setIsEditing(true);
                setShowMenu(false);
              }} 
              className="w-full flex items-center gap-4 text-zinc-800 group"
            >
              <div className="text-zinc-900 opacity-80 group-hover:opacity-100 transition-opacity">
                <Settings size={22} strokeWidth={1.5} />
              </div>
              <span className="text-xl font-light tracking-tight">{t('Edit Profile')}</span>
            </button>

            <button 
              onClick={() => {
                setShowLanguageMenu(true);
                setShowMenu(false);
              }} 
              className="w-full flex items-center gap-4 text-zinc-800 group"
            >
              <div className="text-zinc-900 opacity-80 group-hover:opacity-100 transition-opacity">
                <Box size={22} strokeWidth={1.5} />
              </div>
              <span className="text-xl font-light tracking-tight">{t('Language')}</span>
            </button>

            <button
              onClick={() => {
                setShowMenu(false);
                setShowLogoutModal(true);
              }}
              className="w-full flex items-center gap-4 text-purple-600 group"
            >
              <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                <LogOut size={22} strokeWidth={1.5} />
              </div>
              <span className="text-xl font-light tracking-tight">{t('Logout')}</span>
            </button>
          </div>

          <div className="p-8 border-t border-zinc-50 mt-auto flex justify-center">
            <p className="text-[9px] text-zinc-300 uppercase tracking-[0.4em] font-medium">huzty v2.0</p>
          </div>
        </div>
      )}

      {/* Language Selection View (Full Screen) */}
      {showLanguageMenu && (
        <div className="fixed inset-0 z-[1000] bg-white flex flex-col animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between p-6 h-20 shrink-0">
            <button 
              onClick={() => setShowLanguageMenu(false)} 
              className="p-2 -ml-2 text-black transition-opacity hover:opacity-50"
            >
              <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-zinc-400 text-center flex-1 pr-8">{t('Language')}</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-32">
            <div className="space-y-2">
              {[
                { code: 'en', name: t('English') },
                { code: 'pt', name: t('Portuguese') },
                { code: 'fr', name: t('French') },
                { code: 'es', name: t('Spanish') },
                { code: 'ru', name: t('Russian') },
                { code: 'zh', name: t('Chinese') }
              ].map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    setShowLanguageMenu(false);
                  }}
                  className={`w-full flex items-center justify-between p-6 rounded-2xl transition-all ${
                    i18n.language === lang.code 
                      ? 'bg-black text-white shadow-xl shadow-black/10' 
                      : 'bg-zinc-50 text-zinc-900 border border-zinc-100 hover:bg-zinc-100'
                  }`}
                >
                  <span className="text-lg font-light tracking-tight">{lang.name}</span>
                  {i18n.language === lang.code && <Check size={20} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Profile Info Section (Centralizado) */}
      <div className="px-4 pb-6 pt-10 flex flex-col items-center text-center">
        <div className="relative">
          <div className={`w-28 h-28 rounded-xl bg-white p-1 ${hasStories ? 'ring-2 ring-purple-600' : ''}`}>
            <div 
              onClick={() => hasStories && onNavigateToPost && onNavigateToPost('story:' + userId)}
              className={`w-full h-full rounded-xl bg-zinc-50 flex items-center justify-center overflow-hidden border border-zinc-100 ${hasStories ? 'cursor-pointer' : ''}`}
            >
              {profile.avatar_url ? (
                <img src={parseMediaUrl(profile.avatar_url)} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-3xl font-light text-zinc-400">{profile.username[0].toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <h2 className="text-2xl font-bold text-black leading-tight tracking-tight">{profile.name || profile.username}</h2>
          <p className="text-sm text-zinc-400 font-medium">@{profile.username}</p>
        </div>

        {profile.bio && (
          <p className="text-[13px] text-zinc-600 mt-4 leading-relaxed break-words whitespace-pre-wrap max-w-xs font-light">
            {profile.bio}
          </p>
        )}

        <div className="flex gap-10 mt-10">
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold text-black">{stats.following}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mt-1">{t('Following_count')}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold text-black">{stats.followers}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mt-1">{t('Followers')}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold text-black">{stats.likes}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mt-1">{t('Likes')}</span>
          </div>
        </div>

        <div className="flex gap-3 mt-10 w-full max-w-xs">
          {isOwnProfile ? (
            <>
              <button 
                onClick={() => setShowDashboard(true)}
                className="flex-1 h-10 bg-zinc-100 text-black rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Wallet size={16} />
                {t('Wallet')}
              </button>
            </>
          ) : (
            <button 
              onClick={handleFollowToggle}
              className={`w-full h-10 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95 ${
                isFollowing 
                  ? 'bg-black text-white' 
                  : 'bg-zinc-100 text-black'
              }`}
            >
              {isFollowing ? t('Following') : t('Follow')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs (Estilo X) */}
      <div className="flex border-b border-zinc-100 sticky top-14 bg-white/95 backdrop-blur-md z-40">
        {[ 
          { id: 'posts', label: t('Posts') }, 
          { id: 'reposts', label: t('Reposts') }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'posts' | 'reposts')}
            className="flex-1 flex flex-col items-center justify-center pt-4 transition-all relative"
          >
            <span className={`text-[11px] font-bold uppercase tracking-widest pb-3 ${activeTab === tab.id ? 'text-black' : 'text-zinc-300'}`}>
              {tab.label}
            </span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 w-12 h-[3px] bg-black rounded-full" />
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
                  type: activeTab === 'posts' ? 'user' : 'reposted' 
                })}
                className="aspect-[3/4] bg-zinc-50 relative group overflow-hidden active:brightness-75 transition-all cursor-pointer border-[0.5px] border-zinc-100"
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
                <div className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[9px] font-bold text-white drop-shadow-sm">
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
              <div className="col-span-3 py-24 text-center text-zinc-300 flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
                  <Box size={24} strokeWidth={1} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em]">
                  {activeTab === 'posts' ? t('No posts yet') : t('No reposts yet')}
                </p>
                <p className="text-[9px] text-zinc-200 uppercase">{t('The vibe starts here')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLogoutModal(false)} />
          <div className="relative bg-white border border-zinc-100 w-full max-w-xs rounded-[40px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="p-10 flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-full bg-zinc-50 border border-zinc-100 flex items-center justify-center text-black">
                <LogOut size={24} strokeWidth={1} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-light tracking-tight text-black">{t('Leave the group?')}</h3>
                <p className="text-sm text-zinc-400 font-light leading-relaxed">
                  {t('Leave vibe message')}
                </p>
              </div>

              <div className="w-full space-y-3 pt-4">
                <button 
                  onClick={handleLogout}
                  className="w-full h-14 bg-black text-white rounded-full font-medium uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95 shadow-lg shadow-black/5"
                >
                  {t('Yes, Leave Now')}
                </button>
                <button 
                  onClick={() => setShowLogoutModal(false)}
                  className="w-full h-14 bg-zinc-50 text-zinc-400 rounded-full font-medium uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95"
                >
                  {t('Stay in group')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Fullscreen View (Carteira) */}
      {showDashboard && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-right duration-300 text-black">
          {/* Header Minimalista */}
          <header className="flex items-center justify-between px-6 h-20 shrink-0">
            <button 
              onClick={() => setShowDashboard(false)}
              className="p-2 -ml-2 text-black transition-opacity hover:opacity-50"
            >
              <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
            <h1 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-900">{t('Wallet')}</h1>
            <div className="w-10" /> {/* Spacer */}
          </header>

          <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-32">
            {/* Hero Section: Balanço Principal */}
            <button 
              onClick={() => setShowWithdrawModal(true)}
              className="w-full py-12 flex flex-col items-center justify-center border-b border-zinc-100 group active:opacity-70 transition-all"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-900 font-black">{t('Total Balance')} (USD)</span>
                <ChevronRight size={14} strokeWidth={2.5} className="text-zinc-400" />
              </div>
              <div className="flex items-start">
                <span className="text-xl font-medium mt-1 mr-1 text-zinc-900">$</span>
                <h1 className="text-6xl font-semibold tracking-tighter text-zinc-900">
                  {((profile.redeemable_balance || 0) / 100).toFixed(2)}
                </h1>
              </div>
            </button>

            {/* Ganhos de Conteúdo */}
            <div className="py-10 border-b border-zinc-100">
              <div className="flex flex-col items-center gap-6">
                <div className="flex flex-col items-center text-center gap-2">
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-zinc-900 font-black">{t('Content Earnings')}</h2>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex flex-col items-center">
                       <span className="text-sm font-black text-black">{stats.views}</span>
                       <span className="text-[8px] text-zinc-400 uppercase font-bold">{t('Total Views')}</span>
                    </div>
                    <div className="w-[1px] h-4 bg-zinc-100" />
                    <div className="flex flex-col items-center">
                       <span className="text-sm font-black text-black">{profile?.claimed_views || 0}</span>
                       <span className="text-[8px] text-zinc-400 uppercase font-bold">{t('Claimed')}</span>
                    </div>
                  </div>
                </div>

                <div className="w-full bg-zinc-50 rounded-[32px] p-8 border border-zinc-100 flex flex-col items-center gap-4">
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t('Estimated')} (AngoCoins)</span>
                    <div className="flex items-center gap-2">
                      <AngoCoinIcon size={18} />
                      <span className="text-3xl font-black text-zinc-900">
                        {Math.floor((stats.views - (profile?.claimed_views || 0)) * 1)}
                      </span>
                    </div>
                  </div>

                  <button 
                    disabled={true}
                    className="w-full h-14 bg-zinc-100 text-zinc-400 rounded-full font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-3"
                  >
                    <Check size={16} className="text-green-500" />
                    {t('Automated Earnings')}
                  </button>
                </div>
              </div>
            </div>

            {/* Botão de Moedas Rápido */}
            <div className="pt-8 flex justify-start">
              <button 
                onClick={handleOpenExternalDeposit}
                className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 px-4 py-2.5 rounded-full active:scale-95 transition-all group"
              >
                <AngoCoinIcon size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-900">
                  {t('Coins')} {profile.balance?.toFixed(0) || '0'} — {t('Charge Coins')}
                </span>
                <ChevronRight size={12} strokeWidth={2.5} className="text-zinc-400 ml-1" />
              </button>
            </div>

            {/* Method Button Only */}
            <div className="py-10 border-b border-zinc-100">
              <button 
                onClick={() => {
                  setNewWalletAddress(profile?.wallet_address || '');
                  setShowWalletModal(true);
                }}
                className="flex flex-col items-center gap-3 group transition-all mx-auto"
              >
                <div className="w-14 h-14 rounded-full border border-zinc-100 text-black flex items-center justify-center group-active:scale-95 transition-transform">
                  <Settings size={22} strokeWidth={1.2} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900">{t('Payment Method')}</span>
              </button>
            </div>

              <div className="text-center pt-8">
                <p className="text-[9px] text-zinc-300 uppercase tracking-[0.4em] font-medium">huzty Security</p>
              </div>
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
              <span className="text-sm font-black uppercase tracking-widest">{t('Secure Payment')}</span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-900 animate-pulse" />
                <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">huzty Payments</span>
              </div>
            </div>
          </header>
          
          <div className="flex-1 relative bg-white">
            {iframeLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <Loader2 className="text-zinc-900 animate-spin mb-4" size={32} />
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest animate-pulse">{t('Loading')}...</span>
              </div>
            )}
            <iframe 
              src={iframeUrl} 
              onLoad={() => setIframeLoading(false)}
              className="w-full h-full border-none"
              title={t('Charge AngoCoins')}
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
                  <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900">{t('Charge AngoCoins')}</h3>
                  <p className="text-[10px] text-zinc-900 font-black uppercase tracking-tighter">{t('Choose value')}</p>
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
                    className={`py-4 rounded-xl font-black text-[10px] transition-all border flex items-center justify-center gap-1.5 ${
                      depositAmount === amount 
                        ? 'bg-black border-black text-white' 
                        : 'bg-zinc-50 border-zinc-100 text-zinc-900'
                    }`}
                  >
                    {amount} <AngoCoinIcon size={12} />
                  </button>
                ))}
              </div>

              <div className="py-6 border-y border-zinc-100 flex flex-col gap-2">
                <p className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">{t('Total to Pay')}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-zinc-900">${(depositAmount / 100).toFixed(2)}</p>
                  <p className="text-xs font-bold text-zinc-900 uppercase">USD</p>
                </div>
              </div>

              <button 
                onClick={handleDeposit}
                disabled={saving}
                className="w-full h-14 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-3"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : t('Confirm Deposit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile View (Full Screen) */}
      {isEditing && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between p-6 h-20 shrink-0">
            <button 
              onClick={() => setIsEditing(false)} 
              disabled={saving}
              className="p-2 -ml-2 text-black transition-opacity hover:opacity-50 disabled:opacity-30"
            >
              <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-zinc-400 text-center flex-1 pr-8">{t('Edit Profile Header')}</h2>
          </div>

          <form onSubmit={handleUpdateProfile} className="flex-1 overflow-y-auto px-6 no-scrollbar pb-32">
            <div className="flex flex-col items-center gap-6 py-10 border-b border-zinc-100 mb-10">
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
                <div className="w-28 h-28 rounded-xl overflow-hidden p-1 bg-zinc-50 border border-zinc-100">
                  <div className="w-full h-full rounded-xl bg-zinc-100 flex items-center justify-center overflow-hidden">
                    {editForm.avatar_url ? (
                      <img src={parseMediaUrl(editForm.avatar_url)} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <span className="text-3xl font-extralight text-zinc-400 uppercase">{editForm.username[0] || '?'}</span>
                    )}
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-8 h-8 bg-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  <Camera className="text-white" size={14} />
                </div>
                {saving && (
                  <div className="absolute inset-0 bg-white/60 rounded-full flex items-center justify-center">
                    <Loader2 className="text-black animate-spin" size={24} />
                  </div>
                )}
              </div>
              <button 
                type="button"
                onClick={handleAvatarClick}
                className="text-[10px] font-black uppercase text-purple-600 tracking-widest hover:opacity-70 transition-opacity"
              >
                {t('Change Photo')}
              </button>
            </div>

            <div className="space-y-10">
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase text-zinc-400 tracking-widest ml-1">{t('Full Name')}</label>
                <input 
                  type="text" 
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  placeholder={t('Name')}
                  className="w-full bg-white border-b border-zinc-100 px-0 py-4 text-base font-light focus:border-black outline-none transition-all text-black placeholder:text-zinc-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase text-zinc-400 tracking-widest ml-1">{t('Username')}</label>
                <div className="relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-300 font-light text-base">@</span>
                  <input 
                    type="text" 
                    value={editForm.username}
                    onChange={(e) => setEditForm({...editForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')})}
                    placeholder={t('Username').toLowerCase()}
                    className="w-full bg-white border-b border-zinc-100 pl-6 pr-0 py-4 text-base font-light focus:border-black outline-none transition-all text-black placeholder:text-zinc-200"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase text-zinc-400 tracking-widest ml-1">{t('Biography')}</label>
                <textarea 
                  value={editForm.bio}
                  onChange={(e) => setEditForm({...editForm, bio: e.target.value.slice(0, 150)})}
                  placeholder="Bio..."
                  className="w-full h-24 bg-white border-b border-zinc-100 px-0 py-4 text-sm font-light focus:border-black outline-none transition-all text-black placeholder:text-zinc-200 resize-none"
                />
                <div className="flex justify-end">
                  <span className="text-[9px] font-medium text-zinc-200 uppercase tracking-widest">{editForm.bio.length}/150</span>
                </div>
              </div>
            </div>

            {editError && (
              <div className="mt-8 p-4 rounded-3xl flex items-center gap-3 text-purple-600 text-[10px] font-black uppercase tracking-widest bg-purple-600/10 border border-purple-600/20">
                <AlertCircle size={16} />
                {editError}
              </div>
            )}
          </form>

          <div className="p-6 pb-24 bg-white shrink-0">
            <button 
              onClick={handleUpdateProfile}
              disabled={saving || !editForm.username}
              className={`w-full h-16 rounded-full font-medium uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all flex items-center justify-center gap-3 ${
                saving || !editForm.username ? 'bg-zinc-100 text-zinc-300' : 'bg-black text-white'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('Loading')}...
                </>
              ) : (
                <>
                  <Check size={16} strokeWidth={1} />
                  {t('Save Changes')}
                </>
              )}
            </button>
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
                  <h3 className="text-sm font-black uppercase tracking-widest">{t('Configure Wallet')}</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">USDT ({t('Network')} BEP-20)</p>
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
                  placeholder={t('Destination Address') + " (BEP-20)"}
                  className="w-full bg-zinc-50 border-b border-zinc-100 px-0 py-4 text-sm focus:border-black outline-none transition-all text-black placeholder:text-zinc-300"
                />
                <p className="text-[9px] text-zinc-400 font-bold uppercase leading-relaxed">
                  {t('BEP20 Warning')}
                </p>
              </div>

              <button 
                onClick={handleSaveWallet}
                disabled={saving || !newWalletAddress.trim()}
                className="w-full h-14 bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal Fullscreen */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in slide-in-from-right duration-300 text-black">
          {/* Header Minimalista */}
          <header className="flex items-center justify-between px-6 h-20 shrink-0">
            <button 
              onClick={() => setShowWithdrawModal(false)}
              className="p-2 -ml-2 text-black transition-opacity hover:opacity-50"
            >
              <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
            <h1 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-900">{t('Withdraw Earnings')}</h1>
            <div className="w-10" /> {/* Spacer */}
          </header>

          <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-32">
            <div className="flex flex-col gap-10 py-8">
              <div className="text-center space-y-2">
                <p className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">{t('Available for Withdrawal')}</p>
                <div className="flex items-baseline justify-center gap-2">
                  <p className="text-6xl font-semibold tracking-tighter leading-none">${((profile?.redeemable_balance || 0) / 100).toFixed(2)}</p>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">USD</p>
                </div>
                <p className="text-sm text-zinc-400 font-light">≈ {profile?.redeemable_balance?.toFixed(0) || '0'} AngoCoins</p>
              </div>

              <div className="space-y-8 pt-10">
                <div className="space-y-6">
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-zinc-900 font-black">{t('Selected Method')}</h2>
                  <div className="p-8 bg-zinc-50 rounded-[32px] border border-zinc-100 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center shadow-lg shadow-black/5">
                        <Wallet size={20} strokeWidth={1.5} />
                      </div>
                      <span className="text-sm font-medium">USDT ({t('Network')} BEP-20)</span>
                    </div>
                    
                    <div className="space-y-2 pt-2 border-t border-zinc-100 mt-2">
                      <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{t('Destination Address')}</p>
                      <p className="text-sm font-medium text-black break-all">
                        {profile?.wallet_address || t('Not configured')}
                      </p>
                      {!profile?.wallet_address && (
                        <button 
                          onClick={() => {
                            setNewWalletAddress('');
                            setShowWalletModal(true);
                          }}
                          className="text-[10px] font-black uppercase text-purple-600 tracking-widest mt-2 hover:opacity-70 transition-opacity"
                        >
                          {t('Configure Wallet')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-10">
                <button 
                  onClick={handleWithdraw}
                  disabled={saving || (profile?.redeemable_balance || 0) < 100}
                  className="w-full h-20 bg-black text-white rounded-full font-medium uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-3 disabled:bg-zinc-100 disabled:text-zinc-300 active:scale-95 shadow-xl shadow-black/5"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : t('Confirm Withdrawal')}
                </button>
                {(profile?.redeemable_balance || 0) < 100 && (
                  <p className="text-center mt-4 text-[9px] text-zinc-300 uppercase tracking-widest">
                    {t('Min required')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileView;
