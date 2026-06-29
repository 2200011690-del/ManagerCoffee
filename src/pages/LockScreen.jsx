import { useState } from 'react';
import { Delete, Coffee, Building2, Store, UserPlus, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const PAD_KEYS = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['⌫','0','✓'],
];

export default function LockScreen() {
  const { login, loginAdmin, pinError, setPinError, isLoading } = useAuth();
  const demoAdminEmail = 'admin@espresso-lab.vn';
  const demoAdminPassword = 'admin123456';
  const showDemoCredentials = import.meta.env.DEV;
  const [storeCode, setStoreCode] = useState(() => localStorage.getItem('manager_coffee_store_code') || '');
  const [isSelectingStore, setIsSelectingStore] = useState(!storeCode);
  const [tempStoreCode, setTempStoreCode] = useState(storeCode);
  const [storeError, setStoreError] = useState('');
  
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  // Authentication Mode: PIN (staff) vs Email/Password (Admin)
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Giao diện đăng ký cửa hàng mới
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({ storeName: '', storeCode: '', adminName: '', adminEmail: '', adminPassword: '' });
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  const handleStoreSubmit = (e) => {
    e.preventDefault();
    if (!tempStoreCode.trim()) {
      setStoreError('Vui lòng nhập Mã cửa hàng');
      return;
    }
    const cleanCode = tempStoreCode.trim().toLowerCase();
    setStoreCode(cleanCode);
    localStorage.setItem('manager_coffee_store_code', cleanCode);
    setIsSelectingStore(false);
    setPinError('');
    setStoreError('');
  };

  const handleKey = async (key) => {
    if (isLoading) return;
    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
      if (pinError) setPinError('');
      return;
    }
    if (key === '✓') {
      if (pin.length < 4) return;
      const ok = await login(storeCode, pin);
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
      setTimeout(async () => {
        const ok = await login(storeCode, next);
        if (!ok) {
          setShake(true);
          setTimeout(() => setShake(false), 600);
          setPin('');
        }
      }, 200);
    }
  };

  const handleAdminLoginSubmit = async (e) => {
    e.preventDefault();
    setPinError('');
    if (!adminEmail.trim() || !adminPassword.trim()) {
      setPinError('Vui lòng điền đầy đủ Email và Mật khẩu.');
      return;
    }
    const ok = await loginAdmin(storeCode, adminEmail.trim(), adminPassword.trim());
    if (!ok) {
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');
    
    const { storeName, storeCode: code, adminName, adminEmail, adminPassword } = regForm;
    if (!storeName || !code || !adminName || !adminEmail || !adminPassword) {
      setRegError('Vui lòng điền đầy đủ tất cả các trường.');
      return;
    }

    if (adminPassword.length < 6) {
      setRegError('Mật khẩu Admin phải tối thiểu 6 ký tự.');
      return;
    }

    const codeRegex = /^[a-z0-9-]+$/;
    if (!codeRegex.test(code)) {
      setRegError('Mã cửa hàng viết liền không dấu, chỉ dùng chữ thường, số và dấu gạch nối (-).');
      return;
    }

    setRegLoading(true);
    try {
      await api.post('/auth/register-store', regForm);
      setRegSuccess('Đăng ký cửa hàng thành công! Vui lòng đăng nhập bằng tài khoản Admin mới.');
      setStoreCode(code);
      setTempStoreCode(code);
      localStorage.setItem('manager_coffee_store_code', code);
      setTimeout(() => {
        setShowRegister(false);
        setIsSelectingStore(false);
        setIsAdminMode(true);
        setAdminEmail(adminEmail);
        setRegSuccess('');
        setRegForm({ storeName: '', storeCode: '', adminName: '', adminEmail: '', adminPassword: '' });
      }, 2000);
    } catch (err) {
      setRegError(err.response?.data?.error || 'Đã xảy ra lỗi khi tạo cửa hàng.');
    } finally {
      setRegLoading(false);
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
              <p className="text-white/60 text-sm">SaaS POS System</p>
            </div>
          </div>
          <h2 className="text-white font-bold text-3xl leading-tight mb-4">
            Giải pháp bán hàng<br />đa chi nhánh thông minh
          </h2>
          <p className="text-white/70 text-sm leading-relaxed mb-6">
            Hệ thống POS đa phân quyền phục vụ quản lý đơn hàng, bàn ăn và kho nguyên liệu realtime dành riêng cho mô hình F&B.
          </p>
          {showDemoCredentials && (
            <div className="bg-white/10 rounded-xl p-4 border border-white/10">
              <p className="text-white font-semibold text-sm mb-1 flex items-center gap-1.5">
                <Store size={15} /> Dùng thử Hệ thống:
              </p>
              <p className="text-white/80 text-xs leading-relaxed">
                Nhập mã quán mặc định: <span className="font-bold text-yellow-300">espresso-lab</span><br/>
                Admin demo: <span className="font-bold text-yellow-300">{demoAdminEmail}</span> / <span className="font-bold text-yellow-300">{demoAdminPassword}</span><br/>
                Mã PIN Nhân viên: <span className="font-bold text-yellow-300">2222</span>
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <Building2 size={12} />
          Manager Coffee © 2026
        </div>
      </div>

      {/* Right: Interaction Area */}
      <div className="flex-1 flex items-center justify-center px-6 overflow-y-auto">
        <div className="w-full max-w-xs py-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 justify-center mb-8">
            <div className="w-11 h-11 rounded-xl bg-primary-600 flex items-center justify-center">
              <Coffee size={22} className="text-white" />
            </div>
            <p className="text-white font-bold text-xl">Manager Coffee</p>
          </div>

          {isSelectingStore ? (
            /* --- Form chọn cửa hàng --- */
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-white font-bold text-2xl mb-1">Đăng nhập hệ thống</h3>
                <p className="text-slate-400 text-sm">Nhập Mã cửa hàng để bắt đầu</p>
              </div>

              <form onSubmit={handleStoreSubmit} className="space-y-4">
                <div>
                  <label htmlFor="storeCodeInput" className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Mã cửa hàng</label>
                  <input
                    id="storeCodeInput"
                    type="text"
                    value={tempStoreCode}
                    onChange={(e) => setTempStoreCode(e.target.value)}
                    placeholder="Ví dụ: espresso-lab"
                    className="w-full min-h-[44px] bg-slate-800 text-white border border-slate-700 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  />
                  {storeError && (
                    <p className="text-red-400 text-xs mt-1.5 font-medium">{storeError}</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[44px] bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95"
                >
                  Tiếp tục
                </button>
              </form>

              <div className="divider border-slate-800 my-6" />

              <div className="text-center space-y-3">
                <button
                  onClick={() => setShowRegister(true)}
                  className="text-primary-400 hover:text-primary-300 font-semibold text-sm flex items-center gap-1.5 justify-center mx-auto"
                >
                  <UserPlus size={16} /> Tạo cửa hàng mới (Free)
                </button>
              </div>
            </div>
          ) : (
            /* --- Vùng Đăng nhập --- */
            <div>
              {isAdminMode ? (
                /* --- Đăng nhập Admin bằng Email/Password --- */
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-white font-bold text-2xl mb-1">Đăng nhập Admin</h3>
                    <div className="flex items-center gap-1.5 justify-center text-sm text-slate-400">
                      <span>Cửa hàng: <strong className="text-white">{storeCode}</strong></span>
                      <button onClick={() => setIsSelectingStore(true)} className="text-primary-400 hover:underline text-xs">
                        (Đổi quán)
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="adminEmailInput" className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Email Quản trị</label>
                      <input
                        id="adminEmailInput"
                        type="email"
                        required
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder={showDemoCredentials ? demoAdminEmail : 'admin@yourstore.vn'}
                        className="w-full min-h-[44px] bg-slate-800 text-white border border-slate-700 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label htmlFor="adminPasswordInput" className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Mật khẩu</label>
                      <input
                        id="adminPasswordInput"
                        type="password"
                        required
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder={showDemoCredentials ? demoAdminPassword : 'Nhập mật khẩu quản trị'}
                        className="w-full min-h-[44px] bg-slate-800 text-white border border-slate-700 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                      />
                    </div>

                    {pinError && (
                      <p className="text-red-400 text-xs text-center font-medium">{pinError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full min-h-[44px] bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 disabled:opacity-50"
                    >
                      {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </button>
                  </form>

                  <button
                    onClick={() => {
                      setIsAdminMode(false);
                      setPinError('');
                    }}
                    className="w-full text-center text-primary-400 hover:text-primary-300 font-semibold text-sm hover:underline block pt-2"
                  >
                    Quay lại Đăng nhập Nhân viên (PIN)
                  </button>
                </div>
              ) : (
                /* --- Bàn phím nhập mã PIN (Nhân viên) --- */
                <div>
                  <div className="text-center mb-6">
                    <h3 className="text-white font-bold text-2xl mb-1">Nhập mã PIN</h3>
                    <div className="flex items-center gap-1.5 justify-center text-sm text-slate-400">
                      <span>Cửa hàng: <strong className="text-white">{storeCode}</strong></span>
                      <button
                        onClick={() => setIsSelectingStore(true)}
                        className="text-primary-400 hover:underline text-xs"
                      >
                        (Đổi quán)
                      </button>
                    </div>
                  </div>

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

                  {/* Error display */}
                  <div className={`h-6 mb-4 transition-all duration-200 ${pinError ? 'opacity-100' : 'opacity-0'}`}>
                    <p className="text-red-400 text-xs text-center font-medium">{pinError || ' '}</p>
                  </div>

                  {/* Pad or Loader */}
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-4 bg-slate-900/50 rounded-2xl p-6 border border-slate-800">
                      <div className="relative">
                        <div className="w-14 h-14 rounded-full border-4 border-slate-800 border-t-primary-500 animate-spin" />
                        <Coffee className="w-6 h-6 text-primary-400 absolute inset-0 m-auto animate-pulse" />
                      </div>
                      <p className="text-white text-sm font-semibold animate-pulse">Đang kiểm tra thông tin...</p>
                    </div>
                  ) : (
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
                  )}

                  <button
                    onClick={() => {
                      setIsAdminMode(true);
                      setPinError('');
                      setPin('');
                    }}
                    className="w-full mt-6 text-center text-primary-400 hover:text-primary-300 font-semibold text-sm hover:underline block"
                  >
                    Đăng nhập Admin (Email/Mật khẩu)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- Modal đăng ký cửa hàng --- */}
      {showRegister && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
              <button
                onClick={() => { setShowRegister(false); setRegError(''); }}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <h3 className="text-white font-bold text-lg">Đăng ký cửa hàng mới</h3>
            </div>
            
            <form onSubmit={handleRegisterSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">Tên quán của bạn</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Highlands Coffee"
                  value={regForm.storeName}
                  onChange={(e) => setRegForm({ ...regForm, storeName: e.target.value })}
                  className="w-full min-h-[38px] bg-slate-800 text-white border border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">Mã viết tắt (Store Code)</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: highlands-coffee (viết liền)"
                  value={regForm.storeCode}
                  onChange={(e) => setRegForm({ ...regForm, storeCode: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  className="w-full min-h-[38px] bg-slate-800 text-white border border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">Tên quản trị viên (Admin Name)</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Anh Phúc"
                  value={regForm.adminName}
                  onChange={(e) => setRegForm({ ...regForm, adminName: e.target.value })}
                  className="w-full min-h-[38px] bg-slate-800 text-white border border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">Email quản trị viên *</label>
                <input
                  type="email"
                  required
                  placeholder="email@example.com"
                  value={regForm.adminEmail}
                  onChange={(e) => setRegForm({ ...regForm, adminEmail: e.target.value })}
                  className="w-full min-h-[38px] bg-slate-800 text-white border border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">Mật khẩu Admin *</label>
                <input
                  type="password"
                  required
                  placeholder="Tối thiểu 6 ký tự"
                  value={regForm.adminPassword}
                  onChange={(e) => setRegForm({ ...regForm, adminPassword: e.target.value })}
                  className="w-full min-h-[38px] bg-slate-800 text-white border border-slate-700 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {regError && (
                <div className="text-red-400 text-xs font-medium bg-red-950/40 p-2.5 rounded-lg border border-red-900/50">
                  ⚠️ {regError}
                </div>
              )}

              {regSuccess && (
                <div className="text-green-400 text-xs font-medium bg-green-950/40 p-2.5 rounded-lg border border-green-900/50">
                  ✓ {regSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={regLoading}
                className="w-full min-h-[44px] bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-bold text-sm transition-all shadow-lg disabled:opacity-50"
              >
                {regLoading ? 'Đang tạo cửa hàng...' : 'Hoàn tất Đăng ký'}
              </button>
            </form>
          </div>
        </div>
      )}

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
