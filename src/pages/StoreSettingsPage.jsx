import { useState, useEffect } from 'react';
import { Settings, Save, Globe, Receipt, Gift, Percent, RefreshCw, AlertTriangle, CreditCard, Image as ImageIcon, Plug, CheckCircle } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';

const INTEGRATION_FIELDS = {
  payos: {
    title: 'payOS',
    config: [
      ['mode', 'Chế độ', 'production'],
      ['webhookUrl', 'Webhook URL', 'https://api.domain-cua-ban.vn/api/payments/payos-webhook']
    ],
    secrets: [
      ['clientId', 'Client ID'],
      ['apiKey', 'API Key'],
      ['checksumKey', 'Checksum Key'],
      ['webhookSecret', 'Webhook Secret']
    ]
  },
  einvoice: {
    title: 'Hóa đơn điện tử',
    config: [
      ['providerName', 'Nhà cung cấp', 'MISA / VNPT / Viettel'],
      ['apiUrl', 'API URL', 'https://sandbox.example.vn'],
      ['taxCode', 'Mã số thuế', '0312345678'],
      ['invoiceTemplate', 'Mẫu số', '1C25TYY'],
      ['invoiceSeries', 'Ký hiệu', 'C25TAA']
    ],
    secrets: [
      ['apiKey', 'API Key'],
      ['username', 'Username'],
      ['password', 'Password'],
      ['signingToken', 'Signing Token']
    ]
  },
  grabfood: {
    title: 'GrabFood',
    config: [
      ['apiUrl', 'API URL', 'https://partner-api.grab.com'],
      ['merchantId', 'Merchant ID', 'merchant_xxx'],
      ['storeCode', 'Mã cửa hàng', 'store_xxx']
    ],
    secrets: [
      ['apiKey', 'API Key'],
      ['clientSecret', 'Client Secret'],
      ['webhookSecret', 'Webhook Secret']
    ]
  },
  shopeefood: {
    title: 'ShopeeFood',
    config: [
      ['apiUrl', 'API URL', 'https://partner-api.shopeefood.vn'],
      ['merchantId', 'Merchant ID', 'merchant_xxx'],
      ['storeCode', 'Mã cửa hàng', 'store_xxx']
    ],
    secrets: [
      ['apiKey', 'API Key'],
      ['clientSecret', 'Client Secret'],
      ['webhookSecret', 'Webhook Secret']
    ]
  },
  web_order: {
    title: 'Website đặt món',
    config: [
      ['publicOrderUrl', 'URL đặt hàng', 'https://order.domain-cua-quan.vn'],
      ['channelName', 'Tên kênh', 'Website']
    ],
    secrets: [
      ['webhookSecret', 'Webhook Secret']
    ]
  }
};

