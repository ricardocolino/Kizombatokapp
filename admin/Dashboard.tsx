import React from 'react';

export const AdminDashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-black tracking-tight mb-2 text-center text-purple-400">
        bem vindo administrador
      </h1>
      <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">
        Angochat Admin Panel
      </p>
    </div>
  );
};

export default AdminDashboard;
