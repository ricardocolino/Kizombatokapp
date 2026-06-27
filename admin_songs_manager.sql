-- ==============================================================================
-- 6. GESTÃO DE MÚSICAS E ÁUDIOS - SCRIPT SQL SUPABASE (Angochat Admin)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para criar a regra
-- e permitir que o administrador (200ricardocolino@gmail.com) remova músicas
-- (colunas mp3_url e mp3_r2_url) sem apagar a publicação inteira.

-- 1. Política RLS (Row Level Security) para permitir que o Administrador atualize publicações
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin pode remover musicas dos posts" ON public.posts;

CREATE POLICY "Admin pode remover musicas dos posts" 
ON public.posts FOR UPDATE 
TO authenticated 
USING (
  (auth.jwt() ->> 'email' = '200ricardocolino@gmail.com')
  OR (auth.uid() = user_id)
);

-- 2. Função RPC segura (SECURITY DEFINER) para apagar a música contornando restrições RLS
CREATE OR REPLACE FUNCTION public.admin_remove_post_song(target_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode remover músicas.';
  END IF;

  UPDATE public.posts 
  SET mp3_url = null, mp3_r2_url = null 
  WHERE id = target_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_remove_post_song(uuid) TO authenticated;
