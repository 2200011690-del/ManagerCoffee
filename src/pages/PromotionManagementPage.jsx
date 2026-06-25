import { useState, useEffect } from 'react';
import { Plus, Trash2, Gift, Play, Power, Calendar, Clock, DollarSign, Tag, Check, X } from 'lucide-react';
import { api } from '../api';
import { useMenu } from '../context/MenuContext';

export default function PromotionManagementPage() {
  const { menuList } = useMenu();
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

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const data = await api.get('/promotions');
      setPromotions(data);
    } catch (err) {
      setError('Không thể tải danh sách khuyến mãi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

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
            <p className="text-coffee-medium text-sm">Thiết lập giờ vàng giảm giá, các gói combo và chính sách mua X tặng Y tự động</p>
          </div>
          <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="btn-primary min-h-[44px] px-5 flex items-center gap-2">
            <Plus size={18} />
            Tạo khuyến mãi mới
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        {/* Promotions List */}
        {loading ? (
          <p className="text-center py-10 text-coffee-medium">Đang tải danh sách khuyến mãi...</p>
        ) : promotions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-card p-12 text-center text-coffee-medium">
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
                <div key={promo.id} className={`bg-white p-6 rounded-2xl shadow-card border transition-all duration-200 hover:shadow-coffee-sm flex flex-col justify-between ${promo.isActive ? 'border-cream-medium/30' : 'border-gray-200 bg-gray-50/50'}`}>
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
                    <div className="text-xs text-gray-500 space-y-1.5 bg-cream-light/30 p-3 rounded-xl border border-cream-medium/20 my-3">
                      {promo.type === 'HAPPY_HOUR' && (
                        <>
                          <div className="flex items-center gap-1.5"><Clock size={13} /> Khung giờ: <b>{cond.startHour} - {cond.endHour}</b></div>
                          <div className="flex items-center gap-1.5"><Tag size={13} /> Giảm giá: <b>{rew.discountPct}%</b> toàn đơn</div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            {cond.productIds?.length > 0 
                              ? `Áp dụng cho ${cond.productIds.length} món cụ thể`
                              : 'Áp dụng cho toàn bộ Menu'
                            }
                          </div>
                        </>
                      )}

                      {promo.type === 'COMBO' && (
                        <>
                          <div className="font-semibold text-[10px] text-coffee-medium uppercase tracking-wider mb-0.5">Sản phẩm trong Combo:</div>
                          <div className="space-y-1 max-h-[70px] overflow-y-auto pr-1">
                            {cond.comboProducts?.map((cp, idx) => {
                              const prod = menuList.find(p => p.id === cp.productId);
                              return (
                                <div key={idx} className="flex justify-between text-[11px]">
                                  <span>• {prod?.name || 'Sản phẩm đã xóa'}</span>
                                  <span className="font-mono">x{cp.qty}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-1.5 border-t border-gray-150 pt-1.5 mt-1">
                            <DollarSign size={13} /> Giá bán gộp combo: <b>{rew.comboPrice?.toLocaleString('vi-VN')}đ</b>
                          </div>
                        </>
                      )}

                      {promo.type === 'BUY_X_GET_Y' && (
                        <>
                          {(() => {
                            const buyProd = menuList.find(p => p.id === cond.buyProductId);
                            const getProd = menuList.find(p => p.id === rew.getProductId);
                            return (
                              <div className="space-y-1">
                                <div>Mua tối thiểu: <b>{cond.minQty} x {buyProd?.name || 'Món đã xóa'}</b></div>
                                <div className="text-green-600 font-semibold">Tặng miễn phí: {rew.freeQty} x {getProd?.name || 'Món đã xóa'}</div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>

                    {/* Date applicability */}
                    <div className="flex gap-3 text-[10px] text-gray-400 mt-3 border-t border-gray-100 pt-2.5">
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
      </div>

      {/* Promotion Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-cream-light/30">
              <h2 className="font-display font-bold text-coffee-dark text-lg flex items-center gap-2">
                <Gift size={20} className="text-coffee-accent" />
                Cấu hình chương trình khuyến mãi
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Tên chương trình khuyến mãi</label>
                <input 
                  required 
                  type="text" 
                  value={promoName} 
                  onChange={e => setPromoName(e.target.value)} 
                  className="input-field w-full min-h-[44px]" 
                  placeholder="VD: Happy Hour Giảm 10%, Mua 2 trà sữa tặng 1..." 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Từ ngày (Không bắt buộc)</label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                    className="input-field w-full min-h-[44px]" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Đến ngày (Không bắt buộc)</label>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)} 
                    className="input-field w-full min-h-[44px]" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Hình thức khuyến mãi</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { type: 'HAPPY_HOUR', label: 'Giờ vàng' },
                    { type: 'COMBO', label: 'Combo gộp' },
                    { type: 'BUY_X_GET_Y', label: 'Mua X tặng Y' }
                  ].map(t => (
                    <button 
                      key={t.type} 
                      type="button" 
                      onClick={() => setPromoType(t.type)} 
                      className={`py-3 px-2 rounded-xl border text-xs font-bold text-center transition-all ${
                        promoType === t.type 
                          ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent shadow-sm' 
                          : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 mt-4">
                
                {/* 1. HAPPY HOUR CONFIG FORM */}
                {promoType === 'HAPPY_HOUR' && (
                  <div className="space-y-4">
                    <span className="block text-xs font-bold text-coffee-dark uppercase tracking-wider mb-2">Cấu hình Giờ Vàng</span>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Giờ bắt đầu hiệu lực</label>
                        <input 
                          required 
                          type="time" 
                          value={hhStartHour} 
                          onChange={e => setHhStartHour(e.target.value)} 
                          className="input-field w-full min-h-[44px]" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Giờ kết thúc hiệu lực</label>
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
                      <label className="block text-xs font-bold text-gray-500 mb-1">Tỷ lệ giảm giá cho phép (%)</label>
                      <input 
                        required 
                        type="number" 
                        min="1" 
                        max="100" 
                        value={hhDiscountPct} 
                        onChange={e => setHhDiscountPct(Math.min(100, Math.max(1, parseInt(e.target.value) || 0)))} 
                        className="input-field w-full min-h-[44px]" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Áp dụng cho món (Bỏ trống = toàn bộ Menu)</label>
                      <select 
                        multiple 
                        value={hhProductIds} 
                        onChange={e => {
                          const options = [...e.target.selectedOptions];
                          const values = options.map(opt => opt.value);
                          setHhProductIds(values);
                        }} 
                        className="input-field w-full h-32 p-2 border border-gray-250 rounded-xl text-sm"
                      >
                        {menuList.map(p => (
                          <option key={p.id} value={p.id}>{p.name} - {p.price.toLocaleString()}đ</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1">Giữ Ctrl (hoặc Cmd) để chọn nhiều sản phẩm.</p>
                    </div>
                  </div>
                )}

                {/* 2. COMBO CONFIG FORM */}
                {promoType === 'COMBO' && (
                  <div className="space-y-4">
                    <span className="block text-xs font-bold text-coffee-dark uppercase tracking-wider mb-2">Cấu hình Đóng gói Combo</span>
                    
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-gray-500">Sản phẩm trong Combo</label>
                      {comboProducts.map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <select 
                            required 
                            value={item.productId} 
                            onChange={e => handleComboProductChange(idx, 'productId', e.target.value)} 
                            className="input-field flex-1 min-h-[40px] text-sm bg-white border border-gray-250 rounded-xl px-2"
                          >
                            <option value="">-- Chọn sản phẩm --</option>
                            {menuList.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.price.toLocaleString()}đ)</option>
                            ))}
                          </select>
                          <input 
                            required 
                            type="number" 
                            min="1" 
                            value={item.qty} 
                            onChange={e => handleComboProductChange(idx, 'qty', parseInt(e.target.value) || 1)} 
                            className="input-field w-16 min-h-[40px] text-center text-sm" 
                          />
                          {comboProducts.length > 1 && (
                            <button type="button" onClick={() => handleRemoveComboProduct(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      
                      <button 
                        type="button" 
                        onClick={handleAddComboProduct} 
                        className="text-xs font-bold text-coffee-accent hover:underline flex items-center gap-1 pt-1"
                      >
                        <Plus size={14} /> Thêm sản phẩm khác
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Giá bán gộp cả Combo (VNĐ)</label>
                      <input 
                        required 
                        type="number" 
                        min="1000" 
                        value={comboPrice} 
                        onChange={e => setComboPrice(parseInt(e.target.value) || 0)} 
                        className="input-field w-full min-h-[44px] text-sm" 
                        placeholder="VD: 55000" 
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
                        <label className="block text-xs font-bold text-gray-500 mb-1">Sản phẩm cần mua</label>
                        <select 
                          required 
                          value={buyProductId} 
                          onChange={e => setBuyProductId(e.target.value)} 
                          className="input-field w-full min-h-[44px] text-sm bg-white"
                        >
                          <option value="">-- Chọn sản phẩm --</option>
                          {menuList.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Số lượng mua tối thiểu</label>
                        <input 
                          required 
                          type="number" 
                          min="1" 
                          value={buyMinQty} 
                          onChange={e => setBuyMinQty(parseInt(e.target.value) || 1)} 
                          className="input-field w-full min-h-[44px]" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Sản phẩm được tặng</label>
                        <select 
                          required 
                          value={getProductId} 
                          onChange={e => setGetProductId(e.target.value)} 
                          className="input-field w-full min-h-[44px] text-sm bg-white"
                        >
                          <option value="">-- Chọn sản phẩm --</option>
                          {menuList.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Số lượng được tặng miễn phí</label>
                        <input 
                          required 
                          type="number" 
                          min="1" 
                          value={getFreeQty} 
                          onChange={e => setGetFreeQty(parseInt(e.target.value) || 1)} 
                          className="input-field w-full min-h-[44px]" 
                        />
                      </div>
                    </div>
                  </div>
                )}

              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-50">
                  Hủy bỏ
                </button>
                <button type="submit" className="px-5 py-2 btn-primary rounded-xl text-sm font-semibold flex items-center gap-1.5">
                  <Check size={16} /> Lưu chương trình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
