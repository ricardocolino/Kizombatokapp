-- ==============================================================================
-- 3. MODERAÇÃO DE CONTEÚDO E DENÚNCIAS - SCRIPT SQL SUPABASE (Angochat Admin)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para adicionar
-- a coluna 'is_seen_by_admin' (visto) na tabela de publicações e permitir a gestão.

-- 1. ADICIONAR A COLUNA 'is_seen_by_admin' (Botão Visto) NA TABELA POSTS
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_seen_by_admin boolean DEFAULT false;

-- Garantir que a coluna is_banned existe no profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

-- 2. Função RPC segura para apagar um post denunciado ou ofensivo
CREATE OR REPLACE FUNCTION public.admin_delete_reported_post(target_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode moderar conteúdo.';
  END IF;

  DELETE FROM public.posts WHERE id = target_post_id;
  DELETE FROM public.reports WHERE post_id = target_post_id;
END;
$$;

-- 3. Função RPC segura para marcar o post como Visto (fazendo desaparecer da tela)
CREATE OR REPLACE FUNCTION public.admin_mark_post_as_seen(target_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode moderar conteúdo.';
  END IF;

  UPDATE public.posts SET is_seen_by_admin = true WHERE id = target_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_reported_post(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_post_as_seen(uuid) TO authenticated;
