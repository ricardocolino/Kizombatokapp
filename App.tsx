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
import Onboarding from './components/Onboarding';
import AudioDetailsPage from './components/AudioDetailsPage';
import { uploadToR2 } from './services/uploadService';
import LiveList from './components/LiveList';
import LiveHost from './components/LiveHost';
import LiveViewer from './components/LiveViewer';
import { Home, Compass, Radio, Bell, User as UserIcon } from 'lucide-react';
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
  isEducation?: boolean;
  recordedFacingMode: string;
  isFromGallery: boolean;
  trimStart: number;
  trimEnd: number;
  recordingSeconds: number;
  dubbedMp3Url?: string | null;
  dubbedFromId?: string | null;
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
  const [feedFilter, setFeedFilter] = useState<{ userId: string; userName: string; type: 'user' | 'reposted' | 'private' } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeLiveId, setActiveLiveId] = useState<string | null>(null);
  const [isHosting, setIsHosting] = useState(false);
  const [homeRefreshTrigger, setHomeRefreshTrigger] = useState(0);
  const [uploadTask, setUploadTask] = useState<{ progress: number; active: boolean; error: string | null } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dubbingMp3Url, setDubbingMp3Url] = useState<string | null>(null);
  const [dubbedFromId, setDubbedFromId] = useState<string | null>(null);
  const [viewAudioPostId, setViewAudioPostId] = useState<string | null>(null);

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
        isEducation = false,
        recordedFacingMode,
        isFromGallery,
        trimStart,
        trimEnd,
        dubbedMp3Url,
        dubbedFromId,
      } = uploadData;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('Session expired'));
      
      const userId = session.user.id;
      const timestamp = Date.now();
      const isVideo = mediaFile.type.startsWith('video/');

      let finalMediaBlob = mediaFile;
      let finalMediaUrl = null;
      let finalThumbnailUrl = null;
      let finalMp3Url: string | null = null;

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

          if (dubbedMp3Url) {
            try {
              console.log('[FFMPEG Dubbing] Baixando MP3 para dublagem:', dubbedMp3Url);
              const audioRes = await fetch(dubbedMp3Url);
              const audioBlob = await audioRes.blob();
              const audioData = await fetchFile(audioBlob);
              await ffmpeg.writeFile('/dub_audio.mp3', audioData);
              console.log('[FFMPEG Dubbing] MP3 carregado com sucesso!');
            } catch (err) {
              console.error('Erro ao preparar áudio de dublagem:', err);
            }
          }

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
          if (dubbedMp3Url) {
            videoArgs.push('-i', '/dub_audio.mp3');
          }

          if (filterParts.length > 0) {
            videoArgs.push('-vf', filterParts.join(','));
          }

          if (dubbedMp3Url) {
            // Mapeia o vídeo do primeiro input (0) e o áudio do segundo input (1).
            // -shortest corta o output assim que o vídeo acaba.
            videoArgs.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
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
          
          // Limpar arquivos temporários
          try { await ffmpeg.deleteFile('/input.mp4'); } catch { /* ignore */ }
          try { await ffmpeg.deleteFile('/dub_audio.mp3'); } catch { /* ignore */ }
          try { await ffmpeg.deleteFile('/output.mp4'); } catch { /* ignore */ }
          try { await ffmpeg.deleteFile('/thumb.jpg'); } catch { /* ignore */ }
          
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

        // --- EXTRAÇÃO E GRAVAÇÃO DE MP3 NO SUPABASE STORAGE ---
        try {
          console.log('[Upload MP3] Convertendo vídeo da galeria para MP3...');
          const ffmpeg = new FFmpeg();
          const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
          await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          });

          const videoData = await fetchFile(mediaFile);
          await ffmpeg.writeFile('/input_mp3.mp4', videoData);

          await ffmpeg.exec(['-i', '/input_mp3.mp4', '-vn', '-y', '/output_mp3.mp3']);
          const audioOutput = await ffmpeg.readFile('/output_mp3.mp3');
          const mp3Blob = new Blob([audioOutput], { type: 'audio/mp3' });
          
          const bucketName = 'mp3-audios';
          const mp3Path = `${userId}/${timestamp}.mp3`;
          
          const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(mp3Path, mp3Blob, {
              contentType: 'audio/mp3',
              cacheControl: '3600',
              upsert: true
            });
            
          if (uploadError) {
            console.error('Erro no upload do MP3 no Supabase Storage:', uploadError);
          } else {
            const { data: { publicUrl } } = supabase.storage
              .from(bucketName)
              .getPublicUrl(mp3Path);
            finalMp3Url = publicUrl;
            console.log('MP3 salvo no Supabase Storage:', publicUrl);
          }

          // Limpeza
          try { await ffmpeg.deleteFile('/input_mp3.mp4'); } catch { /* ignore */ }
          try { await ffmpeg.deleteFile('/output_mp3.mp3'); } catch { /* ignore */ }
        } catch (mp3Err) {
          console.error('Erro ao extrair/enviar áudio MP3 no background:', mp3Err);
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
          mp3_url: finalMp3Url,
          dubbed_from_id: dubbedFromId || null,
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
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoadingSession(false);
      if (currentUser) {
        checkOnboarding(currentUser.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        if (_event === 'SIGNED_IN') {
           checkOnboarding(currentUser.id);
        }
      } else {
        setShowOnboarding(false);
      }

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

  const handleNavigateToPost = (postId: string, filter?: { userId: string; userName: string; type: 'user' | 'reposted' | 'private' }) => {
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

  const handleDub = (mp3Url: string, originalPostId?: string | null) => {
    setDubbingMp3Url(mp3Url);
    setDubbedFromId(originalPostId || null);
    setActiveTab(Tab.CREATE);
  };

  const checkOnboarding = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', userId)
        .maybeSingle();
      
      if (!data || !data.onboarding_completed) {
        setShowOnboarding(true);
      }
    } catch (err) {
      console.error('Error checking onboarding:', err);
    }
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

    if (viewAudioPostId) {
      return (
        <AudioDetailsPage
          postId={viewAudioPostId}
          onBack={() => setViewAudioPostId(null)}
          onDub={(mp3Url, originalPostId) => {
            setViewAudioPostId(null);
            handleDub(mp3Url, originalPostId);
          }}
          onNavigateToProfile={handleNavigateToProfile}
          onNavigateToPost={(postId) => {
            setViewAudioPostId(null);
            handleNavigateToPost(postId);
          }}
        />
      );
    }

    switch (activeTab) {
      case Tab.HOME:
        return <Feed 
          onNavigateToProfile={handleNavigateToProfile} 
          onRequireAuth={() => setActiveTab(Tab.PROFILE)} 
          initialPostId={targetPostId} 
          feedFilter={feedFilter}
          onDub={handleDub}
          onViewAudio={(audioPostId) => setViewAudioPostId(audioPostId)}
          onClearFilter={() => {
            if (feedFilter) {
              const targetUserId = feedFilter.userId;
              setFeedFilter(null);
              setTargetPostId(null);
              handleNavigateToProfile(targetUserId);
            } else {
              setFeedFilter(null);
            }
          }}
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
            setDubbingMp3Url(null);
            setDubbedFromId(null);
            setActiveTab(Tab.HOME); 
          }} 
          onBackgroundUpload={handleBackgroundUpload}
          onStartLive={() => {
            setIsHosting(true);
            setActiveLiveId(null);
          }}
          initialType={isCreatingStory ? 'story' : 'post'}
          dubbingMp3Url={dubbingMp3Url}
          dubbedFromId={dubbedFromId}
          onClearDubbing={() => {
            setDubbingMp3Url(null);
            setDubbedFromId(null);
          }}
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
            onNavigateToProfile={handleNavigateToProfile}
            onBack={handleGoHome}
          />
        );
      }
      default:
        return <Feed onNavigateToProfile={handleNavigateToProfile} onDub={handleDub} onViewAudio={(audioPostId) => setViewAudioPostId(audioPostId)} />;
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

      {showOnboarding && user && (
        <Onboarding 
          userId={user.id} 
          userEmail={user.email || ''} 
          onComplete={() => setShowOnboarding(false)} 
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

      {activeTab !== Tab.CREATE && activeTab !== Tab.PROFILE && !feedFilter && !viewAudioPostId && (
        <nav className="h-[60px] lg:h-[64px] shrink-0 border-t border-white/5 flex items-center justify-around bg-black/95 backdrop-blur-3xl z-[100] relative px-2 lg:px-8">
          <button 
            onClick={handleGoHome}
            onContextMenu={(e) => { e.preventDefault(); checkApiHealth(); }}
            className={`flex items-center justify-center transition-all outline-none ${activeTab === Tab.HOME ? 'text-white scale-110' : 'text-zinc-600 hover:text-white'}`}
          >
            <Home size={26} strokeWidth={activeTab === Tab.HOME ? 2.5 : 2} />
          </button>
          <button 
            onClick={() => { setActiveTab(Tab.DISCOVER); }}
            className={`flex items-center justify-center transition-all outline-none ${activeTab === Tab.DISCOVER ? 'text-white scale-110' : 'text-zinc-600 hover:text-white'}`}
          >
            <Compass size={26} strokeWidth={activeTab === Tab.DISCOVER ? 2.5 : 2} />
          </button>
          <button 
            onClick={() => { setIsCreatingStory(false); setActiveTab(Tab.CREATE); }}
            className="flex items-center justify-center group outline-none"
          >
            <div className="w-12 h-9 bg-zinc-600 rounded-xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(113,113,122,0.3)] group-active:scale-90 transition-all border border-white/10">
              <span className="text-2xl font-black tracking-wide select-none">+</span>
            </div>
          </button>
          <button 
            onClick={() => { setActiveTab(Tab.LIVE); }}
            className={`flex items-center justify-center transition-all outline-none ${activeTab === Tab.LIVE ? 'text-white scale-110' : 'text-zinc-600 hover:text-white'}`}
          >
            <Radio size={26} strokeWidth={activeTab === Tab.LIVE ? 2.5 : 2} />
          </button>
          <button 
            onClick={() => { setActiveTab(Tab.INBOX); }}
            className={`flex items-center justify-center transition-all outline-none relative ${activeTab === Tab.INBOX ? 'text-white scale-110' : 'text-zinc-600 hover:text-white'}`}
          >
            <div className="relative">
              <Bell size={26} strokeWidth={activeTab === Tab.INBOX ? 2.5 : 2} />
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center text-[8px] font-black border border-black shadow-lg">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </div>
              )}
            </div>
          </button>
          <button 
            onClick={() => { setViewProfileId(null); setActiveTab(Tab.PROFILE); }}
            className={`flex items-center justify-center transition-all outline-none ${activeTab === Tab.PROFILE && !viewProfileId ? 'text-white scale-110' : 'text-zinc-600 hover:text-white'}`}
          >
            <UserIcon size={26} strokeWidth={activeTab === Tab.PROFILE && !viewProfileId ? 2.5 : 2} />
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;