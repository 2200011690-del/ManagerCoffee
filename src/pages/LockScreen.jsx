import { useState } from 'react';
import { Delete, Coffee, Building2 } from 'lucide-react';
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
    <div className="fixed inset-0 z-[100] flex" style={{ background: '#0F172A' }}>
      {/* Left decorative panel */}
      <div className="hidden lg:flex flex-col justify-between w-96 bg-primary-600 p-12">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Coffee size={24} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-xl leading-tight">Manager Coffee</p>
              <p className="text-white/60 text-sm">POS System</p>
            </div>
          </div>
          <h2 className="text-white font-bold text-3xl leading-tight mb-4">
            Quản lý quán cà phê<br />thông minh hơn
          </h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Hệ thống POS chuyên nghiệp giúp bạn quản lý bán hàng, sơ đồ bàn và kho hàng một cách hiệu quả.
          </p>
        </div>
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <Building2 size={12} />
          Manager Coffee © 2026
        </div>
      </div>

      {/* Right: PIN Pad */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-xs">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 justify-center mb-8">
            <div className="w-11 h-11 rounded-xl bg-primary-600 flex items-center justify-center">
              <Coffee size={22} className="text-white" />
            </div>
            <p className="text-white font-bold text-xl">Manager Coffee</p>
          </div>

          <h3 className="text-white font-bold text-2xl text-center mb-1">Xin chào! 👋</h3>
          <p className="text-slate-400 text-sm text-center mb-8">Nhập mã PIN để đăng nhập</p>

          {/* PIN dots */}
          <div className={`flex gap-4 justify-center mb-2 ${shake ? 'animate-bounce' : ''}`}
            style={shake ? { animation: 'shake 0.5s ease' } : {}}>
            {[0,1,2,3].map(i => (
              <div key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  i < pin.length
                    ? 'border-primary-400 bg-primary-500 scale-125'
                    : 'border-slate-600'
                }`}
              />
            ))}
          </div>

          {/* Error */}
          <div className={`h-6 mb-5 transition-all duration-200 ${pinError ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-red-400 text-xs text-center font-medium">{pinError || ' '}</p>
          </div>

          {/* Number Pad */}
          <div className="space-y-2.5">
            {PAD_KEYS.map((row, ri) => (
              <div key={ri} className="grid grid-cols-3 gap-2.5">
                {row.map(key => (
                  <button
                    key={key}
                    onClick={() => handleKey(key)}
                    className={`min-h-[60px] rounded-xl font-bold text-xl transition-all duration-150 select-none active:scale-95 ${
                      key === '✓'
                        ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg'
                        : key === '⌫'
                        ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        : 'bg-slate-800 text-white hover:bg-slate-700'
                    }`}
                    aria-label={key === '⌫' ? 'Xóa' : key === '✓' ? 'Xác nhận' : key}
                  >
                    {key === '⌫' ? <Delete size={20} className="mx-auto" /> : key}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <p className="text-slate-600 text-xs text-center mt-7">
            Admin: 1111 · Nhân viên: 2222
          </p>
        </div>
      </div>

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
