-- ==============================================================================
-- 1. VISÃO GERAL E MÉTRICAS - SCRIPT SQL SUPABASE (Angochat Admin)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para ativar 
-- as métricas instantâneas no Painel de Administração.
-- Apenas o email '200ricardocolino@gmail.com' terá permissão de execução.

CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  user_email text;
BEGIN
  -- Obtém o email do utilizador autenticado a partir do token JWT
  user_email := auth.jwt() ->> 'email';

  -- Verifica se o utilizador autenticado é o administrador autorizado
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode consultar métricas globais.';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'total_balance', (SELECT COALESCE(sum(balance), 0) FROM public.profiles),
    'total_posts', (SELECT count(*) FROM public.posts),
    'total_views', (SELECT COALESCE(sum(views), 0) FROM public.posts),
    'total_stories', (SELECT count(*) FROM public.stories),
    'total_lives', (SELECT count(*) FROM public.lives),
    'active_lives', (SELECT count(*) FROM public.lives WHERE status = 'active'),
    'total_comments', (SELECT count(*) FROM public.comments),
    'total_reactions', (SELECT count(*) FROM public.reactions),
    'total_reports', (SELECT count(*) FROM public.reports)
  ) INTO result;

  RETURN result;
END;
$$;

-- Permite que utilizadores autenticados chamem a função (a própria função fará a verificação de email)
GRANT EXECUTE ON FUNCTION public.get_admin_analytics() TO authenticated;
