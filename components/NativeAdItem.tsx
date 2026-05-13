import React from 'react';

const NativeAdItem: React.FC = () => {
  // We use an iframe to isolate the ad script and container
  // This allows multiple ad units to work independently in a scrolling feed
  const adHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { 
          margin: 0; 
          padding: 0; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          background: transparent;
          overflow: hidden;
          height: 100vh;
          width: 100vw;
        }
        #container-588b09f3bb08aa26d07031639c332bfe {
          width: 100%;
          display: flex;
          justify-content: center;
        }
      </style>
    </head>
    <body>
      <div id="container-588b09f3bb08aa26d07031639c332bfe"></div>
      <script async="async" data-cfasync="false" src="https://potterynaggingformerly.com/588b09f3bb08aa26d07031639c332bfe/invoke.js"></script>
    </body>
    </html>
  `;

  return (
    <div className="feed-item h-full w-full flex flex-col items-center justify-center bg-black p-4 sm:p-6 relative">
      <div className="w-full max-w-[340px] bg-zinc-900/40 rounded-[40px] border border-white/10 p-6 sm:p-8 pt-10 sm:pt-14 flex flex-col items-center justify-center backdrop-blur-3xl shadow-2xl relative overflow-hidden">
        
        {/* Adsterra Native Banner Container - Isolated in Iframe */}
        <div className="w-full min-h-[320px] flex items-center justify-center relative bg-white/5 rounded-2xl overflow-hidden">
            <iframe
              title="Patrocinado"
              srcDoc={adHtml}
              className="w-full h-full border-none pointer-events-auto"
              sandbox="allow-scripts allow-popups allow-same-origin allow-forms"
              scrolling="no"
              loading="lazy"
            />
            
            {/* Fallback/Loader subtle text */}
            <div className="absolute inset-0 -z-10 flex flex-col items-center justify-center gap-4 text-center opacity-20">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center">
                    <div className="w-6 h-6 bg-zinc-700/50 rounded-lg animate-pulse"></div>
                </div>
                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-500">A Carregar...</span>
            </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-white/5 w-full flex flex-col items-center gap-3">
          <div className="bg-red-600/10 px-3 py-1 rounded-full border border-red-600/20">
            <span className="text-[9px] text-red-500 uppercase tracking-[0.2em] font-black">Conteúdo Patrocinado</span>
          </div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-medium">Parceiro Oficial AngoChat</p>
        </div>
      </div>
      
      {/* Interaction Hints */}
      <div className="absolute bottom-24 left-0 w-full flex flex-col items-center gap-2 opacity-30 select-none pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce text-white"><path d="m18 15-6-6-6 6"/></svg>
        <span className="text-[8px] uppercase tracking-widest font-black text-white">Desliza para continuar</span>
      </div>
    </div>
  );
};

export default NativeAdItem;
