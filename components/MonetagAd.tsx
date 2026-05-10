import React, { useState, useEffect } from 'react';
import { X, ExternalLink, ShieldAlert } from 'lucide-react';

interface MonetagAdProps {
  onSkip: () => void;
}

const MonetagAd: React.FC<MonetagAdProps> = ({ onSkip }) => {
  const [timeLeft, setTimeLeft] = useState(7);
  const [showInternalBrowser, setShowInternalBrowser] = useState(false);
  const canSkip = timeLeft === 0;
  const adUrl = "https://potterynaggingformerly.com/cr9zx6yb?key=403ac45601fac5c99cc670a4ef08aaf1";

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleOpenLink = () => {
    setShowInternalBrowser(true);
  };

  if (showInternalBrowser) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-bottom duration-500">
        <header className="h-16 border-b border-zinc-100 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase text-zinc-400 tracking-widest">A navegar em</span>
            <span className="text-[10px] font-medium text-black truncate max-w-[200px]">{adUrl}</span>
          </div>
          <button 
            onClick={() => setShowInternalBrowser(false)}
            className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-black active:scale-95 transition-all"
          >
            <X size={20} />
          </button>
        </header>
        <div className="flex-1 w-full bg-zinc-50 relative">
          <iframe 
            src={adUrl} 
            className="w-full h-full border-none"
            title="Navegador Interno"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
          />
        </div>
        <footer className="h-16 border-t border-zinc-100 flex items-center justify-center bg-white px-6">
           <button 
             onClick={onSkip}
             className="text-red-600 font-black uppercase text-[10px] tracking-widest"
           >
             Fechar e Voltar aos Vídeos
           </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black relative flex flex-col overflow-hidden">
      {/* Ad Content */}
      <div className="flex-1 w-full bg-zinc-900 border-none relative">
        <iframe 
          src={adUrl} 
          className="w-full h-full border-none"
          title="Publicidade"
          allow="autoplay"
        />
        
        {/* Ad Label */}
        <div className="absolute top-20 left-4 bg-black/40 backdrop-blur-sm px-3 py-1 rounded text-[8px] font-bold text-white/60 tracking-widest uppercase border border-white/5 pointer-events-none">
          Publicidade
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
        <div className="bg-black/40 backdrop-blur-md p-6 rounded-[32px] border border-white/10 shadow-2xl animate-in slide-in-from-bottom duration-500">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h3 className="text-white font-black text-sm uppercase tracking-tight">Conteúdo Patrocinado</h3>
              <p className="text-zinc-400 text-[10px] font-medium leading-tight">Visita o nosso parceiro para apoiar a banda de Angola!</p>
            </div>
          </div>
          
          <button 
            onClick={handleOpenLink}
            className="w-full h-14 bg-white text-black rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-[0_0_50px_rgba(255,255,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            Visitar Agora <ExternalLink size={16} />
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
