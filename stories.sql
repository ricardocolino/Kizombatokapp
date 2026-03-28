-- 1. Criar a tabela de stories
CREATE TABLE IF NOT EXISTS public.stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '24 hours') NOT NULL
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- 3. Criar Políticas de Segurança (RLS)

-- Permitir que qualquer pessoa veja os stories (ou apenas seguidores, mas por agora todos)
CREATE POLICY "Stories são visíveis por todos" 
ON public.stories FOR SELECT 
USING (expires_at > now());

-- Permitir que usuários autenticados criem seus próprios stories
CREATE POLICY "Usuários podem criar stories" 
ON public.stories FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Permitir que os usuários removam seus próprios stories
CREATE POLICY "Usuários podem remover seus stories" 
ON public.stories FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS stories_user_id_idx ON public.stories(user_id);
CREATE INDEX IF NOT EXISTS stories_expires_at_idx ON public.stories(expires_at);

-- 5. Criar a tabela de visualizações de stories
CREATE TABLE IF NOT EXISTS public.story_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(story_id, user_id)
);

-- 6. Criar a tabela de reações de stories
CREATE TABLE IF NOT EXISTS public.story_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- e.g., '❤️', '🔥', '😂', '😮', '😢', '👏'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Habilitar RLS
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

-- 8. Políticas para story_views
CREATE POLICY "Visualizações são visíveis pelo dono do story" 
ON public.story_views FOR SELECT 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.stories 
        WHERE id = story_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Usuários podem registrar suas visualizações" 
ON public.story_views FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas visualizações" 
ON public.story_views FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

-- 9. Políticas para story_reactions
CREATE POLICY "Reações são visíveis por todos" 
ON public.story_reactions FOR SELECT 
USING (true);

CREATE POLICY "Usuários podem reagir aos stories" 
ON public.story_reactions FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem remover suas reações" 
ON public.story_reactions FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- 10. Índices
CREATE INDEX IF NOT EXISTS story_views_story_id_idx ON public.story_views(story_id);
CREATE INDEX IF NOT EXISTS story_reactions_story_id_idx ON public.story_reactions(story_id);
