import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Users, Play } from 'lucide-react';

interface Live {
  id: string;
  host_id: string;
  title: string;
  viewer_count: number;
  profiles: {
    username: string;
    avatar_url: string;
  };
}

interface LiveListProps {
  onJoinLive: (liveId: string) => void;
  onStartLive: () => void;
}

const LiveList: React.FC<LiveListProps> = ({ onJoinLive, onStartLive }) => {
  const [lives, setLives] = useState<Live[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLives = async () => {
      const { data, error } = await supabase
        .from('lives')
        .select('*, profiles(username, avatar_url)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching lives:', error);
      } else {
        // Filter to keep only the latest live per host_id
        const uniqueLives = (data || []).reduce((acc: Live[], current) => {
          const exists = acc.find(item => item.host_id === current.host_id);
          if (!exists) {
            acc.push(current);
          }
          return acc;
        }, []);
        setLives(uniqueLives);
      }
      setLoading(false);
    };

    fetchLives();

    // Subscribe to changes
    const channel = supabase
      .channel('lives_list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lives',
        },
        () => {
          fetchLives();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-black p-4 pb-32">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tighter">LIVES</h1>
        <button 
          onClick={onStartLive}
          className="bg-red-600 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest active:scale-95 transition-transform shadow-lg shadow-red-600/20"
        >
          Começar Live
        </button>
      </div>

      {lives.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-4">
          <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center">
            <Play size={24} className="text-zinc-700" />
          </div>
          <p className="text-sm font-bold">Nenhuma live ativa no momento.</p>
          <button 
            onClick={onStartLive}
            className="text-red-600 text-xs font-black uppercase tracking-widest"
          >
            Sê o primeiro a entrar em direto!
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {lives.map((live) => (
            <div 
              key={live.id}
              onClick={() => onJoinLive(live.id)}
              className="relative aspect-[3/4] rounded-2xl overflow-hidden group cursor-pointer border border-white/5 active:scale-95 transition-transform"
            >
              {/* Thumbnail Placeholder */}
              <img 
                src={live.profiles?.avatar_url || `https://picsum.photos/seed/${live.host_id}/400/600`}
                alt={live.title}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              {/* Live Tag */}
              <div className="absolute top-3 left-3 bg-red-600 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-lg">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                <span className="text-[8px] font-black uppercase tracking-widest text-white">LIVE</span>
              </div>

              {/* Viewer Count */}
              <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-md flex items-center gap-1 border border-white/10">
                <Users size={10} className="text-white/80" />
                <span className="text-[8px] font-black text-white">{live.viewer_count || 0}</span>
              </div>

              {/* Host Info */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                <img 
                  src={live.profiles?.avatar_url || `https://picsum.photos/seed/${live.host_id}/100/100`}
                  alt={live.profiles?.username}
                  className="w-8 h-8 rounded-full border border-white/20 object-cover shadow-lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-white truncate">@{live.profiles?.username || 'user'}</p>
                  <p className="text-[9px] text-white/60 truncate">{live.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveList;
