import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Feed from './components/Feed';
import ProfileView from './components/ProfileView';
import MessageCenter from './components/MessageCenter';
import Discovery from './components/Discovery';
import CreatePost from './components/CreatePost';
import SoundDetail from './components/SoundDetail';
import Auth from './components/Auth';
import { Home, Search, PlusSquare, MessageCircle, User } from 'lucide-react';
import { Post } from './types';

export enum Tab {
  HOME = 'home',
  DISCOVER = 'discover',
  CREATE = 'create',
  INBOX = 'inbox',
  PROFILE = 'profile',
  SOUND_DETAIL = 'sound_detail'
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [user, setUser] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [selectedSoundPost, setSelectedSoundPost] = useState<Post | null>(null);
  const [targetPostId, setTargetPostId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
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
        setActiveTab(Tab.HOME);
        setViewProfileId(null);
        setSelectedSoundPost(null);
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
      setUnreadCount(0);
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
    if (activeTab !== Tab.CREATE) {
      const cleanupHardware = async () => {
        try {
          if (typeof window !== 'undefined' && (window as any).localStream) {
            const stream = (window as any).localStream as MediaStream;
            stream.getTracks().forEach(track => {
              track.stop();
              track.enabled = false;
            });
            (window as any).localStream = null;
          }
        } catch (e) {}
      };
      cleanupHardware();
    }
  }, [activeTab]);

  const handleNavigateToProfile = (userId: string) => {
    setViewProfileId(userId);
    setActiveTab(Tab.PROFILE);
  };

  const handleNavigateToSound = (post: Post) => {
    setSelectedSoundPost(post);
    setActiveTab(Tab.SOUND_DETAIL);
  };

  const handleNavigateToPost = (postId: string) => {
    setTargetPostId(postId);
    setActiveTab(Tab.HOME);
  };

  const handleGoHome = () => {
    setViewProfileId(null);
    setSelectedSoundPost(null);
    setTargetPostId(null);
    setActiveTab(Tab.HOME);
  };

  const handleUseSound = (post: Post) => {
    setSelectedSoundPost(post);
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
        return <Feed onNavigateToProfile={handleNavigateToProfile} onNavigateToSound={handleNavigateToSound} initialPostId={targetPostId} />;
      case Tab.DISCOVER:
        return <Discovery onNavigateToPost={handleNavigateToPost} onNavigateToProfile={handleNavigateToProfile} />;
      case Tab.CREATE:
        return <CreatePost onCreated={() => { setSelectedSoundPost(null); setActiveTab(Tab.HOME); }} preSelectedSound={selectedSoundPost} />;
      case Tab.INBOX:
        return <MessageCenter currentUser={user} onNavigateToPost={handleNavigateToPost} onNavigateToProfile={handleNavigateToProfile} />;
      case Tab.PROFILE:
        const targetId = viewProfileId || user?.id;
        return <ProfileView userId={targetId} isOwnProfile={targetId === user?.id} onNavigateToPost={handleNavigateToPost} />;
      case Tab.SOUND_DETAIL:
        return selectedSoundPost ? <SoundDetail post={selectedSoundPost} onBack={() => setActiveTab(Tab.HOME)} onUseSound={handleUseSound} /> : null;
      default:
        return <Feed onNavigateToProfile={handleNavigateToProfile} onNavigateToSound={handleNavigateToSound} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white relative">
      <main className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </main>

<nav className="h-20 pb-4 border-t border-zinc-900 flex items-center justify-around bg-black/95 backdrop-blur-xl flex-shrink-0 z-50">
  <button 
    onClick={handleGoHome}
    className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === Tab.HOME ? 'text-white scale-110' : 'text-zinc-600'}`}
  >
    <Home size={22} strokeWidth={activeTab === Tab.HOME ? 2.5 : 2} />
    <span className="text-[9px] font-black uppercase tracking-tighter">Home</span>
  </button>
  <button 
    onClick={() => { setSelectedSoundPost(null); setActiveTab(Tab.DISCOVER); }}
    className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === Tab.DISCOVER ? 'text-white scale-110' : 'text-zinc-600'}`}
  >
    <Search size={22} strokeWidth={activeTab === Tab.DISCOVER ? 2.5 : 2} />
    <span className="text-[9px] font-black uppercase tracking-tighter">Explorar</span>
  </button>
  <button 
    onClick={() => setActiveTab(Tab.CREATE)}
    className="flex flex-col items-center group"
  >
    <div className="w-12 h-9 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 group-active:scale-90 transition-transform group-hover:bg-zinc-700">
      <PlusSquare size={22} />
    </div>
  </button>
  <button 
    onClick={() => { setSelectedSoundPost(null); setActiveTab(Tab.INBOX); }}
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
    onClick={() => { setViewProfileId(null); setSelectedSoundPost(null); setActiveTab(Tab.PROFILE); }}
    className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === Tab.PROFILE && !viewProfileId ? 'text-white scale-110' : 'text-zinc-600'}`}
  >
    <User size={22} strokeWidth={activeTab === Tab.PROFILE && !viewProfileId ? 2.5 : 2} />
    <span className="text-[9px] font-black uppercase tracking-tighter">Perfil</span>
  </button>
</nav>
    </div>
  );
};

export default App;

