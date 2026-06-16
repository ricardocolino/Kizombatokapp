import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { X, CheckCircle2, AlertCircle, Loader2, Zap, Music, Type, RotateCw, Sparkles, Smile } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { uploadToR2 } from '../services/uploadService';

interface CreateStoryProps {
  onCreated: () => void;
  onBackgroundUpload?: (data: {
    mediaFile: File | Blob;
    mediaFiles?: (File | Blob)[];
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
    dubbingDelayMs?: number;
    textOverlay?: string | null;
    rotation?: 0 | 90 | 180 | 270;
  }) => void;
  dubbingMp3Url?: string | null;
  dubbedFromId?: string | null;
  onClearDubbing?: () => void;
}

interface DubMusic {
  id: string;
  content: string | null;
  mp3_url: string;
  user_id: string;
  profiles?: {
    username: string;
    avatar_url?: string | null;
  } | null;
}

// Filtros visuais disponíveis (filtros CSS e nomes personalizados)
interface VisualFilter {
  id: string;
  name: string;
  class: string;
  tagline: string;
}

const VISUAL_FILTERS: VisualFilter[] = [
  { id: 'normal', name: 'Normal', class: '', tagline: 'Banda Real' },
  { id: 'warm', name: 'Alvorada', class: 'sepia-[0.3] contrast-[1.1] saturate-[1.25]', tagline: 'Estética Quente da Banda' },
  { id: 'monochrome', name: 'Samba Noir', class: 'grayscale', tagline: 'Clássico Preto & Branco' },
  { id: 'vintage', name: 'Kizomba', class: 'sepia-[0.45] contrast-[0.95]', tagline: 'Visual Retrô e Romântico' },
  { id: 'vibrant', name: 'Luanda', class: 'saturate-[1.6] contrast-[1.05]', tagline: 'Cores Vivas e Brilhantes' },
  { id: 'cool', name: 'Maresia', class: 'hue-rotate-[15deg] saturate-[1.1] brightness-[1.05]', tagline: 'Tom Azulado Moderno' }
];

