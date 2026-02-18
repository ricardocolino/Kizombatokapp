
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Post } from '../types';
import PostCard from './PostCard';

interface FeedProps {
  onNavigateToProfile: (userId: string) => void;
  onNavigateToSound: (post: Post) => void;
  initialPostId?: string | null;
}

const PostSkeleton = () => (
  <div className="feed-item h-full w-full bg-zinc-900 animate-pulse relative">
    <div className="absolute bottom-10 left-5 space-y-3 w-2/3">
      <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
      <div className="h-3 bg-zinc-800 rounded w-full"></div>
      <div className="h-3 bg-zinc-800 rounded w-3/4"></div>
    </div>
    <div className="absolute right-4 bottom-24 space-y-6">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="w-12 h-12 bg-zinc-800 rounded-full"></div>
      ))}
    </div>
  </div>
);

const Feed: React.FC<FeedProps> = ({ onNavigateToProfile, onNavigateToSound, initialPostId }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, [initialPostId]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select(`*, profiles (*)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      let rawPosts = data || [];

      // Lógica para ordenar por "Mais Dublados"
      const dubbingCounts: Record<string, number> = {};
      rawPosts.forEach(p => {
        if (p.sound_id) {
          dubbingCounts[p.sound_id] = (dubbingCounts[p.sound_id] || 0) + 1;
        }
      });

      let sortedPosts = [...rawPosts].sort((a, b) => {
        const countA = dubbingCounts[a.id] || 0;
        const countB = dubbingCounts[b.id] || 0;
        if (countB !== countA) return countB - countA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      // Se houver um ID inicial vindo da Pesquisa/Explorar, coloca-o no topo
      if (initialPostId) {
        const targetPost = sortedPosts.find(p => p.id === initialPostId);
        if (targetPost) {
          sortedPosts = [targetPost, ...sortedPosts.filter(p => p.id !== initialPostId)];
        }
      }

      setPosts(sortedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (loading) {
    return (
      <div className="feed-container h-full w-full bg-black">
        {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-zinc-500 p-10 text-center">
        <p className="font-bold text-lg mb-2">O mambo está vazio!</p>
        <p className="text-sm">Sê o primeiro a brilhar na banda. Publica um vídeo agora.</p>
      </div>
    );
  }

  return (
    <div className="feed-container h-full w-full bg-black">
      {posts.map((post) => (
        <div key={post.id} className="feed-item relative">
          <PostCard 
            post={post} 
            onNavigateToProfile={onNavigateToProfile} 
            onNavigateToSound={onNavigateToSound}
            isMuted={isMuted}
            onToggleMute={toggleMute}
          />
        </div>
      ))}
    </div>
  );
};

export default Feed;
