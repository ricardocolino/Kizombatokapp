
-- 1. Garantir que a tabela profiles tem a coluna balance
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'balance') THEN
        ALTER TABLE public.profiles ADD COLUMN balance INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Tabela de Tipos de Presentes (Definição)
CREATE TABLE IF NOT EXISTS public.gift_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    icon TEXT NOT NULL, -- Emoji ou URL
    price INTEGER NOT NULL CHECK (price > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Presentes Enviados em Lives
CREATE TABLE IF NOT EXISTS public.live_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_id UUID NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    gift_type_id UUID NOT NULL REFERENCES public.gift_types(id) ON DELETE CASCADE,
    price_at_time INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Habilitar RLS
ALTER TABLE public.gift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_gifts ENABLE ROW LEVEL SECURITY;

-- 5. Políticas
DROP POLICY IF EXISTS "Qualquer pessoa pode ver presentes disponíveis" ON public.gift_types;
CREATE POLICY "Qualquer pessoa pode ver presentes disponíveis" 
ON public.gift_types FOR SELECT USING (true);

DROP POLICY IF EXISTS "Qualquer pessoa pode ver presentes enviados em lives" ON public.live_gifts;
CREATE POLICY "Qualquer pessoa pode ver presentes enviados em lives" 
ON public.live_gifts FOR SELECT USING (true);

-- 6. Inserir alguns presentes iniciais (se não existirem)
INSERT INTO public.gift_types (name, icon, price) VALUES
('Rosa', '🌹', 1),
('Café', '☕', 5),
('Coração', '❤️', 10),
('Diamante', '💎', 50),
('Foguete', '🚀', 100),
('Castelo', '🏰', 500),
('Leão', '🦁', 1000)
ON CONFLICT DO NOTHING;

-- 7. Função RPC para enviar presente (Transação Atómica)
CREATE OR REPLACE FUNCTION send_live_gift(
    p_live_id UUID,
    p_gift_type_id UUID,
    p_sender_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_price INTEGER;
    v_host_id UUID;
    v_sender_balance INTEGER;
BEGIN
    -- 1. Obter o preço do presente
    SELECT price INTO v_price FROM public.gift_types WHERE id = p_gift_type_id;
    
    -- 2. Obter o host_id da live
    SELECT host_id INTO v_host_id FROM public.lives WHERE id = p_live_id;
    
    -- 3. Verificar o saldo do remetente
    SELECT balance INTO v_sender_balance FROM public.profiles WHERE id = p_sender_id;
    
    IF v_sender_balance < v_price THEN
        RAISE EXCEPTION 'Saldo insuficiente para enviar este presente';
    END IF;
    
    -- 4. Deduzir do remetente
    UPDATE public.profiles
    SET balance = balance - v_price
    WHERE id = p_sender_id;
    
    -- 5. Adicionar ao host
    UPDATE public.profiles
    SET balance = balance + v_price
    WHERE id = v_host_id;
    
    -- 6. Registar o presente enviado
    INSERT INTO public.live_gifts (live_id, sender_id, gift_type_id, price_at_time)
    VALUES (p_live_id, p_sender_id, p_gift_type_id, v_price);
    
    -- 7. Inserir mensagem especial no chat
    INSERT INTO public.live_messages (live_id, user_id, content)
    VALUES (p_live_id, p_sender_id, 'GIFT_SENT:' || p_gift_type_id::text);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Habilitar Realtime para live_gifts
-- Nota: Pode falhar se já estiver na publicação, por isso usamos um bloco anónimo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'live_gifts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.live_gifts;
    END IF;
END $$;
