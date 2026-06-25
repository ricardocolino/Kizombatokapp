import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import AdminAnalytics from './Analytics';
import AdminUsersManager from './UsersManager';
import { Shield, Activity, LogOut, LayoutDashboard, Users } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [activeAdminTab, setActiveAdminTab] = useState<'analytics' | 'users'>('analytics');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white flex flex-col overflow-y-auto">
      {/* Topbar Admin */}
      <header className="sticky top-0 z-50 bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600 rounded-xl shadow-lg shadow-purple-600/30">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              Angochat Admin
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">
                Superuser
              </span>
            </h1>
            <p className="text-xs text-zinc-400 font-mono">200ricardocolino@gmail.com</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 border border-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800/80 bg-zinc-900/30 p-4 shrink-0">
          <div className="text-[11px] font-mono uppercase text-zinc-500 px-3 mb-2 font-bold tracking-wider">
            Módulos
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveAdminTab('analytics')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeAdminTab === 'analytics'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20 font-bold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4 shrink-0" />
              Visão Geral e Métricas
            </button>
            <button
              onClick={() => setActiveAdminTab('users')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeAdminTab === 'users'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-bold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              Gestão de Usuários
            </button>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="mb-6 pb-4 border-b border-zinc-800/60">
            <h2 className="text-2xl font-black text-purple-400">bem vindo administrador</h2>
            <p className="text-xs text-zinc-400 font-mono mt-1">Selecione os módulos no menu lateral para gerir a plataforma.</p>
          </div>

          {activeAdminTab === 'analytics' && <AdminAnalytics />}
          {activeAdminTab === 'users' && <AdminUsersManager />}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
