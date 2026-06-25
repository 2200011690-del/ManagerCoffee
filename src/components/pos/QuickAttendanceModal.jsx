import { useState, useEffect } from 'react';
import { X, Delete, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { api } from '../../api';

export default function QuickAttendanceModal({ onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null); // { action, employeeName, totalHours, time }

  const handleKeyPress = (num) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (result) return;
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, result]);

  // Submit automatically when 4 digits are entered
  useEffect(() => {
    if (pin.length === 4) {
      submitPin();
    }
  }, [pin]);

  const submitPin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await api.post('/attendance/quick', { pin });
      const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      setResult({
        action: res.action,
        employeeName: res.employeeName,
        totalHours: res.totalHours,
        time
      });
      // Auto close after 3 seconds on success
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể điểm danh. Vui lòng thử lại.');
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm mx-4 bg-gray-900/90 border border-gray-850 rounded-2xl shadow-2xl overflow-hidden p-6 transition-all duration-300 transform scale-100">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Clock className="text-primary-500 w-5 h-5" />
            <h3 className="text-white text-base font-semibold">Điểm danh nhanh</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {!result ? (
          <div className="mt-5 flex flex-col items-center">
            <p className="text-gray-400 text-xs text-center mb-4">Nhập mã PIN của bạn để thực hiện ghi nhận ca làm việc</p>
            
            {/* PIN Display dots */}
            <div className="flex justify-center gap-3.5 mb-6">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                    idx < pin.length
                      ? 'bg-primary-500 border-primary-500 scale-110 shadow-lg shadow-primary-500/20'
                      : 'border-gray-700 bg-gray-950'
                  }`}
                />
              ))}
            </div>

            {/* Error Message */}
            {error && (
              <div className="w-full flex items-center gap-2 mb-4 px-3 py-2 bg-red-950/40 border border-red-900/50 rounded-lg">
                <ShieldAlert className="text-red-400 w-4 h-4 flex-shrink-0" />
                <p className="text-red-400 text-xs font-medium">{error}</p>
              </div>
            )}

            {/* PIN Pad */}
            <div className="grid grid-cols-3 gap-3.5 w-full max-w-[280px]">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  disabled={isLoading}
                  onClick={() => handleKeyPress(num)}
                  className="h-14 rounded-xl text-white font-semibold text-lg bg-gray-800/60 hover:bg-gray-700 active:bg-gray-850 hover:scale-102 transition-all flex items-center justify-center border border-gray-750/30"
                >
                  {num}
                </button>
              ))}
              
              <button
                disabled={isLoading}
                onClick={handleClear}
                className="h-14 rounded-xl text-gray-400 font-medium text-sm bg-gray-800/25 hover:bg-gray-850 hover:text-white transition-all flex items-center justify-center border border-gray-800/10"
              >
                Xóa
              </button>
              
              <button
                disabled={isLoading}
                onClick={() => handleKeyPress(0)}
                className="h-14 rounded-xl text-white font-semibold text-lg bg-gray-800/60 hover:bg-gray-700 active:bg-gray-850 hover:scale-102 transition-all flex items-center justify-center border border-gray-750/30"
              >
                0
              </button>

              <button
                disabled={isLoading}
                onClick={handleDelete}
                className="h-14 rounded-xl text-gray-400 hover:text-white hover:bg-gray-850 transition-all flex items-center justify-center"
              >
                <Delete size={20} />
              </button>
            </div>

            {isLoading && (
              <div className="mt-4 flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                <span className="text-gray-400 text-xs">Đang kiểm tra PIN...</span>
              </div>
            )}
          </div>
        ) : (
          /* Success Screen */
          <div className="mt-6 flex flex-col items-center text-center animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400 mb-4 animate-pulse-soft">
              <CheckCircle2 size={32} />
            </div>
            
            <h4 className="text-white text-lg font-bold mb-1">Điểm danh thành công!</h4>
            <p className="text-gray-400 text-xs mb-4">Xin chào, <span className="text-white font-semibold">{result.employeeName}</span></p>

            <div className="w-full bg-gray-950/80 border border-gray-850 rounded-xl p-4 mb-4 text-left space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Trạng thái:</span>
                <span className={`font-bold ${result.action === 'clockIn' ? 'text-green-400' : 'text-amber-400'}`}>
                  {result.action === 'clockIn' ? 'Đã Clock-In (Vào ca)' : 'Đã Clock-Out (Ra ca)'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Thời gian ghi nhận:</span>
                <span className="text-white font-mono">{result.time}</span>
              </div>
              {result.action === 'clockOut' && (
                <div className="flex justify-between text-xs border-t border-gray-800 pt-2 mt-1">
                  <span className="text-gray-500">Số giờ tích lũy:</span>
                  <span className="text-green-400 font-bold font-mono">{result.totalHours} giờ</span>
                </div>
              )}
            </div>

            <p className="text-gray-500 text-[10px] italic">Giao diện sẽ tự động đóng sau vài giây...</p>
            
            <button
              onClick={onClose}
              className="mt-4 w-full py-2 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Hoàn tất
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
