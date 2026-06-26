-- ==============================================================================
-- 5. GESTÃO DE SALAS AO VIVO (LIVES) - SCRIPT SQL SUPABASE (Angochat Admin)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para permitir
-- que os administradores possam encerrar (derrubar) transmissões ao vivo.

-- 1. Atualizar permissões da tabela lives
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas antigas de admin caso existam
DROP POLICY IF EXISTS "Admin pode ver todas as lives" ON public.lives;
DROP POLICY IF EXISTS "Admin pode atualizar qualquer live" ON public.lives;

-- 3. Criar políticas permitindo administradores ver e encerrar lives
CREATE POLICY "Admin pode ver todas as lives" 
ON public.lives FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admin pode atualizar qualquer live" 
ON public.lives FOR UPDATE 
TO authenticated 
USING (true);
