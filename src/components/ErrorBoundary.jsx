import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled application error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-5">
        <section className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-6 shadow-card text-center" role="alert">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Ứng dụng gặp sự cố</h1>
          <p className="mt-2 text-sm text-slate-600">Dữ liệu đã lưu trên máy chủ không bị ảnh hưởng. Hãy tải lại để tiếp tục làm việc.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 min-h-[44px] w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <RefreshCw size={17} />
            Tải lại ứng dụng
          </button>
        </section>
      </main>
    );
  }
}
