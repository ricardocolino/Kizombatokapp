import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { parseMediaUrl } from '../services/mediaUtils';
import { 
  DollarSign, CheckCircle2, RefreshCw, Loader2, ExternalLink, 
  Wallet, Building2, User, Clock, AlertTriangle
} from 'lucide-react';

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  coins?: number;
  wallet_address?: string;
  iban?: string;
  method?: string;
  status?: string;
  pago?: boolean;
  created_at?: string;
  author_username?: string;
  author_avatar?: string;
  author_email?: string;
}

export const AdminPaymentsManager: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sqlMissing, setSqlMissing] = useState(false);

  const fetchWithdrawals = async () => {
    setLoading(true);
    setNotice(null);
    try {
      // Buscar levantamentos que ainda não estão marcados como pagos
      let { data: rawList, error } = await supabase
        .from('withdrawals')
        .select('*, profiles!user_id (username, avatar_url)')
        .or('pago.is.null,pago.eq.false')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error && error.message?.includes('pago')) {
        setSqlMissing(true);
        // Fallback caso a coluna ainda não exista
        const fb = await supabase
          .from('withdrawals')
          .select('*, profiles!user_id (username, avatar_url)')
          .neq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(100);
        rawList = fb.data;
      } else if (error) {
        throw error;
      } else {
        setSqlMissing(false);
      }

      if (rawList) {
        const formatted: WithdrawalRequest[] = rawList.map((w: any) => ({
          id: w.id,
          user_id: w.user_id,
          amount: w.amount || 0,
          coins: w.coins,
          wallet_address: w.wallet_address,
          iban: w.iban,
          method: w.method || (w.iban ? 'iban' : 'usdt'),
          status: w.status,
          pago: w.pago,
          created_at: w.created_at,
          author_username: w.profiles?.username || 'utilizador',
          author_avatar: w.profiles?.avatar_url
        }));
        setWithdrawals(formatted);
      } else {
        setWithdrawals([]);
      }
    } catch (err: any) {
      console.error('Erro ao buscar pagamentos:', err);
      setNotice('Erro ao carregar lista de pagamentos pendentes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const handleMarkAsPaid = async (item: WithdrawalRequest) => {
    if (!window.confirm(`Confirma que transferiu o valor de $${item.amount.toFixed(2)} USD para @${item.author_username}?`)) {
      return;
    }

    setActionLoading(item.id);
    try {
      const { error } = await supabase
        .from('withdrawals')
        .update({ 
          pago: true, 
          is_paid: true, 
          status: 'completed' 
        })
        .eq('id', item.id);

      if (error && error.message?.includes('pago')) {
        alert('A coluna "pago" ainda não existe no seu Supabase. Execute o SQL gerado no arquivo admin_payments.sql!');
        return;
      }

      setWithdrawals(prev => prev.filter(w => w.id !== item.id));
      setNotice(`Pagamento de $${item.amount.toFixed(2)} para @${item.author_username} marcado como concluído.`);
    } catch (err: any) {
      console.error('Erro ao marcar pagamento:', err);
      alert('Não foi possível atualizar o estado de pagamento.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300 text-white pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <DollarSign className="w-7 h-7 text-emerald-400" />
            Gestão de Pagamentos e Levantamentos
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Lista de solicitações de saque dos criadores. Clique em "Paguei" após efetuar a transferência.
          </p>
        </div>
        <button
          onClick={fetchWithdrawals}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recarregar Pedidos
        </button>
      </div>

      {notice && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-300 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {sqlMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 text-amber-300 text-xs font-mono">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Aviso SQL Supabase:</span> A coluna `pago` ainda não foi adicionada à tabela `withdrawals`. Execute o script no arquivo <code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-200">admin_payments.sql</code> no SQL Editor do Supabase para ativar a remoção permanente da lista.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <span className="text-zinc-500 text-sm font-mono animate-pulse">Carregando pedidos de levantamento...</span>
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 text-zinc-500 flex flex-col items-center gap-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-500/40" />
          <div>
            <p className="text-base font-bold text-zinc-400">Nenhum pagamento pendente!</p>
            <p className="text-xs font-mono mt-1">Todos os pedidos de levantamento já foram pagos por si.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {withdrawals.map(item => {
            const isIban = item.method === 'iban' || !!item.iban;
            const targetAddress = isIban ? (item.iban || item.wallet_address) : item.wallet_address;

            return (
              <div key={item.id} className="bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-6 flex flex-col justify-between space-y-5 transition-all">
                <div className="space-y-4">
                  {/* Top Header do Card */}
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-1 font-mono text-xs font-bold rounded-lg uppercase tracking-wider flex items-center gap-1.5 ${
                      isIban 
                        ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' 
                        : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                    }`}>
                      {isIban ? <Building2 className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />}
                      Método: {isIban ? 'Transferência IBAN' : 'Cripto USDT (BEP20 / TRC20)'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.created_at ? new Date(item.created_at).toLocaleString('pt-PT') : 'Recente'}
                    </span>
                  </div>

                  {/* Dados do Usuário */}
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img 
                        src={item.author_avatar ? parseMediaUrl(item.author_avatar) : `https://api.dicebear.com/7.x/avatars/svg?seed=${item.author_username}`}
                        alt="Criador"
                        className="w-10 h-10 rounded-full object-cover bg-zinc-800 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          @{item.author_username}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          ID: {item.user_id?.slice(0, 8)}...
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xl font-black text-emerald-400 font-mono">
                        ${item.amount.toFixed(2)} USD
                      </div>
                      {item.coins && (
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {item.coins.toLocaleString()} Coins
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Destino de Pagamento */}
                  <div className="bg-zinc-800/30 p-4 rounded-xl border border-zinc-800 space-y-1.5 font-mono">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-sans font-bold">
                      {isIban ? 'Coordenadas Bancárias (IBAN):' : 'Endereço da Carteira USDT:'}
                    </div>
                    <div className="text-xs text-white break-all bg-black/40 p-2.5 rounded-lg border border-zinc-800 select-all">
                      {targetAddress || 'Não informado corretamente pelo utilizador.'}
                    </div>
                  </div>
                </div>

                {/* Botão Paguei */}
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-end">
                  <button
                    onClick={() => handleMarkAsPaid(item)}
                    disabled={actionLoading === item.id}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                  >
                    {actionLoading === item.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                        <span>Paguei (Ocultar)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminPaymentsManager;
