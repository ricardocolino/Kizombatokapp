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
      className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-[32px] rounded-t-[32px] border-t border-white/10 z-[110] p-6 pb-10"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/10">
          <Coins size={16} className="text-yellow-500" />
          <span className="text-sm font-black text-white">{balance}</span>
        </div>
        <h3 className="text-white font-black text-lg">Enviar Presente</h3>
        <button 
          onClick={onClose}
          className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 max-h-64 overflow-y-auto scrollbar-hide">
          {gifts.map((gift) => (
            <button
              key={gift.id}
              onClick={() => handleSendGift(gift)}
              disabled={sending !== null}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-90 ${sending === gift.id ? 'bg-red-600/20 scale-95' : 'hover:bg-white/5'}`}
            >
              <div className="text-3xl mb-1">{gift.icon}</div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider truncate w-full text-center">{gift.name}</span>
                <div className="flex items-center gap-1">
                  <Coins size={10} className="text-yellow-500" />
                  <span className="text-xs font-black text-white">{gift.price}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <button 
          className="text-xs font-bold text-red-500 hover:text-red-400 transition-colors"
          onClick={() => window.location.href = '/profile'} // Assumindo que há uma página de recarga no perfil
        >
          Recarregar Moedas
        </button>
      </div>
    </motion.div>
  );
};

export default GiftPicker;
