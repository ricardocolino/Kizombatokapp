import React, { useState, useEffect, useCallback } from 'react';
import { P2PRequest, Profile } from '../types';
import { supabase } from '../supabaseClient';
import { X, Clock, AlertCircle, ChevronRight, Loader2, ShieldCheck, User, Search, Repeat, CheckCircle2 } from 'lucide-react';
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
    const selectStr = `
      *, 
      user:profiles!user_id(*), 
      cashier:profiles!cashier_id(*, cashier_info:caixas(*))
    `;
    
    let query = supabase.from('p2p_requests').select(selectStr);
    
    if (activeTab === 'user') {
      query = query.eq('user_id', currentUser.id);
    } else {
      // Show pending requests OR requests assigned to this cashier
      query = query.or(`status.eq.pending,cashier_id.eq.${currentUser.id}`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) console.error("Error fetching requests:", error);
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
        cashier:profiles!cashier_id(*, cashier_info:caixas(*))
      `);

    if (!error && updatedData && updatedData.length > 0) {
      setSelectedRequest(updatedData[0] as unknown as P2PRequest);
      await fetchRequests();
    } else {
      console.error("Error accepting request:", error);
      alert("Não foi possível aceitar este pedido. Verifica se já não foi aceite por outro caixa ou se as regras RLS do Supabase estão configuradas.");
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
        cashier:profiles!cashier_id(*, cashier_info:caixas(*))
      `)
      .single();

    if (!error && updatedReq) {
      setSelectedRequest(updatedReq as unknown as P2PRequest);
      fetchRequests();

      // Automática: Se ambos confirmaram, libertar na hora
      if (updatedReq.user_confirmed && updatedReq.cashier_confirmed && updatedReq.status === 'in_progress') {
        handleCompleteRequest(updatedReq as unknown as P2PRequest);
      }
    }
    setLoading(false);
  };

  const handleCompleteRequest = async (request: P2PRequest) => {
    setLoading(true);
    try {
      // Chamada à função RPC que criamos no SQL
      const { error } = await supabase.rpc('complete_p2p_transaction', { 
        request_id: request.id 
      });

      if (error) {
        // Tratar erros específicos vindos do SQL (RAISE EXCEPTION)
        if (error.message.includes('insufficient balance')) {
          alert("Erro: O Caixa não tem saldo de AngoCoins suficiente!");
        } else {
          console.error("Erro RPC:", error);
          alert("Erro ao processar libertação: " + error.message);
        }
        setLoading(false);
        return;
      }

      // Sucesso
      setSelectedRequest(null);
      await fetchRequests();
      onBalanceUpdate();
      
    } catch (err) {
      console.error(err);
      alert("Erro crítico no sistema de libertação.");
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
        <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
          {/* Tab Switcher */}
          {isCaixa && (
            <div className="flex p-1.5 bg-zinc-100 mx-6 mt-6 rounded-2xl">
              <button 
                onClick={() => setActiveTab('user')}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'user' ? 'bg-white shadow-sm text-black' : 'text-zinc-400'}`}
              >
                Minhas Trocas
              </button>
              <button 
                onClick={() => setActiveTab('cashier')}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'cashier' ? 'bg-white shadow-sm text-black' : 'text-zinc-400'}`}
              >
                Painel de Caixa
              </button>
            </div>
          )}

          {activeTab === 'user' ? (
            <div className="space-y-4">
              {/* Saldo Card */}
              <div className="p-8 bg-zinc-900 mx-6 mt-6 rounded-[32px] text-white overflow-hidden relative">
                <div className="absolute -right-4 -top-4 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl" />
                <div className="relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2 block">Teu Saldo Disponível</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black tracking-tighter">{currentUser.balance}</span>
                    <span className="text-sm font-black text-amber-500">AC</span>
                  </div>
                </div>
              </div>

              {/* P2P Content */}
              <div className="px-6 space-y-8">
                {/* Request Form */}
                <div className="bg-white p-6 rounded-[32px] border border-zinc-100 shadow-sm space-y-5">
                   <div className="flex gap-2 p-1 bg-zinc-100 rounded-2xl">
                    <button 
                      onClick={() => setType('deposit')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${type === 'deposit' ? 'bg-white shadow-sm text-black' : 'text-zinc-400'}`}
                    >
                      Carregar
                    </button>
                    <button 
                      onClick={() => setType('withdraw')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${type === 'withdraw' ? 'bg-white shadow-sm text-black' : 'text-zinc-400'}`}
                    >
                      Levantar
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Quantidade</label>
                    <div className="relative">
                      <input 
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Ex: 500"
                        className="w-full bg-zinc-50 rounded-2xl px-6 py-5 text-2xl font-black tracking-tighter outline-none border border-zinc-100 focus:border-black transition-all"
                      />
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-black text-amber-600">AC</div>
                    </div>
                  </div>

                  <button 
                    onClick={handleCreateRequest}
                    disabled={!amount || isSubmitting}
                    className="w-full bg-black text-white py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'A Processar...' : 'Criar Pedido P2P'}
                  </button>
                </div>

                {/* History List */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Pedidos em Curso</h3>
                  {loading ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-amber-500" /></div>
                  ) : requests.length === 0 ? (
                    <div className="py-20 text-center opacity-30">
                      <Clock size={48} className="mx-auto mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Sem pedidos ativos</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {requests.map(request => (
                        <button 
                          key={request.id} 
                          onClick={() => setSelectedRequest(request)}
                          className="w-full p-6 bg-white border border-zinc-100 rounded-[32px] flex items-center justify-between text-left hover:border-black transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${request.status === 'pending' ? 'bg-zinc-100 text-zinc-400' : 'bg-amber-100 text-amber-600'}`}>
                              {request.status === 'pending' ? <Clock size={24} /> : <AlertCircle size={24} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-black tracking-tighter">{request.amount} AC</span>
                                <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${
                                  request.status === 'pending' ? 'bg-zinc-100 text-zinc-400' : 'bg-amber-500 text-white'
                                }`}>
                                  {request.status === 'pending' ? 'Aguardando' : 'Em Progresso'}
                                </span>
                              </div>
                              <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
                                {request.status === 'pending' ? 'À procura de um caixa...' : `Com @${request.cashier?.username}`}
                              </p>
                            </div>
                          </div>
                          <ChevronRight size={20} className="text-zinc-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* PAINEL DE CAIXA */
            <div className="px-6 py-8 space-y-8">
              <div className="bg-amber-500 p-8 rounded-[40px] text-white shadow-xl shadow-amber-500/20">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <ShieldCheck size={28} />
                  </div>
                  <div>
                    <h4 className="font-black text-lg leading-tight uppercase">Modo Operador</h4>
                    <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">Processa e Ganha Comissões</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-white/10 p-4 rounded-2xl">
                     <span className="text-[9px] font-black uppercase text-white/60 block mb-1">Hoje</span>
                     <span className="text-xl font-black">0 AC</span>
                   </div>
                   <div className="bg-white/10 p-4 rounded-2xl">
                     <span className="text-[9px] font-black uppercase text-white/60 block mb-1">Reputação</span>
                     <span className="text-xl font-black">5.0 ★</span>
                   </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Fila de Espera</h3>
                {requests.length === 0 ? (
                  <div className="py-20 text-center opacity-30">
                    <Search size={48} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Aguardando novos pedidos...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {requests.map(request => (
                      <div key={request.id} className={`p-6 bg-white border rounded-[32px] space-y-5 transition-all ${request.cashier_id === currentUser.id ? 'border-amber-500 shadow-lg shadow-amber-500/5' : 'border-zinc-100'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden border border-zinc-200">
                              {request.user?.avatar_url ? <img src={request.user.avatar_url} className="w-full h-full object-cover" /> : <User size={20} />}
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black">@{request.user?.username}</span>
                                {request.cashier_id === currentUser.id && (
                                  <span className="bg-amber-500 text-white text-[7px] font-black px-2 py-0.5 rounded-full uppercase">Meu Job</span>
                                )}
                              </div>
                              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest text-green-600">Depósito via Express</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-black tracking-tighter block">{request.amount} AC</span>
                          </div>
                        </div>
                        
                        {request.status === 'pending' ? (
                          <button 
                            onClick={() => handleAcceptRequest(request)}
                            disabled={loading}
                            className="w-full bg-black text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                          >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Aceitar e Iniciar Troca'}
                          </button>
                        ) : (
                          <button 
                            onClick={() => setSelectedRequest(request)}
                            className="w-full bg-amber-500 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                          >
                            Ir para Transação
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ECRÃ DE TRANSAÇÃO (FULLSCREEN MODAL DENTRO) */}
        <AnimatePresence>
          {selectedRequest && (
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="absolute inset-0 bg-white z-[130] flex flex-col"
            >
              {/* Header de Transação */}
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <button onClick={() => setSelectedRequest(null)} className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center">
                  <X size={20} strokeWidth={3} />
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">ID: {selectedRequest.id.slice(0,8)}</span>
                  <span className="text-xs font-black uppercase tracking-widest">Recarga AngoCoins</span>
                </div>
                <div className="w-10" />
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 no-scrollbar">
                {/* Progress Steps */}
                <div className="flex items-center justify-between px-4">
                  {[
                    { label: 'Pagar', done: true },
                    { label: 'Confirmar', done: selectedRequest.status === 'in_progress' },
                    { label: 'Libertar', done: selectedRequest.status === 'completed' }
                  ].map((step, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-2">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${step.done ? 'bg-black text-white' : 'bg-zinc-100 text-zinc-300'}`}>
                         {step.done ? '✓' : idx + 1}
                       </div>
                       <span className={`text-[8px] font-black uppercase tracking-widest ${step.done ? 'text-black' : 'text-zinc-300'}`}>{step.label}</span>
                    </div>
                  ))}
                </div>

                {/* Status-specific Content */}
                {selectedRequest.status === 'pending' ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
                    <div className="relative">
                      <div className="w-32 h-32 bg-amber-500/10 rounded-full animate-ping absolute inset-0" />
                      <div className="w-32 h-32 bg-white border-2 border-amber-500 rounded-full flex items-center justify-center relative">
                        <Search size={48} className="text-amber-500 animate-pulse" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tighter">Procurando Caixa...</h3>
                      <p className="text-xs text-zinc-400 font-bold uppercase mt-2">O teu pedido de {selectedRequest.amount} AC está na fila.</p>
                    </div>
                    <button className="px-8 py-4 bg-zinc-100 text-zinc-400 rounded-full text-[10px] font-black uppercase tracking-widest">Cancelar Pedido</button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Amount Card */}
                    <div className="p-10 bg-zinc-50 rounded-[40px] text-center space-y-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Total a Processar</span>
                       <h2 className="text-5xl font-black tracking-tighter">{selectedRequest.amount} AC</h2>
                    </div>

                    {/* Parties Info */}
                    <div className="flex items-center justify-between p-6 bg-white border border-zinc-100 rounded-3xl">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-zinc-100 overflow-hidden border">
                          {selectedRequest.user?.avatar_url && <img src={selectedRequest.user.avatar_url} className="w-full h-full object-cover" />}
                        </div>
                        <span className="text-[10px] font-black">@{selectedRequest.user?.username}</span>
                        <span className="text-[8px] text-zinc-400 uppercase font-black">Usuário</span>
                      </div>
                      <div className="h-px flex-1 bg-zinc-100 mx-4 relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white border flex items-center justify-center rounded-full">
                           <Repeat size={12} className="text-zinc-300" />
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-amber-500 overflow-hidden border border-amber-600">
                          {selectedRequest.cashier?.avatar_url && <img src={selectedRequest.cashier.avatar_url} className="w-full h-full object-cover" />}
                        </div>
                        <span className="text-[10px] font-black">@{selectedRequest.cashier?.username}</span>
                        <span className="text-[8px] text-amber-600 uppercase font-black">Caixa P2P</span>
                      </div>
                    </div>

                    {/* Interaction Section */}
                    {selectedRequest.status === 'in_progress' && (
                      <div className="space-y-6">
                        <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 text-amber-900 space-y-4">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-600">Dados do Pagamento</h4>
                           <div className="space-y-4">
                              <div className="grid grid-cols-1 gap-3">
                                <div>
                                  <span className="text-[9px] font-black uppercase text-amber-700/50 block">Titular da Conta</span>
                                  <span className="text-sm font-black uppercase">{selectedRequest.cashier?.cashier_info?.[0]?.payment_info?.holder_name || 'Aguardando...'}</span>
                                </div>
                                { selectedRequest.cashier?.cashier_info?.[0]?.payment_info?.iban && (
                                  <div>
                                    <span className="text-[9px] font-black uppercase text-amber-700/50 block">IBAN</span>
                                    <span className="text-xs font-mono font-bold">{selectedRequest.cashier.cashier_info[0].payment_info.iban}</span>
                                  </div>
                                )}
                                { selectedRequest.cashier?.cashier_info?.[0]?.payment_info?.express_number && (
                                  <div>
                                    <span className="text-[9px] font-black uppercase text-amber-700/50 block">Multicaixa Express</span>
                                    <span className="text-sm font-black">{selectedRequest.cashier.cashier_info[0].payment_info.express_number}</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-[10px] font-medium leading-relaxed opacity-80 pt-2 border-t border-amber-100">
                                Envia o valor equivalente aos {selectedRequest.amount} AC para os dados acima. O sistema garante a entrega dos coins após confirmação.
                              </p>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className={`p-6 rounded-3xl border flex flex-col items-center gap-3 ${selectedRequest.user_confirmed ? 'bg-green-50 border-green-100 text-green-600' : 'bg-zinc-50 border-zinc-100 text-zinc-400'}`}>
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                              {selectedRequest.user_confirmed ? <CheckCircle2 size={20} /> : <User size={20} />}
                            </div>
                            <span className="text-[9px] font-black uppercase text-center">{selectedRequest.user_confirmed ? 'Usuário Confirmou' : 'Usuário Pendente'}</span>
                          </div>
                          <div className={`p-6 rounded-3xl border flex flex-col items-center gap-3 ${selectedRequest.cashier_confirmed ? 'bg-green-50 border-green-100 text-green-600' : 'bg-zinc-50 border-zinc-100 text-zinc-400'}`}>
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                              {selectedRequest.cashier_confirmed ? <CheckCircle2 size={20} /> : <ShieldCheck size={20} />}
                            </div>
                            <span className="text-[9px] font-black uppercase text-center">{selectedRequest.cashier_confirmed ? 'Caixa Confirmou' : 'Caixa Pendente'}</span>
                          </div>
                        </div>

                        {/* Control Buttons - Detect role from request IDs, not activeTab */}
                        {selectedRequest.user_id === currentUser.id ? (
                          <div className="space-y-4">
                            <button 
                              onClick={() => handleConfirmAction(selectedRequest.id, 'user')}
                              disabled={selectedRequest.user_confirmed || loading}
                              className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                                selectedRequest.user_confirmed ? 'bg-green-100 text-green-600' : 'bg-black text-white shadow-xl shadow-black/20'
                              }`}
                            >
                              {selectedRequest.user_confirmed ? 'Pagamento Confirmado ✓' : 'Já Paguei (Confirmar)'}
                            </button>
                            {selectedRequest.user_confirmed && !selectedRequest.cashier_confirmed && (
                              <div className="p-4 bg-amber-50 rounded-2xl text-center border border-amber-100">
                                <p className="text-[10px] text-amber-600 font-black uppercase animate-pulse">Aguardando que o Caixa confirme o recebimento...</p>
                              </div>
                            )}
                          </div>
                        ) : selectedRequest.cashier_id === currentUser.id ? (
                          <div className="space-y-4">
                            <button 
                              onClick={() => handleConfirmAction(selectedRequest.id, 'cashier')}
                              disabled={selectedRequest.cashier_confirmed || loading}
                              className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                                selectedRequest.cashier_confirmed ? 'bg-green-100 text-green-600' : 'bg-amber-500 text-white shadow-xl shadow-amber-500/20'
                              }`}
                            >
                              {selectedRequest.cashier_confirmed ? 'Recebimento Confirmado ✓' : 'Recebi o Dinheiro (Confirmar)'}
                            </button>

                            {selectedRequest.cashier_confirmed && !selectedRequest.user_confirmed && (
                              <div className="p-4 bg-zinc-50 rounded-2xl text-center border border-zinc-100">
                                <p className="text-[10px] text-zinc-400 font-black uppercase">Aguardando confirmação do Pagamento pelo Usuário...</p>
                              </div>
                            )}

                            {selectedRequest.user_confirmed && selectedRequest.cashier_confirmed && (
                              <div className="p-6 bg-black text-white rounded-[24px] text-center space-y-2 animate-pulse">
                                <Loader2 size={24} className="animate-spin mx-auto text-amber-500" />
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Libertando AngoCoins Automáticamente...</p>
                              </div>
                            )}
                          </div>
                        ) : (
                           // In case they are neither (e.g. previewing someone else's request somehow)
                           <div className="p-4 bg-zinc-100 rounded-2xl text-center">
                             <span className="text-[10px] font-black uppercase text-zinc-400">Só podes visualizar</span>
                           </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Floating Chat/Support Bar */}
              <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex items-center justify-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Problemas?</span>
                <button className="text-[10px] font-black uppercase text-amber-600 tracking-widest underline decoration-2 underline-offset-4">Suporte AngoChat</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default P2PRecharge;
