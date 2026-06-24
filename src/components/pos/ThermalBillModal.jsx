import { Printer, CheckCircle, X } from 'lucide-react';

function VietQRCode({ amount, info }) {
  const bankId = 'MB'; // Default Bank
  const accountNo = '123456789'; // Default Account
  const accountName = 'CAFE MANAGER';
  const url = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(accountName)}`;

  return (
    <img src={url} alt="VietQR" className="w-[120px] h-[120px] object-contain mx-auto mix-blend-multiply" />
  );
}

function sep(char = '-', len = 32) {
  return char.repeat(len);
}

function padLine(left, right, total = 32) {
  const pad = total - left.length - right.length;
  return left + ' '.repeat(Math.max(1, pad)) + right;
}

export default function ThermalBillModal({ order, onConfirm, onClose }) {
  if (!order) return null;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('vi-VN');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,15,10,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Close */}
        <button onClick={onClose}
          className="absolute top-3 right-3 min-w-[36px] min-h-[36px] rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition z-10">
          <X size={18} />
        </button>

        {/* Header of modal */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
            <Printer size={18} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Xem trước hóa đơn</p>
            <p className="text-xs text-gray-400">Hóa đơn nhiệt K58</p>
          </div>
        </div>

        {/* Thermal receipt body */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200"
            style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '11px', lineHeight: '1.6', color: '#111', letterSpacing: '0.01em' }}>

            {/* Shop header */}
            <div className="text-center mb-1">
              <p className="font-bold text-base tracking-widest">ESPRESSO LAB</p>
              <p className="text-xs">123 Nguyễn Huệ, Q.1, TP.HCM</p>
              <p className="text-xs">Tel: 028 3822 xxxx</p>
            </div>

            <p className="text-center text-xs my-1">{sep('=')}</p>

            {/* Order info */}
            <p className="text-center font-bold">HOÁ ĐƠN THANH TOÁN</p>
            <p className="text-center text-xs my-0.5">{sep('-')}</p>
            <p>{padLine('Mã HĐ:', order.id)}</p>
            <p>{padLine('Ngày:', dateStr)}</p>
            <p>{padLine('Giờ:', timeStr)}</p>
            <p>{padLine('Bàn:', order.tableName)}</p>
            <p>{padLine('Hình thức:', order.paymentMethod === 'cash' ? 'Tiền mặt' : 'Thẻ/QR')}</p>

            <p className="my-1">{sep('-')}</p>

            {/* Column headers */}
            <p className="font-bold">
              <span style={{ display: 'inline-block', width: '60%' }}>Món</span>
              <span style={{ display: 'inline-block', width: '10%', textAlign: 'right' }}>SL</span>
              <span style={{ display: 'inline-block', width: '30%', textAlign: 'right' }}>T.Tiền</span>
            </p>
            <p>{sep('-')}</p>

            {/* Items */}
            {order.items.map((item, i) => {
              const lineTotal = (item.price * item.qty).toLocaleString('vi-VN');
              const nameTrunc = item.name.length > 18 ? item.name.substring(0, 17) + '.' : item.name;
              return (
                <div key={i} className="mb-0.5">
                  <p>
                    <span style={{ display: 'inline-block', width: '60%' }}>{nameTrunc}</span>
                    <span style={{ display: 'inline-block', width: '10%', textAlign: 'right' }}>x{item.qty}</span>
                    <span style={{ display: 'inline-block', width: '30%', textAlign: 'right' }}>{lineTotal}</span>
                  </p>
                  {(item.sugar !== '100%' || item.ice !== 'Nhiều đá' || item.note) && (
                    <p className="text-gray-500 pl-2 text-[10px]">
                      {[item.sugar !== '100%' && `Đường ${item.sugar}`, item.ice !== 'Nhiều đá' && item.ice, item.note].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}

            <p>{sep('-')}</p>

            {/* Totals */}
            <p>{padLine('Tạm tính:', order.subtotal.toLocaleString('vi-VN') + 'đ')}</p>
            {order.discountAmount > 0 && (
              <p>{padLine(`Giảm giá (${order.voucherCode}):`, '-' + order.discountAmount.toLocaleString('vi-VN') + 'đ')}</p>
            )}
            <p>{padLine('VAT (8%):', '+' + order.vatAmount.toLocaleString('vi-VN') + 'đ')}</p>
            <p className="font-bold text-sm">{sep('=')}</p>
            <p className="font-bold text-sm">{padLine('TỔNG CỘNG:', order.total.toLocaleString('vi-VN') + 'đ')}</p>
            <p>{sep('=')}</p>

            {/* QR */}
            <div className="flex flex-col items-center my-3">
              <p className="text-xs mb-2 text-center">Quét QR để chuyển khoản</p>
              <VietQRCode amount={order.total} info={`THANH TOAN ${order.tableName || 'DON HANG'}`} />
              <p className="text-xs mt-2 text-center font-bold">MB BANK - 1234 567 89</p>
              <p className="text-xs text-center">CAFE MANAGER</p>
              <p className="text-xs text-center text-gray-500">ND: THANH TOAN {order.tableName || 'DON HANG'}</p>
            </div>

            <p>{sep('-')}</p>
            {/* Footer */}
            <p className="text-center text-xs mt-1">Cam on quy khach!</p>
            <p className="text-center text-xs">Hen gap lai lan sau ♥</p>
            <p className="text-center text-xs mt-1 text-gray-400">espressolab.vn</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="min-h-[44px] flex-1 btn-secondary text-sm">
            Hủy
          </button>
          <button onClick={onConfirm}
            className="min-h-[44px] flex-1 btn-primary flex items-center justify-center gap-2 text-sm">
            <CheckCircle size={18} />
            Xác nhận in & Hoàn tất
          </button>
        </div>
      </div>
    </div>
  );
}
