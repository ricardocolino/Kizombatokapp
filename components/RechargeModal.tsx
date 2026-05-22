import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface RechargeModalProps {
  onClose: () => void;
}

const RechargeModal: React.FC<RechargeModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [iframeUrl, setIframeUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initIframe = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let baseUrl = 'https://angochatpayments.vercel.app';
        
        if (session) {
          const authParams = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=${session.expires_in}&token_type=bearer&type=recovery`;
          baseUrl = `${baseUrl}/#${authParams}`;
        }
        
        setIframeUrl(baseUrl);
      } catch (err) {
        console.error("Error getting session for recharge:", err);
        setIframeUrl('https://angochatpayments.vercel.app');
      }
    };

    initIframe();
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-500 text-black">
      <header className="h-14 bg-white border-b border-zinc-100 flex items-center px-4 shrink-0 gap-3">
        <button 
          onClick={onClose}
          className="w-9 h-9 rounded-lg bg-zinc-50 flex items-center justify-center text-black active:scale-90 transition-all border border-zinc-100"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-xs font-black uppercase tracking-widest text-zinc-950">{t('Secure Payment')}</span>
        <button 
          onClick={onClose}
          className="ml-auto p-2 text-zinc-400 hover:text-black transition-colors"
        >
          <X size={20} />
        </button>
      </header>
      
      <div className="flex-1 relative bg-white">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 text-black">
            <Loader2 className="text-zinc-900 animate-spin mb-4" size={32} />
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest animate-pulse">{t('Loading')}...</span>
          </div>
        )}
        {iframeUrl && (
          <iframe 
            src={iframeUrl} 
            onLoad={() => setLoading(false)}
            className="w-full h-full border-none"
            title={t('Charge AngoCoins')}
            allow="payment; camera; microphone; geolocation; clipboard-read; clipboard-write text-black"
            sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin allow-top-navigation allow-top-navigation-by-user-activation"
          />
        )}
      </div>
    </div>
  );
};

export default RechargeModal;
