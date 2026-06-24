import { useState, useEffect } from 'react';
import { Users, Plus, Shield, User, Trash2, Edit2, X } from 'lucide-react';
import { api } from '../api';

export default function EmployeeManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', pin: '', role: 'staff' });

  const fetchUsers = async () => {
    try {
      const data = await api.get('/users');
      setUsers(data);
    } catch (err) {
      setError('Không thể tải danh sách nhân viên');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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

  return (
    <div className="h-full bg-cream-light overflow-y-auto p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-coffee-dark mb-1">Quản lý Nhân sự</h1>
            <p className="text-coffee-medium text-sm">Thiết lập tài khoản đăng nhập và phân quyền hệ thống</p>
          </div>
          <button onClick={openAdd} className="btn-primary min-h-[44px] px-5 flex items-center gap-2">
            <Plus size={18} />
            Thêm nhân sự mới
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        {/* User List */}
        {loading ? (
          <p className="text-center py-10">Đang tải...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(u => (
              <div key={u.id} className="bg-white p-5 rounded-2xl shadow-card border border-cream-medium/30 flex flex-col">
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
