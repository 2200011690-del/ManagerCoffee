import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Shield, User, Trash2, Edit2, X, Clock, Calendar, Camera, Phone } from 'lucide-react';
import { api } from '../api';

export default function EmployeeManagementPage() {
  const [activeTab, setActiveTab] = useState('staff'); // 'staff', 'attendance', 'shifts'
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals / forms
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    pin: '',
    role: 'staff',
    canApplyDiscount: true,
    canRefund: true,
    canViewReports: false,
    maxDiscountPct: 100,
    phone: '',
    address: '',
    cccd: '',
    dateOfBirth: '',
    startDate: '',
    hourlyRate: 25000
  });

  // Logs state
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [shiftLogs, setShiftLogs] = useState([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  // Salary states
  const [salaryReport, setSalaryReport] = useState([]);
  const [loadingSalary, setLoadingSalary] = useState(false);
  const [salaryStartDate, setSalaryStartDate] = useState(() => {
    const start = new Date();
    start.setDate(1);
    return start.toISOString().split('T')[0];
  });
  const [salaryEndDate, setSalaryEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedSalaryDetail, setSelectedSalaryDetail] = useState(null);
  const [profileUser, setProfileUser] = useState(null);

  // Attendance manual edit states
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState(null);
  const [attendanceFormData, setAttendanceFormData] = useState({
    userId: '',
    date: '',
    clockIn: '',
    clockOut: ''
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data);
    } catch {
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
    } catch {
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
    } catch {
      setError('Không thể tải lịch sử bàn giao ca');
    } finally {
      setLoadingShifts(false);
    }
  };

  const fetchSalaryReport = useCallback(async () => {
    setLoadingSalary(true);
    try {
      const data = await api.get('/users/salary-report', {
        params: {
          startDate: salaryStartDate,
          endDate: salaryEndDate
        }
      });
      setSalaryReport(data);
    } catch {
      setError('Không thể tải báo cáo tính lương');
    } finally {
      setLoadingSalary(false);
    }
  }, [salaryEndDate, salaryStartDate]);

  const handleUpdateHourlyRate = async (userId, rate) => {
    try {
      await api.put(`/users/${userId}`, { hourlyRate: Number(rate) || 0 });
      setSalaryReport(prev => prev.map(u => {
        if (u.id === userId) {
          const totalSalary = Math.round((u.totalHours || 0) * (Number(rate) || 0));
          return { ...u, hourlyRate: Number(rate) || 0, totalSalary };
        }
        return u;
      }));
    } catch {
      setError('Không thể cập nhật mức lương');
    }
  };

  const openAddAttendance = () => {
    setEditingAttendance(null);
    const today = new Date().toISOString().split('T')[0];
    setAttendanceFormData({
      userId: users[0]?.id || '',
      date: today,
      clockIn: new Date().toISOString().slice(0, 16),
      clockOut: ''
    });
    setIsAttendanceModalOpen(true);
  };

  const openEditAttendance = (log) => {
    setEditingAttendance(log);
    
    const toLocalDateTimeString = (dateStr) => {
      const d = new Date(dateStr);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${date}T${hours}:${minutes}`;
    };

    setAttendanceFormData({
      userId: log.userId,
      date: log.date,
      clockIn: toLocalDateTimeString(log.clockIn),
      clockOut: log.clockOut ? toLocalDateTimeString(log.clockOut) : ''
    });
    setIsAttendanceModalOpen(true);
  };

  const handleAttendanceSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        userId: attendanceFormData.userId,
        date: attendanceFormData.date,
        clockIn: new Date(attendanceFormData.clockIn).toISOString(),
        clockOut: attendanceFormData.clockOut ? new Date(attendanceFormData.clockOut).toISOString() : null
      };

      if (editingAttendance) {
        await api.put(`/attendance/${editingAttendance.id}`, payload);
      } else {
        await api.post('/attendance', payload);
      }
      setIsAttendanceModalOpen(false);
      fetchAttendanceLogs();
    } catch (err) {
      setError(err.response?.data?.error || 'Lưu chấm công thất bại');
    }
  };

  const handleAttendanceDelete = async (id) => {
    if (!window.confirm('Xóa ngày công chấm công này?')) return;
    try {
      await api.delete(`/attendance/${id}`);
      fetchAttendanceLogs();
    } catch {
      setError('Lỗi khi xóa ngày công');
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchUsers();
    } else if (activeTab === 'attendance') {
      fetchAttendanceLogs();
    } else if (activeTab === 'shifts') {
      fetchShiftLogs();
    } else if (activeTab === 'salary') {
      fetchSalaryReport();
    }
  }, [activeTab, salaryStartDate, salaryEndDate, fetchSalaryReport]);

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
    } catch {
      setError('Lỗi khi xóa nhân viên');
    }
  };

  const openAdd = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      pin: '',
      role: 'staff',
      canApplyDiscount: true,
      canRefund: true,
      canViewReports: false,
      maxDiscountPct: 100,
      phone: '',
      address: '',
      cccd: '',
      dateOfBirth: '',
      startDate: new Date().toISOString().split('T')[0],
      hourlyRate: 25000
    });
    setIsModalOpen(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setFormData({
      name: u.name,
      pin: '',
      role: u.role,
      canApplyDiscount: u.canApplyDiscount !== undefined ? u.canApplyDiscount : true,
      canRefund: u.canRefund !== undefined ? u.canRefund : true,
      canViewReports: u.canViewReports !== undefined ? u.canViewReports : false,
      maxDiscountPct: u.maxDiscountPct !== undefined ? u.maxDiscountPct : 100,
      phone: u.phone || '',
      address: u.address || '',
      cccd: u.cccd || '',
      dateOfBirth: u.dateOfBirth || '',
      startDate: u.startDate || '',
      hourlyRate: u.hourlyRate !== undefined ? u.hourlyRate : 25000
    });
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
    <div className="page-shell">
      <div className="page-container">
        
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Quản lý nhân sự</h1>
            <p className="page-subtitle">Thiết lập nhân viên, theo dõi lịch sử chấm công và bàn giao két tiền mặt</p>
          </div>
          {(activeTab === 'staff' || activeTab === 'salary') && (
            <button onClick={openAdd} className="btn-primary min-h-[44px] px-5 flex items-center gap-2">
              <Plus size={18} />
              Thêm nhân sự mới
            </button>
          )}
          {activeTab === 'attendance' && (
            <button onClick={openAddAttendance} className="btn-primary min-h-[44px] px-5 flex items-center gap-2">
              <Plus size={18} />
              Thêm ngày công
            </button>
          )}
        </div>

        {/* Tab Panel */}
        <div className="tab-strip w-fit max-w-full overflow-x-auto">
          <button
            onClick={() => setActiveTab('staff')}
            className={`tab-button whitespace-nowrap ${activeTab === 'staff' ? 'tab-button-active' : 'tab-button-inactive'}`}
          >
            Danh sách nhân viên
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`tab-button whitespace-nowrap ${activeTab === 'attendance' ? 'tab-button-active' : 'tab-button-inactive'}`}
          >
            Bảng công điểm danh
          </button>
          <button
            onClick={() => setActiveTab('shifts')}
            className={`tab-button whitespace-nowrap ${activeTab === 'shifts' ? 'tab-button-active' : 'tab-button-inactive'}`}
          >
            Lịch sử giao ca
          </button>
          <button
            onClick={() => setActiveTab('salary')}
            className={`tab-button whitespace-nowrap ${activeTab === 'salary' ? 'tab-button-active' : 'tab-button-inactive'}`}
          >
            Bảng tính lương
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
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
                <div key={u.id} className="bg-white p-5 rounded-lg shadow-card border border-cream-medium/30 flex flex-col hover:shadow-coffee-sm transition-all duration-200">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                        style={{ background: u.role === 'admin' ? 'linear-gradient(135deg, #2563EB, #0EA5E9)' : '#9ca3af' }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-coffee-dark truncate max-w-[120px]">{u.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {u.role === 'admin' ? <Shield size={12} className="text-coffee-gold" /> : <User size={12} className="text-gray-400" />}
                          <span className={`text-xs font-semibold uppercase ${u.role === 'admin' ? 'text-coffee-gold' : 'text-gray-400'}`}>
                            {u.role === 'admin' ? 'Quản lý' : 'Nhân viên'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setProfileUser(u)}
                      className="px-2.5 py-1 bg-cream-light hover:bg-cream-medium text-coffee-dark border border-cream-medium/30 rounded-lg text-[10px] font-bold transition-all"
                    >
                      Hồ sơ lý lịch
                    </button>
                  </div>
                  
                  <div className="mt-2.5 text-[11px] space-y-1 text-gray-500 border-t border-gray-100 pt-2.5 font-medium">
                    {u.phone && <div className="flex items-center gap-1.5"><Phone size={11} className="text-gray-400" /> <span>{u.phone}</span></div>}
                    <div className="flex items-center gap-1.5"><Calendar size={11} className="text-gray-400" /> <span>Ngày vào: {u.startDate ? formatDateOnly(u.startDate) : 'Chưa cập nhật'}</span></div>
                    <div className="flex items-center gap-1.5"><Clock size={11} className="text-gray-400" /> <span>Lương: <span className="font-bold text-coffee-accent">{(u.hourlyRate || 25000).toLocaleString('vi-VN')}đ/giờ</span></span></div>
                  </div>

                  {u.role === 'staff' && (
                    <div className="mt-2.5 text-[11px] space-y-0.5 text-gray-400 border-t border-dashed border-gray-100 pt-2">
                      <div>Giảm giá: <span className="font-semibold text-gray-600">{u.canApplyDiscount ? `Tối đa ${u.maxDiscountPct}%` : 'Không'}</span></div>
                      <div>Trả hàng: <span className="font-semibold text-gray-600">{u.canRefund ? 'Có' : 'Không'}</span></div>
                      <div>Xem báo cáo: <span className="font-semibold text-gray-600">{u.canViewReports ? 'Có' : 'Không'}</span></div>
                    </div>
                  )}
                  
                  <div className="mt-auto border-t border-gray-100 pt-3 flex items-center justify-between">
                    <p className="text-xs text-gray-500 font-mono flex items-center gap-1">
                      PIN: <span className="font-bold text-gray-700 tracking-widest">{u.hasPin ? 'Đã thiết lập' : 'Chưa thiết lập'}</span>
                    </p>
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
            <div className="bg-white rounded-lg shadow-card p-12 text-center text-coffee-medium">
              <Clock size={40} className="mx-auto mb-3 text-coffee-light/40" />
              <p className="font-semibold">Chưa có lịch sử chấm công</p>
              <p className="text-xs text-gray-400 mt-0.5">Nhân viên sử dụng nút "Điểm danh nhanh" trên thanh bên để check-in / check-out</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-card border border-cream-medium/30 overflow-hidden animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-cream-light/40 text-coffee-medium text-xs uppercase tracking-wider border-b border-cream-medium/30">
                      <th className="px-6 py-4 font-bold">Nhân sự</th>
                      <th className="px-6 py-4 font-bold">Ngày</th>
                      <th className="px-6 py-4 font-bold">Giờ vào (Clock In)</th>
                      <th className="px-6 py-4 font-bold">Giờ ra (Clock Out)</th>
                      <th className="px-6 py-4 font-bold">Tổng giờ làm</th>
                      <th className="px-6 py-4 font-bold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-medium/10 text-sm text-coffee-dark">
                    {attendanceLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-cream-light/10 transition-colors">
                        <td className="px-6 py-4.5 font-semibold flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-coffee-accent/10 text-coffee-accent flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {log.user.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{log.user.name}</span>
                        </td>
                        <td className="px-6 py-4.5 font-mono text-gray-500">{formatDateOnly(log.date)}</td>
                        <td className="px-6 py-4.5 font-mono font-semibold">
                          <div className="flex items-center gap-1.5">
                            <span className="text-green-600">{new Date(log.clockIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                            {log.imageIn && (
                              <div className="relative group">
                                <Camera size={14} className="text-primary-500 cursor-pointer hover:scale-110 transition-transform" />
                                <div className="hidden group-hover:block absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-950 border border-gray-800 p-1 rounded-lg shadow-coffee-lg z-50 w-24 h-24">
                                  <img src={log.imageIn} alt="Clock In" className="w-full h-full object-cover rounded-md scale-x-[-1]" />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4.5 font-mono">
                          {log.clockOut ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-600 font-semibold">
                                {new Date(log.clockOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {log.imageOut && (
                                <div className="relative group">
                                  <Camera size={14} className="text-amber-500 cursor-pointer hover:scale-110 transition-transform" />
                                  <div className="hidden group-hover:block absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-950 border border-gray-800 p-1 rounded-lg shadow-coffee-lg z-50 w-24 h-24">
                                    <img src={log.imageOut} alt="Clock Out" className="w-full h-full object-cover rounded-md scale-x-[-1]" />
                                  </div>
                                </div>
                              )}
                            </div>
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
                        <td className="px-6 py-4.5">
                          <div className="flex gap-2">
                            <button onClick={() => openEditAttendance(log)} className="p-1 text-gray-400 hover:text-coffee-accent transition-colors">
                              <Edit2 size={15} />
                            </button>
                            <button onClick={() => handleAttendanceDelete(log.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 size={15} />
                            </button>
                          </div>
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
            <div className="bg-white rounded-lg shadow-card p-12 text-center text-coffee-medium">
              <Calendar size={40} className="mx-auto mb-3 text-coffee-light/40" />
              <p className="font-semibold">Chưa có lịch sử giao ca</p>
              <p className="text-xs text-gray-400 mt-0.5">Lịch sử mở/đóng ca két tiền mặt của thu ngân POS sẽ được hiển thị ở đây</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-card border border-cream-medium/30 overflow-hidden animate-fade-in">
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

        {/* Tab 4: Salary Calculation */}
        {activeTab === 'salary' && (
          loadingSalary ? (
            <p className="text-center py-10 text-coffee-medium">Đang tính toán bảng lương...</p>
          ) : salaryReport.length === 0 ? (
            <div className="bg-white rounded-lg shadow-card p-12 text-center text-coffee-medium">
              <Users size={40} className="mx-auto mb-3 text-coffee-light/40" />
              <p className="font-semibold">Không tìm thấy dữ liệu nhân viên</p>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              {/* Date range picker bar */}
              <div className="bg-white p-4 rounded-lg shadow-card border border-cream-medium/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Calendar size={18} className="text-coffee-light" />
                  <span className="text-sm font-bold text-coffee-dark">Kỳ tính lương:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={salaryStartDate}
                      onChange={e => setSalaryStartDate(e.target.value)}
                      className="input-field py-1 px-3 text-sm min-h-[36px] bg-white border border-gray-250 rounded-lg"
                    />
                    <span className="text-coffee-light text-xs">đến</span>
                    <input
                      type="date"
                      value={salaryEndDate}
                      onChange={e => setSalaryEndDate(e.target.value)}
                      className="input-field py-1 px-3 text-sm min-h-[36px] bg-white border border-gray-250 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const start = new Date();
                      const day = start.getDay();
                      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
                      const monday = new Date(start.setDate(diff));
                      setSalaryStartDate(monday.toISOString().split('T')[0]);
                      setSalaryEndDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="px-3 py-1.5 bg-cream-light hover:bg-cream-medium text-coffee-dark text-xs font-semibold rounded-lg border border-cream-medium/20 transition-all"
                  >
                    Tuần này
                  </button>
                  <button
                    onClick={() => {
                      const start = new Date();
                      start.setDate(1);
                      setSalaryStartDate(start.toISOString().split('T')[0]);
                      setSalaryEndDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="px-3 py-1.5 bg-cream-light hover:bg-cream-medium text-coffee-dark text-xs font-semibold rounded-lg border border-cream-medium/20 transition-all"
                  >
                    Tháng này
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-card border border-cream-medium/30 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-cream-light/40 text-coffee-medium text-xs uppercase tracking-wider border-b border-cream-medium/30">
                        <th className="px-5 py-4 font-bold">Nhân sự</th>
                        <th className="px-5 py-4 font-bold">Chức vụ</th>
                        <th className="px-5 py-4 font-bold text-right">Lương theo giờ (đ/h)</th>
                        <th className="px-5 py-4 font-bold text-right">Số ca làm</th>
                        <th className="px-5 py-4 font-bold text-right">Tổng giờ làm</th>
                        <th className="px-5 py-4 font-bold text-right text-coffee-accent">Thực nhận dự tính</th>
                        <th className="px-5 py-4 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream-medium/10 text-xs text-coffee-dark font-medium">
                      {salaryReport.map(report => (
                        <tr key={report.id} className="hover:bg-cream-light/10 transition-colors">
                          <td className="px-5 py-4 font-semibold flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-coffee-accent/10 text-coffee-accent flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {report.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="block font-bold text-coffee-dark text-xs">{report.name}</span>
                              <span className="text-[10px] text-gray-400 font-mono">{report.phone || 'Chưa có SĐT'}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              report.role === 'admin' 
                                ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}>
                              {report.role === 'admin' ? 'QUẢN LÝ' : 'NHÂN VIÊN'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-bold">
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                step="500"
                                value={report.hourlyRate}
                                onChange={e => handleUpdateHourlyRate(report.id, parseFloat(e.target.value) || 0)}
                                className="input-field py-1 px-2 text-right text-xs min-h-[30px] w-20 font-mono font-bold text-coffee-dark bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-coffee-accent"
                              />
                              <span>đ</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right font-mono">
                            {report.shiftCount} ca
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-gray-600">
                            {report.totalHours} giờ
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-extrabold text-coffee-accent text-sm">
                            {report.totalSalary.toLocaleString('vi-VN')}đ
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button
                              onClick={() => setSelectedSalaryDetail(report)}
                              className="px-2.5 py-1 bg-coffee-accent/10 hover:bg-coffee-accent/20 text-coffee-accent font-bold rounded-lg text-[10px] transition-all"
                            >
                              Chi tiết công
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-lg w-full max-w-xl shadow-coffee-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-cream-light/30 flex-shrink-0">
              <h2 className="font-display font-bold text-coffee-dark text-lg">
                {editingUser ? 'Sửa thông tin nhân sự' : 'Thêm nhân sự mới'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">Tên hiển thị</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input-field w-full min-h-[44px]" placeholder="VD: Nguyễn Văn A" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">
                    {editingUser ? 'Mã PIN mới (nếu muốn đổi)' : 'Mã PIN (4 chữ số)'}
                  </label>
                  <input required={!editingUser} type="text" pattern="\d{4}" value={formData.pin} onChange={e => setFormData({...formData, pin: e.target.value})} className="input-field w-full min-h-[44px] font-mono tracking-widest" placeholder={editingUser ? 'Để trống nếu không đổi' : 'VD: 1234'} maxLength={4} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">Số điện thoại</label>
                  <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="input-field w-full min-h-[44px] text-sm" placeholder="VD: 0987654321" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">Số CCCD / CMND</label>
                  <input type="text" value={formData.cccd} onChange={e => setFormData({...formData, cccd: e.target.value})} className="input-field w-full min-h-[44px] text-sm" placeholder="12 số hoặc 9 số" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">Ngày sinh</label>
                  <input type="date" value={formData.dateOfBirth} onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} className="input-field w-full min-h-[44px] text-sm bg-white border border-gray-250 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">Ngày vào làm</label>
                  <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="input-field w-full min-h-[44px] text-sm bg-white border border-gray-250 rounded-lg" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">Lương theo giờ (đ/h)</label>
                  <input type="number" required value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: parseFloat(e.target.value) || 0})} className="input-field w-full min-h-[44px] text-sm font-semibold" placeholder="25000" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">Địa chỉ liên hệ</label>
                  <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="input-field w-full min-h-[44px] text-sm" placeholder="VD: 123 Đường A, Quận B" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase font-sans">Phân quyền chức vụ</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setFormData({...formData, role: 'staff'})} className={`py-3 rounded-lg border-2 text-sm font-semibold flex items-center justify-center gap-2 ${formData.role === 'staff' ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent' : 'border-gray-200 text-gray-500'}`}>
                    <User size={16} /> Nhân viên
                  </button>
                  <button type="button" onClick={() => setFormData({...formData, role: 'admin'})} className={`py-3 rounded-lg border-2 text-sm font-semibold flex items-center justify-center gap-2 ${formData.role === 'admin' ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent' : 'border-gray-200 text-gray-500'}`}>
                    <Shield size={16} /> Quản lý
                  </button>
                </div>
              </div>

              {formData.role === 'staff' && (
                <div className="space-y-2.5 border-t border-gray-100 pt-3">
                  <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cấu hình quyền chi tiết</span>
                  
                  <label className="flex items-center gap-2.5 text-sm text-coffee-dark cursor-pointer font-medium font-sans">
                    <input
                      type="checkbox"
                      checked={formData.canApplyDiscount}
                      onChange={e => setFormData({...formData, canApplyDiscount: e.target.checked})}
                      className="w-4.5 h-4.5 rounded border-gray-300 text-coffee-accent focus:ring-coffee-accent"
                    />
                    <span>Cho phép áp dụng giảm giá</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-sm text-coffee-dark cursor-pointer font-medium font-sans">
                    <input
                      type="checkbox"
                      checked={formData.canRefund}
                      onChange={e => setFormData({...formData, canRefund: e.target.checked})}
                      className="w-4.5 h-4.5 rounded border-gray-300 text-coffee-accent focus:ring-coffee-accent"
                    />
                    <span>Cho phép trả hàng / hoàn tiền</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-sm text-coffee-dark cursor-pointer font-medium font-sans">
                    <input
                      type="checkbox"
                      checked={formData.canViewReports}
                      onChange={e => setFormData({...formData, canViewReports: e.target.checked})}
                      className="w-4.5 h-4.5 rounded border-gray-300 text-coffee-accent focus:ring-coffee-accent"
                    />
                    <span>Cho phép xem báo cáo doanh thu</span>
                  </label>

                  {formData.canApplyDiscount && (
                    <div className="pt-1.5">
                      <label className="block text-xs font-bold text-gray-500 mb-1 uppercase font-sans">Giảm giá tối đa cho phép (%)</label>
                      <input
                        required
                        type="number"
                        min="0"
                        max="100"
                        value={formData.maxDiscountPct}
                        onChange={e => setFormData({...formData, maxDiscountPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))})}
                        className="input-field w-full min-h-[40px] text-sm"
                        placeholder="100"
                      />
                    </div>
                  )}
                </div>
              )}
              
              <div className="pt-2 flex-shrink-0">
                <button type="submit" className="w-full btn-primary min-h-[48px]">
                  {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance Modal */}
      {isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-lg w-full max-w-md shadow-coffee-lg overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-cream-light/30">
              <h2 className="font-display font-bold text-coffee-dark text-lg">
                {editingAttendance ? 'Sửa giờ công' : 'Thêm ngày công thủ công'}
              </h2>
              <button onClick={() => setIsAttendanceModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAttendanceSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Nhân sự</label>
                <select
                  required
                  value={attendanceFormData.userId}
                  onChange={e => setAttendanceFormData({...attendanceFormData, userId: e.target.value})}
                  className="input-field w-full min-h-[44px] bg-white border border-gray-250 rounded-lg px-3 text-sm focus:border-coffee-accent focus:ring-coffee-accent/20"
                >
                  <option value="" disabled>Chọn nhân viên...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Ngày làm việc</label>
                <input
                  required
                  type="date"
                  value={attendanceFormData.date}
                  onChange={e => setAttendanceFormData({...attendanceFormData, date: e.target.value})}
                  className="input-field w-full min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Thời gian vào (Clock-in)</label>
                <input
                  required
                  type="datetime-local"
                  value={attendanceFormData.clockIn}
                  onChange={e => setAttendanceFormData({...attendanceFormData, clockIn: e.target.value})}
                  className="input-field w-full min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Thời gian ra (Clock-out) - Không bắt buộc</label>
                <input
                  type="datetime-local"
                  value={attendanceFormData.clockOut}
                  onChange={e => setAttendanceFormData({...attendanceFormData, clockOut: e.target.value})}
                  className="input-field w-full min-h-[44px]"
                />
              </div>
              
              <div className="pt-2">
                <button type="submit" className="w-full btn-primary min-h-[48px]">
                  {editingAttendance ? 'Lưu thay đổi' : 'Tạo ngày công'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Details Modal */}
      {profileUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-lg w-full max-w-md shadow-coffee-lg overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-cream-light/30">
              <h2 className="font-display font-bold text-coffee-dark text-lg">
                Hồ sơ lý lịch nhân sự
              </h2>
              <button onClick={() => setProfileUser(null)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-coffee-dark font-medium">
              <div className="flex items-center gap-3.5 pb-3 border-b border-gray-100">
                <div className="w-12 h-12 rounded-full bg-coffee-accent/10 text-coffee-accent flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {profileUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-base text-coffee-dark">{profileUser.name}</h3>
                  <span className="text-[10px] text-gray-500 uppercase font-bold">{profileUser.role === 'admin' ? 'Quản lý' : 'Nhân viên'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-3.5 gap-x-2">
                <div>
                  <span className="block font-bold text-gray-400 uppercase tracking-wider text-[9px] mb-0.5">Số điện thoại</span>
                  <span className="font-bold text-coffee-dark text-sm">{profileUser.phone || 'Chưa cập nhật'}</span>
                </div>
                <div>
                  <span className="block font-bold text-gray-400 uppercase tracking-wider text-[9px] mb-0.5">Số CCCD / CMND</span>
                  <span className="font-bold text-coffee-dark text-sm">{profileUser.cccd || 'Chưa cập nhật'}</span>
                </div>
                <div>
                  <span className="block font-bold text-gray-400 uppercase tracking-wider text-[9px] mb-0.5">Ngày sinh</span>
                  <span className="font-bold text-coffee-dark text-sm">{profileUser.dateOfBirth ? formatDateOnly(profileUser.dateOfBirth) : 'Chưa cập nhật'}</span>
                </div>
                <div>
                  <span className="block font-bold text-gray-400 uppercase tracking-wider text-[9px] mb-0.5">Ngày vào làm</span>
                  <span className="font-bold text-coffee-dark text-sm">{profileUser.startDate ? formatDateOnly(profileUser.startDate) : 'Chưa cập nhật'}</span>
                </div>
                <div className="col-span-2 border-t border-dashed border-gray-100 pt-2.5">
                  <span className="block font-bold text-gray-400 uppercase tracking-wider text-[9px] mb-0.5">Mức lương theo giờ</span>
                  <span className="font-extrabold text-coffee-accent text-base">{(profileUser.hourlyRate || 25000).toLocaleString('vi-VN')}đ/giờ</span>
                </div>
                <div className="col-span-2 border-t border-dashed border-gray-100 pt-2.5">
                  <span className="block font-bold text-gray-400 uppercase tracking-wider text-[9px] mb-0.5">Địa chỉ liên hệ</span>
                  <span className="font-bold text-coffee-dark text-sm">{profileUser.address || 'Chưa cập nhật'}</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-cream-light/20 flex justify-end">
              <button onClick={() => setProfileUser(null)} className="px-4 py-2 bg-coffee-accent text-white font-bold rounded-lg text-xs hover:bg-coffee-accent-dark transition-all">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Detail Modal for salary */}
      {selectedSalaryDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-coffee-lg overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-cream-light/30 flex-shrink-0">
              <div>
                <h2 className="font-display font-bold text-coffee-dark text-lg">
                  Chi tiết ngày công: {selectedSalaryDetail.name}
                </h2>
                <p className="text-xs text-coffee-light mt-0.5">Kỳ tính công: {formatDateOnly(salaryStartDate)} - {formatDateOnly(salaryEndDate)}</p>
              </div>
              <button onClick={() => setSelectedSalaryDetail(null)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {selectedSalaryDetail.attendances.length === 0 ? (
                <p className="text-center py-6 text-coffee-medium italic">Không có ngày công nào được ghi nhận trong kỳ này.</p>
              ) : (
                <div className="space-y-2">
                  {selectedSalaryDetail.attendances.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-cream-light/40 border border-cream-medium/20 text-xs">
                      <div>
                        <span className="font-bold text-coffee-dark block">{formatDateOnly(a.date)}</span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          Vào: {new Date(a.clockIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - Ra: {new Date(a.clockOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-coffee-medium text-sm">{a.totalHours} giờ</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-cream-light/20 flex items-center justify-between text-sm flex-shrink-0">
              <span className="font-semibold text-coffee-medium">Tổng cộng:</span>
              <span className="font-mono font-extrabold text-coffee-accent text-base">{selectedSalaryDetail.totalHours} giờ</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
