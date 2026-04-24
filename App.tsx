import React, { useState, useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'motion/react';
import Feed from './components/Feed';
import ProfileView from './components/ProfileView';
import MessageCenter from './components/MessageCenter';
import Discovery from './components/Discovery';
import StoryViewer from './components/StoryViewer';
import StoryStats from './components/StoryStats';
import CreatePost from './components/CreatePost';
import Auth from './components/Auth';
import LiveList from './components/LiveList';
import LiveHost from './components/LiveHost';
import LiveViewer from './components/LiveViewer';
import { Home, Search, PlusSquare, MessageCircle, User as UserIcon, Radio, Bell } from 'lucide-react';
import { appCache } from './services/cache';
import { parseMediaUrl } from './services/mediaUtils';

export enum Tab {
  HOME = 'home',
  DISCOVER = 'discover',
  CREATE = 'create',
  LIVE = 'live',
  INBOX = 'inbox',
  PROFILE = 'profile'
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [viewingStoryUserId, setViewingStoryUserId] = useState<string | null>(null);
  const [viewingStatsUserId, setViewingStatsUserId] = useState<string | null>(null);
  const [allUsersWithStories, setAllUsersWithStories] = useState<string[]>([]);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [targetPostId, setTargetPostId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<{ userId: string; userName: string; type: 'user' | 'liked' | 'reposted' } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeLiveId, setActiveLiveId] = useState<string | null>(null);
  const [isHosting, setIsHosting] = useState(false);
  const [realtimeNotification, setRealtimeNotification] = useState<{
    userName: string;
    avatarUrl: string;
    type: 'live' | 'post' | 'story';
    targetId: string;
    userId: string;
  } | null>(null);

  useEffect(() => {
    // Configure Status Bar for mobile
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#000000' });
    }

    // Lock orientation to portrait if supported
    const lockOrientation = async () => {
      try {
        if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock) {
          // @ts-expect-error - lock might not be in all type definitions
          await screen.orientation.lock('portrait').catch(() => {
            // Silently fail if not supported (e.g. desktop or non-fullscreen)
          });
        }
      } catch {
        // Ignore errors
      }
    };
    lockOrientation();

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      // Se o evento for SIGNED_OUT ou a sessão for nula, resetamos para a HOME
      if (_event === 'SIGNED_OUT' || !currentUser) {
        appCache.clear();
        setActiveTab(Tab.HOME);
        setViewProfileId(null);
        setTargetPostId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Monitora notificações em tempo real (lives, posts, stories)
  useEffect(() => {
    if (!user) return;

    console.log(">>> [REALTIME] Subscribing to notifications for user:", user.id);

    const channel = supabase.channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lives' },
        async (payload) => {
          try {
            const live = payload.new;
            if (!live || live.host_id === user.id) return;

            const { data: follow } = await supabase
              .from('follows')
              .select('id')
              .eq('follower_id', user.id)
              .eq('following_id', live.host_id)
              .maybeSingle();

            if (follow) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('name, username, avatar_url')
                .eq('id', live.host_id)
                .maybeSingle();

              if (profile) {
                setRealtimeNotification({
                  userName: profile.name || `@${profile.username}`,
                  avatarUrl: profile.avatar_url || '',
                  type: 'live',
                  targetId: live.id,
                  userId: live.host_id
                });
              }
            }
          } catch (err) {
            console.error("Error in live notification listener:", err);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        async (payload) => {
          try {
            const post = payload.new;
            if (!post || post.user_id === user.id) return;

            const { data: follow } = await supabase
              .from('follows')
              .select('id')
              .eq('follower_id', user.id)
              .eq('following_id', post.user_id)
              .maybeSingle();

            if (follow) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('name, username, avatar_url')
                .eq('id', post.user_id)
                .maybeSingle();

              if (profile) {
                setRealtimeNotification({
                  userName: profile.name || `@${profile.username}`,
                  avatarUrl: profile.avatar_url || '',
                  type: 'post',
                  targetId: post.id,
                  userId: post.user_id
                });
              }
            }
          } catch (err) {
            console.error("Error in post notification listener:", err);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stories' },
        async (payload) => {
          try {
            const story = payload.new;
            if (!story || story.user_id === user.id) return;

            const { data: follow } = await supabase
              .from('follows')
              .select('id')
              .eq('follower_id', user.id)
              .eq('following_id', story.user_id)
              .maybeSingle();

            if (follow) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('name, username, avatar_url')
                .eq('id', story.user_id)
                .maybeSingle();

              if (profile) {
                setRealtimeNotification({
                  userName: profile.name || `@${profile.username}`,
                  avatarUrl: profile.avatar_url || '',
                  type: 'story',
                  targetId: `story:${story.user_id}`,
                  userId: story.user_id
                });
              }
            }
          } catch (err) {
            console.error("Error in story notification listener:", err);
          }
        }
      )
      .subscribe((status) => {
        console.log(`>>> [REALTIME] Notifications status: ${status}`);
      });

    return () => {
      console.log(">>> [REALTIME] Unsubscribing notifications");
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Efeito para limpar notificações automaticamente
  useEffect(() => {
    if (!realtimeNotification) return;

    const timer = setTimeout(() => {
      setRealtimeNotification(null);
    }, 8000);

    return () => clearTimeout(timer);
  }, [realtimeNotification]);

  // Monitora notificações quando o utilizador está logado
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const fetchNotificationsCount = async () => {
      if (activeTab === Tab.INBOX) return;

      const { count: msgCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('read', false);

      if (isMounted) {
        setUnreadCount(msgCount || 0);
      }
    };

    fetchNotificationsCount();

    if (activeTab === Tab.INBOX) {
      setTimeout(() => {
        if (isMounted) setUnreadCount(0);
      }, 0);
      supabase
        .from('messages')
        .update({ read: true })
        .eq('receiver_id', user.id)
        .eq('read', false)
        .then(() => {});
    }

    return () => { isMounted = false; };
  }, [user, activeTab]);

  useEffect(() => {
    const setTransparency = (transparent: boolean) => {
      const color = transparent ? 'transparent' : '';
      document.documentElement.style.backgroundColor = color;
      document.body.style.backgroundColor = color;
      const root = document.getElementById('root');
      if (root) root.style.backgroundColor = color;
    };

    if (activeTab === Tab.CREATE) {
      setTransparency(true);
    } else {
      setTransparency(false);
    }

    return () => {
      // No cleanup here to avoid flickering, CreatePost handles its own cleanup
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== Tab.CREATE) {
      const cleanupHardware = async () => {
        try {
          if (typeof window !== 'undefined' && (window as { localStream?: MediaStream }).localStream) {
            const stream = (window as { localStream?: MediaStream }).localStream as MediaStream;
            stream.getTracks().forEach(track => {
              track.stop();
              track.enabled = false;
            });
            (window as { localStream?: MediaStream | null }).localStream = null;
          }
        } catch {
          /* ignore */
        }
      };
      cleanupHardware();
    }
  }, [activeTab]);

  const handleNavigateToProfile = (userId: string) => {
    setViewProfileId(userId);
    setActiveTab(Tab.PROFILE);
  };

  const handleNavigateToPost = (postId: string, filter?: { userId: string; userName: string; type: 'user' | 'liked' | 'reposted' }) => {
    if (postId.startsWith('story:')) {
      const userId = postId.replace('story:', '');
      if (user && userId === user.id) {
        setViewingStatsUserId(userId);
      } else {
        setViewingStoryUserId(userId);
        setAllUsersWithStories([userId]); // Single user context
      }
      return;
    }
    setFeedFilter(filter || null);
    setTargetPostId(postId);
    setActiveTab(Tab.HOME);
  };

  const handleGoHome = () => {
    setViewProfileId(null);
    setTargetPostId(null);
    setFeedFilter(null);
    setActiveTab(Tab.HOME);
  };

  const handleDub = () => {
    setActiveTab(Tab.CREATE);
  };

  const renderContent = () => {
    if (loadingSession) return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );

    const isPublicTab = activeTab === Tab.HOME || activeTab === Tab.DISCOVER;
    if (!user && !isPublicTab) {
      return <Auth />;
    }

    switch (activeTab) {
      case Tab.HOME:
        return <Feed 
          onNavigateToProfile={handleNavigateToProfile} 
          onRequireAuth={() => setActiveTab(Tab.PROFILE)} 
          initialPostId={targetPostId} 
          feedFilter={feedFilter}
          onClearFilter={() => setFeedFilter(null)}
          onViewStories={(userId, allUserIds) => {
            if (user && userId === user.id) {
              setViewingStatsUserId(userId);
            } else {
              setViewingStoryUserId(userId);
              setAllUsersWithStories(allUserIds || [userId]);
            }
          }} 
          onJoinLive={(liveId) => {
            setActiveLiveId(liveId);
            setIsHosting(false);
          }}
          isPaused={!!viewingStoryUserId || !!viewingStatsUserId || !!activeLiveId || isHosting}
        />;
      case Tab.DISCOVER:
        return <Discovery 
          onNavigateToPost={handleNavigateToPost} 
          onNavigateToProfile={handleNavigateToProfile} 
          onNavigateToCreate={(isStory) => { 
            setIsCreatingStory(!!isStory);
            setActiveTab(Tab.CREATE); 
          }} 
          onViewStories={(userId, allUserIds) => {
            if (user && userId === user.id) {
              setViewingStatsUserId(userId);
            } else {
              setViewingStoryUserId(userId);
              setAllUsersWithStories(allUserIds || [userId]);
            }
          }} 
        />;
      case Tab.CREATE:
        return <CreatePost 
          onCreated={() => { 
            setIsCreatingStory(false);
            setActiveTab(Tab.HOME); 
          }} 
          onStartLive={() => {
            setIsHosting(true);
            setActiveLiveId(null);
          }}
          initialType={isCreatingStory ? 'story' : 'post'}
        />;
      case Tab.LIVE:
        return <LiveList 
          onJoinLive={(liveId) => {
            setActiveLiveId(liveId);
            setIsHosting(false);
          }}
          onStartLive={() => {
            setIsHosting(true);
            setActiveLiveId(null);
          }}
        />;
      case Tab.INBOX:
        return <MessageCenter currentUser={user} onNavigateToPost={handleNavigateToPost} onNavigateToProfile={handleNavigateToProfile} />;
      case Tab.PROFILE: {
        const targetId = viewProfileId || user?.id;
        return <ProfileView userId={targetId} isOwnProfile={targetId === user?.id} onNavigateToPost={handleNavigateToPost} />;
      }
      default:
        return <Feed onNavigateToProfile={handleNavigateToProfile} onDub={handleDub} />;
    }
  };

  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error' | null>(null);

  const checkApiHealth = async () => {
    setApiStatus('checking');
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      const endpoint = apiUrl ? apiUrl : `${window.location.origin}/api/health`;
      const res = await fetch(endpoint, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          setApiStatus('ok');
          console.log(">>> [HEALTH CHECK] API is OK", data);
        } else {
          setApiStatus('error');
        }
      } else {
        setApiStatus('error');
      }
    } catch (err) {
      console.error(">>> [HEALTH CHECK] API Error:", err);
      setApiStatus('error');
    }
  };

  return (
    <div className={`flex flex-col h-screen ${activeTab === Tab.CREATE ? 'bg-transparent' : 'bg-black'} text-white relative`}>
      {/* Global Realtime Notification Toast */}
      <AnimatePresence mode="wait">
        {realtimeNotification && (
          <motion.div 
            key={`${realtimeNotification.type}-${realtimeNotification.targetId}`}
            initial={{ y: -100, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -100, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed top-4 left-4 right-4 z-[9999] pointer-events-none flex justify-center"
          >
            <div 
              onClick={() => {
                if (realtimeNotification.type === 'live') {
                  setActiveLiveId(realtimeNotification.targetId);
                } else {
                  handleNavigateToPost(realtimeNotification.targetId);
                }
                setRealtimeNotification(null);
                setIsHosting(false);
              }}
              className="group relative overflow-hidden bg-[#0A0A0A]/95 backdrop-blur-2xl border border-white/20 rounded-[24px] p-3.5 flex items-center gap-3.5 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] pointer-events-auto active:scale-95 transition-all w-full max-w-[420px] mx-auto hover:bg-[#111]/95 cursor-pointer"
            >
              {/* Background Accent Glow */}
              <div className={`absolute top-0 left-0 w-1 h-full ${realtimeNotification.type === 'live' ? 'bg-red-600' : 'bg-emerald-500'} opacity-80`} />
              
              <div className="relative shrink-0">
                <div className={`absolute -inset-1 rounded-full blur-md opacity-40 animate-pulse ${realtimeNotification.type === 'live' ? 'bg-red-600' : 'bg-emerald-500'}`} />
                <img 
                  src={parseMediaUrl(realtimeNotification.avatarUrl)} 
                  className={`relative w-14 h-14 rounded-full object-cover border-2 shadow-2xl ${realtimeNotification.type === 'live' ? 'border-red-600' : 'border-emerald-500'}`} 
                  referrerPolicy="no-referrer"
                  alt={realtimeNotification.userName}
                />
                <div className={`absolute -bottom-1 -right-1 rounded-full p-1.5 border-2 border-[#0A0A0A] shadow-xl ${realtimeNotification.type === 'live' ? 'bg-red-600' : 'bg-emerald-500'}`}>
                  {realtimeNotification.type === 'live' ? (
                    <Radio size={12} className="text-white animate-pulse" />
                  ) : (
                    <PlusSquare size={12} className="text-white" />
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0 py-0.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${realtimeNotification.type === 'live' ? 'bg-red-600/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                    {realtimeNotification.type === 'live' ? 'Ao Vivo' : (realtimeNotification.type === 'story' ? 'Story' : 'Novo Post')}
                  </div>
                  {realtimeNotification.type === 'live' && (
                    <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                      <div className="w-1 h-1 rounded-full bg-red-500 animate-ping" />
                      <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter">Direto</span>
                    </div>
                  )}
                </div>
                
                <p className="text-[15px] font-bold text-white leading-tight truncate">
                  {realtimeNotification.userName}
                </p>
                <p className="text-[13px] text-zinc-400 font-medium leading-tight truncate mt-0.5 flex items-center gap-1">
                  {realtimeNotification.type === 'live' ? 'entrou em direto agora mesmo' : (realtimeNotification.type === 'story' ? 'acabou de publicar um story' : 'acabou de publicar um vídeo')}
                </p>
              </div>

              <div className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/30 group-hover:bg-white/[0.08] group-hover:text-white/60 transition-colors">
                <ChevronRight size={20} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug Health Check - Hidden but accessible via console or long press on Home */}
      {apiStatus && (
        <div className="fixed top-2 left-2 z-[9999] bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-[10px] font-black uppercase shadow-2xl">
          API: {apiStatus === 'checking' ? '⏳' : (apiStatus === 'ok' ? '✅ OK' : '❌ ERRO')}
          <button onClick={() => setApiStatus(null)} className="ml-2 text-zinc-500">X</button>
        </div>
      )}

      {/* Story Viewer */}
      {viewingStoryUserId && (
        <StoryViewer 
          userId={viewingStoryUserId} 
          currentUser={user}
          allUserIds={allUsersWithStories}
          onNavigateToUser={setViewingStoryUserId}
          onClose={() => {
            setViewingStoryUserId(null);
            setAllUsersWithStories([]);
          }} 
        />
      )}

      {viewingStatsUserId && (
        <StoryStats 
          userId={viewingStatsUserId}
          onClose={() => setViewingStatsUserId(null)}
        />
      )}

      {isHosting && user && (
        <LiveHost 
          currentUser={user} 
          onClose={() => setIsHosting(false)} 
        />
      )}

      {activeLiveId && user && (
        <LiveViewer 
          liveId={activeLiveId} 
          currentUser={user} 
          onClose={() => setActiveLiveId(null)} 
        />
      )}

      <main className={`flex-1 overflow-hidden min-h-0 ${activeTab === Tab.CREATE ? 'bg-transparent' : 'bg-black'}`}>
        {renderContent()}
      </main>

      <nav className="h-20 shrink-0 pb-4 border-t border-zinc-900 flex items-center justify-around bg-black/95 backdrop-blur-xl z-50">
        <button 
          onClick={handleGoHome}
          onContextMenu={(e) => { e.preventDefault(); checkApiHealth(); }}
          className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === Tab.HOME ? 'text-white scale-110' : 'text-zinc-600'}`}
        >
          <Home size={22} strokeWidth={activeTab === Tab.HOME ? 2.5 : 2} />
          <span className="text-[9px] font-black uppercase tracking-tighter">Home</span>
        </button>
        <button 
          onClick={() => { setActiveTab(Tab.DISCOVER); }}
          className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === Tab.DISCOVER ? 'text-white scale-110' : 'text-zinc-600'}`}
        >
          <Search size={22} strokeWidth={activeTab === Tab.DISCOVER ? 2.5 : 2} />
          <span className="text-[9px] font-black uppercase tracking-tighter">Explorar</span>
        </button>
        <button 
          onClick={() => { setIsCreatingStory(false); setActiveTab(Tab.CREATE); }}
          className="flex flex-col items-center group"
        >
          <div className="w-12 h-9 bg-zinc-800 rounded-xl flex items-center justify-center text-white shadow-lg group-active:scale-90 transition-transform">
            <PlusSquare size={22} />
          </div>
        </button>
        <button 
          onClick={() => { setActiveTab(Tab.LIVE); }}
          className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === Tab.LIVE ? 'text-white scale-110' : 'text-zinc-600'}`}
        >
          <Radio size={22} strokeWidth={activeTab === Tab.LIVE ? 2.5 : 2} />
          <span className="text-[9px] font-black uppercase tracking-tighter">Live</span>
        </button>
        <button 
          onClick={() => { setActiveTab(Tab.INBOX); }}
          className={`flex flex-col items-center gap-1.5 transition-all relative ${activeTab === Tab.INBOX ? 'text-white scale-110' : 'text-zinc-600'}`}
        >
          <div className="relative">
            <MessageCircle size={22} strokeWidth={activeTab === Tab.INBOX ? 2.5 : 2} />
            {unreadCount > 0 && activeTab !== Tab.INBOX && (
              <div className="absolute -top-1.5 -right-1.5 bg-red-600 text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-black animate-pulse shadow-lg">
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}
          </div>
          <span className="text-[9px] font-black uppercase tracking-tighter">Inbox</span>
        </button>
        <button 
          onClick={() => { setViewProfileId(null); setActiveTab(Tab.PROFILE); }}
          className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === Tab.PROFILE && !viewProfileId ? 'text-white scale-110' : 'text-zinc-600'}`}
        >
          <UserIcon size={22} strokeWidth={activeTab === Tab.PROFILE && !viewProfileId ? 2.5 : 2} />
          <span className="text-[9px] font-black uppercase tracking-tighter">Perfil</span>
        </button>
      </nav>
    </div>
  );
};

export default App;