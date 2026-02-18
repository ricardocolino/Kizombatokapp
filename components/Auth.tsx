
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Mail, Lock, User, ArrowRight, Loader2, Sparkles } from 'lucide-react';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ensureProfileExists = async (userId: string, userEmail: string, chosenUsername?: string) => {
    const finalUsername = chosenUsername || userEmail.split('@')[0];
    
    // Tentamos inserir ou atualizar o perfil para garantir que a FK no 'posts' seja satisfeita
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        username: finalUsername,
        name: finalUsername,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      console.error("Erro ao criar perfil:", profileError);
      throw new Error("Não foi possível configurar o teu perfil. Tenta novamente.");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username || email.split('@')[0],
              full_name: username,
            }
          }
        });
        
        if (signUpError) throw signUpError;

        if (data.user) {
          // Criar perfil imediatamente após o registo
          await ensureProfileExists(data.user.id, email, username);
          alert('Verifica o teu e-mail para confirmar a conta! Se o e-mail estiver desativado no Supabase, já podes entrar.');
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (signInError) throw signInError;

        if (data.user) {
          // Garantir que o perfil existe mesmo em contas antigas para evitar erros de FK
          await ensureProfileExists(data.user.id, email);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro na autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-red-600/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-yellow-600/20 rounded-full blur-[120px]" />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-red-600 to-yellow-500 rounded-3xl rotate-12 mb-6 shadow-2xl">
            <Sparkles className="text-white -rotate-12" size={40} />
          </div>
          <h1 className="text-4xl font-black italic text-white uppercase tracking-tighter mb-2">
            KizombaTok
          </h1>
          <p className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-[10px]">
            {isSignUp ? 'Cria a tua conta na banda' : 'Entra na vibe de Angola'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                placeholder="Nome de Usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-red-600 outline-none transition-all"
                required={isSignUp}
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-red-600 outline-none transition-all"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="password"
              placeholder="Palavra-passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-red-600 outline-none transition-all"
              required
            />
          </div>

          {error && (
            <p className="text-red-500 text-[10px] font-bold uppercase tracking-wider text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20 px-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all active:scale-95 shadow-xl disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                {isSignUp ? 'Criar Conta' : 'Entrar Agora'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-zinc-400 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors"
          >
            {isSignUp ? 'Já tens conta? Faz Login' : 'Não tens conta? Regista-te'}
          </button>
        </div>
      </div>
      
      <p className="absolute bottom-8 text-[9px] text-zinc-600 font-bold uppercase tracking-[0.3em]">
        Feito em Angola 🇦🇴
      </p>
    </div>
  );
};

export default Auth;
