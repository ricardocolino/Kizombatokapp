
export interface Profile {
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  balance: number;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string;
  media_type: 'image' | 'video';
  views: number;
  thumbnail_url: string | null;
  audio_url: string | null;
  sound_id: string | null;
  text_overlay: string | null;
  filter: string | null;
  is_education: boolean;
  created_at: string;
  profiles?: Profile;
  sound?: {
    profiles?: Profile;
  };
  _count?: {
    reactions: number;
    comments: number;
  };
}

export interface Comment {
  id: number;
  post_id: string;
  user_id: string;
  parent_id: number | null;
  content: string;
  created_at: string;
  profiles?: Profile;
}

export interface Reaction {
  id: string;
  post_id: string;
  user_id: string;
  type: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
  sender?: Profile;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface LiveStream {
  id: string;
  user_id: string;
  title: string;
  channel_name: string;
  viewer_count: number;
  is_active: boolean;
  started_at: string;
  profiles?: Profile;
}
