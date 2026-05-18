import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
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
  const { t } = useTranslation();
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
        recordedFacingMode,
        isFromGallery,
        trimStart,
        trimEnd,
      } = uploadData;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('Session expired'));
      
      const userId = session.user.id;
      const timestamp = Date.now();
      const isVideo = mediaFile.type.startsWith('video/');

      let finalMediaBlob = mediaFile;
      let finalMediaUrl = null;
      let finalThumbnailUrl = null;

      // --- PROCESSAMENTO FFmpeg (Background) ---
      if (isVideo && !isFromGallery) {
        setUploadTask(prev => prev ? { ...prev, progress: 5 } : null);
        
        try {
          const ffmpeg = new FFmpeg();
          const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
          await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          });

          const videoData = await fetchFile(mediaFile);
          await ffmpeg.writeFile('/input.mp4', videoData);

          const filterParts = [];
          // Redimensionar e garantir dimensões pares
          filterParts.push("scale='if(gt(ih,1280),-2,iw)':'if(gt(ih,1280),1280,ih)'");
          filterParts.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
          
          // CORREÇÃO DE ROTAÇÃO: Se for câmera traseira, aplicamos o flip
          if (recordedFacingMode === 'rear') {
            filterParts.push('vflip,hflip');
          }
          
          const videoArgs = [];
          // Trim se necessário
          const hasTrim = trimStart > 0 || trimEnd > 0;
          if (hasTrim) {
            videoArgs.push('-ss', String(trimStart), '-t', String(trimEnd - trimStart));
          }
          
          videoArgs.push('-i', '/input.mp4');
          if (filterParts.length > 0) {
            videoArgs.push('-vf', filterParts.join(','));
          }

          // Configurações de compressão
          videoArgs.push(
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', 
            '-crf', '32',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', 
            '-b:a', '96k',
            '-movflags', '+faststart', 
            '-y', '/output.mp4'
          );

          await ffmpeg.exec(videoArgs);
          const videoOutput = await ffmpeg.readFile('/output.mp4');
          finalMediaBlob = new Blob([videoOutput], { type: 'video/mp4' });
          
          // Gerar Thumbnail via FFmpeg para ser mais preciso
          await ffmpeg.exec(['-ss', '0.3', '-i', '/output.mp4', '-vframes', '1', '-f', 'image2', '/thumb.jpg']);
          const thumbOutput = await ffmpeg.readFile('/thumb.jpg');
          const thumbBlob = new Blob([thumbOutput], { type: 'image/jpeg' });
          const thumbFileName = `${userId}-${timestamp}-thumb.jpg`;
          finalThumbnailUrl = await uploadToR2(thumbBlob, 'thumbnails', thumbFileName);
          
        } catch (procErr) {
          console.error('Erro no processamento FFmpeg background:', procErr);
          // Fallback para o original se falhar, mas avisamos o task
          setUploadTask(prev => prev ? { ...prev, progress: 10 } : null);
        }
      } else if (isVideo && isFromGallery && uploadType === 'post') {
        // Se for da galeria, apenas geramos a thumbnail via browser
        try {
          const thumbBlob = await generateThumbnail(mediaFile);
          const thumbFileName = `${userId}-${timestamp}-thumb.jpg`;
          finalThumbnailUrl = await uploadToR2(thumbBlob, 'thumbnails', thumbFileName);
        } catch (thumbErr) {
          console.error('Erro ao gerar thumbnail browser background:', thumbErr);
        }
      }

      setUploadTask(prev => prev ? { ...prev, progress: 20 } : null);

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
          setUploadTask(prev => prev ? { ...prev, progress: 20 + (p * 0.75) } : null);
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
      const message = err instanceof Error ? err.message : t('Upload error');
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

  const [profileAction, setProfileAction] = useState<string | null>(null);

  const handleNavigateToProfile = (userId: string, action?: string) => {
    setViewProfileId(userId);
    setProfileAction(action || null);
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
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
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
        return (
          <ProfileView 
            userId={targetId} 
            isOwnProfile={targetId === user?.id} 
            onNavigateToPost={handleNavigateToPost} 
            initialAction={profileAction}
            onClearAction={() => setProfileAction(null)}
          />
        );
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
    <div className={`flex flex-col h-[100dvh] w-screen overflow-hidden ${activeTab === Tab.CREATE ? 'bg-transparent' : 'bg-black'} text-white relative`}>
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
          onNavigateToProfile={handleNavigateToProfile}
        />
      )}

      <main className={`flex-1 overflow-hidden min-h-0 ${activeTab === Tab.CREATE ? 'bg-transparent' : 'bg-black'} relative z-10`}>
        {uploadTask && (
          <div className="fixed top-0 left-0 w-full z-[100] pointer-events-none">
            <div className="h-1 bg-zinc-900 w-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${uploadTask.error ? 'bg-purple-600' : 'bg-purple-600'}`}
                style={{ width: `${uploadTask.progress}%` }}
              />
            </div>
            {uploadTask.error && (
              <div className="bg-purple-600 text-[10px] font-black uppercase p-2 text-center text-white">
                {t('Upload error')}: {uploadTask.error}
              </div>
            )}
            {!uploadTask.error && uploadTask.active && (
              <div className="bg-black/80 backdrop-blur-md text-[9px] font-black uppercase p-2 text-center text-white/50 tracking-widest">
                {t('Uploading content')} {Math.round(uploadTask.progress)}%
              </div>
            )}
            {uploadTask.progress === 100 && !uploadTask.active && (
              <div className="bg-green-600 text-[9px] font-black uppercase p-2 text-center text-white tracking-widest">
                {t('Content published successfully')}
              </div>
            )}
          </div>
        )}
        {renderContent()}
      </main>

      {activeTab !== Tab.CREATE && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-[440px] z-[100]">
          <nav className="h-[72px] rounded-[32px] border border-white/10 bg-zinc-900/70 backdrop-blur-3xl flex items-center justify-around px-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-t from-purple-600/5 to-transparent pointer-events-none" />
            
            <button 
              onClick={handleGoHome}
              onContextMenu={(e) => { e.preventDefault(); checkApiHealth(); }}
              className={`flex flex-col items-center gap-1 transition-all outline-none relative z-10 ${activeTab === Tab.HOME ? 'text-purple-500 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Home size={22} strokeWidth={activeTab === Tab.HOME ? 2.5 : 2} />
              <span className={`text-[8px] font-black uppercase tracking-tighter ${activeTab === Tab.HOME ? 'opacity-100' : 'opacity-40'}`}>{t('Home')}</span>
            </button>

            <button 
              onClick={() => { setActiveTab(Tab.DISCOVER); }}
              className={`flex flex-col items-center gap-1 transition-all outline-none relative z-10 ${activeTab === Tab.DISCOVER ? 'text-purple-500 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Search size={22} strokeWidth={activeTab === Tab.DISCOVER ? 2.5 : 2} />
              <span className={`text-[8px] font-black uppercase tracking-tighter ${activeTab === Tab.DISCOVER ? 'opacity-100' : 'opacity-40'}`}>{t('Discovery')}</span>
            </button>

            <button 
              onClick={() => { setIsCreatingStory(false); setActiveTab(Tab.CREATE); }}
              className="flex flex-col items-center group outline-none relative z-10 -translate-y-1"
            >
              <div className="w-14 h-11 bg-white flex items-center justify-center text-black rounded-2xl shadow-[0_10px_20px_rgba(255,255,255,0.2)] group-hover:bg-purple-600 group-hover:text-white group-active:scale-95 transition-all border border-white/10">
                <PlusSquare size={26} strokeWidth={2.5} />
              </div>
            </button>

            <button 
              onClick={() => { setActiveTab(Tab.LIVE); }}
              className={`flex flex-col items-center gap-1 transition-all outline-none relative z-10 ${activeTab === Tab.LIVE ? 'text-purple-500 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Radio size={22} strokeWidth={activeTab === Tab.LIVE ? 2.5 : 2} />
              <span className={`text-[8px] font-black uppercase tracking-tighter ${activeTab === Tab.LIVE ? 'opacity-100' : 'opacity-40'}`}>{t('Live')}</span>
            </button>

            <button 
              onClick={() => { setActiveTab(Tab.INBOX); }}
              className={`flex flex-col items-center gap-1 transition-all outline-none relative z-10 ${activeTab === Tab.INBOX ? 'text-purple-500 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <div className="relative">
                <MessageCircle size={22} strokeWidth={activeTab === Tab.INBOX ? 2.5 : 2} />
                {unreadCount > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center text-[8px] font-black border-2 border-zinc-900 shadow-xl">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </div>
                )}
              </div>
              <span className={`text-[8px] font-black uppercase tracking-tighter ${activeTab === Tab.INBOX ? 'opacity-100' : 'opacity-40'}`}>{t('Messages')}</span>
            </button>

            <button 
              onClick={() => { setViewProfileId(null); setActiveTab(Tab.PROFILE); }}
              className={`flex flex-col items-center gap-1 transition-all outline-none relative z-10 ${activeTab === Tab.PROFILE && !viewProfileId ? 'text-purple-500 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <UserIcon size={22} strokeWidth={activeTab === Tab.PROFILE && !viewProfileId ? 2.5 : 2} />
              <span className={`text-[8px] font-black uppercase tracking-tighter ${activeTab === Tab.PROFILE && !viewProfileId ? 'opacity-100' : 'opacity-40'}`}>{t('Profile')}</span>
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};

export default App;