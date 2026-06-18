import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Profile, Post, FeedFilter, Story } from '../types';
import { uploadToR2 } from '../services/uploadService';
import { AlertCircle, LogOut, X, Camera, Check, Loader2, Wallet, ChevronLeft, ChevronRight, Menu, Box, Settings, ArrowLeft, Gift, DollarSign, Lock, Unlock, Trash2, Play, Edit3, BarChart3, Film, Layers, Pin, Plus } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';
import { Browser } from '@capacitor/browser';
import AngoCoinIcon from './AngoCoinIcon';
import StoryViewer from './StoryViewer';

interface ProfileViewProps {
  userId: string;
  isOwnProfile?: boolean;
  initialAction?: string | null;
  onClearAction?: () => void;
  onNavigateToPost?: (postId: string, filter?: FeedFilter) => void;
  onNavigateToProfile?: (userId: string) => void;
  onBack?: () => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ 
  userId, 
  isOwnProfile, 
  initialAction, 
  onClearAction, 
  onNavigateToPost,
  onNavigateToProfile,
  onBack
}) => {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showBigAvatar, setShowBigAvatar] = useState(false);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [repostedPosts, setRepostedPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, likes: 0, views: 0, comments: 0 });
  
  // Follow modal states
  const [followModalType, setFollowModalType] = useState<'followers' | 'following' | null>(null);
  const [followListUsers, setFollowListUsers] = useState<{ id: string; username: string; name?: string; avatar_url?: string; }[]>([]);
  const [loadingFollowList, setLoadingFollowList] = useState(false);
  const [followListPage, setFollowListPage] = useState(0);
  const [hasMoreFollows, setHasMoreFollows] = useState(true);
  const [loadingMoreFollows, setLoadingMoreFollows] = useState(false);

  const [selectedPostForEdit, setSelectedPostForEdit] = useState<Post | null>(null);
  const [privatePostIds, setPrivatePostIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('private_posts') || '[]');
    } catch {
      return [];
    }
  });

  // Story Highlights Type Declarations
  interface HighlightItem {
    story_id?: string;
    media_url: string;
    media_type: 'image' | 'video';
  }

  interface Highlight {
    id: string;
    user_id: string;
    title: string;
    cover_url: string;
    items: HighlightItem[];
    created_at?: string;
  }

  // Story Highlights State
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(null);
  const [showCreateHighlightModal, setShowCreateHighlightModal] = useState(false);
  const [newHighlightTitle, setNewHighlightTitle] = useState('');
  const [newHighlightCover, setNewHighlightCover] = useState('');
  const [creatingHighlight, setCreatingHighlight] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userUploadedStories, setUserUploadedStories] = useState<Story[]>([]);
  const [loadingUserUploadedStories, setLoadingUserUploadedStories] = useState(false);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);

  const handleTogglePrivacy = async (post: Post) => {
    if (!post) return;
    const isCurrentlyPrivate = post.is_private || privatePostIds.includes(post.id);
    const newPrivateStatus = !isCurrentlyPrivate;
    
    try {
      // 1. Update in local storage fallback
      let updatedList = [...privatePostIds];
      if (newPrivateStatus) {
        if (!updatedList.includes(post.id)) {
          updatedList.push(post.id);
        }
      } else {
        updatedList = updatedList.filter(id => id !== post.id);
      }
      setPrivatePostIds(updatedList);
      localStorage.setItem('private_posts', JSON.stringify(updatedList));

      // Update local posts array state
      setUserPosts(prev => prev.map(p => {
        if (p.id === post.id) {
          return { ...p, is_private: newPrivateStatus };
        }
        return p;
      }));

      // 2. Try to update in Supabase
      await supabase
        .from('posts')
        .update({ is_private: newPrivateStatus })
        .eq('id', post.id);

    } catch (err) {
      console.error("Error setting video privacy:", err);
    }
    
    setSelectedPostForEdit(null);
  };

  const handleDeletePost = async (post: Post) => {
    if (!post) return;
    
    const confirmDelete = window.confirm(t('Are you sure you want to delete this video?', 'Tem a certeza que deseja eliminar este vídeo?'));
    if (!confirmDelete) return;

    try {
      // Delete from Supabase
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

      if (error) {
        console.error("Supabase delete failed:", error);
      }

      // Update UI state
      setUserPosts(prev => prev.filter(p => p.id !== post.id));
      
      // Also remove it from local private list if present
      const updatedPrivate = privatePostIds.filter(id => id !== post.id);
      setPrivatePostIds(updatedPrivate);
      localStorage.setItem('private_posts', JSON.stringify(updatedPrivate));

    } catch (err) {
      console.error("Error deleting video:", err);
    }

    setSelectedPostForEdit(null);
  };

  const handleTogglePin = async (post: Post) => {
    if (!post) return;
    const isPinned = !!(post as { is_pinned?: boolean }).is_pinned;
    
    if (!isPinned) {
      // Check count
      const pinnedCount = userPosts.filter(p => (p as { is_pinned?: boolean }).is_pinned).length;
      if (pinnedCount >= 3) {
        alert(t('You can only pin up to 3 posts', 'Apenas 3 publicações podem ser afixadas!'));
        setSelectedPostForEdit(null);
        return;
      }
    }

    try {
      // 1. Optimistically update local state
      setUserPosts(prev => prev.map(p => {
        if (p.id === post.id) {
          return { ...p, is_pinned: !isPinned };
        }
        return p;
      }));

      // 2. Try to update in Supabase
      const { error } = await supabase
        .from('posts')
        .update({ is_pinned: !isPinned })
        .eq('id', post.id);

      if (error) {
        console.error("Supabase pin update failed:", error);
        // Revert local state
        setUserPosts(prev => prev.map(p => {
          if (p.id === post.id) {
            return { ...p, is_pinned: isPinned };
          }
          return p;
        }));
      } else {
        alert(isPinned 
          ? t('Post unpinned successfully', 'Publicação desafixada com sucesso!')
          : t('Post pinned successfully', 'Publicação afixada com sucesso!')
        );
      }
    } catch (err) {
      console.error("Error setting video pin status:", err);
    }
    
    setSelectedPostForEdit(null);
  };

  // Save post edit/caption state
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [newPostContent, setNewPostContent] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);

  // Statistics modal state
  const [viewingStatsPost, setViewingStatsPost] = useState<Post | null>(null);
  const [postStatsData, setPostStatsData] = useState<{
    views: number;
    likes: number;
    reposts: number;
    giftsCoins: number;
  } | null>(null);
  const [loadingPostStats, setLoadingPostStats] = useState(false);

  const handleUpdateCaption = async () => {
    if (!editingPost) return;
    setUpdateLoading(true);
    try {
      const { error } = await supabase
        .from('posts')
        .update({ content: newPostContent || null })
        .eq('id', editingPost.id);

      if (error) throw error;

      // Update local state
      setUserPosts(prev => prev.map(p => {
        if (p.id === editingPost.id) {
          return { ...p, content: newPostContent || null };
        }
        return p;
      }));

      alert(t('Caption updated successfully', 'Legenda atualizada com sucesso!'));
      setEditingPost(null);
    } catch (err) {
      console.error("Error updating video title:", err);
      alert(t('Error updating title', 'Erro ao atualizar o título do vídeo'));
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleOpenStats = async (post: Post) => {
    setViewingStatsPost(post);
    setLoadingPostStats(true);
    setSelectedPostForEdit(null); // Close active bottom sheet first

    try {
      // Fetch likes count
      const { count: likesCount } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', post.id)
        .eq('type', 'like');

      // Fetch reposts count
      const { count: repostsCount } = await supabase
        .from('reposts')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', post.id);

      // Get gifts from localStorage
      let giftsCoinsValue = 0;
      try {
        giftsCoinsValue = Number(localStorage.getItem(`post_gifts_${post.id}`) || '0');
      } catch { /* ignore */ }

      setPostStatsData({
        views: post.views || 0,
        likes: likesCount || 0,
        reposts: repostsCount || 0,
        giftsCoins: giftsCoinsValue
      });
    } catch (err) {
      console.error("Error loading post stats:", err);
      setPostStatsData({
        views: post.views || 0,
        likes: 0,
        reposts: 0,
        giftsCoins: 0
      });
    } finally {
      setLoadingPostStats(false);
    }
  };

  const [showDashboard, setShowDashboard] = useState(false);
  const [showMonetization, setShowMonetization] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [showDeposit, setShowDeposit] = useState(false);
  const [showExternalUrl, setShowExternalUrl] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('https://angochatpayments.vercel.app');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState(10);
  const [activeTab, setActiveTab] = useState<'posts' | 'reposts' | 'private'>('posts');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasStories, setHasStories] = useState(false);
  const [postsPage, setPostsPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 6;
  const VIEW_RATE = 0.001; // Taxa: 1 visualização = 0.001 AngoCoins ($0.00001)

  const [topGivers, setTopGivers] = useState<{
    id: string;
    username: string;
    name?: string;
    avatar_url?: string;
    totalCoins: number;
    giftCount: number;
  }[]>([]);
  const [loadingGivers, setLoadingGivers] = useState(false);
  const [showGiversList, setShowGiversList] = useState(false);

  const fetchTopGivers = async () => {
    setLoadingGivers(true);
    try {
      const { data: userLives, error: livesError } = await supabase
        .from('lives')
        .select('id')
        .eq('host_id', userId);

      if (livesError) throw livesError;

      const liveIds = userLives?.map(l => l.id) || [];
      const giversMap: { [key: string]: { totalCoins: number; giftCount: number; sender_id: string } } = {};

      if (liveIds.length > 0) {
        const { data: liveGifts, error: giftsError } = await supabase
          .from('live_gifts')
          .select('sender_id, price_at_time')
          .in('live_id', liveIds);

        if (giftsError) throw giftsError;

        if (liveGifts) {
          liveGifts.forEach(gift => {
            const sid = gift.sender_id;
            const price = gift.price_at_time || 0;
            if (!giversMap[sid]) {
              giversMap[sid] = { totalCoins: 0, giftCount: 0, sender_id: sid };
            }
            giversMap[sid].totalCoins += price;
            giversMap[sid].giftCount += 1;
          });
        }
      }

      const uniqueSenderIds = Object.keys(giversMap);
      const finalGiversList: {
        id: string;
        username: string;
        name?: string;
        avatar_url?: string;
        totalCoins: number;
        giftCount: number;
      }[] = [];

      if (uniqueSenderIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, name, avatar_url')
          .in('id', uniqueSenderIds);

        if (profilesError) throw profilesError;

        if (profilesData) {
          profilesData.forEach(p => {
            const stats = giversMap[p.id];
            if (stats) {
              finalGiversList.push({
                id: p.id,
                username: p.username,
                name: p.name,
                avatar_url: p.avatar_url,
                totalCoins: stats.totalCoins,
                giftCount: stats.giftCount,
              });
            }
          });
        }
      }

      finalGiversList.sort((a, b) => b.totalCoins - a.totalCoins);
      setTopGivers(finalGiversList);
    } catch (err) {
      console.error("Error fetching givers:", err);
    } finally {
      setLoadingGivers(false);
    }
  };

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
  const [isClaimingContent, setIsClaimingContent] = useState(false);
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

  const fetchHighlights = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('story_highlights')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        setHighlights(data);
      } else {
        // Fallback or seed default themed highlights for a gorgeous profile view
        const defaultHighlights = [
          {
            id: 'mock-1',
            user_id: userId,
            title: 'NYC 🇺🇸',
            cover_url: 'https://images.unsplash.com/photo-1546015720-b8b30df5aa27?w=300&h=300&fit=crop',
            items: [
              { media_url: 'https://images.unsplash.com/photo-1546015720-b8b30df5aa27?w=1080&h=1920&fit=crop', media_type: 'image' },
              { media_url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1080&h=1920&fit=crop', media_type: 'image' }
            ]
          },
          {
            id: 'mock-2',
            user_id: userId,
            title: 'Suíça 🇨🇭',
            cover_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=300&h=300&fit=crop',
            items: [
              { media_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1080&h=1920&fit=crop', media_type: 'image' }
            ]
          },
          {
            id: 'mock-3',
            user_id: userId,
            title: 'México 🇲🇽',
            cover_url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=300&h=300&fit=crop',
            items: [
              { media_url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1080&h=1920&fit=crop', media_type: 'image' }
            ]
          },
          {
            id: 'mock-4',
            user_id: userId,
            title: 'Paraguai 🇵🇾',
            cover_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=300&h=300&fit=crop',
            items: [
              { media_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1080&h=1920&fit=crop', media_type: 'image' }
            ]
          }
        ];
        setHighlights(defaultHighlights);
      }
    } catch (err) {
      console.warn("Could not load highlights from Supabase table. Using themed mock highlights fallback.", err);
      const defaultHighlights = [
        {
          id: 'mock-1',
          user_id: userId,
          title: 'NYC 🇺🇸',
          cover_url: 'https://images.unsplash.com/photo-1546015720-b8b30df5aa27?w=300&h=300&fit=crop',
          items: [
            { media_url: 'https://images.unsplash.com/photo-1546015720-b8b30df5aa27?w=1080&h=1920&fit=crop', media_type: 'image' },
            { media_url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1080&h=1920&fit=crop', media_type: 'image' }
          ]
        },
        {
          id: 'mock-2',
          user_id: userId,
          title: 'Suíça 🇨🇭',
          cover_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=300&h=300&fit=crop',
          items: [
            { media_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1080&h=1920&fit=crop', media_type: 'image' }
          ]
        },
        {
          id: 'mock-3',
          user_id: userId,
          title: 'México 🇲🇽',
          cover_url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=300&h=300&fit=crop',
          items: [
            { media_url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1080&h=1920&fit=crop', media_type: 'image' }
          ]
        },
        {
          id: 'mock-4',
          user_id: userId,
          title: 'Paraguai 🇵🇾',
          cover_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=300&h=300&fit=crop',
          items: [
            { media_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1080&h=1920&fit=crop', media_type: 'image' }
          ]
        }
      ];
      setHighlights(defaultHighlights);
    }
  }, [userId]);

  const handleDeleteHighlight = async (highlightId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmDelete = window.confirm(t('Are you sure you want to delete this highlight?', 'Tem a certeza que deseja eliminar este destaque?'));
    if (!confirmDelete) return;

    try {
      if (!highlightId.startsWith('mock-')) {
        await supabase
          .from('story_highlights')
          .delete()
          .eq('id', highlightId);
      }
      
      setHighlights(prev => prev.filter(h => h.id !== highlightId));
      setSelectedHighlight(null);
      alert(t('Highlight deleted successfully', 'Destaque eliminado com sucesso!'));
    } catch (err) {
      console.error("Error deleting highlight:", err);
    }
  };

  const fetchUserUploadedStories = async () => {
    setLoadingUserUploadedStories(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setUserUploadedStories(data as Story[]);
      }
    } catch (err) {
      console.error('Error fetching user stories:', err);
    } finally {
      setLoadingUserUploadedStories(false);
    }
  };

  const handleSaveHighlight = async () => {
    if (!newHighlightTitle.trim()) {
      alert(t('Please enter a title', 'Por favor introduza um título!'));
      return;
    }
    const selectedStories = userUploadedStories.filter(story => selectedStoryIds.includes(story.id));
    if (selectedStories.length === 0) {
      alert(t('Please select at least one story', 'Por favor escolha pelos menos um story!'));
      return;
    }
    
    const coverUrl = newHighlightCover || selectedStories[0].media_url;
    
    setCreatingHighlight(true);
    try {
      const items = selectedStories.map(story => ({
        story_id: story.id,
        media_url: story.media_url,
        media_type: story.media_type
      }));
      
      const newHighlightData = {
        user_id: userId,
        title: newHighlightTitle,
        cover_url: coverUrl,
        items: items
      };
      
      const { data, error } = await supabase
        .from('story_highlights')
        .insert(newHighlightData)
        .select()
        .single();
        
      if (error) {
        throw error;
      }
      
      setHighlights(prev => {
        const filtered = prev.filter(h => !h.id.startsWith('mock-'));
        return [data, ...filtered];
      });
      
      setShowCreateHighlightModal(false);
      alert(t('Highlight created successfully', 'Destaque criado com sucesso!'));
    } catch (err) {
      console.error("Error creating story highlight:", err);
      const mockId = `local-${Date.now()}`;
      const items = selectedStories.map(story => ({
        story_id: story.id,
        media_url: story.media_url,
        media_type: story.media_type
      }));
      const localHighlightData = {
        id: mockId,
        user_id: userId,
        title: newHighlightTitle,
        cover_url: coverUrl,
        items: items
      };
      
      setHighlights(prev => [localHighlightData, ...prev]);
      setShowCreateHighlightModal(false);
      alert(t('Saved locally', 'Guardado localmente! Lembra-te de executar o script SQL no supabase.'));
    } finally {
      setCreatingHighlight(false);
    }
  };

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
      const filtered = isOwnProfile 
        ? data 
        : data.filter(post => !post.is_private && !privatePostIds.includes(post.id));

      if (page === 0) {
        setUserPosts(filtered || []);
      } else {
        setUserPosts(prev => [...prev, ...(filtered || [])]);
      }
      setHasMorePosts(data ? data.length === PAGE_SIZE : false);
    }
    
    if (page !== 0) setLoadingMore(false);
  }, [userId, isOwnProfile, privatePostIds]);

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
    await Promise.all([fetchProfile(), fetchUserPosts(), fetchStats(), checkFollowStatus(), checkStoriesStatus(), fetchHighlights()]);
    setLoading(false);
  }, [fetchProfile, fetchUserPosts, fetchStats, checkFollowStatus, checkStoriesStatus, fetchHighlights]);

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

  useEffect(() => {
    const fetchAuthUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setCurrentUser(session.user);
      }
    };
    fetchAuthUser();
  }, []);

  const fetchFollowList = React.useCallback(async (type: 'followers' | 'following', page: number) => {
    if (page === 0) {
      setLoadingFollowList(true);
    } else {
      setLoadingMoreFollows(true);
    }
    const limit = 10;
    const fromRange = page * limit;
    const toRange = (page + 1) * limit - 1;
    try {
      if (type === 'followers') {
        const { data, error } = await supabase
          .from('follows')
          .select('created_at, profiles:follower_id(*)')
          .eq('following_id', userId)
          .range(fromRange, toRange)
          .order('created_at', { ascending: false });
        
        if (!error && data) {
          const users = (data as unknown as { profiles: { id: string; username: string; name?: string; avatar_url?: string; } | null }[])
            .map(item => item.profiles)
            .filter(Boolean) as { id: string; username: string; name?: string; avatar_url?: string; }[];
          setFollowListUsers(prev => page === 0 ? users : [...prev, ...users]);
          setHasMoreFollows(users.length === limit);
        } else if (error) {
          console.error('Error fetching followers:', error);
        }
      } else {
        const { data, error } = await supabase
          .from('follows')
          .select('created_at, profiles:following_id(*)')
          .eq('follower_id', userId)
          .range(fromRange, toRange)
          .order('created_at', { ascending: false });
        
        if (!error && data) {
          const users = (data as unknown as { profiles: { id: string; username: string; name?: string; avatar_url?: string; } | null }[])
            .map(item => item.profiles)
            .filter(Boolean) as { id: string; username: string; name?: string; avatar_url?: string; }[];
          setFollowListUsers(prev => page === 0 ? users : [...prev, ...users]);
          setHasMoreFollows(users.length === limit);
        } else if (error) {
          console.error('Error fetching following:', error);
        }
      }
    } catch (err) {
      console.error('Error fetching follow list:', err);
    } finally {
      if (page === 0) {
        setLoadingFollowList(false);
      } else {
        setLoadingMoreFollows(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (followModalType) {
      setFollowListPage(0);
      setFollowListUsers([]);
      setHasMoreFollows(true);
      fetchFollowList(followModalType, 0);
    } else {
      setFollowListUsers([]);
    }
  }, [followModalType, fetchFollowList]);

  const handleFollowListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!followModalType || !hasMoreFollows || loadingMoreFollows || loadingFollowList) return;
    
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      const nextPage = followListPage + 1;
      setFollowListPage(nextPage);
      fetchFollowList(followModalType, nextPage);
    }
  };

  const handleUserClick = (targetId: string) => {
    if (onNavigateToProfile) {
      onNavigateToProfile(targetId);
    }
    setFollowModalType(null);
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
      if (editForm.name && editForm.name.trim().length > 20) {
        throw new Error(t('Name too long (max 20 characters)', 'Nome muito longo (máximo 20 caracteres)'));
      }

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

    const isValidCep20 = /^0x[a-fA-F0-9]{40}$/.test(newWalletAddress.trim());
    if (!isValidCep20) {
      alert(t('Invalid BEP-20 address format', 'Endereço BEP-20 inválido. Deve começar com 0x e conter 40 caracteres hexadecimais.'));
      return;
    }

    setSaving(true);
    try {
      // Check duplicated wallets in database
      const { data: existingWallet, error: walletCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('wallet_address', newWalletAddress.trim())
        .maybeSingle();

      if (walletCheckError) throw walletCheckError;

      if (existingWallet && existingWallet.id !== userId) {
        alert(t('Wallet address already in use', 'Este endereço de carteira já está sendo utilizado por outra conta.'));
        setSaving(false);
        return;
      }

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
    const unclaimedViews = stats.views - (profile?.claimed_views || 0);
    const pendingEarnings = unclaimedViews * VIEW_RATE;
    const amountCoins = (profile?.redeemable_balance || 0) + pendingEarnings;
    const amountUSD = amountCoins / 100;

    if (amountCoins <= 0) {
      alert(t('Insufficient balance withdraw'));
      return;
    }

    if (amountUSD < 0.5) {
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

      // 2. Deduzir do saldo de resgate e marcar views como reclamadas
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ 
          redeemable_balance: 0,
          claimed_views: stats.views
        })
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
    
    const unclaimedViews = stats.views - (profile.claimed_views || 0);
    
    if (unclaimedViews <= 0) {
      if (!silent) alert(t('No earnings to claim'));
      return;
    }

    const earningsToClaim = unclaimedViews * VIEW_RATE;
    
    // Se estiver em modo automático e estivermos a carregar algo, ignoramos para evitar conflitos
    if (silent && (saving || isClaimingContent)) return;

    if (silent) {
      setIsClaimingContent(true);
    } else {
      setSaving(true);
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          redeemable_balance: (profile.redeemable_balance || 0) + earningsToClaim,
          claimed_views: (profile.claimed_views || 0) + unclaimedViews
        })
        .eq('id', userId);

      if (error) throw error;

      await fetchProfile();
      if (!silent) alert(t('Earnings claimed success', { amount: (earningsToClaim / 100).toFixed(5) }));
    } catch (err) {
      console.error('Error claiming views:', err);
      if (!silent) alert(t('Error claiming earnings'));
    } finally {
      if (silent) {
        setIsClaimingContent(false);
      } else {
        setSaving(false);
      }
    }
  }, [profile, stats.views, t, userId, fetchProfile, saving, isClaimingContent]);

  // Resgate Automático de Ganhos
  useEffect(() => {
    if (isOwnProfile && profile && stats.views > (profile.claimed_views || 0)) {
      const unclaimed = stats.views - (profile.claimed_views || 0);
      if (unclaimed > 0 && !saving && !isClaimingContent) {
        handleClaimEarnings(true);
      }
    }
  }, [stats.views, profile, isOwnProfile, saving, isClaimingContent, handleClaimEarnings]);

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

  const highlightStoriesToView = React.useMemo(() => {
    if (!selectedHighlight) return [];
    const itemsRaw = typeof selectedHighlight.items === 'string'
      ? JSON.parse(selectedHighlight.items)
      : (selectedHighlight.items || []);
    return (itemsRaw as HighlightItem[]).map((item: HighlightItem, idx: number) => ({
      id: item.story_id || `highlight-${idx}-${selectedHighlight.id}`,
      user_id: selectedHighlight.user_id,
      media_url: item.media_url,
      media_type: item.media_type || 'image',
      created_at: selectedHighlight.created_at || new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      profiles: profile || undefined
    })) as Story[];
  }, [selectedHighlight, profile]);

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center bg-black gap-4">
      <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!profile) return <div className="p-20 text-center text-zinc-600 uppercase font-black tracking-widest text-xs">{t('Profile not found')}</div>;

  const currentGridData = (() => {
    if (activeTab === 'private') {
      return userPosts.filter(p => p.is_private || privatePostIds.includes(p.id));
    }
    if (activeTab === 'reposts') {
      return repostedPosts;
    }
    // 'posts' tab
    if (isOwnProfile) {
      const postsTab = userPosts.filter(p => !p.is_private && !privatePostIds.includes(p.id));
      return [...postsTab].sort((a, b) => {
        const pinA = (a as { is_pinned?: boolean }).is_pinned ? 1 : 0;
        const pinB = (b as { is_pinned?: boolean }).is_pinned ? 1 : 0;
        return pinB - pinA;
      });
    }
    return [...userPosts].sort((a, b) => {
      const pinA = (a as { is_pinned?: boolean }).is_pinned ? 1 : 0;
      const pinB = (b as { is_pinned?: boolean }).is_pinned ? 1 : 0;
      return pinB - pinA;
    });
  })();

  return (
    <div 
      onScroll={handleScroll}
      className="h-full w-full bg-white overflow-y-auto pb-20 no-scrollbar relative text-black"
    >
      {/* Top Navigation Overlay */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-md flex items-center px-4 h-14 border-b border-white z-50 gap-3">
        {onBack && (
          <button 
            onClick={onBack}
            className="p-1 -ml-1 text-black hover:opacity-60 transition-all flex items-center justify-center rounded-full"
          >
            <ArrowLeft size={24} />
          </button>
        )}
        <div className="flex flex-col flex-1">
          <h1 className="font-bold text-sm text-black">{profile.name || profile.username}</h1>
        </div>
        <div className="flex gap-4 shrink-0">
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
                setShowMonetization(true);
                setShowMenu(false);
              }} 
              className="w-full flex items-center gap-4 text-zinc-800 group"
            >
              <div className="text-zinc-900 opacity-80 group-hover:opacity-100 transition-opacity">
                <DollarSign size={22} strokeWidth={1.5} />
              </div>
              <span className="text-xl font-light tracking-tight">{t('Monetização', 'Monetização')}</span>
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
            <p className="text-[9px] text-zinc-300 uppercase tracking-[0.4em] font-medium">angochat v2.0</p>
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
      <div className="px-4 pb-4 pt-4 flex flex-col items-center text-center">
        <div className="relative">
          <div className={`w-24 h-24 rounded-xl bg-white p-1 ${hasStories ? 'ring-2 ring-purple-600' : ''}`}>
            <div 
              onClick={() => {
                if (profile.avatar_url) {
                  setShowBigAvatar(true);
                } else if (hasStories && onNavigateToPost) {
                  onNavigateToPost('story:' + userId);
                }
              }}
              className="w-full h-full rounded-xl bg-zinc-50 flex items-center justify-center overflow-hidden border border-zinc-100 cursor-pointer"
            >
              {profile.avatar_url ? (
                <img src={parseMediaUrl(profile.avatar_url)} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-2xl font-light text-zinc-400">{profile.username[0].toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 space-y-0.5">
          <h2 className="text-xl font-bold text-black leading-tight tracking-tight">{profile.name || profile.username}</h2>
          <p className="text-xs text-zinc-400 font-medium">@{profile.username}</p>
        </div>

        {profile.bio && (
          <p className="text-xs text-zinc-600 mt-2 leading-relaxed break-words whitespace-pre-wrap max-w-xs font-light">
            {profile.bio}
          </p>
        )}

        <div className="flex gap-8 mt-4">
          <button 
            type="button"
            onClick={() => setFollowModalType('following')} 
            className="flex flex-col items-center cursor-pointer hover:opacity-80 active:scale-95 transition-all text-left outline-none"
          >
            <span className="text-lg font-bold text-black">{stats.following}</span>
            <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold mt-0.5">{t('Following_count')}</span>
          </button>
          <button 
            type="button"
            onClick={() => setFollowModalType('followers')} 
            className="flex flex-col items-center cursor-pointer hover:opacity-80 active:scale-95 transition-all text-left outline-none"
          >
            <span className="text-lg font-bold text-black">{stats.followers}</span>
            <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold mt-0.5">{t('Followers')}</span>
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold text-black">{stats.views}</span>
            <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold mt-0.5">{t('Views')}</span>
          </div>
        </div>

        <div className="flex gap-3 mt-4 w-full max-w-xs">
          {isOwnProfile ? (
            <>
              <button 
                onClick={() => setShowDashboard(true)}
                className="flex-1 h-9 bg-zinc-100 text-black rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Wallet size={14} />
                {t('Wallet')}
              </button>
            </>
          ) : (
            <button 
              onClick={handleFollowToggle}
              className={`w-full h-9 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 ${
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

      {/* Story Highlights (Destaques de Stories) */}
      <div className="w-full border-t border-zinc-100 py-5 px-4 flex items-center gap-4 overflow-x-auto no-scrollbar scroll-smooth bg-white">
        {/* "New" or "Novo" highlight button (Only for profile owner) */}
        {isOwnProfile && (
          <div className="flex flex-col items-center gap-1.5 shrink-0 select-none">
            <button
              type="button"
              onClick={() => {
                setNewHighlightTitle('');
                setNewHighlightCover('');
                setSelectedStoryIds([]);
                fetchUserUploadedStories();
                setShowCreateHighlightModal(true);
              }}
              className="w-16 h-16 rounded-full border border-zinc-200 bg-zinc-50 flex items-center justify-center text-zinc-500 hover:bg-zinc-100 hover:text-black hover:border-zinc-300 transition-all duration-200 outline-none active:scale-95 shadow-sm"
            >
              <Plus size={22} strokeWidth={1.8} />
            </button>
            <span className="text-[11px] font-medium text-zinc-600 block text-center truncate w-16">{t('Novo', 'Novo')}</span>
          </div>
        )}

        {/* Highlights List */}
        {highlights.map((highlight) => (
          <div
            key={highlight.id}
            onClick={() => {
              setSelectedHighlight(highlight);
            }}
            className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer select-none group"
          >
            {/* Circular ring: 2px border, p-[3px] for separation offset inside */}
            <div className="w-16 h-16 rounded-full border-[2px] border-zinc-200/85 group-hover:border-purple-500 p-[3px] transition-all duration-300 flex items-center justify-center bg-white relative">
              <div className="w-full h-full rounded-full overflow-hidden bg-zinc-50">
                <img
                  src={parseMediaUrl(highlight.cover_url)}
                  alt={highlight.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Trash button overlay for owner */}
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteHighlight(highlight.id, e);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 transition-all shadow-sm z-30"
                  title={t('Delete Highlight', 'Eliminar Destaque')}
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
            <span className="text-[11px] font-medium text-zinc-800 text-center tracking-tight truncate w-16 group-hover:text-black transition-colors">
              {highlight.title}
            </span>
          </div>
        ))}
      </div>

      {/* Tabs (Estilo X) */}
      <div className="flex border-b border-zinc-100 sticky top-14 bg-white/95 backdrop-blur-md z-40">
        {[ 
          { id: 'posts', label: t('Posts') }, 
          { id: 'reposts', label: t('Reposts') },
          ...(isOwnProfile ? [{ id: 'private', label: t('Private', 'Privados') }] : [])
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'posts' | 'reposts' | 'private')}
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
            {currentGridData.map(post => {
              const isPostPrivate = post.is_private || privatePostIds.includes(post.id);
              return (
                <div 
                  key={post.id} 
                  onClick={() => {
                    if (isOwnProfile && (activeTab === 'posts' || activeTab === 'private')) {
                      setSelectedPostForEdit(post);
                    } else if (onNavigateToPost && profile) {
                      onNavigateToPost(post.id, { 
                        userId, 
                        userName: profile.name || profile.username, 
                        type: activeTab === 'reposts' ? 'reposted' : activeTab === 'private' ? 'private' : 'user'
                      });
                    }
                  }}
                  className="aspect-[3/4] bg-zinc-50 relative group overflow-hidden active:brightness-75 transition-all cursor-pointer border-[0.5px] border-zinc-100"
                >
                  {(post as { is_pinned?: boolean }).is_pinned && (
                    <div className="absolute top-2 left-2 bg-purple-600 text-white p-1 rounded-md flex items-center justify-center w-6 h-6 z-10 shadow-sm border border-purple-500/50">
                      <Pin size={12} className="text-white fill-white" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                    {isPostPrivate && isOwnProfile && (
                      <div className="bg-black/60 backdrop-blur-md text-white p-1 rounded-md border border-white/10 flex items-center justify-center w-6 h-6">
                        <Lock size={12} strokeWidth={2.5} className="text-white" />
                      </div>
                    )}
                    <div className="bg-black/40 backdrop-blur-md text-white p-1 rounded-md border border-white/10 flex items-center justify-center w-6 h-6">
                      {(post.media_type || 'video') === 'video' ? (
                        <Film size={12} className="text-white" />
                      ) : (
                        <Layers size={12} className="text-white" />
                      )}
                    </div>
                  </div>
                   {(post.media_type || 'video') === 'video' ? (
                    <video 
                      src={parseMediaUrl(post.media_url)} 
                      className="w-full h-full object-cover" 
                      muted 
                      playsInline 
                      preload="metadata"
                      poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined} 
                    />
                  ) : (
                    <img 
                      src={parseMediaUrl((post.media_type === 'image' && post.media_url) ? post.media_url : (post.thumbnail_url || ''))} 
                      className="w-full h-full object-cover" 
                      alt=""
                    />
                  )}
                  <div className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[9px] font-bold text-white drop-shadow-sm">
                    <span className="text-[7px]">▶</span> {post.views}
                  </div>
                </div>
              );
            })}
            
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
                  {activeTab === 'posts' 
                    ? t('No posts yet') 
                    : activeTab === 'reposts' 
                    ? t('No reposts yet') 
                    : t('No private posts yet', 'Sem vídeos privados')
                  }
                </p>
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

      {/* Monetization View (Full Screen) */}
      {showMonetization && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in slide-in-from-right duration-300 text-black">
          {/* Header */}
          <header className="sticky top-0 bg-white flex items-center px-4 h-14 border-b border-zinc-100 z-50 gap-3">
            <button 
              onClick={() => setShowMonetization(false)}
              className="text-black hover:opacity-70 transition-all p-1"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-black uppercase tracking-widest">{t('Monetização')}</span>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-32">
            <div className="flex flex-col gap-10 py-8">
              
              {/* Botão de Presenteadores */}
              <button 
                onClick={() => {
                  fetchTopGivers();
                  setShowGiversList(true);
                }}
                className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 text-black rounded-3xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 flex items-center justify-center gap-2 border border-zinc-200/50"
              >
                <Gift size={16} className="text-purple-600" />
                {t('Presenteadores de lives', 'Maiores Presenteadores de lives')}
              </button>

              {/* Card de Ganhos de Presentes */}
              <div className="bg-zinc-50 rounded-3xl p-6 border border-zinc-100 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                    <Gift size={20} />
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">{t('Gifts Received', 'Presentes Recebidos')}</h3>
                    <p className="text-zinc-500 text-[10px] font-light mt-1">{t('Earned from post and live gifts', 'Ganhos de presentes em vídeos e transmissões')}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-100 flex items-baseline justify-between">
                  <span className="text-2xl font-bold tracking-tight">{(profile?.redeemable_balance || 0).toFixed(0)} <span className="text-xs font-semibold text-zinc-400">Coins</span></span>
                  <span className="text-sm font-semibold text-zinc-500">≈ $ {((profile?.redeemable_balance || 0) / 100).toFixed(5)} USD</span>
                </div>
              </div>

              {/* Card de Ganhos de Views */}
              <div className="bg-zinc-50 rounded-3xl p-6 border border-zinc-100 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 font-bold">
                    <span className="text-sm">▶</span>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">{t('Views Earnings', 'Ganhos de Visualizações')}</h3>
                    <p className="text-zinc-500 text-[10px] font-light mt-1">{t('Based on your total views count', 'Com base no total de visualizações de seus vídeos')}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center bg-white rounded-2xl p-4 border border-zinc-100">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-zinc-400 uppercase tracking-wider">{t('Total Views')}</span>
                    <span className="text-sm font-black text-black">{stats.views}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] font-black text-zinc-400 uppercase tracking-wider">{t('Views Rate')}</span>
                    <span className="text-[10px] font-semibold text-zinc-500">{VIEW_RATE} Coin / View</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-100 flex items-baseline justify-between">
                  <span className="text-2xl font-bold tracking-tight">{(stats.views * VIEW_RATE).toFixed(3)} <span className="text-xs font-semibold text-zinc-400">Coins</span></span>
                  <span className="text-sm font-semibold text-zinc-500">≈ $ {((stats.views * VIEW_RATE) / 100).toFixed(5)} USD</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Top Givers View (Full Screen, white background) */}
      {showGiversList && (
        <div className="fixed inset-0 z-[130] bg-white flex flex-col animate-in slide-in-from-right duration-300 text-black">
          {/* Header */}
          <header className="sticky top-0 bg-white flex items-center px-4 h-14 border-b border-zinc-100 z-50 gap-3">
            <button 
              onClick={() => setShowGiversList(false)}
              className="text-black hover:opacity-70 transition-all p-1"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-black uppercase tracking-widest">{t('Presenteadores', 'Maiores Presenteadores')}</span>
            </div>
          </header>

          {/* Supporters List */}
          <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-32">
            {loadingGivers ? (
              <div className="h-48 flex items-center justify-center flex-col gap-2">
                <Loader2 className="animate-spin text-purple-600" size={24} />
                <span className="text-xs text-zinc-400 uppercase tracking-widest font-black">{t('Loading')}...</span>
              </div>
            ) : topGivers.length === 0 ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-4 px-4">
                <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400">
                  <Gift size={28} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-zinc-900">{t('Ainda sem presentes', 'Nenhum presente recebido')}</h3>
                  <p className="text-xs text-zinc-400 max-w-xs">{t('Os teus maiores apoiadores de transmissões ao vivo aparecerão listados aqui.', 'As moedas recebidas de fãs em directos ou publicações destacarão os teus maiores apoiadores!')}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 py-6 animate-in fade-in duration-300">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none mb-2">
                  {t('Classificação de Apoiadores', 'Classificação de Apoiadores por Nível')}
                </p>

                {topGivers.map((giver, index) => {
                  // Determina o nível baseado na quantia total
                  let levelLabel = t('Apoiador Bronze');
                  let levelColor = 'bg-zinc-100 text-zinc-600 border border-zinc-200';
                  let levelBadge = '⭐';
                  
                  if (giver.totalCoins >= 1000) {
                    levelLabel = t('Apoiador Diamante');
                    levelColor = 'bg-cyan-50 text-cyan-700 border border-cyan-200';
                    levelBadge = '💎';
                  } else if (giver.totalCoins >= 500) {
                    levelLabel = t('Apoiador Ouro');
                    levelColor = 'bg-amber-50 text-amber-700 border border-amber-200';
                    levelBadge = '👑';
                  } else if (giver.totalCoins >= 100) {
                    levelLabel = t('Apoiador Prata');
                    levelColor = 'bg-slate-100 text-slate-700 border border-slate-300';
                    levelBadge = '🥈';
                  }

                  const avatarUrlResolved = parseMediaUrl(giver.avatar_url);

                  return (
                    <div 
                      key={giver.id}
                      onClick={() => {
                        if (onNavigateToProfile) {
                          setShowGiversList(false);
                          setShowMonetization(false);
                          onNavigateToProfile(giver.id);
                        }
                      }}
                      className="flex items-center justify-between p-4 bg-zinc-50 hover:bg-zinc-100/80 active:scale-[0.99] border border-zinc-100 rounded-2xl cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3">
                        {/* Posicional Badge */}
                        <div className="w-6 text-center text-xs font-black text-zinc-400">
                          #{index + 1}
                        </div>

                        {/* Avatar */}
                        <div className="relative w-11 h-11 shrink-0">
                          {giver.avatar_url ? (
                            <img
                              src={avatarUrlResolved}
                              key={giver.avatar_url}
                              alt={giver.username}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover rounded-full border border-zinc-200"
                            />
                          ) : (
                            <div className="w-full h-full bg-zinc-100 rounded-full flex items-center justify-center text-zinc-500 font-bold uppercase text-sm border border-zinc-200">
                              {giver.username.charAt(0)}
                            </div>
                          )}
                        </div>

                        {/* Informações básicas e nível */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-black text-black leading-none">
                            {giver.name || giver.username}
                          </span>
                          <span className="text-[10px] text-zinc-400 leading-none">
                            @{giver.username}
                          </span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${levelColor}`}>
                              {levelBadge} {levelLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Total de moedas e presentes discretos */}
                      <div className="text-right flex flex-col justify-center items-end">
                        <span className="text-xs font-black text-black leading-none">
                          {giver.totalCoins} Coins
                        </span>
                        <span className="text-[9px] text-zinc-400 mt-1">
                          {giver.giftCount} {giver.giftCount === 1 ? t('Presente') : t('Presentes')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                  {(((profile.redeemable_balance || 0) + (stats.views - (profile?.claimed_views || 0)) * VIEW_RATE) / 100).toFixed(5)}
                </h1>
              </div>
            </button>

            {/* Botão de Moedas Rápido */}
            <div className="pt-8 flex justify-start pb-8 border-b border-zinc-100">
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

            {/* Method & Monetization Buttons */}
            <div className="py-10 flex items-center justify-center gap-6">
              <button 
                onClick={() => {
                  setNewWalletAddress(profile?.wallet_address || '');
                  setShowWalletModal(true);
                }}
                className="flex flex-col items-center justify-center gap-3 w-36 h-32 bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 rounded-3xl group active:scale-95 transition-all text-black"
              >
                <Settings size={26} strokeWidth={1.5} className="text-zinc-800" />
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-800 text-center px-2 leading-tight">
                  {t('Payment Method')}
                </span>
              </button>

              <button 
                onClick={() => {
                  setShowMonetization(true);
                }}
                className="flex flex-col items-center justify-center gap-3 w-36 h-32 bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 rounded-3xl group active:scale-95 transition-all text-black"
              >
                <DollarSign size={26} strokeWidth={1.5} className="text-purple-600" />
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-800 text-center px-2 leading-tight">
                  {t('Monetização')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navegador Interno Personalizado */}
      {showExternalUrl && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-500 text-black">
          <header className="h-14 bg-white border-b border-zinc-100 flex items-center px-4 shrink-0 gap-3">
            <button 
              onClick={() => setShowExternalUrl(false)}
              className="w-9 h-9 rounded-lg bg-zinc-50 flex items-center justify-center text-black active:scale-90 transition-all border border-zinc-100"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-950">{t('Secure Payment')}</span>
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
                  onChange={(e) => setEditForm({...editForm, name: e.target.value.slice(0, 20)})}
                  placeholder={t('Name')}
                  maxLength={20}
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
                  <p className="text-6xl font-semibold tracking-tighter leading-none">${(((profile?.redeemable_balance || 0) + (stats.views - (profile?.claimed_views || 0)) * VIEW_RATE) / 100).toFixed(5)}</p>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">USD</p>
                </div>
                <p className="text-sm text-zinc-400 font-light">≈ {((profile?.redeemable_balance || 0) + (stats.views - (profile?.claimed_views || 0)) * VIEW_RATE).toFixed(3)} Angochat Coins</p>
              </div>

              <div className="space-y-8 pt-10">
                <div className="space-y-2">
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

              <div className="pt-10">
                <button 
                   onClick={handleWithdraw}
                   disabled={saving || (((profile?.redeemable_balance || 0) + (stats.views - (profile?.claimed_views || 0)) * VIEW_RATE) / 100) < 0.5}
                   className="w-full h-20 bg-black text-white rounded-full font-medium uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-3 disabled:bg-zinc-100 disabled:text-zinc-300 active:scale-95 shadow-xl shadow-black/5"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : t('Confirm Withdrawal')}
                </button>
                {(((profile?.redeemable_balance || 0) + (stats.views - (profile?.claimed_views || 0)) * VIEW_RATE) / 100) < 0.5 && (
                  <p className="text-center mt-4 text-[9px] text-zinc-300 uppercase tracking-widest">
                    {t('Min required')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Big Avatar Modal */}
      {showBigAvatar && profile.avatar_url && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className="absolute inset-0" onClick={() => setShowBigAvatar(false)} />
          <div className="relative w-full max-w-[340px] aspect-square bg-zinc-950 rounded-2xl p-1.5 border-4 border-purple-600 shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex items-center justify-center">
            <button 
              onClick={() => setShowBigAvatar(false)} 
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white active:scale-95 transition-all"
            >
              <X size={16} />
            </button>
            <img 
              src={parseMediaUrl(profile.avatar_url)} 
              className="w-full h-full object-cover rounded-xl font-light" 
              alt="" 
            />
          </div>
        </div>
      )}

      {/* Followers/Following Modal */}
      {followModalType && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          {/* Backdrop click to close */}
          <div className="absolute inset-0" onClick={() => setFollowModalType(null)} />
          
          <div className="relative w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-zinc-900/50 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-100 flex items-center gap-2">
                {followModalType === 'followers' ? t('Followers') : t('Following_count')}
                <span className="text-[11px] font-bold bg-purple-600/20 text-purple-400 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                  {followModalType === 'followers' ? stats.followers : stats.following}
                </span>
              </h3>
              <button 
                onClick={() => setFollowModalType(null)} 
                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content List */}
            <div 
              className="p-4 max-h-[350px] overflow-y-auto no-scrollbar space-y-3"
              onScroll={handleFollowListScroll}
            >
              {loadingFollowList ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 size={24} className="animate-spin text-purple-600" />
                  <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Carregando...</span>
                </div>
              ) : followListUsers.length === 0 ? (
                <div className="text-center py-12 text-zinc-600 uppercase font-black tracking-widest text-[10px]">
                  Nenhum usuário encontrado
                </div>
              ) : (
                <>
                  {followListUsers.map(u => (
                    <button 
                      key={u.id}
                      type="button"
                      onClick={() => handleUserClick(u.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-zinc-900/40 border border-transparent hover:border-zinc-900/50 cursor-pointer active:scale-98 transition-all duration-150 text-left outline-none"
                    >
                      <div className="w-10 h-10 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800 shrink-0">
                        {u.avatar_url ? (
                          <img 
                            src={parseMediaUrl(u.avatar_url)} 
                            className="w-full h-full object-cover" 
                            alt="" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-black text-xs text-zinc-500 uppercase">
                            {u.username?.[0] || '?'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col items-start">
                        <span className="text-xs font-bold text-zinc-100 truncate w-full">
                          {u.name || `@${u.username}`}
                        </span>
                        {u.name && (
                          <span className="text-[10px] font-medium text-zinc-500 truncate w-full">
                            @{u.username}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  {loadingMoreFollows && (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 size={16} className="animate-spin text-purple-600" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Video Options Bottom Sheet Modal */}
      {selectedPostForEdit && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center">
          {/* Semi-transparent dark background */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setSelectedPostForEdit(null)} 
          />
          
          {/* The bottom sheet */}
          <div className="relative bg-white w-full max-w-md rounded-t-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300 border-t border-zinc-100 p-6 pb-12 z-10 text-black">
            {/* Minimalist Top Indicator */}
            <div className="flex justify-center mb-6">
              <div className="w-12 h-1.5 bg-zinc-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">
                {t('Video Options', 'Opções da Publicação')}
              </h3>
              <button 
                onClick={() => setSelectedPostForEdit(null)} 
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:text-black hover:bg-zinc-200 transition-all active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            {/* Options layout showing all items in a wrapping grid */}
            <div className="grid grid-cols-3 gap-y-6 gap-x-4 justify-items-center w-full py-4">
              {/* Option 1: Watch Video */}
              {selectedPostForEdit && (
                <button 
                  onClick={() => {
                    if (onNavigateToPost && selectedPostForEdit) {
                      onNavigateToPost(selectedPostForEdit.id, { 
                        userId, 
                        userName: profile?.name || profile?.username || '', 
                        type: activeTab === 'reposts' ? 'reposted' : activeTab === 'private' ? 'private' : 'user'
                      });
                    }
                    setSelectedPostForEdit(null);
                  }}
                  className="flex flex-col items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0 group outline-none"
                >
                  <div className="w-14 h-14 bg-zinc-50 border border-zinc-100 group-hover:bg-zinc-100 rounded-2xl flex items-center justify-center text-black shadow-sm">
                    <Play size={20} strokeWidth={1.5} className="fill-black text-black" />
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider text-center max-w-[85px]">
                    {selectedPostForEdit.media_type === 'image' ? t('Watch Image', 'Ver Foto') : t('Watch Video', 'Ver Vídeo')}
                  </span>
                </button>
              )}

              {/* Option 2: Edit Title/Caption */}
              {selectedPostForEdit && (
                <button 
                  onClick={() => {
                    setEditingPost(selectedPostForEdit);
                    setNewPostContent(selectedPostForEdit.content || '');
                    setSelectedPostForEdit(null);
                  }}
                  className="flex flex-col items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0 group outline-none"
                >
                  <div className="w-14 h-14 bg-zinc-50 border border-zinc-100 group-hover:bg-zinc-100 rounded-2xl flex items-center justify-center text-black shadow-sm">
                    <Edit3 size={20} strokeWidth={1.5} />
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider text-center max-w-[85px]">
                    {t('Edit Caption', 'Editar Título')}
                  </span>
                </button>
              )}

              {/* Option 3: Privacy settings */}
              {selectedPostForEdit && (
                <button 
                  onClick={() => handleTogglePrivacy(selectedPostForEdit)}
                  className="flex flex-col items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0 group outline-none"
                >
                  <div className="w-14 h-14 bg-zinc-50 border border-zinc-100 group-hover:bg-zinc-100 rounded-2xl flex items-center justify-center text-black shadow-sm">
                    {selectedPostForEdit.is_private || privatePostIds.includes(selectedPostForEdit.id) ? (
                      <Unlock size={20} strokeWidth={1.5} />
                    ) : (
                      <Lock size={20} strokeWidth={1.5} />
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider text-center max-w-[85px]">
                    {selectedPostForEdit.is_private || privatePostIds.includes(selectedPostForEdit.id) 
                      ? t('Make Public', 'Tornar Público') 
                      : t('Make Private', 'Tornar Privado')
                    }
                  </span>
                </button>
              )}

              {/* Option 4: Pin Option */}
              {selectedPostForEdit && (
                <button 
                  onClick={() => handleTogglePin(selectedPostForEdit)}
                  className="flex flex-col items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0 group outline-none"
                >
                  <div className="w-14 h-14 bg-zinc-50 border border-zinc-100 group-hover:bg-zinc-100 rounded-2xl flex items-center justify-center text-black shadow-sm">
                    <Pin size={20} strokeWidth={1.5} className={(selectedPostForEdit as { is_pinned?: boolean }).is_pinned ? 'fill-purple-600 text-purple-600' : 'text-black'} />
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider text-center max-w-[85px]">
                    {(selectedPostForEdit as { is_pinned?: boolean }).is_pinned ? t('Unpin', 'Desafixar') : t('Pin', 'Afixar')}
                  </span>
                </button>
              )}

              {/* Option 5: Video Statistics */}
              {selectedPostForEdit && (
                <button 
                  onClick={() => handleOpenStats(selectedPostForEdit)}
                  className="flex flex-col items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0 group outline-none"
                >
                  <div className="w-14 h-14 bg-zinc-50 border border-zinc-100 group-hover:bg-zinc-100 rounded-2xl flex items-center justify-center text-black shadow-sm">
                    <BarChart3 size={20} strokeWidth={1.5} />
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider text-center max-w-[85px]">
                    {t('Statistics', 'Estatísticas')}
                  </span>
                </button>
              )}

              {/* Option 6: Delete */}
              {selectedPostForEdit && (
                <button 
                  onClick={() => handleDeletePost(selectedPostForEdit)}
                  className="flex flex-col items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0 group outline-none text-red-600"
                >
                  <div className="w-14 h-14 bg-red-50 border border-red-100 group-hover:bg-red-100 rounded-2xl flex items-center justify-center text-red-500 shadow-sm">
                    <Trash2 size={20} strokeWidth={1.5} />
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider text-center max-w-[85px]">
                    {t('Delete', 'Eliminar')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Caption/Title Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setEditingPost(null)} />
          <div className="relative bg-white border border-zinc-100 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300 text-black">
            <div className="p-8 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black uppercase tracking-widest text-black">
                  {t('Edit Caption', 'Editar Título')}
                </h3>
                <button onClick={() => setEditingPost(null)} className="text-zinc-400 hover:text-black transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-wider text-zinc-400">
                  {t('Video Caption', 'Título/Legenda do Vídeo')}
                </label>
                <textarea 
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder={t('Write a caption...', 'Escreve uma legenda para o teu vídeo...')}
                  className="w-full h-24 p-4 border border-zinc-150 rounded-2xl text-xs placeholder-zinc-400 bg-zinc-50 outline-none focus:border-purple-500 transition-colors resize-none text-black"
                  maxLength={150}
                />
                <div className="text-[9px] text-zinc-400 self-end font-bold uppercase">
                  {newPostContent.length}/150
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setEditingPost(null)}
                  className="flex-1 h-12 bg-zinc-50 hover:bg-zinc-100 border border-zinc-150 rounded-full text-[10px] font-black uppercase tracking-widest text-zinc-500 active:scale-95 transition-all"
                >
                  {t('Cancel', 'Cancelar')}
                </button>
                <button 
                  onClick={handleUpdateCaption}
                  disabled={updateLoading}
                  className="flex-1 h-12 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {updateLoading ? (
                    <Loader2 size={14} className="animate-spin text-white" />
                  ) : (
                    t('Save', 'Guardar')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Statistics Modal */}
      {viewingStatsPost && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setViewingStatsPost(null)} />
          <div className="relative bg-white border border-zinc-100 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300 text-black">
            <div className="p-8 flex flex-col gap-6">
              <div className="flex justify-between items-center border-b border-zinc-100 pb-4">
                <div className="flex flex-col">
                  <h3 className="text-sm font-black uppercase tracking-widest text-black">
                    {t('Post Analytics', 'Estatísticas')}
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight mt-0.5">
                    {t('Performance Overview', 'Visão Geral')}
                  </p>
                </div>
                <button onClick={() => setViewingStatsPost(null)} className="text-zinc-400 hover:text-black transition-colors w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center">
                  <X size={18} />
                </button>
              </div>

              {loadingPostStats ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 size={32} className="animate-spin text-purple-600" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {t('Loading metrics...', 'A carregar...')}
                  </span>
                </div>
              ) : postStatsData ? (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Views */}
                    <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex flex-col col-span-2">
                      <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider mb-1">
                        {t('Views', 'Visualizações')}
                      </span>
                      <span className="text-lg font-black font-mono text-black">
                        {postStatsData.views}
                      </span>
                    </div>

                    {/* Likes */}
                    <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex flex-col">
                      <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider mb-1">
                        {t('Likes', 'Likes')}
                      </span>
                      <span className="text-lg font-black font-mono text-black">
                        {postStatsData.likes}
                      </span>
                    </div>

                    {/* Reposts */}
                    <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex flex-col">
                      <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider mb-1">
                        {t('Reposts', 'Republicações')}
                      </span>
                      <span className="text-lg font-black font-mono text-black">
                        {postStatsData.reposts}
                      </span>
                    </div>
                  </div>

                  {/* Highlight box */}
                  <div className="p-4 bg-zinc-950 text-white rounded-2xl flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest">
                        {t('Estimated Earnings', 'Rendimento Estimado')}
                      </span>
                      <span className="text-xs font-black tracking-tight mt-0.5">
                        USDT ({t('Network', 'Rede')} BEP-20)
                      </span>
                    </div>
                    <div className="text-right flex flex-col">
                      <span className="text-base font-black font-mono text-purple-400">
                        ${(postStatsData.views * VIEW_RATE).toFixed(4)}
                      </span>
                      <span className="text-[8px] text-zinc-400 font-bold uppercase">
                        ${VIEW_RATE} {t('per view', 'por view')}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              <button 
                onClick={() => setViewingStatsPost(null)}
                className="w-full h-12 bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 rounded-full text-[10px] font-black uppercase tracking-widest text-zinc-500 active:scale-95 transition-all mt-2"
              >
                {t('Close', 'Fechar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 1. STORY HIGHLIGHT PLAYER (FULLSCREEN OVERLAY) */}
      {/* ========================================== */}
      {selectedHighlight && (
        <StoryViewer
          userId={userId}
          currentUser={currentUser}
          onClose={() => setSelectedHighlight(null)}
          highlightStories={highlightStoriesToView}
        />
      )}

      {/* ========================================== */}
      {/* 2. CREAR STORY HIGHLIGHT MODAL */}
      {/* ========================================== */}
      {showCreateHighlightModal && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200 text-black">
          <div className="absolute inset-0" onClick={() => setShowCreateHighlightModal(false)} />
          <div className="relative bg-white border border-zinc-100 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 flex flex-col gap-6 max-h-[85vh] overflow-y-auto no-scrollbar">
              <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
                <h3 className="text-sm font-black uppercase tracking-widest text-black">
                  {t('New Highlight', 'Novo Destaque')}
                </h3>
                <button 
                  onClick={() => setShowCreateHighlightModal(false)} 
                  className="w-7 h-7 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 hover:text-black transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Title input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-black tracking-wider text-zinc-400">
                  {t('Highlight Title', 'Título do Destaque')}
                </label>
                <input
                  type="text"
                  value={newHighlightTitle}
                  onChange={(e) => setNewHighlightTitle(e.target.value)}
                  placeholder={t('e.g. Vacation', 'Ex: Suíça 🇨🇭')}
                  className="w-full h-11 px-4 border border-zinc-200 rounded-2xl text-xs bg-zinc-50 outline-none focus:border-purple-500 text-black font-semibold placeholder:text-zinc-300 transition-colors"
                />
              </div>

              {/* Selecionar Stories da Plataforma */}
              <div className="flex flex-col gap-3 border-t border-zinc-100 pt-4">
                <label className="text-[10px] uppercase font-black tracking-wider text-zinc-400">
                  {t('Select Stories', 'Selecionar Stories da Plataforma')}
                </label>
                
                {loadingUserUploadedStories ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-xs font-semibold text-zinc-500">
                    <Loader2 size={16} className="animate-spin text-purple-600" />
                    <span>{t('Loading stories...', 'Carregando stories...')}</span>
                  </div>
                ) : userUploadedStories.length === 0 ? (
                  <div className="text-center py-6 px-4 bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl flex flex-col items-center gap-1.5">
                    <Film size={20} className="text-zinc-350 animate-pulse" />
                    <span className="text-[11px] font-bold text-zinc-800">
                      {t('No stories uploaded yet', 'Nenhum story carregado')}
                    </span>
                    <p className="text-[9px] text-zinc-400 leading-tight">
                      {t('Post a story from the share menu first!', 'Partilha primeiro um story no menu principal!')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                    {userUploadedStories.map((story) => {
                      const isSelected = selectedStoryIds.includes(story.id);
                      const isCover = newHighlightCover === story.media_url || (!newHighlightCover && selectedStoryIds[0] === story.id);
                      
                      return (
                        <div 
                          key={story.id} 
                          onClick={() => {
                            let updated: string[];
                            if (isSelected) {
                              updated = selectedStoryIds.filter(id => id !== story.id);
                              if (story.media_url === newHighlightCover) {
                                const nextStory = userUploadedStories.find(s => updated.includes(s.id));
                                setNewHighlightCover(nextStory ? nextStory.media_url : '');
                              }
                            } else {
                              updated = [...selectedStoryIds, story.id];
                              if (!newHighlightCover) {
                                setNewHighlightCover(story.media_url);
                              }
                            }
                            setSelectedStoryIds(updated);
                          }}
                          className={`aspect-square rounded-2xl bg-zinc-50 border transition-all duration-200 overflow-hidden relative cursor-pointer select-none group ${
                            isSelected 
                              ? 'border-purple-600 ring-2 ring-purple-600/20' 
                              : 'border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          {story.media_type === 'video' ? (
                            <div className="w-full h-full relative bg-zinc-950">
                              <video 
                                src={parseMediaUrl(story.media_url)} 
                                className="w-full h-full object-cover muted" 
                              />
                              <div className="absolute top-1 left-1 bg-black/60 p-0.5 rounded text-white z-10">
                                <Play size={8} className="fill-white" />
                              </div>
                            </div>
                          ) : (
                            <img 
                              src={parseMediaUrl(story.media_url)} 
                              alt="" 
                              className="w-full h-full object-cover animate-fade-in" 
                              referrerPolicy="no-referrer"
                            />
                          )}
                          
                          {/* Selected Checkmark Badge */}
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-purple-600 border border-white flex items-center justify-center text-white text-[9px] font-black shadow-md">
                              <Check size={8} strokeWidth={3} />
                            </div>
                          )}

                          {/* Cover badge selection */}
                          {isSelected && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNewHighlightCover(story.media_url);
                              }}
                              className={`absolute bottom-1 inset-x-1 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tight text-center z-20 shadow-sm border ${
                                isCover 
                                  ? 'bg-purple-600 text-white border-purple-500' 
                                  : 'bg-white/80 text-zinc-800 border-zinc-200 hover:bg-white'
                              }`}
                            >
                              {isCover ? t('Capa', 'Capa') : t('Usar Capa', 'Usar Capa')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions row */}
              <div className="flex gap-3 border-t border-zinc-100 pt-5">
                <button
                  type="button"
                  onClick={() => setShowCreateHighlightModal(false)}
                  className="flex-1 h-12 bg-zinc-50 hover:bg-zinc-100 border border-zinc-150 rounded-full text-[10px] font-black uppercase tracking-widest text-zinc-500 active:scale-95 transition-all"
                >
                  {t('Cancel', 'Cancelar')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveHighlight}
                  disabled={creatingHighlight || !newHighlightTitle.trim() || selectedStoryIds.length === 0}
                  className="flex-1 h-12 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {creatingHighlight ? (
                    <Loader2 size={14} className="animate-spin text-white" />
                  ) : (
                    t('Save', 'Confirmar')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileView;
