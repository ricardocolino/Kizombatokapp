
-- 1. Tabela de Lives
CREATE TABLE IF NOT EXISTS public.lives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
    channel_name TEXT NOT NULL UNIQUE,
    viewer_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- 2. Tabela de Mensagens da Live (Chat)
CREATE TABLE IF NOT EXISTS public.live_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_id UUID NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Habilitar RLS
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;

-- 4. Políticas para Lives
CREATE POLICY "Qualquer pessoa pode ver lives ativas" 
ON public.lives FOR SELECT 
USING (status = 'active');

CREATE POLICY "Hosts podem criar suas lives" 
ON public.lives FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts podem atualizar suas lives" 
ON public.lives FOR UPDATE 
TO authenticated
USING (auth.uid() = host_id);

-- 5. Políticas para Mensagens da Live
CREATE POLICY "Qualquer pessoa pode ver mensagens de uma live" 
ON public.live_messages FOR SELECT 
USING (true);

CREATE POLICY "Usuários autenticados podem enviar mensagens" 
ON public.live_messages FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 6. Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lives;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;

-- 7. Índices
CREATE INDEX IF NOT EXISTS lives_host_id_idx ON public.lives(host_id);
CREATE INDEX IF NOT EXISTS lives_status_idx ON public.lives(status);
CREATE INDEX IF NOT EXISTS live_messages_live_id_idx ON public.live_messages(live_id);

-- 8. Funções RPC para contador de visualizadores
CREATE OR REPLACE FUNCTION increment_viewer_count(live_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.lives
    SET viewer_count = viewer_count + 1
    WHERE id = live_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_viewer_count(live_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.lives
    SET viewer_count = GREATEST(0, viewer_count - 1)
    WHERE id = live_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
