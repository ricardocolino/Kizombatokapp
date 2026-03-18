
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { ArrowRight, Loader2 } from 'lucide-react';

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro na autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-black flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Immersive Background */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-red-900/10 rounded-full blur-[120px] animate-pulse delay-700" />

      <div className="w-full max-w-sm z-10 flex flex-col items-center">
        {/* Modern App Icon Container */}
        <div className="mb-12 relative group">
          <div className="absolute -inset-4 bg-red-600/20 rounded-[40px] blur-xl group-hover:bg-red-600/30 transition-all duration-500" />
          <div className="relative w-24 h-24 bg-zinc-950 border border-zinc-800 rounded-[32px] flex items-center justify-center shadow-2xl overflow-hidden">
            {/* Octopus Icon Placeholder - Styled like the user's image */}
            <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center p-4">
              <svg viewBox="0 0 24 24" fill="white" className="w-full h-full drop-shadow-lg">
                <path d="M12,2C8.13,2,5,5.13,5,9c0,2.38,1.19,4.47,3,5.74V17c0,0.55,0.45,1,1,1h6c0.55,0,1-0.45,1-1v-2.26 c1.81-1.27,3-3.36,3-5.74C19,5.13,15.87,2,12,2z M12,13c-2.21,0-4-1.79-4-4s1.79-4,4-4s4,1.79,4,4S14.21,13,12,13z M10,9 c0-1.1,0.9-2,2-2s2,0.9,2,2s-0.9,2-2,2S10,10.1,10,9z M12,19c-0.55,0-1,0.45-1,1v1c0,0.55,0.45,1,1,1s1-0.45,1-1v-1 C13,19.45,12.55,19,12,19z M17.29,18.29l0.71,0.71c0.39,0.39,1.02,0.39,1.41,0s0.39-1.02,0-1.41l-0.71-0.71 c-0.39-0.39-1.02-0.39-1.41,0S16.9,17.9,17.29,18.29z M21,12h1c0.55,0,1-0.45,1-1s-0.45-1-1-1h-1c-0.55,0-1,0.45-1,1 S20.45,12,21,12z M18,6.41l0.71-0.71c0.39-0.39,0.39-1.02,0-1.41s-1.02-0.39-1.41,0L16.59,5c-0.39,0.39-0.39,1.02,0,1.41 S17.61,6.8,18,6.41z M12,3c-0.55,0-1-0.45-1-1V1c0-0.55,0.45-1,1-1s1,0.45,1,1v1C13,2.55,12.55,3,12,3z M6.71,5.71L6,5 C5.61,4.61,4.98,4.61,4.59,5s-0.39,1.02,0,1.41L5.3,7.12c0.39,0.39,1.02,0.39,1.41,0S7.1,6.1,6.71,5.71z M3,12H2 c-0.55,0-1,0.45-1,1s0.45,1,1,1h1c0.55,0,1-0.45,1-1S3.55,12,3,12z M6.71,18.29c-0.39-0.39-1.02-0.39-1.41,0l-0.71,0.71 c-0.39,0.39-0.39,1.02,0,1.41s1.02,0.39,1.41,0l0.71-0.71C7.1,19.31,7.1,18.68,6.71,18.29z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="text-center mb-10 space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight">
            AngoChat
          </h1>
          <p className="text-zinc-500 text-sm font-medium">
            {isSignUp ? 'Cria a tua conta' : 'Bem-vindo de volta'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="w-full space-y-3">
          {isSignUp && (
            <div className="group">
              <input
                type="text"
                placeholder="Nome de Usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-2xl py-4 px-6 text-white placeholder:text-zinc-600 focus:bg-zinc-900 focus:border-red-600/50 outline-none transition-all"
                required={isSignUp}
              />
            </div>
          )}

          <div className="group">
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-2xl py-4 px-6 text-white placeholder:text-zinc-600 focus:bg-zinc-900 focus:border-red-600/50 outline-none transition-all"
              required
            />
          </div>

          <div className="group">
            <input
              type="password"
              placeholder="Palavra-passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-2xl py-4 px-6 text-white placeholder:text-zinc-600 focus:bg-zinc-900 focus:border-red-600/50 outline-none transition-all"
              required
            />
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl animate-in fade-in slide-in-from-top-2">
              <p className="text-red-500 text-xs font-bold text-center">
                {error}
              </p>
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-600/20 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  {isSignUp ? 'Registar' : 'Entrar'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-10">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-zinc-500 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors py-2 px-4"
          >
            {isSignUp ? 'Já tens conta? Login' : 'Não tens conta? Regista-te'}
          </button>
        </div>
      </div>
      
      <div className="absolute bottom-10 flex flex-col items-center gap-2">
        <div className="w-1 h-1 rounded-full bg-red-600" />
        <p className="text-[10px] text-zinc-700 font-bold uppercase tracking-[0.4em]">
          Angola 🇦🇴
        </p>
      </div>
    </div>
  );
};

export default Auth;
