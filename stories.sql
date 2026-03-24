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
