
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Video, X, Upload, CheckCircle2, AlertCircle, Music2, Loader2, Zap, FlipVertical as Flip, ChevronDown, Search, Bookmark, Type, Wand2, Image as ImageIcon, Camera } from 'lucide-react';
import { Post } from '../types';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';

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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [maxDuration, setMaxDuration] = useState(15); 
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [mode, setMode] = useState<'video' | 'photo'>('video');
  const [textOverlay, setTextOverlay] = useState('');
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [filter, setFilter] = useState('none');
  const [showFilterPicker, setShowFilterPicker] = useState(false);

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

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const nativeVideoInputRef = useRef<HTMLInputElement>(null);

  // Novo useEffect para gerir a limpeza do stream de forma segura
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  useEffect(() => {
    // Timer para iniciar a câmera após o componente montar e limpar resíduos
    // Delay de 400ms para garantir que o SO liberou qualquer lock anterior
    const initTimer = setTimeout(() => {
      startCamera();
    }, 400); 
    
    fetchRandomSounds();
    
    return () => {
      clearTimeout(initTimer);
      stopCamera();
      stopPreviewAudio();
      previewUrls.forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [facingMode, useOriginalAudio, previewUrls]);

  useEffect(() => {
    if (showCamera && stream && videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = stream;
    }
  }, [showCamera, stream]);

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

  const startCamera = async (): Promise<MediaStream | null> => {
    if (isStarting) return null;
    setIsStarting(true);
    
    // Limpeza profunda antes de tentar acessar o sensor
    stopCamera();
    setIsFlashOn(false);
    
    // Delay crucial para evitar "Câmera indisponível" em alternância rápida
    await new Promise(r => setTimeout(r, 300));
    
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('O teu navegador ou WebView não suporta acesso à câmera. Se estás no Android, verifica as permissões do App.');
      }

      const constraints = {
        video: { 
          facingMode: { ideal: facingMode },
          aspectRatio: { ideal: 9/16 }
        },
        audio: useOriginalAudio
      };
      
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      
      if (typeof window !== 'undefined') {
        (window as { localStream?: MediaStream }).localStream = newStream;
      }
      
      setShowCamera(true);
      setError(null);
      setIsStarting(false);
      return newStream;
    } catch (err: unknown) {
      console.error("Erro ao iniciar câmera:", err);
      try {
        const basicStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: useOriginalAudio });
        setStream(basicStream);
        setShowCamera(true);
        setError(null);
        setIsStarting(false);
        return basicStream;
      } catch (f: unknown) {
        console.error("Erro ao iniciar câmera básica:", f);
        setError('Câmera indisponível. Tenta girar ou verifica se o navegador tem permissão.');
        setShowCamera(false);
        setIsStarting(false);
        return null;
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      setStream(null);
    }

    if (typeof window !== 'undefined') {
      (window as { localStream?: MediaStream | null }).localStream = null;
    }
    
    if (videoPreviewRef.current) {
      videoPreviewRef.current.pause();
      videoPreviewRef.current.srcObject = null;
      videoPreviewRef.current.load(); 
    }
    
    setShowCamera(false);
    setIsFlashOn(false);
  };

  const toggleCamera = () => {
    if (isRecording || isStarting) return;
    setError(null);
    // Alterna o estado, o useEffect cuidará de reiniciar a câmera com facingMode atual
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const toggleFlash = async () => {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const newFlashState = !isFlashOn;
      await videoTrack.applyConstraints({
        advanced: [{ torch: newFlashState } as Record<string, boolean>]
      });
      setIsFlashOn(newFlashState);
    } catch (err) {
      console.error("Flash não suportado:", err);
      setError("Flash não suportado neste sensor.");
      setTimeout(() => setError(null), 3000);
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

  const initiateRecording = () => {
    if (Capacitor.isNativePlatform()) {
      nativeVideoInputRef.current?.click();
      return;
    }
    if (isRecording || countdown !== null || isStarting) return;
    stopPreviewAudio(); 
    let count = 3;
    setCountdown(count);
    const countInterval = setInterval(async () => {
      count -= 1;
      if (count === 0) {
        clearInterval(countInterval);
        setCountdown(null);
        if (stream) {
          startActualRecording(stream);
        } else {
          const activeStream = await startCamera();
          if (activeStream) startActualRecording(activeStream);
        }
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  const startActualRecording = async (activeStream: MediaStream) => {
    chunksRef.current = [];
    let combinedStream = activeStream;

    if (selectedSound && !useOriginalAudio) {
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioContextClass({ latencyHint: 'interactive' });
        const ctx = audioContextRef.current;
        const dest = ctx.createMediaStreamDestination();
        
        const audio = new Audio(selectedSound.media_url);
        audio.crossOrigin = "anonymous";
        playbackAudioRef.current = audio;
        
        const playbackSource = ctx.createMediaElementSource(audio);
        playbackSource.connect(dest);
        playbackSource.connect(ctx.destination);

        combinedStream = new MediaStream([
          ...activeStream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ]);

        await audio.play();
      } catch (e: unknown) {
        console.error("Erro mixagem:", e);
      }
    }

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus') 
        ? 'video/webm;codecs=h264,opus' 
        : 'video/webm;codecs=vp8,opus';

      const recorder = new MediaRecorder(combinedStream, { 
        mimeType,
        videoBitsPerSecond: 2500000 
      });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setMediaFiles([blob]);
        setPreviewUrls([URL.createObjectURL(blob)]);
        stopCamera();
      };
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= maxDuration - 1) { 
            stopRecording();
            return maxDuration;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: unknown) {
      console.error("Erro ao iniciar gravador:", err);
      setError("Erro ao iniciar gravador.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        playbackAudioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const selectedFiles = files.slice(0, 5);
      const newPreviewUrls = selectedFiles.map(file => URL.createObjectURL(file));
      
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      
      setMediaFiles(selectedFiles);
      setPreviewUrls(newPreviewUrls);
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
        const image = await CapCamera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera
        });
        
        if (image.webPath) {
          const response = await fetch(image.webPath);
          const blob = await response.blob();
          
          if (mediaFiles.length >= 5) {
            setError("Limite de 5 fotos atingido.");
            return;
          }
          
          const newMediaFiles = [...mediaFiles, blob];
          const newPreviewUrls = [...previewUrls, image.webPath];
          setMediaFiles(newMediaFiles);
          setPreviewUrls(newPreviewUrls);
        }
      } catch (err) {
        console.error("Erro ao tirar foto nativa:", err);
      }
      return;
    }

    if (!videoPreviewRef.current || !stream) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoPreviewRef.current.videoWidth;
    canvas.height = videoPreviewRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply filter to canvas
    ctx.filter = filter;
    
    // Mirror if using front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(videoPreviewRef.current, 0, 0, canvas.width, canvas.height);

    // Apply text overlay to canvas
    if (textOverlay) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for text
      ctx.font = 'bold 80px Inter, sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 10;
      ctx.fillText(textOverlay, canvas.width / 2, canvas.height / 2);
    }

    canvas.toBlob((blob) => {
      if (blob) {
        if (mediaFiles.length >= 5) {
          setError("Limite de 5 fotos atingido.");
          return;
        }
        const newMediaFiles = [...mediaFiles, blob];
        const newPreviewUrls = [...previewUrls, URL.createObjectURL(blob)];
        setMediaFiles(newMediaFiles);
        setPreviewUrls(newPreviewUrls);
        // Don't stop camera yet, allow more photos
      }
    }, 'image/jpeg', 0.95);
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

      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const isRecorded = (file instanceof Blob) && !(file instanceof File);
        const fileExt = isPhoto ? 'jpg' : (isRecorded ? 'webm' : (file as File).name.split('.').pop());
        const fileName = `${session.user.id}-${timestamp}-${i}.${fileExt}`;
        const filePath = `posts/${fileName}`;
        
        const { error: uploadError } = await supabase.storage.from('posts').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl: mediaUrl } } = supabase.storage.from('posts').getPublicUrl(filePath);
        uploadedUrls.push(mediaUrl);
      }

      const mediaUrl = uploadedUrls.length > 1 ? JSON.stringify(uploadedUrls) : uploadedUrls[0];

      // 2. Generate and Upload Thumbnail (only for video)
      let thumbnailUrl = null;
      if (!isPhoto) {
        try {
          const thumbBlob = await generateThumbnail(mediaFiles[0]);
          const thumbFileName = `${session.user.id}-${timestamp}.jpg`;
          const thumbFilePath = `thumbnails/${thumbFileName}`;
          const { error: thumbUploadError } = await supabase.storage.from('posts').upload(thumbFilePath, thumbBlob);
          if (!thumbUploadError) {
            const { data: { publicUrl: tUrl } } = supabase.storage.from('posts').getPublicUrl(thumbFilePath);
            thumbnailUrl = tUrl;
          }
        } catch (thumbErr) {
          console.error("Erro ao gerar thumbnail:", thumbErr);
        }
      } else {
        thumbnailUrl = uploadedUrls[0]; // Use first photo as thumbnail
      }

      // 3. Insert Post
      const { error: insertError = null } = await supabase.from('posts').insert({
        user_id: session.user.id,
        content: content,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        media_type: isPhoto ? 'image' : 'video',
        sound_id: selectedSound ? selectedSound.id : null,
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
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setMediaFiles([]);
    setPreviewUrls([]);
    setError(null);
    startCamera();
  };

  return (
    <div className="h-full w-full bg-black flex flex-col relative overflow-hidden">
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
                <div className="w-full h-full relative">
                  <img src={previewUrls[previewUrls.length - 1]} className="w-full h-full object-cover" />
                  {previewUrls.length > 1 && (
                    <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-white text-[10px] font-black uppercase tracking-widest">
                      {previewUrls.length} Fotos
                    </div>
                  )}
                </div>
              ) : (
                <video src={previewUrls[0]} className="w-full h-full object-cover" autoPlay loop playsInline />
              )}
              <button onClick={cancelSelection} className="absolute top-4 left-4 p-2.5 bg-black/40 backdrop-blur-md rounded-full text-white z-50 hover:bg-black/60 transition-all active:scale-90">
                <X size={20} />
              </button>
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
               
               <button onClick={handleUpload} disabled={uploading} className={`w-full py-4 rounded-full font-black uppercase tracking-[0.2em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 border ${uploading ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.2)]'}`}>
                 {uploading ? <><Loader2 size={16} className="animate-spin" /><span>A Publicar...</span></> : <><CheckCircle2 size={16} /><span>Publicar Agora</span></>}
               </button>
            </div>
          </div>
        ) : showCamera ? (
          <div className="h-full w-full relative">
            <video 
              ref={videoPreviewRef} 
              autoPlay 
              muted 
              playsInline 
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
              style={{ filter: filter }}
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
                              playSoundPreview(sound.media_url);
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
                className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
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
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center p-8 gap-12 bg-zinc-950">
             <div className="text-center">
                <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">Câmera Off</h2>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em] mt-3">Carrega o teu mambo da galeria</p>
             </div>
             {isStarting ? (
               <div className="flex flex-col items-center gap-4">
                  <Loader2 size={48} className="text-red-600 animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">A preparar sensores...</span>
               </div>
             ) : (
               <label className="flex flex-col items-center gap-4 group cursor-pointer active:scale-95 transition-transform">
                  <div className="w-28 h-28 rounded-3xl bg-red-600/5 border-2 border-red-600/30 flex items-center justify-center text-red-600 group-hover:bg-red-600 group-hover:text-white transition-all shadow-2xl">
                    <Upload size={48} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Escolher Ficheiro</span>
                  <input type="file" className="hidden" accept="video/*" onChange={handleFileChange} />
               </label>
             )}
             <button onClick={() => startCamera()} disabled={isStarting} className="text-[9px] font-black text-white/40 uppercase border-b border-white/10 pb-1 hover:text-white transition-colors disabled:opacity-30">Tentar novamente</button>
             <button onClick={() => onCreated()} className="absolute top-8 right-8 text-zinc-700 hover:text-white transition-colors"><X size={32} /></button>
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
    </div>
  );
};

export default CreatePost;
