
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
    if (!walletAddress) {
      setError(t('Wallet address is mandatory'));
      return;
    }

    if (!isValidBep20Address(walletAddress)) {
      setError(t('Invalid BEP-20 address format', 'Endereço BEP-20 inválido. Deve começar com 0x e conter 40 caracteres hexadecimais.'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('Iniciando finalização do onboarding para:', userId);

      // Verify if the wallet address is already stored under another account
      const { data: existingWallet, error: walletCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('wallet_address', walletAddress.trim())
        .maybeSingle();

      if (walletCheckError) throw walletCheckError;

      if (existingWallet && existingWallet.id !== userId) {
        throw new Error(t('Wallet address already in use', 'Este endereço de carteira já está em uso por outro utilizador.'));
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
          wallet_address: walletAddress || null,
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
    { id: 4, title: t('Wallet Setup'), icon: <Wallet size={24} /> }
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
            className="space-y-6"
          >
            <div className="p-6 bg-purple-600/10 rounded-2xl border border-purple-600/20">
              <p className="text-xs text-purple-400 leading-relaxed font-medium">
                {t('Configure your wallet')}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest ml-1">{t('Destination Address')} (BEP-20)</label>
              <input 
                type="text" 
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-white focus:border-purple-600 outline-none transition-all font-mono text-sm"
              />
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest text-center px-4">
              {t('BEP20 Warning')}
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