export const CreateStory: React.FC<CreateStoryProps> = ({
  onCreated,
  onBackgroundUpload,
  dubbingMp3Url,
  dubbedFromId,
  onClearDubbing
}) => {
  const [textOverlay, setTextOverlay] = useState('');
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<(File | Blob)[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Câmera e Gravação
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [maxDuration] = useState(15); 
  const [facingMode, setFacingMode] = useState<'user' | 'rear'>('user');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [recordedFacingMode, setRecordedFacingMode] = useState<'user' | 'rear'>('user');
  const [dubbingDelayMs, setDubbingDelayMs] = useState<number>(0);
  const [isFromGallery, setIsFromGallery] = useState(false);

  // Filtros Visuais
  const [selectedFilter, setSelectedFilter] = useState<VisualFilter>(VISUAL_FILTERS[0]);
  const [showFiltersMenu, setShowFiltersMenu] = useState(false);

  // Músicas / Dublagem
  const [localDubbingUrl, setLocalDubbingUrl] = useState<string | null>(null);
  const [localDubbedFromId, setLocalDubbedFromId] = useState<string | null>(null);
  const activeDubbingMp3Url = localDubbingUrl || dubbingMp3Url || null;
  const activeDubbedFromId = localDubbedFromId || dubbedFromId || null;

  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [musicList, setMusicList] = useState<DubMusic[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicSearch, setMusicSearch] = useState('');
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const dubbingAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inicializar câmera se for nativa
  const facingModeRef = useRef(facingMode);
  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  useEffect(() => {
    return () => {
      if (dubbingAudioRef.current) {
        dubbingAudioRef.current.pause();
        dubbingAudioRef.current = null;
      }
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // Fechar câmera e limpar buffers
  const stopCamera = React.useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await CameraPreview.stop();
      } catch (e) {
        console.error("Erro ao parar câmera nativa:", e);
      }
    }
    setIsFlashOn(false);
  }, []);

  // Solicitar permissões explícitas
  const requestPermissions = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        // Traz o pop-up nativo de vídeo e áudio juntos
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          stream.getTracks().forEach(track => track.stop());
        } catch { /* ignore */ }
        await CameraPreview.requestPermissions();
      } catch (err) {
        console.error('Erro ao pedir permissões nativas:', err);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => track.stop());
      } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    requestPermissions();
  }, []);

  const startCamera = React.useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    
    if (!Capacitor.isNativePlatform()) {
      setIsStarting(false);
      return;
    }
    
    try {
      try { await CameraPreview.stop(); } catch { /* ignore */ }
      
      const status = await CameraPreview.requestPermissions();
      if (status.camera !== 'granted') {
        setError("Precisamos de acesso à câmara para o Story.");
        setIsStarting(false);
        return;
      }

      await CameraPreview.start({
        parent: 'cameraPreview',
        position: facingModeRef.current,
        toBack: true,
        className: 'cameraPreview',
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setError(null);
    } catch (err: unknown) {
      console.error("Erro ao abrir a câmera nativa:", err);
    } finally {
      setIsStarting(false);
    }
  }, [isStarting]);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      startCamera();
    }, 500); 
    
    return () => {
      clearTimeout(initTimer);
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera, stopCamera]);

  // Transparência de fundo nativo para visualização direta do overlay de câmera
  useEffect(() => {
    const isPreview = previewUrls.length > 0;
    
    const setTransparency = (transparent: boolean) => {
      const color = transparent ? 'transparent' : '';
      document.documentElement.style.backgroundColor = color;
      document.body.style.backgroundColor = color;
      const root = document.getElementById('root');
      if (root) root.style.backgroundColor = color;
    };

    if (!isPreview && Capacitor.isNativePlatform()) {
      setTransparency(true);
    } else {
      setTransparency(false);
    }
    
    return () => {
      setTransparency(false);
    };
  }, [previewUrls.length]);

  // Alternar Câmera (Flip)
  const toggleCamera = async () => {
    if (isRecording) return;
    if (Capacitor.isNativePlatform()) {
      try {
        await CameraPreview.flip();
        setFacingMode(prev => {
          const nextMode = prev === 'user' ? 'rear' : 'user';
          if (nextMode === 'user' && isFlashOn) {
            setIsFlashOn(false);
          }
          return nextMode;
        });
      } catch (e) {
        console.error("Erro ao girar câmera:", e);
      }
    } else {
      setFacingMode(prev => (prev === 'user' ? 'rear' : 'user'));
    }
  };

  // Alternar Flash
  const toggleFlash = async () => {
    if (!Capacitor.isNativePlatform()) {
      setIsFlashOn(prev => !prev);
      return;
    }
    try {
      const nextFlashState = !isFlashOn;
      await CameraPreview.setFlashMode({
        flashMode: nextFlashState ? 'on' : 'off'
      });
      setIsFlashOn(nextFlashState);
    } catch (e) {
      console.error("Erro ao controlar flash:", e);
    }
  };

  // Iniciar e parar gravação
  const handleCaptureOrRecord = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    // Clique único: Tira Foto!
    await takePhoto();
  };

  // Segurar o botão de gravação ou duplo clique: gravar vídeo!
  const startRecording = async () => {
    if (isRecording) return;
    
    if (Capacitor.isNativePlatform()) {
      try {
        setRecordedFacingMode(facingMode);
        const startTime = performance.now();

        await CameraPreview.startRecordVideo({
          width: window.innerWidth,
          height: window.innerHeight,
          position: facingMode,
          disableAudio: false
        });

        const endTime = performance.now();
        setDubbingDelayMs(Math.round(endTime - startTime));
        setIsRecording(true);

        if (activeDubbingMp3Url) {
          try {
            if (dubbingAudioRef.current) {
              dubbingAudioRef.current.currentTime = 0;
            } else {
              dubbingAudioRef.current = new Audio(activeDubbingMp3Url);
            }
            dubbingAudioRef.current.play().catch(e => console.error("Erro na reprodução do som:", e));
          } catch (playbackError) {
            console.error("Erro áudio sync:", playbackError);
          }
        }

        setRecordingSeconds(0);
        timerRef.current = window.setInterval(() => {
          setRecordingSeconds(prev => prev + 1);
        }, 1000);
      } catch (err) {
        console.error("Erro ao gravar vídeo:", err);
        setError("Erro ao iniciar a gravação.");
      }
    } else {
      // Simulação de gravação na Web
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = React.useCallback(async () => {
    if (!isRecording) return;
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (dubbingAudioRef.current) {
      try {
        dubbingAudioRef.current.pause();
        dubbingAudioRef.current.currentTime = 0;
      } catch (err) {
        console.error("Erro ao pausar dublagem:", err);
      }
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await CameraPreview.stopRecordVideo();
        if (result.videoFilePath) {
          const response = await fetch(Capacitor.convertFileSrc(result.videoFilePath));
          const videoBlob = await response.blob();
          
          setMediaFiles([videoBlob]);
          setPreviewUrls([URL.createObjectURL(videoBlob)]);
          setIsFromGallery(false);
          stopCamera();
        }
      } catch (e) {
        console.error("Erro ao parar câmera:", e);
      }
    } else {
      // Mock de gravação de vídeo na web para facilitar testes
      const fakeVideoBlob = new Blob([], { type: 'video/mp4' });
      setMediaFiles([fakeVideoBlob]);
      setPreviewUrls(['https://www.w3schools.com/html/mov_bbb.mp4']);
      setIsFromGallery(false);
    }
    setIsRecording(false);
  }, [stopCamera, isRecording]);

  useEffect(() => {
    if (isRecording && recordingSeconds >= maxDuration) {
      stopRecording();
    }
  }, [recordingSeconds, isRecording, maxDuration, stopRecording]);

  // Capturar Foto Instantânea
  const takePhoto = async () => {
    if (isStarting || isRecording) return;
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await CameraPreview.capture({ quality: 85 });
        if (result.value) {
          const response = await fetch(`data:image/jpeg;base64,${result.value}`);
          const blob = await response.blob();
          
          setMediaFiles([blob]);
          setPreviewUrls([URL.createObjectURL(blob)]);
          setIsFromGallery(false);
          setRecordedFacingMode(facingMode);
          await stopCamera();
        }
      } catch (err) {
        console.error("Erro ao tirar foto nativa:", err);
        setError("Erro ao tirar foto. Tenta novamente!");
      }
    } else {
      // Simulação na Web
      setError("Foto instantânea gerada para testes web!");
      const fakeImage = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800";
      const blobResp = await fetch(fakeImage);
      const blob = await blobResp.blob();
      setMediaFiles([blob]);
      setPreviewUrls([fakeImage]);
      setIsFromGallery(false);
    }
  };

  // Carregar músicas da tabela de posts que têm música cadastrada
  const loadMusics = async (search: string = '') => {
    setMusicLoading(true);
    try {
      let query = supabase
        .from('posts')
        .select('id, content, mp3_url, user_id, profiles!user_id(username, avatar_url)')
        .not('mp3_url', 'is', null);

      if (search.trim()) {
        query = query.ilike('content', `%${search.trim()}%`);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(15);

      if (error) {
        console.error('Erro ao buscar músicas:', error);
      } else {
        setMusicList(data || []);
      }
    } catch (e) {
      console.error('Erro em loadMusics:', e);
    } finally {
      setMusicLoading(false);
    }
  };

  useEffect(() => {
    if (showMusicSelector) {
      loadMusics(musicSearch);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
        setPlayingMusicId(null);
      }
    }
  }, [showMusicSelector, musicSearch]);

  const handleTogglePreview = (e: React.MouseEvent, musicId: string, mp3Url: string) => {
    e.stopPropagation();
    try {
      if (playingMusicId === musicId) {
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
        }
        setPlayingMusicId(null);
      } else {
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
        }
        previewAudioRef.current = new Audio(mp3Url);
        previewAudioRef.current.play().catch(err => console.error("Erro ao tocar prévia:", err));
        setPlayingMusicId(musicId);
        
        previewAudioRef.current.onended = () => {
          setPlayingMusicId(null);
        };
      }
    } catch (err) {
      console.error("Erro no preview de áudio:", err);
    }
  };

  const handleSelectMusic = (mp3Url: string, postId: string) => {
    setLocalDubbingUrl(mp3Url);
    setLocalDubbedFromId(postId);
    setShowMusicSelector(false);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPlayingMusicId(null);
    }
  };

  const handleGalleryClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setMediaFiles([file]);
      setPreviewUrls([URL.createObjectURL(file)]);
      setIsFromGallery(true);
      stopCamera();
    }
  };

  // Publicação do Story ou envio via Background
  const handlePublishStream = async () => {
    if (mediaFiles.length === 0) return;

    if (onBackgroundUpload) {
      console.log("[CreateStory] Enviando Story em segundo plano...");
      onBackgroundUpload({
        mediaFile: mediaFiles[0],
        mediaFiles,
        content: '',
        uploadType: 'story',
        recordedFacingMode,
        isFromGallery,
        trimStart: 0,
        trimEnd: maxDuration,
        recordingSeconds,
        dubbedMp3Url: activeDubbingMp3Url,
        dubbedFromId: activeDubbedFromId,
        dubbingDelayMs,
        textOverlay: textOverlay || null,
        rotation: 0
      });
      onCreated();
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faz login novamente.');
      
      const userId = session.user.id;
      const timestamp = Date.now();
      const isVideo = mediaFiles[0].type.startsWith('video/') || mediaFiles[0].type === ''; // lidar com mocks

      const fileExt = isVideo ? 'mp4' : mediaFiles[0].type.split('/').pop() || 'jpg';
      const fileName = `${userId}-${timestamp}.${fileExt}`;
      
      console.log("[CreateStory] Fazendo upload do arquivo de mídia para R2...");
      const finalMediaUrl = await uploadToR2(mediaFiles[0], 'stories', fileName);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      console.log("[CreateStory] Gravando registro de Story no Supabase...");
      const { error: insertError } = await supabase.from('stories').insert({
        user_id: userId,
        media_url: finalMediaUrl,
        media_type: isVideo ? 'video' : 'image',
        expires_at: expiresAt.toISOString(),
        text_overlay: textOverlay || null
      });

      if (insertError) throw insertError;

      console.log("[CreateStory] Story criado com sucesso!");
      setTimeout(() => onCreated(), 500);
    } catch (err: unknown) {
      console.error("[CreateStory] Erro ao publicar:", err);
      setError(err instanceof Error ? err.message : 'Falha na publicação');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (previewUrls.length > 0) {
      setPreviewUrls([]);
      setMediaFiles([]);
      setTextOverlay('');
      startCamera();
    } else {
      onCreated();
    }
  };

  return (
    <div id="createStoryPage" className="fixed inset-0 h-[100dvh] w-screen bg-black z-50 text-white select-none overflow-hidden flex flex-col">
      {/* Câmara Fullscreen ou Visualizador em Transparência */}
      {!previewUrls.length && (
        <div id="cameraPreview" className="absolute inset-0 w-full h-full bg-zinc-950/20 pointer-events-none z-0" />
      )}

      {/* Seção Principal de Edição de Mídia Pronta */}
      {previewUrls.length > 0 && (
        <div className="absolute inset-0 w-full h-full z-10 flex items-center justify-center bg-black">
          {mediaFiles[0]?.type.startsWith('video/') || previewUrls[0].endsWith('.mp4') ? (
            <video 
              src={previewUrls[0]} 
              autoPlay 
              loop 
              muted 
              className={`w-full h-full object-cover ${selectedFilter.class}`}
            />
          ) : (
            <img 
              src={previewUrls[0]} 
              alt="Preview" 
              className={`w-full h-full object-cover ${selectedFilter.class}`}
              referrerPolicy="no-referrer"
            />
          )}

          {/* Overlay de Texto Aa adicionado */}
          {textOverlay && (
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/20 text-center max-w-[80%] break-words shadow-2xl animate-[fadeIn_0.2s_ease-out]">
              <span className="text-xl font-black text-white tracking-wide uppercase drop-shadow-md">{textOverlay}</span>
            </div>
          )}

          {/* Marca de filtro aplicado de forma sutil */}
          {selectedFilter.id !== 'normal' && (
            <div className="absolute bottom-32 left-4 bg-purple-600/60 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-purple-500/30">
              <Sparkles size={11} className="animate-pulse text-white" />
              Filtro: {selectedFilter.name}
            </div>
          )}
        </div>
      )}

      {/* Barra Superior */}
      <div className="relative z-30 flex items-center justify-between px-4 pt-12 pb-4 bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={handleClose}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-lg flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <X size={24} />
        </button>

        {previewUrls.length === 0 && activeDubbingMp3Url && (
          <div className="flex items-center gap-2 bg-purple-600/60 backdrop-blur-lg px-4 py-1.5 rounded-full text-xs font-bold border border-white/10 shrink max-w-[60%] truncate">
            <Music size={12} className="animate-spin" />
            <span className="truncate">Local Selecionado</span>
            <button 
              onClick={(e) => { e.stopPropagation(); if (onClearDubbing) onClearDubbing(); setLocalDubbingUrl(null); }}
              className="text-[10px] uppercase font-black tracking-widest text-white/50 hover:text-white"
            >
              [X]
            </button>
          </div>
        )}

        <div className="w-10" />
      </div>

      {/* Controles Laterais Direitos - Menus ricos parecidos com o TikTok do print */}
      {previewUrls.length === 0 && (
        <div className="absolute right-4 top-28 z-30 flex flex-col gap-5 bg-black/25 backdrop-blur-xl p-2 rounded-2xl border border-white/5">
          {/* 1. Girar Câmera */}
          <button 
            onClick={toggleCamera}
            className="flex flex-col items-center gap-0.5 group"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-active:scale-95 transition-transform text-white">
              <RotateCw size={18} />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-zinc-300 drop-shadow">Girar</span>
          </button>

          {/* 2. Flash */}
          <button 
            onClick={toggleFlash}
            className="flex flex-col items-center gap-0.5 group"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center group-active:scale-95 transition-transform text-white ${isFlashOn ? 'bg-amber-500' : 'bg-white/10'}`}>
              <Zap size={18} />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-zinc-300 drop-shadow">Flash</span>
          </button>

          {/* 3. Texto */}
          <button 
            onClick={() => setShowTextEditor(true)}
            className="flex flex-col items-center gap-0.5 group"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-active:scale-95 transition-transform text-white">
              <Type size={18} />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-zinc-300 drop-shadow">Texto</span>
          </button>

          {/* 4. Filtros Especiais */}
          <button 
            onClick={() => setShowFiltersMenu(prev => !prev)}
            className="flex flex-col items-center gap-0.5 group relative"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center group-active:scale-95 transition-transform text-white relative ${selectedFilter.id !== 'normal' ? 'bg-gradient-to-tr from-purple-600 to-indigo-600' : 'bg-white/10'}`}>
              <Smile size={18} />
              {/* Notificaçãozinha vermelha igual imagem TikTok */}
              <div className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black" />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-zinc-300 drop-shadow">Filtros</span>
          </button>

          {/* 5. Sons / Música */}
          <button 
            onClick={() => setShowMusicSelector(true)}
            className="flex flex-col items-center gap-0.5 group"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-active:scale-95 transition-transform text-white">
              <Music size={18} />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-zinc-300 drop-shadow">Sons</span>
          </button>
        </div>
      )}

      {/* ÁREA INFERIOR DE CONTROLES - Estilo TikTok da Foto */}
      <div className="mt-auto relative z-30 pb-10 pt-4 bg-gradient-to-t from-black via-black/90 to-transparent">
        {error && (
          <div className="mx-4 mb-4 p-3 rounded-xl bg-red-950/80 border border-red-900/50 flex items-start gap-2.5 text-xs text-red-200">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {previewUrls.length === 0 ? (
          <div className="flex flex-col items-center">
            {/* Seletor de Modo Horizontal (FLIP STORY | STORY selecionado) */}
            <div className="flex items-center gap-6 mb-6">
              <button 
                onClick={toggleCamera}
                className="text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                FLIP STORY
              </button>
              <div className="relative py-1 px-3 bg-white text-black text-[11px] font-black uppercase tracking-widest rounded-full shadow-lg">
                STORY
              </div>
            </div>

            {/* Trilogia de Botões de Capture/Gravação do Rodapé */}
            <div className="w-full px-8 flex items-center justify-around gap-4 mb-3">
              {/* Esquerda: Seletor de Galeria com imagem da thumbnail ou mockup */}
              <button 
                onClick={handleGalleryClick}
                className="w-14 h-14 rounded-2xl bg-zinc-900 border-2 border-zinc-700/50 overflow-hidden flex items-center justify-center relative active:scale-95 transition-transform group"
              >
                {/* Imagem de Galeria realística no canto igual TikTok */}
                <img 
                  src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120" 
                  alt="Galeria" 
                  className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] font-black text-center tracking-tighter uppercase py-0.5">
                  Galería
                </div>
              </button>

              {/* Centro: Grande botão de captura ciano/azul neon do TikTok */}
              <div className="relative flex items-center justify-center w-24 h-24">
                <button
                  onClick={handleCaptureOrRecord}
                  onMouseDown={() => {
                    // Gravação segura ao manter pressionado na Web/Nativo
                    startRecording();
                  }}
                  onMouseUp={stopRecording}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    startRecording();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    stopRecording();
                  }}
                  className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                    isRecording 
                      ? 'w-24 h-24 border-[4px] border-white ring-4 ring-cyan-500/20' 
                      : 'w-20 h-20 border-[4px] border-white hover:scale-105 active:scale-95'
                  }`}
                >
                  <div className={`bg-gradient-to-tr from-cyan-400 via-sky-500 to-sky-300 shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all duration-300 ${
                    isRecording ? 'w-10 h-10 rounded-lg' : 'w-16 h-16 rounded-full'
                  }`} />
                </button>
              </div>

              {/* Direita: Botão de Efeitos (Vila de Embelezamento do Print) */}
              <button 
                onClick={() => setShowFiltersMenu(prev => !prev)}
                className="w-14 h-14 rounded-2xl bg-white flex flex-col items-center justify-center relative active:scale-95 transition-transform shadow-lg border border-zinc-200"
              >
                <Sparkles size={20} className="text-cyan-500" />
                <span className="text-[8px] font-black text-cyan-600 uppercase tracking-tight mt-0.5">Banda</span>
              </button>
            </div>

            {/* Texto informativo de ajuda de gravação conforme a imagem */}
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-2">
              {isRecording ? "A Gravar momento..." : "Clica para foto, segura para vídeo"}
            </p>
          </div>
        ) : (
          /* Botão de Partilhar o Story no ar (modo preview pronto) */
          <div className="flex flex-col items-center px-6">
            <div className="w-full flex items-center gap-4">
              <button 
                onClick={() => { setPreviewUrls([]); setMediaFiles([]); }}
                className="flex-1 py-3.5 rounded-2xl bg-zinc-900 border border-white/10 font-bold text-sm tracking-wide text-zinc-300 active:scale-95 transition-transform uppercase"
              >
                Refazer / Apagar
              </button>

              <button 
                onClick={handlePublishStream}
                disabled={uploading}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-700 shadow-[0_4px_25px_rgba(124,58,237,0.5)] font-black text-sm tracking-wide active:scale-95 transition-transform uppercase flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>A Publicar...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Partilhar Story</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editor de Texto Aa (Aa Legenda) */}
      {showTextEditor && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-md animate-[fadeIn_0.15s_ease-out]">
          <div className="w-full max-w-md bg-zinc-950 rounded-3xl border border-zinc-800 p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-purple-400">Aa - Legenda no Story</h3>
            <textarea
              value={textOverlay}
              onChange={(e) => setTextOverlay(e.target.value)}
              placeholder="Escreve uma frase dupla para o momento..."
              maxLength={60}
              className="w-full h-24 bg-zinc-900 text-white rounded-2xl p-4 text-base font-bold text-center border border-zinc-800 focus:border-purple-600 focus:outline-none placeholder-zinc-600 resize-none"
            />
            <div className="flex items-center justify-between text-xs text-zinc-500 font-bold">
              <span>Máximo 60 caracteres</span>
              <span>{60 - textOverlay.length} restantes</span>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => { setTextOverlay(''); setShowTextEditor(false); }}
                className="flex-1 py-3 rounded-xl bg-zinc-900 text-zinc-400 font-bold text-xs uppercase"
              >
                Limpar
              </button>
              <button 
                onClick={() => setShowTextEditor(false)}
                className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-black text-xs uppercase shadow-lg shadow-purple-600/35"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu de Filtros Rápidos Estilo TikTok */}
      {showFiltersMenu && (
        <div className="fixed inset-x-0 bottom-0 bg-black/95 border-t border-zinc-900 z-50 pb-12 pt-6 rounded-t-[32px] shadow-2xl animate-[slideUp_0.25s_ease-out]">
          <div className="px-6 flex items-center justify-between mb-4">
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-widest text-purple-400">Filtros da Banda</span>
              <span className="text-[10px] text-zinc-500 font-bold">{selectedFilter.tagline}</span>
            </div>
            <button 
              onClick={() => setShowFiltersMenu(false)}
              className="text-xs font-bold text-zinc-400 hover:text-white uppercase tracking-wider"
            >
              Fechar
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto px-6 py-2 no-scrollbar">
            {VISUAL_FILTERS.map(filter => (
              <button
                key={filter.id}
                onClick={() => setSelectedFilter(filter)}
                className="flex flex-col items-center gap-2 shrink-0 group focus:outline-none"
              >
                <div className={`w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all ${selectedFilter.id === filter.id ? 'border-purple-500 scale-105' : 'border-zinc-800'}`}>
                  {/* Visualização estática do filtro com avatar fictício da banda */}
                  <img 
                    src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100" 
                    alt={filter.name} 
                    className={`w-full h-full object-cover ${filter.class}`}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className={`text-[10px] font-black uppercase tracking-tighter ${selectedFilter.id === filter.id ? 'text-purple-400' : 'text-zinc-500'}`}>{filter.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Seletor de Sons / Áudio */}
      {showMusicSelector && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col animate-[fadeIn_0.2s_ease-out]">
          <div className="pt-12 pb-4 px-4 border-b border-zinc-900 bg-zinc-950 flex items-center gap-4 shrink-0">
            <button onClick={() => setShowMusicSelector(false)} className="text-zinc-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
            <input
              type="text"
              placeholder="Pesquisar sons da banda..."
              value={musicSearch}
              onChange={(e) => setMusicSearch(e.target.value)}
              className="flex-1 bg-zinc-900 text-zinc-100 rounded-full py-2 px-4 text-xs font-medium border border-zinc-800 focus:outline-none focus:border-purple-600 placeholder-zinc-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {musicLoading ? (
              <div className="flex items-center justify-center py-10 text-xs text-zinc-500">
                <Loader2 size={16} className="animate-spin mr-2" />
                <span>Carregando biblioteca...</span>
              </div>
            ) : musicList.length === 0 ? (
              <div className="text-center py-10 text-xs text-zinc-650 italic">
                Nenhum áudio encontrado. Tenta outro termo!
              </div>
            ) : (
              musicList.map(music => (
                <div 
                  key={music.id}
                  onClick={() => handleSelectMusic(music.mp3_url, music.id)}
                  className="p-3 rounded-2xl bg-zinc-950 border border-zinc-900 hover:border-purple-900/40 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-purple-900/20 flex items-center justify-center shrink-0 border border-purple-900/30">
                      <Music size={16} className="text-purple-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate uppercase tracking-tight">{music.content || 'Áudio Sem Título'}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider truncate">@{music.profiles?.username || 'artista'}</p>
                    </div>
                  </div>

                  <button 
                    onClick={(e) => handleTogglePreview(e, music.id, music.mp3_url)}
                    className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-purple-900/20 border border-zinc-800 flex items-center justify-center shrink-0 text-white hover:text-purple-400 transition-colors"
                  >
                    {playingMusicId === music.id ? (
                      <div className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-ping" />
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest">[Som]</span>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Input de Arquivo oculto para Galeria */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,video/*"
        className="hidden"
      />
    </div>
  );
};

export default CreateStory;
