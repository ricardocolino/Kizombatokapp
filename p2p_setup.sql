-- 1. Create p2p_requests table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.p2p_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    cashier_id UUID REFERENCES public.profiles(id),
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    user_confirmed BOOLEAN DEFAULT FALSE,
    cashier_confirmed BOOLEAN DEFAULT FALSE,
    payment_method TEXT,
    proof_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add columns if table already exists but columns are missing (Migration)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'p2p_requests' AND column_name = 'type') THEN
        ALTER TABLE public.p2p_requests ADD COLUMN type TEXT DEFAULT 'deposit' CHECK (type IN ('deposit', 'withdraw'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'p2p_requests' AND column_name = 'user_confirmed') THEN
        ALTER TABLE public.p2p_requests ADD COLUMN user_confirmed BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'p2p_requests' AND column_name = 'cashier_confirmed') THEN
        ALTER TABLE public.p2p_requests ADD COLUMN cashier_confirmed BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. Create RPC for completing transaction
-- Esta função processa a troca de saldos entre as partes de forma segura
CREATE OR REPLACE FUNCTION complete_p2p_transaction(request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_request RECORD;
    v_cashier_balance INTEGER;
    v_user_balance INTEGER;
BEGIN
    -- 1. Obter detalhes do pedido
    SELECT * INTO v_request FROM public.p2p_requests WHERE id = request_id;
    
    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Pedido não encontrado';
    END IF;

    IF v_request.status != 'in_progress' THEN
        RAISE EXCEPTION 'O pedido não está em progresso ou já foi finalizado';
    END IF;

    IF NOT (v_request.user_confirmed AND v_request.cashier_confirmed) THEN
        RAISE EXCEPTION 'Ambas as partes devem confirmar o pagamento/recebimento primeiro';
    END IF;

    -- 2. Lógica de Transferência baseada no TIPO
    IF v_request.type = 'deposit' THEN
        -- DEPÓSITO: O Usuário quer comprar AngoCoins (balance).
        -- O Caixa transfere do seu 'balance' para o 'balance' do Usuário.
        
        SELECT balance INTO v_cashier_balance FROM public.profiles WHERE id = v_request.cashier_id;
        
        IF v_cashier_balance < v_request.amount THEN
            RAISE EXCEPTION 'O Caixa não tem AngoCoins suficientes em saldo para libertar';
        END IF;

        -- Tirar do Saldo Principal do Caixa
        UPDATE public.profiles SET balance = balance - v_request.amount WHERE id = v_request.cashier_id;
        -- Dar ao Saldo Principal do Usuário
        UPDATE public.profiles SET balance = balance + v_request.amount WHERE id = v_request.user_id;

    ELSE
        -- LEVANTAMENTO: O Usuário quer trocar Ganhos (redeemable_balance) por dinheiro real.
        -- O Usuário paga com seu redeemable_balance.
        
        SELECT redeemable_balance INTO v_user_balance FROM public.profiles WHERE id = v_request.user_id;
        
        IF v_user_balance < v_request.amount THEN
            RAISE EXCEPTION 'O Usuário não tem Saldo Resgatável suficiente para este levantamento';
        END IF;

        -- Tirar do Saldo Resgatável do Usuário
        UPDATE public.profiles SET redeemable_balance = redeemable_balance - v_request.amount WHERE id = v_request.user_id;
        -- O Caixa recebe o valor como Saldo Principal (pois ele "comprou" o saldo resgatável)
        UPDATE public.profiles SET balance = balance + v_request.amount WHERE id = v_request.cashier_id;
    END IF;

    -- 3. Marcar transação como completada
    UPDATE public.p2p_requests 
    SET status = 'completed', updated_at = NOW() 
    WHERE id = request_id;

    -- 4. Incrementar estatísticas do caixa
    UPDATE public.profiles 
    SET cashier_transactions = COALESCE(cashier_transactions, 0) + 1
    WHERE id = v_request.cashier_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
