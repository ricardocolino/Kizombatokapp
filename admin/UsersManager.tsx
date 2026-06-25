import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Users, Search, ShieldAlert, DollarSign, Ban, CheckCircle, 
  Loader2, AlertTriangle, RefreshCw, Edit3, UserCheck, ExternalLink
} from 'lucide-react';

interface UserProfile {
  id: string;
  username: string;
  name: string;
  avatar_url: string;
  balance: number;
  is_banned?: boolean;
  created_at?: string;
}

export const AdminUsersManager: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingBalanceUser, setEditingBalanceUser] = useState<UserProfile | null>(null);
  const [newBalanceValue, setNewBalanceValue] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('username', { ascending: true })
        .limit(100);

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar utilizadores:', err);
      setNotice('Erro ao carregar lista de utilizadores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleBan = async (user: UserProfile) => {
    const targetStatus = !user.is_banned;
    const confirmMsg = targetStatus 
      ? `Tem a certeza que deseja BLOQUEAR o utilizador @${user.username}? Ele perderá acesso ao Angochat.`
      : `Deseja DESBLOQUEAR o utilizador @${user.username}?`;

    if (!window.confirm(confirmMsg)) return;

    setActionLoading(user.id);
    try {
      // Tenta usar a função RPC segura primeiro
      const { error: rpcError } = await supabase.rpc('admin_toggle_ban_user', {
        target_user_id: user.id,
        ban_status: targetStatus
      });

      if (rpcError) {
        // Fallback direto
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ is_banned: targetStatus })
          .eq('id', user.id);

        if (updateError) throw updateError;
      }

      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_banned: targetStatus } : u));
      setNotice(`Utilizador @${user.username} foi ${targetStatus ? 'bloqueado' : 'desbloqueado'} com sucesso.`);
    } catch (err: any) {
      console.error('Erro ao alterar banimento:', err);
      alert('Não foi possível alterar o status de bloqueio. Verifique as permissões SQL.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBalanceUser) return;

    const val = Number(newBalanceValue);
    if (isNaN(val)) return alert('Valor de saldo inválido.');

    setActionLoading(editingBalanceUser.id);
    try {
      const { error: rpcError } = await supabase.rpc('admin_update_user_balance', {
        target_user_id: editingBalanceUser.id,
        new_balance: val
      });

      if (rpcError) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ balance: val })
          .eq('id', editingBalanceUser.id);

        if (updateError) throw updateError;
      }

      setUsers(prev => prev.map(u => u.id === editingBalanceUser.id ? { ...u, balance: val } : u));
      setNotice(`Saldo de @${editingBalanceUser.username} atualizado para ${val.toLocaleString('pt-AO')} Kz.`);
      setEditingBalanceUser(null);
    } catch (err: any) {
      console.error('Erro ao atualizar saldo:', err);
      alert('Erro ao atualizar saldo. Execute o script admin_users_manager.sql no Supabase.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300 text-white">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Users className="w-7 h-7 text-blue-500" />
            Gestão de Usuários
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Pesquise, altere saldos e gerencie acessos e bloqueios de contas
          </p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recarregar Lista
        </button>
      </div>

      {notice && (
        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl flex items-center justify-between text-blue-300 text-sm">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline text-blue-400">Fechar</button>
        </div>
      )}

      {/* Barra de Pesquisa */}
      <div className="relative">
        <Search className="w-5 h-5 text-zinc-500 absolute left-4 top-3.5" />
        <input
          type="text"
          placeholder="Pesquisar utilizador por @username ou nome..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-all text-sm font-medium"
        />
      </div>

      {/* Lista de Utilizadores */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <span className="text-zinc-500 text-sm font-mono animate-pulse">Carregando contas...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 text-zinc-500">
          Nenhum utilizador encontrado para "{searchQuery}".
        </div>
      ) : (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 text-xs uppercase font-mono tracking-wider">
                  <th className="p-4">Utilizador</th>
                  <th className="p-4">Saldo (Kz)</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações de Gestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-sm">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-zinc-800/30 transition-all">
                    <td className="p-4 flex items-center gap-3">
                      <img 
                        src={user.avatar_url || `https://api.dicebear.com/7.x/avatars/svg?seed=${user.username}`}
                        alt={user.username}
                        className="w-10 h-10 rounded-full object-cover bg-zinc-800 border border-zinc-700 shrink-0"
                      />
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {user.name || user.username}
                          {user.is_banned && (
                            <span className="px-1.5 py-0.2 bg-red-500/20 text-red-400 text-[10px] rounded font-mono uppercase">
                              Banido
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono">@{user.username}</div>
                      </div>
                    </td>

                    <td className="p-4 font-mono font-bold text-emerald-400">
                      {(Number(user.balance) || 0).toLocaleString('pt-AO')} Kz
                    </td>

                    <td className="p-4">
                      {user.is_banned ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          <Ban className="w-3.5 h-3.5" /> Bloqueado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle className="w-3.5 h-3.5" /> Ativo
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditingBalanceUser(user);
                          setNewBalanceValue(String(user.balance || 0));
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium border border-zinc-700 transition-all active:scale-95"
                      >
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        Alterar Saldo
                      </button>

                      <button
                        onClick={() => handleToggleBan(user)}
                        disabled={actionLoading === user.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all active:scale-95 ${
                          user.is_banned
                            ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30'
                            : 'bg-red-600/20 hover:bg-red-600/30 text-red-300 border-red-500/30'
                        }`}
                      >
                        {actionLoading === user.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : user.is_banned ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" /> Desbloquear
                          </>
                        ) : (
                          <>
                            <Ban className="w-3.5 h-3.5" /> Bloquear
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Editar Saldo */}
      {editingBalanceUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-white mb-1 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Ajustar Saldo da Conta
            </h3>
            <p className="text-xs text-zinc-400 mb-6 font-mono">
              Utilizador: <span className="text-white font-bold">@{editingBalanceUser.username}</span>
            </p>

            <form onSubmit={handleSaveBalance} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-2 font-bold">
                  Novo Saldo em Kwanzas (Kz)
                </label>
                <input
                  type="number"
                  step="any"
                  value={newBalanceValue}
                  onChange={e => setNewBalanceValue(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono font-bold focus:outline-none focus:border-emerald-500 text-lg"
                  placeholder="Ex: 5000"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingBalanceUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === editingBalanceUser.id}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
                >
                  {actionLoading === editingBalanceUser.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Guardar Saldo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsersManager;
