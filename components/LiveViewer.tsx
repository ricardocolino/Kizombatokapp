import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { supabase } from '../supabaseClient';
import { X, Users, MessageCircle, Heart } from 'lucide-react';
import LiveChat from './LiveChat';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '@supabase/supabase-js';

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';

interface LiveViewerProps {
  liveId: string;
  currentUser: User | null;
  onClose: () => void;
}

interface LiveData {
  id: string;
  host_id: string;
  title: string;
  channel_name: string;
  viewer_count: number;
  profiles: {
    username: string;
    avatar_url: string;
  };
}

const LiveViewer: React.FC<LiveViewerProps> = ({ liveId, currentUser, onClose }) => {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [showChat, setShowChat] = useState(true);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLiveData = async () => {
      const { data, error } = await supabase
        .from('lives')
        .select('*, profiles(username, avatar_url)')
        .eq('id', liveId)
        .single();

      if (error) {
        console.error('Error fetching live data:', error);
        onClose();
        return;
      }
      setLiveData(data);
      setViewerCount(data.viewer_count || 0);
      initAgora(data.channel_name);
    };

    const initAgora = async (channelName: string) => {
      if (!AGORA_APP_ID) return;

      const agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      agoraClient.setClientRole('audience');
      setClient(agoraClient);

      agoraClient.on('user-published', async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType);
        if (mediaType === 'video') {
          const videoTrack = user.videoTrack;
          if (videoRef.current) {
            videoTrack?.play(videoRef.current);
          }
        }
        if (mediaType === 'audio') {
          const audioTrack = user.audioTrack;
          audioTrack?.play();
        }
      });

      agoraClient.on('user-unpublished', (user) => {
        if (user.uid === liveData?.host_id) {
          onClose();
        }
      });

      try {
        await agoraClient.join(AGORA_APP_ID, channelName, null, currentUser?.id || null);
        
        // Increment viewer count
        await supabase.rpc('increment_viewer_count', { live_id: liveId });
      } catch (err) {
        console.error('Error joining live:', err);
      }
    };

    fetchLiveData();

    // Subscribe to viewer count updates
    const channel = supabase
      .channel(`live_status:${liveId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lives',
          filter: `id=eq.${liveId}`,
        },
        (payload) => {
          setViewerCount(payload.new.viewer_count || 0);
          if (payload.new.status === 'ended') {
            onClose();
          }
        }
      )
      .subscribe();

    return () => {
      const cleanup = async () => {
        if (client) {
          await client.leave();
        }
        supabase.removeChannel(channel);
        // Decrement viewer count
        await supabase.rpc('decrement_viewer_count', { live_id: liveId });
      };
      cleanup();
    };
  }, [liveId, currentUser, onClose, client, liveData?.host_id]);

  const sendHeart = () => {
    const id = Date.now();
    const x = Math.random() * 100 - 50;
    setHearts((prev) => [...prev, { id, x }]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {/* Video Container */}
      <div ref={videoRef} className="absolute inset-0 bg-zinc-900" />

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col z-10 p-4 pointer-events-none">
        {/* Header */}
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
            <img 
              src={liveData?.profiles?.avatar_url || `https://picsum.photos/seed/${liveData?.host_id}/100/100`}
              alt={liveData?.profiles?.username}
              className="w-8 h-8 rounded-full border border-white/20 object-cover"
            />
            <div className="flex flex-col">
              <span className="text-xs font-black text-white">@{liveData?.profiles?.username || 'host'}</span>
              <div className="flex items-center gap-1 text-white/60">
                <Users size={10} />
                <span className="text-[10px] font-bold">{viewerCount}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 active:scale-90 transition-transform"
          >
            <X size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col justify-end mt-4 mb-20">
          {showChat && (
            <div className="h-1/2 pointer-events-auto">
              <LiveChat liveId={liveId} currentUser={currentUser} />
            </div>
          )}
        </div>

        {/* Floating Hearts */}
        <div className="absolute bottom-32 right-8 pointer-events-none">
          <AnimatePresence>
            {hearts.map((heart) => (
              <motion.div
                key={heart.id}
                initial={{ opacity: 1, y: 0, x: 0, scale: 0.5 }}
                animate={{ opacity: 0, y: -200, x: heart.x, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: "easeOut" }}
                className="absolute text-red-500"
              >
                <Heart size={24} fill="currentColor" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-end gap-4 pointer-events-auto">
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${showChat ? 'bg-white text-black border-white' : 'bg-black/40 border-white/20'}`}
          >
            <MessageCircle size={20} />
          </button>
          <button 
            onClick={sendHeart}
            className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg"
          >
            <Heart size={20} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveViewer;
