import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Browser } from '@capacitor/browser';

interface MonetagAdProps {
  onSkip: () => void;
}

const MonetagAd: React.FC<MonetagAdProps> = ({ onSkip }) => {
  const adUrl = "https://potterynaggingformerly.com/cr9zx6yb?key=403ac45601fac5c99cc670a4ef08aaf1";
  const [hasOpened, setHasOpened] = useState(false);

  const handleOpenLink = async () => {
    try {
      await Browser.open({ 
        url: adUrl,
        toolbarColor: '#000000',
        presentationStyle: 'fullscreen'
      });
    } catch {
      console.log("Navegador nativo não disponível, tentando alternativas...");
      try {
        const win = window as unknown as { 
          ReactNativeWebView?: { postMessage: (msg: string) => void };
          Android?: { openExternal: (url: string) => void };
        };

        if (win.ReactNativeWebView) {
          win.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_URL', url: adUrl }));
          return;
        }

        if (win.Android?.openExternal) {
          win.Android.openExternal(adUrl);
          return;
        }

        window.open(adUrl, '_blank');
      } catch {
        window.location.href = adUrl;
      }
    }
  };

  useEffect(() => {
    if (!hasOpened) {
      const timer = setTimeout(() => {
        handleOpenLink();
        setHasOpened(true);
      }, 30); // 0.03s delay
      return () => clearTimeout(timer);
    }
  }, [hasOpened]);

  return (
    <div className="h-full w-full bg-black relative flex flex-col items-center justify-center">
      {/* Subtle background */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-black opacity-50" />
      
      {/* Minimal Loading State */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-white animate-spin" />
        <div className="text-center">
          <p className="text-white font-black text-[10px] uppercase tracking-[0.3em] mb-2">A carregar sugestão...</p>
          <p className="text-zinc-500 text-[8px] font-medium uppercase tracking-widest">A vibe de Angola continua já</p>
        </div>
      </div>

      {/* Manual skip always available */}
      <div className="absolute top-12 right-4 z-[70]">
        <button 
          onClick={onSkip}
          className="bg-zinc-900/80 backdrop-blur-xl text-white px-6 py-3 rounded-full flex items-center gap-2 font-black uppercase text-[10px] tracking-widest border border-white/10 active:scale-95 transition-all"
        >
          Pular <X size={16} />
        </button>
      </div>

      {/* Manual retry if link didn't open */}
      <button 
        onClick={handleOpenLink}
        className="absolute bottom-12 text-zinc-600 text-[9px] font-bold uppercase tracking-widest hover:text-white transition-colors"
      >
        Não abriu? Clica aqui.
      </button>
    </div>
  );
};

export default MonetagAd;
