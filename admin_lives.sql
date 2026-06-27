-- ==============================================================================
-- 5. GESTÃO DE SALAS AO VIVO (LIVES) - SCRIPT SQL CORRIGIDO (Angochat Admin)
-- ==============================================================================
-- IMPORTANTE: No SQL Editor do Supabase, apague todo o texto antigo ou pressione
-- Ctrl+A (Cmd+A) para selecionar TUDO antes de clicar em "RUN".

-- 1. Ativar segurança por nível de linha (RLS)
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;

-- 2. Remover TODAS as políticas antigas ou abertas (para evitar conflito 42710 e bugs de permissão)
DROP POLICY IF EXISTS "Admin pode ver todas as lives" ON public.lives;
DROP POLICY IF EXISTS "Admin pode atualizar qualquer live" ON public.lives;
DROP POLICY IF EXISTS "Admin pode encerrar lives" ON public.lives;
DROP POLICY IF EXISTS "Permissao moderação lives" ON public.lives;

-- 3. Política de Leitura: Permite que qualquer utilizador autenticado veja as lives
CREATE POLICY "Admin pode ver todas as lives" 
ON public.lives FOR SELECT 
TO authenticated 
USING (true);

-- 4. Política de Encerramento (Derrubar Live): APENAS o e-mail do admin ou o host original
CREATE POLICY "Permissao moderação lives" 
ON public.lives FOR UPDATE 
TO authenticated 
USING (
  (auth.jwt() ->> 'email' = '200ricardocolino@gmail.com')
  OR (auth.uid() = host_id)
);
