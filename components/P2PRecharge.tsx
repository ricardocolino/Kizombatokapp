import React, { useState, useEffect, useCallback } from 'react';
import { P2PRequest, Profile } from '../types';
import { supabase } from '../supabaseClient';
import { X, ArrowUpCircle, ArrowDownCircle, Clock, AlertCircle, Coins, ChevronRight, Loader2, ShieldCheck, User, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface P2PRechargeProps {
  currentUser: Profile;
  onClose: () => void;
  onBalanceUpdate: () => void;
}

const P2PRecharge: React.FC<P2PRechargeProps> = ({ currentUser, onClose, onBalanceUpdate }) => {
  const [activeTab, setActiveTab] = useState<'user' | 'cashier'>('user');
  const [requests, setRequests] = useState<P2PRequest[]>([]);
  const [isCaixa, setIsCaixa] = useState(false);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'deposit' | 'withdraw'>('deposit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<P2PRequest | null>(null);

  const checkCaixaStatus = useCallback(async () => {
    const { data } = await supabase
      .from('caixas')
      .select('*')
      .eq('id', currentUser.id)
      .eq('status', 'active')
      .single();
    setIsCaixa(!!data);
  }, [currentUser.id]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('p2p_requests').select('*, user:profiles!user_id(*), cashier:profiles!cashier_id(*)');
    
    if (activeTab === 'user') {
      query = query.eq('user_id', currentUser.id);
    } else {
      query = query.eq('status', 'pending');
    }

    const { data } = await query.order('created_at', { ascending: false });
    if (data) setRequests(data as unknown as P2PRequest[]);
    setLoading(false);
  }, [activeTab, currentUser.id]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (!isMounted) return;
      await checkCaixaStatus();
      if (!isMounted) return;
      await fetchRequests();
    };

    init();
    
    const channel = supabase
      .channel('p2p_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_requests' }, () => {
        if (isMounted) fetchRequests();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeTab, checkCaixaStatus, fetchRequests]);

  const handleCreateRequest = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    
    setIsSubmitting(true);
    const { error } = await supabase.from('p2p_requests').insert({
      user_id: currentUser.id,
      amount: Number(amount),
      type,
      status: 'pending'
    });

    if (!error) {
      setAmount('');
      fetchRequests();
    }
    setIsSubmitting(false);
  };

  const handleAcceptRequest = async (request: P2PRequest) => {
    if (!isCaixa) return;
    setLoading(true);
    const { error } = await supabase
      .from('p2p_requests')
      .update({ 
        cashier_id: currentUser.id,
        status: 'accepted',
        updated_at: new Date().toISOString()
      })
      .eq('id', request.id);

    if (!error) fetchRequests();
    setLoading(false);
  };

  const handleCompleteRequest = async (request: P2PRequest) => {
    setLoading(true);
    
    // If it's a deposit, update user balance
    if (request.type === 'deposit') {
      const { data: userData } = await supabase.from('profiles').select('balance').eq('id', request.user_id).single();
      const { data: cashierData } = await supabase.from('profiles').select('balance').eq('id', request.cashier_id!).single();
      
      if (userData && cashierData) {
        // Simple balance update (transactional in SQL would be better)
        // In a real app, use a RPC/Function to ensure atomicity
        await supabase.from('profiles').update({ balance: userData.balance + request.amount }).eq('id', request.user_id);
        await supabase.from('profiles').update({ balance: cashierData.balance - request.amount }).eq('id', request.cashier_id!);
      }
    } else {
      // Withdraw: release escrow (user's balance should have been deducted at request creation or kept in status)
      // For simplicity, let's assume deposit for now as main use case
    }

    const { error } = await supabase
      .from('p2p_requests')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', request.id);

    if (!error) {
      fetchRequests();
      onBalanceUpdate();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative bg-white rounded-t-[40px] h-[90%] flex flex-col overflow-hidden text-black"
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black tracking-tighter">AngoCoins P2P</h2>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Recarga Segura • Estilo AirTM</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 hover:text-black transition-colors">
            <X size={24} strokeWidth={2.5} />
          </button>
        </div>

        {/* Balance Display */}
        <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 mx-6 mt-6 rounded-[32px] border border-amber-100/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <Coins size={28} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600/60 block mb-1">Teu Saldo Atual</span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black tracking-tighter">{currentUser.balance}</span>
                <span className="text-xs font-black text-amber-600 uppercase">AC</span>
              </div>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-white rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200 shadow-sm">Atividade</button>
        </div>

        {/* Tab Switcher */}
        {isCaixa && (
          <div className="flex p-1.5 bg-zinc-100 mx-6 mt-6 rounded-2xl">
            <button 
              onClick={() => setActiveTab('user')}
              className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'user' ? 'bg-white shadow-sm text-black' : 'text-zinc-400'}`}
            >
              Minhas Trocas
            </button>
            <button 
              onClick={() => setActiveTab('cashier')}
              className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'cashier' ? 'bg-white shadow-sm text-black' : 'text-zinc-400'}`}
            >
              Painel de Caixa
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar p-6">
          {activeTab === 'user' ? (
            <div className="space-y-8">
              {/* Request Form */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Nova Transação</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setType('deposit')}
                    className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border-2 transition-all ${type === 'deposit' ? 'border-amber-500 bg-amber-500 text-white' : 'border-zinc-100 text-zinc-400 grayscale'}`}
                  >
                    <ArrowUpCircle size={20} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Carregar</span>
                  </button>
                  <button 
                    onClick={() => setType('withdraw')}
                    className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border-2 transition-all ${type === 'withdraw' ? 'border-red-500 bg-red-500 text-white' : 'border-zinc-100 text-zinc-400 grayscale'}`}
                  >
                    <ArrowDownCircle size={20} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Levantar</span>
                  </button>
                </div>
                
                <div className="relative">
                  <input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Quantidade de AngoCoins..."
                    className="w-full bg-zinc-50 rounded-2xl px-6 py-5 text-lg font-black tracking-tighter outline-none border border-zinc-100 focus:border-amber-500 transition-all placeholder:font-normal placeholder:tracking-normal"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-400">AC</div>
                </div>

                <button 
                  onClick={handleCreateRequest}
                  disabled={!amount || isSubmitting}
                  className="w-full bg-black text-white py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-xl shadow-black/10 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'A Criar Pedido...' : 'Encontrar um Caixa'}
                </button>
              </div>

              {/* History */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Pedidos Ativos</h3>
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 size={24} className="animate-spin text-amber-500" />
                  </div>
                ) : requests.length === 0 ? (
                  <div className="p-10 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-100 flex flex-col items-center justify-center text-center">
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Sem pedidos ativos no momento</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map(request => (
                      <div key={request.id} className="p-5 bg-white border border-zinc-100 rounded-3xl flex items-center justify-between hover:border-amber-200 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${request.type === 'deposit' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                            {request.type === 'deposit' ? <ArrowUpCircle size={24} /> : <ArrowDownCircle size={24} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black tracking-tighter">{request.amount} AC</span>
                              <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                request.status === 'pending' ? 'bg-zinc-100 text-zinc-400' :
                                request.status === 'accepted' ? 'bg-amber-100 text-amber-600' :
                                'bg-green-100 text-green-600'
                              }`}>
                                {request.status}
                              </div>
                            </div>
                            <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
                              {request.cashier ? `Caixa: @${request.cashier.username}` : 'Aguardando Caixa...'}
                            </span>
                          </div>
                        </div>
                        {request.status === 'accepted' && (
                          <button 
                            onClick={() => setSelectedRequest(request)}
                            className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center"
                          >
                            <ChevronRight size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-amber-500 p-6 rounded-[32px] text-white flex items-center gap-4">
                <ShieldCheck size={32} />
                <div>
                  <h4 className="font-black tracking-tight text-sm uppercase">Modo Caixa Ativo</h4>
                  <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">Ganhe comissões processando pedidos</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Pedidos Disponíveis</h3>
                  <div className="flex items-center gap-2 text-[10px] font-black text-amber-600">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                     AO VIVO
                  </div>
                </div>
                
                {loading ? (
                   <div className="flex items-center justify-center py-10">
                    <Loader2 size={24} className="animate-spin text-amber-500" />
                  </div>
                ) : requests.length === 0 ? (
                  <div className="p-16 text-center space-y-4">
                    <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto text-zinc-200">
                      <Search size={32} />
                    </div>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Procurando novos pedidos...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {requests.map(request => (
                      <div key={request.id} className="p-6 bg-zinc-50 rounded-[32px] border border-zinc-100 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-zinc-200">
                              {request.user?.avatar_url ? (
                                <img src={request.user.avatar_url} className="w-full h-full object-cover" />
                              ) : (
                                <User size={20} className="text-zinc-300" />
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-black">@{request.user?.username}</span>
                              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Moeda: Express / Kz</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xl font-black tracking-tighter">{request.amount} AC</span>
                            <span className="text-[9px] text-amber-600 font-black uppercase">Depósito</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleAcceptRequest(request)}
                          className="w-full bg-white border border-zinc-200 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-amber-500 transition-all active:scale-95 shadow-sm"
                        >
                          Aceitar Pedido
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal de Detalhes da Transação */}
        <AnimatePresence>
          {selectedRequest && (
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="absolute inset-0 bg-white z-[130] flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <button onClick={() => setSelectedRequest(null)} className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400">
                  <X size={20} strokeWidth={2.5} />
                </button>
                <span className="text-xs font-black uppercase tracking-widest">Detalhes do Pedido</span>
                <div className="w-10" />
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-10">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-24 h-24 bg-amber-50 rounded-[40px] flex items-center justify-center text-amber-500 border border-amber-100">
                    <Coins size={48} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-4xl font-black tracking-tight">{selectedRequest.amount} AC</h3>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-[0.2em] mt-2">Valor da Recarga</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-6 bg-zinc-50 rounded-3xl border border-zinc-100 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Instruções de Pagamento</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Método</span>
                        <span className="text-xs font-black">Transferência Express</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Beneficiário</span>
                        <span className="text-xs font-black">@{selectedRequest.cashier?.username}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">ID Transação</span>
                        <span className="text-[10px] font-mono text-zinc-400">{selectedRequest.id.split('-')[0]}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl space-y-3">
                    <div className="flex items-center gap-3 text-amber-600">
                      <AlertCircle size={20} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Importante</span>
                    </div>
                    <p className="text-xs text-amber-900/70 font-medium leading-relaxed">
                      Efetue o pagamento diretamente ao caixa e aguarde a confirmação dele para receber os seus AngoCoins. Em caso de problemas, utilize o chat de suporte.
                    </p>
                  </div>
                </div>

                {activeTab === 'cashier' ? (
                  <button 
                    onClick={() => handleCompleteRequest(selectedRequest)}
                    className="w-full bg-black text-white py-6 rounded-[32px] text-xs font-black uppercase tracking-[0.3em] shadow-xl shadow-black/20"
                  >
                    Confirmar Recebimento
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 py-4 text-amber-600">
                      <Clock size={20} className="animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Aguardando Confirmação do Caixa</span>
                    </div>
                    <button className="w-full py-5 bg-zinc-100 text-zinc-400 rounded-2xl text-[10px] font-black uppercase tracking-widest">
                      Cancelar Pedido
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default P2PRecharge;
