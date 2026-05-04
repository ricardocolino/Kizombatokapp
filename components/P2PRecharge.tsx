import React, { useState, useEffect, useCallback } from 'react';
import { P2PRequest, Profile } from '../types';
import { supabase } from '../supabaseClient';
import { X, Clock, AlertCircle, ChevronRight, Loader2, ShieldCheck, User, Search, Repeat, CheckCircle2, Copy, Check, ArrowUpCircle, ArrowDownCircle, CreditCard, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface P2PRechargeProps {
  currentUser: Profile;
  onClose: () => void;
  onBalanceUpdate: () => void;
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button 
      onClick={handleCopy} 
      className={`p-2 rounded-xl transition-all ${copied ? 'bg-green-100 text-green-600' : 'bg-white/50 hover:bg-white text-zinc-400 hover:text-zinc-600 shadow-sm'}`}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
};

const P2PRecharge: React.FC<P2PRechargeProps> = ({ currentUser, onClose, onBalanceUpdate }) => {
  const [activeTab, setActiveTab] = useState<'user' | 'cashier' | 'history' | null>(null);
  const [requests, setRequests] = useState<P2PRequest[]>([]);
  const [isCaixa, setIsCaixa] = useState(false);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'deposit' | 'withdraw'>('deposit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<P2PRequest | null>(null);
  
  const EXCHANGE_RATE = 10; // 100 AC = 1 USD = 1000 KZ -> 1 AC = 10 KZ

  const checkCaixaStatus = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('is_cashier')
      .eq('id', currentUser.id)
      .single();
    setIsCaixa(!!data?.is_cashier);
  }, [currentUser.id]);

  const fetchRequests = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const selectStr = `
      *, 
      user:profiles!user_id(*), 
      cashier:profiles!cashier_id(*)
    `;
    
    let query = supabase.from('p2p_requests').select(selectStr);
    
    if (activeTab === 'user' || activeTab === null) {
      query = query.eq('user_id', currentUser.id);
    } else if (activeTab === 'cashier') {
      query = query.or(`status.eq.pending,cashier_id.eq.${currentUser.id}`);
    } else if (activeTab === 'history') {
        // Fetch all history for user (either as user or cashier)
        query = query.or(`user_id.eq.${currentUser.id},cashier_id.eq.${currentUser.id}`).eq('status', 'completed');
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) console.error("Error fetching requests:", error);
    if (data) {
      const updatedRequests = data as unknown as P2PRequest[];
      setRequests(updatedRequests);
      
      setSelectedRequest(prev => {
        if (!prev) return null;
        const matching = updatedRequests.find(r => r.id === prev.id);
        return matching || prev;
      });
    }
    if (!silent) setLoading(false);
  }, [activeTab, currentUser.id]);

  const activeRequests = requests.filter(r => r.status !== 'completed');
  const completedRequests = requests.filter(r => r.status === 'completed');

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
      .channel('p2p_realtime_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'p2p_requests' 
      }, (payload) => {
        if (!isMounted) return;
        fetchRequests(true);

        const newRecord = payload.new as { id: string };
        if (selectedRequest && newRecord.id === selectedRequest.id) {
          const syncSelected = async () => {
            const { data } = await supabase
              .from('p2p_requests')
              .select(`
                *, 
                user:profiles!user_id(*), 
                cashier:profiles!cashier_id(*)
              `)
              .eq('id', newRecord.id)
              .single();
            if (data && isMounted) {
              setSelectedRequest(data as unknown as P2PRequest);
            }
          };
          syncSelected();
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeTab, checkCaixaStatus, fetchRequests, selectedRequest]);

  const handleCreateRequest = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    
    if (type === 'withdraw' && currentUser.redeemable_balance < Number(amount)) {
      alert(`Saldo insuficiente para levantamento. Tens apenas ${currentUser.redeemable_balance} AC (${(currentUser.redeemable_balance * EXCHANGE_RATE).toLocaleString('pt-AO')} KZ) resgatáveis.`);
      return;
    }

    const activeReq = requests.find(r => r.status !== 'completed' && r.user_id === currentUser.id);
    if (activeReq) {
      alert("Já tens um pedido em curso. Conclui ou aguarda o pedido anterior.");
      setSelectedRequest(activeReq);
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.from('p2p_requests').insert({
      user_id: currentUser.id,
      amount: Number(amount),
      type: type,
      status: 'pending'
    }).select(`
      *, 
      user:profiles!user_id(*), 
      cashier:profiles!cashier_id(*)
    `).single();

    if (error) {
      console.error("Erro ao criar pedido:", error);
      alert("Erro ao criar pedido: " + error.message);
    } else {
      setAmount('');
      if (data) {
        setSelectedRequest(data as unknown as P2PRequest);
      }
      fetchRequests();
    }
    setIsSubmitting(false);
  };

  const handleAcceptRequest = async (request: P2PRequest) => {
    if (!isCaixa) return;
    setLoading(true);
    
    const { data: updatedData, error } = await supabase
      .from('p2p_requests')
      .update({ 
        cashier_id: currentUser.id,
        status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', request.id)
      .eq('status', 'pending')
      .select(`
        *, 
        user:profiles!user_id(*), 
        cashier:profiles!cashier_id(*)
      `);

    if (!error && updatedData && updatedData.length > 0) {
      setSelectedRequest(updatedData[0] as unknown as P2PRequest);
      await fetchRequests();
    } else {
      console.error("Error accepting request:", error);
      alert("Não foi possível aceitar este pedido. Verifica se já não foi aceite por outro caixa.");
    }
    setLoading(false);
  };

  const handleConfirmAction = async (requestId: string, role: 'user' | 'cashier') => {
    setLoading(true);
    const updateData = role === 'user' ? { user_confirmed: true } : { cashier_confirmed: true };
    
    const { data: updatedReq, error } = await supabase
      .from('p2p_requests')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select(`
        *, 
        user:profiles!user_id(*), 
        cashier:profiles!cashier_id(*)
      `)
      .single();

    if (!error && updatedReq) {
      setSelectedRequest(updatedReq as unknown as P2PRequest);
      fetchRequests();

      if (updatedReq.user_confirmed && updatedReq.cashier_confirmed && updatedReq.status === 'in_progress') {
        handleCompleteRequest(updatedReq as unknown as P2PRequest);
      }
    }
    setLoading(false);
  };

  const handleCompleteRequest = async (request: P2PRequest) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('complete_p2p_transaction', { 
        request_id: request.id 
      });

      if (error) {
        if (error.message.includes('insufficient balance')) {
          alert("Erro: O Caixa não tem saldo de AngoCoins suficiente!");
        } else {
          console.error("Erro RPC:", error);
          alert("Erro ao processar libertação: " + error.message);
        }
        setLoading(false);
        return;
      }

      await fetchRequests();
      onBalanceUpdate();
      
    } catch (err) {
      console.error(err);
      alert("Erro crítico no sistema de libertação.");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative bg-white h-full flex flex-col overflow-hidden text-black"
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-white relative z-20">
          <div className="flex items-center gap-4">
            {activeTab && (
              <button 
                onClick={() => setActiveTab(null)}
                className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 active:scale-90 transition-all"
              >
                <ArrowLeft size={20} strokeWidth={3} />
              </button>
            )}
            <div className="flex flex-col">
              <h2 className="text-2xl font-black tracking-tighter">AngoCoins P2P</h2>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Recarga Segura • Estilo AirTM</p>
            </div>
          </div>

          <button onClick={onClose} className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 hover:text-black transition-colors">
            <X size={24} strokeWidth={2.5} />
          </button>
        </div>

        {/* Global Balance View - Solo na parte inicial */}
        {!activeTab && (
          <div className="flex flex-col items-center py-8 bg-white border-b border-zinc-100">
              <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest mb-1">Saldo Disponível (KZ)</span>
              <span className="text-6xl font-black tracking-tighter">{(currentUser.redeemable_balance * EXCHANGE_RATE).toLocaleString('pt-AO')} <span className="text-xl text-amber-500">KZ</span></span>
          </div>
        )}

        {/* Display Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          
          <AnimatePresence mode="wait">
          {!activeTab ? (
            <motion.div 
              key="menu"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="px-6 py-6"
            >
              {/* Quick Actions Grid */}
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => {
                    setType('deposit');
                    setActiveTab('user');
                  }}
                  className="p-8 rounded-[40px] flex flex-col items-center justify-center gap-4 transition-all border bg-zinc-50 border-zinc-100 text-zinc-500 hover:border-zinc-300 hover:bg-white active:scale-95 shadow-sm"
                >
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-100">
                    <ArrowUpCircle size={32} strokeWidth={2.5} className="text-black" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-center leading-tight">Deposito<br/><span className="text-[10px] text-zinc-400 opacity-60">(Carregar)</span></span>
                </button>

                <button 
                  onClick={() => {
                    setType('withdraw');
                    setActiveTab('user');
                  }}
                  className="p-8 rounded-[40px] flex flex-col items-center justify-center gap-4 transition-all border bg-zinc-50 border-zinc-100 text-zinc-500 hover:border-zinc-300 hover:bg-white active:scale-95 shadow-sm"
                >
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-100">
                    <ArrowDownCircle size={32} strokeWidth={2.5} className="text-black" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-center leading-tight">Saque<br/><span className="text-[10px] text-zinc-400 opacity-60">(Levantar)</span></span>
                </button>

                <button 
                  onClick={() => {
                    if (isCaixa) {
                      setActiveTab('cashier');
                    } else {
                      alert("Torna-te um Caixa Oficial nas definições de faturamento do teu perfil para aceitares pagamentos! 🇦🇴🚀");
                    }
                  }}
                  className="p-8 rounded-[40px] flex flex-col items-center justify-center gap-4 transition-all border bg-zinc-50 border-zinc-100 text-zinc-500 hover:border-zinc-300 hover:bg-white active:scale-95 shadow-sm"
                >
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-100">
                    <CreditCard size={32} strokeWidth={2.5} className="text-amber-500" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-center leading-tight">Painel de<br/><span className="text-[10px] text-zinc-400 opacity-60">Operador</span></span>
                </button>

                <button 
                  onClick={() => setActiveTab('history')}
                  className="p-8 rounded-[40px] flex flex-col items-center justify-center gap-4 transition-all border bg-zinc-50 border-zinc-100 text-zinc-500 hover:border-zinc-300 hover:bg-white active:scale-95 shadow-sm"
                >
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-100">
                    <Clock size={32} strokeWidth={2.5} className="text-zinc-600" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-center leading-tight">Transações<br/><span className="text-[10px] text-zinc-400 opacity-60">Finalizadas</span></span>
                </button>
              </div>

              <div className="py-20 text-center space-y-6">
                <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto border border-zinc-100 opacity-50">
                  <Search size={32} className="text-zinc-300" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-black uppercase tracking-widest opacity-50">Escolhe uma operação</h3>
                  <p className="text-[10px] text-zinc-400 font-medium max-w-[200px] mx-auto opacity-50">Clica nos botões acima para carregar saldo, levantar lucros ou trabalhar como caixa.</p>
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'user' ? (
            <motion.div 
              key="user-tab"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="px-6 py-6 space-y-8"
            >
              {/* Saldo Sub-Header */}
              <div className="bg-zinc-50 p-8 rounded-[40px] border border-zinc-100 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{type === 'deposit' ? 'Saldo Atual de Depósito' : 'Saldo Atual para Saque'}</span>
                <div className="flex items-baseline gap-2">
                   <h3 className="text-4xl font-black tracking-tighter text-black">{type === 'deposit' ? currentUser.balance : currentUser.redeemable_balance} <span className="text-sm text-amber-500">AC</span></h3>
                </div>
              </div>

              {/* Form */}
              <div className="bg-white p-6 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
                <div className="space-y-3">
                  <label className="text-[11px] font-black uppercase tracking-widest text-zinc-400 ml-1">Quanto queres {type === 'deposit' ? 'Carregar' : 'Levantar'}?</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[20, 50, 100, 500].map((val) => (
                      <button
                        key={val}
                        onClick={() => setAmount(val.toString())}
                        className={`py-6 rounded-3xl flex flex-col items-center justify-center border transition-all ${
                          amount === val.toString() 
                            ? 'bg-black border-black text-white shadow-xl shadow-black/20 scale-[1.02]' 
                            : 'bg-zinc-50 border-zinc-100 text-zinc-600 hover:border-zinc-300 active:scale-95'
                        }`}
                      >
                        <span className="text-3xl font-black tracking-tighter">{val}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-50">AngoCoins</span>
                        <span className="text-[8px] font-black text-amber-500 mt-1 uppercase tracking-tighter">({(val * EXCHANGE_RATE).toLocaleString('pt-AO')} KZ)</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleCreateRequest}
                  disabled={!amount || isSubmitting || activeRequests.some(r => r.user_id === currentUser.id)}
                  className="w-full bg-black text-white py-6 rounded-2xl text-xs font-black uppercase tracking-[0.2em] active:scale-95 hover:bg-zinc-800 disabled:opacity-50 transition-all"
                >
                  {isSubmitting ? 'A Processar...' : activeRequests.some(r => r.user_id === currentUser.id) ? 'Já tens um pedido ativo' : 'Criar Pedido P2P'}
                </button>
              </div>

              {/* Active User Requests */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Em Curso</h3>
                {activeRequests.filter(r => r.user_id === currentUser.id).length === 0 ? (
                  <div className="py-12 text-center border-2 border-dashed border-zinc-100 rounded-[32px] opacity-30">
                    <Clock size={32} className="mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sem pedidos ativos</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeRequests.filter(r => r.user_id === currentUser.id).map(request => (
                      <button key={request.id} onClick={() => setSelectedRequest(request)} className="w-full p-6 bg-white border border-zinc-100 rounded-[32px] flex items-center justify-between hover:border-black transition-all shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${request.status === 'pending' ? 'bg-zinc-100 text-zinc-400' : 'bg-amber-100 text-amber-600'}`}>
                            {request.status === 'pending' ? <Clock size={24} /> : <AlertCircle size={24} />}
                          </div>
                          <div className="text-left">
                            <span className="text-xl font-black block">{request.amount} AC</span>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{request.status === 'pending' ? 'Buscando Caixa...' : 'Em Troca'}</span>
                          </div>
                        </div>
                        <ChevronRight className="text-zinc-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : activeTab === 'cashier' ? (
            <motion.div 
              key="cashier-tab"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="px-6 py-6 space-y-8"
            >
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Fila de Pedidos</h3>
                {activeRequests.length === 0 ? (
                  <div className="py-20 text-center border-2 border-dashed border-zinc-100 rounded-[32px] opacity-30">
                    <Search size={48} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Aguardando novos pedidos...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeRequests.map(request => (
                      <div key={request.id} className={`p-6 bg-white border rounded-[40px] space-y-6 shadow-sm transition-all ${request.cashier_id === currentUser.id ? 'border-amber-500' : 'border-zinc-100'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-50">
                              {request.user?.avatar_url ? <img src={request.user.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-zinc-300"><User size={24} /></div>}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-black">@{request.user?.username}</span>
                              <span className={`text-[9px] font-bold uppercase tracking-widest ${request.type === 'deposit' ? 'text-green-600' : 'text-amber-600'}`}>{request.type === 'deposit' ? 'Recarga via Express' : 'Saque Bancário'}</span>
                            </div>
                          </div>
                          <div className="text-right">
                             <span className="text-2xl font-black block">{request.amount} AC</span>
                             <span className="text-[10px] font-black text-amber-500 uppercase tracking-tighter">≈ {(request.amount * EXCHANGE_RATE).toLocaleString('pt-AO')} KZ</span>
                          </div>
                        </div>
                        
                        {request.status === 'pending' ? (
                          <button onClick={() => handleAcceptRequest(request)} className="w-full bg-black text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-all">Aceitar Pedido</button>
                        ) : (
                          <button onClick={() => setSelectedRequest(request)} className="w-full bg-amber-500 text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-amber-500/20">Continuar Transação</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* HISTORY TAB */
            <motion.div 
              key="history-tab"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="px-6 py-6"
            >
              <div className="space-y-6">
                <div>
                  <h3 className="text-3xl font-black tracking-tighter">Transações Concluídas</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Tudo o que foi liquidado com sucesso</p>
                </div>

                {completedRequests.length === 0 ? (
                  <div className="py-20 text-center opacity-30">
                    <CheckCircle2 size={48} className="mx-auto mb-4" />
                    <p className="text-[11px] font-black uppercase tracking-widest">Nenhuma transação concluída</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {completedRequests.map(request => {
                      const isOp = request.cashier_id === currentUser.id;
                      return (
                        <div key={request.id} className="p-6 bg-white border border-zinc-100 rounded-[32px] flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isOp ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                              <CheckCircle2 size={24} />
                            </div>
                            <div>
                               <div className="flex items-center gap-2">
                                  <span className="text-lg font-black">{request.amount} AC</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${isOp ? 'bg-amber-500 text-white' : 'bg-black text-white'}`}>
                                    {isOp ? 'Ganhos' : request.type === 'deposit' ? 'Depósito' : 'Saque'}
                                  </span>
                               </div>
                               <p className="text-[9px] text-zinc-400 font-bold uppercase">{new Date(request.updated_at || '').toLocaleDateString('pt-AO')} • Concluído</p>
                            </div>
                          </div>
                          <div className="text-right">
                             <span className="text-sm font-black text-black">{(request.amount * EXCHANGE_RATE).toLocaleString('pt-AO')} KZ</span>
                             <span className="text-xs font-bold text-zinc-300 block">✓</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
          </AnimatePresence>

        </div>

        {/* Transaction Detail View */}
        <AnimatePresence>
          {selectedRequest && (
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="absolute inset-0 bg-white z-[130] flex flex-col">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <button onClick={() => setSelectedRequest(null)} className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center"><X size={20} strokeWidth={3} /></button>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black uppercase text-zinc-400">Pedido #{selectedRequest.id.slice(0,6)}</span>
                  <span className="text-xs font-black uppercase">{selectedRequest.type === 'deposit' ? 'Recarga AngoCoins' : 'Saque de Saldo'}</span>
                </div>
                <div className="w-10" />
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-10">
                {/* Visual Status */}
                {selectedRequest.status === 'completed' ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center space-y-6">
                    <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/20"><CheckCircle2 size={64} className="text-white" /></div>
                    <div className="space-y-2">
                       <h3 className="text-3xl font-black tracking-tighter">Tudo Concluído!</h3>
                       <p className="text-sm text-zinc-500 max-w-[280px]">Os <span className="font-bold text-black">{selectedRequest.amount} AC</span> já foram processados. Obrigado pela confiança.</p>
                    </div>
                    <button onClick={() => setSelectedRequest(null)} className="w-full bg-black text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest">Fechar Detalhes</button>
                  </div>
                ) : selectedRequest.status === 'pending' ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center space-y-8 animate-pulse">
                    <Search size={64} className="text-amber-500" />
                    <div className="space-y-3">
                       <h3 className="text-2xl font-black tracking-tighter">Buscando por um Caixa...</h3>
                       <p className="text-xs text-zinc-400 font-bold uppercase">O teu pedido de {(selectedRequest.amount * EXCHANGE_RATE).toLocaleString('pt-AO')} KZ está visível para a nossa rede oficial de caixas.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-12">
                     <div className="text-center space-y-2">
                         <span className="text-[10px] font-black uppercase text-zinc-400 opacity-50">Confirmação de Valor</span>
                         <h2 className="text-6xl font-black tracking-tighter">{selectedRequest.amount} AC</h2>
                         <span className="text-sm font-black text-amber-500">{ (selectedRequest.amount * EXCHANGE_RATE).toLocaleString('pt-AO') } KZ</span>
                     </div>

                     <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-[32px] border border-zinc-100">
                        <div className="flex flex-col items-center gap-2 flex-1">
                          <div className="w-12 h-12 rounded-full overflow-hidden border bg-white">{selectedRequest.user?.avatar_url && <img src={selectedRequest.user.avatar_url} className="w-full h-full object-cover" />}</div>
                          <span className="text-[10px] font-black">@{selectedRequest.user?.username}</span>
                        </div>
                        <Repeat className="text-zinc-300" size={24} />
                        <div className="flex flex-col items-center gap-2 flex-1">
                          <div className="w-12 h-12 rounded-full overflow-hidden border bg-white">{selectedRequest.cashier?.avatar_url && <img src={selectedRequest.cashier.avatar_url} className="w-full h-full object-cover" />}</div>
                          <span className="text-[10px] font-black text-amber-600">@{selectedRequest.cashier?.username}</span>
                        </div>
                     </div>

                     {/* Action Box */}
                     <div className="space-y-6">
                        {((selectedRequest.type === 'deposit' && selectedRequest.user_id === currentUser.id) || (selectedRequest.type === 'withdraw' && selectedRequest.cashier_id === currentUser.id)) && (
                          <div className="bg-amber-50 p-6 rounded-[32px] border border-amber-100 space-y-4">
                             <div className="flex items-center justify-between"><h4 className="text-[10px] font-black uppercase text-amber-600">Dados do Destinatário</h4><ShieldCheck size={16} className="text-amber-500" /></div>
                             <div className="space-y-3">
                                {(() => {
                                  const party = selectedRequest.type === 'deposit' ? selectedRequest.cashier : selectedRequest.user;
                                  return (
                                    <>
                                      <div className="flex items-center justify-between p-4 bg-white/60 rounded-2xl border border-amber-100">
                                         <div className="overflow-hidden pr-2">
                                            <span className="text-[8px] font-bold text-amber-700/50 block">TITULAR</span>
                                            <span className="text-xs font-black uppercase truncate block">{party?.holder_name || 'NÃO DEFINIDO'}</span>
                                         </div>
                                         <CopyButton text={party?.holder_name || ''} />
                                      </div>
                                      {party?.iban && (
                                        <div className="flex items-center justify-between p-4 bg-white/60 rounded-2xl border border-amber-100">
                                         <div className="overflow-hidden pr-2">
                                            <span className="text-[8px] font-bold text-amber-700/50 block">IBAN (ANGOLA)</span>
                                            <span className="text-[11px] font-mono font-bold truncate block">{party.iban}</span>
                                         </div>
                                         <CopyButton text={party.iban} />
                                      </div>
                                      )}
                                      {party?.express_number && (
                                        <div className="flex items-center justify-between p-4 bg-white/60 rounded-2xl border border-amber-100">
                                         <div className="overflow-hidden pr-2">
                                            <span className="text-[8px] font-bold text-amber-700/50 block">MULTI-CAIXA EXPRESS</span>
                                            <span className="text-[11px] font-black truncate block">{party.express_number}</span>
                                         </div>
                                         <CopyButton text={party.express_number} />
                                      </div>
                                      )}
                                    </>
                                  );
                                })()}
                             </div>
                             <p className="text-[10px] text-amber-800 font-medium opacity-70">Envia o montante via Multicaixa Express e clica no botão de confirmação abaixo assim que terminares.</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                           <div className={`p-6 rounded-3xl border text-center space-y-2 ${selectedRequest.user_confirmed ? 'bg-green-50 border-green-100 text-green-600' : 'bg-zinc-50 border-zinc-100 text-zinc-300'}`}>
                             <div className="w-8 h-8 rounded-full bg-white mx-auto flex items-center justify-center shadow-sm">{selectedRequest.user_confirmed ? <Check size={16} /> : <User size={16} />}</div>
                             <span className="text-[8px] font-black uppercase">Usuário {selectedRequest.user_confirmed ? 'Confirmou' : 'Pendente'}</span>
                           </div>
                           <div className={`p-6 rounded-3xl border text-center space-y-2 ${selectedRequest.cashier_confirmed ? 'bg-green-50 border-green-100 text-green-600' : 'bg-zinc-50 border-zinc-100 text-zinc-300'}`}>
                             <div className="w-8 h-8 rounded-full bg-white mx-auto flex items-center justify-center shadow-sm">{selectedRequest.cashier_confirmed ? <Check size={16} /> : <ShieldCheck size={16} />}</div>
                             <span className="text-[8px] font-black uppercase">Caixa {selectedRequest.cashier_confirmed ? 'Confirmou' : 'Pendente'}</span>
                           </div>
                        </div>

                        {selectedRequest.user_id === currentUser.id ? (
                           <button onClick={() => handleConfirmAction(selectedRequest.id, 'user')} disabled={selectedRequest.user_confirmed || loading} className={`w-full py-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${selectedRequest.user_confirmed ? 'bg-green-100 text-green-600' : 'bg-black text-white shadow-xl shadow-black/20'}`}>
                              {selectedRequest.user_confirmed ? 'Confimação Enviada ✓' : 'Já Efetuei a Transferência'}
                           </button>
                        ) : (
                           <button onClick={() => handleConfirmAction(selectedRequest.id, 'cashier')} disabled={selectedRequest.cashier_confirmed || loading} className={`w-full py-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${selectedRequest.cashier_confirmed ? 'bg-green-100 text-green-600' : 'bg-amber-500 text-white shadow-xl shadow-amber-500/20'}`}>
                              {selectedRequest.cashier_confirmed ? 'Confimação Enviada ✓' : 'Validei o Pagamento'}
                           </button>
                        )}
                        
                        {selectedRequest.user_confirmed && selectedRequest.cashier_confirmed && (
                          <div className="p-6 bg-black text-white rounded-3xl flex items-center justify-center gap-3">
                             <Loader2 size={24} className="animate-spin text-amber-500" />
                             <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Líquidando P2P...</span>
                          </div>
                        )}
                     </div>
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
