import { useState, useEffect } from 'react';
import { Printer, CheckCircle, X } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

function VietQRCode({ amount, info, bankId = 'MB', accountNo = '', accountName = '' }) {
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

export default function ThermalBillModal({ order, store: propStore, onConfirm, onClose }) {
  const { currentUser } = useAuth();
  const [printing, setPrinting] = useState(false);
  const [store, setStore] = useState(propStore || currentUser?.store || null);

  useEffect(() => {
    // Luôn tải lại cấu hình mới nhất từ server để đảm bảo thông tin in là chính xác nhất
    const fetchStoreSettings = async () => {
      try {
        const data = await api.get('/store/settings');
        setStore(data);
      } catch (err) {
        console.error('Lỗi khi tải thông tin cửa hàng:', err);
      }
    };
    fetchStoreSettings();
  }, [propStore]);

  if (!order) return null;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('vi-VN');

  // Lấy thông tin ngân hàng từ store hoặc env làm dự phòng
  const bankId = store?.bankId || 'MB';
  const bankAccountNo = store?.bankAccountNo || '';
  const bankAccountName = store?.bankAccountName || '';

  const handlePrintAndConfirm = async () => {
    const ip = localStorage.getItem('lan_printer_ip');
    if (ip) {
      setPrinting(true);
      try {
        await api.post('/print', {
          ip,
          port: 9100,
          order,
          store
        });
      } catch (err) {
        console.error('Lỗi in LAN:', err);
        alert((err.response?.data?.error || err.message) + '\n\nHệ thống sẽ mở hộp thoại in trình duyệt để thay thế.');
        window.print();
      } finally {
        setPrinting(false);
        onConfirm();
      }
    } else {
      window.print();
      onConfirm();
    }
  };

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
          <div id="thermal-receipt" className="bg-gray-50 rounded-xl p-4 border border-gray-200"
            style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '11px', lineHeight: '1.6', color: '#111', letterSpacing: '0.01em' }}>

            {/* Shop header */}
            <div className="text-center mb-1">
              <p className="font-bold text-base tracking-widest uppercase">{store?.name || 'ESPRESSO LAB'}</p>
              <p className="text-xs">{store?.address || 'Địa chỉ quán'}</p>
              <p className="text-xs">Tel: {store?.phone || 'Số điện thoại'}</p>
            </div>

            <p className="text-center text-xs my-1">{sep('=')}</p>

            {/* Order info */}
            <p className="text-center font-bold">HOÁ ĐƠN THANH TOÁN</p>
            <p className="text-center text-xs my-0.5">{sep('-')}</p>
            <p>{padLine('Mã HĐ:', order.orderNumber || order.id)}</p>
            <p>{padLine('Ngày:', dateStr)}</p>
            <p>{padLine('Giờ:', timeStr)}</p>
            <p>{padLine('Bàn:', order.tableName)}</p>
            {order.customer && (
              <p>{padLine('Khách hàng:', order.customer.name)}</p>
            )}
            <p>{padLine('Hình thức:', order.paymentMethod === 'cash' ? 'Tiền mặt' : order.paymentMethod === 'card' ? 'Chuyển khoản' : 'Thẻ/QR')}</p>

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
            {(() => {
              const pointsDisc = (order.usedPoints || 0) * 1000;
              const promoDisc = (order.discountAmount || 0) - pointsDisc;
              return (
                <>
                  {promoDisc > 0 && (
                    <p>{padLine(`Giảm giá (${order.voucherCode || 'Chiết khấu'}):`, '-' + promoDisc.toLocaleString('vi-VN') + 'đ')}</p>
                  )}
                  {pointsDisc > 0 && (
                    <p>{padLine(`Dùng điểm (${order.usedPoints} điểm):`, '-' + pointsDisc.toLocaleString('vi-VN') + 'đ')}</p>
                  )}
                </>
              );
            })()}
            <p>{padLine('VAT (8%):', '+' + order.vatAmount.toLocaleString('vi-VN') + 'đ')}</p>
            <p className="font-bold text-sm">{sep('=')}</p>
            <p className="font-bold text-sm">{padLine('TỔNG CỘNG:', order.total.toLocaleString('vi-VN') + 'đ')}</p>
            <p>{sep('=')}</p>

            {/* QR */}
            {bankAccountNo && order.paymentMethod !== 'cash' && (
              <div className="flex flex-col items-center my-3">
                <p className="text-xs mb-2 text-center">Thông tin chuyển khoản</p>
                <VietQRCode 
                  amount={order.total} 
                  info={order.orderNumber || order.id} 
                  bankId={bankId}
                  accountNo={bankAccountNo}
                  accountName={bankAccountName}
                />
                <p className="text-[9px] mt-2 text-center font-bold">{bankId} - {bankAccountNo}</p>
                <p className="text-[9px] text-center uppercase">{bankAccountName}</p>
                <p className="text-[9px] text-center text-gray-500">ND: {order.orderNumber || order.id}</p>
              </div>
            )}

            <p>{sep('-')}</p>
            {/* Footer */}
            {store?.printHeader ? (
              <p className="text-center text-[10px] whitespace-pre-line my-1">{store.printHeader}</p>
            ) : (
              <p className="text-center text-xs mt-1">Cam on quy khach!</p>
            )}
            {store?.printFooter ? (
              <p className="text-center text-[10px] whitespace-pre-line my-1">{store.printFooter}</p>
            ) : (
              <p className="text-center text-xs">Hen gap lai lan sau ♥</p>
            )}
            <p className="text-center text-[9px] mt-1 text-gray-400">{store?.code ? `${store.code}.vn` : 'espressolab.vn'}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="min-h-[44px] flex-1 btn-secondary text-sm">
            Hủy
          </button>
          <button 
            onClick={handlePrintAndConfirm}
            disabled={printing}
            className="min-h-[44px] flex-1 btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {printing ? (
              <span className="animate-spin mr-1">⌛</span>
            ) : (
              <CheckCircle size={18} />
            )}
            {printing ? 'Đang in...' : 'Xác nhận in & Hoàn tất'}
          </button>
        </div>
      </div>
    </div>
  );
}
