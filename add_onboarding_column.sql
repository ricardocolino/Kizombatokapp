-- Script de configuração para a tabela profiles no Supabase

-- 1. Adicionar colunas necessárias se não existirem
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Garantir que o RLS está ativo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. Remover políticas antigas para evitar conflitos (opcional)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- 4. Criar as políticas de segurança
-- SELECT: Qualquer pessoa pode ver perfis
CREATE POLICY "Profiles are viewable by everyone" 
ON profiles FOR SELECT 
USING (true);

-- INSERT: O usuário autenticado pode criar o seu próprio perfil
CREATE POLICY "Users can insert their own profile" 
ON profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- UPDATE: O usuário autenticado pode editar apenas o seu perfil
CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);
