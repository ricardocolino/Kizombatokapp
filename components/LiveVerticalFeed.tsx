
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LiveStream as LiveStreamType } from '../types';
import ViewerLive from './ViewerLive';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface LiveVerticalFeedProps {
  lives: LiveStreamType[];
  initialIndex: number;
  onClose: () => void;
}

const LiveVerticalFeed: React.FC<LiveVerticalFeedProps> = ({ lives, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0); // 1 for down, -1 for up

  const handleNext = useCallback(() => {
    if (currentIndex < lives.length - 1) {
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, lives.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') handlePrev();
      if (e.key === 'ArrowDown') handleNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  const currentLive = lives[currentIndex];

  const variants = {
    enter: (direction: number) => ({
      y: direction > 0 ? 1000 : -1000,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      y: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      y: direction < 0 ? 1000 : -1000,
      opacity: 0
    })
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden">
      <div className="relative flex-1">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={currentLive.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              y: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 }
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={1}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = Math.abs(offset.y) > 50 || Math.abs(velocity.y) > 500;
              if (swipe) {
                if (offset.y < 0) {
                  handleNext();
                } else {
                  handlePrev();
                }
              }
            }}
            className="absolute inset-0"
          >
            <ViewerLive
              channelName={currentLive.channel_name}
              onClose={onClose}
              hostProfile={currentLive.profiles}
              hostId={currentLive.user_id}
            />
          </motion.div>
        </AnimatePresence>

        {/* Navigation Indicators */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-6 z-[110] pointer-events-none">
          {currentIndex > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              className="flex flex-col items-center gap-1"
            >
              <ChevronUp size={20} className="text-white animate-bounce" />
              <span className="text-[8px] font-black uppercase tracking-widest text-white">Anterior</span>
            </motion.div>
          )}
          {currentIndex < lives.length - 1 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              className="flex flex-col items-center gap-1"
            >
              <span className="text-[8px] font-black uppercase tracking-widest text-white">Próxima</span>
              <ChevronDown size={20} className="text-white animate-bounce" />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveVerticalFeed;
