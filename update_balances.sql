
-- 1. Adicionar a coluna redeemable_balance à tabela profiles
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'redeemable_balance') THEN
        ALTER TABLE public.profiles ADD COLUMN redeemable_balance INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Atualizar a função send_live_gift para usar o saldo de resgate para o host
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
    
    -- 3. Verificar o saldo do remetente (saldo carregado)
    SELECT balance INTO v_sender_balance FROM public.profiles WHERE id = p_sender_id;
    
    IF v_sender_balance < v_price THEN
        RAISE EXCEPTION 'Saldo insuficiente para enviar este presente';
    END IF;
    
    -- 4. Deduzir do remetente (saldo carregado)
    UPDATE public.profiles
    SET balance = balance - v_price
    WHERE id = p_sender_id;
    
    -- 5. Adicionar ao host (saldo de resgate)
    UPDATE public.profiles
    SET redeemable_balance = redeemable_balance + v_price
    WHERE id = v_host_id;
    
    -- 6. Registar o presente enviado
    INSERT INTO public.live_gifts (live_id, sender_id, gift_type_id, price_at_time)
    VALUES (p_live_id, p_sender_id, p_gift_type_id, v_price);
    
    -- 7. Inserir mensagem especial no chat
    INSERT INTO public.live_messages (live_id, user_id, content)
    VALUES (p_live_id, p_sender_id, 'GIFT_SENT:' || p_gift_type_id::text);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Definir/Atualizar a função send_gift para vídeos (posts)
CREATE OR REPLACE FUNCTION send_gift(
    sender_id UUID,
    receiver_id UUID,
    amount INTEGER,
    post_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_sender_balance INTEGER;
BEGIN
    -- 1. Verificar o saldo do remetente (saldo carregado)
    SELECT balance INTO v_sender_balance FROM public.profiles WHERE id = sender_id;
    
    IF v_sender_balance < amount THEN
        RAISE EXCEPTION 'insufficient balance';
    END IF;
    
    -- 2. Deduzir do remetente (saldo carregado)
    UPDATE public.profiles
    SET balance = balance - amount
    WHERE id = sender_id;
    
    -- 3. Adicionar ao destinatário (saldo de resgate)
    UPDATE public.profiles
    SET redeemable_balance = redeemable_balance + amount
    WHERE id = receiver_id;
    
    -- 4. Registar a transação (opcional, mas recomendado se houver tabela)
    -- INSERT INTO public.gift_transactions (sender_id, receiver_id, amount, post_id)
    -- VALUES (sender_id, receiver_id, amount, post_id);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
