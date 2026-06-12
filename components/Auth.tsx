
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Loader2 } from 'lucide-react';

const Auth: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleOAuthMessage = async (event: MessageEvent) => {
      // Validate origin to be safe
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setLoading(true);
        try {
          console.log(">>> [Auth.tsx] Sucesso no OAuth do Google detetado!");
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            console.log(">>> [Auth.tsx] Sessão recarregada de localStorage com sucesso para:", session.user.email);
          }
        } catch (err) {
          console.error(">>> [Auth.tsx] Erro ao carregar sessão após OAuth:", err);
        } finally {
          setLoading(false);
        }
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log(">>> [Auth.tsx] Iniciando fluxo de autenticação com Google via Supabase OAuth...");
      const { data, error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth-callback.html`,
          skipBrowserRedirect: true,
        },
      });

      if (googleError) throw googleError;

      if (data?.url) {
        console.log(">>> [Auth.tsx] URL do OAuth obtida com sucesso. Abrindo popup:", data.url);
        // Abrir popup de autenticação com o Google
        const authWindow = window.open(
          data.url,
          'google_oauth_popup',
          'width=600,height=700'
        );

        if (!authWindow) {
          setError('O popup foi bloqueado pelo teu navegador. Por favor, ativa os popups para fazeres login com o Google.');
        }
      } else {
        throw new Error('Não foi possível obter o URL de login da rede Google.');
      }
    } catch (err: unknown) {
      console.error('>>> [Auth.tsx] Erro no Google Auth:', err);
      setError(err instanceof Error ? err.message : 'Erro ao ligar com o Google');
    } finally {
      setLoading(false);
    }
  };

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
            {isSignUp ? t('Create your account') : t('Sign in now')}
          </h2>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div className="flex flex-col">
              <input
                type="text"
                placeholder={t('Username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black border border-zinc-800 rounded-md py-4 px-4 text-white placeholder:text-zinc-500 focus:border-purple-600 outline-none transition-all text-base"
                required={isSignUp}
              />
            </div>
          )}

          <div className="flex flex-col">
            <input
              type="email"
              placeholder={t('Email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-md py-4 px-4 text-white placeholder:text-zinc-500 focus:border-purple-600 outline-none transition-all text-base"
              required
            />
          </div>

          <div className="flex flex-col">
            <input
              type="password"
              placeholder={t('Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded-md py-4 px-4 text-white placeholder:text-zinc-500 focus:border-purple-600 outline-none transition-all text-base"
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
                isSignUp ? t('Sign up') : t('Next')
              )}
            </button>
          </div>
        </form>

        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-zinc-800"></div>
          <span className="px-3 text-zinc-500 text-xs uppercase tracking-wider select-none">ou</span>
          <div className="flex-1 h-px bg-zinc-800"></div>
        </div>

        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          type="button"
          className="w-full bg-zinc-900 hover:bg-zinc-800/80 text-white py-3.5 rounded-full font-bold text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98] border border-zinc-800 disabled:opacity-50 shadow-md"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          {isSignUp ? 'Registar com o Google' : 'Entrar com o Google'}
        </button>

        <div className="mt-10 flex flex-col gap-4">
          <p className="text-zinc-500 text-sm">
            {isSignUp ? t('Already have an account?') : t('Dont have an account?')}
          </p>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full bg-black border border-zinc-700 text-purple-600 py-3 rounded-full font-bold text-base transition-all active:scale-[0.98] hover:bg-zinc-900"
          >
            {isSignUp ? t('Sign in') : t('Create account')}
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-zinc-500 text-[11px] leading-relaxed">
            Ao continuar, concordas com os nossos{' '}
            <a href="https://www.angochat.ao/terms.html" target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline hover:text-zinc-200 transition-colors">
              Termos de Serviço
            </a>{' '}
            e{' '}
            <a href="https://www.angochat.ao/privacy.html" target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline hover:text-zinc-200 transition-colors">
              Política de Privacidade
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
