
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { uploadToR2 } from '../services/uploadService';
import { Loader2, Camera, Check, ChevronRight, ChevronLeft, Wallet, Globe, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OnboardingProps {
  userId: string;
  userEmail: string;
  onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ userId, userEmail, onComplete }) => {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [username, setUsername] = useState(userEmail.split('@')[0]);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [iban, setIban] = useState('');
  const [country, setCountry] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        
        if (data && !fetchError) {
          if (data.name) setName(data.name);
          if (data.username) setUsername(data.username);
          if (data.avatar_url) setAvatarUrl(data.avatar_url);
          if (data.wallet_address) setWalletAddress(data.wallet_address);
          if (data.iban) setIban(data.iban);
          if (data.country) setCountry(data.country);
        }
      } catch (err) {
        console.error('Error fetching profile during onboarding:', err);
      }
    };
    fetchProfileData();
  }, [userId]);

  const isValidBep20Address = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
  };

  const nextStep = async () => {
    setError(null);
    if (step === 1) {
      if (name && name.trim().length > 20) {
        setError(t('Name too long', 'Nome muito longo (máximo 20 caracteres)'));
        return;
      }
      if (!username) {
        setError(t('Username is required'));
        return;
      }
      if (username.length < 3) {
        setError(t('Username too short'));
        return;
      }
      if (!country) {
        setError(t('Country is required', 'Por favor, selecione o seu país.'));
        return;
      }
      
      setLoading(true);
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.toLowerCase().trim())
          .maybeSingle();

        if (fetchError) throw fetchError;
        
        if (data && data.id !== userId) {
          setError(t('Username already in use'));
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Error checking username:', err);
      } finally {
        setLoading(false);
      }
    }
    setStep(prev => prev + 1);
  };
  const prevStep = () => setStep(prev => prev - 1);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError(t('Photo too heavy'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const publicUrl = await uploadToR2(file, 'avatars', fileName);
      setAvatarUrl(publicUrl);
    } catch {
      setError(t('Error uploading photo'));
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    const trimmedWallet = walletAddress.trim();
    const trimmedIban = iban.trim();

    if (trimmedWallet) {
      if (!isValidBep20Address(trimmedWallet)) {
        setError(t('Invalid BEP-20 address format', 'Endereço BEP-20 inválido. Deve começar com 0x e conter 40 caracteres hexadecimais.'));
        return;
      }
    }

    if (trimmedIban) {
      const cleanIban = trimmedIban.replace(/\s+/g, '').toUpperCase();
      if (!/^AO\d{23}$/.test(cleanIban)) {
        setError('IBAN inválido! Apenas IBANs de Angola 🇦🇴 são permitidos (deve começar com AO e ter 25 caracteres).');
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      console.log('Iniciando finalização do onboarding para:', userId);

      if (trimmedWallet) {
        // Verify if the wallet address is already stored under another account
        const { data: existingWallet, error: walletCheckError } = await supabase
          .from('profiles')
          .select('id')
          .eq('wallet_address', trimmedWallet)
          .maybeSingle();

        if (walletCheckError) throw walletCheckError;

        if (existingWallet && existingWallet.id !== userId) {
          throw new Error(t('Wallet address already in use', 'Este endereço de carteira já está em uso por outro utilizador.'));
        }
      }
      
      // Check username one last time
      const { data: userWithUsername } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase().trim())
        .maybeSingle();

      if (userWithUsername && userWithUsername.id !== userId) {
        throw new Error(t('Username already in use'));
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          name: name || username,
          username: username.toLowerCase().trim(),
          avatar_url: avatarUrl || null,
          wallet_address: country !== 'Angola' ? (trimmedWallet || null) : null,
          iban: country === 'Angola' ? (iban.trim() || null) : null,
          country: country,
          onboarding_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Erro retornado pelo Supabase:', updateError);
        throw new Error(updateError.message);
      }
      
      onComplete();
    } catch (err: unknown) {
      console.error('Catch triggered:', err);
      let errorMessage = t('Oops, something went wrong');
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { id: 1, title: t('Profile Setup'), icon: <User size={24} /> },
    { id: 2, title: t('Avatar Setup'), icon: <Camera size={24} /> },
    { id: 3, title: t('Language Selection'), icon: <Globe size={24} /> },
    { id: 4, title: 'Recebimento', icon: <Wallet size={24} /> }
  ];

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">{t('What is your name?')}</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 20))}
                placeholder={t('Name')}
                maxLength={20}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-white focus:border-purple-600 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">{t('Choose a username')}</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, '').slice(0, 20))}
                placeholder={t('Username')}
                maxLength={20}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-white focus:border-purple-600 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">{t('Select your country', 'Seleciona o teu país')}</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-white focus:border-purple-600 outline-none transition-all"
              >
                <option value="">{t('Choose a country...', 'Escolhe um país...')}</option>
                <option value="Angola">Angola 🇦🇴</option>
                <option value="Portugal">Portugal 🇵🇹</option>
                <option value="Brasil">Brasil 🇧🇷</option>
                <option value="Moçambique">Moçambique 🇲🇿</option>
                <option value="Cabo Verde">Cabo Verde 🇨🇻</option>
                <option value="São Tomé e Príncipe">São Tomé e Príncipe 🇸🇹</option>
                <option value="Guiné-Bissau">Guiné-Bissau 🇬🇼</option>
                <option value="Outro">{t('Other', 'Outro')}</option>
              </select>
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col items-center gap-8 py-4"
          >
            <p className="text-center text-zinc-400 text-sm">{t('Select an avatar')}</p>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="relative group cursor-pointer"
            >
              <div className="w-32 h-32 rounded-full overflow-hidden p-1 bg-zinc-800 ring-4 ring-purple-600/20">
                <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden border-2 border-zinc-800">
                  {avatarUrl ? (
                    <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="text-4xl font-black text-zinc-700 uppercase">{username[0]}</span>
                  )}
                </div>
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="text-white" size={32} />
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleAvatarUpload} 
              accept="image/*" 
              className="hidden" 
            />
            {loading && <Loader2 className="animate-spin text-purple-600" />}
          </motion.div>
        );
      case 3:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3"
          >
            <p className="text-center text-zinc-400 text-sm mb-6">{t('Select your language')}</p>
            {[
              { code: 'en', name: t('English') },
              { code: 'pt', name: t('Portuguese') },
              { code: 'fr', name: t('French') },
              { code: 'es', name: t('Spanish') }
            ].map((lang) => (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all ${
                  i18n.language === lang.code 
                    ? 'bg-purple-600 border-purple-500 text-white shadow-xl shadow-purple-600/20' 
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                <span className="font-bold">{lang.name}</span>
                {i18n.language === lang.code && <Check size={18} />}
              </button>
            ))}
          </motion.div>
        );
      case 4:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div className="p-4 bg-purple-600/10 rounded-2xl border border-purple-600/20">
              <p className="text-xs text-purple-400 leading-relaxed font-medium text-center">
                Configura os teus métodos de levantamento <span className="text-zinc-400 font-bold">(Opcional)</span>
              </p>
            </div>
            
            <div className="space-y-4">
              {country !== 'Angola' ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest ml-1 flex items-center justify-between">
                    <span>Carteira USDT (BEP-20)</span>
                    <span className="text-purple-400 font-bold text-[9px]">OPCIONAL</span>
                  </label>
                  <input 
                    type="text" 
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-white focus:border-purple-600 outline-none transition-all font-mono text-xs"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest ml-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">Transferência Bancária (IBAN) <span title="Angola">🇦🇴</span></span>
                    <span className="text-purple-400 font-bold text-[9px]">OPCIONAL</span>
                  </label>
                  <input 
                    type="text" 
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="AO06 0000 0000 0000 0000 0000 0"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-white focus:border-purple-600 outline-none transition-all font-mono uppercase text-xs"
                  />
                  <p className="text-[9px] text-zinc-500 ml-1">Apenas contas bancárias de Angola 🇦🇴</p>
                </div>
              )}
            </div>

            <p className="text-[9px] text-zinc-500 uppercase tracking-wider text-center px-2">
              Poderás alterar ou configurar isto mais tarde na aba de Perfil.
            </p>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex flex-col text-white pb-safe">
      <div className="flex-1 overflow-y-auto px-6 pt-12 pb-8">
        <header className="mb-12 text-center">
          <p className="text-zinc-500 text-sm font-medium">
            {t('Setup your profile')}
          </p>
        </header>

        <div className="max-w-md mx-auto">
          <div className="flex justify-between mb-8 px-2">
            {steps.map((s) => (
              <div 
                key={s.id}
                className={`h-1 flex-1 mx-1 rounded-full transition-all duration-500 ${
                  s.id <= step ? 'bg-purple-600' : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {renderStep()}
          </AnimatePresence>

          {error && (
            <div className="mt-6 p-4 bg-red-600/10 border border-red-600/20 rounded-xl">
              <p className="text-red-500 text-xs font-bold text-center">{error}</p>
            </div>
          )}
        </div>
      </div>

      <footer className="p-6 bg-black border-t border-zinc-900 flex gap-4">
        {step > 1 && (
          <button 
            onClick={prevStep}
            disabled={loading}
            className="h-14 px-6 bg-zinc-900 text-white rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <button 
          onClick={step === 4 ? handleFinish : nextStep}
          disabled={loading || (step === 1 && !username)}
          className="flex-1 h-14 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              {step === 4 ? t('Finish Setup') : t('Next')}
              {step < 4 && <ChevronRight size={18} />}
            </>
          )}
        </button>
      </footer>
    </div>
  );
};

export default Onboarding;
