import { useState } from 'react';
import { Delete, Coffee } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PAD_KEYS = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['⌫','0','✓'],
];

export default function LockScreen() {
  const { login, pinError, setPinError } = useAuth();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  const handleKey = (key) => {
    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
      if (pinError) setPinError('');
      return;
    }
    if (key === '✓') {
      if (pin.length < 4) return;
      const ok = login(pin);
      if (!ok) {
        setShake(true);
        setTimeout(() => setShake(false), 600);
        setPin('');
      }
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      // Auto-submit after short delay to show last dot
      setTimeout(() => {
        const ok = login(next);
        if (!ok) {
          setShake(true);
          setTimeout(() => setShake(false), 600);
          setPin('');
        }
      }, 200);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #2C1B14 0%, #1A0F0A 60%, #0D0805 100%)' }}>

      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #A76D42 0%, transparent 70%)' }} />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #C8956C 0%, transparent 70%)' }} />
      </div>

      <div className="relative flex flex-col items-center w-full max-w-xs px-6">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
            <Coffee size={28} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-white font-bold text-2xl leading-tight">Manager</h1>
            <p className="text-white/40 text-sm font-medium tracking-widest">COFFEE POS</p>
          </div>
        </div>

        <p className="text-white/60 text-sm mb-6 text-center">Nhập mã PIN để đăng nhập</p>

        {/* PIN dots */}
        <div className={`flex gap-4 mb-2 ${shake ? 'animate-bounce' : ''}`}
          style={shake ? { animation: 'shake 0.5s ease' } : {}}>
          {[0,1,2,3].map(i => (
            <div key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                i < pin.length
                  ? 'border-coffee-accent scale-125'
                  : 'border-white/30'
              }`}
              style={i < pin.length ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
            />
          ))}
        </div>

        {/* Error message */}
        <div className={`h-6 mb-4 transition-all duration-200 ${pinError ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-red-400 text-xs text-center font-medium">{pinError || ' '}</p>
        </div>

        {/* Number Pad */}
        <div className="w-full space-y-3">
          {PAD_KEYS.map((row, ri) => (
            <div key={ri} className="grid grid-cols-3 gap-3">
              {row.map(key => (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  className={`min-h-[64px] rounded-2xl font-bold text-2xl transition-all duration-150 select-none
                    active:scale-95 ${
                    key === '✓'
                      ? 'text-white shadow-lg hover:opacity-90'
                      : key === '⌫'
                      ? 'bg-white/10 text-white/70 hover:bg-white/20'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  style={key === '✓' ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
                  aria-label={key === '⌫' ? 'Xóa' : key === '✓' ? 'Xác nhận' : key}
                >
                  {key === '⌫' ? <Delete size={22} className="mx-auto" /> : key}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Hint */}
        <p className="text-white/20 text-xs mt-8 text-center">
          Admin: 1111 · Nhân viên: 2222
        </p>
      </div>

      {/* CSS shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
