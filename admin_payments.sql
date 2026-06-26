-- ==============================================================================
-- 4. GESTÃO DE PAGAMENTOS E LEVANTAMENTOS - SCRIPT SQL SUPABASE (Angochat Admin)
-- ==============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para adicionar
-- a coluna de controle de pagamento na tabela 'withdrawals'.

-- 1. ADICIONAR COLUNAS 'is_paid' e 'pago' NA TABELA withdrawals
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS pago boolean DEFAULT false;

-- 2. Atualizar permissões de leitura e escrita para administradores autenticados
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- Política para permitir que administradores autorizados atualizem e vejam todos os pedidos
CREATE POLICY IF NOT EXISTS "Admin pode ver todos os levantamentos" 
ON public.withdrawals FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY IF NOT EXISTS "Admin pode atualizar levantamentos" 
ON public.withdrawals FOR UPDATE 
TO authenticated 
USING (true);
