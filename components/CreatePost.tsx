import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { X, CheckCircle2, AlertCircle, Loader2, Zap, FlipVertical as Flip, Image as ImageIcon, Scissors, BookOpen, Settings, ArrowUp, Music } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { uploadToR2 } from '../services/uploadService';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { parseMediaUrl } from '../services/mediaUtils';
import { Post } from '../types';

interface CreatePostProps {
  onCreated: () => void;
  onBackgroundUpload?: (data: {
    mediaFile: File | Blob;
    content: string;
    uploadType: 'post' | 'story';
    isEducation: boolean;
    recordedFacingMode: string;
    isFromGallery: boolean;
    trimStart: number;
    trimEnd: number;
    recordingSeconds: number;
    reusedAudioUrl?: string | null;
    reusedAudioPostId?: string | null;
  }) => void;
  onStartLive?: () => void;
  initialType?: 'post' | 'story';
  preSelectedSound?: Post | null;
}

const CreatePost: React.FC<CreatePostProps> = ({ onCreated, onBackgroundUpload, onStartLive, initialType = 'post', preSelectedSound }) => {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<(File | Blob)[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [copiedMergeError, setCopiedMergeError] = useState(false);
  
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
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(15);
  const [showTrimEditor, setShowTrimEditor] = useState(false);
  const [isEducation, setIsEducation] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [uploadType, setUploadType] = useState<'post' | 'story'>(initialType);
  const [isFromGallery, setIsFromGallery] = useState(false);
  const [isVideoTooLong, setIsVideoTooLong] = useState(false);

  const reusedAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (preSelectedSound && preSelectedSound.media_url) {
      const audioUrl = parseMediaUrl(preSelectedSound.media_url);
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.loop = false;
      reusedAudioRef.current = audio;

      return () => {
        audio.pause();
        reusedAudioRef.current = null;
      };
    }
  }, [preSelectedSound]);

  const webStreamRef = useRef<MediaStream | null>(null);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webAudioCtxRef = useRef<AudioContext | null>(null);

  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const nativeVideoInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [processingVideo, setProcessingVideo] = useState(false); // Mantido para o estado do botão
  const [todayCount, setTodayCount] = useState<number | null>(null);

  const checkDailyLimit = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const userId = session.user.id;
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      
      const { count: postCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startOfToday.toISOString());
        
      const { count: storyCount } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startOfToday.toISOString());
        
      setTodayCount((postCount || 0) + (storyCount || 0));
    } catch (e) {
      console.error('Erro ao verificar limite diário:', e);
    }
  };

  useEffect(() => {
    if (previewUrls.length > 0) {
      checkDailyLimit();
    }
  }, [previewUrls.length]);

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

  const requestPermissions = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        // Request Camera and Microphone for recording
        // This is the "como antes" part - requesting camera and microphone explicitly
        console.log('Requesting camera/mic permissions...');
        
        // Use getUserMedia trick to trigger OS prompt for both camera and mic
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (e) {
          console.warn("Erro ao pedir permissões via getUserMedia:", e);
        }

        const camStatus = await CameraPreview.requestPermissions();
        console.log('Camera permissions:', camStatus);
      } catch (err) {
        console.error('Error requesting permissions:', err);
      }
    } else {
      try {
        // Browser permission prompt
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn("Erro ao pedir permissões no browser:", e);
      }
    }
  };

  useEffect(() => {
    // Small delay to ensure bridge is ready
    const timer = setTimeout(() => {
      requestPermissions();
    }, 500);
    return () => clearTimeout(timer);
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

  // Gerenciar o preview da câmera no navegador (WebRTC)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() && showCamera) {
      let activeStream: MediaStream | null = null;
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode === 'user' ? 'user' : 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      }).then(stream => {
        activeStream = stream;
        webStreamRef.current = stream;
        
        const container = document.getElementById('cameraPreview');
        if (container) {
          const oldVideo = document.getElementById('webCameraVideo');
          if (oldVideo) oldVideo.remove();

          const videoEl = document.createElement('video');
          videoEl.id = 'webCameraVideo';
          videoEl.srcObject = stream;
          videoEl.autoplay = true;
          videoEl.playsInline = true;
          videoEl.muted = true;
          videoEl.className = `w-full h-full object-cover absolute inset-0 z-10 ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`;
          container.appendChild(videoEl);
        }
      }).catch(err => {
        console.error('Erro ao acessar webcam:', err);
        setError('Não foi possível acessar a câmera do navegador. Verifique as permissões.');
      });

      return () => {
        if (activeStream) {
          activeStream.getTracks().forEach(track => track.stop());
        }
        webStreamRef.current = null;
        const videoEl = document.getElementById('webCameraVideo');
        if (videoEl) videoEl.remove();
      };
    }
  }, [showCamera, facingMode]);

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

  const checkVideoDuration = (file: File | Blob): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('video/')) {
        resolve(true);
        return;
      }
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = video.duration;
        URL.revokeObjectURL(video.src);
        resolve(duration <= 90.5); // 90s + pequena margem para arredondamento
      };
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(true); // Se falhar a ler metadados, deixamos passar para o processamento onde será validado de novo
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const mergeVideoAndAudioCanvas = (
    videoBlob: Blob,
    audioUrlUrl: string
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      setProcessingVideo(true);
      
      const video = document.createElement('video');
      video.style.display = 'none';
      document.body.appendChild(video);
      
      video.src = URL.createObjectURL(videoBlob);
      video.muted = true;
      video.playsInline = true;
      video.currentTime = 0;

      const audio = document.createElement('audio');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      
      audio.src = audioUrlUrl;
      audio.crossOrigin = 'anonymous';

      let loadedCount = 0;
      const checkLoaded = () => {
        loadedCount++;
        if (loadedCount === 2) {
          startProcessing();
        }
      };

      video.onloadeddata = checkLoaded;
      audio.onloadeddata = checkLoaded;

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Tempo limite excedido ao misturar áudio'));
      }, 25000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        try { video.pause(); } catch { void 0; }
        try { audio.pause(); } catch { void 0; }
        try { document.body.removeChild(video); } catch { void 0; }
        try { document.body.removeChild(audio); } catch { void 0; }
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Erro ao carregar o vídeo para mixagem'));
      };

      audio.onerror = () => {
        cleanup();
        reject(new Error('Erro ao carregar o áudio de fundo para mixagem. Verifique permissões/CORS.'));
      };

      const startProcessing = () => {
        try {
          const width = video.videoWidth || 720;
          const height = video.videoHeight || 1280;

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            reject(new Error('Não foi possível inicializar o canvas de vídeo'));
            return;
          }

          const extendedWindow = window as unknown as Window & { webkitAudioContext?: typeof AudioContext };
          const AudioContextClass = window.AudioContext || extendedWindow.webkitAudioContext;
          if (!AudioContextClass) {
            cleanup();
            reject(new Error('AudioContext não suportado neste navegador'));
            return;
          }
          const audioCtx = new AudioContextClass();
          const destination = audioCtx.createMediaStreamDestination();

          // Mix background audio
          const audioSource = audioCtx.createMediaElementSource(audio);
          audioSource.connect(destination);

          // Mix original video audio if exists
          try {
            const videoSource = audioCtx.createMediaElementSource(video);
            videoSource.connect(destination);
          } catch (err) {
            console.warn('Original video audio source could not be linked, but continuing:', err);
          }

          const extendedCanvas = canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
          if (!extendedCanvas.captureStream) {
            cleanup();
            audioCtx.close();
            reject(new Error('Canvas captureStream não suportado neste navegador'));
            return;
          }

          const canvasStream = extendedCanvas.captureStream(30);
          const videoTrack = canvasStream.getVideoTracks()[0];
          const audioTrack = destination.stream.getAudioTracks()[0];

          if (!videoTrack) {
            cleanup();
            audioCtx.close();
            reject(new Error('Falha ao obter track de vídeo do canvas'));
            return;
          }

          const tracks = [videoTrack];
          if (audioTrack) {
            tracks.push(audioTrack);
          }
          const combinedStream = new MediaStream(tracks);

          let recorder: MediaRecorder;
          const recordedChunks: Blob[] = [];

          let mimeType = 'video/webm;codecs=vp8,opus';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/mp4;codecs=avc1,mp4a';
          }
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }

          try {
            recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
          } catch {
            recorder = new MediaRecorder(combinedStream);
          }

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunks.push(event.data);
            }
          };

          recorder.onstop = () => {
            cleanup();
            audioCtx.close();
            const finalBlob = new Blob(recordedChunks, { type: 'video/mp4' });
            resolve(finalBlob);
          };

          recorder.start();
          video.play();
          audio.play();

          let animationFrameId: number;
          const drawFrame = () => {
            if (video.ended || video.paused) {
              cancelAnimationFrame(animationFrameId);
              if (recorder.state !== 'inactive') {
                recorder.stop();
              }
              return;
            }

            ctx.drawImage(video, 0, 0, width, height);
            animationFrameId = requestAnimationFrame(drawFrame);
          };

          animationFrameId = requestAnimationFrame(drawFrame);

          video.onended = () => {
            cancelAnimationFrame(animationFrameId);
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
          };

        } catch (err) {
          cleanup();
          reject(err);
        }
      };
    });
  };

  const processMergeIfAudioSelected = React.useCallback(async (videoBlob: Blob): Promise<Blob> => {
    if (preSelectedSound && preSelectedSound.media_url) {
      try {
        setMergeError(null);
        const audioUrl = parseMediaUrl(preSelectedSound.media_url);
        console.log('[MediaMerge] Iniciando Canvas + Web Audio Merge com som:', audioUrl);
        const mergedBlob = await mergeVideoAndAudioCanvas(videoBlob, audioUrl);
        return mergedBlob;
      } catch (err) {
        console.error('[MediaMerge] Falha na mesclagem em tempo real, continuando com vídeo original:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setMergeError(errorMessage);
        return videoBlob;
      } finally {
        setProcessingVideo(false);
      }
    }
    return videoBlob;
  }, [preSelectedSound]);

  const handleNativeVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isOk = await checkVideoDuration(file);
      setIsVideoTooLong(!isOk);
      if (!isOk) {
        setError('Este vídeo ultrapassa 1:30. Para brilhar na banda, partilha apenas os teus momentos mais épicos e curtos!');
      } else {
        setError(null);
      }
      
      const finalBlob = await processMergeIfAudioSelected(file);
      
      setMediaFiles([finalBlob]);
      setPreviewUrls([URL.createObjectURL(finalBlob)]);
      setIsFromGallery(true);
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
        
        if (reusedAudioRef.current) {
          reusedAudioRef.current.currentTime = 0;
          reusedAudioRef.current.play().catch(e => {
            console.error('Erro ao iniciar reprodução do áudio reutilizado:', e);
          });
        }

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

    // Gravação no Navegador (WebRTC) utilizando Mixagem Digital em Tempo Real com Web Audio API
    try {
      setRecordedFacingMode(facingMode);
      if (!webStreamRef.current) {
        throw new Error("Câmara não inicializada no navegador.");
      }

      const cameraStream = webStreamRef.current;
      const videoTrack = cameraStream.getVideoTracks()[0];
      const micTrack = cameraStream.getAudioTracks()[0];

      if (!videoTrack) {
        throw new Error("Não foi encontrada nenhuma faixa de vídeo na câmara.");
      }

      let finalAudioStream: MediaStream | null = null;

      if (preSelectedSound && preSelectedSound.media_url) {
        const AudioContextClass = window.AudioContext || (window as unknown as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error("Web Audio API não suportada neste navegador.");
        }
        const audioCtx = new AudioContextClass();
        webAudioCtxRef.current = audioCtx;

        const destination = audioCtx.createMediaStreamDestination();

        // 1. Microphone source
        if (micTrack) {
          const micStream = new MediaStream([micTrack]);
          const micSource = audioCtx.createMediaStreamSource(micStream);
          micSource.connect(destination);
        }

        // 2. Backing audio source (re-used audio element or fresh new one)
        const backingAudio = reusedAudioRef.current || new Audio(parseMediaUrl(preSelectedSound.media_url));
        backingAudio.crossOrigin = 'anonymous';
        backingAudio.currentTime = 0;
        
        const bgSource = audioCtx.createMediaElementSource(backingAudio);
        
        // Connect to destination stream (to be recorded)
        bgSource.connect(destination);
        
        // Connect to speaker destination (so user hears it in real-time while recording!)
        bgSource.connect(audioCtx.destination);
        
        reusedAudioRef.current = backingAudio;
        finalAudioStream = destination.stream;
      } else {
        // No background sound seleccionado, usar o microfone da câmara diretamente
        if (micTrack) {
          finalAudioStream = new MediaStream([micTrack]);
        }
      }

      // Combinar vídeo da câmara e o áudio mixado em tempo real
      const tracks: MediaStreamTrack[] = [videoTrack];
      if (finalAudioStream && finalAudioStream.getAudioTracks()[0]) {
        tracks.push(finalAudioStream.getAudioTracks()[0]);
      }
      
      const mixedStream = new MediaStream(tracks);

      let mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4;codecs=avc1,mp4a';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(mixedStream, mimeType ? { mimeType } : undefined);
      } catch {
        recorder = new MediaRecorder(mixedStream);
      }

      webRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const videoBlob = new Blob(chunksRef.current, { type: 'video/mp4' });
        
        const isOk = await checkVideoDuration(videoBlob);
        setIsVideoTooLong(!isOk);
        if (!isOk) {
          setError('O vídeo gravado excedeu o limite. Tenta gravar um momento mais curto!');
        }

        setMediaFiles([videoBlob]);
        setPreviewUrls([URL.createObjectURL(videoBlob)]);
        setIsFromGallery(false);
        setTrimStart(0);
        
        // Capturar o valor real gravado no momento de finalizar
        setTrimEnd(recordingSeconds);
        stopCamera();
      };

      // Tocar som de fundo e iniciar gravação
      if (reusedAudioRef.current) {
        reusedAudioRef.current.currentTime = 0;
        reusedAudioRef.current.play().catch(e => {
          console.error('[Web Recording] Erro ao iniciar som:', e);
        });
      }

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("[Web Recording] Erro na gravação em tempo real no browser:", err);
      setError(`Erro ao iniciar gravação no navegador: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const isRecordingRef = useRef(false);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const stopRecording = React.useCallback(async () => {
    if (reusedAudioRef.current) {
      reusedAudioRef.current.pause();
    }
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
            
            // Gravações feitas no app respeitam o maxDuration, mas verificamos por segurança
            const isOk = await checkVideoDuration(videoBlob);
            setIsVideoTooLong(!isOk);
            if (!isOk) {
              setError('O vídeo gravado excedeu o limite. Tenta gravar um momento mais curto!');
            }
            
            const finalBlob = await processMergeIfAudioSelected(videoBlob);
            
            setMediaFiles([finalBlob]);
            setPreviewUrls([URL.createObjectURL(finalBlob)]);
            setIsFromGallery(false);
            setTrimStart(0);
            setTrimEnd(recordingSeconds);
            stopCamera();
          }
        } catch (e) {
          console.error("Erro ao parar gravação nativa:", e);
        }
      } else {
        // Plataforma Web / Navegador
        try {
          if (webRecorderRef.current && webRecorderRef.current.state !== 'inactive') {
            webRecorderRef.current.stop();
          }
          if (webAudioCtxRef.current) {
            webAudioCtxRef.current.close().catch(() => {});
            webAudioCtxRef.current = null;
          }
        } catch (err) {
          console.error("[Web Recording] Erro ao parar gravação no navegador:", err);
        }
      }
      setIsRecording(false);
    }
  }, [stopCamera, recordingSeconds, processMergeIfAudioSelected]);

  // Auto-stop recording when max duration is reached
  useEffect(() => {
    if (isRecording && recordingSeconds >= maxDuration) {
      stopRecording();
    }
  }, [recordingSeconds, isRecording, maxDuration, stopRecording]);

  const handleMediaLibrarySelect = async (files: File[]) => {
    if (files.length > 0) {
      const selectedFiles = files.slice(0, 5);
      
      // Validar duração do primeiro arquivo (se for vídeo)
      const isOk = await checkVideoDuration(selectedFiles[0]);
      setIsVideoTooLong(!isOk);
      if (!isOk) {
        setError('Este vídeo ultrapassa 1:30. Seleciona um vídeo mais curto para publicar!');
      } else {
        setError(null);
      }

      const fileToProcess = selectedFiles[0];
      const finalBlob = await processMergeIfAudioSelected(fileToProcess);
      
      const finalFiles = [...selectedFiles];
      finalFiles[0] = new File([finalBlob], fileToProcess.name, { type: finalBlob.type });

      const newPreviewUrls = finalFiles.map(file => URL.createObjectURL(file));
      
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      
      setMediaFiles(finalFiles);
      setPreviewUrls(newPreviewUrls);
      setIsFromGallery(true);
      setTrimStart(0);
      setTrimEnd(15);
      stopCamera();
    }
  };

  const openGallery = async () => {
    if (!Capacitor.isNativePlatform()) {
      nativeVideoInputRef.current?.click();
      return;
    }

    try {
      let result;
      if (uploadType === 'post') {
        // Para posts, apenas vídeos
        result = await FilePicker.pickVideos({
          multiple: true,
          limit: 5,
        });
      } else {
        // Para stories, vídeos e fotos
        result = await FilePicker.pickMedia({
          multiple: false,
          limit: 1,
        });
      }

      if (result.files && result.files.length > 0) {
        const selectedFiles: File[] = [];
        for (const file of result.files) {
          if (file.path) {
            const response = await fetch(Capacitor.convertFileSrc(file.path));
            const blob = await response.blob();
            const fileName = file.name || `media_${Date.now()}.${file.mimeType.split('/')[1] || 'jpg'}`;
            selectedFiles.push(new File([blob], fileName, { type: file.mimeType }));
          }
        }
        handleMediaLibrarySelect(selectedFiles);
      }
    } catch (err) {
      console.error('Error picking media:', err);
      // User might have canceled, ignore
    }
  };

  const generateThumbnailAttempt = (file: File | Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('crossorigin', 'anonymous');
      
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Thumbnail generation timed out'));
      }, 20000); // Increased timeout to 20s

      const cleanup = () => {
        clearTimeout(timeout);
        if (video.src) URL.revokeObjectURL(video.src);
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        video.remove();
      };

      const attemptCapture = (retries = 0) => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            cleanup();
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob((blob) => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error('Failed to generate thumbnail blob'));
          }, 'image/jpeg', 0.8);
        } else if (retries < 50) {
          // If dimensions are still 0, wait a bit and try again (up to 5 seconds)
          setTimeout(() => attemptCapture(retries + 1), 100);
        } else {
          cleanup();
          reject(new Error('Invalid video dimensions after multiple attempts'));
        }
      };

      video.onloadedmetadata = () => {
        // Seek to a slightly later time to avoid black frames at the very start
        // Try to seek to 0.5s or 10% of duration
        const captureTime = isFinite(video.duration) && video.duration > 0 
          ? Math.min(0.5, video.duration / 4) 
          : 0.1;
        video.currentTime = captureTime;
        video.play().catch(() => {}); // Force frame loading
      };

      video.onseeked = () => {
        video.pause();
        // Give it a bit more time to render the frame
        setTimeout(() => {
          attemptCapture();
        }, 500);
      };

      video.onerror = (e) => {
        console.error('[Thumbnail] Erro no elemento vídeo:', e, video.error);
        cleanup();
        reject(new Error(`Video error during thumbnail generation: ${video.error?.message || 'Unknown error'}`));
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const generateThumbnail = (file: File | Blob, maxRetries = 3): Promise<Blob> => {
    return new Promise((resolve) => {
      (async () => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const thumb = await generateThumbnailAttempt(file);
            resolve(thumb);
            return;
          } catch (err) {
            console.error(`[Thumbnail] Tentativa ${attempt} falhou:`, err);
            if (attempt === maxRetries) {
              console.warn('[Thumbnail] Todas as tentativas falharam, gerando fallback...');
              // Última tentativa: criar thumbnail cinza genérica para distinguir de frame preto
              const canvas = document.createElement('canvas');
              canvas.width = 1080;
              canvas.height = 1920;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#1a1a1a'; // Cinza escuro
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 60px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('VÍDEO', canvas.width/2, canvas.height/2);
              }
              
              canvas.toBlob((blob) => {
                resolve(blob as Blob);
              }, 'image/jpeg', 0.8);
              return;
            }
            // Aguardar antes de tentar novamente
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      })();
    });
  };

  const handleUpload = async () => {
    if (mediaFiles.length === 0) return;
    
    // Se o pai suportar upload em background, usamos essa via e saímos logo
    if (onBackgroundUpload) {
      onBackgroundUpload({
        mediaFile: mediaFiles[0],
        content,
        uploadType,
        isEducation,
        recordedFacingMode,
        isFromGallery,
        trimStart,
        trimEnd,
        recordingSeconds,
        reusedAudioUrl: preSelectedSound ? parseMediaUrl(preSelectedSound.media_url) : undefined,
        reusedAudioPostId: preSelectedSound?.id || undefined
      });
      onCreated();
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Por favor, faz login novamente.');
      
      const userId = session.user.id;

      // 🔹 1. Verificar Limite Diário (3 uploads por dia)
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      
      // Contar posts de hoje
      const { count: postCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startOfToday.toISOString());
      
      // Contar stories de hoje
      const { count: storyCount } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startOfToday.toISOString());
      
      const totalToday = (postCount || 0) + (storyCount || 0);
      
      if (totalToday >= 3) {
        setUploading(false);
        setError('Superaste o limite de 3 uploads diários. Na banda, a qualidade brilha mais que a quantidade. Volta amanhã!');
        return;
      }

      // 🔹 2. Verificar Duração Máxima (90s)
      if (mediaFiles[0].type.startsWith('video/')) {
        const video = document.createElement('video');
        const duration: number = await new Promise((resolve) => {
          video.onloadedmetadata = () => resolve(video.duration);
          video.onerror = () => resolve(0);
          video.src = URL.createObjectURL(mediaFiles[0]);
        });
        URL.revokeObjectURL(video.src);
        
        if (duration > 95) { // 90s + tolerância de 5s para metadados/transcodificação
          setUploading(false);
          setError('Este vídeo ultrapassa 1:30. Para brilhar na banda, partilha apenas os teus momentos mais épicos e curtos!');
          return;
        }
      }

      const timestamp = Date.now();
      const isVideo = mediaFiles[0].type.startsWith('video/');

      let finalMediaBlob: Blob | (File | Blob) = mediaFiles[0];
      let finalThumbnailUrl: string | null = null;
      let finalMediaUrl: string | null = null;

      if (isVideo) {
        // 6. Adicionar verificação antes do processamento
        const originalVideo = mediaFiles[0];
        if (originalVideo.type === 'video/mp4' || originalVideo.type === 'video/quicktime') {
          const tempUrl = URL.createObjectURL(originalVideo);
          const isValid = await new Promise((resolve) => {
            const video = document.createElement('video');
            video.onloadedmetadata = () => resolve(video.videoWidth > 0 && video.videoHeight > 0);
            video.onerror = () => resolve(false);
            video.src = tempUrl;
          });
          URL.revokeObjectURL(tempUrl);
          
          if (!isValid) {
            console.warn('[Upload] Vídeo original inválido, ignorando processamento');
            setProcessingVideo(false);
            // Usar vídeo original sem processamento
            finalMediaBlob = originalVideo;
          }
        }

        const hasTrim = trimStart > 0 || (trimEnd < recordingSeconds && recordingSeconds > 0);
        const needsRotation = recordedFacingMode === 'environment';
        // Convertemos todos os vídeos para HLS para garantir streaming estável
        const needsFFmpeg = true; 

        if (needsFFmpeg) {
          console.log('[Upload] Iniciando processamento FFmpeg...');
          setProcessingVideo(true);
          const ffmpeg = await loadFFmpeg();
          
          // 4. Adicionar logs de depuração
          ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]', message);
            if (message.includes('Error') || message.includes('error')) {
              console.error('[FFmpeg ERROR]', message);
            }
          });

          // 1. Limpeza e Preparação
          const cleanupFiles = ['/input.mp4', '/output.mp4', '/thumb.jpg'];
          for (const f of cleanupFiles) {
            try { await ffmpeg.deleteFile(f); } catch { /* ignore */ }
          }

          const videoData = await fetchFile(mediaFiles[0]);
          await ffmpeg.writeFile('/input.mp4', videoData);

          // 2. Construção de Filtros
          const filterParts = [];
          
          // Redimensionar para no máximo 720p (1280px de altura) para economizar espaço
          // E garantir dimensões pares para libx264/yuv420p
          filterParts.push("scale='if(gt(ih,1280),-2,iw)':'if(gt(ih,1280),1280,ih)'");
          filterParts.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
          
          if (needsRotation) {
            filterParts.push('vflip,hflip');
          }
          
          const finalVf = filterParts.join(',');
          
          // 3. Execução do Processamento Principal para HLS
          const videoArgs: string[] = [];
          
          if (hasTrim) {
            videoArgs.push('-ss', String(trimStart), '-t', String(trimEnd - trimStart));
          }
          
          videoArgs.push('-i', '/input.mp4');
          
          if (finalVf) {
            videoArgs.push('-vf', finalVf);
          }
          
          // Configuração HLS
          videoArgs.push(
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', 
            '-crf', '32',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', 
            '-b:a', '96k',
            '-max_muxing_queue_size', '1024',
            '-f', 'hls',
            '-hls_time', '6',
            '-hls_list_size', '0',
            '-hls_segment_filename', 'seg%03d.ts',
            '-y', '/index.m3u8'
          );
          
          console.log('[FFmpeg] Executando comando HLS:', videoArgs.join(' '));
          await ffmpeg.exec(videoArgs);

          // 4. Ler todos os ficheiros gerados (.m3u8 e .ts)
          const allFiles = await ffmpeg.listDir('/');
          const hlsFiles = allFiles.filter(f => f.name.endsWith('.m3u8') || f.name.endsWith('.ts'));
          console.log('[FFmpeg] Ficheiros HLS gerados:', hlsFiles);

          if (hlsFiles.length === 0) {
            throw new Error('O processamento HLS falhou (nenhum ficheiro gerado).');
          }

          // 5. Upload de todos os segmentos e da playlist
          // Usamos um ID único para a pasta para evitar colisões
          const hlsFolder = `posts/${userId}/${timestamp}`;
          let masterPlaylistUrl = "";

          for (const fileInfo of hlsFiles) {
            const fileData = await ffmpeg.readFile(fileInfo.name);
            const blob = new Blob([fileData], { 
              type: fileInfo.name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' 
            });
            const url = await uploadToR2(blob, hlsFolder, fileInfo.name);
            if (fileInfo.name === 'index.m3u8') {
              masterPlaylistUrl = url;
            }
          }

          finalMediaUrl = masterPlaylistUrl;
          finalMediaBlob = null; // Já fizemos o upload manual aqui

          // 4. Geração de Thumbnail (FFmpeg)
          console.log('[Upload] Gerando thumbnail com FFmpeg...');
          try {
            // Seek to 0.5s to avoid black frames at the start
            await ffmpeg.exec(['-ss', '0.5', '-i', '/output.mp4', '-vframes', '1', '-f', 'image2', '/thumb.jpg']);
            const thumbOutput = await ffmpeg.readFile('/thumb.jpg');
            const thumbBlobFromFFmpeg = new Blob([thumbOutput], { type: 'image/jpeg' });
            
            const thumbFileName = `${userId}-${timestamp}.jpg`;
            finalThumbnailUrl = await uploadToR2(thumbBlobFromFFmpeg, 'thumbnails', thumbFileName);
            console.log('[Upload] Thumbnail gerada com FFmpeg e enviada.');
          } catch (thumbErr) {
            console.error('[Upload] Erro ao gerar thumbnail com FFmpeg:', thumbErr);
          }

          // 5. Limpeza Final
          for (const f of cleanupFiles) {
            try { await ffmpeg.deleteFile(f); } catch { /* ignore */ }
          }
        } else {
          console.log('[Upload] FFmpeg não é necessário. Usando vídeo original.');
          finalMediaBlob = mediaFiles[0];
        }

        // 3. Gerar Thumbnail (Fallback ou se FFmpeg não foi usado)
        if (!finalThumbnailUrl) {
          console.log('[Upload] Gerando thumbnail via browser...');
          const thumbBlob = await generateThumbnail(finalMediaBlob);
          const thumbFileName = `${userId}-${timestamp}.jpg`;
          finalThumbnailUrl = await uploadToR2(thumbBlob, 'thumbnails', thumbFileName);
        }
      }

      // 4. Upload do Ficheiro Final (Apenas se não foi processado como HLS)
      if (finalMediaBlob) {
        const fileExt = isVideo ? 'mp4' : (mediaFiles[0] as File).name?.split('.').pop() || 'jpg';
        const fileName = `${userId}-${timestamp}.${fileExt}`;
        const folder = uploadType === 'story' ? 'stories' : 'posts';
        finalMediaUrl = await uploadToR2(finalMediaBlob, folder, fileName);
      }
      
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
          is_ready: true,
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
    setMergeError(null);
    setCopiedMergeError(false);
    setIsFromGallery(false);

    // Resetar para câmera frontal e desligar flash
    setFacingMode('user');
    setIsFlashOn(false);

    startCamera();
  };

  return (
    <div className={`h-full w-full ${previewUrls.length === 0 ? 'bg-transparent' : 'bg-white'} flex flex-col relative overflow-hidden transition-colors duration-500`}>
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
          <div className="fixed inset-0 z-[150] bg-white flex flex-col">
            {/* Fullscreen Media Container */}
            <div className="absolute inset-0 bg-white overflow-hidden">
              {mediaFiles[0]?.type.startsWith('image/') ? (
                <div className="w-full h-full relative">
                  <img src={previewUrls[previewUrls.length - 1]} className="w-full h-full object-cover" />
                </div>
              ) : (
                <video 
                  src={previewUrls[0]} 
                  className={`w-full h-full object-cover ${recordedFacingMode === 'rear' ? 'rotate-180' : ''}`} 
                  autoPlay 
                  loop 
                  playsInline 
                  muted={false}
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
              
              {/* Top Gradient for visibility */}
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
              
              {/* Bottom Gradient for caption visibility */}
              <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
            </div>
            
            {/* Close Button Top Left */}
            <button 
              onClick={cancelSelection} 
              className="absolute top-6 left-6 p-2.5 bg-black/20 backdrop-blur-md rounded-full text-white z-50 hover:bg-black/40 transition-all active:scale-95 border border-white/10"
            >
              <X size={24} />
            </button>

            {/* Error overlay for Canvas + Web Audio Merge Failure */}
            {mergeError && (
              <div className="absolute top-20 left-6 right-6 md:left-1/2 md:right-auto md:w-[480px] md:-translate-x-1/2 z-[200] bg-zinc-950/95 backdrop-blur-md border border-red-500/40 p-5 rounded-[20px] text-white shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top duration-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="text-red-400 shrink-0 animate-bounce" size={20} />
                    <span className="text-[12px] font-bold uppercase tracking-widest text-red-300">Erro de Mixagem do Áudio</span>
                  </div>
                  <button 
                    onClick={() => setMergeError(null)} 
                    className="text-white/40 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
                
                <p className="text-[11px] leading-relaxed text-red-100 bg-red-950/40 p-3 rounded-lg border border-red-800/30 overflow-auto font-mono max-h-32 text-left whitespace-pre-wrap selection:bg-red-500 selection:text-white break-all">
                  {mergeError}
                </p>

                <div className="text-[10px] text-zinc-400 font-medium">
                  Informação do sistema: O vídeo original está pronto a ser partilhado mas sem o som de fundo. Podes copiar e enviar este erro ao desenvolvedor para analisar (pode ser CORS, formato de som ou restrição de rede).
                </div>

                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(mergeError).then(() => {
                        setCopiedMergeError(true);
                        setTimeout(() => setCopiedMergeError(false), 2000);
                      });
                    }}
                    className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-[10px] uppercase tracking-wider font-extrabold transition-all"
                  >
                    {copiedMergeError ? 'Copiado!' : 'Copiar Detalhes do Erro'}
                  </button>
                </div>
              </div>
            )}

            {/* Right Sidebar Buttons */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-8 z-50">
              {/* Publish Button (Top) */}
              <button 
                onClick={() => {
                  if (isVideoTooLong) {
                    setError('Este vídeo ultrapassa 1:30. Para brilhar na banda, partilha apenas os teus momentos mais épicos e curtos!');
                    return;
                  }
                  if (todayCount !== null && todayCount >= 3) {
                    setError("Já tens 3 publicações por hoje, volta amanhã.");
                  } else {
                    handleUpload();
                  }
                }} 
                disabled={uploading || processingVideo || isVideoTooLong}
                className="flex flex-col items-center gap-1 group active:scale-90 transition-transform disabled:opacity-50"
              >
                <div className={`p-4 rounded-full border transition-all ${uploading || processingVideo || isVideoTooLong ? 'bg-zinc-800/80 border-zinc-700 text-zinc-500' : 'bg-white border-white text-black shadow-lg shadow-white/20'}`}>
                  {uploading || processingVideo ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : isVideoTooLong ? (
                    <AlertCircle size={24} />
                  ) : (
                    <ArrowUp size={24} />
                  )}
                </div>
                <span className="text-[9px] font-black uppercase text-white shadow-sm mt-1">{t('Publish')}</span>
              </button>

              {/* Trim Button */}
              {!mediaFiles[0]?.type.startsWith('image/') && (
                <button 
                  onClick={() => setShowTrimEditor(true)}
                  className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
                >
                  <div className="p-4 bg-black/20 backdrop-blur-md rounded-full text-white border border-white/10 shadow-lg">
                    <Scissors size={24}/>
                  </div>
                  <span className="text-[9px] font-black uppercase text-white shadow-sm mt-1">{t('Trim')}</span>
                </button>
              )}

              {/* Settings Button */}
              <button 
                onClick={() => setShowSettings(true)}
                className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
              >
                <div className="p-4 bg-black/20 backdrop-blur-md rounded-full text-white border border-white/10 shadow-lg">
                  <Settings size={24}/>
                </div>
                <span className="text-[9px] font-black uppercase text-white shadow-sm mt-1">{t('Settings')}</span>
              </button>
            </div>

            {/* Bottom Section - Caption Overlay */}
            <div className="absolute bottom-10 left-0 w-full px-6 flex flex-col gap-4 z-40">
               <div className="relative">
                 <textarea 
                    value={content}
                    onChange={(e) => setContent(e.target.value.slice(0, 200))}
                    placeholder={t('Write a caption')}
                    className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-[20px] p-4 text-sm text-white placeholder:text-white/40 outline-none focus:bg-white/20 transition-all h-24 resize-none shadow-sm"
                 />
                 <div className="absolute bottom-3 right-4 text-[9px] font-black text-white/30 uppercase tracking-widest">
                   {content.length}/200
                 </div>
               </div>
            </div>
          </div>
        ) : (
          <div className="h-full w-full relative bg-transparent">
            <div 
              id="cameraPreview" 
              className="h-full w-full relative bg-transparent" 
            />
            
            {countdown !== null && (
              <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-md">
                 <span className="text-[140px] font-black italic text-white animate-pulse drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]">{countdown}</span>
              </div>
            )}

            {preSelectedSound && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md rounded-full border border-white/20 px-3 py-1.5 flex items-center gap-2 z-[60] shadow-lg">
                <Music size={14} className="text-purple-400 animate-[spin_4s_linear_infinite]" />
                <span className="text-[10px] sm:text-xs font-black text-white/90 max-w-[120px] sm:max-w-[200px] truncate">
                  {t('Usando som de')} {preSelectedSound.profiles?.name || `@${preSelectedSound.profiles?.username}`}
                </span>
              </div>
            )}

            <div className="absolute top-10 right-6 flex flex-col gap-6 z-50">
               <button 
                onClick={toggleCamera} 
                disabled={isStarting}
                className="flex flex-col items-center gap-1 group active:scale-90 transition-transform disabled:opacity-50"
              >
                <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Flip size={22}/></div>
                <span className="text-[8px] font-black uppercase text-white shadow-sm">{t('Rotate')}</span>
              </button>
              <button 
                onClick={toggleFlash}
                disabled={facingMode === 'user'}
                className={`flex flex-col items-center gap-1 group active:scale-90 transition-transform ${facingMode === 'user' ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}
              >
                <div className={`p-2.5 backdrop-blur-md rounded-full border transition-all ${isFlashOn ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)]' : 'bg-black/30 border-white/10 text-white'}`}>
                  <Zap size={22} fill={isFlashOn ? "currentColor" : "none"} />
                </div>
                <span className={`text-[8px] font-black uppercase shadow-sm ${isFlashOn ? 'text-purple-500' : 'text-white'}`}>{t('Flash')}</span>
              </button>
            </div>


            <button onClick={() => onCreated()} className="absolute top-6 left-6 p-2 bg-black/30 backdrop-blur-md rounded-full text-white z-50 hover:bg-black/50 active:scale-90 transition-all">
              <X size={24} />
            </button>

            <div className="absolute bottom-56 left-0 w-full flex items-center justify-center gap-6 z-40 pointer-events-auto">
              <div className="flex gap-3">
                <button 
                  onClick={() => { setMaxDuration(15); setTrimEnd(15); }}
                  disabled={isRecording}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-xl ${maxDuration === 15 ? 'bg-white text-black scale-110' : 'bg-black/40 text-white/60 border border-white/10'}`}
                >
                  15s
                </button>
                <button 
                  onClick={() => { setMaxDuration(60); setTrimEnd(60); }}
                  disabled={isRecording}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-xl ${maxDuration === 60 ? 'bg-white text-black scale-110' : 'bg-black/40 text-white/60 border border-white/10'}`}
                >
                  60s
                </button>
                <button 
                  onClick={() => { setMaxDuration(90); setTrimEnd(90); }}
                  disabled={isRecording}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-xl ${maxDuration === 90 ? 'bg-white text-black scale-110' : 'bg-black/40 text-white/60 border border-white/10'}`}
                >
                  90s
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
                  <button 
                    onClick={openGallery}
                    className="flex flex-col items-center gap-1 cursor-pointer group active:scale-90 transition-transform"
                  >
                    <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl text-white border border-white/20 shadow-xl">
                      <ImageIcon size={24} />
                    </div>
                    <span className="text-[8px] font-black uppercase text-white tracking-widest mt-1">{t('Gallery')}</span>
                  </button>
                </div>
                
                <button 
                  onClick={initiateRecording} 
                  disabled={isStarting} 
                  className="relative flex items-center justify-center disabled:opacity-50"
                >
                  <div className="w-20 h-20 rounded-full border-[6px] border-white/40 flex items-center justify-center shadow-2xl">
                    <div className={`transition-all duration-300 ${isRecording ? 'w-8 h-8 rounded-lg' : 'w-16 h-16 rounded-full'} bg-purple-600 shadow-[0_0_30px_rgba(147,51,234,0.6)]`} />
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
                    <span className="text-[8px] font-black uppercase text-white tracking-widest mt-1">{t('Done')}</span>
                  </button>
                </div>
              </div>

              {/* Upload Type Selector */}
              <div className="flex gap-8 pb-2">
                <button 
                  onClick={() => setUploadType('post')}
                  className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${uploadType === 'post' ? 'text-white scale-110' : 'text-white/40'}`}
                >
                  {t('Video')}
                </button>
                <button 
                  onClick={() => setUploadType('story')}
                  className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${uploadType === 'story' ? 'text-white scale-110' : 'text-white/40'}`}
                >
                  {t('Story')}
                </button>
                <button 
                  onClick={onStartLive}
                  className="text-[11px] font-black uppercase tracking-[0.2em] transition-all text-white/40 hover:text-purple-500"
                >
                  {t('Live')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {(error || processingVideo || uploading) && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[300] bg-white border border-zinc-100 text-black px-6 py-5 rounded-[28px] text-[11px] font-black uppercase tracking-[0.1em] shadow-[0_30px_60px_rgba(0,0,0,0.15)] flex items-center gap-4 animate-in slide-in-from-top duration-300 min-w-[280px] justify-center">
           <div className={`p-2 rounded-full text-white ${error ? 'bg-zinc-900' : 'bg-black'}`}>
            {error ? <AlertCircle size={18} /> : <Loader2 size={18} className="animate-spin" />}
           </div>
           <span className="max-w-[200px] text-center leading-relaxed">
             {error || (processingVideo ? t('Processing Video') : t('Publishing'))}
           </span>
           {error && (
              <button onClick={() => setError(null)} className="ml-2 text-zinc-300 hover:text-black transition-colors">
                <X size={18}/>
              </button>
            )}
        </div>
      )}

      {showSettings && (
        <div className="absolute inset-0 bg-white z-[200] flex flex-col p-8">
           <div className="flex items-center justify-between mb-12">
              <h3 className="text-black font-black uppercase tracking-[0.2em] text-sm">{t('Post Options')}</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 bg-zinc-100 rounded-full text-black active:scale-90 transition-all">
                <X size={20} />
              </button>
           </div>

           <div className="flex flex-col gap-6">
              {uploadType === 'post' && (
                <div className="flex items-center justify-between bg-zinc-50 border border-zinc-100 rounded-[28px] p-6 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-2xl text-black shadow-sm">
                      <BookOpen size={22} />
                    </div>
                    <div>
                      <p className="text-[12px] font-black uppercase tracking-widest text-black">{t('Educational Content')}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">{t('Mark as education video')}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsEducation(!isEducation)}
                    className={`w-14 h-7 rounded-full transition-all relative ${isEducation ? 'bg-black' : 'bg-zinc-200'}`}
                  >
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${isEducation ? 'left-8' : 'left-1'}`} />
                  </button>
                </div>
              )}
              
              <div className="mt-auto pt-12">
                <p className="text-center text-zinc-300 text-[9px] font-bold uppercase tracking-[0.3em]">Brilha na banda!</p>
              </div>
           </div>
        </div>
      )}

      {showTrimEditor && (
        <div className="absolute inset-0 bg-white/95 backdrop-blur-xl z-[120] flex flex-col items-center justify-center p-8">
          <div className="w-16 h-1 w-full bg-zinc-200 rounded-full mb-12 max-w-[40px]" />
          <h3 className="text-black font-black uppercase tracking-[0.3em] text-sm mb-12">{t('Trim Video')}</h3>
          
          <div className="w-full max-w-sm bg-zinc-50 rounded-[32px] p-8 border border-zinc-100 shadow-sm">
            <div className="flex justify-between text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-6">
              <span className="bg-white px-3 py-1 rounded-full shadow-sm text-black">{t('Start')}: {trimStart.toFixed(1)}s</span>
              <span className="bg-white px-3 py-1 rounded-full shadow-sm text-black">{t('End')}: {trimEnd.toFixed(1)}s</span>
            </div>
            
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black text-black uppercase tracking-widest">Ponto de Início</label>
                <div className="relative pt-1">
                  <input 
                    type="range" 
                    min="0" 
                    max={trimEnd - 0.5} 
                    step="0.1"
                    value={trimStart}
                    onChange={(e) => setTrimStart(parseFloat(e.target.value))}
                    className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-black"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black text-black uppercase tracking-widest">Ponto de Fim</label>
                <div className="relative pt-1">
                  <input 
                    type="range" 
                    min={trimStart + 0.5} 
                    max={maxDuration} 
                    step="0.1"
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(parseFloat(e.target.value))}
                    className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-black"
                  />
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setShowTrimEditor(false)}
            className="mt-14 px-16 py-5 bg-black text-white rounded-full font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl active:scale-95 transition-all"
          >
            {t('Done')}
          </button>
        </div>
      )}

    </div>
  );
};

export default CreatePost;
