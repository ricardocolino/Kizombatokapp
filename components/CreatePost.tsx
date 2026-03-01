import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import * as lamejs from 'lamejs';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Video, X, CheckCircle2, AlertCircle, Music2, Loader2, Zap, FlipVertical as Flip, ChevronDown, Search, Bookmark, Type, Wand2, Image as ImageIcon, Camera, Scissors } from 'lucide-react';
import { Post } from '../types';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';

interface CreatePostProps {
  onCreated: () => void;
  preSelectedSound?: Post | null;
}

const CreatePost: React.FC<CreatePostProps> = ({ onCreated, preSelectedSound }) => {
  const [content, setContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<(File | Blob)[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Sound Selection State
  const [availableSounds, setAvailableSounds] = useState<Post[]>([]);
  const [selectedSound, setSelectedSound] = useState<Post | null>(preSelectedSound || null);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [useOriginalAudio, setUseOriginalAudio] = useState(!preSelectedSound);

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
  const [mode, setMode] = useState<'video' | 'photo'>('video');
  const [textOverlay, setTextOverlay] = useState('');
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [filter, setFilter] = useState('none');
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(15);
  const [showTrimEditor, setShowTrimEditor] = useState(false);

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
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const nativeVideoInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [processingVideo, setProcessingVideo] = useState(false);

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
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ffmpeg;
    setFfmpegLoaded(true);
    return ffmpeg;
  };

  // Processa o vídeo com FFmpeg: aplica filtro real, mescla áudio externo e respeita o trim
  const processVideoWithFFmpeg = async (videoBlob: Blob): Promise<Blob> => {
    setProcessingVideo(true);
    try {
      const ffmpeg = await loadFFmpeg();

      const videoData = await fetchFile(videoBlob);
      await ffmpeg.writeFile('input.mp4', videoData);

      const vfFilter = cssFilterToFFmpeg(filter);
      const hasDubbingAudio = !!selectedSound && !useOriginalAudio && (selectedSound.audio_url || selectedSound.media_url);
      const hasTrim = trimStart > 0 || trimEnd < recordingSeconds;

      // Se não há nada para processar, devolve o blob original
      if (!vfFilter && !hasDubbingAudio && !hasTrim) {
        await ffmpeg.deleteFile('input.mp4');
        return videoBlob;
      }

      const args: string[] = [];

      // -ss e -to ANTES de -i para seek rápido (input seeking)
      args.push('-i', 'input.mp4');

if (hasTrim) {
  args.push('-ss', String(trimStart));
  args.push('-to', String(trimEnd));
}
      // Áudio externo para dubbing — segundo input
      if (hasDubbingAudio) {
        const audioUrl = selectedSound!.audio_url || selectedSound!.media_url;
        const audioData = await fetchFile(audioUrl);
        await ffmpeg.writeFile('dubbing.mp3', audioData);
        args.push('-i', 'dubbing.mp3');
      }

      // Mapeamento explícito de streams
      args.push('-map', '0:v:0');
      if (hasDubbingAudio) {
        args.push('-map', '1:a:0');
      } else {
        // Tenta mapear áudio original; ignora se não existir
        args.push('-map', '0:a:0?');
      }

      // Codec de vídeo:
      // Se há filtro → tem de re-encodar com libx264
      // Se não há filtro → copia o stream original (evita artefactos)
      if (vfFilter || hasDubbingAudio || hasTrim) {
  args.push('-c:v', 'libx264');
  args.push('-preset', 'ultrafast');
  args.push('-crf', '23');
  args.push('-pix_fmt', 'yuv420p');
} else {
  args.push('-c:v', 'copy');
}
      // Codec de áudio
      if (hasDubbingAudio) {
        args.push('-c:a', 'aac');
        args.push('-b:a', '128k');
        args.push('-shortest'); // corta quando o mais curto (vídeo ou áudio) termina
      } else if (vfFilter) {
        // Re-encoding de vídeo → re-encode áudio também para garantir sync
        args.push('-c:a', 'aac');
        args.push('-b:a', '128k');
      } else {
        args.push('-c:a', 'copy');
      }

      args.push('-movflags', '+faststart');
      args.push('-y'); // sobrescreve sem perguntar
      args.push('output.mp4');

      console.log('[FFmpeg] Comando:', args.join(' '));
      await ffmpeg.exec(args);

      const outputData = await ffmpeg.readFile('output.mp4');

      // Verificar que o output não está vazio
      if (!outputData || (outputData as Uint8Array).byteLength < 1000) {
        throw new Error('FFmpeg produziu um ficheiro inválido — usando vídeo original como fallback.');
      }

      const outputBlob = new Blob([outputData], { type: 'video/mp4' });

      // Limpar ficheiros do FS virtual
      try { await ffmpeg.deleteFile('input.mp4'); } catch { /* ignore */ }
      try { await ffmpeg.deleteFile('output.mp4'); } catch { /* ignore */ }
      if (hasDubbingAudio) { try { await ffmpeg.deleteFile('dubbing.mp3'); } catch { /* ignore */ } }

      return outputBlob;
    } catch (err) {
      console.error('[FFmpeg] Erro no processamento:', err);
      // Fallback: devolve o vídeo original sem processar
      return videoBlob;
    } finally {
      setProcessingVideo(false);
    }
  };

  const fetchRandomSounds = async () => {
    try {
      const { data } = await supabase
        .from('posts')
        .select('*, profiles(*)')
        .limit(20);
      if (data) setAvailableSounds(data);
    } catch (e) {
      console.error("Erro ao carregar sons:", e);
    }
  };

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
  };

  const playSoundPreview = (url: string) => {
    stopPreviewAudio();
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        if (e.name !== 'AbortError') {
          console.error("Erro ao tocar preview:", e);
        }
      });
    }
    previewAudioRef.current = audio;
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
        // On native, we also want to ensure microphone is requested
        // getUserMedia often triggers the native prompt for both if called
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
  }, []);

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
    const initTimer = setTimeout(() => {
      startCamera();
    }, 500); 
    
    fetchRandomSounds();
    
    return () => {
      clearTimeout(initTimer);
      stopCamera();
      stopPreviewAudio();
      if (timerRef.current) clearInterval(timerRef.current);
      // ✅ Para o áudio de dubbing ao sair do ecrã
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        playbackAudioRef.current = null;
      }
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
    stopPreviewAudio(); 
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
        if (selectedSound && !useOriginalAudio) {
          const audio = new Audio(selectedSound.audio_url || selectedSound.media_url);
          audio.crossOrigin = "anonymous";
          audio.volume = 1.0;
          playbackAudioRef.current = audio;
          await audio.play();
        }

        setRecordedFacingMode(facingMode);

        const isDubbing = !!selectedSound && !useOriginalAudio;
        console.log("Iniciando gravação nativa. Dublagem:", isDubbing);

        await CameraPreview.startRecordVideo({
          width: window.innerWidth,
          height: window.innerHeight,
          position: facingMode,
          disableAudio: isDubbing
        });
        
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
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        playbackAudioRef.current = null;
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
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        video.currentTime = 0.5; // Capture at 0.5 seconds
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx && filter !== 'none') {
          ctx.filter = filter;
        }
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to generate thumbnail'));
        }, 'image/jpeg', 0.9);
        URL.revokeObjectURL(video.src);
      };
      video.onerror = (e) => {
        URL.revokeObjectURL(video.src);
        reject(e);
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const takePhoto = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await CameraPreview.capture({
          quality: 90
        });
        
        if (result.value) {
          const response = await fetch(`data:image/jpeg;base64,${result.value}`);
          const blob = await response.blob();
          
          if (mediaFiles.length >= 5) {
            setError("Limite de 5 fotos atingido.");
            return;
          }
          
          const newMediaFiles = [...mediaFiles, blob];
          const newPreviewUrls = [...previewUrls, URL.createObjectURL(blob)];
          setMediaFiles(newMediaFiles);
          setPreviewUrls(newPreviewUrls);
        }
      } catch (err) {
        console.error("Erro ao tirar foto nativa:", err);
      }
      return;
    }
    setError("Foto não suportada nesta plataforma.");
  };

  const handleUpload = async () => {
    if (mediaFiles.length === 0) return;
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      
      const isPhoto = mediaFiles[0].type.startsWith('image/');
      const uploadedUrls: string[] = [];
      const timestamp = Date.now();

      // Processar vídeo com FFmpeg (filtro + áudio dubbing + trim)
      let filesToUpload = [...mediaFiles];
      if (!isPhoto) {
        try {
          const processedBlob = await processVideoWithFFmpeg(mediaFiles[0]);
          filesToUpload = [processedBlob, ...mediaFiles.slice(1)];
        } catch (ffmpegErr) {
          console.error('Erro no FFmpeg, usando vídeo original:', ffmpegErr);
          // Continua com o vídeo original em caso de falha
        }
      }

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const isRecorded = (file instanceof Blob) && !(file instanceof File);
        const fileExt = isPhoto ? 'jpg' : (isRecorded ? 'mp4' : (file as File).name.split('.').pop());
        const fileName = `${session.user.id}-${timestamp}-${i}.${fileExt}`;
        const filePath = `posts/${fileName}`;
        
        const { error: uploadError } = await supabase.storage.from('posts').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl: mediaUrl } } = supabase.storage.from('posts').getPublicUrl(filePath);
        uploadedUrls.push(mediaUrl);
      }

      const mediaUrl = uploadedUrls.length > 1 ? JSON.stringify(uploadedUrls) : uploadedUrls[0];
      
      // Extrair e fazer upload do áudio como MP3 (só para vídeo)
      // Se houve dubbing, o áudio já está embutido no vídeo processado pelo FFmpeg
      let audioUrl = null;
      const isDubbing = !!selectedSound && !useOriginalAudio;
      if (!isPhoto && !isDubbing) {
        try {
          const videoBlob = filesToUpload[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = await videoBlob.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          const channels = audioBuffer.numberOfChannels;
          const sampleRate = audioBuffer.sampleRate;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mp3encoder = new (lamejs as any).Mp3Encoder(channels, sampleRate, 128);
          const mp3Data = [];
          
          const sampleBlockSize = 1152;
          const left = audioBuffer.getChannelData(0);
          const right = channels > 1 ? audioBuffer.getChannelData(1) : null;
          
          for (let i = 0; i < left.length; i += sampleBlockSize) {
            const leftChunk = left.subarray(i, i + sampleBlockSize);
            const leftInt16 = new Int16Array(leftChunk.length);
            for (let j = 0; j < leftChunk.length; j++) {
              leftInt16[j] = leftChunk[j] < 0 ? leftChunk[j] * 0x8000 : leftChunk[j] * 0x7FFF;
            }
            
            let mp3buf;
            if (right) {
              const rightChunk = right.subarray(i, i + sampleBlockSize);
              const rightInt16 = new Int16Array(rightChunk.length);
              for (let j = 0; j < rightChunk.length; j++) {
                rightInt16[j] = rightChunk[j] < 0 ? rightChunk[j] * 0x8000 : rightChunk[j] * 0x7FFF;
              }
              mp3buf = mp3encoder.encodeBuffer(leftInt16, rightInt16);
            } else {
              mp3buf = mp3encoder.encodeBuffer(leftInt16);
            }
            
            if (mp3buf.length > 0) {
              mp3Data.push(mp3buf);
            }
          }
          
          const mp3buf = mp3encoder.flush();
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }
          
          const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
          const audioFileName = `${session.user.id}-${timestamp}.mp3`;
          const audioFilePath = `audio/${audioFileName}`;
          
          const { error: audioUploadError } = await supabase.storage.from('posts').upload(audioFilePath, mp3Blob);
          if (!audioUploadError) {
            const { data: { publicUrl: aUrl } } = supabase.storage.from('posts').getPublicUrl(audioFilePath);
            audioUrl = aUrl;
          }
        } catch (audioErr) {
          console.error('Erro ao extrair/converter áudio:', audioErr);
        }
      } else if (!isPhoto && isDubbing && selectedSound) {
        // Em modo dubbing, o áudio do som selecionado já foi embutido pelo FFmpeg
        // Guardamos a referência ao audio_url do sound original para o feed saber qual som foi usado
        audioUrl = selectedSound.audio_url || selectedSound.media_url;
      }

      // Gerar e fazer upload da thumbnail (só para vídeo)
      let thumbnailUrl = null;
      if (!isPhoto) {
        try {
          const thumbBlob = await generateThumbnail(filesToUpload[0]);
          const thumbFileName = `${session.user.id}-${timestamp}.jpg`;
          const thumbFilePath = `thumbnails/${thumbFileName}`;
          const { error: thumbUploadError } = await supabase.storage.from('posts').upload(thumbFilePath, thumbBlob);
          if (!thumbUploadError) {
            const { data: { publicUrl: tUrl } } = supabase.storage.from('posts').getPublicUrl(thumbFilePath);
            thumbnailUrl = tUrl;
          }
        } catch (thumbErr) {
          console.error('Erro ao gerar thumbnail:', thumbErr);
        }
      } else {
        thumbnailUrl = uploadedUrls[0];
      }

      // Inserir post na BD
      const { error: insertError = null } = await supabase.from('posts').insert({
        user_id: session.user.id,
        content: content,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        audio_url: audioUrl,
        media_type: isPhoto ? 'image' : 'video',
        sound_id: selectedSound ? selectedSound.id : null,
        // Filtro já aplicado no vídeo pelo FFmpeg — guardamos null para o feed não re-aplicar via CSS
        text_overlay: textOverlay || null,
        filter: null,
        views: 0,
        created_at: new Date().toISOString()
      });
      
      if (insertError) throw insertError;
      setTimeout(() => onCreated(), 500);
    } catch (err: unknown) {
      setError((err as Error).message || 'Erro ao publicar.');
    } finally {
      setUploading(false);
    }
  };

  const cancelSelection = () => {
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
    }
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setMediaFiles([]);
    setPreviewUrls([]);
    setError(null);
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
                  muted={!!selectedSound && !useOriginalAudio}
                  style={{ filter: filter !== 'none' ? filter : undefined }} 
                  onPlay={(e) => {
                    if (selectedSound && !useOriginalAudio) {
                      const video = e.currentTarget;
                      if (playbackAudioRef.current) {
                        playbackAudioRef.current.currentTime = video.currentTime;
                        playbackAudioRef.current.play().catch(() => {});
                      } else {
                        const audio = new Audio(selectedSound.audio_url || selectedSound.media_url);
                        audio.crossOrigin = "anonymous";
                        audio.loop = true;
                        audio.currentTime = video.currentTime;
                        playbackAudioRef.current = audio;
                        audio.play().catch(() => {});
                      }
                    }
                  }}
                  onPause={() => {
                    if (playbackAudioRef.current) playbackAudioRef.current.pause();
                  }}
                  onTimeUpdate={(e) => {
                    const video = e.currentTarget;
                    if (video.currentTime < trimStart) {
                      video.currentTime = trimStart;
                    }
                    if (video.currentTime > trimEnd) {
                      video.currentTime = trimStart;
                    }

                    if (selectedSound && !useOriginalAudio && playbackAudioRef.current) {
                      const audio = playbackAudioRef.current;
                      if (Math.abs(audio.currentTime - video.currentTime) > 0.3) {
                        audio.currentTime = video.currentTime;
                      }
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
                <button 
                  onClick={() => setShowSoundPicker(true)}
                  className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
                >
                  <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Music2 size={20}/></div>
                  <span className="text-[8px] font-black uppercase text-white shadow-sm">Som</span>
                </button>

                {!mediaFiles[0]?.type.startsWith('image/') && (
                  <button 
                    onClick={() => setShowTrimEditor(true)}
                    className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
                  >
                    <div className="p-2.5 bg-black/30 backdrop-blur-md rounded-full text-white border border-white/10"><Scissors size={20}/></div>
                    <span className="text-[8px] font-black uppercase text-white shadow-sm">Recortar</span>
                  </button>
                )}
              </div>
            </div>
            
            <div className="p-6 pt-2 bg-black flex flex-col gap-4 overflow-y-auto">
               <div className="relative">
                 <textarea 
                   value={content}
                   onChange={(e) => setContent(e.target.value.slice(0, 200))}
                   placeholder="Escreve uma legenda para o teu mambo..."
                   className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-red-600/50 transition-all h-24 resize-none"
                 />
                 <div className="absolute bottom-3 right-4 text-[9px] font-black text-zinc-700 uppercase tracking-widest">
                   {content.length}/200
                 </div>
               </div>
               
               <button onClick={handleUpload} disabled={uploading || processingVideo} className={`w-full py-4 rounded-full font-black uppercase tracking-[0.2em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 border ${(uploading || processingVideo) ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.2)]'}`}>
                 {processingVideo ? <><Loader2 size={16} className="animate-spin" /><span>A Processar Vídeo...</span></> : uploading ? <><Loader2 size={16} className="animate-spin" /><span>A Publicar...</span></> : <><CheckCircle2 size={16} /><span>Publicar Agora</span></>}
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
            
            <div className="absolute top-8 left-0 w-full flex justify-center z-50">
               <button 
                 onClick={() => {
                   if (!showSoundPicker) stopPreviewAudio();
                   setShowSoundPicker(!showSoundPicker);
                 }}
                 className="flex items-center gap-2 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/20 hover:bg-black/60 transition-all active:scale-95 shadow-2xl"
               >
                 <Music2 size={14} className="text-white" />
                 <span className="text-[10px] font-black uppercase text-white tracking-widest truncate max-w-[120px]">
                   {selectedSound && !useOriginalAudio ? (selectedSound.content || `@${selectedSound.profiles?.username}`) : 'Escolher Som'}
                 </span>
                 <ChevronDown size={14} className="text-white" />
               </button>
            </div>

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

            <button onClick={() => onCreated()} className="absolute top-6 right-6 p-2 bg-black/30 backdrop-blur-md rounded-full text-white z-50 hover:bg-black/50 active:scale-90 transition-all">
              <X size={24} />
            </button>

            <div className="absolute bottom-32 left-0 w-full flex items-center justify-center gap-6 z-40 pointer-events-auto">
              <div className="flex gap-4 border-r border-white/10 pr-6">
                <button 
                  onClick={() => setMode('video')}
                  className={`text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'video' ? 'text-white' : 'text-white/40'}`}
                >
                  Vídeo
                </button>
                <button 
                  onClick={() => setMode('photo')}
                  className={`text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'photo' ? 'text-white' : 'text-white/40'}`}
                >
                  Foto
                </button>
              </div>

              <div className="flex gap-3">
                {mode === 'video' ? (
                  <>
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
                  </>
                ) : (
                  <div className="px-6 py-1.5 bg-white/10 text-white/40 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10">
                    Modo Foto
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-12 left-0 w-full flex items-center justify-around px-8 z-40">
               <input 
                 ref={nativeVideoInputRef}
                 type="file" 
                 accept="video/*" 
                 capture="camcorder" 
                 className="hidden" 
                 onChange={handleNativeVideoChange} 
               />
               <label className="flex flex-col items-center gap-1 cursor-pointer group active:scale-90 transition-transform">
                 <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl text-white border border-white/20 shadow-xl">
                   <ImageIcon size={24} />
                 </div>
                 <span className="text-[8px] font-black uppercase text-white tracking-widest mt-1">Galeria</span>
                 <input type="file" className="hidden" accept={mode === 'video' ? 'video/*' : 'image/*'} multiple={mode === 'photo'} onChange={handleFileChange} />
               </label>
               
               <button 
                onClick={mode === 'video' ? (isRecording ? stopRecording : initiateRecording) : takePhoto} 
                disabled={isStarting} 
                className="relative flex items-center justify-center disabled:opacity-50"
               >
                 <div className="w-20 h-20 rounded-full border-[6px] border-white/40 flex items-center justify-center shadow-2xl">
                    <div className={`transition-all duration-300 ${isRecording ? 'w-8 h-8 rounded-lg' : 'w-16 h-16 rounded-full'} ${mode === 'video' ? 'bg-red-600' : 'bg-white'} shadow-[0_0_30px_rgba(220,38,38,0.6)]`} />
                 </div>
                 {mode === 'photo' && (
                   <div className="absolute flex items-center justify-center">
                     <Camera size={24} className="text-black" />
                     {mediaFiles.length > 0 && (
                       <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-black">
                         {mediaFiles.length}
                       </div>
                     )}
                   </div>
                 )}
               </button>

               <button 
                onClick={isRecording ? stopRecording : () => {
                  if (mediaFiles.length > 0) {
                    stopCamera();
                    // We don't need to do anything else, the preview will show up because mediaFiles.length > 0
                  }
                }} 
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${(recordingSeconds > 0 || (mode === 'photo' && mediaFiles.length > 0)) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
               >
                 <div className="p-3.5 bg-yellow-500 rounded-full text-black shadow-[0_10px_30px_rgba(234,179,8,0.4)] active:scale-90"><CheckCircle2 size={26} /></div>
                 <span className="text-[8px] font-black uppercase text-white tracking-widest mt-1">Pronto</span>
               </button>
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

      {showSoundPicker && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end">
          <div className="w-full h-[92%] bg-zinc-950 rounded-t-[32px] flex flex-col overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.2,0.8,0.2,1)] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-zinc-800">
            {/* Header Seletor */}
            <div className="relative px-6 py-5 flex items-center justify-center border-b border-zinc-900">
              <h3 className="text-sm font-black uppercase tracking-[0.15em] text-white">Sons</h3>
              <button 
                onClick={() => { stopPreviewAudio(); setShowSoundPicker(false); }}
                className="absolute right-6 p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Busca Estilo TikTok */}
            <div className="p-4 px-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                <input 
                  type="text" 
                  placeholder="Pesquisar sons..."
                  className="w-full bg-zinc-900 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-red-600/50 transition-all"
                />
              </div>
            </div>

            {/* Tabs Estilo TikTok */}
            <div className="flex px-6 gap-6 overflow-x-auto no-scrollbar border-b border-zinc-900 mb-2">
              {['Descobrir', 'Favoritos', 'Vibe Angola', 'Tendências'].map((tab, i) => (
                <button 
                  key={tab} 
                  className={`py-3 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${i === 0 ? 'text-white border-red-600' : 'text-zinc-600 border-transparent'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Lista de Músicas */}
            <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-10">
              {/* Opção Áudio Original */}
              <button 
                onClick={() => { 
                  stopPreviewAudio();
                  setUseOriginalAudio(true); 
                  setSelectedSound(null); 
                  setShowSoundPicker(false); 
                }}
                className={`w-full flex items-center gap-4 py-4 border-b border-zinc-900/50 transition-all ${useOriginalAudio ? 'opacity-100' : 'opacity-60'}`}
              >
                 <div className="w-14 h-14 bg-zinc-900 rounded-xl flex items-center justify-center text-zinc-500 shrink-0 border border-zinc-800">
                  <Video size={24}/>
                 </div>
                 <div className="flex-1 text-left">
                    <p className="text-[12px] font-black text-white uppercase tracking-tight">Áudio Original</p>
                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-0.5">Som ambiente do vídeo</p>
                 </div>
                 {useOriginalAudio && <div className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-white"><CheckCircle2 size={12}/></div>}
              </button>

              {availableSounds.map(sound => (
                <div key={sound.id} className="relative">
                  <div 
                    onClick={() => { 
                      if (selectedSound?.id === sound.id) {
                        stopPreviewAudio();
                        setSelectedSound(null);
                      } else {
                        setSelectedSound(sound); 
                        setUseOriginalAudio(false); 
                        playSoundPreview(sound.audio_url || sound.media_url);
                      }
                    }}
                    className={`w-full flex items-center gap-4 py-4 border-b border-zinc-900/50 transition-all group cursor-pointer ${selectedSound?.id === sound.id ? 'bg-zinc-900/30' : ''}`}
                  >
                     <div className="relative w-14 h-14 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                        {sound.profiles?.avatar_url ? (
                          <img src={sound.profiles.avatar_url} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700"><Music2 size={24}/></div>
                        )}
                        {selectedSound?.id === sound.id && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="flex gap-1 items-end h-4">
                              <div className="w-1 bg-red-600 animate-[progress_0.6s_ease-in-out_infinite] h-full" />
                              <div className="w-1 bg-red-600 animate-[progress_0.8s_ease-in-out_infinite] h-2/3" />
                              <div className="w-1 bg-red-600 animate-[progress_0.7s_ease-in-out_infinite] h-5/6" />
                            </div>
                          </div>
                        )}
                     </div>
                     <div className="flex-1 text-left overflow-hidden">
                        <p className="text-[12px] font-black text-white uppercase tracking-tight truncate">
                          {sound.content || 'Sem Título'}
                        </p>
                        <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-0.5 truncate">
                          {sound.profiles?.username || 'Anónimo'} • 00:15
                        </p>
                     </div>
                     
                     {selectedSound?.id === sound.id ? (
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           stopPreviewAudio();
                           setShowSoundPicker(false);
                         }}
                         className="bg-red-600 text-white text-[9px] font-black uppercase px-5 py-2.5 rounded-full shadow-lg shadow-red-600/20 active:scale-95 transition-all animate-[bounce_1s_infinite]"
                       >
                         Usar
                       </button>
                     ) : (
                       <div className="flex gap-4">
                         <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             // Add bookmark logic if needed
                           }}
                           className="text-zinc-600 hover:text-white transition-colors"
                         >
                            <Bookmark size={20} />
                         </button>
                       </div>
                     )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatePost;
