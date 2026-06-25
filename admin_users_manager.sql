-- ==============================================================================
-- 2. GESTÃO DE USUÁRIOS - SCRIPT SQL SUPABASE (Angochat Admin)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para ativar 
-- a consulta global de contas, banimento e alteração de saldos.
-- Apenas o email '200ricardocolino@gmail.com' terá permissão de execução.

-- 1. Adicionar coluna is_banned na tabela profiles (se não existir)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

-- 2. Função RPC segura para listar todos os utilizadores contornando regras RLS (Security Definer)
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode consultar utilizadores.';
  END IF;

  RETURN QUERY SELECT * FROM public.profiles ORDER BY username ASC NULLS LAST LIMIT 500;
END;
$$;

-- 3. Função RPC segura para atualizar status de banimento (Bloquear/Desbloquear)
CREATE OR REPLACE FUNCTION public.admin_toggle_ban_user(target_user_id uuid, ban_status boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode banir utilizadores.';
  END IF;

  UPDATE public.profiles SET is_banned = ban_status WHERE id = target_user_id;
END;
$$;

-- 4. Função RPC segura para ajustar o saldo Kz de um utilizador
CREATE OR REPLACE FUNCTION public.admin_update_user_balance(target_user_id uuid, new_balance numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR user_email != '200ricardocolino@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado: Apenas o administrador autorizado pode alterar saldos.';
  END IF;

  UPDATE public.profiles SET balance = new_balance WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_ban_user(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_balance(uuid, numeric) TO authenticated;
