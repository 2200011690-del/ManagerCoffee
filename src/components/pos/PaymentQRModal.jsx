import { useState, useEffect } from 'react';
import { X, CreditCard, RefreshCw, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../../api';
import { socket } from '../../socket';
import { useUI } from '../../context/UIContext';

export default function PaymentQRModal({ onClose, amount, orderNumber, onSuccess, onFail }) {
  const { showNotification } = useUI();
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl] = useState('');
  const [bankInfo, setBankInfo] = useState(null);
  const [error, setError] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    const fetchQR = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.post('/payments/create-qr', { amount, orderNumber });
        setQrUrl(data.qrUrl);
        setBankInfo(data);
      } catch (err) {
        setError(err.response?.data?.error || 'Cửa hàng chưa cấu hình Tài khoản ngân hàng nhận tiền. Vui lòng vào mục Cấu hình thiết lập.');
      } finally {
        setLoading(false);
      }
    };

    fetchQR();

    // Đăng ký nhận sự kiện thanh toán thành công qua Socket.io
    const handlePaymentSuccess = (data) => {
      if (data.orderNumber === orderNumber) {
        setPaid(true);
        showNotification(`Đã nhận thanh toán chuyển khoản cho đơn ${orderNumber}! 🎉`, 'success');
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    };

    socket.on('paymentSuccess', handlePaymentSuccess);
    return () => {
      socket.off('paymentSuccess', handlePaymentSuccess);
    };
  }, [amount, orderNumber]);

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await api.post('/payments/simulate-success', { orderNumber });
      showNotification('Đã gửi yêu cầu mô phỏng thanh toán thành công!', 'success');
    } catch (err) {
      showNotification('Lỗi mô phỏng thanh toán', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const handleBypass = async () => {
    // Thu ngân kiểm tra thấy tiền đã về và bấm xác nhận thủ công
    try {
      onSuccess();
    } catch (err) {
      showNotification('Lỗi xác nhận', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,15,10,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up border border-cream-medium/40">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-cream-medium/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="text-coffee-accent" size={20} />
            <h3 className="font-display font-bold text-coffee-dark">Chuyển khoản VietQR</h3>
          </div>
          <button onClick={onFail} className="min-w-[36px] min-h-[36px] rounded-xl bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-coffee-medium animate-spin" />
              <p className="text-coffee-medium font-semibold text-sm">Đang khởi tạo mã QR...</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                <ShieldAlert size={24} />
              </div>
              <p className="text-sm font-medium text-red-600 max-w-xs mx-auto leading-relaxed">
                {error}
              </p>
              <button onClick={onFail} className="btn-secondary min-h-[40px] px-6 text-xs font-bold">Quay lại</button>
            </div>
          ) : paid ? (
            <div className="py-12 text-center space-y-3 animate-bounce-soft">
              <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={36} />
              </div>
              <h4 className="font-bold text-lg text-coffee-dark">Đã nhận thanh toán!</h4>
              <p className="text-xs text-coffee-light">Hệ thống đang chuyển hướng in hóa đơn...</p>
            </div>
          ) : (
            <div className="w-full text-center space-y-4">
              <div className="bg-cream-light/60 border border-cream-medium/40 rounded-2xl p-4 text-left space-y-1.5">
                <div className="flex justify-between text-xs text-coffee-medium">
                  <span>Ngân hàng:</span>
                  <span className="font-bold text-coffee-dark">{bankInfo.bankId}</span>
                </div>
                <div className="flex justify-between text-xs text-coffee-medium">
                  <span>Số tài khoản:</span>
                  <span className="font-mono font-bold text-coffee-dark">{bankInfo.bankAccountNo}</span>
                </div>
                <div className="flex justify-between text-xs text-coffee-medium">
                  <span>Chủ tài khoản:</span>
                  <span className="font-bold text-coffee-dark uppercase">{bankInfo.bankAccountName}</span>
                </div>
                <div className="divider my-1 border-dashed" />
                <div className="flex justify-between text-sm font-bold text-coffee-dark">
                  <span>Số tiền:</span>
                  <span className="text-coffee-accent text-base">{amount.toLocaleString('vi-VN')} VNĐ</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-coffee-medium">
                  <span>Nội dung chuyển:</span>
                  <span className="text-coffee-accent font-mono">{orderNumber}</span>
                </div>
              </div>

              {/* QR Code Container */}
              <div className="relative w-48 h-48 mx-auto bg-white p-3 rounded-2xl border-2 border-cream-medium shadow-sm flex items-center justify-center">
                <img src={qrUrl} alt="VietQR Payment Code" className="w-full h-full object-contain" />
              </div>

              {/* Status indicator */}
              <div className="flex items-center justify-center gap-2 text-xs text-coffee-medium py-1 animate-pulse-soft">
                <RefreshCw size={12} className="animate-spin text-coffee-accent" />
                <span>Đang chờ khách chuyển khoản và tự động quét...</span>
              </div>

              <div className="divider border-cream-medium my-2" />

              {/* Simulation & Bypass buttons */}
              <div className="space-y-2 pt-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleSimulate}
                    disabled={simulating}
                    className="flex-1 min-h-[38px] rounded-xl text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Sparkles size={12} />
                    Mô phỏng Chuyển khoản
                  </button>
                  <button
                    onClick={handleBypass}
                    className="flex-1 min-h-[38px] rounded-xl text-xs font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 flex items-center justify-center gap-1 transition-all"
                  >
                    Xác nhận thô (Bypass)
                  </button>
                </div>
                
                <p className="text-[10px] text-coffee-light leading-relaxed">
                  * Nút <strong>Mô phỏng Chuyển khoản</strong> giả lập hệ thống nhận Webhook thanh toán thành công để thử nghiệm dòng chảy realtime.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
