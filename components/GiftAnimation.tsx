import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, Star, Heart, Flame, Gem, Crown } from 'lucide-react';

interface GiftAnimationProps {
  giftName: string;
  username: string;
  onComplete: () => void;
}

const GiftAnimation: React.FC<GiftAnimationProps> = ({ giftName, username, onComplete }) => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(onComplete, 500); // Wait for exit animation
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const getGiftIcon = () => {
    switch (giftName.toLowerCase()) {
      case 'rosa': return <motion.span initial={{ scale: 0 }} animate={{ scale: 1.5 }} transition={{ type: 'spring' }} className="text-6xl">🌹</motion.span>;
      case 'diamante': return <Gem size={80} className="text-blue-400 animate-pulse" />;
      case 'coroa': return <Crown size={100} className="text-yellow-500 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]" />;
      case 'kizomba': return <motion.span animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 1 }} className="text-7xl">💃</motion.span>;
      case 'fogo': return <Flame size={80} className="text-orange-600 animate-bounce" />;
      case 'angola': return <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-8xl">🇦🇴</motion.span>;
      default: return <Gift size={80} className="text-red-600" />;
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.5, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.5, y: -100 }}
          className="fixed inset-0 z-[400] pointer-events-none flex items-center justify-center"
        >
          <div className="relative flex flex-col items-center gap-6">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 10, ease: 'linear' }}
              className="absolute -z-10 w-64 h-64 bg-yellow-500/20 rounded-full blur-3xl"
            />
            
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-8 rounded-[40px] shadow-2xl flex flex-col items-center gap-4 border-b-4 border-b-yellow-500">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-black font-black text-xs">
                  {username[0].toUpperCase()}
                </div>
                <p className="text-sm font-black text-white uppercase tracking-widest">@{username}</p>
              </div>
              
              <div className="relative">
                {getGiftIcon()}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute -top-4 -right-4"
                >
                  <Star className="text-yellow-400 fill-yellow-400" size={24} />
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: 0.5 }}
                  className="absolute -bottom-4 -left-4"
                >
                  <Heart className="text-red-500 fill-red-500" size={24} />
                </motion.div>
              </div>
              
              <div className="text-center">
                <p className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.3em] mb-1">Presente Enviado</p>
                <h4 className="text-2xl font-black text-white italic uppercase tracking-tighter">{giftName}</h4>
              </div>
            </div>

            {/* Particle effects */}
            <div className="absolute inset-0 flex items-center justify-center overflow-visible">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0], 
                    scale: [0, 1, 0],
                    x: Math.cos(i * 30 * Math.PI / 180) * 200,
                    y: Math.sin(i * 30 * Math.PI / 180) * 200
                  }}
                  transition={{ duration: 2, delay: i * 0.1, repeat: Infinity }}
                  className="absolute w-2 h-2 bg-yellow-400 rounded-full"
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GiftAnimation;
