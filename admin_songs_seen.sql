-- ==============================================================================
-- COLUNA MÚSICA VISTA - SCRIPT SQL SUPABASE (Angochat Admin)
-- ==============================================================================
-- Execute este script no SQL Editor do Supabase para criar a coluna que guarda
-- o estado de "música vista" pelo administrador.

-- 1. Adicionar a coluna is_seen_music_admin na tabela posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_seen_music_admin boolean DEFAULT false;

-- 2. Função RPC segura (SECURITY DEFINER) para marcar a música como vista
CREATE OR REPLACE FUNCTION public.admin_mark_song_seen(target_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode marcar músicas como vistas.';
  END IF;

  UPDATE public.posts 
  SET is_seen_music_admin = true 
  WHERE id = target_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_song_seen(uuid) TO authenticated;
