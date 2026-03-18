
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Loader2 } from 'lucide-react';

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
    <div className="h-full w-full bg-black flex flex-col items-center justify-center p-6 sm:p-8">
      <div className="w-full max-w-[360px] flex flex-col items-stretch">
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {isSignUp ? 'Cria a tua conta' : 'Entra agora'}
          </h2>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div className="flex flex-col">
              <input
                type="text"
                placeholder="Nome de Usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black border border-zinc-800 rounded-md py-4 px-4 text-white placeholder:text-zinc-500 focus:border-red-600 outline-none transition-all text-base"
                required={isSignUp}
              />
            </div>
          )}

          <div className="flex flex-col">
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-md py-4 px-4 text-white placeholder:text-zinc-500 focus:border-red-600 outline-none transition-all text-base"
              required
            />
          </div>

          <div className="flex flex-col">
            <input
              type="password"
              placeholder="Palavra-passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-md py-4 px-4 text-white placeholder:text-zinc-500 focus:border-red-600 outline-none transition-all text-base"
              required
            />
          </div>

          {error && (
            <div className="py-2">
              <p className="text-red-500 text-sm font-medium">
                {error}
              </p>
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black py-3 rounded-full font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                isSignUp ? 'Registar' : 'Seguinte'
              )}
            </button>
          </div>
        </form>

        <div className="mt-10 flex flex-col gap-4">
          <p className="text-zinc-500 text-sm">
            {isSignUp ? 'Já tens uma conta?' : 'Não tens uma conta?'}
          </p>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full bg-black border border-zinc-700 text-red-600 py-3 rounded-full font-bold text-base transition-all active:scale-[0.98] hover:bg-zinc-900"
          >
            {isSignUp ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
