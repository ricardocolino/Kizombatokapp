import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { X, CheckCircle2, AlertCircle, Loader2, Zap, FlipVertical as Flip, Type, Wand2, Image as ImageIcon, Scissors, BookOpen } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { uploadToR2 } from '../services/uploadService';

interface CreatePostProps {
  onCreated: () => void;
  initialType?: 'post' | 'story';
}

const CreatePost: React.FC<CreatePostProps> = ({ onCreated, initialType = 'post' }) => {
  const [content, setContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<(File | Blob)[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Recording State - SEMPRE INICIA COM 'user' (Câmera de Frente)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [maxDuration, setMaxDuration] = useState(15); 
  const [facingMode, setFacingMode] = useState<'user' | 'rear'>('user');
  const facingModeRef = useRef(facingMode);
  
  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [recordedFacingMode, setRecordedFacingMode] = useState<'user' | 'rear'>('user');
  const [textOverlay, setTextOverlay] = useState('');
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [filter, setFilter] = useState('none');
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(15);
  const [showTrimEditor, setShowTrimEditor] = useState(false);
  const [isEducation, setIsEducation] = useState(false);
  const [uploadType, setUploadType] = useState<'post' | 'story'>(initialType);

  const filters = [
    { name: 'Nenhum', value: 'none' },
    { name: 'P&B', value: 'grayscale(100%)' },
    { name: 'Sépia', value: 'sepia(100%)' },
    { name: 'Vibrante', value: 'saturate(200%)' },
    { name: 'Quente', value: 'sepia(30%) saturate(150%) hue-rotate(-10deg)' },
    { name: 'Frio', value: 'saturate(80%) hue-rotate(180deg) brightness(1.1)' },
    { name: 'Inverter', value: 'invert(100%)' },
    { name: 'Blur', value: 'blur(2px)' },
  ];

  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const nativeVideoInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [processingVideo, setProcessingVideo] = useState(false); // Mantido para o estado do botão

  // Mapeia filtros CSS para filtros FFmpeg reais
  const cssFilterToFFmpeg = (cssFilter: string): string | null => {
    if (!cssFilter || cssFilter === 'none') return null;
    if (cssFilter === 'grayscale(100%)') return 'hue=s=0';
    if (cssFilter === 'sepia(100%)') return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
    if (cssFilter === 'saturate(200%)') return 'eq=saturation=2';
    if (cssFilter === 'invert(100%)') return 'negate';
    if (cssFilter.includes('blur(2px)')) return 'boxblur=2:2';
    if (cssFilter.includes('sepia(30%)')) return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=saturation=1.5';
    if (cssFilter.includes('hue-rotate(180deg)')) return 'hue=h=180,eq=saturation=0.8:brightness=1.1';
    return null;
  };

  const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegRef.current && ffmpegLoaded) return ffmpegRef.current;
    const ffmpeg = new FFmpeg();
    
    // Adicionar logs detalhados para depuração
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg Log]', message);
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ffmpeg;
    setFfmpegLoaded(true);
    return ffmpeg;
  };

  const isStartingRef = useRef(false);

  const stopCamera = React.useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await CameraPreview.stop();
      } catch (e) {
        console.error("Erro ao parar câmera nativa:", e);
      }
    }
    setShowCamera(false);
    setIsFlashOn(false);
  }, []);

  const startCamera = React.useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsStarting(true);
    
    if (!Capacitor.isNativePlatform()) {
      try {
        // Trigger browser permission prompt for both
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn("Erro ao pedir permissões no browser:", e);
      }
      setShowCamera(true);
      setIsStarting(false);
      isStartingRef.current = false;
      return;
    }
    
    try {
      // Ensure any previous instance is stopped
      try { await CameraPreview.stop(); } catch { /* ignore */ }
      
      // Request permissions explicitly for both camera and microphone
      // This is important for video recording to work with audio
      try {
        // Request both once to ensure permissions are granted for the session
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => track.stop());
        
        const status = await CameraPreview.requestPermissions();
        if (status.camera !== 'granted') {
          setError("Precisamos de acesso à câmara para funcionar.");
          return;
        }
      } catch (e) {
        console.warn("Erro ao pedir permissões nativas:", e);
      }

      await CameraPreview.start({
        parent: 'cameraPreview',
        position: facingModeRef.current,
        toBack: true,
        className: 'cameraPreview',
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setShowCamera(true);
      setError(null);
    } catch (err: unknown) {
      console.error("Erro ao iniciar câmera nativa:", err);
    } finally {
      setIsStarting(false);
      isStartingRef.current = false;
    }
  }, []); // Revertido para array vazio para não reiniciar ao escolher som

  // Gerir a transparência do fundo de forma robusta
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

  useEffect(() => {
    // Timer para iniciar a câmera após o componente montar
    const initTimer = setTimeout(() => {
      startCamera();
    }, 500); 
    
    return () => {
      clearTimeout(initTimer);
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera, stopCamera]);

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
      setFacingMode(prev => prev === 'user' ? 'rear' : 'user');
    }
  };

  const toggleFlash = async () => {
    if (facingMode === 'user') return; 
    
    if (Capacitor.isNativePlatform()) {
      try {
        const newFlashState = isFlashOn ? 'off' : 'torch';
        await CameraPreview.setFlashMode({ flashMode: newFlashState });
        setIsFlashOn(!isFlashOn);
      } catch (err) {
        console.error("Erro ao mudar flash para torch, tentando on:", err);
        try {
          const newFlashState = isFlashOn ? 'off' : 'on';
          await CameraPreview.setFlashMode({ flashMode: newFlashState });
          setIsFlashOn(!isFlashOn);
        } catch (err2) {
          console.error("Flash não suportado:", err2);
        }
      }
    }
  };

  const handleNativeVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFiles([file]);
      setPreviewUrls([URL.createObjectURL(file)]);
      stopCamera();
    }
  };

  const initiateRecording = async () => {
    if (isRecording || countdown !== null) return;
    startCountdown();
  };

  const startCountdown = () => {
    let count = 3;
    setCountdown(count);
    const countInterval = setInterval(async () => {
      count -= 1;
      if (count === 0) {
        clearInterval(countInterval);
        setCountdown(null);
        startActualRecording();
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  const startActualRecording = async () => {
    chunksRef.current = [];
    
    if (Capacitor.isNativePlatform()) {
      try {
        setRecordedFacingMode(facingMode);
        console.log(`[Recording] Iniciando gravação. Câmera: ${facingMode}`);

        // Iniciar gravação de vídeo
        const videoPromise = CameraPreview.startRecordVideo({
          width: window.innerWidth,
          height: window.innerHeight,
          position: facingMode,
          disableAudio: false
        });

        await videoPromise;
        
        setIsRecording(true);
        setRecordingSeconds(0);
        timerRef.current = window.setInterval(() => {
          setRecordingSeconds(prev => prev + 1);
        }, 1000);
      } catch (err) {
        console.error("Erro ao iniciar gravação nativa:", err);
        setError("Erro ao iniciar gravação.");
      }
      return;
    }

    // Fallback for non-native (WebRTC already removed, but keeping structure)
    setError("Gravação não suportada nesta plataforma.");
  };

  const isRecordingRef = useRef(false);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const stopRecording = React.useCallback(async () => {
    if (isRecordingRef.current) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (Capacitor.isNativePlatform()) {
        try {
          const result = await CameraPreview.stopRecordVideo();
          if (result.videoFilePath) {
            const response = await fetch(Capacitor.convertFileSrc(result.videoFilePath));
            const videoBlob = await response.blob();
            setMediaFiles([videoBlob]);
            setPreviewUrls([URL.createObjectURL(videoBlob)]);
            setTrimStart(0);
            setTrimEnd(recordingSeconds);
            stopCamera();
          }
        } catch (e) {
          console.error("Erro ao parar gravação nativa:", e);
        }
      }
      setIsRecording(false);
    }
  }, [stopCamera, recordingSeconds]);

  // Auto-stop recording when max duration is reached
  useEffect(() => {
    if (isRecording && recordingSeconds >= maxDuration) {
      stopRecording();
    }
  }, [recordingSeconds, isRecording, maxDuration, stopRecording]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const selectedFiles = files.slice(0, 5);
      const newPreviewUrls = selectedFiles.map(file => URL.createObjectURL(file));
      
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      
      setMediaFiles(selectedFiles);
      setPreviewUrls(newPreviewUrls);
      setTrimStart(0);
      setTrimEnd(15);
      setError(null);
    }
  };

  const generateThumbnail = (file: File | Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      
      // Importante: Não aplicar filtro aqui se o vídeo já foi processado pelo FFmpeg
      // Mas como a função é genérica, vamos garantir que ela captura um frame real
      
      video.onloadeddata = () => {
        // Tentar capturar aos 1 segundo ou no meio do vídeo se for mais curto
        const captureTime = Math.min(1.0, video.duration / 2);
        video.currentTime = captureTime;
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (!ctx || canvas.width === 0 || canvas.height === 0) {
          reject(new Error('Invalid video dimensions for thumbnail'));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to generate thumbnail blob'));
        }, 'image/jpeg', 0.8);
        
        URL.revokeObjectURL(video.src);
      };

      video.onerror = (e) => {
        console.error('[Thumbnail] Erro no elemento vídeo:', e);
        URL.revokeObjectURL(video.src);
        reject(new Error('Video error during thumbnail generation'));
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const handleUpload = async () => {
    if (mediaFiles.length === 0) return;
    
    setUploading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Por favor, faz login novamente.');
      
      const timestamp = Date.now();
      const userId = session.user.id;
      const isVideo = mediaFiles[0].type.startsWith('video/');

      let finalMediaBlob: Blob | (File | Blob) = mediaFiles[0];
      let finalThumbnailUrl: string | null = null;
      let finalMediaUrl: string | null = null;

      if (isVideo) {
        const hasTrim = trimStart > 0 || (trimEnd < recordingSeconds && recordingSeconds > 0);
        const baseFilter = cssFilterToFFmpeg(filter);
        const needsRotation = recordedFacingMode === 'rear';
        const hasText = !!textOverlay;
        const needsFFmpeg = !!baseFilter || hasTrim || needsRotation || hasText;

        if (needsFFmpeg) {
          // Lógica para Vídeo com FFmpeg Integrado
          console.log('[Upload] Iniciando processamento de vídeo e áudio com FFmpeg...');
          setProcessingVideo(true);
          const ffmpeg = await loadFFmpeg();
          
          // Limpeza preventiva de ficheiros de sessões anteriores que possam causar 'FS error'
          const cleanupFiles = ['input_raw.mp4', 'dubbing.mp3', 'output.mp4'];
          for (const f of cleanupFiles) {
            try { await ffmpeg.deleteFile(f); } catch { /* ignore */ }
          }

          const inputFileName = 'input_raw.mp4';
          
          console.log('[Upload] Descarregando vídeo gravado...');
          const videoData = await fetchFile(mediaFiles[0]);
          if (!videoData || videoData.length === 0) throw new Error('Falha ao ler os dados do vídeo original.');
          await ffmpeg.writeFile(inputFileName, videoData);

          // 1. Processar Vídeo (Filtros, Trim, Rotação, Texto)
          let vfFilter = baseFilter;
          
          if (hasText) {
            // Carregar fonte para o drawtext
            try {
              console.log('[Upload] Carregando fonte para o texto...');
              const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto-Regular.ttf';
              const fontData = await fetchFile(fontUrl);
              await ffmpeg.writeFile('font.ttf', fontData);
              
              const escapedText = textOverlay.replace(/'/g, "'\\''").replace(/:/g, '\\:');
              const textFilter = `drawtext=fontfile=font.ttf:text='${escapedText}':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2`;
              vfFilter = vfFilter ? `${vfFilter},${textFilter}` : textFilter;
            } catch (fontErr) {
              console.error('[Upload] Erro ao carregar fonte:', fontErr);
            }
          }

          if (needsRotation) {
            const rotation = 'hflip,vflip';
            vfFilter = vfFilter ? `${vfFilter},${rotation}` : rotation;
            console.log('[Upload] Aplicando rotação para câmera traseira');
          }
          
          const videoArgs: string[] = [];
          
          // Input 0: Vídeo
          if (hasTrim) {
            videoArgs.push('-ss', String(trimStart), '-to', String(trimEnd));
          }
          videoArgs.push('-i', inputFileName);

          // Filtros
          if (vfFilter) {
            videoArgs.push('-vf', vfFilter);
          }

          // Mapeamento: Áudio do input 0 (original)
          // O vídeo filtrado é mapeado automaticamente se não especificarmos -map 0:v:0
          console.log('[Upload] Mapeando áudio original');
          videoArgs.push('-map', '0:a:0?');

          if (vfFilter || hasTrim) {
            videoArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p');
            videoArgs.push('-c:a', 'aac', '-b:a', '128k');
          } else {
            videoArgs.push('-c:v', 'copy', '-c:a', 'copy');
          }

          videoArgs.push('-movflags', '+faststart', '-y', 'output.mp4');
          
          console.log('[FFmpeg] Executando comando:', videoArgs.join(' '));
          await ffmpeg.exec(videoArgs);
          
          console.log('[Upload] Lendo vídeo processado...');
          const videoOutput = await ffmpeg.readFile('output.mp4');
          if (!videoOutput || (videoOutput as Uint8Array).byteLength < 100) {
            throw new Error('O processamento do vídeo falhou (ficheiro de saída inválido).');
          }
          finalMediaBlob = new Blob([videoOutput], { type: 'video/mp4' });

          // Limpeza FFmpeg
          try {
            await ffmpeg.deleteFile(inputFileName);
            await ffmpeg.deleteFile('output.mp4');
          } catch { console.warn('Erro ao limpar ficheiros FFmpeg'); }
        } else {
          console.log('[Upload] FFmpeg não é necessário. Usando vídeo original.');
          finalMediaBlob = mediaFiles[0];
        }

        // 3. Gerar Thumbnail
        console.log('[Upload] Gerando thumbnail...');
        const thumbBlob = await generateThumbnail(finalMediaBlob);
        const thumbFileName = `${userId}-${timestamp}.jpg`;
        finalThumbnailUrl = await uploadToR2(thumbBlob, 'thumbnails', thumbFileName);
      }

      // 4. Upload do Ficheiro Final
      const fileExt = isVideo ? 'mp4' : (mediaFiles[0] as File).name?.split('.').pop() || 'jpg';
      const fileName = `${userId}-${timestamp}.${fileExt}`;
      const folder = uploadType === 'story' ? 'stories' : 'posts';
      finalMediaUrl = await uploadToR2(finalMediaBlob, folder, fileName);
      
      // 5. Salvar no Supabase
      console.log(`[Upload] Salvando ${uploadType} no Supabase...`);
      
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
          filter: filter === 'none' ? null : filter,
          views: 0,
          created_at: new Date().toISOString()
        });
        if (insertError) throw insertError;
      }
      
      console.log('[Upload] Sucesso total!');
      setTimeout(() => onCreated(), 500);

    } catch (err: unknown) {
      console.error('[Upload] Erro crítico detalhado:', err);
      let errorMsg = 'Erro desconhecido';
      
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'string') {
        errorMsg = err;
      } else {
        try {
          errorMsg = JSON.stringify(err);
        } catch {
          errorMsg = 'Erro complexo não serializável';
        }
      }
      
      setError(`Falha ao publicar: ${errorMsg}`);
    } finally {
      setUploading(false);
      setProcessingVideo(false);
    }
  };

  const cancelSelection = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setMediaFiles([]);
    setPreviewUrls([]);
    setError(null);

    // Resetar para câmera frontal e desligar flash
    setFacingMode('user');
    setIsFlashOn(false);

    startCamera();
  };

  return (
    <div className={`h-full w-full ${previewUrls.length === 0 ? 'bg-transparent' : 'bg-black'} flex flex-col relative overflow-hidden`}>
      {(isRecording || (showCamera && recordingSeconds > 0)) && (
        <div className="absolute top-0 left-0 w-full z-50 px-2 pt-4">
           <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden flex gap-0.5">
              <div 
                className="h-full bg-yellow-400 transition-all duration-1000 linear" 
                style={{ width: `${(recordingSeconds / maxDuration) * 100}%` }}
              />
           </div>
        </div>
      )}

      <div className="flex-1 relative">
        {previewUrls.length > 0 ? (
          <div className="h-full w-full flex flex-col bg-black">
            <div className="relative h-[320px] shrink-0 m-4 mb-2 bg-zinc-900 rounded-[32px] overflow-hidden shadow-2xl border border-zinc-800">
              {mediaFiles[0]?.type.startsWith('image/') ? (
                <div className="w-full h-full relative" style={{ filter: filter !== 'none' ? filter : undefined }}>
                  <img src={previewUrls[previewUrls.length - 1]} className="w-full h-full object-cover" />
                  {previewUrls.length > 1 && (
                    <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-white text-[10px] font-black uppercase tracking-widest">
                      {previewUrls.length} Fotos
                    </div>
                  )}
                </div>
              ) : (
                <video 
                  src={previewUrls[0]} 
                  className={`w-full h-full object-cover ${recordedFacingMode === 'rear' ? 'rotate-180' : ''}`} 
                  autoPlay 
                  loop 
                  playsInline 
                  muted={false}
                  style={{ filter: filter !== 'none' ? filter : undefined }} 
                  onPlay={() => {}}
                  onPause={() => {}}
                  onTimeUpdate={(e) => {
                    const video = e.currentTarget;
                    if (video.currentTime < trimStart) {
                      video.currentTime = trimStart;
                    }
                    if (video.currentTime > trimEnd) {
                      video.currentTime = trimStart;
                    }
                  }}
                />
              )}
              
              {textOverlay && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <span className="text-white text-xl font-black text-center px-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] break-words max-w-full">
                    {textOverlay}
                  </span>
                </div>
              )}

              <button onClick={cancelSelection} className="absolute top-4 left-4 p-2.5 bg-black/40 backdrop-blur-md rounded-full text-white z-50 hover:bg-black/60 transition-all active:scale-90">
                <X size={20} />
              </button>

              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-6 z-50">
                {!mediaFiles[0]?.type.startsWith('image/') && (
                  <button 
                    onClick={() => setShowTrimEditor(true)}
                    className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
                  >
                    <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Scissors size={20}/></div>
                    <span className="text-[8px] font-black uppercase text-white shadow-sm">Recortar</span>
                  </button>
                )}
                <button 
                  onClick={() => setShowTextEditor(true)}
                  className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
                >
                  <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Type size={20}/></div>
                  <span className="text-[8px] font-black uppercase text-white shadow-sm">Texto</span>
                </button>
                <button 
                  onClick={() => setShowFilterPicker(true)}
                  className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
                >
                  <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Wand2 size={20}/></div>
                  <span className="text-[8px] font-black uppercase text-white shadow-sm">Efeitos</span>
                </button>
              </div>
            </div>
            
            <div className="p-6 pt-2 bg-black flex flex-col gap-4 overflow-y-auto">
               <div className="relative">
                 <textarea 
                   value={content}
                   onChange={(e) => setContent(e.target.value.slice(0, 200))}
                   placeholder="Escreve uma legenda para o teu vídeo..."
                   className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-red-600/50 transition-all h-24 resize-none"
                 />
                 <div className="absolute bottom-3 right-4 text-[9px] font-black text-zinc-700 uppercase tracking-widest">
                   {content.length}/200
                 </div>
               </div>

               {/* Educação Toggle - Only for Posts */}
               {uploadType === 'post' && (
                 <div className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4">
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-red-600/10 rounded-lg text-red-600">
                       <BookOpen size={18} />
                     </div>
                     <div>
                       <p className="text-xs font-black uppercase tracking-widest text-white">Conteúdo Educativo</p>
                       <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Marcar como vídeo de educação</p>
                     </div>
                   </div>
                   <button 
                     onClick={() => setIsEducation(!isEducation)}
                     className={`w-12 h-6 rounded-full transition-all relative ${isEducation ? 'bg-red-600' : 'bg-zinc-800'}`}
                   >
                     <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isEducation ? 'left-7' : 'left-1'}`} />
                   </button>
                 </div>
               )}
               
               <button onClick={handleUpload} disabled={uploading || processingVideo} className={`w-full py-4 rounded-full font-black uppercase tracking-[0.2em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 border ${(uploading || processingVideo) ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.2)]'}`}>
                 {processingVideo ? <><Loader2 size={16} className="animate-spin" /><span>A Processar Vídeo...</span></> : uploading ? <><Loader2 size={16} className="animate-spin" /><span>A Publicar...</span></> : <><CheckCircle2 size={16} /><span>{uploadType === 'story' ? 'Publicar no Story' : 'Publicar Agora'}</span></>}
               </button>
            </div>
          </div>
        ) : (
          <div className="h-full w-full relative bg-transparent">
            <div 
              id="cameraPreview" 
              className="h-full w-full relative bg-transparent" 
              style={{ 
                filter: filter !== 'none' ? filter : undefined,
                backdropFilter: filter !== 'none' ? filter : undefined,
                WebkitBackdropFilter: filter !== 'none' ? filter : undefined
              }}
            />
            
            {textOverlay && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <span className="text-white text-4xl font-black text-center px-10 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] break-words max-w-full">
                  {textOverlay}
                </span>
              </div>
            )}
            

            {countdown !== null && (
              <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-md">
                 <span className="text-[140px] font-black italic text-white animate-pulse drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]">{countdown}</span>
              </div>
            )}

            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-6 z-40">
              <button 
                onClick={toggleCamera} 
                disabled={isStarting}
                className="flex flex-col items-center gap-1 group active:scale-90 transition-transform disabled:opacity-50"
              >
                <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Flip size={22}/></div>
                <span className="text-[8px] font-black uppercase text-white shadow-sm">Girar</span>
              </button>
              <button 
                onClick={toggleFlash}
                disabled={facingMode === 'user'}
                className={`flex flex-col items-center gap-1 group active:scale-90 transition-transform ${facingMode === 'user' ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}
              >
                <div className={`p-2.5 backdrop-blur-md rounded-full border transition-all ${isFlashOn ? 'bg-red-600 border-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-black/30 border-white/10 text-white'}`}>
                  <Zap size={22} fill={isFlashOn ? "currentColor" : "none"} />
                </div>
                <span className={`text-[8px] font-black uppercase shadow-sm ${isFlashOn ? 'text-red-500' : 'text-white'}`}>Flash</span>
              </button>
              <button 
                onClick={() => setShowTextEditor(true)}
                className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
              >
                <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Type size={22}/></div>
                <span className="text-[8px] font-black uppercase text-white shadow-sm">Texto</span>
              </button>
              <button 
                onClick={() => setShowFilterPicker(true)}
                className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
              >
                <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Wand2 size={22}/></div>
                <span className="text-[8px] font-black uppercase text-white shadow-sm">Efeitos</span>
              </button>
            </div>


            <button onClick={() => onCreated()} className="absolute top-6 right-6 p-2 bg-black/30 backdrop-blur-md rounded-full text-white z-50 hover:bg-black/50 active:scale-90 transition-all">
              <X size={24} />
            </button>

            <div className="absolute bottom-56 left-0 w-full flex items-center justify-center gap-6 z-40 pointer-events-auto">
              <div className="flex gap-3">
                <button 
                  onClick={() => setMaxDuration(15)}
                  disabled={isRecording}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-xl ${maxDuration === 15 ? 'bg-white text-black scale-110' : 'bg-black/40 text-white/60 border border-white/10'}`}
                >
                  15s
                </button>
                <button 
                  onClick={() => setMaxDuration(60)}
                  disabled={isRecording}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-xl ${maxDuration === 60 ? 'bg-white text-black scale-110' : 'bg-black/40 text-white/60 border border-white/10'}`}
                >
                  60s
                </button>
              </div>
            </div>

            <div className="absolute bottom-12 left-0 w-full flex flex-col items-center gap-6 z-40">
              <div className="flex items-center justify-around w-full px-8">
                <input 
                  ref={nativeVideoInputRef}
                  type="file" 
                  accept={uploadType === 'story' ? "video/*,image/*" : "video/*"} 
                  capture="camcorder" 
                  className="hidden" 
                  onChange={handleNativeVideoChange} 
                />
                <div className="w-12 h-12 flex items-center justify-center">
                  <label className="flex flex-col items-center gap-1 cursor-pointer group active:scale-90 transition-transform">
                    <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl text-white border border-white/20 shadow-xl">
                      <ImageIcon size={24} />
                    </div>
                    <span className="text-[8px] font-black uppercase text-white tracking-widest mt-1">Galeria</span>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept={uploadType === 'story' ? "video/*,image/*" : "video/*"} 
                      onChange={handleFileChange} 
                    />
                  </label>
                </div>
                
                <button 
                  onClick={initiateRecording} 
                  disabled={isStarting} 
                  className="relative flex items-center justify-center disabled:opacity-50"
                >
                  <div className="w-20 h-20 rounded-full border-[6px] border-white/40 flex items-center justify-center shadow-2xl">
                      <div className={`transition-all duration-300 ${isRecording ? 'w-8 h-8 rounded-lg' : 'w-16 h-16 rounded-full'} bg-red-600 shadow-[0_0_30px_rgba(220,38,38,0.6)]`} />
                  </div>
                </button>

                <div className="w-12 h-12 flex items-center justify-center">
                  <button 
                    onClick={isRecording ? stopRecording : () => {
                      if (mediaFiles.length > 0) {
                        stopCamera();
                      }
                    }} 
                    className={`flex flex-col items-center gap-1 transition-all duration-300 ${recordingSeconds > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
                  >
                    <div className="p-3.5 bg-yellow-500 rounded-full text-black shadow-[0_10px_30px_rgba(234,179,8,0.4)] active:scale-90"><CheckCircle2 size={26} /></div>
                    <span className="text-[8px] font-black uppercase text-white tracking-widest mt-1">Pronto</span>
                  </button>
                </div>
              </div>

              {/* Upload Type Selector */}
              <div className="flex gap-8 pb-2">
                <button 
                  onClick={() => setUploadType('post')}
                  className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${uploadType === 'post' ? 'text-white scale-110' : 'text-white/40'}`}
                >
                  Vídeo
                </button>
                <button 
                  onClick={() => setUploadType('story')}
                  className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${uploadType === 'story' ? 'text-white scale-110' : 'text-white/40'}`}
                >
                  Story
                </button>
              </div>
            </div>
          </div>
        )}

        {showTextEditor && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-[110] flex flex-col items-center justify-center p-8">
            <textarea
              autoFocus
              value={textOverlay}
              onChange={(e) => setTextOverlay(e.target.value)}
              placeholder="Escreve o teu texto..."
              className="w-full bg-transparent text-white text-4xl font-black text-center outline-none resize-none h-40 placeholder:text-white/20"
            />
            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => { setTextOverlay(''); setShowTextEditor(false); }}
                className="px-8 py-3 bg-zinc-800 text-white rounded-full font-black uppercase text-[10px] tracking-widest"
              >
                Limpar
              </button>
              <button 
                onClick={() => setShowTextEditor(false)}
                className="px-8 py-3 bg-red-600 text-white rounded-full font-black uppercase text-[10px] tracking-widest"
              >
                Concluído
              </button>
            </div>
          </div>
        )}

        {showFilterPicker && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-end">
            <div className="w-full bg-zinc-950 rounded-t-[32px] p-6 border-t border-zinc-800">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Efeitos</h3>
                <button onClick={() => setShowFilterPicker(false)} className="text-zinc-400 hover:text-white"><X size={24} /></button>
              </div>
              <div className="grid grid-cols-4 gap-4 pb-8">
                {filters.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => { setFilter(f.value); setShowFilterPicker(false); }}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className={`w-14 h-14 rounded-2xl border-2 transition-all ${filter === f.value ? 'border-red-600 bg-red-600/20' : 'border-zinc-800 bg-zinc-900'}`} style={{ filter: f.value }}>
                      <div className="w-full h-full flex items-center justify-center text-white/40"><Wand2 size={20} /></div>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-widest ${filter === f.value ? 'text-red-500' : 'text-zinc-500'}`}>{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[100] bg-zinc-950/90 backdrop-blur-xl border border-red-600/30 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_10px_40px_rgba(220,38,38,0.2)] flex items-center gap-3 animate-bounce">
           <AlertCircle size={18} className="text-red-600" />
           <span className="max-w-[200px] text-center">{error}</span>
           <button onClick={() => setError(null)} className="ml-2 text-zinc-600 hover:text-white"><X size={16}/></button>
        </div>
      )}

      {showTrimEditor && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-[120] flex flex-col items-center justify-center p-8">
          <h3 className="text-white font-black uppercase tracking-widest mb-8">Recortar Vídeo</h3>
          
          <div className="w-full max-w-xs bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
            <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">
              <span>Início: {trimStart.toFixed(1)}s</span>
              <span>Fim: {trimEnd.toFixed(1)}s</span>
            </div>
            
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Ponto de Início</label>
                <input 
                  type="range" 
                  min="0" 
                  max={trimEnd - 0.5} 
                  step="0.1"
                  value={trimStart}
                  onChange={(e) => setTrimStart(parseFloat(e.target.value))}
                  className="w-full accent-red-600"
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Ponto de Fim</label>
                <input 
                  type="range" 
                  min={trimStart + 0.5} 
                  max={maxDuration} 
                  step="0.1"
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(parseFloat(e.target.value))}
                  className="w-full accent-red-600"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={() => setShowTrimEditor(false)}
            className="mt-10 px-12 py-4 bg-red-600 text-white rounded-full font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 transition-all"
          >
            Concluído
          </button>
        </div>
      )}

    </div>
  );
};

export default CreatePost;
