import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Profile, Post } from '../types';
import { Grid, Lock, Bookmark, MoreHorizontal, AlertCircle, Plus, LogOut, X, Camera, Check, Loader2, Heart, Calendar, MapPin, LogIn, Upload } from 'lucide-react';

interface ProfileViewProps {
  userId: string;
  isOwnProfile?: boolean;
  onNavigateToPost?: (postId: string) => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ userId, isOwnProfile, onNavigateToPost }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, likes: 0 });
  const [activeTab, setActiveTab] = useState<'posts' | 'liked' | 'saved'>('posts');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [postsPage, setPostsPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 6;
  
  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    name: '',
    bio: '',
    avatar_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Logout Modal State
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  
  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAll();
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'liked') {
      fetchLikedPosts();
    }
  }, [activeTab]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchProfile(), fetchUserPosts(), fetchStats(), checkFollowStatus()]);
    setLoading(false);
  };

  const fetchProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data);
    if (data) {
      setEditForm({
        username: data.username || '',
        name: data.name || '',
        bio: data.bio || '',
        avatar_url: data.avatar_url || ''
      });
    }
  };

  const checkFollowStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || isOwnProfile) return;

    const { data } = await supabase
      .from('follows')
      .select('*')
      .eq('follower_id', session.user.id)
      .eq('following_id', userId)
      .maybeSingle();

    setIsFollowing(!!data);
  };

  const fetchUserPosts = async (page = 0) => {
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
  };

  const fetchLikedPosts = async () => {
    setTabLoading(true);
    try {
      const { data, error } = await supabase
        .from('reactions')
        .select('post_id, posts(*, profiles(*))')
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
  };

  const fetchStats = async () => {
    const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
    const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
    
    const { data: posts } = await supabase.from('posts').select('id').eq('user_id', userId);
    let totalLikes = 0;
    if (posts && posts.length > 0) {
      const postIds = posts.map(p => p.id);
      const { count: likes } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .in('post_id', postIds)
        .eq('type', 'like');
      totalLikes = likes || 0;
    }

    setStats({ 
      followers: followers || 0, 
      following: following || 0, 
      likes: totalLikes 
    });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (activeTab !== 'posts' || !hasMorePosts || loadingMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      const nextPage = postsPage + 1;
      setPostsPage(nextPage);
      fetchUserPosts(nextPage);
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const handleLogoutConfirm = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro ao sair:", error);
      setLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  const handleLogoutCancel = () => {
    if (!loggingOut) {
      setShowLogoutModal(false);
    }
  };

  const handleFollowToggle = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert('Faz login para seguires este mambo!');
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

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      setEditError('Por favor, seleciona uma imagem válida.');
      return;
    }

    // Validar tamanho (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setEditError('A imagem deve ter no máximo 5MB.');
      return;
    }

    setUploadingAvatar(true);
    setEditError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não estás logado');

      // Gerar nome único para o arquivo
      const fileExt = file.name.split('.').pop();
      const fileName = `avatar-${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload do arquivo para o Storage
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Obter URL pública do arquivo
      const { data: { publicUrl } } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath);

      // Atualizar o form com a nova URL
      setEditForm(prev => ({ ...prev, avatar_url: publicUrl }));

    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      setEditError(err.message || 'Erro ao fazer upload da imagem.');
    } finally {
      setUploadingAvatar(false);
      // Limpar o input para poder selecionar o mesmo arquivo novamente
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
          avatar_url: editForm.avatar_url
        })
        .eq('id', userId);

      if (error) throw error;

      await fetchProfile();
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err.message || 'Erro ao atualizar o mambo do perfil.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center bg-black gap-4">
      <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!profile) return <div className="p-20 text-center text-zinc-600 uppercase font-black tracking-widest text-xs">Perfil não encontrado.</div>;

  const currentGridData = activeTab === 'posts' ? userPosts : (activeTab === 'liked' ? likedPosts : []);

  return (
    <div 
      onScroll={handleScroll}
      className="h-full w-full bg-black overflow-y-auto pb-20 no-scrollbar relative"
    >
      {/* Top Navigation Overlay */}
      <header className="sticky top-0 bg-black/80 backdrop-blur-md flex items-center justify-between px-4 h-14 border-b border-zinc-900 z-50">
        <div className="flex flex-col">
          <h1 className="font-black text-sm">{profile.name || profile.username}</h1>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{userPosts.length} Mambos</span>
        </div>
        <div className="flex gap-4">
          {isOwnProfile && (
            <button onClick={handleLogoutClick} className="text-zinc-400 hover:text-red-600 transition-all p-1">
              <LogOut size={20}/>
            </button>
          )}
          <button className="text-zinc-400 hover:text-white transition-colors p-1">
            <MoreHorizontal size={20} />
          </button>
        </div>
      </header>

      {/* Banner */}
      <div className="w-full h-32 bg-gradient-to-r from-zinc-800 to-zinc-900 relative"></div>

      {/* Profile Info Section (Estilo X) */}
      <div className="px-4 pb-4">
        <div className="flex justify-between items-start">
          <div className="relative -mt-10">
            <div className="w-20 h-20 rounded-full bg-black p-1">
              <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden border-2 border-black">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
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
          { id: 'posts', label: 'Mambos' }, 
          { id: 'liked', label: 'Curtidas' }, 
          { id: 'saved', label: 'Guardados' } 
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
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
                onClick={() => onNavigateToPost && onNavigateToPost(post.id)}
                className="aspect-[3/4] bg-zinc-900 relative group overflow-hidden active:brightness-75 transition-all cursor-pointer"
              >
                {post.media_type === 'video' ? (
                  <video src={post.media_url} className="w-full h-full object-cover" muted playsInline poster={post.thumbnail_url || undefined} />
                ) : (
                  <img src={post.media_url} className="w-full h-full object-cover" />
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
                  {activeTab === 'posts' ? 'Nenhum post ainda' : (activeTab === 'liked' ? 'Sem curtidas' : 'Sem salvos')}
                </p>
                <p className="text-[9px] text-zinc-700 uppercase">A vibe de Angola começa aqui 🇦🇴</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Profile Drawer */}
      {isEditing && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !saving && !uploadingAvatar && setIsEditing(false)} />
          <div className="relative bg-zinc-950 rounded-t-[40px] h-[85%] flex flex-col shadow-2xl border-t border-zinc-800 animate-[slideUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)]">
            <div className="flex items-center justify-between p-6 border-b border-zinc-900">
              <button 
                onClick={() => setIsEditing(false)} 
                disabled={saving || uploadingAvatar}
                className="p-2 text-zinc-500 hover:text-white transition-colors disabled:opacity-30"
              >
                <X size={24} />
              </button>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Editar Perfil</h2>
              <button 
                onClick={handleUpdateProfile}
                disabled={saving || uploadingAvatar || !editForm.username}
                className="p-2 text-red-600 hover:text-red-500 transition-colors disabled:opacity-30 flex items-center gap-2"
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={24} />}
              </button>
            </div>

            <form onSubmit={handleUpdateProfile} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar pb-32">
              <div className="flex flex-col items-center gap-4">
                {/* Avatar Upload Area */}
                <div 
                  className="relative group cursor-pointer"
                  onClick={handleAvatarClick}
                >
                  <div className="w-24 h-24 rounded-full overflow-hidden p-1 bg-zinc-800">
                    <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden">
                      {editForm.avatar_url ? (
                        <img src={editForm.avatar_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <span className="text-2xl font-black text-zinc-600 uppercase">{editForm.username[0] || '?'}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Overlay com ícone de upload */}
                  <div className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingAvatar ? (
                      <Loader2 size={24} className="text-white animate-spin" />
                    ) : (
                      <>
                        <Camera className="text-white" size={20} />
                        <span className="text-[8px] font-black text-white mt-1">MUDAR FOTO</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Input file oculto */}
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Opção de URL (mantida para compatibilidade) */}
                <div className="w-full flex items-center gap-2">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">OU URL</span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>

                <input 
                  type="text" 
                  value={editForm.avatar_url}
                  onChange={(e) => setEditForm({...editForm, avatar_url: e.target.value})}
                  placeholder="URL da Foto (HTTP...)"
                  className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-center focus:ring-1 focus:ring-red-600 outline-none transition-all text-zinc-400"
                  disabled={uploadingAvatar}
                />
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
                    disabled={uploadingAvatar}
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
                      disabled={uploadingAvatar}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-600 tracking-widest ml-1">Bio</label>
                  <textarea 
                    value={editForm.bio}
                    onChange={(e) => setEditForm({...editForm, bio: e.target.value.slice(0, 150)})}
                    placeholder="Conta um mambo sobre ti..."
                    className="w-full h-32 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-red-600 outline-none transition-all text-white placeholder:text-zinc-700 shadow-inner resize-none"
                    disabled={uploadingAvatar}
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
                disabled={saving || uploadingAvatar || !editForm.username}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 ${
                  saving || uploadingAvatar || !editForm.username ? 'bg-zinc-800 text-zinc-600' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/20'
                }`}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    A Atualizar...
                  </>
                ) : uploadingAvatar ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    A Enviar Foto...
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

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          {/* Backdrop with blur */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={handleLogoutCancel}
          />
          
          {/* Modal */}
          <div className="relative bg-zinc-950 rounded-[40px] w-full max-w-sm overflow-hidden border border-zinc-800 shadow-2xl animate-[fadeIn_0.3s_ease-out]">
            {/* Header with gradient */}
            <div className="bg-gradient-to-br from-red-600/20 to-transparent p-8 pb-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-red-600/20 flex items-center justify-center mb-4">
                <LogOut size={32} className="text-red-600" />
              </div>
              <h3 className="text-xl font-black text-center text-white mb-2">
                Sair da Banda?
              </h3>
              <p className="text-sm text-zinc-400 text-center leading-relaxed">
              Tens a certeza que queres sair? <br /> 
              Vais perder a vibe do momento.
              </p>
            </div>

            {/* Content */}
            <div className="p-6 pt-2 space-y-3">
              <button
                onClick={handleLogoutConfirm}
                disabled={loggingOut}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loggingOut ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    A Sair...
                  </>
                ) : (
                  <>
                    <LogOut size={16} />
                    Sim, Sair Agora
                  </>
                )}
              </button>
              
              <button
                onClick={handleLogoutCancel}
                disabled={loggingOut}
                className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 disabled:opacity-50"
              >
                Ficar na Banda
              </button>
            </div>

            {/* Footer note */}
            <div className="px-6 pb-6">
              <p className="text-[10px] text-center text-zinc-700 uppercase tracking-widest">
                Podes sempre voltar mais tarde 🇦🇴
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add animation keyframes to your global CSS or add them to your component */}
      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default ProfileView;