export default function StoreSettingsPage() {
  const { showNotification } = useUI();
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'receipt', 'loyalty'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printerIp, setPrinterIp] = useState(localStorage.getItem('lan_printer_ip') || '');
  const [testingPrint, setTestingPrint] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [integrationSettings, setIntegrationSettings] = useState({});
  const [integrationSecrets, setIntegrationSecrets] = useState({});
  const [integrationSaving, setIntegrationSaving] = useState(null);
  const [settings, setSettings] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    logo: '',
    vatRate: 0.08,
    pointsRate: 0.1,
    currency: 'VNĐ',
    printHeader: '',
    printFooter: '',
    bankId: 'MB',
    bankAccountNo: '',
    bankAccountName: ''
  });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await api.get('/store/settings');
      if (data) {
        setSettings({
          name: data.name || '',
          code: data.code || '',
          address: data.address || '',
          phone: data.phone || '',
          logo: data.logo || '',
          vatRate: data.vatRate ?? 0.08,
          pointsRate: data.pointsRate ?? 0.1,
          currency: data.currency || 'VNĐ',
          printHeader: data.printHeader || '',
          printFooter: data.printFooter || '',
          bankId: data.bankId || 'MB',
          bankAccountNo: data.bankAccountNo || '',
          bankAccountName: data.bankAccountName || ''
        });
      }
      try {
        const settingsData = await api.get('/integrations/settings');
        setIntegrationSettings(settingsData?.integrations || {});
        const status = await api.get('/integrations/status');
        setIntegrationStatus(status);
      } catch {
        setIntegrationSettings({});
        setIntegrationStatus(null);
      }
    } catch {
      showNotification('Không thể tải cấu hình cửa hàng', 'error');
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (ready, pendingText = 'Cần cấu hình') => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
      ready ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
    }`}>
      {ready ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
      {ready ? 'Sẵn sàng' : pendingText}
    </span>
  );

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: name === 'vatRate' || name === 'pointsRate' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await api.put('/store/settings', settings);
      localStorage.setItem('lan_printer_ip', printerIp);
      showNotification('Lưu cấu hình thành công', 'success');
    } catch {
      showNotification('Lỗi khi lưu cấu hình', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateIntegrationConfig = (provider, field, value) => {
    setIntegrationSettings(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        config: {
          ...((prev[provider] || {}).config || {}),
          [field]: value
        }
      }
    }));
  };

  const updateIntegrationEnabled = (provider, checked) => {
    setIntegrationSettings(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        isEnabled: checked
      }
    }));
  };

  const updateIntegrationSecret = (provider, field, value) => {
    setIntegrationSecrets(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveIntegration = async (provider) => {
    const current = integrationSettings[provider] || {};
    setIntegrationSaving(provider);
    try {
      const saved = await api.put(`/integrations/settings/${provider}`, {
        isEnabled: Boolean(current.isEnabled),
        config: current.config || {},
        secrets: integrationSecrets[provider] || {}
      });
      setIntegrationSettings(prev => ({
        ...prev,
        [provider]: saved.integration
      }));
      setIntegrationSecrets(prev => ({
        ...prev,
        [provider]: {}
      }));
      const status = await api.get('/integrations/status');
      setIntegrationStatus(status);
      showNotification('Đã lưu cấu hình tích hợp cho cửa hàng này', 'success');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể lưu cấu hình tích hợp', 'error');
    } finally {
      setIntegrationSaving(null);
    }
  };

  const handleTestPrint = async (e) => {
    if (e) e.preventDefault();
    if (!printerIp.trim()) {
      alert('Vui lòng nhập địa chỉ IP máy in LAN');
      return;
    }
    setTestingPrint(true);
    try {
      await api.post('/print', {
        ip: printerIp,
        port: 9100,
        store: {
          name: settings.name || 'QUAN TEST IN',
          code: settings.code || '',
          address: settings.address || '123 Duong Test',
          phone: settings.phone || '0987654321',
          printFooter: settings.printFooter || 'Cam on da in thu!'
        },
        order: {
          orderNumber: 'HD-TEST-123',
          tableName: 'Ban Test',
          subtotal: 50000,
          discountAmount: 10000,
          vatAmount: 3200,
          total: 43200,
          paymentMethod: 'cash',
          items: [
            { name: 'Ca phe Sua da', qty: 2, price: 20000, sugar: '50%', ice: 'It da' },
            { name: 'Tra Dao Cam Sa', qty: 1, price: 10000, sugar: '100%', ice: 'Nhiều đá', note: 'It ngọt' }
          ]
        }
      });
      showNotification('Đã gửi lệnh in thử thành công', 'success');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Lỗi kết nối máy in LAN', 'error');
    } finally {
      setTestingPrint(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-cream-light">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-coffee-medium animate-spin" />
          <p className="text-coffee-medium font-semibold text-sm">Đang tải cấu hình cửa hàng...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2.5">
              <Settings className="text-coffee-medium" /> Cấu hình cửa hàng
            </h1>
            <p className="page-subtitle">
              Thiết lập thông tin cửa hàng, mẫu hóa đơn in ấn và chính sách tích điểm.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px] px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold shadow-sm flex items-center gap-2 active:scale-98 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Lưu cấu hình</span>
          </button>
        </div>

      <div className="max-w-6xl bg-white rounded-lg border border-surface-border shadow-card overflow-hidden flex flex-col md:flex-row min-h-[500px]">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-60 bg-surface-muted/70 border-r border-surface-border p-4 space-y-1">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'general'
                ? 'bg-coffee-accent text-white shadow-sm'
                : 'text-coffee-medium hover:bg-cream-light/80 hover:text-coffee-dark'
            }`}
          >
            <Globe size={18} />
            <span>Thông tin chung</span>
          </button>

          <button
            onClick={() => setActiveTab('receipt')}
            className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'receipt'
                ? 'bg-coffee-accent text-white shadow-sm'
                : 'text-coffee-medium hover:bg-cream-light/80 hover:text-coffee-dark'
            }`}
          >
            <Receipt size={18} />
            <span>Hóa đơn in ấn</span>
          </button>

          <button
            onClick={() => setActiveTab('loyalty')}
            className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'loyalty'
                ? 'bg-coffee-accent text-white shadow-sm'
                : 'text-coffee-medium hover:bg-cream-light/80 hover:text-coffee-dark'
            }`}
          >
            <Gift size={18} />
            <span>Tích lũy & VAT</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bank')}
            className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'bank'
                ? 'bg-coffee-accent text-white shadow-sm'
                : 'text-coffee-medium hover:bg-cream-light/80 hover:text-coffee-dark'
            }`}
          >
            <CreditCard size={18} />
            <span>Tài khoản ngân hàng</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('printer')}
            className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'printer'
                ? 'bg-coffee-accent text-white shadow-sm'
                : 'text-coffee-medium hover:bg-cream-light/80 hover:text-coffee-dark'
            }`}
          >
            <Receipt size={18} />
            <span>Thiết bị in LAN</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'integrations'
                ? 'bg-coffee-accent text-white shadow-sm'
                : 'text-coffee-medium hover:bg-cream-light/80 hover:text-coffee-dark'
            }`}
          >
            <Plug size={18} />
            <span>Tích hợp ngoài</span>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSave} className="flex-1 p-6 lg:p-8 space-y-6">
          {activeTab === 'general' && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-coffee-light/10 pb-4">
                <h2 className="text-lg font-bold text-coffee-dark">Thông tin cơ bản</h2>
                <p className="text-xs text-coffee-medium/70">Thông tin xuất hiện trên hóa đơn và trang quản trị.</p>
              </div>

              {/* Logo Preview and Link */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-20 h-20 rounded-lg bg-cream-light border border-coffee-light/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {settings.logo ? (
                    <img src={settings.logo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-coffee-medium/40" />
                  )}
                </div>
                <div className="flex-1 w-full space-y-1.5">
                  <label className="text-xs font-semibold text-coffee-medium">Đường dẫn logo (URL)</label>
                  <input
                    type="text"
                    name="logo"
                    value={settings.logo}
                    onChange={handleChange}
                    placeholder="https://example.com/logo.png"
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-coffee-medium">Tên cửa hàng</label>
                  <input
                    type="text"
                    name="name"
                    value={settings.name}
                    onChange={handleChange}
                    required
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-coffee-medium">Mã cửa hàng</label>
                  <input
                    type="text"
                    value={settings.code}
                    disabled
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 bg-cream-light/30 text-coffee-medium/60 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-coffee-medium">Số điện thoại</label>
                  <input
                    type="text"
                    name="phone"
                    value={settings.phone}
                    onChange={handleChange}
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-coffee-medium">Đơn vị tiền tệ</label>
                  <input
                    type="text"
                    name="currency"
                    value={settings.currency}
                    onChange={handleChange}
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-coffee-medium">Địa chỉ cửa hàng</label>
                <textarea
                  name="address"
                  value={settings.address}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white resize-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'receipt' && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-coffee-light/10 pb-4">
                <h2 className="text-lg font-bold text-coffee-dark">Hóa đơn & In ấn</h2>
                <p className="text-xs text-coffee-medium/70">Tùy biến tiêu đề đầu và chân hóa đơn của phiếu thanh toán POS.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-coffee-medium flex items-center gap-1">
                  <span>Tiêu đề hóa đơn</span>
                  <span className="text-[10px] text-coffee-medium/50">(Hiển thị ở dòng đầu, ví dụ: Chào mừng quý khách)</span>
                </label>
                <textarea
                  name="printHeader"
                  value={settings.printHeader}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Hân hạnh phục vụ quý khách!&#10;Wifi: espresso_guest / Pass: 88888888"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-coffee-medium flex items-center gap-1">
                  <span>Chân hóa đơn</span>
                  <span className="text-[10px] text-coffee-medium/50">(Hiển thị ở dòng cuối, ví dụ: Hẹn gặp lại)</span>
                </label>
                <textarea
                  name="printFooter"
                  value={settings.printFooter}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Cảm ơn và hẹn gặp lại quý khách!&#10;Thiết kế bởi Manager Coffee"
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white resize-none"
                />
              </div>

              <div className="bg-cream-light/40 border border-coffee-light/10 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-coffee-accent flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-coffee-dark">Mẹo tùy chỉnh hóa đơn:</h4>
                  <p className="text-xs text-coffee-medium/80 leading-relaxed">
                    Nội dung bổ sung sẽ được in dưới phần tổng tiền trên hóa đơn.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'loyalty' && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-coffee-light/10 pb-4">
                <h2 className="text-lg font-bold text-coffee-dark">Thuế VAT & Chương trình tích điểm</h2>
                <p className="text-xs text-coffee-medium/70">Quy định mức thuế mặc định và cài đặt tỷ lệ tích điểm khách hàng thân thiết.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-coffee-medium flex items-center gap-1.5">
                    <Percent size={14} className="text-coffee-accent" />
                    <span>Thuế suất VAT mặc định</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="vatRate"
                      value={settings.vatRate}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      max="1"
                      className="w-full min-h-[40px] pl-3.5 pr-10 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-coffee-medium font-bold">
                      {Math.round(settings.vatRate * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-coffee-medium/60 leading-relaxed">
                    Thuế suất tính vào đơn hàng (ví dụ: 0.08 đại diện cho 8% VAT).
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-coffee-medium flex items-center gap-1.5">
                    <Gift size={14} className="text-coffee-accent" />
                    <span>Tỷ lệ tích lũy điểm</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="pointsRate"
                      value={settings.pointsRate}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      max="1"
                      className="w-full min-h-[40px] pl-3.5 pr-10 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-coffee-medium font-bold">
                      {Math.round(settings.pointsRate * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-coffee-medium/60 leading-relaxed">
                    Tỷ lệ đổi tổng hóa đơn sang điểm (ví dụ: 0.1 nghĩa là đơn 100,000đ được cộng 10,000 điểm).
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bank' && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-coffee-light/10 pb-4">
                <h2 className="text-lg font-bold text-coffee-dark">Thông tin ngân hàng nhận tiền</h2>
                <p className="text-xs text-coffee-medium/70">Cấu hình tài khoản ngân hàng để hệ thống tự động tạo mã QR động nhận thanh toán.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-coffee-medium">Tên viết tắt ngân hàng (Ví dụ: MB, VCB, ACB)</label>
                  <input
                    type="text"
                    name="bankId"
                    value={settings.bankId}
                    onChange={handleChange}
                    placeholder="Ví dụ: MB"
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-coffee-medium">Số tài khoản ngân hàng</label>
                  <input
                    type="text"
                    name="bankAccountNo"
                    value={settings.bankAccountNo}
                    onChange={handleChange}
                    placeholder="Nhập số tài khoản"
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-coffee-medium">Tên hiển thị chủ tài khoản (Không dấu)</label>
                <input
                  type="text"
                  name="bankAccountName"
                  value={settings.bankAccountName}
                  onChange={handleChange}
                  placeholder="Ví dụ: NGUYEN VAN A"
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                />
              </div>
            </div>
          )}

          {activeTab === 'printer' && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-coffee-light/10 pb-4">
                <h2 className="text-lg font-bold text-coffee-dark">Cấu hình máy in hóa đơn LAN</h2>
                <p className="text-xs text-coffee-medium/70">Thiết lập kết nối với máy in bill nhiệt cổng mạng LAN (ESC/POS cổng 9100) của quầy thu ngân này.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-coffee-medium">Địa chỉ IP Máy in LAN (Ví dụ: 192.168.1.100)</label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={printerIp}
                      onChange={(e) => setPrinterIp(e.target.value)}
                      placeholder="Nhập địa chỉ IP máy in"
                      className="flex-1 min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleTestPrint}
                      disabled={testingPrint}
                      className="min-h-[40px] px-4 bg-coffee-accent hover:bg-primary-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {testingPrint ? 'Đang gửi...' : 'In thử hóa đơn'}
                    </button>
                  </div>
                  <p className="text-[10px] text-coffee-medium/60 leading-relaxed">
                    Máy in phải kết nối chung mạng LAN với thiết bị này. Nếu bỏ trống, hệ thống sẽ tự động in bằng hộp thoại in của trình duyệt làm phương án dự phòng.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-coffee-light/10 pb-4">
                <h2 className="text-lg font-bold text-coffee-dark">Tích hợp theo từng cửa hàng</h2>
                <p className="text-xs text-coffee-medium/70">Mỗi cửa hàng dùng tài khoản/API key riêng của chính cửa hàng đó.</p>
              </div>

              <div className="divide-y divide-coffee-light/10 rounded-lg border border-coffee-light/10 overflow-hidden">
                <div className="flex items-center justify-between gap-4 p-4 bg-white">
                  <div>
                    <p className="text-sm font-bold text-coffee-dark">QR ngân hàng</p>
                    <p className="text-xs text-coffee-medium/70 mt-0.5">
                      {integrationStatus?.payments?.vietQr?.bankId || settings.bankId || 'Chưa chọn ngân hàng'} · {integrationStatus?.payments?.vietQr?.hasAccountNo ? 'Đã có số tài khoản' : 'Thiếu số tài khoản'}
                    </p>
                  </div>
                  {statusBadge(Boolean(integrationStatus?.payments?.vietQr?.configured))}
                </div>

                <div className="flex items-center justify-between gap-4 p-4 bg-white">
                  <div>
                    <p className="text-sm font-bold text-coffee-dark">Webhook thanh toán</p>
                    <p className="text-xs text-coffee-medium/70 mt-0.5">
                      Đối soát theo mã cửa hàng; fallback toàn hệ thống chỉ bật trong dev/test.
                    </p>
                  </div>
                  {statusBadge(Boolean(integrationStatus?.payments?.webhook?.protected), 'Nên thêm secret')}
                </div>

                <div className="flex items-center justify-between gap-4 p-4 bg-white">
                  <div>
                    <p className="text-sm font-bold text-coffee-dark">Hóa đơn điện tử</p>
                    <p className="text-xs text-coffee-medium/70 mt-0.5">
                      {integrationStatus?.invoice?.provider || 'Chưa chọn nhà cung cấp HĐĐT'}
                    </p>
                  </div>
                  {statusBadge(Boolean(integrationStatus?.invoice?.configured))}
                </div>

                <div className="flex items-center justify-between gap-4 p-4 bg-white">
                  <div>
                    <p className="text-sm font-bold text-coffee-dark">GrabFood / ShopeeFood</p>
                    <p className="text-xs text-coffee-medium/70 mt-0.5">
                      GrabFood: {integrationStatus?.delivery?.grabFood?.configured ? 'đã cấu hình' : 'thiếu API key'} · ShopeeFood: {integrationStatus?.delivery?.shopeeFood?.configured ? 'đã cấu hình' : 'thiếu API key'}
                    </p>
                  </div>
                  {statusBadge(Boolean(integrationStatus?.delivery?.grabFood?.configured && integrationStatus?.delivery?.shopeeFood?.configured))}
                </div>

                <div className="flex items-center justify-between gap-4 p-4 bg-white">
                  <div>
                    <p className="text-sm font-bold text-coffee-dark">Máy in bill LAN</p>
                    <p className="text-xs text-coffee-medium/70 mt-0.5">
                      {printerIp ? `IP quầy này: ${printerIp}` : 'Chưa lưu IP máy in trên trình duyệt này'}
                    </p>
                  </div>
                  {statusBadge(Boolean(printerIp), 'Dùng in trình duyệt')}
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(INTEGRATION_FIELDS).map(([provider, meta]) => {
                  const current = integrationSettings[provider] || {};
                  const config = current.config || {};
                  const secretFlags = current.secretsConfigured || {};
                  const pendingSecrets = integrationSecrets[provider] || {};

                  return (
                    <div key={provider} className="rounded-lg border border-coffee-light/10 bg-white p-4 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-coffee-dark">{meta.title}</p>
                          <p className="text-xs text-coffee-medium/70 mt-0.5">
                            {current.updatedAt ? 'Đã có cấu hình cho cửa hàng này' : 'Chưa lưu cấu hình'}
                          </p>
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-coffee-medium">
                          <input
                            type="checkbox"
                            checked={Boolean(current.isEnabled)}
                            onChange={(e) => updateIntegrationEnabled(provider, e.target.checked)}
                            className="w-4 h-4 accent-coffee-accent"
                          />
                          Bật
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {meta.config.map(([field, label, placeholder]) => (
                          <div key={field} className="space-y-1.5">
                            <label className="text-xs font-semibold text-coffee-medium">{label}</label>
                            <input
                              type="text"
                              value={config[field] || ''}
                              onChange={(e) => updateIntegrationConfig(provider, field, e.target.value)}
                              placeholder={placeholder || label}
                              className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {meta.secrets.map(([field, label]) => (
                          <div key={field} className="space-y-1.5">
                            <label className="text-xs font-semibold text-coffee-medium flex items-center justify-between gap-2">
                              <span>{label}</span>
                              {secretFlags[field] ? (
                                <span className="text-[10px] text-emerald-700 font-bold">Đã lưu</span>
                              ) : (
                                <span className="text-[10px] text-amber-700 font-bold">Chưa có</span>
                              )}
                            </label>
                            <input
                              type="password"
                              value={pendingSecrets[field] || ''}
                              onChange={(e) => updateIntegrationSecret(provider, field, e.target.value)}
                              placeholder={secretFlags[field] ? 'Để trống nếu không đổi' : label}
                              className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-white"
                              autoComplete="new-password"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveIntegration(provider)}
                          disabled={integrationSaving === provider}
                          className="min-h-[40px] px-4 bg-coffee-accent hover:bg-primary-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {integrationSaving === provider && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                          <span>Lưu {meta.title}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>
        </div>
      </div>
    </div>
  );
}
