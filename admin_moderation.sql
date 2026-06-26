-- ==============================================================================
-- 3. MODERAÇÃO DE CONTEÚDO E DENÚNCIAS - SCRIPT SQL SUPABASE (Angochat Admin)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para ativar 
-- a consulta de denúncias, eliminação de posts ofensivos e fecho de reportes.
-- Apenas o email '200ricardocolino@gmail.com' terá permissão de execução.

-- 1. Função RPC segura para buscar todas as denúncias com detalhes do post e autor
CREATE OR REPLACE FUNCTION public.admin_get_reports()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
  reports_data json;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode consultar denúncias.';
  END IF;

  SELECT json_agg(
    json_build_object(
      'id', r.id,
      'post_id', r.post_id,
      'reason', r.reason,
      'created_at', r.created_at,
      'reporter_id', r.user_id,
      'post_content', p.content,
      'post_audio_url', p.audio_url,
      'post_photo_url', p.photo_url,
      'author_id', p.user_id,
      'author_username', prof.username,
      'author_avatar', prof.avatar_url
    ) ORDER BY r.created_at DESC
  ) INTO reports_data
  FROM public.reports r
  LEFT JOIN public.posts p ON p.id = r.post_id
  LEFT JOIN public.profiles prof ON prof.id = p.user_id;

  RETURN COALESCE(reports_data, '[]'::json);
END;
$$;

-- 2. Função RPC segura para apagar um post denunciado e fechar o reporte
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

-- 3. Função RPC segura para dispensar/apagar uma denúncia infundada
CREATE OR REPLACE FUNCTION public.admin_dismiss_report(report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode fechar denúncias.';
  END IF;

  DELETE FROM public.reports WHERE id = report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_reported_post(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dismiss_report(uuid) TO authenticated;
