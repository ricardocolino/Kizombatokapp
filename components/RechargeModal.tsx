import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Loader2, Globe, CreditCard, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Browser } from '@capacitor/browser';

interface RechargeModalProps {
  onClose: () => void;
}

const RechargeModal: React.FC<RechargeModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'select' | 'iframe'>('select');
  const [iframeUrl, setIframeUrl] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Security Warning states for Kursinha (Multicaixa)
  const [showWarning, setShowWarning] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    document.body.classList.add('recharge-open');
    return () => {
      document.body.classList.remove('recharge-open');
    };
  }, []);

  useEffect(() => {
    const initData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let authIframeUrl = 'https://angochatpayments.vercel.app';
        
        if (session && session.user) {
          const emailVal = session.user.email || '';
          const idVal = session.user.id;
          setUserEmail(emailVal);
          setUserId(idVal);

          const authParams = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=${session.expires_in}&token_type=bearer&type=recovery`;
          authIframeUrl = `${authIframeUrl}/#${authParams}`;
        }
        
        setIframeUrl(authIframeUrl);
      } catch (err) {
        console.error("Error initializing session for recharge:", err);
        setIframeUrl('https://angochatpayments.vercel.app');
      }
    };

    initData();
  }, []);

  const handleOpenKursinha = async () => {
    setShowWarning(false);
    const baseUrl = 'https://pay.kursinha.com/c/6a3a50f7a52791fedef41442';
    const finalUrl = userId 
      ? `${baseUrl}?email=${encodeURIComponent(userEmail)}&user_id=${userId}&ref=${userId}`
      : baseUrl;

    try {
      await Browser.open({ 
        url: finalUrl,
        toolbarColor: '#09090b',
        presentationStyle: 'fullscreen'
      });
    } catch (err) {
      console.error("Erro ao abrir navegador nativo para Kursinha:", err);
      window.open(finalUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[1001] bg-[#030303] flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-300 text-white">
      <header className="h-14 bg-zinc-950 border-b border-zinc-900 flex items-center px-4 shrink-0 gap-3">
        <button 
          onClick={activeTab === 'iframe' ? () => setActiveTab('select') : onClose}
          className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center text-white active:scale-90 transition-all border border-zinc-800"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-xs font-black uppercase tracking-widest text-zinc-100">
          {activeTab === 'iframe' ? t('Secure Payment') : t('Charge Coins')}
        </span>
      </header>
      
      {activeTab === 'select' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
          {/* Background Ambient Glows */}
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/10 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-900/10 rounded-full blur-[100px] pointer-events-none"></div>

          <div className="w-full max-w-sm flex flex-col items-center z-10">
            {/* Title */}
            <h2 className="text-xl font-black uppercase tracking-widest mb-2 text-center text-zinc-100 font-display">
              {t('Coins System')}
            </h2>
            <p className="text-xs text-zinc-400 text-center mb-8 leading-relaxed max-w-[280px]">
              Escolhe um dos métodos seguros abaixo para recarregar os teus Angochat Coins.
            </p>

            {/* Squares in the same row */}
            <div className="grid grid-cols-2 gap-4 w-full">
              {/* Card 1: Crypto / Credit Card (Iframe) */}
              <button 
                onClick={() => {
                  setLoading(true);
                  setActiveTab('iframe');
                }}
                className="relative overflow-hidden flex flex-col items-center justify-end p-4 bg-zinc-950 active:scale-95 border border-zinc-800 rounded-3xl transition-all text-center group h-36 shadow-lg"
              >
                <img 
                  src="https://angochat.ao/images%20(1).jpeg" 
                  alt="Criptomoedas / Cartões"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end justify-center p-3.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-white leading-tight drop-shadow">
                    Criptomoedas / Cartões
                  </span>
                </div>
              </button>

              {/* Card 2: Multicaixa Express (Kursinha Checkout) */}
              <button 
                onClick={() => setShowWarning(true)}
                className="relative overflow-hidden flex flex-col items-center justify-end p-4 bg-zinc-950 active:scale-95 border border-zinc-800 rounded-3xl transition-all text-center group h-36 shadow-lg"
              >
                <img 
                  src="https://angochat.ao/IMG_8146-770x613.jpeg" 
                  alt="Multicaixa Express"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end justify-center p-3.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-white leading-tight drop-shadow">
                    Multicaixa Express
                  </span>
                </div>
              </button>
            </div>

            {/* Shield and Secure Info footer */}
            <div className="mt-12 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
              <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
              </svg>
              <span>Pagamento Seguro Angochat</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative bg-white">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-10 text-white">
              <Loader2 className="text-purple-500 animate-spin mb-4" size={32} />
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest animate-pulse">{t('Loading')}...</span>
            </div>
          )}
          {iframeUrl && (
            <iframe 
              src={iframeUrl} 
              onLoad={() => setLoading(false)}
              className="w-full h-full border-none"
              title={t('Charge AngoCoins')}
              allow="payment; camera; microphone; geolocation; clipboard-read; clipboard-write"
              sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin allow-top-navigation allow-top-navigation-by-user-activation"
            />
          )}
        </div>
      )}

      {/* Warning Popup for Kursinha (Multicaixa) */}
      {showWarning && (
        <div className="fixed inset-0 z-[1015] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
          <div className="absolute inset-0" onClick={() => setShowWarning(false)} />
          
          <div className="relative w-full max-w-sm bg-black border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-250 p-6 flex flex-col items-center">
            
            {/* Title */}
            <h3 className="text-sm font-black uppercase tracking-widest text-white text-center mb-3 font-display">
              Atenção - Muito Importante
            </h3>

            {/* Subtitle / explanation */}
            <p className="text-xs text-zinc-400 text-center leading-relaxed mb-5">
              Para garantir que os teus <strong className="text-white">Angochat Coins</strong> sejam creditados <strong className="text-purple-400">instantaneamente</strong> na tua conta, deves usar obrigatoriamente este e-mail no checkout da Kursinha:
            </p>

            {/* Highlighted Email box */}
            <div 
              onClick={() => {
                if (userEmail) {
                  navigator.clipboard.writeText(userEmail);
                  setCopiedEmail(true);
                  setTimeout(() => setCopiedEmail(false), 2500);
                }
              }}
              className="w-full bg-zinc-900/90 hover:bg-zinc-900 border border-purple-500/30 hover:border-purple-500/60 rounded-2xl p-4 flex flex-col items-center gap-1.5 mb-5 cursor-pointer active:scale-98 transition-all select-none"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">O Teu E-mail de Perfil</span>
              <span className="text-sm font-black text-white font-mono lowercase tracking-wide break-all text-center">
                {userEmail || 'Não configurado'}
              </span>
              <span className="text-[10px] font-medium text-purple-400 mt-1">
                {copiedEmail ? 'E-mail copiado com sucesso!' : 'Clique aqui para copiar'}
              </span>
            </div>

            {/* Warning details */}
            <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-3.5 text-left mb-6">
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                <strong className="text-white">Risco de perda:</strong> Se usares um e-mail diferente, o nosso webhook automatizado não conseguirá sincronizar com o teu utilizador e não receberás as moedas automaticamente.
              </p>
            </div>

            {/* Action buttons */}
            <div className="w-full flex flex-col gap-2.5">
              <button 
                onClick={handleOpenKursinha}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3.5 px-6 rounded-full text-xs uppercase tracking-widest transition-all shadow-lg shadow-purple-950 text-center active:scale-95"
              >
                Prosseguir para Pagamento
              </button>
              <button 
                onClick={() => setShowWarning(false)}
                className="w-full bg-black hover:bg-zinc-900 text-zinc-400 hover:text-white font-bold py-3.5 px-6 rounded-full text-xs uppercase tracking-widest border border-zinc-800 transition-all text-center active:scale-95"
              >
                Cancelar e voltar
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default RechargeModal;
