import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Play, TrendingUp, UserCheck } from 'lucide-react';
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
    className="flex flex-col items-center gap-2 p-3 cursor-pointer active:scale-95 transition-transform group"
  >
    <div className="relative">
      <div className="w-16 h-16 rounded-full p-0.5 border-2 border-red-600 bg-zinc-950">
        <img 
          src={live.profiles?.avatar_url || `https://picsum.photos/seed/${live.host_id}/200/200`}
          alt={live.profiles?.username}
          className="w-full h-full rounded-full object-cover"
        />
      </div>
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 px-1.5 py-0.5 rounded-sm ring-1 ring-black">
        <span className="text-[6px] font-black text-white italic tracking-tighter">AO VIVO</span>
      </div>
    </div>
    <div className="text-center mt-1">
      <p className="text-[10px] font-black text-white truncate max-w-[80px] lowercase tracking-tighter">@{live.profiles?.username}</p>
      <p className="text-[8px] text-zinc-500 truncate max-w-[90px] font-bold uppercase tracking-tight">{live.title}</p>
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
              <div className="grid grid-cols-3 gap-2 px-4">
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
              <div className="grid grid-cols-3 gap-2 px-4">
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
