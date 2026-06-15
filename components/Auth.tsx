
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { Loader2, Mail, Smartphone, Download } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const Auth: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Phone Auth State
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [useOtp, setUseOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [showWebPrompt, setShowWebPrompt] = useState(!Capacitor.isNativePlatform());

  const handleOpenAppWeb = () => {
    const appScheme = 'com.kizombatok.angolavibe://open';
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      window.location.href = 'intent://open#Intent;scheme=com.kizombatok.angolavibe;package=com.kizombatok.angolavibe;end';
    } else {
      window.location.href = appScheme;
    }
  };

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
      
      const isNative = Capacitor.isNativePlatform();
      const redirectUrl = isNative 
        ? 'https://www.angochat.ao/auth-callback.html' 
        : `${window.location.origin}/auth-callback.html`;

      const { data, error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (googleError) throw googleError;

      if (data?.url) {
        if (isNative) {
          console.log(">>> [Auth.tsx] URL do OAuth obtida com sucesso. Abrindo Browser nativo:", data.url);
          await Browser.open({ url: data.url });
        } else {
          console.log(">>> [Auth.tsx] URL do OAuth obtida com sucesso. Abrindo popup na Web:", data.url);
          // Abrir popup de autenticação com o Google
          const authWindow = window.open(
            data.url,
            'google_oauth_popup',
            'width=600,height=700'
          );

          if (!authWindow) {
            setError('O popup foi bloqueado pelo teu navegador. Por favor, ativa os popups para fazeres login com o Google.');
          }
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

  const ensureProfileExists = async (userId: string, userEmailOrPhone: string, chosenUsername?: string) => {
    let finalUsername = chosenUsername;
    if (!finalUsername) {
      if (userEmailOrPhone && userEmailOrPhone.includes('@')) {
        finalUsername = userEmailOrPhone.split('@')[0];
      } else if (userEmailOrPhone) {
        // dynamic username for phone
        finalUsername = 'angu_' + userEmailOrPhone.replace(/[^0-9]/g, '').slice(-6);
      } else {
        finalUsername = `user_${userId.slice(0, 5)}`;
      }
    }
    
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
      if (authMethod === 'email') {
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
      } else {
        // Phone Authentication logic
        let normalizedPhone = phone.trim();
        
        // Se for um número de Angola simples (9 dígitos e começa com 9), anexa o prefixo +244 automaticamente
        if (/^[9][0-9]{8}$/.test(normalizedPhone)) {
          normalizedPhone = '+244' + normalizedPhone;
        } else if (normalizedPhone && !normalizedPhone.startsWith('+')) {
          normalizedPhone = '+' + normalizedPhone;
        }

        if (!normalizedPhone) {
          throw new Error('Por favor, introduz o teu número de telemóvel.');
        }

        if (useOtp) {
          if (otpSent) {
            // Confirm OTP code
            if (!otpCode) {
              throw new Error('Por favor, introduz o código que recebeste por SMS.');
            }
            const { data, error: otpVerifyError } = await supabase.auth.verifyOtp({
              phone: normalizedPhone,
              token: otpCode,
              type: 'sms'
            });
            if (otpVerifyError) throw otpVerifyError;

            if (data.user) {
              await ensureProfileExists(data.user.id, normalizedPhone, username);
            }
          } else {
            // Send OTP Code via SMS
            const { error: otpSendError } = await supabase.auth.signInWithOtp({
              phone: normalizedPhone,
            });
            if (otpSendError) throw otpSendError;
            setOtpSent(true);
            alert('Enviamos um código de verificação para o teu telemóvel por SMS.');
          }
        } else {
          // Password Authentication for Phone
          if (isSignUp) {
            const { data, error: phoneSignUpError } = await supabase.auth.signUp({
              phone: normalizedPhone,
              password: password,
              options: {
                data: {
                  username: username || normalizedPhone.replace('+', ''),
                  full_name: username,
                }
              }
            });
            if (phoneSignUpError) throw phoneSignUpError;

            if (data.user) {
              await ensureProfileExists(data.user.id, normalizedPhone, username);
              alert('Conta criada com sucesso! Já podes entrar.');
            }
          } else {
            const { data, error: phoneSignInError } = await supabase.auth.signInWithPassword({
              phone: normalizedPhone,
              password: password,
            });
            if (phoneSignInError) throw phoneSignInError;

            if (data.user) {
              await ensureProfileExists(data.user.id, normalizedPhone);
            }
          }
        }
      }
    } catch (err: unknown) {
      console.error('>>> [Auth.tsx] Erro de autenticação:', err);
      setError(err instanceof Error ? err.message : 'Ocorreu um erro na autenticação. Por favor verifica os dados ou se o serviço de SMS está configurado no teu Supabase.');
    } finally {
      setLoading(false);
    }
  };

  if (showWebPrompt) {
    return (
      <div className="h-full w-full bg-black flex flex-col items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-[360px] flex flex-col items-center text-center">
          <div className="mb-8">
            <span className="text-2xl font-extrabold text-white tracking-tighter lowercase">angochat<span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-600"></span></span>
          </div>
          
          <h2 className="text-2xl font-bold text-white tracking-tight leading-snug mb-4">
            Abrir na App Angochat?
          </h2>
          
          <p className="text-sm text-zinc-400 font-medium leading-relaxed mb-8">
            Para a melhor experiência com transmissões ao vivo estáveis, maior qualidade de reels e carregamentos rápidos, abre a nossa App oficial.
          </p>
          
          <div className="w-full space-y-3 mb-8">
            <button
              onClick={handleOpenAppWeb}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-full font-bold text-base transition-all active:scale-[0.98] shadow-lg shadow-purple-600/25"
            >
              Abrir na App
            </button>

            <a
              href="/angochat.apk"
              download="angochat.apk"
              className="w-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white py-4 rounded-full font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              onClick={() => alert('A iniciar o download do ficheiro de instalação APK (com.kizombatok.angolavibe). Aguarda um momento...')}
            >
              <Download size={18} />
              Baixar APK
            </a>
            
            <button
              onClick={() => {
                setShowWebPrompt(false);
                window.dispatchEvent(new CustomEvent('navigate-to-home'));
              }}
              className="w-full bg-black hover:bg-zinc-950 text-zinc-400 hover:text-white py-3.5 rounded-full font-semibold text-base border border-zinc-800 transition-all active:scale-[0.98]"
            >
              Continuar no navegador
            </button>
          </div>
          
          <div className="text-[11px] font-mono text-zinc-600 uppercase tracking-widest bg-zinc-950/50 py-1.5 px-3 rounded-full border border-zinc-900 leading-none">
            ID: com.kizombatok.angolavibe
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black flex flex-col items-center justify-center p-6 sm:p-8">
      <div className="w-full max-w-[360px] flex flex-col items-stretch">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl font-extrabold text-white tracking-tighter lowercase">angochat<span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-600"></span></span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {isSignUp ? t('Create your account') : t('Sign in now')}
          </h2>
        </div>

        {/* Authentication Methods Selector Tabs */}
        <div className="flex bg-zinc-950 p-1 rounded-lg mb-6 border border-zinc-800/80">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('email');
              setError(null);
            }}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-2 ${
              authMethod === 'email'
                ? 'bg-zinc-900 text-white border border-zinc-800 shadow-xl'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Mail size={14} />
            E-mail
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('phone');
              setError(null);
            }}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-2 ${
              authMethod === 'phone'
                ? 'bg-zinc-900 text-white border border-zinc-800 shadow-xl'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Smartphone size={14} />
            {t('Phone', 'Telemóvel')}
          </button>
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

          {authMethod === 'email' ? (
            <>
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
            </>
          ) : (
            <>
              <div className="flex flex-col">
                <input
                  type="tel"
                  placeholder={t('Phone Number', 'Nº de Telemóvel (ex: +244 9xx...)')}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (otpSent) setOtpSent(false); // reset se mudar o numero
                  }}
                  disabled={otpSent}
                  className="w-full bg-black border border-zinc-800 rounded-md py-4 px-4 text-white placeholder:text-zinc-500 focus:border-purple-600 outline-none transition-all text-base disabled:opacity-50"
                  required
                />
                <span className="text-[10px] text-zinc-500 mt-1.5 px-1 leading-normal">
                  Podes usar o indicativo <strong className="text-zinc-400">+244</strong> ou digitar apenas o número (ex: 9xxxxxxxx).
                </span>
              </div>

              {/* Password or SMS OTP Toggle for Phone Auth */}
              <div className="flex justify-end px-1 text-xs py-1">
                <button
                  type="button"
                  onClick={() => {
                    setUseOtp(!useOtp);
                    setOtpSent(false);
                    setOtpCode('');
                    setError(null);
                  }}
                  className="text-purple-500 hover:text-purple-400 font-bold transition-all"
                >
                  {useOtp ? 'Usar Palavra-passe' : 'Entrar com Código SMS (OTP)'}
                </button>
              </div>

              {useOtp ? (
                otpSent && (
                  <div className="flex flex-col">
                    <input
                      type="text"
                      placeholder={t('SMS Code', 'Código SMS recebido')}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full bg-black border border-zinc-800 rounded-md py-4 px-4 text-white placeholder:text-zinc-500 focus:border-purple-600 outline-none transition-all text-base font-mono text-center tracking-widest text-lg"
                      required
                    />
                  </div>
                )
              ) : (
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
              )}
            </>
          )}

          {error && (
            <div className="py-2">
              <p className="text-red-500 text-sm font-medium leading-relaxed">
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
                authMethod === 'phone' && useOtp && !otpSent ? (
                  'Enviar Código SMS'
                ) : authMethod === 'phone' && useOtp && otpSent ? (
                  'Verificar Código'
                ) : (
                  isSignUp ? t('Sign up') : t('Next')
                )
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
            onClick={() => {
              setIsSignUp(!isSignUp);
              setOtpSent(false);
              setOtpCode('');
              setError(null);
            }}
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
