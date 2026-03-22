
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Post, Profile } from '../types';
import { Search, TrendingUp, AlertCircle, UserCheck } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';
import ViewerLive from './ViewerLive';

interface DiscoveryProps {
  onNavigateToPost?: (postId: string) => void;
  onNavigateToProfile?: (userId: string) => void;
}

interface ActiveLive {
  id: string;
  channel_name: string;
  user_id: string;
  profiles: Profile;
  multi_guest_enabled: boolean;
}

const Discovery: React.FC<DiscoveryProps> = ({ onNavigateToPost, onNavigateToProfile }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLives, setActiveLives] = useState<ActiveLive[]>([]);
  const [selectedLive, setSelectedLive] = useState<ActiveLive | null>(null);

  useEffect(() => {
    const fetchActiveLives = async () => {
      const { data } = await supabase
        .from('lives')
        .select('*, profiles!user_id(*)')
        .eq('is_active', true)
        .limit(10);
      
      if (data) setActiveLives(data);
    };

    fetchActiveLives();

    // Subscribe to lives changes
    const livesSubscription = supabase
      .channel('lives_discovery_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lives'
        },
        async () => {
          const { data } = await supabase
            .from('lives')
            .select('*, profiles!user_id(*)')
            .eq('is_active', true)
            .limit(10);
          
          if (data) setActiveLives(data);
          else setActiveLives([]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(livesSubscription);
    };
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    const fetchTrending = async (query: string = '', limit: number) => {
      try {
        setLoading(true);
        const trimmedQuery = query.trim();

        // 🔹 1. Buscar usuários primeiro
        let matchedUsers: Profile[] = [];

        if (trimmedQuery) {
          const { data: usersData } = await supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${trimmedQuery}%,name.ilike.%${trimmedQuery}%`)
            .limit(10);

          matchedUsers = usersData || [];
          if (active) setUsers(matchedUsers);
        } else {
          if (active) setUsers([]);
        }

        // 🔹 2. Buscar posts por conteúdo
        let postsByContent: Post[] = [];
        if (trimmedQuery) {
          const { data } = await supabase
            .from('posts')
            .select('*, profiles!user_id(*)')
            .ilike('content', `%${trimmedQuery}%`)
            .limit(limit);

          postsByContent = data || [];
        }

        // 🔹 3. Buscar posts dos usuários encontrados
        let postsByUsers: Post[] = [];
        if (matchedUsers.length > 0) {
          const userIds = matchedUsers.map(u => u.id);

          const { data } = await supabase
            .from('posts')
            .select('*, profiles!user_id(*)')
            .in('user_id', userIds)
            .limit(limit);

          postsByUsers = data || [];
        }

        // 🔹 4. Combinar e remover duplicados
        let combinedPosts: Post[] = [];

        if (trimmedQuery) {
          const allPosts = [...postsByContent, ...postsByUsers];

          const uniqueMap = new Map();
          allPosts.forEach(post => {
            uniqueMap.set(post.id, post);
          });

          combinedPosts = Array.from(uniqueMap.values());
        } else {
          // 🔹 Lógica: Buscar posts mais vistos
          const { data } = await supabase
            .from('posts')
            .select('*, profiles!user_id(*)')
            .order('views', { ascending: false })
            .limit(limit);

          combinedPosts = data || [];
        }

        if (active) setPosts(combinedPosts);

      } catch (error) {
        console.error("Error loading discovery:", error);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchTrending(searchQuery, displayLimit);

    return () => {
      active = false; // Cancela atualizações de buscas que ficaram para trás
    };
  }, [searchQuery, displayLimit]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      if (!loading) {
        setDisplayLimit(prev => prev + 10);
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full w-full bg-zinc-950 overflow-y-auto pb-20 no-scrollbar"
    >
      {/* Search Header */}
      <div className="sticky top-0 bg-zinc-950/90 backdrop-blur-md p-4 z-20 border-b border-zinc-900/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setDisplayLimit(10); 
            }}
            placeholder="Pesquisar Kuduro, Mambo, Semba..." 
            className="w-full bg-zinc-900 border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-red-600 transition-all outline-none text-white shadow-inner"
          />
        </div>
      </div>

      {searchQuery && users.length > 0 && (
        <div className="px-4 py-6 bg-zinc-950/50 border-b border-zinc-900/30">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-4 flex items-center gap-2">
            <UserCheck size={14} className="text-zinc-600" />
            Perfis Encontrados
          </h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {users.map(user => (
              <div 
                key={user.id} 
                onClick={() => onNavigateToProfile && onNavigateToProfile(user.id)}
                className="flex flex-col items-center gap-2 shrink-0 group cursor-pointer active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-zinc-800 bg-zinc-900 group-hover:border-red-600 transition-colors">
                  {user.avatar_url ? (
                    <img src={parseMediaUrl(user.avatar_url)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-black text-zinc-600 text-lg">
                      {user.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-zinc-400 max-w-[70px] truncate">@{user.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!searchQuery && (
        <>
          {/* Banner */}
          <div className="px-4 mt-4 mb-6">
            <div className="w-full h-36 bg-gradient-to-br from-red-800 via-zinc-900 to-yellow-600 rounded-2xl flex items-center justify-between px-6 overflow-hidden relative shadow-2xl">
              <div className="z-10">
                <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter drop-shadow-xl">#AngoChat</h2>
                <p className="text-xs text-zinc-100/90 font-bold uppercase tracking-widest mt-1">A Vibe de Angola 🇦🇴</p>
              </div>
              <TrendingUp size={100} className="absolute -right-4 -bottom-4 text-white/10 rotate-12" />
              <div className="absolute top-0 right-0 p-4">
                 <div className="bg-red-600 text-[10px] font-black px-2 py-0.5 rounded text-white uppercase">Live</div>
              </div>
            </div>
          </div>

          {/* Live Now Section */}
          {activeLives.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4 px-4">
                <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Live Agora</h2>
              </div>
              <div className="flex gap-4 px-4 overflow-x-auto no-scrollbar pb-2">
                {activeLives.map((live) => (
                  <div 
                    key={live.id}
                    onClick={() => setSelectedLive(live)}
                    className="flex-shrink-0 w-20 flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-transform"
                  >
                    <div className="relative w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-red-600 via-orange-500 to-yellow-500 shadow-lg shadow-red-600/20">
                      <div className="w-full h-full rounded-full border-2 border-black overflow-hidden bg-zinc-900">
                        {live.profiles?.avatar_url ? (
                          <img 
                            src={parseMediaUrl(live.profiles.avatar_url)} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform" 
                            alt="" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg font-black text-zinc-600">
                            {live.profiles?.username?.[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest border border-black shadow-lg">
                        Live
                      </div>
                    </div>
                    <span className="text-[9px] font-bold text-zinc-500 truncate w-full text-center">
                      @{live.profiles?.username}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedLive && (
            <div className="fixed inset-0 z-[100] bg-black">
              <ViewerLive 
                channelName={selectedLive.channel_name} 
                onClose={() => setSelectedLive(null)}
                hostProfile={selectedLive.profiles}
                hostId={selectedLive.user_id}
              />
            </div>
          )}

          {/* Trending Tracks/Hashtags */}
          <div className="flex gap-2 overflow-x-auto px-4 mb-6 no-scrollbar pb-2">
            {['#Kuduro', '#Comedia', '#Danca', '#AngolaVibe', '#Semba', '#Talento'].map(tag => (
              <button 
                key={tag} 
                onClick={() => {
                  setSearchQuery(tag.replace('#', ''));
                  setDisplayLimit(10);
                }}
                className="bg-zinc-900 hover:bg-zinc-800 px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border border-zinc-800 transition-colors shadow-sm"
              >
                {tag}
              </button>
            ))}
          </div>
        </>
      )}

      {searchQuery && (
        <div className="px-4 py-2">
           <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 flex items-center gap-2">
            <TrendingUp size={14} className="text-zinc-600" />
            Vídeos Sugeridos
          </h3>
        </div>
      )}

      {/* Post Grid */}
      <div className="grid grid-cols-3 gap-0.5 px-0.5 mt-2">
        {posts.map(post => (
          <div 
            key={post.id} 
            onClick={() => onNavigateToPost && onNavigateToPost(post.id)}
            className="aspect-[3/4] bg-zinc-900 relative group overflow-hidden cursor-pointer active:scale-95 transition-transform"
          >
            {post.media_url ? (
              <>
                {post.media_type === 'video' ? (
                  <video 
                    src={parseMediaUrl(post.media_url)} 
                    className="w-full h-full object-cover" 
                    muted 
                    playsInline 
                    preload="metadata"
                    poster={post.thumbnail_url ? parseMediaUrl(post.thumbnail_url) : undefined}
                  />
                ) : (
                  <img src={parseMediaUrl(post.media_url)} className="w-full h-full object-cover" alt="" />
                )}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/0 transition-colors duration-300" />
                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] text-white font-black drop-shadow-md">
                   <TrendingUp size={10} className="text-yellow-500" />
                   {post.views > 1000 ? `${(post.views / 1000).toFixed(1)}k` : post.views}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 text-zinc-600">
                <AlertCircle size={20} />
              </div>
            )}
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center p-12 gap-3">
          <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">A Carregar</span>
        </div>
      )}

      {posts.length === 0 && !loading && (
        <div className="py-20 text-center text-zinc-600 px-10">
           <p className="text-sm font-bold">Nenhum mambo encontrado para &quot;{searchQuery}&quot;.</p>
           <p className="text-[10px] uppercase mt-2 tracking-widest">Tenta outra pesquisa ou explora as tendências!</p>
        </div>
      )}
    </div>
  );
};

export default Discovery;
