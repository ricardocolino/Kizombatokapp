import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'motion/react';
import { X, Coins } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface Gift {
  id: string;
  name: string;
  icon: string;
  price: number;
}

interface GiftPickerProps {
  liveId: string;
  currentUser: User | null;
  onClose: () => void;
  onGiftSent?: (gift: Gift) => void;
}

const getGiftImage = (icon: string) => {
  const mapping: Record<string, string> = {
    '🌹': 'https://cdn-icons-png.flaticon.com/512/1087/1087420.png',
    '☕': 'https://cdn-icons-png.flaticon.com/512/924/924514.png',
    '❤️': 'https://cdn-icons-png.flaticon.com/512/2107/2107845.png',
    '💎': 'https://cdn-icons-png.flaticon.com/512/1071/1071985.png',
    '🚀': 'https://cdn-icons-png.flaticon.com/512/1356/1356479.png',
    '🏰': 'https://cdn-icons-png.flaticon.com/512/2509/2509748.png',
    '🦁': 'https://cdn-icons-png.flaticon.com/512/616/616412.png',
  };
  return mapping[icon] || null;
};

const GiftPicker: React.FC<GiftPickerProps> = ({ liveId, currentUser, onClose, onGiftSent }) => {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;

      const [giftsRes, profileRes] = await Promise.all([
        supabase.from('gift_types').select('*').order('price', { ascending: true }),
        supabase.from('profiles').select('balance').eq('id', currentUser.id).single()
      ]);

      if (giftsRes.data) setGifts(giftsRes.data);
      if (profileRes.data) setBalance(profileRes.data.balance || 0);
      setLoading(false);
    };

    fetchData();
  }, [currentUser]);

  const handleSendGift = async (gift: Gift) => {
    if (!currentUser || sending) return;

    if (balance < gift.price) {
      alert('Saldo insuficiente!');
      return;
    }

    setSending(gift.id);
    try {
      const { error } = await supabase.rpc('send_live_gift', {
        p_live_id: liveId,
        p_gift_type_id: gift.id,
        p_sender_id: currentUser.id
      });

      if (error) throw error;

      setBalance(prev => prev - gift.price);
      if (onGiftSent) onGiftSent(gift);
      
      // Feedback visual opcional antes de fechar ou permitir outro
      setTimeout(() => setSending(null), 500);
    } catch (error: unknown) {
      console.error('Error sending gift:', error);
      const message = error instanceof Error ? error.message : 'Erro ao enviar presente';
      alert(message);
      setSending(null);
    }
  };

  return (
    <motion.div 
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.1)] z-[110] p-6 pb-12 text-black"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 bg-amber-50 rounded-full px-3 py-1.5 border border-amber-100">
          <Coins size={16} className="text-amber-500" />
          <span className="text-sm font-black text-amber-700">{balance}</span>
        </div>
        <h3 className="font-black text-lg">Enviar Presente</h3>
        <button 
          onClick={onClose}
          className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 hover:text-black transition-colors"
        >
          <X size={20} strokeWidth={2.5} />
        </button>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 max-h-72 overflow-y-auto no-scrollbar">
          {gifts.map((gift) => {
            const giftImg = getGiftImage(gift.icon);
            return (
              <button
                key={gift.id}
                onClick={() => handleSendGift(gift)}
                disabled={sending !== null}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-90 ${sending === gift.id ? 'bg-amber-50 scale-95' : 'hover:bg-zinc-50'}`}
              >
                <div className="w-12 h-12 flex items-center justify-center mb-1">
                  {giftImg ? (
                    <img src={giftImg} alt={gift.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="text-3xl">{gift.icon}</div>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider truncate w-full text-center">{gift.name}</span>
                  <div className="flex items-center gap-1">
                    <Coins size={10} className="text-amber-500" />
                    <span className="text-[11px] font-black">{gift.price}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-4">
        <button 
          className="w-full py-4 bg-zinc-900 text-white rounded-full text-xs font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95"
          onClick={() => window.location.href = '/profile'}
        >
          Recarregar Moedas
        </button>
        <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">
          AngoChat • Apoio ao Criador
        </p>
      </div>
    </motion.div>
  );
};

export default GiftPicker;
