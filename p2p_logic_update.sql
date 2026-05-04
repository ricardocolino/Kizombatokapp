-- 1. Criar a coluna 'type' se ela não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'p2p_requests' AND column_name = 'type') THEN
        ALTER TABLE public.p2p_requests ADD COLUMN type TEXT DEFAULT 'deposit' CHECK (type IN ('deposit', 'withdraw'));
    END IF;
END $$;

-- 2. Atualizar a função RPC que processa a transação com a regra solicitada
CREATE OR REPLACE FUNCTION complete_p2p_transaction(request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_request RECORD;
    v_cashier_balance INTEGER;
    v_user_redeemable INTEGER;
BEGIN
    -- Buscar detalhes do pedido
    SELECT * INTO v_request FROM public.p2p_requests WHERE id = request_id;
    
    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Pedido não encontrado';
    END IF;

    IF v_request.status != 'in_progress' THEN
        RAISE EXCEPTION 'O pedido deve estar em progresso para ser finalizado';
    END IF;

    IF NOT (v_request.user_confirmed AND v_request.cashier_confirmed) THEN
        RAISE EXCEPTION 'Ambas as partes devem confirmar antes de libertar os fundos';
    END IF;

    -- REGRA DE TRANSACÇÃO BASEADA NO TIPO
    IF v_request.type = 'withdraw' THEN
        -- LEVANTAMENTO: Usuário paga com Ganhos (redeemable_balance) -> Caixa recebe no Saldo (balance)
        
        SELECT redeemable_balance INTO v_user_redeemable FROM public.profiles WHERE id = v_request.user_id;
        
        IF v_user_redeemable < v_request.amount THEN
            RAISE EXCEPTION 'Usuário não tem Saldo Resgatável suficiente para este levantamento';
        END IF;

        -- Subtrair do Saldo Resgatável do Usuário
        UPDATE public.profiles 
        SET redeemable_balance = redeemable_balance - v_request.amount 
        WHERE id = v_request.user_id;
        
        -- Adicionar ao Saldo Principal do Caixa
        UPDATE public.profiles 
        SET balance = balance + v_request.amount 
        WHERE id = v_request.cashier_id;

    ELSE
        -- CARREGAMENTO (DEPOSIT): Caixa paga com Saldo (balance) -> Usuário recebe no Saldo (balance)
        
        SELECT balance INTO v_cashier_balance FROM public.profiles WHERE id = v_request.cashier_id;
        
        IF v_cashier_balance < v_request.amount THEN
            RAISE EXCEPTION 'O Caixa não tem Saldo Principal suficiente para esta recarga';
        END IF;

        -- Subtrair do Saldo Principal do Caixa
        UPDATE public.profiles 
        SET balance = balance - v_request.amount 
        WHERE id = v_request.cashier_id;
        
        -- Adicionar ao Saldo Principal do Usuário
        UPDATE public.profiles 
        SET balance = balance + v_request.amount 
        WHERE id = v_request.user_id;
    END IF;

    -- Concluir o pedido
    UPDATE public.p2p_requests 
    SET status = 'completed', updated_at = NOW() 
    WHERE id = request_id;

    -- Incrementar contador de transações do caixa
    UPDATE public.profiles 
    SET cashier_transactions = COALESCE(cashier_transactions, 0) + 1
    WHERE id = v_request.cashier_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
