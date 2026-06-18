-- Execute este script no Painel SQL Editor do Supabase para criar a estrutura dos Destaques de Stories (Story Highlights)
-- e configurar as permissões corretas (RLS).

CREATE TABLE IF NOT EXISTS public.story_highlights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    cover_url TEXT NOT NULL,
    items JSONB DEFAULT '[]'::jsonb, -- Armazena a lista de slides: [{"media_url": "url", "media_type": "image"}]
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes se houver, para evitar erros de duplicados
DROP POLICY IF EXISTS "story_highlights_select" ON public.story_highlights;
DROP POLICY IF EXISTS "story_highlights_all" ON public.story_highlights;

-- Permitir leitura pública de todos os destaques de stories
CREATE POLICY "story_highlights_select" ON public.story_highlights
    FOR SELECT TO public USING (true);

-- Permitir que os usuários autenticados gerenciem os seus próprios destaques (criar, atualizar, apagar)
CREATE POLICY "story_highlights_all" ON public.story_highlights
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Criar índice para buscas eficientes
CREATE INDEX IF NOT EXISTS story_highlights_user_id_idx ON public.story_highlights(user_id);
