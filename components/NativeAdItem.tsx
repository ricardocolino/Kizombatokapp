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
    <div className="feed-item h-full w-full flex flex-col items-center justify-center bg-black relative">
      {/* Header Info */}
      <div className="absolute top-16 left-0 w-full px-6 flex flex-col items-center gap-2 z-10">
        <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-full backdrop-blur-md">
          <span className="text-[10px] text-zinc-400 uppercase tracking-[0.2em] font-black">Conteúdo Patrocinado</span>
        </div>
      </div>

      {/* Full Screen Ad Container */}
      <div className="w-full h-[75vh] flex items-center justify-center relative">
        <iframe
          title="Patrocinado"
          srcDoc={adHtml}
          className="w-full h-full border-none pointer-events-auto"
          sandbox="allow-scripts allow-popups allow-same-origin allow-forms"
          scrolling="no"
          loading="lazy"
        />
        
        {/* Loader/Placeholder overlay */}
        <div className="absolute inset-0 -z-10 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-800 flex items-center justify-center">
                <div className="w-8 h-8 bg-zinc-900 rounded-lg animate-pulse"></div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-700">A Carregar Anúncio</span>
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="absolute bottom-32 left-0 w-full px-6 flex flex-col items-center gap-2 z-10">
        <p className="text-[9px] text-zinc-500 uppercase tracking-[0.25em] font-black drop-shadow-md">Parceiro Oficial AngoChat</p>
      </div>
      
      {/* Interaction Hints */}
      <div className="absolute bottom-16 left-0 w-full flex flex-col items-center gap-2 opacity-50 select-none pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce text-white/40"><path d="m18 15-6-6-6 6"/></svg>
        <span className="text-[9px] uppercase tracking-[0.2em] font-black text-white/40">Desliza para continuar</span>
      </div>
    </div>
  );
};

export default NativeAdItem;
