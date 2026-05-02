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
import { uploadToR2 } from './services/uploadService';
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

interface UploadData {
  mediaFile: File | Blob;
  content: string;
  uploadType: 'post' | 'story';
  isEducation: boolean;
  recordedFacingMode: string;
  isFromGallery: boolean;
  trimStart: number;
  trimEnd: number;
  recordingSeconds: number;
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
  const [feedFilter, setFeedFilter] = useState<{ userId: string; userName: string; type: 'user' | 'reposted' } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeLiveId, setActiveLiveId] = useState<string | null>(null);
  const [isHosting, setIsHosting] = useState(false);
  const [homeRefreshTrigger, setHomeRefreshTrigger] = useState(0);
  const [uploadTask, setUploadTask] = useState<{ progress: number; active: boolean; error: string | null } | null>(null);

  const generateThumbnail = (file: File | Blob): Promise<Blob> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      
      const handleSeeked = () => {
        // Small delay to ensure the frame is actually rendered by the browser
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              resolve(blob as Blob);
              URL.revokeObjectURL(video.src);
            }, 'image/jpeg', 0.7);
          }
          video.removeEventListener('seeked', handleSeeked);
        }, 200);
      };

      video.onloadeddata = () => {
        video.currentTime = Math.min(0.3, video.duration / 2);
        video.addEventListener('seeked', handleSeeked);
      };

      video.onerror = () => {
        // Fallback: simple black blob if thumbnail fails
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        canvas.toBlob((blob) => resolve(blob as Blob), 'image/jpeg', 0.1);
        URL.revokeObjectURL(video.src);
      };

      video.src = URL.createObjectURL(file);
      video.load();
    });
  };

  const handleBackgroundUpload = async (uploadData: UploadData) => {
    setUploadTask({ progress: 0, active: true, error: null });
    setActiveTab(Tab.HOME); // Immediate navigation

    try {
      const {
        mediaFile,
        content,
        uploadType,
        isEducation,
      } = uploadData;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      
      const userId = session.user.id;
      const timestamp = Date.now();
      const isVideo = mediaFile.type.startsWith('video/');

      let finalMediaBlob = mediaFile;
      let finalMediaUrl = null;
      let finalThumbnailUrl = null;

      // Se for vídeo e precisar de processamento, fazemos em background
      // Nota: Para manter simples e evitar problemas de unmount, usamos os helpers do uploadService e supabase
      
      // Simulação de progresso inicial para a parte de FFmpeg/Pre-process
      setUploadTask(prev => prev ? { ...prev, progress: 5 } : null);

      // Gerar Thumbnail se for vídeo
      if (isVideo && uploadType === 'post') {
        try {
          const thumbBlob = await generateThumbnail(mediaFile);
          const thumbFileName = `${userId}-${timestamp}-thumb.jpg`;
          finalThumbnailUrl = await uploadToR2(thumbBlob, 'thumbnails', thumbFileName);
        } catch (thumbErr) {
          console.error('Erro ao gerar thumbnail em background:', thumbErr);
        }
      }

      setUploadTask(prev => prev ? { ...prev, progress: 15 } : null);

      // Upload do Ficheiro Final
      const fileExt = isVideo ? 'mp4' : (mediaFile.name?.split('.').pop() || 'jpg');
      const fileName = `${userId}-${timestamp}.${fileExt}`;
      const folder = uploadType === 'story' ? 'stories' : 'posts';
      
      // Upload com progresso real
      finalMediaUrl = await uploadToR2(
        finalMediaBlob, 
        folder, 
        fileName, 
        (p) => {
          setUploadTask(prev => prev ? { ...prev, progress: 15 + (p * 0.8) } : null);
        }
      );
      
      // Salvar no Supabase
      if (uploadType === 'story') {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        const { error: insertError } = await supabase.from('stories').insert({
          user_id: userId,
          media_url: finalMediaUrl,
          media_type: isVideo ? 'video' : 'image',
          expires_at: expiresAt.toISOString()
        });
        if (insertError) throw insertError;
      } else {
        const { error: insertError } = await supabase.from('posts').insert({
          user_id: userId,
          content: content || null,
          media_url: finalMediaUrl,
          thumbnail_url: finalThumbnailUrl,
          media_type: isVideo ? 'video' : 'image',
          is_education: isEducation ? 1 : 0,
          is_ready: true,
          views: 0,
          created_at: new Date().toISOString()
        });
        if (insertError) throw insertError;
      }

      setUploadTask({ progress: 100, active: false, error: null });
      setHomeRefreshTrigger(prev => prev + 1);
      
      // Limpar após 3 segundos
      setTimeout(() => {
        setUploadTask(null);
      }, 3000);

    } catch (err: unknown) {
      console.error('Background upload error:', err);
      const message = err instanceof Error ? err.message : 'Erro no upload';
      setUploadTask(prev => prev ? { ...prev, active: false, error: message } : null);
    }
  };

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

  const handleNavigateToPost = (postId: string, filter?: { userId: string; userName: string; type: 'user' | 'reposted' }) => {
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
    setHomeRefreshTrigger(prev => prev + 1);
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
          refreshTrigger={homeRefreshTrigger}
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
        />;
      case Tab.CREATE:
        return <CreatePost 
          onCreated={() => { 
            setIsCreatingStory(false);
            setActiveTab(Tab.HOME); 
          }} 
          onBackgroundUpload={handleBackgroundUpload}
          onStartLive={() => {
            setIsHosting(true);
            setActiveLiveId(null);
          }}
          initialType={isCreatingStory ? 'story' : 'post'}
        />;
      case Tab.LIVE:
        return <LiveList 
          currentUser={user}
          onJoinLive={(liveId) => {
            setActiveLiveId(liveId);
            setIsHosting(false);
          }}
        />;
      case Tab.INBOX:
        return (
          <MessageCenter 
            currentUser={user} 
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
          />
        );
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

      <main className={`flex-1 overflow-hidden min-h-0 ${activeTab === Tab.CREATE ? 'bg-transparent' : 'bg-black'} relative z-20`}>
        {uploadTask && (
          <div className="fixed top-0 left-0 w-full z-[100] pointer-events-none">
            <div className="h-1 bg-zinc-900 w-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${uploadTask.error ? 'bg-red-600' : 'bg-red-600'}`}
                style={{ width: `${uploadTask.progress}%` }}
              />
            </div>
            {uploadTask.error && (
              <div className="bg-red-600 text-[10px] font-black uppercase p-2 text-center text-white">
                Erro no Upload: {uploadTask.error}
              </div>
            )}
            {!uploadTask.error && uploadTask.active && (
              <div className="bg-black/80 backdrop-blur-md text-[9px] font-black uppercase p-2 text-center text-white/50 tracking-widest">
                A carregar mambo... {Math.round(uploadTask.progress)}%
              </div>
            )}
            {uploadTask.progress === 100 && !uploadTask.active && (
              <div className="bg-green-600 text-[9px] font-black uppercase p-2 text-center text-white tracking-widest">
                Mambo publicado com sucesso! 🔥
              </div>
            )}
          </div>
        )}
        {renderContent()}
      </main>

      <nav className="h-20 shrink-0 pb-4 border-t border-zinc-900 flex items-center justify-around bg-black/95 backdrop-blur-xl z-10">
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