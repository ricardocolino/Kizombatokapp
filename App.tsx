import React, { useState, useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
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
import { Home, Search, PlusSquare, MessageCircle, User as UserIcon, Radio } from 'lucide-react';
import { appCache } from './services/cache';

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
          isPaused={!!viewingStoryUserId || !!viewingStatsUserId}
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