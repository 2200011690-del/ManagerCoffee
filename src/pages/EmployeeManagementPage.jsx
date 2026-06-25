import { useState, useEffect } from 'react';
import { Users, Plus, Shield, User, Trash2, Edit2, X, Clock, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';

export default function EmployeeManagementPage() {
  const [activeTab, setActiveTab] = useState('staff'); // 'staff', 'attendance', 'shifts'
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals / forms
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', pin: '', role: 'staff' });

  // Logs state
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [shiftLogs, setShiftLogs] = useState([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data);
    } catch (err) {
      setError('Không thể tải danh sách nhân viên');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceLogs = async () => {
    setLoadingAttendance(true);
    try {
      const data = await api.get('/attendance/logs');
      setAttendanceLogs(data);
    } catch (err) {
      setError('Không thể tải lịch sử chấm công');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const fetchShiftLogs = async () => {
    setLoadingShifts(true);
    try {
      const data = await api.get('/shifts/logs');
      setShiftLogs(data);
    } catch (err) {
      setError('Không thể tải lịch sử bàn giao ca');
    } finally {
      setLoadingShifts(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchUsers();
    } else if (activeTab === 'attendance') {
      fetchAttendanceLogs();
    } else if (activeTab === 'shifts') {
      fetchShiftLogs();
    }
  }, [activeTab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, formData);
      } else {
        await api.post('/users', formData);
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Lưu thất bại');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa nhân viên này?')) return;
    try {
      await api.delete(`/users/${id}`);
      fetchUsers();
    } catch (err) {
      setError('Lỗi khi xóa nhân viên');
    }
  };

  const openAdd = () => {
    setEditingUser(null);
    setFormData({ name: '', pin: '', role: 'staff' });
    setIsModalOpen(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setFormData({ name: u.name, pin: u.pin, role: u.role });
    setIsModalOpen(true);
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '--:--';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  const formatDateOnly = (dateStr) => {
    if (!dateStr) return '';
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return new Date(dateStr).toLocaleDateString('vi-VN');
  };

  return (
    <div className="h-full bg-cream-light overflow-y-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-coffee-dark mb-1">Quản lý Nhân sự</h1>
            <p className="text-coffee-medium text-sm">Thiết lập nhân viên, theo dõi lịch sử chấm công và bàn giao két tiền mặt</p>
          </div>
          {activeTab === 'staff' && (
            <button onClick={openAdd} className="btn-primary min-h-[44px] px-5 flex items-center gap-2">
              <Plus size={18} />
              Thêm nhân sự mới
            </button>
          )}
        </div>

        {/* Custom Tab Panel */}
        <div className="flex border-b border-cream-medium/40 gap-6">
          <button
            onClick={() => setActiveTab('staff')}
            className={`pb-3 font-semibold text-sm transition-all relative ${activeTab === 'staff' ? 'text-coffee-accent font-bold' : 'text-coffee-light hover:text-coffee-dark'}`}
          >
            Danh sách nhân viên
            {activeTab === 'staff' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-coffee-accent rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`pb-3 font-semibold text-sm transition-all relative ${activeTab === 'attendance' ? 'text-coffee-accent font-bold' : 'text-coffee-light hover:text-coffee-dark'}`}
          >
            Bảng công điểm danh
            {activeTab === 'attendance' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-coffee-accent rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab('shifts')}
            className={`pb-3 font-semibold text-sm transition-all relative ${activeTab === 'shifts' ? 'text-coffee-accent font-bold' : 'text-coffee-light hover:text-coffee-dark'}`}
          >
            Lịch sử giao ca
            {activeTab === 'shifts' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-coffee-accent rounded-full" />}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        {/* Tab 1: Staff list */}
        {activeTab === 'staff' && (
          loading ? (
            <p className="text-center py-10 text-coffee-medium">Đang tải danh sách nhân viên...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
              {users.map(u => (
                <div key={u.id} className="bg-white p-5 rounded-2xl shadow-card border border-cream-medium/30 flex flex-col hover:shadow-coffee-sm transition-all duration-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                      style={{ background: u.role === 'admin' ? 'linear-gradient(135deg, #A76D42, #C8956C)' : '#9ca3af' }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-coffee-dark truncate">{u.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {u.role === 'admin' ? <Shield size={12} className="text-coffee-gold" /> : <User size={12} className="text-gray-400" />}
                        <span className={`text-xs font-semibold uppercase ${u.role === 'admin' ? 'text-coffee-gold' : 'text-gray-400'}`}>
                          {u.role === 'admin' ? 'Quản lý' : 'Nhân viên'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-auto border-t border-gray-100 pt-3 flex items-center justify-between">
                    <p className="text-xs text-gray-500 font-mono flex items-center gap-1">PIN: <span className="font-bold text-gray-700 tracking-widest">{u.pin}</span></p>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-coffee-accent transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(u.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Tab 2: Attendance sheet */}
        {activeTab === 'attendance' && (
          loadingAttendance ? (
            <p className="text-center py-10 text-coffee-medium">Đang tải lịch sử chấm công...</p>
          ) : attendanceLogs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card p-12 text-center text-coffee-medium">
              <Clock size={40} className="mx-auto mb-3 text-coffee-light/40" />
              <p className="font-semibold">Chưa có lịch sử chấm công</p>
              <p className="text-xs text-gray-400 mt-0.5">Nhân viên sử dụng nút "Điểm danh nhanh" trên thanh bên để check-in / check-out</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card border border-cream-medium/30 overflow-hidden animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-cream-light/40 text-coffee-medium text-xs uppercase tracking-wider border-b border-cream-medium/30">
                      <th className="px-6 py-4 font-bold">Nhân sự</th>
                      <th className="px-6 py-4 font-bold">Ngày</th>
                      <th className="px-6 py-4 font-bold">Giờ vào (Clock In)</th>
                      <th className="px-6 py-4 font-bold">Giờ ra (Clock Out)</th>
                      <th className="px-6 py-4 font-bold">Tổng giờ làm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-medium/10 text-sm text-coffee-dark">
                    {attendanceLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-cream-light/10 transition-colors">
                        <td className="px-6 py-4.5 font-semibold flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-coffee-accent/10 text-coffee-accent flex items-center justify-center font-bold text-xs">
                            {log.user.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{log.user.name}</span>
                        </td>
                        <td className="px-6 py-4.5 font-mono text-gray-500">{formatDateOnly(log.date)}</td>
                        <td className="px-6 py-4.5 text-green-600 font-mono font-semibold">
                          {new Date(log.clockIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4.5 font-mono">
                          {log.clockOut ? (
                            <span className="text-amber-600 font-semibold">
                              {new Date(log.clockOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold border border-green-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              Đang làm việc
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4.5 font-mono font-bold">
                          {log.totalHours !== null ? `${log.totalHours} giờ` : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* Tab 3: Shift Logs */}
        {activeTab === 'shifts' && (
          loadingShifts ? (
            <p className="text-center py-10 text-coffee-medium">Đang tải lịch sử giao ca...</p>
          ) : shiftLogs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card p-12 text-center text-coffee-medium">
              <Calendar size={40} className="mx-auto mb-3 text-coffee-light/40" />
              <p className="font-semibold">Chưa có lịch sử giao ca</p>
              <p className="text-xs text-gray-400 mt-0.5">Lịch sử mở/đóng ca két tiền mặt của thu ngân POS sẽ được hiển thị ở đây</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card border border-cream-medium/30 overflow-hidden animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-cream-light/40 text-coffee-medium text-xs uppercase tracking-wider border-b border-cream-medium/30">
                      <th className="px-5 py-4 font-bold">Thu ngân</th>
                      <th className="px-5 py-4 font-bold">Mở ca</th>
                      <th className="px-5 py-4 font-bold">Đóng ca</th>
                      <th className="px-5 py-4 font-bold text-right">Tiền lẻ đầu ca</th>
                      <th className="px-5 py-4 font-bold text-right">Mặt tích lũy</th>
                      <th className="px-5 py-4 font-bold text-right">Thực tế két</th>
                      <th className="px-5 py-4 font-bold text-right">Chênh lệch</th>
                      <th className="px-5 py-4">Ghi chú bàn giao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-medium/10 text-xs text-coffee-dark">
                    {shiftLogs.map((log) => {
                      const isLethal = log.discrepancy !== null && log.discrepancy !== 0;
                      return (
                        <tr key={log.id} className="hover:bg-cream-light/10 transition-colors">
                          <td className="px-5 py-4 font-semibold flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-coffee-accent/10 text-coffee-accent flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {log.user.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate max-w-[80px]">{log.user.name}</span>
                          </td>
                          <td className="px-5 py-4 font-mono text-gray-500">
                            {formatDateTime(log.openedAt)}
                          </td>
                          <td className="px-5 py-4 font-mono text-gray-500">
                            {log.closedAt ? formatDateTime(log.closedAt) : (
                              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-bold border border-green-200">
                                Đang mở
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-semibold">
                            {log.openingCash.toLocaleString('vi-VN')}đ
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-semibold text-green-600">
                            {log.cashSales.toLocaleString('vi-VN')}đ
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-bold">
                            {log.actualCash !== null ? `${log.actualCash.toLocaleString('vi-VN')}đ` : '--'}
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-bold">
                            {log.discrepancy !== null ? (
                              log.discrepancy === 0 ? (
                                <span className="text-green-600">0đ</span>
                              ) : log.discrepancy > 0 ? (
                                <span className="text-blue-600">+{log.discrepancy.toLocaleString('vi-VN')}đ</span>
                              ) : (
                                <span className="text-red-500">{log.discrepancy.toLocaleString('vi-VN')}đ</span>
                              )
                            ) : '--'}
                          </td>
                          <td className="px-5 py-4 max-w-[150px] truncate font-medium text-gray-500">
                            {log.notes || '-'}
                            {isLethal && (
                              <span className="ml-1 inline-block text-[10px] text-red-500 bg-red-50 px-1 py-0.5 rounded font-bold border border-red-200">
                                LỆCH KÉT
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-cream-light/30">
              <h2 className="font-display font-bold text-coffee-dark text-lg">
                {editingUser ? 'Sửa thông tin nhân sự' : 'Thêm nhân sự mới'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Tên hiển thị</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input-field w-full min-h-[44px]" placeholder="VD: Nguyễn Văn A" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Mã PIN (4 chữ số)</label>
                <input required type="text" pattern="\d{4}" value={formData.pin} onChange={e => setFormData({...formData, pin: e.target.value})} className="input-field w-full min-h-[44px] font-mono tracking-widest" placeholder="VD: 1234" maxLength={4} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Phân quyền</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setFormData({...formData, role: 'staff'})} className={`py-3 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-2 ${formData.role === 'staff' ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent' : 'border-gray-200 text-gray-500'}`}>
                    <User size={16} /> Nhân viên
                  </button>
                  <button type="button" onClick={() => setFormData({...formData, role: 'admin'})} className={`py-3 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-2 ${formData.role === 'admin' ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent' : 'border-gray-200 text-gray-500'}`}>
                    <Shield size={16} /> Quản lý
                  </button>
                </div>
              </div>
              
              <div className="pt-2">
                <button type="submit" className="w-full btn-primary min-h-[48px]">
                  {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
