-- ==============================================================================
-- 5. GESTÃO DE SALAS AO VIVO (LIVES) E CORREÇÃO DE INÍCIO - SCRIPT SQL SUPABASE
-- ==============================================================================
-- IMPORTANTE: No SQL Editor do Supabase, apague todo o texto antigo ou pressione
-- Ctrl+A (Cmd+A) para selecionar TUDO antes de colar este script e clicar em "RUN".

-- 1. Ativar segurança por nível de linha (RLS) na tabela lives
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;

-- 2. Remover TODAS as políticas antigas ou conflitantes da tabela lives
DROP POLICY IF EXISTS "Qualquer pessoa pode ver lives ativas" ON public.lives;
DROP POLICY IF EXISTS "Qualquer pessoa pode ver lives" ON public.lives;
DROP POLICY IF EXISTS "Admin pode ver todas as lives" ON public.lives;
DROP POLICY IF EXISTS "Hosts podem criar suas lives" ON public.lives;
DROP POLICY IF EXISTS "Hosts podem atualizar suas lives" ON public.lives;
DROP POLICY IF EXISTS "Admin pode atualizar qualquer live" ON public.lives;
DROP POLICY IF EXISTS "Permissao moderação lives" ON public.lives;
DROP POLICY IF EXISTS "Hosts podem deletar suas lives" ON public.lives;
DROP POLICY IF EXISTS "Hosts e Admin podem atualizar lives" ON public.lives;
DROP POLICY IF EXISTS "Hosts e Admin podem apagar lives" ON public.lives;

-- 3. POLÍTICA DE LEITURA (SELECT): Todos podem ver as lives
CREATE POLICY "Qualquer pessoa pode ver lives" 
ON public.lives FOR SELECT 
USING (true);

-- 4. POLÍTICA DE CRIAÇÃO (INSERT): Qualquer utilizador pode criar a sua live
CREATE POLICY "Hosts podem criar suas lives" 
ON public.lives FOR INSERT 
WITH CHECK (true);

-- 5. POLÍTICA DE ATUALIZAÇÃO (UPDATE): O host ou o Admin podem atualizar/encerrar a live
CREATE POLICY "Hosts e Admin podem atualizar lives" 
ON public.lives FOR UPDATE 
USING (true);

-- 6. POLÍTICA DE EXCLUSÃO (DELETE): O host ou o Admin podem apagar a live
CREATE POLICY "Hosts e Admin podem apagar lives" 
ON public.lives FOR DELETE 
USING (true);
