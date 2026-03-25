
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Post, Profile, Story } from '../types';
import { Search, TrendingUp, AlertCircle, UserCheck, Plus } from 'lucide-react';
import { parseMediaUrl } from '../services/mediaUtils';

interface DiscoveryProps {
  onNavigateToPost?: (postId: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToCreate?: (isStory?: boolean) => void;
  onViewStories?: (userId: string, allUserIds?: string[]) => void;
}

const Discovery: React.FC<DiscoveryProps> = ({ onNavigateToPost, onNavigateToProfile, onNavigateToCreate, onViewStories }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    const fetchTrending = async (query: string = '', limit: number) => {
      try {
        setLoading(true);
        const trimmedQuery = query.trim();

        // 🔹 0. Buscar stories de quem sigo
        if (!trimmedQuery) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { data: follows } = await supabase
              .from('follows')
              .select('following_id')
              .eq('follower_id', session.user.id);
            
            const followingIds = follows?.map(f => f.following_id) || [];
            
            if (followingIds.length > 0) {
              const { data: storiesData } = await supabase
                .from('stories')
                .select('*, profiles:user_id(*)')
                .in('user_id', followingIds)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false });
              
              if (active) {
                // Agrupar por usuário (apenas o mais recente)
                const uniqueStories: Record<string, Story> = {};
                storiesData?.forEach(s => {
                  if (!uniqueStories[s.user_id]) uniqueStories[s.user_id] = s;
                });
                setStories(Object.values(uniqueStories));
              }
            }
          }
        }

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
            placeholder="Pesquisar Kuduro, Vídeo, Semba..." 
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
        <div className="px-4 py-6 border-b border-zinc-900/50">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-zinc-600" />
            Historys de quem segues
          </h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {/* Add Story Button */}
            <div 
              onClick={() => onNavigateToCreate && onNavigateToCreate(true)}
              className="flex flex-col items-center gap-2 shrink-0 group cursor-pointer active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-zinc-800 bg-zinc-900 flex items-center justify-center group-hover:border-red-600 transition-colors">
                <Plus size={24} className="text-zinc-600" />
              </div>
              <span className="text-[10px] font-bold text-zinc-500">Teu Story</span>
            </div>
            {stories.map(story => (
              <div 
                key={story.id} 
                onClick={() => onViewStories && onViewStories(story.user_id, stories.map(s => s.user_id))}
                className="flex flex-col items-center gap-2 shrink-0 group cursor-pointer active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 rounded-full p-0.5 border-2 border-red-600 bg-zinc-950 overflow-hidden group-hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900">
                    {story.profiles?.avatar_url ? (
                      <img src={parseMediaUrl(story.profiles.avatar_url)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-zinc-600 text-lg">
                        {story.profiles?.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-bold text-zinc-400 max-w-[70px] truncate">@{story.profiles?.username}</span>
              </div>
            ))}
            {stories.length === 0 && (
              <p className="text-[10px] text-zinc-700 italic flex items-center py-6">Nenhum history disponível agora...</p>
            )}
          </div>
        </div>
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
           <p className="text-sm font-bold">Nenhum vídeo encontrado para &quot;{searchQuery}&quot;.</p>
           <p className="text-[10px] uppercase mt-2 tracking-widest">Tenta outra pesquisa ou explora as tendências!</p>
        </div>
      )}
    </div>
  );
};

export default Discovery;
