import React, { useState, useEffect } from 'react';
import { X, ExternalLink, ShieldAlert, Sparkles } from 'lucide-react';

interface MonetagAdProps {
  onSkip: () => void;
}

const MonetagAd: React.FC<MonetagAdProps> = ({ onSkip }) => {
  const [timeLeft, setTimeLeft] = useState(7);
  const canSkip = timeLeft === 0;
  const adUrl = "https://potterynaggingformerly.com/cr9zx6yb?key=403ac45601fac5c99cc670a4ef08aaf1";

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleOpenLink = () => {
    try {
      // Type-safe check for mobile bridges
      const win = window as unknown as { 
        ReactNativeWebView?: { postMessage: (msg: string) => void };
        Android?: { openExternal: (url: string) => void };
      };

      // React Native WebView
      if (win.ReactNativeWebView) {
        win.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'OPEN_URL',
            url: adUrl
          })
        );
        return;
      }

      // Android bridge
      if (win.Android?.openExternal) {
        win.Android.openExternal(adUrl);
        return;
      }

      // Browser normal
      window.open(adUrl, '_blank');
    } catch {
      window.location.href = adUrl;
    }
  };

  return (
    <div className="h-full w-full bg-black relative flex flex-col overflow-hidden items-center justify-center">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-black to-zinc-900" />
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[size:40px_40px]" />
      
      {/* Ad Preview Content (Visual Placeholder since Iframe is blocked) */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        <div className="w-32 h-32 rounded-[40px] bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-600 shadow-[0_0_80px_rgba(220,38,38,0.15)] animate-pulse">
          <Sparkles size={64} strokeWidth={1} />
        </div>
        
        <div className="space-y-4 max-w-xs">
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic italic-shadow">Promo <span className="text-red-600">Banda</span></h2>
          <p className="text-zinc-400 text-sm font-light leading-relaxed">
            Consome este conteúdo e ajuda-nos a manter a vibe de Angola no topo! 🇦🇴🚀
          </p>
        </div>

        {/* Ad Label */}
        <div className="bg-white/5 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Patrocinado</span>
        </div>
      </div>

      {/* Top Banner (Overlay) */}
      <div className="absolute top-8 sm:top-12 right-4 z-[70]">
        {canSkip ? (
          <button 
            onClick={onSkip}
            className="bg-black/60 backdrop-blur-xl text-white px-6 py-3 rounded-full flex items-center gap-2 font-black uppercase text-[10px] tracking-widest border border-white/20 active:scale-95 transition-all shadow-2xl"
          >
            Pular Anúncio <X size={16} />
          </button>
        ) : (
          <div className="bg-black/60 backdrop-blur-xl text-white px-6 py-3 rounded-full font-black text-[10px] tracking-widest border border-white/10 opacity-80 flex items-center gap-2 shadow-xl">
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Vê em {timeLeft}s
          </div>
        )}
      </div>

      {/* Bottom CTA Section */}
      <div className="absolute bottom-10 left-0 w-full px-6 flex flex-col gap-4 z-[70]">
        <div className="bg-black/40 backdrop-blur-md p-8 rounded-[40px] border border-white/10 shadow-2xl animate-in slide-in-from-bottom duration-500">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-black shadow-xl">
              <ShieldAlert size={24} />
            </div>
            <div className="text-left">
              <h3 className="text-white font-black text-xs uppercase tracking-widest">Ver Oferta</h3>
              <p className="text-zinc-500 text-[9px] font-medium leading-tight">Serás redirecionado com segurança.</p>
            </div>
          </div>
          
          <button 
            onClick={handleOpenLink}
            className="w-full h-16 bg-white text-black rounded-[24px] font-black uppercase text-[12px] tracking-[0.2em] shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            Abrir Agora <ExternalLink size={18} />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {!canSkip && (
        <div className="absolute top-0 left-0 w-full h-1 bg-white/10 z-[80]">
          <div 
            className="h-full bg-red-600 transition-all duration-1000 ease-linear"
            style={{ width: `${((7 - timeLeft) / 7) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default MonetagAd;
