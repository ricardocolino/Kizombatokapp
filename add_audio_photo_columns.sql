-- Script de Atualização de Banco de Dados para Huzty (Fotos, Áudio e Dublagens)
-- Execute este script completo no painel SQL Editor do Supabase para atualizar a tabela 'posts' e 'stories'.

-- 1. Remover dinamicamente restrições antigas (CHECK constraints) da coluna media_type na tabela 'posts'
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

-- 2. Adicionar nova restrição de CHECK para permitir 'image', 'video', 'audio' e 'text' na tabela 'posts'
ALTER TABLE public.posts ADD CONSTRAINT posts_media_type_check CHECK (media_type IN ('image', 'video', 'audio', 'text'));

-- 3. Remover dinamicamente restrições antigas na tabela 'stories' para conformidade
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'CHECK' 
          AND tc.table_name = 'stories' 
          AND tc.table_schema = 'public'
          AND ccu.column_name = 'media_type'
    ) LOOP
        EXECUTE 'ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- 4. Adicionar nova restrição de CHECK para permitir também 'image', 'video', 'audio' e 'text' na tabela 'stories'
ALTER TABLE public.stories ADD CONSTRAINT stories_media_type_check CHECK (media_type IN ('image', 'video', 'audio', 'text'));

-- 5. Adicionar colunas necessárias na tabela 'posts' se elas ainda não existirem
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS text_overlay TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS filter TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_education BOOLEAN DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_ready BOOLEAN DEFAULT true;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS mp3_url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS mp3_r2_url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS dubbed_from_id UUID;

-- 6. Adicionar Chave Estrangeira de Auto-Referência para Dublagens
-- Se a restrição já existir, evitamos duplicar ao verificar e criar dinamicamente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'posts_dubbed_from_id_fkey' 
          AND table_name = 'posts'
    ) THEN
        ALTER TABLE public.posts 
        ADD CONSTRAINT posts_dubbed_from_id_fkey 
        FOREIGN KEY (dubbed_from_id) 
        REFERENCES public.posts(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- 7. Criar índices para otimização de busca de músicas / áudios e dublagens
CREATE INDEX IF NOT EXISTS posts_dubbed_from_id_idx ON public.posts(dubbed_from_id);
CREATE INDEX IF NOT EXISTS posts_media_type_idx ON public.posts(media_type);

-- 8. Garantir que posts antigos sem media_type tenham o valor padrão 'video'
UPDATE public.posts SET media_type = 'video' WHERE media_type IS NULL;
