-- Script de configuração para adicionar funcionalidade de Foto e Áudio no feeds do Supabase
-- Execute este script no SQL Editor do seu painel do Supabase

-- 1. Remoção dinâmica de restrições antigas (CHECK constraints) sobre a coluna media_type na tabela 'posts'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'CHECK' 
          AND tc.table_name = 'posts' 
          AND tc.table_schema = 'public'
          AND ccu.column_name = 'media_type'
    ) LOOP
        EXECUTE 'ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- 2. Adicionar a nova constraint CHECK para permitir 'image', 'video', 'audio' e 'text'
ALTER TABLE public.posts ADD CONSTRAINT posts_media_type_check CHECK (media_type IN ('image', 'video', 'audio', 'text'));

-- 3. Garantir que as políticas de armazenamento (Storage) permitam imagens no bucket de posts
-- Nota: Caso os buckets de posts e stories precisem aceitar arquivos de imagem, verifique se a política do Storage está correta.
-- Isso altera as regras de inserção nos buckets do supabase storage se já estiverem criados.
