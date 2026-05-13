import React from 'react';

const NativeAdItem: React.FC = () => {
  return (
    <div className="feed-item h-full w-full flex flex-col items-center justify-center bg-black p-6 relative">
      <div className="w-full max-w-[320px] bg-zinc-900/30 rounded-[40px] border border-white/10 p-8 pt-12 flex flex-col items-center justify-center backdrop-blur-3xl shadow-2xl relative overflow-hidden">
        {/* Adsterra Native Banner Container */}
        <div id="container-588b09f3bb08aa26d07031639c332bfe" className="w-full min-h-[300px] flex items-center justify-center">
            {/* The Adsterra script will populate this container */}
            <div className="flex flex-col items-center gap-4 text-center opacity-40">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center">
                    <div className="w-8 h-8 bg-zinc-700/50 rounded-lg animate-pulse"></div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Conteúdo Patrocinado</span>
            </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-white/5 w-full flex flex-col items-center gap-3">
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-medium">Parceiro AngoChat</p>
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-800"></div>
            <div className="w-3 h-1.5 rounded-full bg-red-600/50"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-800"></div>
          </div>
        </div>
      </div>
      
      {/* Interaction Hints */}
      <div className="absolute bottom-24 left-0 w-full flex flex-col items-center gap-2 opacity-30 select-none pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce"><path d="m18 15-6-6-6 6"/></svg>
        <span className="text-[8px] uppercase tracking-widest font-black">Desliza para continuar</span>
      </div>
    </div>
  );
};

export default NativeAdItem;
