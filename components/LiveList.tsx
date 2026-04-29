import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Users, Play, TrendingUp, UserCheck } from 'lucide-react';
import { User } from '@supabase/supabase-js';

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
  currentUser: User | null;
  onJoinLive: (liveId: string) => void;
}

const LiveCard = ({ live, onClick }: { live: Live; onClick: () => void }) => (
  <div 
    onClick={onClick}
    className="relative aspect-square bg-zinc-900 overflow-hidden group cursor-pointer active:scale-95 transition-transform"
  >
    <img 
      src={live.profiles?.avatar_url || `https://picsum.photos/seed/${live.host_id}/400/400`}
      alt={live.title}
      className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
    />
    
    <div className="absolute top-2 left-2 bg-red-600 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
      <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
      <span className="text-[7px] font-black text-white italic tracking-tighter">AO VIVO</span>
    </div>

    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
      <p className="text-[9px] font-black text-white truncate lowercase tracking-tighter">@{live.profiles?.username}</p>
      <div className="flex items-center gap-1 opacity-60">
        <Users size={8} className="text-white" />
        <span className="text-[7px] font-bold text-white tracking-widest">{live.viewer_count || 0}</span>
      </div>
    </div>
  </div>
);

const LiveList: React.FC<LiveListProps> = ({ currentUser, onJoinLive }) => {
  const [lives, setLives] = useState<Live[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 1. Fetch Followings
      if (currentUser) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', currentUser.id);
        setFollowingIds(follows?.map(f => f.following_id) || []);
      }

      // 2. Fetch Lives
      const { data, error } = await supabase
        .from('lives')
        .select('*, profiles(username, avatar_url)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching lives:', error);
      } else {
        const uniqueLives = (data || []).reduce((acc: Live[], current) => {
          const exists = acc.find(item => item.host_id === current.host_id);
          if (!exists) acc.push(current);
          return acc;
        }, []);
        setLives(uniqueLives);
      }
      setLoading(false);
    };

    fetchData();

    const channel = supabase
      .channel('lives_list_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lives' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const followingLives = lives.filter(l => followingIds.includes(l.host_id));
  const suggestedLives = lives.filter(l => !followingIds.includes(l.host_id));

  return (
    <div className="h-full overflow-y-auto bg-black pb-32 no-scrollbar">
      {/* Header Mobile Title */}
      <div className="px-6 py-8 border-b border-zinc-900/50">
        <h1 className="text-3xl font-black italic tracking-tighter text-white">LIVES <span className="text-red-600">DIRECTO</span></h1>
        <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em] mt-1">Explora o que está a acontecer em Angola</p>
      </div>

      {lives.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4 text-center">
          <div className="w-12 h-12 bg-zinc-950 border border-zinc-900 rounded-2xl flex items-center justify-center">
            <Play size={20} className="text-zinc-800" />
          </div>
          <div>
            <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Silêncio no Ar</p>
            <p className="text-[10px] text-zinc-600 mt-1">Ninguém em directo neste momento.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Section 1: Following */}
          {followingLives.length > 0 && (
            <div className="py-6">
              <div className="px-6 mb-4 flex items-center gap-2">
                <UserCheck size={14} className="text-red-600" />
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Pessoas que Segues</h2>
              </div>
              <div className="grid grid-cols-2 gap-[1px] bg-zinc-900/30 border-y border-zinc-900/50">
                {followingLives.map(live => (
                  <LiveCard key={live.id} live={live} onClick={() => onJoinLive(live.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Suggestions */}
          <div className="py-6">
            <div className="px-6 mb-4 flex items-center gap-2">
              <TrendingUp size={14} className="text-zinc-600" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">Sugestões para Ti</h2>
            </div>
            {suggestedLives.length > 0 ? (
              <div className="grid grid-cols-3 gap-[1px] bg-zinc-900/30">
                {suggestedLives.map(live => (
                  <LiveCard key={live.id} live={live} onClick={() => onJoinLive(live.id)} />
                ))}
              </div>
            ) : (
              <div className="px-6 py-4">
                <p className="text-[10px] text-zinc-700 italic">Sem outras sugestões agora...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveList;
