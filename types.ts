export interface Profile {
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  balance: number;
  redeemable_balance: number;
  claimed_views: number;
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
  text_overlay: string | null;
  filter: string | null;
  is_education: boolean;
  created_at: string;
  profiles?: Profile;
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

export interface Repost {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
  posts?: Post;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  created_at: string;
  expires_at: string;
  profiles?: Profile;
}

export interface StoryView {
  id: string;
  story_id: string;
  user_id: string;
  created_at: string;
  profiles?: Profile;
}

export interface StoryReaction {
  id: string;
  story_id: string;
  user_id: string;
  type: string;
  created_at: string;
  profiles?: Profile;
}
