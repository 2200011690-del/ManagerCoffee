import { useState, useEffect } from 'react';
import { Plus, Trash2, Gift, Play, Power, Calendar, Clock, DollarSign, Tag, Check, X, Search, Edit } from 'lucide-react';
import { api } from '../api';
import { useMenu } from '../context/MenuContext';

export default function PromotionManagementPage() {
  const { menuList } = useMenu();
  const [activeSubTab, setActiveSubTab] = useState('auto'); // 'auto' | 'vouchers'
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState('HAPPY_HOUR'); // HAPPY_HOUR, COMBO, BUY_X_GET_Y
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Happy Hour conditions & rewards
  const [hhStartHour, setHhStartHour] = useState('14:00');
  const [hhEndHour, setHhEndHour] = useState('16:00');
  const [hhDiscountPct, setHhDiscountPct] = useState(10);
  const [hhProductIds, setHhProductIds] = useState([]); // Empty = all products

  // Combo conditions & rewards
  const [comboProducts, setComboProducts] = useState([{ productId: '', qty: 1 }]);
  const [comboPrice, setComboPrice] = useState(50000);

  // Buy X Get Y conditions & rewards
  const [buyProductId, setBuyProductId] = useState('');
  const [buyMinQty, setBuyMinQty] = useState(2);
  const [getProductId, setGetProductId] = useState('');
  const [getFreeQty, setGetFreeQty] = useState(1);

  // Voucher states
  const [vouchersList, setVouchersList] = useState([]);
  const [vouchSearch, setVouchSearch] = useState('');
  const [showAddVouch, setShowAddVouch] = useState(false);
  const [showEditVouch, setShowEditVouch] = useState(false);
  const [selectedVouch, setSelectedVouch] = useState(null);
  const [vouchForm, setVouchForm] = useState({ code: '', type: 'FIXED', value: '', minOrderValue: '', maxDiscount: '', expiryDate: '', isActive: true });

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const data = await api.get('/promotions');
      setPromotions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Không thể tải danh sách khuyến mãi');
    } finally {
      setLoading(false);
    }
  };

  const fetchVouchers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/vouchers');
      setVouchersList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Không thể tải danh sách mã giảm giá');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'auto') {
      fetchPromotions();
    } else {
      fetchVouchers();
    }
  }, [activeSubTab]);

  // Handlers for Vouchers
  const handleAddVouch = async (e) => {
    e.preventDefault();
    try {
      await api.post('/vouchers', {
        code: vouchForm.code,
        type: vouchForm.type,
        value: Number(vouchForm.value),
        minOrderValue: Number(vouchForm.minOrderValue) || 0,
        maxDiscount: vouchForm.maxDiscount ? Number(vouchForm.maxDiscount) : null,
        expiryDate: vouchForm.expiryDate || null,
        isActive: vouchForm.isActive
      });
      setShowAddVouch(false);
      setVouchForm({ code: '', type: 'FIXED', value: '', minOrderValue: '', maxDiscount: '', expiryDate: '', isActive: true });
      fetchVouchers();
    } catch (err) {
      alert('Không thể tạo mã giảm giá: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSaveEditVouch = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/vouchers/${selectedVouch.id}`, {
        code: vouchForm.code,
        type: vouchForm.type,
        value: Number(vouchForm.value),
        minOrderValue: Number(vouchForm.minOrderValue) || 0,
        maxDiscount: vouchForm.maxDiscount ? Number(vouchForm.maxDiscount) : null,
        expiryDate: vouchForm.expiryDate || null,
        isActive: vouchForm.isActive
      });
      setShowEditVouch(false);
      fetchVouchers();
    } catch (err) {
      alert('Không thể sửa mã giảm giá: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteVouch = async (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa mã giảm giá này?")) {
      try {
        await api.delete(`/vouchers/${id}`);
        fetchVouchers();
      } catch (err) {
        alert('Không thể xóa: ' + (err.response?.data?.error || err.message));
      }
    }
  };

  const handleToggleActive = async (promo) => {
    try {
      await api.put(`/promotions/${promo.id}`, { isActive: !promo.isActive });
      fetchPromotions();
    } catch (err) {
      setError('Lỗi khi cập nhật trạng thái khuyến mãi');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa chương trình khuyến mãi này?')) return;
    try {
      await api.delete(`/promotions/${id}`);
      fetchPromotions();
    } catch (err) {
      setError('Lỗi khi xóa khuyến mãi');
    }
  };

  const handleAddComboProduct = () => {
    setComboProducts([...comboProducts, { productId: '', qty: 1 }]);
  };

  const handleRemoveComboProduct = (index) => {
    setComboProducts(comboProducts.filter((_, i) => i !== index));
  };

  const handleComboProductChange = (index, field, value) => {
    const updated = comboProducts.map((p, i) => {
      if (i === index) {
        return { ...p, [field]: value };
      }
      return p;
    });
    setComboProducts(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    let conditions = {};
    let rewards = {};

    if (!promoName.trim()) {
      alert('Vui lòng nhập tên chương trình');
      return;
    }

    if (promoType === 'HAPPY_HOUR') {
      conditions = {
        startHour: hhStartHour,
        endHour: hhEndHour,
        productIds: hhProductIds
      };
      rewards = {
        discountPct: Number(hhDiscountPct) || 0
      };
    } else if (promoType === 'COMBO') {
      const validCombo = comboProducts.filter(p => p.productId);
      if (validCombo.length < 2) {
        alert('Combo phải chứa ít nhất 2 sản phẩm');
        return;
      }
      conditions = {
        comboProducts: validCombo.map(p => ({ productId: p.productId, qty: Number(p.qty) || 1 }))
      };
      rewards = {
        comboPrice: Number(comboPrice) || 0
      };
    } else if (promoType === 'BUY_X_GET_Y') {
      if (!buyProductId || !getProductId) {
        alert('Vui lòng chọn đầy đủ sản phẩm mua và sản phẩm tặng');
        return;
      }
      conditions = {
        buyProductId,
        minQty: Number(buyMinQty) || 1
      };
      rewards = {
        getProductId,
        freeQty: Number(getFreeQty) || 1
      };
    }

    try {
      await api.post('/promotions', {
        name: promoName,
        type: promoType,
        conditions,
        rewards,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        isActive: true
      });
      setIsModalOpen(false);
      resetForm();
      fetchPromotions();
    } catch (err) {
      setError(err.response?.data?.error || 'Tạo khuyến mãi thất bại');
    }
  };

  const resetForm = () => {
    setPromoName('');
    setPromoType('HAPPY_HOUR');
    setStartDate('');
    setEndDate('');
    setHhStartHour('14:00');
    setHhEndHour('16:00');
    setHhDiscountPct(10);
    setHhProductIds([]);
    setComboProducts([{ productId: '', qty: 1 }]);
    setComboPrice(50000);
    setBuyProductId('');
    setBuyMinQty(2);
    setGetProductId('');
    setGetFreeQty(1);
  };

  const getPromoTypeText = (type) => {
    switch (type) {
      case 'HAPPY_HOUR': return 'Giờ vàng (Happy Hour)';
      case 'COMBO': return 'Đóng gói Combo';
      case 'BUY_X_GET_Y': return 'Mua X tặng Y';
      default: return type;
    }
  };

  const parseJson = (str) => {
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  };

  return (
    <div className="h-full bg-cream-light overflow-y-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-coffee-dark mb-1">Chương trình Khuyến mãi</h1>
            <p className="text-coffee-medium text-sm">Thiết lập giờ vàng giảm giá, các gói combo, chính sách mua X tặng Y và mã giảm giá</p>
          </div>
          {activeSubTab === 'auto' ? (
            <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="btn-primary min-h-[44px] px-5 flex items-center gap-2">
              <Plus size={18} />
              Tạo khuyến mãi mới
            </button>
          ) : (
            <button
              onClick={() => {
                setVouchForm({ code: '', type: 'FIXED', value: '', minOrderValue: '', maxDiscount: '', expiryDate: '', isActive: true });
                setShowAddVouch(true);
              }}
              className="btn-primary min-h-[44px] px-5 flex items-center gap-2"
            >
              <Plus size={18} />
              Tạo mã giảm giá mới
            </button>
          )}
        </div>

        {/* Sub-tab switcher bar */}
        <div className="flex bg-cream-medium/20 rounded-lg p-1 gap-1 w-fit border border-cream-medium/30">
          <button
            onClick={() => setActiveSubTab('auto')}
            className={`min-h-[36px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              activeSubTab === 'auto'
                ? 'bg-coffee-dark text-white shadow'
                : 'text-coffee-medium hover:text-coffee-dark'
            }`}
          >
            <Gift size={13} />
            Khuyến mãi tự động (Giờ vàng/Combo)
          </button>
          <button
            onClick={() => setActiveSubTab('vouchers')}
            className={`min-h-[36px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              activeSubTab === 'vouchers'
                ? 'bg-coffee-dark text-white shadow'
                : 'text-coffee-medium hover:text-coffee-dark'
            }`}
          >
            <Tag size={13} />
            Mã giảm giá (Voucher)
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {/* ===== AUTO PROMOTIONS TAB ===== */}
        {activeSubTab === 'auto' && (
          <>
            {loading ? (
              <p className="text-center py-10 text-coffee-medium">Đang tải danh sách khuyến mãi...</p>
            ) : promotions.length === 0 ? (
              <div className="bg-white rounded-lg shadow-card p-12 text-center text-coffee-medium">
                <Gift size={40} className="mx-auto mb-3 text-coffee-light/40" />
                <p className="font-semibold">Chưa cấu hình chương trình khuyến mãi nào</p>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Bấm "Tạo khuyến mãi mới" ở trên để thiết lập chương trình đầu tiên</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                {promotions.map(promo => {
                  const cond = parseJson(promo.conditions);
                  const rew = parseJson(promo.rewards);
                  return (
                    <div key={promo.id} className={`bg-white p-6 rounded-lg shadow-card border transition-all duration-200 hover:shadow-coffee-sm flex flex-col justify-between ${promo.isActive ? 'border-cream-medium/30' : 'border-gray-200 bg-gray-50/50'}`}>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase ${
                            promo.type === 'HAPPY_HOUR' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            promo.type === 'COMBO' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                            'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {getPromoTypeText(promo.type)}
                          </span>
                          
                          <button 
                            onClick={() => handleToggleActive(promo)} 
                            className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 ${promo.isActive ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-gray-200 bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            title={promo.isActive ? 'Bấm để Tắt' : 'Bấm để Bật'}
                          >
                            {promo.isActive ? <Power size={13} /> : <Play size={13} />}
                            <span className="text-[10px] font-bold uppercase">{promo.isActive ? 'Đang bật' : 'Đang tắt'}</span>
                          </button>
                        </div>

                        <h3 className={`font-bold text-base mb-2 font-display ${promo.isActive ? 'text-coffee-dark' : 'text-gray-400'}`}>
                          {promo.name}
                        </h3>

                        {/* Promotion Rules Details */}
                        <div className="space-y-1.5 text-xs text-coffee-medium font-medium mb-4">
                          {promo.type === 'HAPPY_HOUR' && (
                            <>
                              <p className="flex items-center gap-1.5">
                                <Clock size={12} className="text-coffee-accent" />
                                <span>Khung giờ: <strong className="text-coffee-dark">{cond.startHour} - {cond.endHour}</strong></span>
                              </p>
                              <p className="flex items-center gap-1.5">
                                <DollarSign size={12} className="text-coffee-accent" />
                                <span>Giảm giá: <strong className="text-coffee-dark">{rew.discountPct}%</strong> cho toàn bộ/món cấu hình</span>
                              </p>
                            </>
                          )}
                          {promo.type === 'COMBO' && (
                            <>
                              <p className="flex items-center gap-1.5">
                                <Plus size={12} className="text-coffee-accent" />
                                <span>Gói Combo: <strong className="text-coffee-dark">{cond.comboProducts?.length || 0} sản phẩm</strong></span>
                              </p>
                              <p className="flex items-center gap-1.5">
                                <DollarSign size={12} className="text-coffee-accent" />
                                <span>Giá trọn gói: <strong className="text-coffee-dark">{(rew.comboPrice || 0).toLocaleString('vi-VN')}đ</strong></span>
                              </p>
                            </>
                          )}
                          {promo.type === 'BUY_X_GET_Y' && (
                            <>
                              <p className="flex items-center gap-1.5">
                                <Gift size={12} className="text-coffee-accent" />
                                <span>Mua tối thiểu: <strong className="text-coffee-dark">{cond.minQty} sản phẩm</strong></span>
                              </p>
                              <p className="flex items-center gap-1.5">
                                <Check size={12} className="text-coffee-accent" />
                                <span>Tặng miễn phí: <strong className="text-coffee-dark">{rew.freeQty} sản phẩm</strong></span>
                              </p>
                            </>
                          )}
                        </div>

                        {/* Timing */}
                        <div className="pt-2 border-t border-cream-medium/10 flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                          <div className="flex items-center gap-1">
                            <Calendar size={11} />
                            <span>Từ: {promo.startDate ? new Date(promo.startDate).toLocaleDateString('vi-VN') : 'Không hạn chế'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar size={11} />
                            <span>Đến: {promo.endDate ? new Date(promo.endDate).toLocaleDateString('vi-VN') : 'Không hạn chế'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                        <button 
                          onClick={() => handleDelete(promo.id)} 
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold"
                        >
                          <Trash2 size={14} /> Xóa chương trình
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ===== VOUCHERS LIST SUBTAB ===== */}
        {activeSubTab === 'vouchers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Tìm kiếm mã giảm giá..."
                  value={vouchSearch}
                  onChange={e => setVouchSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-150 bg-white">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-150">
                    <th className="px-4 py-3 font-semibold text-gray-700">Mã khuyến mãi</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Loại giảm giá</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Mức giảm</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Đơn hàng tối thiểu</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Mức giảm tối đa</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-center">Hạn sử dụng</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-center">Trạng thái</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vouchersList
                    .filter(v => v && v.code && v.code.toLowerCase().includes(vouchSearch.toLowerCase()))
                    .map(v => {
                      const isExpired = v.expiryDate && new Date(v.expiryDate) < new Date();
                      return (
                        <tr key={v.id} className={`hover:bg-gray-50/50 transition-colors ${!v.isActive || isExpired ? 'opacity-60 bg-gray-50/40' : ''}`}>
                          <td className="px-4 py-3.5">
                            <span className="font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded text-xs">
                              {v.code}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-gray-650">
                            {v.type === 'PERCENT' ? 'Giảm theo phần trăm (%)' : 'Giảm tiền mặt trực tiếp'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                            {v.value !== undefined && v.value !== null ? (v.type === 'PERCENT' ? `${v.value}%` : `${Number(v.value).toLocaleString('vi-VN')}đ`) : '0đ'}
                          </td>
                          <td className="px-4 py-3.5 text-right text-gray-650">
                            {v.minOrderValue !== undefined && v.minOrderValue !== null ? `${Number(v.minOrderValue).toLocaleString('vi-VN')}đ` : '0đ'}
                          </td>
                          <td className="px-4 py-3.5 text-right text-gray-650">
                            {v.maxDiscount !== undefined && v.maxDiscount !== null ? `${Number(v.maxDiscount).toLocaleString('vi-VN')}đ` : 'Không giới hạn'}
                          </td>
                          <td className="px-4 py-3.5 text-center text-gray-500 text-xs">
                            {v.expiryDate ? new Date(v.expiryDate).toLocaleDateString('vi-VN') : 'Vĩnh viễn'}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {isExpired ? (
                              <span className="text-xs bg-red-100 text-red-750 px-2 py-0.5 rounded font-bold border border-red-200">Hết hạn</span>
                            ) : v.isActive ? (
                              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-bold border border-green-200">Đang chạy</span>
                            ) : (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold border border-gray-250">Tắt</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedVouch(v);
                                  setVouchForm({
                                    code: v.code,
                                    type: v.type,
                                    value: v.value,
                                    minOrderValue: v.minOrderValue,
                                    maxDiscount: v.maxDiscount || '',
                                    expiryDate: v.expiryDate ? v.expiryDate.split('T')[0] : '',
                                    isActive: v.isActive
                                  });
                                  setShowEditVouch(true);
                                }}
                                className="p-1 hover:bg-gray-100 rounded text-blue-600"
                                title="Sửa"
                              >
                                <Edit size={15} />
                              </button>
                              <button
                                onClick={() => handleDeleteVouch(v.id)}
                                className="p-1 hover:bg-gray-100 rounded text-red-600"
                                title="Xóa"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  {vouchersList.length === 0 && (
                    <tr>
                      <td colSpan="8" className="text-center py-12 text-gray-400">Chưa tạo mã giảm giá nào</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Promotion Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-cream-light/30">
              <h2 className="font-display font-bold text-coffee-dark text-lg flex items-center gap-2">
                <Gift className="text-coffee-accent" size={20} />
                Tạo chương trình khuyến mãi tự động
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Promotion Type */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPromoType('HAPPY_HOUR')}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${promoType === 'HAPPY_HOUR' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Giờ vàng (Happy Hour)
                </button>
                <button
                  type="button"
                  onClick={() => setPromoType('COMBO')}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${promoType === 'COMBO' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Đóng gói Combo
                </button>
                <button
                  type="button"
                  onClick={() => setPromoType('BUY_X_GET_Y')}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${promoType === 'BUY_X_GET_Y' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Mua X tặng Y
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Tên chương trình khuyến mãi *</label>
                  <input
                    required
                    type="text"
                    value={promoName}
                    onChange={e => setPromoName(e.target.value)}
                    className="input-field w-full min-h-[44px] text-sm"
                    placeholder="VD: Mừng khai trương giảm giá giờ vàng..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Từ ngày (Không bắt buộc)</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="input-field w-full min-h-[44px] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Đến ngày (Không bắt buộc)</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="input-field w-full min-h-[44px] text-sm"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3" />

                {/* 1. HAPPY HOUR CONFIG FORM */}
                {promoType === 'HAPPY_HOUR' && (
                  <div className="space-y-4">
                    <span className="block text-xs font-bold text-coffee-dark uppercase tracking-wider mb-2">Cấu hình khung Giờ vàng</span>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Giờ bắt đầu hiệu lực *</label>
                        <input
                          required
                          type="time"
                          value={hhStartHour}
                          onChange={e => setHhStartHour(e.target.value)}
                          className="input-field w-full min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Giờ kết thúc hiệu lực *</label>
                        <input
                          required
                          type="time"
                          value={hhEndHour}
                          onChange={e => setHhEndHour(e.target.value)}
                          className="input-field w-full min-h-[44px]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Tỷ lệ giảm giá cho phép (%) *</label>
                      <input
                        required
                        type="number"
                        min="1"
                        max="100"
                        value={hhDiscountPct}
                        onChange={e => setHhDiscountPct(parseInt(e.target.value) || 0)}
                        className="input-field w-full min-h-[44px] text-sm"
                        placeholder="VD: 10"
                      />
                    </div>
                  </div>
                )}

                {/* 2. COMBO CONFIG FORM */}
                {promoType === 'COMBO' && (
                  <div className="space-y-4">
                    <span className="block text-xs font-bold text-coffee-dark uppercase tracking-wider mb-2">Thiết lập Combo sản phẩm</span>
                    
                    <div className="space-y-2.5">
                      <label className="block text-xs font-bold text-gray-500">Các sản phẩm trong Combo *</label>
                      
                      {comboProducts.map((p, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <select 
                            required 
                            value={p.productId} 
                            onChange={e => handleComboProductChange(index, 'productId', e.target.value)}
                            className="input-field flex-1 min-h-[44px] text-sm bg-white"
                          >
                            <option value="">-- Chọn món --</option>
                            {menuList.map(prod => (
                              <option key={prod.id} value={prod.id}>{prod.name}</option>
                            ))}
                          </select>
                          <input 
                            required 
                            type="number" 
                            min="1" 
                            value={p.qty} 
                            onChange={e => handleComboProductChange(index, 'qty', parseInt(e.target.value) || 1)}
                            className="input-field w-20 min-h-[44px]" 
                          />
                          {comboProducts.length > 1 && (
                            <button type="button" onClick={() => handleRemoveComboProduct(index)} className="p-2.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={handleAddComboProduct} className="text-xs font-bold text-blue-600 hover:underline">
                        + Thêm món
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Giá bán gộp combo (đ)</label>
                      <input 
                        required 
                        type="number" 
                        min="1000" 
                        value={comboPrice} 
                        onChange={e => setComboPrice(parseInt(e.target.value) || 0)} 
                        className="input-field w-full min-h-[44px] text-sm" 
                      />
                    </div>
                  </div>
                )}

                {/* 3. BUY X GET Y CONFIG FORM */}
                {promoType === 'BUY_X_GET_Y' && (
                  <div className="space-y-4">
                    <span className="block text-xs font-bold text-coffee-dark uppercase tracking-wider mb-2">Cấu hình Mua X tặng Y</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Sản phẩm mua *</label>
                        <select required value={buyProductId} onChange={e => setBuyProductId(e.target.value)} className="input-field w-full min-h-[44px] text-sm bg-white">
                          <option value="">-- Chọn món --</option>
                          {menuList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">SL mua tối thiểu *</label>
                        <input required type="number" min="1" value={buyMinQty} onChange={e => setBuyMinQty(parseInt(e.target.value) || 1)} className="input-field w-full min-h-[44px]" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Sản phẩm tặng *</label>
                        <select required value={getProductId} onChange={e => setGetProductId(e.target.value)} className="input-field w-full min-h-[44px] text-sm bg-white">
                          <option value="">-- Chọn món --</option>
                          {menuList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">SL tặng *</label>
                        <input required type="number" min="1" value={getFreeQty} onChange={e => setGetFreeQty(parseInt(e.target.value) || 1)} className="input-field w-full min-h-[44px]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">
                  Hủy bỏ
                </button>
                <button type="submit" className="px-5 py-2 btn-primary rounded-lg text-sm font-semibold flex items-center gap-1.5">
                  <Check size={16} /> Lưu chương trình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: THÊM MỚI VOUCHER */}
      {showAddVouch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="font-bold text-coffee-dark text-lg">Tạo mã giảm giá mới</h3>
              <button onClick={() => setShowAddVouch(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddVouch} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Mã giảm giá *</label>
                  <input
                    type="text"
                    required
                    value={vouchForm.code}
                    onChange={e => setVouchForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono tracking-wider"
                    placeholder="VD: GIAM20K"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Loại ưu đãi</label>
                  <select
                    value={vouchForm.type}
                    onChange={e => setVouchForm(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="FIXED">Giảm tiền mặt (đ)</option>
                    <option value="PERCENT">Giảm phần trăm (%)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Giá trị giảm *</label>
                  <input
                    type="number"
                    required
                    value={vouchForm.value}
                    onChange={e => setVouchForm(prev => ({ ...prev, value: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={vouchForm.type === 'PERCENT' ? 'VD: 15 (%)' : 'VD: 20000 (đ)'}
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Đơn hàng tối thiểu (đ)</label>
                  <input
                    type="number"
                    value={vouchForm.minOrderValue}
                    onChange={e => setVouchForm(prev => ({ ...prev, minOrderValue: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="VD: 50000"
                    min="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Mức giảm tối đa (đ)</label>
                  <input
                    type="number"
                    value={vouchForm.maxDiscount}
                    onChange={e => setVouchForm(prev => ({ ...prev, maxDiscount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Bỏ trống nếu không giới hạn"
                    min="0"
                    disabled={vouchForm.type === 'FIXED'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Ngày hết hạn</label>
                  <input
                    type="date"
                    value={vouchForm.expiryDate}
                    onChange={e => setVouchForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddVouch(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-semibold"
                >
                  Tạo khuyến mãi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SỬA VOUCHER */}
      {showEditVouch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="font-bold text-coffee-dark text-lg">Cập nhật mã giảm giá</h3>
              <button onClick={() => setShowEditVouch(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveEditVouch} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Mã giảm giá *</label>
                  <input
                    type="text"
                    required
                    value={vouchForm.code}
                    onChange={e => setVouchForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono tracking-wider"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Loại ưu đãi</label>
                  <select
                    value={vouchForm.type}
                    onChange={e => setVouchForm(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="FIXED">Giảm tiền mặt (đ)</option>
                    <option value="PERCENT">Giảm phần trăm (%)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Giá trị giảm *</label>
                  <input
                    type="number"
                    required
                    value={vouchForm.value}
                    onChange={e => setVouchForm(prev => ({ ...prev, value: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Đơn hàng tối thiểu (đ)</label>
                  <input
                    type="number"
                    value={vouchForm.minOrderValue}
                    onChange={e => setVouchForm(prev => ({ ...prev, minOrderValue: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Mức giảm tối đa (đ)</label>
                  <input
                    type="number"
                    value={vouchForm.maxDiscount}
                    onChange={e => setVouchForm(prev => ({ ...prev, maxDiscount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={vouchForm.type === 'FIXED'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Ngày hết hạn</label>
                  <input
                    type="date"
                    value={vouchForm.expiryDate}
                    onChange={e => setVouchForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActiveEdit"
                  checked={vouchForm.isActive}
                  onChange={e => setVouchForm(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="isActiveEdit" className="text-sm font-semibold text-gray-700">Kích hoạt hoạt động</label>
              </div>
              <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowEditVouch(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-semibold"
                >
                  Lưu cập nhật
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
