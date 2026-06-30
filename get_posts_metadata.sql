-- SQL script to create the optimized get_posts_metadata function in Supabase.
-- This function aggregates 8 different queries into a single database call, 
-- dramatically reducing latency, connection overhead, and resource usage during peak times.

CREATE OR REPLACE FUNCTION public.get_posts_metadata(
  p_post_ids UUID[],
  p_current_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH post_data AS (
    -- Get unique post IDs and their authors directly from the database
    SELECT 
      p.id AS post_id,
      p.user_id AS author_id
    FROM public.posts p
    WHERE p.id = ANY(p_post_ids)
  ),
  reaction_counts AS (
    SELECT post_id, COUNT(*) AS count
    FROM public.reactions
    WHERE post_id = ANY(p_post_ids)
    GROUP BY post_id
  ),
  comment_counts AS (
    SELECT post_id, COUNT(*) AS count
    FROM public.comments
    WHERE post_id = ANY(p_post_ids)
    GROUP BY post_id
  ),
  repost_counts AS (
    SELECT post_id, COUNT(*) AS count
    FROM public.reposts
    WHERE post_id = ANY(p_post_ids)
    GROUP BY post_id
  ),
  user_likes AS (
    SELECT post_id
    FROM public.reactions
    WHERE post_id = ANY(p_post_ids) AND user_id = p_current_user_id
  ),
  user_reposts AS (
    SELECT post_id
    FROM public.reposts
    WHERE post_id = ANY(p_post_ids) AND user_id = p_current_user_id
  ),
  author_stories AS (
    -- Get authors who have active/unexpired stories
    SELECT DISTINCT user_id
    FROM public.stories
    WHERE user_id IN (SELECT author_id FROM post_data) 
      AND expires_at > now()
  ),
  author_lives AS (
    -- Get authors who have an active live stream
    SELECT DISTINCT ON (host_id) host_id, id AS live_id
    FROM public.lives
    WHERE host_id IN (SELECT author_id FROM post_data) 
      AND status = 'active'
    ORDER BY host_id, created_at DESC
  ),
  author_follows AS (
    -- Check if current user is following the post author
    SELECT following_id
    FROM public.follows
    WHERE follower_id = p_current_user_id 
      AND following_id IN (SELECT author_id FROM post_data)
  ),
  metadata_records AS (
    SELECT 
      pd.post_id,
      jsonb_build_object(
        'likesCount', COALESCE(rc.count, 0),
        'commentsCount', COALESCE(cc.count, 0),
        'repostsCount', COALESCE(repc.count, 0),
        'liked', CASE WHEN ul.post_id IS NOT NULL THEN true ELSE false END,
        'reposted', CASE WHEN ur.post_id IS NOT NULL THEN true ELSE false END,
        'hasStories', CASE WHEN ast.user_id IS NOT NULL THEN true ELSE false END,
        'isLive', al.live_id,
        'isFollowing', CASE WHEN af.following_id IS NOT NULL THEN true ELSE false END,
        'isOwnPost', CASE WHEN p_current_user_id = pd.author_id THEN true ELSE false END
      ) AS metadata
    FROM post_data pd
    LEFT JOIN reaction_counts rc ON rc.post_id = pd.post_id
    LEFT JOIN comment_counts cc ON cc.post_id = pd.post_id
    LEFT JOIN repost_counts repc ON repc.post_id = pd.post_id
    LEFT JOIN user_likes ul ON ul.post_id = pd.post_id
    LEFT JOIN user_reposts ur ON ur.post_id = pd.post_id
    LEFT JOIN author_stories ast ON ast.user_id = pd.author_id
    LEFT JOIN author_lives al ON al.host_id = pd.author_id
    LEFT JOIN author_follows af ON af.following_id = pd.author_id
  )
  SELECT 
    jsonb_object_agg(post_id::text, metadata)
  INTO v_result
  FROM metadata_records;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;
