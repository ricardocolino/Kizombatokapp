import React, { useEffect, useRef, useState } from 'react';
import { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { agoraService } from '../services/agoraService';
import { X, Users, Heart, Send, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Profile } from '../types';

interface LiveStreamProps {
  channelName: string;
  isHost: boolean;
  onClose: () => void;
  title?: string;
  hostProfile?: Profile;
}

const LiveStream: React.FC<LiveStreamProps> = ({ channelName, isHost, onClose, title, hostProfile }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [viewerCount] = useState(0);
  const [comments, setComments] = useState<{ id: string, username: string, text: string }[]>([]);
  const [newComment, setNewComment] = useState('');
  const [likes, setLikes] = useState(0);

  useEffect(() => {
    let localTracks: { videoTrack: ICameraVideoTrack, audioTrack: IMicrophoneAudioTrack } | null = null;

    const setupLive = async () => {
      try {
        if (isHost) {
          localTracks = await agoraService.joinAndPublish(channelName);
          if (videoRef.current && localTracks.videoTrack) {
            localTracks.videoTrack.play(videoRef.current);
          }
          
          // Register live in DB
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.from('lives').insert({
              user_id: session.user.id,
              channel_name: channelName,
              title: title || 'Live de Angola 🇦🇴',
              is_active: true,
              viewer_count: 0
            });
          }
        } else {
          await agoraService.joinAsAudience(channelName);
        }
        setLoading(false);
      } catch (err) {
        console.error('Erro ao iniciar live:', err);
        onClose();
      }
    };

    setupLive();

    return () => {
      const endLive = async () => {
        if (isHost) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.from('lives').update({ is_active: false }).eq('channel_name', channelName).eq('user_id', session.user.id);
          }
        }
        await agoraService.leave();
      };
      endLive();
    };
  }, [channelName, isHost, onClose, title]);

  const handleSendComment = () => {
    if (!newComment.trim()) return;
    // Mock comment for now, in a real app this would go through a websocket or DB
    setComments(prev => [...prev, { id: Date.now().toString(), username: 'Tu', text: newComment }]);
    setNewComment('');
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Video Background */}
      <div id="remote-player" ref={videoRef} className="absolute inset-0 bg-zinc-900" />
      
      {/* Overlay UI */}
      <div className="relative flex-1 flex flex-col p-4 justify-between bg-gradient-to-b from-black/40 via-transparent to-black/60">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-red-600 overflow-hidden">
              {hostProfile?.avatar_url ? (
                <img src={hostProfile.avatar_url} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-black">
                  {hostProfile?.username?.[0].toUpperCase() || 'A'}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-black text-white">{hostProfile?.username || 'Host'}</p>
              <div className="flex items-center gap-2">
                <span className="bg-red-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse">Live</span>
                <div className="flex items-center gap-1 text-[10px] text-white/80 font-bold">
                  <Users size={10} />
                  {viewerCount}
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white">
            <X size={20} />
          </button>
        </div>

        {/* Center Loading */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest text-white">A entrar na vibe...</p>
            </div>
          </div>
        )}

        {/* Bottom Section */}
        <div className="flex flex-col gap-4">
          {/* Comments Area */}
          <div className="max-h-48 overflow-y-auto flex flex-col gap-2 no-scrollbar">
            {comments.map(c => (
              <div key={c.id} className="flex items-start gap-2 bg-black/20 backdrop-blur-sm p-2 rounded-xl max-w-[80%]">
                <p className="text-[10px] font-black text-red-500">{c.username}:</p>
                <p className="text-[10px] font-medium text-white">{c.text}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendComment()}
                placeholder="Diz um mambo..."
                className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-full py-3 px-5 text-xs text-white placeholder:text-white/40 outline-none focus:border-red-600 transition-all"
              />
              <button 
                onClick={handleSendComment}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-red-600"
              >
                <Send size={18} />
              </button>
            </div>
            <button 
              onClick={() => setLikes(prev => prev + 1)}
              className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white relative"
            >
              <Heart size={24} className={likes > 0 ? 'fill-red-600 text-red-600' : ''} />
              {likes > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-[8px] font-black px-1 rounded-full">{likes}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveStream;
